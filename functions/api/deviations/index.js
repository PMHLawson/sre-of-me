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
  const mode = url.searchParams.get("mode") || "all";
  const today = new Date().toISOString().split("T")[0];

  let sql = `
    SELECT
      d.id,
      d.service_id,
      svc.name AS service_name,
      d.start_date,
      d.end_date,
      d.reason,
      d.created_at,
      d.deleted_at
    FROM deviations d
    JOIN services svc ON svc.id = d.service_id
    WHERE d.deleted_at IS NULL
  `;

  const binds = [];

  if (serviceId) {
    sql += ` AND d.service_id = ?`;
    binds.push(Number(serviceId));
  }

  if (mode === "active") {
    sql += ` AND d.start_date <= ? AND (d.end_date IS NULL OR d.end_date >= ?)`;
    binds.push(today, today);
  } else if (mode === "planned") {
    sql += ` AND d.start_date > ?`;
    binds.push(today);
  }

  sql += ` ORDER BY d.start_date DESC`;

  const stmt = env.DB.prepare(sql).bind(...binds);
  const result = await stmt.run();

  return json({ deviations: result.results ?? [] });
}

export async function onRequestPost(context) {
  const { request, env } = context;

  let body;
  try {
    body = await request.json();
  } catch {
    return badRequest("Invalid JSON body.");
  }

  const { service_id, start_date, end_date = null, reason } = body;

  if (!service_id || Number(service_id) <= 0) {
    return badRequest("service_id is required and must be a positive integer.");
  }

  if (!start_date) {
    return badRequest("start_date is required.");
  }

  if (!reason || !String(reason).trim()) {
    return badRequest("reason is required.");
  }

  if (end_date && end_date < start_date) {
    return badRequest("end_date must be on or after start_date.");
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
      `INSERT INTO deviations (
         service_id,
         start_date,
         end_date,
         reason,
         deleted_at
       ) VALUES (?, ?, ?, ?, NULL)`
    )
    .bind(
      Number(service_id),
      start_date,
      end_date,
      reason
    )
    .run();

  const deviationId = insertResult.meta?.last_row_id;

  const created = await env.DB
    .prepare(
      `SELECT
         d.id,
         d.service_id,
         svc.name AS service_name,
         d.start_date,
         d.end_date,
         d.reason,
         d.created_at,
         d.deleted_at
       FROM deviations d
       JOIN services svc ON svc.id = d.service_id
       WHERE d.id = ?`
    )
    .bind(deviationId)
    .first();

  return json({ deviation: created }, 201);
}
