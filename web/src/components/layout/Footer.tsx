import { Link } from 'react-router-dom';
import { GITHUB_URL, SITE } from '../../lib/site';

export function Footer() {
  return (
    <footer className="footer">
      <span>
        © {new Date().getFullYear()} FileReadWrite · Open source under MIT and AGPL-3.0
      </span>
      <nav aria-label="Footer">
        <Link to="/privacy">Privacy</Link>
        <Link to="/terms">Terms</Link>
        <a href={GITHUB_URL} target="_blank" rel="noreferrer">
          GitHub
        </a>
        <a href={`${GITHUB_URL}/security/policy`} target="_blank" rel="noreferrer">
          Security
        </a>
        {SITE.contactEmail.includes('@') && <a href={`mailto:${SITE.contactEmail}`}>Contact</a>}
      </nav>
    </footer>
  );
}
