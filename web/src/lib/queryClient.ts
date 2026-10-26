import { MutationCache, QueryCache, QueryClient } from '@tanstack/react-query';
import { isUnauthorized, shouldRetry } from '../api/client';
import { queryKeys } from '../hooks/queries/keys';

function onSessionLost(error: unknown, queryKey?: readonly unknown[]) {
  if (!isUnauthorized(error) || queryKey?.[0] === queryKeys.me[0]) return;
  if (!queryClient.getQueryData(queryKeys.me)) return;
  queryClient.removeQueries({ predicate: (q) => q.queryKey[0] !== queryKeys.me[0] });
  void queryClient.invalidateQueries({ queryKey: queryKeys.me });
}

export const queryClient = new QueryClient({
  queryCache: new QueryCache({ onError: (error, query) => onSessionLost(error, query.queryKey) }),
  mutationCache: new MutationCache({ onError: (error) => onSessionLost(error) }),
  defaultOptions: {
    queries: { refetchOnWindowFocus: false, retry: shouldRetry },
    mutations: { retry: false },
  },
});
