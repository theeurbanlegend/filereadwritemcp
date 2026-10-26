import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../api/client';
import { queryKeys } from '../queries/keys';

export function useRevokeClient() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (clientId: string) => api.del(`/api/clients/${encodeURIComponent(clientId)}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.clients }),
  });
}
