import { Icon } from '../ui/Icon';

export function GithubButton({ onClick, label = 'Continue with GitHub' }: { onClick: () => void; label?: string }) {
  return (
    <button type="button" className="btn btn-secondary btn-block btn-lg" onClick={onClick}>
      <Icon name="github" />
      {label}
    </button>
  );
}
