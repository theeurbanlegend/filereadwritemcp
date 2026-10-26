import type { Request, Response } from 'express';

export const SESSION_COOKIE = 'frw_session';

export function readCookie(req: Request, name: string): string | undefined {
  const header = req.headers.cookie;
  if (!header) return undefined;
  for (const part of header.split(';')) {
    const i = part.indexOf('=');
    if (i === -1) continue;
    if (part.slice(0, i).trim() === name) {
      return decodeURIComponent(part.slice(i + 1).trim());
    }
  }
  return undefined;
}

export function setCookie(
  res: Response,
  name: string,
  value: string,
  maxAgeMs: number,
  secure: boolean,
): void {
  res.cookie(name, value, {
    httpOnly: true,
    sameSite: 'lax',
    secure,
    path: '/',
    maxAge: maxAgeMs,
  });
}

export function clearCookie(res: Response, name: string, secure: boolean) {
  res.clearCookie(name, { httpOnly: true, sameSite: 'lax', secure, path: '/' });
}

const INTERNAL_ORIGIN = 'http://internal.invalid';

export function safeNext(next: unknown): string {
  if (typeof next !== 'string' || !next.startsWith('/')) return '/';
  try {
    const url = new URL(next, INTERNAL_ORIGIN);
    if (url.origin !== INTERNAL_ORIGIN) return '/';
    return url.pathname + url.search + url.hash;
  } catch {
    return '/';
  }
}
