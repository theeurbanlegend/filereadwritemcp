import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../api/client';
import type { Credentials } from '../../api/types';
import { queryKeys } from '../queries/keys';

export function useLogin() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (credentials: Credentials) => api.post('/api/auth/login', credentials),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.me }),
  });
}

export function useSignup() {
  return useMutation({
    mutationFn: (credentials: Credentials) => api.post('/api/auth/signup', credentials),
  });
}

export function useLogout() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.post('/api/auth/logout'),
    onSettled: () => {
      qc.clear();
      window.location.href = '/login';
    },
  });
}

export function useResendVerification() {
  return useMutation({
    mutationFn: (email: string) => api.post('/api/auth/resend-verification', { email }),
  });
}

export function useForgotPassword() {
  return useMutation({
    mutationFn: (email: string) => api.post('/api/auth/forgot-password', { email }),
  });
}

export function useResetPassword() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { token: string; password: string }) => api.post('/api/auth/reset-password', input),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.me }),
  });
}
