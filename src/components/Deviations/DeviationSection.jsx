import { useEffect, useState } from "react";

export default function DeviationSection() {
  const [deviations, setDeviations] = useState([]);

  useEffect(() => {
    fetch("/api/deviations?mode=all")
      .then((res) => res.json())
      .then((data) => setDeviations(data.deviations || []));
  }, []);

  const today = new Date().toISOString().slice(0, 10);
  const active = deviations.filter((d) => !d.deleted_at && d.start_date <= today && (!d.end_date || d.end_date >= today));
  const planned = deviations.filter((d) => !d.deleted_at && d.start_date > today);

  return (
    <section>
      <button type="button">Declare Deviation</button>

      <h3>Active Deviations</h3>
      <ul>
        {active.map((d) => (
          <li key={d.id}>{d.service_name || d.service_id}: {d.start_date} → {d.end_date ?? "indefinite"}</li>
        ))}
      </ul>

      <h3>Planned Deviations</h3>
      <ul>
        {planned.map((d) => (
          <li key={d.id}>{d.service_name || d.service_id}: {d.start_date} → {d.end_date ?? "indefinite"}</li>
        ))}
      </ul>
    </section>
  );
}
