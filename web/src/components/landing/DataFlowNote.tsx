import { Link } from 'react-router-dom';
import { GITHUB_URL } from '../../lib/site';
import { Icon } from '../ui/Icon';

export function DataFlowNote() {
  return (
    <section className="card note">
      <span className="icon-tile">
        <Icon name="swap" />
      </span>
      <div>
        <h2>Where your files go</h2>
        <p>
          Tool requests and results travel between your AI client and your machine through our router, encrypted in
          transit. We forward them without storing or logging them. Your AI client's provider sees what your AI reads,
          as with any tool it uses.
        </p>
        <p>
          Want nothing to pass through us?{' '}
          <a href={`${GITHUB_URL}/blob/main/router/README.md`} target="_blank" rel="noreferrer">
            Host your own router
          </a>
          . Details are in the <Link to="/privacy">Privacy Policy</Link>.
        </p>
      </div>
    </section>
  );
}
