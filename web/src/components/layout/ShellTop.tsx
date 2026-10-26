import { useSession } from '../../hooks/queries/auth';
import { useLogout } from '../../hooks/mutations/auth';
import { Icon } from '../ui/Icon';

export function ShellTop() {
  const { me } = useSession();
  const logout = useLogout();
  const email = me?.email ?? '';
  return (
    <header className="shell-top">
      <div className="user">
        <span className="avatar" aria-hidden="true">
          {email.charAt(0)}
        </span>
        <span>{email}</span>
      </div>
      <button className="btn btn-ghost btn-sm" onClick={() => logout.mutate()}>
        <Icon name="logout" size={16} />
        Log out
      </button>
    </header>
  );
}
