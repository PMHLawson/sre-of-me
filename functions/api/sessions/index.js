function json(data, status = 200) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function badRequest(message) {
  return json({ error: message }, 400);
}

export async function onRequestGet(context) {
  const { request, env } = context;
  const url = new URL(request.url);

  const serviceId = url.searchParams.get("service_id");
  const since = url.searchParams.get("since");
  const limit = Math.min(Number(url.searchParams.get("limit") || 50), 100);
  const offset = Math.max(Number(url.searchParams.get("offset") || 0), 0);

  let sql = `
    SELECT
      s.id,
      s.service_id,
      svc.name AS service_name,
      s.occurred_at,
      s.duration_minutes,
      s.notes,
      s.anomaly_flagged,
      s.anomaly_note,
      s.deleted_at
    FROM sessions s
    JOIN services svc ON svc.id = s.service_id
    WHERE 1=1
      AND s.deleted_at IS NULL
  `;

  const binds = [];

  if (serviceId) {
    sql += ` AND s.service_id = ?`;
    binds.push(Number(serviceId));
  }

  if (since) {
    sql += ` AND s.occurred_at >= ?`;
    binds.push(since);
  }

  sql += ` ORDER BY s.occurred_at DESC LIMIT ? OFFSET ?`;
  binds.push(limit, offset);

  const stmt = env.DB.prepare(sql).bind(...binds);
  const result = await stmt.run();

  return json({
    sessions: result.results ?? [],
    limit,
    offset,
  });
}

export async function onRequestPost(context) {
  const { request, env } = context;

  let body;
  try {
    body = await request.json();
  } catch {
    return badRequest("Invalid JSON body.");
  }

  const {
    service_id,
    duration_minutes,
    occurred_at,
    notes = null,
  } = body;

  if (!service_id || Number(service_id) <= 0) {
    return badRequest("service_id is required and must be a positive integer.");
  }

  if (!duration_minutes || Number(duration_minutes) <= 0) {
    return badRequest("duration_minutes is required and must be > 0.");
  }

  if (!occurred_at) {
    return badRequest("occurred_at is required.");
  }

  const service = await env.DB
    .prepare(
      `SELECT id, name
       FROM services
       WHERE id = ? AND active = 1`
    )
    .bind(Number(service_id))
    .first();

  if (!service) {
    return badRequest("service_id does not exist or is inactive.");
  }

  const insertResult = await env.DB
    .prepare(
      `INSERT INTO sessions (
         service_id,
         occurred_at,
         duration_minutes,
         notes,
         anomaly_flagged,
         anomaly_note,
         deleted_at
       ) VALUES (?, ?, ?, ?, 0, NULL, NULL)`
    )
    .bind(
      Number(service_id),
      occurred_at,
      Number(duration_minutes),
      notes
    )
    .run();

  const sessionId = insertResult.meta?.last_row_id;

  const created = await env.DB
    .prepare(
      `SELECT
         s.id,
         s.service_id,
         svc.name AS service_name,
         s.occurred_at,
         s.duration_minutes,
         s.notes,
         s.anomaly_flagged,
         s.anomaly_note,
         s.deleted_at
       FROM sessions s
       JOIN services svc ON svc.id = s.service_id
       WHERE s.id = ?`
    )
    .bind(sessionId)
    .first();

  return json({ session: created }, 201);
}
