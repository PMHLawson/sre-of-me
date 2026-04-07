import { useEffect, useState } from "react";
import CompositeScore from "../components/Dashboard/CompositeScore.jsx";
import ServiceCardList from "../components/Dashboard/ServiceCardList.jsx";

export default function DashboardPage() {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetch("/api/compliance")
      .then((res) => res.json())
      .then(setData)
      .catch((err) => setError(String(err)));
  }, []);

  if (error) return <div>Error: {error}</div>;
  if (!data) return <div>Loading dashboard…</div>;

  return (
    <main>
      <CompositeScore compositeScore={data.compositeScore} compositeColor={data.compositeColor} />
      <ServiceCardList services={data.services || []} />
      <section>Deviation section placeholder</section>
    </main>
  );
}
