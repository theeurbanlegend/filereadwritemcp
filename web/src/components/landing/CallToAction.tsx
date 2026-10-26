import { Link } from 'react-router-dom';
import { useSession } from '../../hooks/queries/auth';
import { GITHUB_URL } from '../../lib/site';
import { Icon } from '../ui/Icon';

export function CallToAction() {
  const signedIn = useSession().status === 'signedIn';
  return (
    <section className="card cta">
      <div className="eyebrow eyebrow-lines">Get started</div>
      <h2>Ready to connect your first machine?</h2>
      <p>Sign up with email or GitHub. It's free.</p>
      <div className="row gap wrap center-row">
        <Link to={signedIn ? '/dashboard' : '/signup'} className="btn btn-primary btn-lg">
          {signedIn ? 'Open dashboard' : 'Create your account'}
          <Icon name="arrowRight" size={16} />
        </Link>
        <a href={`${GITHUB_URL}/blob/main/router/README.md`} className="btn btn-secondary btn-lg" target="_blank" rel="noreferrer">
          Self-host it
        </a>
      </div>
    </section>
  );
}
