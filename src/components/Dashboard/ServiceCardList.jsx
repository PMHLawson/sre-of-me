import ServiceCard from "./ServiceCard.jsx";

const colorRank = { red: 0, yellow: 1, green: 2 };

export default function ServiceCardList({ services = [] }) {
  const sorted = [...services].sort((a, b) => {
    const colorDiff = (colorRank[a.complianceColor] ?? 99) - (colorRank[b.complianceColor] ?? 99);
    if (colorDiff !== 0) return colorDiff;
    if (a.display_order != null && b.display_order != null) return a.display_order - b.display_order;
    return 0;
  });

  return (
    <section>
      {sorted.map((service) => (
        <ServiceCard key={service.id} {...service} />
      ))}
    </section>
  );
}
