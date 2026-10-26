export function safeNext(next: string | null): string | null {
  if (!next || !next.startsWith('/')) return null;
  try {
    const url = new URL(next, window.location.origin);
    return url.origin === window.location.origin ? url.pathname + url.search + url.hash : null;
  } catch {
    return null;
  }
}

export function withNext(path: string, next: string | null): string {
  return next ? `${path}?next=${encodeURIComponent(next)}` : path;
}

export function githubLogin(next: string | null) {
  window.location.href = '/api/auth/github?next=' + encodeURIComponent(next ?? '/dashboard');
}

export function redirectTarget(uri: string | null): string | null {
  if (!uri) return null;
  try {
    const url = new URL(uri);
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.host : `${url.protocol}//${url.host}`;
  } catch {
    return null;
  }
}

export const routerUrl = () => window.location.origin;
export const mcpUrl = () => `${window.location.origin}/mcp`;
