import { Link } from 'react-router-dom';

export function Brand() {
  return (
    <Link to="/" className="brand">
      <img className="brand-mark" src="/favicon.svg" alt="" aria-hidden="true" draggable={false} />
      <span className="brand-name gradient-text">FileReadWrite</span>
    </Link>
  );
}
