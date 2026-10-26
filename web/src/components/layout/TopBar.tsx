import { Link } from 'react-router-dom';
import { useSession } from '../../hooks/queries/auth';
import { GITHUB_URL } from '../../lib/site';
import { Brand } from './Brand';

export function TopBar() {
  const { status } = useSession();
  return (
    <header className="topbar">
      <Brand />
      <nav className="nav" aria-label="Main">
        <div className="nav-links">
          <a href="/#how">How it works</a>
          <a href="/#security">Security</a>
          <a href={GITHUB_URL} target="_blank" rel="noreferrer">
            GitHub
          </a>
        </div>
        {status === 'signedIn' && (
          <Link to="/dashboard" className="btn btn-primary btn-sm">
            Dashboard
          </Link>
        )}
        {status === 'signedOut' && (
          <>
            <Link to="/login">Sign in</Link>
            <Link to="/signup" className="btn btn-primary btn-sm">
              Get started
            </Link>
          </>
        )}
      </nav>
    </header>
  );
}
