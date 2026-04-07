export default function FloatingActionButton({ visible = true, onClick = () => {}, label = "✓" }) {
  if (!visible) return null;
  return <button type="button" onClick={onClick}>{label}</button>;
}
