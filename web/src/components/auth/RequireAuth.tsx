import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useSession } from '../../hooks/queries/auth';
import { withNext } from '../../lib/navigation';
import { SessionStatus } from './SessionStatus';

export function RequireAuth({ children }: { children: ReactNode }) {
  const session = useSession();
  const location = useLocation();
  if (session.status === 'signedIn') return <>{children}</>;
  if (session.status === 'signedOut')
    return <Navigate to={withNext('/login', location.pathname + location.search)} replace />;
  return <SessionStatus status={session.status} retryIn={session.retryIn} />;
}
