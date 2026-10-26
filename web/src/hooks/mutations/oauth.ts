import { useMutation } from '@tanstack/react-query';
import { api } from '../../api/client';

export function useAuthorizeClient() {
  return useMutation({
    mutationFn: (body: Record<string, string | boolean>) =>
      api.post<{ redirectUrl: string }>('/api/oauth/authorize', body),
    onSuccess: ({ redirectUrl }) => {
      window.location.href = redirectUrl;
    },
  });
}
