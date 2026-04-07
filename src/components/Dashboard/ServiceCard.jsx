export default function ServiceCard({
  name,
  serviceScore = 0,
  complianceColor = "green",
  qualifyingDays = 0,
  actualMinutes = 0,
  thresholdDays = 0,
  thresholdMinutes = 0,
  hasActiveDeviation = false,
}) {
  const pct = Math.round(Number(serviceScore || 0) * 100);
  const visualState = hasActiveDeviation ? "deviation" : complianceColor;

  return (
    <article data-color={visualState}>
      <h3>{name}</h3>
      <div>{pct}%</div>
      <p>{qualifyingDays}/{thresholdDays} days · {actualMinutes}/{thresholdMinutes} min</p>
    </article>
  );
}
