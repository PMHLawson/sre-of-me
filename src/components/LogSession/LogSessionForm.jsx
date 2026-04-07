import { useEffect, useState } from "react";

export default function LogSessionForm({ onSaved = () => {} }) {
  const [services, setServices] = useState([]);
  const [serviceId, setServiceId] = useState("");
  const [duration, setDuration] = useState(10);
  const [occurredAt, setOccurredAt] = useState(new Date().toISOString().slice(0, 16));
  const [notes, setNotes] = useState("");

  useEffect(() => {
    fetch("/api/services").then((r) => r.json()).then((data) => setServices(data.services || data || []));
  }, []);

  async function handleSubmit(e) {
    e.preventDefault();
    const res = await fetch("/api/sessions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        service_id: Number(serviceId),
        duration_minutes: Number(duration),
        occurred_at: new Date(occurredAt).toISOString(),
        notes,
      }),
    });
    const payload = await res.json();
    onSaved(payload.session);
  }

  return (
    <form onSubmit={handleSubmit}>
      <select value={serviceId} onChange={(e) => setServiceId(e.target.value)}>
        <option value="">Select service</option>
        {services.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
      </select>
      <input type="number" value={duration} onChange={(e) => setDuration(e.target.value)} />
      <input type="datetime-local" value={occurredAt} onChange={(e) => setOccurredAt(e.target.value)} />
      <textarea value={notes} onChange={(e) => setNotes(e.target.value)} />
      <button type="submit">Save</button>
    </form>
  );
}
