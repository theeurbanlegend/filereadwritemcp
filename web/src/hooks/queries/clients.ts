import { useQuery } from '@tanstack/react-query';
import { api } from '../../api/client';
import type { McpClient } from '../../api/types';
import { queryKeys } from './keys';

export function useClients() {
  return useQuery({
    queryKey: queryKeys.clients,
    queryFn: () => api.get<{ clients: McpClient[] }>('/api/clients'),
  });
}
