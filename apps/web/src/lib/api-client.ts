'use client';

import type { AuthUser, PaginationMeta } from '@my-store/shared';
import { useAuthStore } from '@/stores/auth-store';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api/v1';
/** API server root without the api/v1 prefix — used to build URLs for static files (like /uploads/...) */
export const API_ORIGIN = API_URL.replace(/\/api\/v1\/?$/, '');
export const assetUrl = (path: string) => `${API_ORIGIN}${path}`;

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

interface Envelope<T> {
  success: boolean;
  data: T;
  meta?: PaginationMeta;
  error?: { code: string; message: string };
}

let refreshPromise: Promise<boolean> | null = null;

/** Single-flight refresh: multiple concurrent 401 requests trigger only one refresh */
export function tryRefresh(): Promise<boolean> {
  refreshPromise ??= (async () => {
    try {
      const res = await fetch(`${API_URL}/auth/refresh`, {
        method: 'POST',
        credentials: 'include',
      });
      if (!res.ok) return false;
      const body: Envelope<{ accessToken: string; user: AuthUser }> = await res.json();
      useAuthStore.getState().setAuth(body.data.accessToken, body.data.user);
      return true;
    } catch {
      return false;
    }
  })().finally(() => {
    refreshPromise = null;
  });
  return refreshPromise;
}

async function request<T>(path: string, init: RequestInit = {}, retried = false): Promise<Envelope<T>> {
  const token = useAuthStore.getState().accessToken;
  const isFormData = init.body instanceof FormData;
  const res = await fetch(`${API_URL}${path}`, {
    ...init,
    credentials: 'include',
    headers: {
      ...(!isFormData && { 'Content-Type': 'application/json' }),
      ...(token && { Authorization: `Bearer ${token}` }),
      ...init.headers,
    },
  });

  if (res.status === 401 && !retried && !path.startsWith('/auth/')) {
    if (await tryRefresh()) return request<T>(path, init, true);
    useAuthStore.getState().clear();
  }

  const body = (await res.json().catch(() => null)) as Envelope<T> | { message?: string | string[] } | null;
  if (!res.ok) {
    const raw =
      (body && 'error' in body && body.error?.message) ||
      (body && 'message' in body && body.message) ||
      'Server connection error';
    throw new ApiError(res.status, Array.isArray(raw) ? raw.join(', ') : String(raw));
  }
  return body as Envelope<T>;
}

export const api = {
  get: <T>(path: string) => request<T>(path).then((r) => r.data),
  getPaged: <T>(path: string) => request<T>(path).then((r) => ({ items: r.data, meta: r.meta! })),
  post: <T>(path: string, data?: unknown) =>
    request<T>(path, { method: 'POST', body: data === undefined ? undefined : JSON.stringify(data) }).then(
      (r) => r.data,
    ),
  patch: <T>(path: string, data: unknown) =>
    request<T>(path, { method: 'PATCH', body: JSON.stringify(data) }).then((r) => r.data),
  delete: <T>(path: string) => request<T>(path, { method: 'DELETE' }).then((r) => r.data),
  upload: <T>(path: string, formData: FormData) =>
    request<T>(path, { method: 'POST', body: formData }).then((r) => r.data),
};
