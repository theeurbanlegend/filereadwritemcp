import type { McpClient } from '../../api/types';
import { relativeTime, shortDate } from '../../lib/time';

export function ClientRow({ client, revoking, onRevoke }: { client: McpClient; revoking: boolean; onRevoke: () => void }) {
  const name = client.clientName || 'Unnamed client';
  return (
    <li className="list-row">
      <span className={`row-icon${client.clientName ? '' : ' dim'}`} aria-hidden="true">
        {client.clientName ? client.clientName.charAt(0).toUpperCase() : '?'}
      </span>
      <div className="grow">
        <div className="row-title">{name}</div>
        <div className="row-meta">
          Last used {relativeTime(client.lastUsedAt)} · Access expires {shortDate(client.expiresAt)}
        </div>
      </div>
      <div className="row-actions">
        <button
          className="btn btn-danger btn-sm"
          aria-label={`Revoke ${name}`}
          disabled={revoking}
          onClick={() => {
            if (confirm(`Revoke access for "${client.clientName || 'this client'}"?`)) onRevoke();
          }}
        >
          Revoke
        </button>
      </div>
    </li>
  );
}
