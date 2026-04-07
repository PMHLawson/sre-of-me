export default function UndoToast({ message, onUndo = () => {}, onEdit = () => {} }) {
  if (!message) return null;
  return (
    <div>
      <span>{message}</span>
      <button type="button" onClick={onUndo}>Undo</button>
      <button type="button" onClick={onEdit}>Edit</button>
    </div>
  );
}
