import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../api/client';

export function useDeleteAccount() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (email: string) => api.del('/api/account', { email }),
    onSuccess: () => {
      qc.clear();
      window.location.href = '/signup';
    },
  });
}
