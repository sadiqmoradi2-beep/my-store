'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArchiveRestore, DatabaseBackup, HardDriveDownload, Trash2 } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useState } from 'react';
import type { BackupDto, Locale } from '@my-store/shared';
import { api } from '@/lib/api-client';
import { apiDownload } from '@/lib/download';
import { formatDate, formatNumber } from '@/lib/format';
import { Badge, Button, Card, ErrorText, Field, Input, Modal, Spinner } from '@/components/ui';

function formatSize(bytes: number, locale: Locale): string {
  if (bytes >= 1_048_576) return `${formatNumber(Math.round(bytes / 104857.6) / 10, locale)} MB`;
  return `${formatNumber(Math.max(1, Math.round(bytes / 1024)), locale)} KB`;
}

export default function BackupsPage() {
  const t = useTranslations('backups');
  const tc = useTranslations('common');
  const locale = useLocale() as Locale;
  const queryClient = useQueryClient();

  const [page, setPage] = useState(1);
  const [note, setNote] = useState('');
  const [restoreTarget, setRestoreTarget] = useState<BackupDto | null>(null);
  const [restoreWord, setRestoreWord] = useState('');
  const [restoreDone, setRestoreDone] = useState(false);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['backups'] });

  const { data, isPending, error } = useQuery({
    queryKey: ['backups', page],
    queryFn: () => api.getPaged<BackupDto[]>(`/backups?page=${page}&limit=20`),
  });
  const settings = useQuery({
    queryKey: ['backup-settings'],
    queryFn: () => api.get<{ enabled: boolean }>('/backups/settings'),
  });

  const createBackup = useMutation({
    mutationFn: () => api.post<BackupDto>('/backups', note.trim() ? { note: note.trim() } : {}),
    onSuccess: () => {
      setNote('');
      invalidate();
    },
  });
  const toggleAuto = useMutation({
    mutationFn: (enabled: boolean) => api.patch<{ enabled: boolean }>('/backups/settings', { enabled }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['backup-settings'] }),
  });
  const restoreBackup = useMutation({
    mutationFn: (id: string) => api.post(`/backups/${id}/restore`),
    onSuccess: () => {
      setRestoreTarget(null);
      setRestoreWord('');
      setRestoreDone(true);
      queryClient.invalidateQueries();
    },
  });
  const deleteBackup = useMutation({
    mutationFn: (id: string) => api.delete(`/backups/${id}`),
    onSuccess: invalidate,
  });

  const download = async (backup: BackupDto) => {
    setDownloadingId(backup.id);
    try {
      await apiDownload(`/backups/${backup.id}/download`);
    } finally {
      setDownloadingId(null);
    }
  };

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-black text-ink">{t('title')}</h1>
        <p className="mt-1 text-sm text-ink-muted">{t('hint')}</p>
      </div>

      <Card className="p-4">
        <div className="flex flex-wrap items-end gap-3">
          <div className="min-w-56 flex-1">
            <Field label={t('note')}>
              <Input value={note} onChange={(e) => setNote(e.target.value)} maxLength={200} />
            </Field>
          </div>
          <Button loading={createBackup.isPending} onClick={() => createBackup.mutate()}>
            <DatabaseBackup className="h-4 w-4" aria-hidden />
            {createBackup.isPending ? t('creating') : t('create')}
          </Button>
        </div>
        <ErrorText error={createBackup.error} />

        <label className="mt-4 flex cursor-pointer items-start gap-3 border-t border-line pt-4">
          <input
            type="checkbox"
            className="mt-1 h-4 w-4 cursor-pointer accent-primary-700"
            checked={settings.data?.enabled ?? false}
            disabled={settings.isPending || toggleAuto.isPending}
            onChange={(e) => toggleAuto.mutate(e.target.checked)}
          />
          <span>
            <span className="block text-sm font-medium text-ink">{t('autoBackup')}</span>
            <span className="block text-xs text-ink-faint">{t('autoBackupHint')}</span>
          </span>
        </label>
      </Card>

      {restoreDone && (
        <Card className="border-primary-500/50 p-4 text-sm font-medium text-primary-700 dark:text-primary-300">
          {t('restoreDone')}
        </Card>
      )}

      <ErrorText error={error} />
      {isPending ? (
        <Spinner />
      ) : (
        <Card className="overflow-x-auto">
          <table className="w-full min-w-[680px] text-sm">
            <thead>
              <tr className="border-b border-line text-xs text-ink-muted">
                <th className="p-3 text-start font-medium">{t('date')}</th>
                <th className="p-3 text-start font-medium">{t('type')}</th>
                <th className="p-3 text-start font-medium">{t('status')}</th>
                <th className="p-3 text-start font-medium">{t('size')}</th>
                <th className="p-3 text-start font-medium">{t('note')}</th>
                <th className="p-3 text-start font-medium">{tc('actions')}</th>
              </tr>
            </thead>
            <tbody>
              {data?.items.length === 0 && (
                <tr>
                  <td colSpan={6} className="p-8 text-center text-ink-faint">
                    {t('empty')}
                  </td>
                </tr>
              )}
              {data?.items.map((backup) => (
                <tr
                  key={backup.id}
                  className="border-b border-line/60 transition-colors last:border-0 hover:bg-surface-3/50"
                >
                  <td className="p-3 text-xs text-ink-muted">{formatDate(backup.createdAt, locale)}</td>
                  <td className="p-3">
                    <Badge tone={backup.type === 'AUTO' ? 'APPROVED' : 'neutral'}>
                      {t(`types.${backup.type}`)}
                    </Badge>
                  </td>
                  <td className="p-3">
                    <Badge tone={backup.status === 'COMPLETED' ? 'DELIVERED' : 'danger'}>
                      {t(`statuses.${backup.status}`)}
                    </Badge>
                  </td>
                  <td className="p-3 text-ink">{formatSize(backup.sizeBytes, locale)}</td>
                  <td className="p-3 max-w-48 truncate text-xs text-ink-faint">{backup.note ?? '—'}</td>
                  <td className="p-3">
                    {backup.status === 'COMPLETED' && (
                      <div className="flex gap-1.5">
                        <Button
                          variant="ghost"
                          className="min-h-8 px-2"
                          disabled={downloadingId !== null}
                          loading={downloadingId === backup.id}
                          onClick={() => download(backup)}
                          title={t('download')}
                        >
                          <HardDriveDownload className="h-4 w-4" aria-hidden />
                        </Button>
                        <Button
                          variant="ghost"
                          className="min-h-8 px-2"
                          onClick={() => setRestoreTarget(backup)}
                          title={t('restore')}
                        >
                          <ArchiveRestore className="h-4 w-4" aria-hidden />
                        </Button>
                        <Button
                          variant="ghost"
                          className="min-h-8 px-2 text-red-600 dark:text-red-400"
                          loading={deleteBackup.isPending && deleteBackup.variables === backup.id}
                          onClick={() => window.confirm(t('deleteConfirm')) && deleteBackup.mutate(backup.id)}
                          title={tc('delete')}
                        >
                          <Trash2 className="h-4 w-4" aria-hidden />
                        </Button>
                      </div>
                    )}
                    {backup.status !== 'COMPLETED' && (
                      <Button
                        variant="ghost"
                        className="min-h-8 px-2 text-red-600 dark:text-red-400"
                        onClick={() => window.confirm(t('deleteConfirm')) && deleteBackup.mutate(backup.id)}
                        title={tc('delete')}
                      >
                        <Trash2 className="h-4 w-4" aria-hidden />
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      {data && data.meta.totalPages > 1 && (
        <div className="flex items-center justify-between">
          <Button variant="outline" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
            {tc('prev')}
          </Button>
          <span className="text-sm text-ink-muted">
            {tc('page', {
              page: formatNumber(data.meta.page, locale),
              total: formatNumber(data.meta.totalPages, locale),
            })}
          </span>
          <Button
            variant="outline"
            disabled={page >= data.meta.totalPages}
            onClick={() => setPage((p) => p + 1)}
          >
            {tc('next')}
          </Button>
        </div>
      )}

      <Modal
        open={restoreTarget !== null}
        title={t('restoreTitle')}
        onClose={() => {
          setRestoreTarget(null);
          setRestoreWord('');
        }}
      >
        <div className="space-y-4">
          <p className="rounded-lg bg-red-500/10 p-3 text-sm font-medium text-red-700 dark:text-red-400">
            {t('restoreWarning')}
          </p>
          {restoreTarget && (
            <p className="text-sm text-ink-muted">
              {t('date')}: {formatDate(restoreTarget.createdAt, locale)} —{' '}
              {formatSize(restoreTarget.sizeBytes, locale)}
            </p>
          )}
          <Field label={t('restoreConfirmLabel')}>
            <Input value={restoreWord} onChange={(e) => setRestoreWord(e.target.value)} />
          </Field>
          <ErrorText error={restoreBackup.error} />
          <div className="flex justify-end gap-2">
            <Button
              variant="outline"
              onClick={() => {
                setRestoreTarget(null);
                setRestoreWord('');
              }}
            >
              {tc('cancel')}
            </Button>
            <Button
              variant="danger"
              disabled={restoreWord.trim() !== t('restoreWord')}
              loading={restoreBackup.isPending}
              onClick={() => restoreTarget && restoreBackup.mutate(restoreTarget.id)}
            >
              {t('restore')}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
