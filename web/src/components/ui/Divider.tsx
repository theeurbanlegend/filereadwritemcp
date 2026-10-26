export function Divider({ label = 'or' }: { label?: string }) {
  return (
    <div className="divider">
      <span>{label}</span>
    </div>
  );
}
