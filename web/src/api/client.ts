export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public retryAfter: number | null = null,
  ) {
    super(message);
  }
}

function retryAfterSeconds(headers: Headers): number | null {
  let result: number | null = null;
  headers.forEach((value, key) => {
    const seconds = Number(value);
    if (
      key.startsWith("retry-after") &&
      Number.isFinite(seconds) &&
      seconds > 0
    )
      result = Math.max(result ?? 0, Math.ceil(seconds));
  });
  return result;
}

async function request<T>(
  method: string,
  path: string,
  body?: unknown,
): Promise<T> {
  const res = await fetch(path, {
    method,
    credentials: "same-origin",
    headers:
      body === undefined ? undefined : { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (res.status === 204) return undefined as T;
  const data: unknown = await res.json().catch(() => null);
  if (!res.ok) {
    const raw = (data as { message?: string | string[] } | null)?.message;
    const message = Array.isArray(raw)
      ? raw.join(", ")
      : raw || res.statusText || "Request failed";
    const retryAfter =
      res.status === 429 ? retryAfterSeconds(res.headers) : null;
    throw new ApiError(res.status, message, retryAfter);
  }
  return data as T;
}

export const api = {
  get: <T>(path: string) => request<T>("GET", path),
  post: <T>(path: string, body: unknown = {}) => request<T>("POST", path, body),
  patch: <T>(path: string, body: unknown) => request<T>("PATCH", path, body),
  del: <T = void>(path: string, body?: unknown) =>
    request<T>("DELETE", path, body),
};

export function isUnauthorized(e: unknown): boolean {
  return e instanceof ApiError && e.status === 401;
}

export function isRateLimited(e: unknown): e is ApiError {
  return e instanceof ApiError && e.status === 429;
}

export function retryDelaySeconds(e: unknown): number {
  return isRateLimited(e) ? (e.retryAfter ?? 30) : 30;
}

export function shouldRetry(failureCount: number, e: unknown): boolean {
  if (e instanceof ApiError && e.status < 500) return false;
  return failureCount < 2;
}

export function errorMessage(e: unknown): string {
  if (isRateLimited(e))
    return `Too many requests. Try again in ${retryDelaySeconds(e)} seconds.`;
  return e instanceof Error ? e.message : "Something went wrong";
}

export function hasStatus(
  e: unknown,
  status: number,
  message?: string,
): boolean {
  return (
    e instanceof ApiError &&
    e.status === status &&
    (message === undefined || e.message === message)
  );
}
