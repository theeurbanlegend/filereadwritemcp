import { ClientsCard } from '../components/clients/ClientsCard';
import { ConnectCard } from '../components/dashboard/ConnectCard';
import { MachinesCard } from '../components/machines/MachinesCard';
import { useTitle } from '../hooks/useTitle';

export default function Dashboard() {
  useTitle('Dashboard');
  return (
    <>
      <div className="page-head">
        <h1>Dashboard</h1>
        <p>Your machines and the AI clients that can reach them.</p>
      </div>
      <div className="stack">
        <ConnectCard />
        <MachinesCard />
        <ClientsCard />
      </div>
    </>
  );
}
