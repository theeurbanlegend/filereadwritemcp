import { useState } from 'react';
import { errorMessage } from '../../api/client';
import { useCreateEnrollmentCode } from '../../hooks/mutations/agents';
import { useAgents } from '../../hooks/queries/agents';
import { Alert } from '../ui/Alert';
import { Icon } from '../ui/Icon';
import { AddMachinePanel } from './AddMachinePanel';
import { MachineRow } from './MachineRow';
import { UsageMeter } from './UsageMeter';

export function MachinesCard() {
  const [adding, setAdding] = useState(false);
  const agents = useAgents({ fastPoll: adding });
  const mint = useCreateEnrollmentCode();

  const list = agents.data?.agents ?? [];
  const limit = agents.data?.limit;
  const full = limit !== undefined && list.length >= limit;

  function openPanel() {
    setAdding(true);
    mint.mutate();
  }

  function closePanel() {
    setAdding(false);
    mint.reset();
    void agents.refetch();
  }

  return (
    <section className="card">
      <div className="card-head">
        <div>
          <h2>Machines</h2>
          {limit !== undefined && <UsageMeter used={list.length} limit={limit} />}
        </div>
        {!adding && (
          <button className="btn btn-primary" disabled={full} onClick={openPanel}>
            <Icon name="plus" size={16} />
            Add a machine
          </button>
        )}
      </div>
      {full && !adding && <p className="muted small">You've reached your machine limit. Revoke one to add another.</p>}
      {adding && <AddMachinePanel mint={mint} onClose={closePanel} />}
      {agents.error && <Alert>{errorMessage(agents.error)}</Alert>}
      {agents.isPending ? (
        <p className="muted">Loading…</p>
      ) : list.length === 0 ? (
        !adding && (
          <div className="empty">
            <span className="row-icon">
              <Icon name="monitor" size={22} />
            </span>
            <strong>No machines yet</strong>
            <span className="small">Add one to start using your files from an MCP client.</span>
          </div>
        )
      ) : (
        <ul className="list">
          {list.map((a) => (
            <MachineRow key={a.id} agent={a} />
          ))}
        </ul>
      )}
    </section>
  );
}
