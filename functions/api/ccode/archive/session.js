// functions/api/ccode/archive/session.js
// SRE-of-Me / SOMC-139 — Session archive endpoint
// Receives gzipped CCode session JSONL from the VM wrapper/shipper,
// writes to R2 and upserts ccode_session_registry in D1.

function json(data, status = 200) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export async function onRequestPost(context) {
  const { request, env } = context;

  // Auth: Bearer token
  const authHeader = request.headers.get("Authorization") || "";
  const token = authHeader.replace(/^Bearer\s+/i, "");
  if (!token || token !== env.CCODE_INGEST_TOKEN) {
    return json({ error: "Unauthorized" }, 401);
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }

  const { session_id, project_slug, execution_mode, ticket_ref,
          dispatch_id, source_host, archive_key, sha256,
          bytes, payload_base64_gzip, manifest } = body;

  if (!session_id) {
    return json({ error: "session_id is required" }, 400);
  }
  if (!payload_base64_gzip) {
    return json({ error: "payload_base64_gzip is required" }, 400);
  }

  try {
    // Decode base64 to binary
    const binaryString = atob(payload_base64_gzip);
    const payloadBytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      payloadBytes[i] = binaryString.charCodeAt(i);
    }

    // Build R2 key
    const now = new Date();
    const yyyy = now.getUTCFullYear();
    const mm = String(now.getUTCMonth() + 1).padStart(2, "0");
    const dd = String(now.getUTCDate()).padStart(2, "0");
    const slug = project_slug || "unknown";
    const sessionKey = archive_key ||
      `projects/${slug}/sessions/${yyyy}/${mm}/${dd}/${session_id}.jsonl.gz`;
    const manifestKey =
      `projects/${slug}/manifests/${yyyy}/${mm}/${dd}/${session_id}.json`;

    // Write gzipped session to R2
    await env.CCODE_AUDIT.put(sessionKey, payloadBytes, {
      customMetadata: {
        session_id,
        sha256: sha256 || "",
        source_host: source_host || "",
        uploaded_at: now.toISOString(),
      },
    });

    // Write manifest to R2
    const manifestData = manifest || {
      session_id,
      project_slug: slug,
      execution_mode: execution_mode || null,
      ticket_ref: ticket_ref || null,
      dispatch_id: dispatch_id || null,
      source_host: source_host || null,
      archive_key: sessionKey,
      sha256: sha256 || null,
      bytes: bytes || payloadBytes.length,
      uploaded_at: now.toISOString(),
    };
    await env.CCODE_AUDIT.put(manifestKey, JSON.stringify(manifestData, null, 2), {
      httpMetadata: { contentType: "application/json" },
    });

    // Upsert ccode_session_registry in D1
    await env.DB.prepare(
      `INSERT INTO ccode_session_registry
         (session_id, project_slug, execution_mode, ticket_ref,
          dispatch_id, source_host, archive_key, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(session_id) DO UPDATE SET
         archive_key = excluded.archive_key,
         updated_at = excluded.updated_at`
    ).bind(
      session_id, slug, execution_mode || null,
      ticket_ref || null, dispatch_id || null,
      source_host || null, sessionKey, now.toISOString()
    ).run();

    return json({ status: "archived", archive_key: sessionKey }, 201);
  } catch (err) {
    return json({ error: err.message }, 500);
  }
}
