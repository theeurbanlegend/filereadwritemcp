import { useAuthConfig } from '../../hooks/queries/auth';
import { githubLogin } from '../../lib/navigation';
import { Divider } from '../ui/Divider';
import { GithubButton } from './GithubButton';

export function GithubSignIn({ next, label }: { next: string | null; label?: string }) {
  const config = useAuthConfig();
  if (!config.data?.github) return null;
  return (
    <>
      <GithubButton onClick={() => githubLogin(next)} label={label} />
      <Divider />
    </>
  );
}
