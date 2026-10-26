import { useState, type FormEvent } from 'react';
import { errorMessage } from '../../api/client';
import type { Agent } from '../../api/types';
import { useRenameAgent, useRevokeAgent } from '../../hooks/mutations/agents';
import { relativeTime, shortDate } from '../../lib/time';
import { Alert } from '../ui/Alert';
import { Icon } from '../ui/Icon';

export function MachineRow({ agent }: { agent: Agent }) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(agent.name);
  const rename = useRenameAgent();
  const revoke = useRevokeAgent();

  function submit(e: FormEvent) {
    e.preventDefault();
    const trimmed = name.trim();
    if (trimmed) rename.mutate({ id: agent.id, name: trimmed }, { onSuccess: () => setEditing(false) });
  }

  function cancel() {
    setName(agent.name);
    setEditing(false);
  }

  function confirmRevoke() {
    if (confirm(`Revoke "${agent.name}"? It will be disconnected and must be enrolled again to reconnect.`))
      revoke.mutate(agent.id);
  }

  return (
    <li className={`list-row${agent.online ? '' : ' dim'}`}>
      <span className={`row-icon${agent.online ? '' : ' dim'}`}>
        <Icon name="monitor" size={22} />
      </span>
      <div className="grow">
        {editing ? (
          <form onSubmit={submit} className="row-edit">
            <input
              autoFocus
              aria-label={`New name for ${agent.name}`}
              value={name}
              maxLength={100}
              onChange={(e) => setName(e.target.value)}
            />
            <button className="btn btn-primary btn-sm" disabled={rename.isPending}>
              Save
            </button>
            <button type="button" className="btn btn-secondary btn-sm" onClick={cancel}>
              Cancel
            </button>
          </form>
        ) : (
          <div className="row-title">
            {agent.name}
            <span className={`badge ${agent.online ? 'badge-online' : 'badge-offline'}`}>
              {agent.online ? 'Online' : 'Offline'}
            </span>
          </div>
        )}
        <div className="row-meta">
          {agent.online ? 'Connected now' : `Last seen ${relativeTime(agent.lastSeenAt)}`} · Added{' '}
          {shortDate(agent.createdAt)}
        </div>
        {(rename.error || revoke.error) && <Alert>{errorMessage(rename.error ?? revoke.error)}</Alert>}
      </div>
      {!editing && (
        <div className="row-actions">
          <button className="btn btn-secondary btn-sm" aria-label={`Rename ${agent.name}`} onClick={() => setEditing(true)}>
            Rename
          </button>
          <button
            className="btn btn-danger btn-sm"
            aria-label={`Revoke ${agent.name}`}
            disabled={revoke.isPending}
            onClick={confirmRevoke}
          >
            Revoke
          </button>
        </div>
      )}
    </li>
  );
}
