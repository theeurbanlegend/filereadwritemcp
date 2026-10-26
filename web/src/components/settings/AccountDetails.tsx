import type { Me } from '../../api/types';
import { useLogout } from '../../hooks/mutations/auth';
import { shortDate } from '../../lib/time';
import { Icon } from '../ui/Icon';
import { AccountProp } from './AccountProp';

export function AccountDetails({ me }: { me: Me }) {
  const logout = useLogout();
  return (
    <section className="card">
      <div className="card-head">
        <div className="card-title">
          <Icon name="user" size={20} />
          <h2>Account</h2>
        </div>
      </div>
      <ul className="props">
        <AccountProp icon="mail" label="Email" value={me.email} />
        <AccountProp icon="key" label="Password" value={me.hasPassword ? 'Set' : 'Not set'} />
        <AccountProp icon="github" label="GitHub" value={me.githubLinked ? 'Linked' : 'Not linked'} />
        <AccountProp icon="calendar" label="Member since" value={shortDate(me.createdAt)} />
      </ul>
      {!me.hasPassword && (
        <p className="muted small">To add a password, sign out and use "Forgot password" with this email.</p>
      )}
      <button className="btn btn-secondary" onClick={() => logout.mutate()}>
        <Icon name="logout" size={16} />
        Log out
      </button>
    </section>
  );
}
