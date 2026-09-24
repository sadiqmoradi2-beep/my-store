'use client';

import { useAuthStore } from '@/stores/auth-store';
import { ApiError, tryRefresh } from '@/lib/api-client';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api/v1';

/** Downloads a file with the Authorization header — file name comes from Content-Disposition */
export async function apiDownload(path: string, retried = false): Promise<void> {
  const token = useAuthStore.getState().accessToken;
  const res = await fetch(`${API_URL}${path}`, {
    credentials: 'include',
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
  });

  if (res.status === 401 && !retried) {
    if (await tryRefresh()) return apiDownload(path, true);
    useAuthStore.getState().clear();
  }
  if (!res.ok) throw new ApiError(res.status, 'File download failed');

  const disposition = res.headers.get('Content-Disposition') ?? '';
  const fileName = /filename="?([^";]+)"?/.exec(disposition)?.[1] ?? 'export';
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  anchor.click();
  URL.revokeObjectURL(url);
}
