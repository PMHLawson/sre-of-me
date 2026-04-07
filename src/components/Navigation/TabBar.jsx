export default function TabBar({ activeTab = "dashboard", onTabChange = () => {} }) {
  const tabs = [
    { key: "dashboard", label: "Dashboard" },
    { key: "metrics", label: "Metrics" },
    { key: "decide", label: "Decide" },
  ];

  return (
    <nav>
      {tabs.map((tab) => (
        <button key={tab.key} type="button" data-active={activeTab === tab.key} onClick={() => onTabChange(tab.key)}>
          {tab.label}
        </button>
      ))}
    </nav>
  );
}
