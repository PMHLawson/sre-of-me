import { getLogicalDay, getInspectionWindow } from "./logicalDay.js";

export function calculateServiceCompliance(service, sessions, deviations, settings) {
  const windowDates = getInspectionWindow(settings);
  const deviationDays = new Set();

  deviations
    .filter((d) => d.service_id === service.id && !d.deleted_at)
    .forEach((d) => {
      const start = d.start_date;
      const end = d.end_date ?? windowDates[windowDates.length - 1];
      for (const day of windowDates) {
        if (day >= start && day <= end) deviationDays.add(day);
      }
    });

  const activeWindowDays = windowDates.filter((d) => !deviationDays.has(d));
  const qualifyingDays = new Set();
  let actualMinutes = 0;

  sessions
    .filter((s) => s.service_id === service.id && !s.deleted_at)
    .forEach((s) => {
      const { logicalDate } = getLogicalDay(s.occurred_at, settings.user_timezone, settings.day_start_hour);
      if (!activeWindowDays.includes(logicalDate)) return;
      actualMinutes += Number(s.duration_minutes || 0);
      if (Number(s.duration_minutes || 0) >= Number(service.session_floor_minutes || 0)) {
        qualifyingDays.add(logicalDate);
      }
    });

  const uncappedSessionScore = qualifyingDays.size / Number(service.green_threshold_session_days || 1);
  const uncappedDurationScore = actualMinutes / Number(service.green_threshold_duration_minutes || 1);
  const sessionScore = Math.min(uncappedSessionScore, 1);
  const durationScore = Math.min(uncappedDurationScore, 1);
  const serviceScore = (sessionScore + durationScore) / 2;

  let complianceColor = "red";
  if (uncappedSessionScore >= 1 && uncappedDurationScore >= 1) complianceColor = "green";
  else if (uncappedSessionScore >= 1 || uncappedDurationScore >= 1) complianceColor = "yellow";

  return {
    sessionScore,
    durationScore,
    serviceScore,
    complianceColor,
    qualifyingDays: qualifyingDays.size,
    actualMinutes,
    uncappedSessionScore,
    uncappedDurationScore,
    hasActiveDeviation: deviationDays.size > 0,
  };
}

export function calculateCompositeScore(serviceResults, services) {
  const eligible = serviceResults.filter((r) => !r.hasActiveDeviation);
  const totalThresholdDays = eligible.reduce((sum, r) => {
    const service = services.find((s) => s.id === r.id);
    return sum + Number(service?.green_threshold_session_days || 0);
  }, 0);

  const weighted = eligible.map((r) => {
    const service = services.find((s) => s.id === r.id);
    const weight = totalThresholdDays === 0 ? 0 : Number(service?.green_threshold_session_days || 0) / totalThresholdDays;
    return { ...r, weight };
  });

  const compositeScore = weighted.reduce((sum, r) => sum + r.serviceScore * r.weight, 0);
  const colorOrder = { red: 3, yellow: 2, green: 1 };
  const worst = weighted.reduce((acc, r) => (colorOrder[r.complianceColor] > colorOrder[acc] ? r.complianceColor : acc), "green");

  return { compositeScore, compositeColor: worst, weightedServices: weighted };
}
