import { useQuery } from '@tanstack/react-query';
import { api } from '../../api/client';
import { queryKeys } from './keys';

export function useOauthClient(clientId: string | null) {
  return useQuery({
    queryKey: queryKeys.oauthClient(clientId),
    queryFn: () =>
      api.get<{ clientName: string | null }>('/api/oauth/client?client_id=' + encodeURIComponent(clientId ?? '')),
    enabled: !!clientId,
    retry: false,
  });
}
