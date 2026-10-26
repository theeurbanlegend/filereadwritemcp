import { Icon } from '../ui/Icon';

const SCOPES = [
  {
    title: 'Read, write and search files',
    body: 'Only inside the folders each machine allows.',
  },
  {
    title: 'Run allow-listed commands',
    body: 'Each one waits for your approval on that machine.',
  },
];

export function ScopeList() {
  return (
    <>
      <div className="eyebrow">It will be able to</div>
      <ul className="scope-list">
        {SCOPES.map((s) => (
          <li key={s.title}>
            <span className="check">
              <Icon name="check" size={14} />
            </span>
            <div>
              <strong>{s.title}</strong>
              {s.body}
            </div>
          </li>
        ))}
      </ul>
    </>
  );
}
