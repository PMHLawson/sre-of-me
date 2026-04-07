// functions/api/events.js
// SRE-of-Me / SOMC-34 + .940 Section 11 Step 4
// Orchestration bridge: append-only event store with SHA-256 hash chain
// Post-write Notion mirror sync (D1 authoritative, Notion is readable mirror)
// NO UPDATE. NO DELETE. These endpoints do not exist.

function json(data, status = 200) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function badRequest(message) {
  return json({ error: message }, 400);
}

async function syncEventToNotion(event, env) {
  if (!env.NOTION_API_TOKEN || !env.NOTION_EVENTS_DB_ID) {
    throw new Error("Missing NOTION_API_TOKEN or NOTION_EVENTS_DB_ID");
  }

  const res = await fetch("https://api.notion.com/v1/pages", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${env.NOTION_API_TOKEN}`,
      "Notion-Version": "2022-06-28",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      parent: { database_id: env.NOTION_EVENTS_DB_ID },
      properties: {
        "Event": {
          title: [{ text: { content: event.event_id } }]
        },
        "Seq": { number: event.seq },
        "Timestamp": {
          rich_text: [{ text: { content: event.timestamp } }]
        },
        "Actor": {
          rich_text: [{ text: { content: event.actor } }]
        },
        "Target": {
          rich_text: [{ text: { content: event.target ?? "" } }]
        },
        "Event Type": { select: { name: event.event_type } },
        "Parent Event ID": {
          rich_text: [{ text: { content: event.parent_event_id ?? "" } }]
        },
        "Content": {
          rich_text: [{ text: { content: event.content } }]
        },
        "Prev Hash": {
          rich_text: [{ text: { content: event.prev_hash } }]
        },
        "Hash": {
          rich_text: [{ text: { content: event.hash } }]
        }
      }
    })
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Notion sync failed: ${res.status} ${body}`);
  }

  return res.json();
}

// POST /api/events — Append an event
export async function onRequestPost(context) {
  const { request, env } = context;

  let body;
  try {
    body = await request.json();
  } catch {
    return badRequest("Invalid JSON body.");
  }

  const { actor, target, event_type, parent_event_id, content } = body;

  if (!actor || !event_type || !content) {
    return badRequest("actor, event_type, and content are required.");
  }

  const validTypes = [
    "instruction", "status_update", "progress",
    "query", "response", "error",
    "clarification", "supersede",
    "session_start", "session_end",
    "file_change", "external_side_effect",
    "permission_block", "execution_error",
    "workspace_change_summary"
  ];
  if (!validTypes.includes(event_type)) {
    return badRequest(
      `event_type must be one of: ${validTypes.join(", ")}`
    );
  }

  if (parent_event_id) {
    const parent = await env.DB
      .prepare("SELECT event_id FROM event_log WHERE event_id = ?")
      .bind(parent_event_id)
      .first();
    if (!parent) {
      return json({ error: "parent_event_id not found" }, 404);
    }
  }

  // Server-computed fields — caller cannot set these
  const event_id = crypto.randomUUID();
  const timestamp = new Date().toISOString();

  // Hash chain: get previous event's hash (or GENESIS for first event)
  const prevEvent = await env.DB
    .prepare("SELECT seq, hash FROM event_log ORDER BY seq DESC LIMIT 1")
    .first();
  const prev_hash = prevEvent ? prevEvent.hash : "GENESIS";

  // Compute hash WITHOUT seq (seq is AUTOINCREMENT and not yet known)
  // Hash input: event_id|timestamp|actor|target|event_type|parent_event_id|content|prev_hash
  const hashInput = [
    event_id,
    timestamp,
    actor,
    target ?? "",
    event_type,
    parent_event_id ?? "",
    content,
    prev_hash,
  ].join("|");

  const hashBuffer = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(hashInput)
  );
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hash = hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");

  // Insert with computed hash (no placeholder, no two-step)
  const insertResult = await env.DB
    .prepare(
      `INSERT INTO event_log (
         event_id, timestamp, actor, target,
         event_type, parent_event_id, content,
         prev_hash, hash
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(
      event_id,
      timestamp,
      actor,
      target || null,
      event_type,
      parent_event_id || null,
      content,
      prev_hash,
      hash
    )
    .run();

  const seq = insertResult.meta?.last_row_id;

  const created = await env.DB
    .prepare("SELECT * FROM event_log WHERE seq = ?")
    .bind(seq)
    .first();

  // Post-write Notion mirror sync
  // Rule: if Notion sync fails, D1 insert MUST still stand. D1 is authoritative.
  let notionSync = "skipped";
  let notionError = null;

  try {
    await syncEventToNotion(created, env);
    notionSync = "ok";
  } catch (err) {
    notionSync = "failed";
    notionError = String(err.message || err);
    console.error("Notion sync failed after D1 insert:", notionError);
  }

  return json({
    event: created,
    notion_sync: notionSync,
    notion_error: notionError,
  }, 201);
}

// GET /api/events — Query events
export async function onRequestGet(context) {
  const { request, env } = context;
  const url = new URL(request.url);

  const status = url.searchParams.get("status");
  const eventType = url.searchParams.get("event_type");
  const actor = url.searchParams.get("actor");
  const since = url.searchParams.get("since");
  const limit = Math.min(Number(url.searchParams.get("limit") || 50), 100);
  const offset = Math.max(Number(url.searchParams.get("offset") || 0), 0);

  // ?status=pending: instructions without a corresponding response
  // Pending means: an instruction that has not been closed by response/status_update/error
  // and has not been superseded by a newer instruction event.
  if (status === "pending") {
    const result = await env.DB
      .prepare(
        `SELECT * FROM event_log
         WHERE event_type = 'instruction'
         AND event_id NOT IN (
           SELECT parent_event_id FROM event_log
           WHERE parent_event_id IS NOT NULL
           AND event_type IN ('response', 'status_update', 'error', 'supersede')
         )
         ORDER BY seq ASC
         LIMIT ? OFFSET ?`
      )
      .bind(limit, offset)
      .run();

    return json({ events: result.results ?? [], limit, offset });
  }

  // General query
  let sql = "SELECT * FROM event_log WHERE 1=1";
  const binds = [];

  if (eventType) {
    sql += " AND event_type = ?";
    binds.push(eventType);
  }

  if (actor) {
    sql += " AND actor = ?";
    binds.push(actor);
  }

  if (since) {
    sql += " AND timestamp >= ?";
    binds.push(since);
  }

  sql += " ORDER BY seq ASC LIMIT ? OFFSET ?";
  binds.push(limit, offset);

  const result = await env.DB.prepare(sql).bind(...binds).run();

  return json({ events: result.results ?? [], limit, offset });
}

// Explicitly: no onRequestPut, no onRequestDelete.
// PUT/DELETE to /api/events returns 405 (default Pages Functions behavior).
