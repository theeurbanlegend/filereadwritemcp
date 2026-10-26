export const queryKeys = {
  me: ['me'] as const,
  authConfig: ['auth-config'] as const,
  agents: ['agents'] as const,
  clients: ['clients'] as const,
  verifyEmail: (token: string | null) => ['verify-email', token] as const,
  oauthClient: (clientId: string | null) => ['oauth-client', clientId] as const,
};
