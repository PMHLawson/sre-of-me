// PUT body naming convention:
// - new_reason: updated deviation reason stored on the deviation record
// - edit_reason: required audit note for why the edit is being made
// - deviation_reason is accepted as a backward-compatible alias for one checkpoint

function json(data, status = 200) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function badRequest(message) {
  return json({ error: message }, 400);
}

function notFound(message = "Deviation not found.") {
  return json({ error: message }, 404);
}

export async function onRequestPut(context) {
  const { request, env, params } = context;
  const deviationId = Number(params.id);

  if (!deviationId) {
    return badRequest("Invalid deviation id.");
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return badRequest("Invalid JSON body.");
  }

  const {
    start_date,
    end_date,
    new_reason,
    deviation_reason,
    edit_reason,
    reason,
  } = body;

  const auditReason = edit_reason ?? reason;

  if (!auditReason || !String(auditReason).trim()) {
    return badRequest("edit_reason is required for deviation edits.");
  }

  const existing = await env.DB
    .prepare(
      `SELECT *
       FROM deviations
       WHERE id = ? AND deleted_at IS NULL`
    )
    .bind(deviationId)
    .first();

  if (!existing) {
    return notFound();
  }

  const resolvedStartDate = start_date ?? existing.start_date;
  const resolvedEndDate = end_date !== undefined ? end_date : existing.end_date;
  const resolvedReason = new_reason ?? deviation_reason ?? existing.reason;

  if (resolvedEndDate && resolvedEndDate < resolvedStartDate) {
    return badRequest("end_date must be on or after start_date.");
  }

  await env.DB
    .prepare(
      `UPDATE deviations
       SET start_date = ?,
           end_date = ?,
           reason = ?
       WHERE id = ?`
    )
    .bind(
      resolvedStartDate,
      resolvedEndDate,
      resolvedReason,
      deviationId
    )
    .run();

  const changes = [
    ["start_date", existing.start_date, resolvedStartDate],
    ["end_date", existing.end_date, resolvedEndDate],
    ["reason", existing.reason, resolvedReason],
  ].filter(([_, oldValue, newValue]) => String(oldValue ?? "") !== String(newValue ?? ""));

  for (const [field, oldValue, newValue] of changes) {
    await env.DB
      .prepare(
        `INSERT INTO edit_history (
           entity_type,
           entity_id,
           field_changed,
           old_value,
           new_value,
           reason,
           timestamp
         ) VALUES (?, ?, ?, ?, ?, ?, strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))`
      )
      .bind(
        "deviation",
        deviationId,
        field,
        oldValue === null ? null : String(oldValue),
        newValue === null ? null : String(newValue),
        auditReason
      )
      .run();
  }

  const updated = await env.DB
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

  return json({
    deviation: updated,
    edit_history_entries_created: changes.length,
  });
}

export async function onRequestDelete(context) {
  const { request, env, params } = context;
  const deviationId = Number(params.id);

  if (!deviationId) {
    return badRequest("Invalid deviation id.");
  }

  let body = {};
  try {
    body = await request.json();
  } catch {
    body = {};
  }

  const { confirm } = body;

  if (confirm !== true) {
    return badRequest('DELETE requires { "confirm": true }.');
  }

  const existing = await env.DB
    .prepare(
      `SELECT id, deleted_at
       FROM deviations
       WHERE id = ?`
    )
    .bind(deviationId)
    .first();

  if (!existing) {
    return notFound();
  }

  if (existing.deleted_at) {
    return json({
      ok: true,
      message: "Deviation already soft-deleted.",
      deviation_id: deviationId,
    });
  }

  await env.DB
    .prepare(
      `UPDATE deviations
       SET deleted_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now')
       WHERE id = ?`
    )
    .bind(deviationId)
    .run();

  const deleted = await env.DB
    .prepare(
      `SELECT id, deleted_at
       FROM deviations
       WHERE id = ?`
    )
    .bind(deviationId)
    .first();

  return json({
    ok: true,
    message: "Deviation soft-deleted.",
    deviation: deleted,
  });
}
