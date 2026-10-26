import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api, isRateLimited, isUnauthorized, retryDelaySeconds } from '../../api/client';
import type { AuthConfig, Me } from '../../api/types';
import { queryKeys } from './keys';

export function useMe() {
  return useQuery({
    queryKey: queryKeys.me,
    queryFn: () => api.get<Me>('/api/me'),
    refetchInterval: (query) => (isRateLimited(query.state.error) ? retryDelaySeconds(query.state.error) * 1000 : false),
  });
}

export type SessionStatus = 'loading' | 'signedIn' | 'signedOut' | 'rateLimited' | 'unreachable';

export function useSession() {
  const me = useMe();
  let status: SessionStatus;
  if (isUnauthorized(me.error)) status = 'signedOut';
  else if (me.data) status = 'signedIn';
  else if (me.isPending) status = 'loading';
  else if (isRateLimited(me.error)) status = 'rateLimited';
  else status = 'unreachable';
  return {
    status,
    me: status === 'signedIn' ? me.data : undefined,
    retryIn: status === 'rateLimited' ? retryDelaySeconds(me.error) : 0,
  };
}

export function useAuthConfig() {
  return useQuery({
    queryKey: queryKeys.authConfig,
    queryFn: () => api.get<AuthConfig>('/api/auth/config'),
    staleTime: Infinity,
  });
}

export function useEmailVerification(token: string | null) {
  const qc = useQueryClient();
  return useQuery({
    queryKey: queryKeys.verifyEmail(token),
    queryFn: async () => {
      await api.post('/api/auth/verify-email', { token });
      await qc.invalidateQueries({ queryKey: queryKeys.me });
      return true;
    },
    enabled: !!token,
    retry: false,
    staleTime: Infinity,
    gcTime: Infinity,
  });
}
