import { Link } from 'react-router-dom';
import { Icon } from '../ui/Icon';

export function Brand() {
  return (
    <Link to="/" className="brand">
      <span className="brand-mark">
        <Icon name="code" />
      </span>
      <span className="brand-name gradient-text">FileReadWrite</span>
    </Link>
  );
}
