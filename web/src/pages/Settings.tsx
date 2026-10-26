import { AccountDetails } from '../components/settings/AccountDetails';
import { DeleteAccount } from '../components/settings/DeleteAccount';
import { useSession } from '../hooks/queries/auth';
import { useTitle } from '../hooks/useTitle';

export default function Settings() {
  useTitle('Settings');
  const me = useSession().me!;
  return (
    <>
      <div className="page-head">
        <h1>Settings</h1>
        <p>Manage your account.</p>
      </div>
      <div className="settings-grid">
        <AccountDetails me={me} />
        <DeleteAccount email={me.email} />
      </div>
    </>
  );
}
