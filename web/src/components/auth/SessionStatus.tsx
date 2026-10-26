import type { SessionStatus as Status } from '../../hooks/queries/auth';
import { Loading, RateLimited, ServerUnreachable } from '../ui/StatusMessage';

export function SessionStatus({ status, retryIn }: { status: Status; retryIn: number }) {
  if (status === 'rateLimited') return <RateLimited seconds={retryIn} />;
  if (status === 'unreachable') return <ServerUnreachable />;
  return <Loading />;
}
