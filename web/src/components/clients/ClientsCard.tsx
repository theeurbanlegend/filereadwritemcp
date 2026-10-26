import { errorMessage } from '../../api/client';
import { useRevokeClient } from '../../hooks/mutations/clients';
import { useClients } from '../../hooks/queries/clients';
import { Alert } from '../ui/Alert';
import { Icon } from '../ui/Icon';
import { ClientRow } from './ClientRow';

export function ClientsCard() {
  const clients = useClients();
  const revoke = useRevokeClient();
  const list = clients.data?.clients ?? [];

  return (
    <section className="card">
      <div className="card-title">
        <Icon name="hub" size={20} />
        <h2>Connected MCP clients</h2>
      </div>
      <p className="muted small" style={{ marginTop: '0.4rem' }}>
        Revoking stops a client from refreshing its access. A token it already holds keeps working for up to an hour.
      </p>
      {clients.error && <Alert>{errorMessage(clients.error)}</Alert>}
      {revoke.error && <Alert>{errorMessage(revoke.error)}</Alert>}
      {clients.isPending ? (
        <p className="muted">Loading…</p>
      ) : list.length === 0 ? (
        <div className="empty">
          <span className="row-icon">
            <Icon name="hub" size={22} />
          </span>
          <strong>No clients connected yet</strong>
          <span className="small">Add the MCP URL above to Claude, Cursor or another client.</span>
        </div>
      ) : (
        <ul className="list">
          {list.map((c) => (
            <ClientRow
              key={c.clientId}
              client={c}
              revoking={revoke.isPending}
              onRevoke={() => revoke.mutate(c.clientId)}
            />
          ))}
        </ul>
      )}
    </section>
  );
}
