export default function CompositeScore({ compositeScore = 0, compositeColor = "green" }) {
  const pct = Math.round(Number(compositeScore || 0) * 100);
  return (
    <section data-color={compositeColor}>
      <h2>Composite Score</h2>
      <div>{pct}%</div>
      <p>Capacity is built, not found.</p>
    </section>
  );
}
