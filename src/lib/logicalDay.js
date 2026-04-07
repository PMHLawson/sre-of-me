export function getLogicalDay(occurredAtUTC, timezone = "America/New_York", dayStartHour = 4) {
  const date = new Date(occurredAtUTC);
  if (Number.isNaN(date.getTime())) {
    throw new Error("Invalid occurredAtUTC value.");
  }

  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });

  const parts = Object.fromEntries(
    formatter.formatToParts(date).map((p) => [p.type, p.value])
  );

  let logicalDate = `${parts.year}-${parts.month}-${parts.day}`;
  const hour = Number(parts.hour);
  const crossesBoundary = hour < Number(dayStartHour);

  if (crossesBoundary) {
    const localDate = new Date(`${logicalDate}T12:00:00Z`);
    localDate.setUTCDate(localDate.getUTCDate() - 1);
    logicalDate = localDate.toISOString().slice(0, 10);
  }

  return { logicalDate, crossesBoundary };
}

export function getInspectionWindow({
  inspection_window_days = 7,
  inspection_window_includes_today = false,
  user_timezone = "America/New_York",
  day_start_hour = 4,
  now = new Date().toISOString(),
} = {}) {
  const { logicalDate: todayLogicalDate } = getLogicalDay(now, user_timezone, day_start_hour);
  const anchor = new Date(`${todayLogicalDate}T12:00:00Z`);

  const dates = [];
  const startOffset = inspection_window_includes_today ? 0 : 1;
  for (let i = startOffset; dates.length < inspection_window_days; i += 1) {
    const d = new Date(anchor);
    d.setUTCDate(anchor.getUTCDate() - i);
    dates.push(d.toISOString().slice(0, 10));
  }

  return dates;
}
