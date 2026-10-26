import { CopyButton } from './CopyButton';

export function CommandBlock({ label, command }: { label: string; command: string }) {
  return (
    <div className="cmd">
      <div className="cmd-head">
        <span>{label}</span>
        <CopyButton value={command} variant="inline" />
      </div>
      <pre>{command}</pre>
    </div>
  );
}
