import { Link } from 'react-router-dom';
import { useSession } from '../../hooks/queries/auth';
import { GITHUB_URL } from '../../lib/site';
import { Icon } from '../ui/Icon';
import { ApprovalPreview } from './ApprovalPreview';

export function Hero() {
  const { status } = useSession();
  const signedIn = status === 'signedIn';
  return (
    <section className="hero">
      <span className="hero-badge">Works with Claude, ChatGPT, Cursor and any MCP client</span>
      <h1 className="gradient-text">
        Let your AI work with files on <em>your own machines</em>
      </h1>
      <p className="lead">
        FileReadWrite connects your AI client to the folders you choose on your computers. It reads, writes and
        searches files, and runs commands only after you approve them.
      </p>
      <div className="row gap wrap center-row">
        <Link to={signedIn ? '/dashboard' : '/signup'} className="btn btn-primary btn-lg">
          {signedIn ? 'Open dashboard' : 'Get started free'}
          <Icon name="arrowRight" size={16} />
        </Link>
        <a href={GITHUB_URL} className="btn btn-secondary btn-lg" target="_blank" rel="noreferrer">
          <Icon name="github" />
          View on GitHub
        </a>
      </div>
      {status === 'signedOut' && (
        <p className="hero-sub">
          Already have an account? <Link to="/login">Sign in</Link>
        </p>
      )}
      <ApprovalPreview />
      <p className="approval-caption">Shown on your machine before any command runs.</p>
    </section>
  );
}
