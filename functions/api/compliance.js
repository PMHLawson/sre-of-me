import { calculateServiceCompliance, calculateCompositeScore } from "../../src/lib/compliance.js";

function json(data, status = 200) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export async function onRequestGet(context) {
  const { env } = context;

  const settingsRows = await env.DB.prepare(`SELECT key, value FROM settings`).all();
  const settings = Object.fromEntries((settingsRows.results || []).map((r) => [r.key, r.value]));
  settings.day_start_hour = Number(settings.day_start_hour ?? 4);
  settings.inspection_window_days = Number(settings.inspection_window_days ?? 7);
  settings.inspection_window_includes_today = String(settings.inspection_window_includes_today ?? "false") === "true";

  const servicesRes = await env.DB.prepare(`SELECT * FROM services WHERE active = 1 ORDER BY display_order ASC`).all();
  const sessionsRes = await env.DB.prepare(`SELECT * FROM sessions WHERE deleted_at IS NULL`).all();
  const deviationsRes = await env.DB.prepare(`SELECT * FROM deviations WHERE deleted_at IS NULL`).all();

  const services = servicesRes.results || [];
  const sessions = sessionsRes.results || [];
  const deviations = deviationsRes.results || [];

  const serviceResults = services.map((service) => ({
    id: service.id,
    name: service.name,
    thresholdDays: service.green_threshold_session_days,
    thresholdMinutes: service.green_threshold_duration_minutes,
    ...calculateServiceCompliance(service, sessions, deviations, settings),
  }));

  const { compositeScore, compositeColor, weightedServices } = calculateCompositeScore(serviceResults, services);

  return json({
    compositeScore,
    compositeColor,
    services: weightedServices,
    window: {
      days: settings.inspection_window_days,
      todayExcluded: !settings.inspection_window_includes_today,
    },
  });
}
