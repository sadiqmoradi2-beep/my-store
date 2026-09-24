'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Ban, Copy, Plus } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { FormEvent, useState } from 'react';
import type { LicenseKeyDto, Locale } from '@my-store/shared';
import { api } from '@/lib/api-client';
import { formatDate } from '@/lib/format';
import { Badge, Button, Card, ErrorText, Field, Input, Modal, Spinner } from '@/components/ui';

const STATUS_TONES: Record<LicenseKeyDto['status'], string> = {
  ACTIVE: 'APPROVED',
  USED: 'neutral',
  REVOKED: 'danger',
};

export default function LicenseKeysPage() {
  const t = useTranslations('platformAdmin');
  const tc = useTranslations('common');
  const locale = useLocale() as Locale;
  const queryClient = useQueryClient();
  const [creating, setCreating] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const { data: keys, isPending, error } = useQuery({
    queryKey: ['license-keys'],
    queryFn: () => api.get<LicenseKeyDto[]>('/license-keys'),
  });

  const revoke = useMutation({
    mutationFn: (id: string) => api.patch(`/license-keys/${id}/revoke`, {}),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['license-keys'] }),
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-black text-ink">{t('licensesTitle')}</h1>
          <p className="mt-1 text-sm text-ink-muted">{t('licensesHint')}</p>
        </div>
        <Button onClick={() => setCreating(true)}>
          <Plus className="h-4 w-4" aria-hidden />
          {t('newLicenseKey')}
        </Button>
      </div>

      <ErrorText error={error} />
      <ErrorText error={revoke.error} />

      {isPending ? (
        <Spinner />
      ) : (
        <Card className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-sm">
            <thead>
              <tr className="border-b border-line text-xs text-ink-muted">
                <th className="p-3 text-start font-medium">{t('licenseKeyCol')}</th>
                <th className="p-3 text-start font-medium">{tc('status')}</th>
                <th className="p-3 text-start font-medium">{t('licenseNote')}</th>
                <th className="p-3 text-start font-medium">{t('licenseUsedBy')}</th>
                <th className="p-3 text-start font-medium">{t('licenseCreatedBy')}</th>
                <th className="p-3 text-start font-medium">{tc('date')}</th>
                <th className="p-3 text-start font-medium" />
              </tr>
            </thead>
            <tbody>
              {keys?.length === 0 && (
                <tr>
                  <td colSpan={7} className="p-8 text-center text-ink-faint">
                    {tc('noData')}
                  </td>
                </tr>
              )}
              {keys?.map((key) => (
                <tr key={key.id} className="border-b border-line/60 last:border-0">
                  <td className="p-3">
                    <div className="flex items-center gap-1.5">
                      <code dir="ltr" className="font-bold text-ink">{key.key}</code>
                      <button
                        onClick={() => {
                          navigator.clipboard.writeText(key.key);
                          setCopiedId(key.id);
                          setTimeout(() => setCopiedId(null), 1500);
                        }}
                        className="cursor-pointer rounded p-1 text-ink-faint hover:bg-surface-3 hover:text-ink"
                        aria-label={tc('copy')}
                      >
                        <Copy className="h-3.5 w-3.5" aria-hidden />
                      </button>
                      {copiedId === key.id && <span className="text-xs text-primary-700 dark:text-primary-300">{tc('copied')}</span>}
                    </div>
                  </td>
                  <td className="p-3">
                    <Badge tone={STATUS_TONES[key.status]}>{t(`licenseStatuses.${key.status}`)}</Badge>
                  </td>
                  <td className="p-3 text-ink-muted">{key.note ?? '—'}</td>
                  <td className="p-3 text-ink-muted">{key.usedByTenantName ?? '—'}</td>
                  <td className="p-3 text-ink-muted">{key.createdByName}</td>
                  <td className="p-3 text-xs text-ink-faint">{formatDate(key.createdAt, locale)}</td>
                  <td className="p-3">
                    {key.status === 'ACTIVE' && (
                      <button
                        onClick={() => {
                          if (confirm(t('revokeConfirm'))) revoke.mutate(key.id);
                        }}
                        disabled={revoke.isPending}
                        aria-label={t('revoke')}
                        title={t('revoke')}
                        className="cursor-pointer rounded-lg p-1.5 text-ink-muted transition-colors hover:bg-red-100 hover:text-red-700 dark:hover:bg-red-900/30"
                      >
                        <Ban className="h-4 w-4" aria-hidden />
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      {creating && <NewLicenseKeyModal onClose={() => setCreating(false)} />}
    </div>
  );
}

function NewLicenseKeyModal({ onClose }: { onClose: () => void }) {
  const t = useTranslations('platformAdmin');
  const tc = useTranslations('common');
  const queryClient = useQueryClient();
  const [note, setNote] = useState('');
  const [created, setCreated] = useState<LicenseKeyDto | null>(null);
  const [copied, setCopied] = useState(false);

  const mutation = useMutation({
    mutationFn: () => api.post<LicenseKeyDto>('/license-keys', { note: note || undefined }),
    onSuccess: (data) => {
      setCreated(data);
      queryClient.invalidateQueries({ queryKey: ['license-keys'] });
    },
  });

  function submit(e: FormEvent) {
    e.preventDefault();
    mutation.mutate();
  }

  return (
    <Modal open title={t('newLicenseKey')} onClose={onClose}>
      {created ? (
        <div className="space-y-4">
          <p className="text-sm text-ink-muted">{t('licenseCreatedHint')}</p>
          <div className="flex items-center justify-between gap-3 rounded-lg border border-line bg-surface-3/50 px-3 py-2.5">
            <code dir="ltr" className="text-sm font-bold text-ink">{created.key}</code>
            <Button
              type="button"
              variant="outline"
              className="min-h-8 px-2.5 text-xs"
              onClick={() => {
                navigator.clipboard.writeText(created.key);
                setCopied(true);
                setTimeout(() => setCopied(false), 1500);
              }}
            >
              {copied ? tc('confirm') : tc('copy')}
            </Button>
          </div>
          <Button type="button" onClick={onClose}>
            {tc('close')}
          </Button>
        </div>
      ) : (
        <form onSubmit={submit} className="space-y-4">
          <Field label={t('licenseNote')} hint={t('licenseNoteHint')}>
            <Input value={note} onChange={(e) => setNote(e.target.value)} />
          </Field>
          <ErrorText error={mutation.error} />
          <div className="flex gap-2">
            <Button type="submit" loading={mutation.isPending}>
              {tc('create')}
            </Button>
            <Button type="button" variant="ghost" onClick={onClose}>
              {tc('cancel')}
            </Button>
          </div>
        </form>
      )}
    </Modal>
  );
}
