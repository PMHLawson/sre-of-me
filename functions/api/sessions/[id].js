function json(data, status = 200) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function badRequest(message) {
  return json({ error: message }, 400);
}

function notFound(message = "Session not found.") {
  return json({ error: message }, 404);
}

export async function onRequestPut(context) {
  const { request, env, params } = context;
  const sessionId = Number(params.id);

  if (!sessionId) {
    return badRequest("Invalid session id.");
  }

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
    notes,
    reason,
  } = body;

  if (!reason || !String(reason).trim()) {
    return badRequest("reason is required for session edits.");
  }

  if (
    duration_minutes !== undefined &&
    (typeof duration_minutes !== "number" || Number(duration_minutes) <= 0)
  ) {
    return badRequest("duration_minutes must be a positive number.");
  }

  const existing = await env.DB
    .prepare(
      `SELECT *
       FROM sessions
       WHERE id = ? AND deleted_at IS NULL`
    )
    .bind(sessionId)
    .first();

  if (!existing) {
    return notFound();
  }

  let resolvedServiceId = existing.service_id;
  if (service_id !== undefined) {
    const service = await env.DB
      .prepare(
        `SELECT id
         FROM services
         WHERE id = ? AND active = 1`
      )
      .bind(Number(service_id))
      .first();

    if (!service) {
      return badRequest("service_id does not exist or is inactive.");
    }

    resolvedServiceId = Number(service_id);
  }

  const resolvedOccurredAt = occurred_at ?? existing.occurred_at;
  const resolvedDuration = duration_minutes ?? existing.duration_minutes;
  const resolvedNotes = notes ?? existing.notes;

  await env.DB
    .prepare(
      `UPDATE sessions
       SET service_id = ?,
           occurred_at = ?,
           duration_minutes = ?,
           notes = ?
       WHERE id = ?`
    )
    .bind(
      resolvedServiceId,
      resolvedOccurredAt,
      Number(resolvedDuration),
      resolvedNotes,
      sessionId
    )
    .run();

  const changes = [
    ["service_id", existing.service_id, resolvedServiceId],
    ["occurred_at", existing.occurred_at, resolvedOccurredAt],
    ["duration_minutes", existing.duration_minutes, Number(resolvedDuration)],
    ["notes", existing.notes, resolvedNotes],
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
        "session",
        sessionId,
        field,
        oldValue === null ? null : String(oldValue),
        newValue === null ? null : String(newValue),
        reason
      )
      .run();
  }

  const updated = await env.DB
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

  return json({
    session: updated,
    edit_history_entries_created: changes.length,
  });
}

export async function onRequestDelete(context) {
  const { request, env, params } = context;
  const sessionId = Number(params.id);

  if (!sessionId) {
    return badRequest("Invalid session id.");
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
       FROM sessions
       WHERE id = ?`
    )
    .bind(sessionId)
    .first();

  if (!existing) {
    return notFound();
  }

  if (existing.deleted_at) {
    return json({
      ok: true,
      message: "Session already soft-deleted.",
      session_id: sessionId,
    });
  }

  await env.DB
    .prepare(
      `UPDATE sessions
       SET deleted_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now')
       WHERE id = ?`
    )
    .bind(sessionId)
    .run();

  const deleted = await env.DB
    .prepare(
      `SELECT id, deleted_at
       FROM sessions
       WHERE id = ?`
    )
    .bind(sessionId)
    .first();

  return json({
    ok: true,
    message: "Session soft-deleted.",
    session: deleted,
  });
}
