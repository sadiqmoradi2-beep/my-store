'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, X } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import type { Locale, PendingSubscriptionDto } from '@my-store/shared';
import { api } from '@/lib/api-client';
import { formatDate } from '@/lib/format';
import { Button, Card, ErrorText, Spinner } from '@/components/ui';

export default function PlatformAdminPage() {
  const t = useTranslations('platformAdmin');
  const locale = useLocale() as Locale;
  const queryClient = useQueryClient();

  const { data: pending, isPending, error } = useQuery({
    queryKey: ['platform-admin', 'pending-subscriptions'],
    queryFn: () => api.get<PendingSubscriptionDto[]>('/subscription/pending'),
  });

  const decide = useMutation({
    mutationFn: ({ tenantId, action }: { tenantId: string; action: 'approve' | 'reject' }) =>
      api.post(`/subscription/${tenantId}/${action}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['platform-admin', 'pending-subscriptions'] });
    },
  });

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-black text-ink">{t('pendingTitle')}</h1>
        <p className="mt-1 text-sm text-ink-muted">{t('pendingHint')}</p>
      </div>

      <ErrorText error={error} />
      <ErrorText error={decide.error} />

      {isPending || !pending ? (
        <Spinner />
      ) : pending.length === 0 ? (
        <Card className="p-8 text-center text-sm text-ink-muted">{t('noPending')}</Card>
      ) : (
        <div className="space-y-3">
          {pending.map((req) => {
            const busy = decide.isPending && decide.variables?.tenantId === req.tenantId;
            return (
              <Card key={req.tenantId} className="flex flex-wrap items-center justify-between gap-4 p-4">
                <div>
                  <p className="font-bold text-ink">{req.tenantName}</p>
                  <p className="mt-1 text-sm text-ink-muted">
                    {req.currentPlan.name} ←{' '}
                    <span className="font-semibold text-primary-700 dark:text-primary-300">
                      {req.pendingPlan.name}
                    </span>
                  </p>
                  <p className="mt-1 text-xs text-ink-faint">
                    {t('requestedAt')}: {formatDate(req.pendingRequestedAt, locale)}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    className="border-red-300 text-red-700 hover:border-red-500 dark:text-red-400"
                    loading={busy && decide.variables?.action === 'reject'}
                    disabled={busy}
                    onClick={() => decide.mutate({ tenantId: req.tenantId, action: 'reject' })}
                  >
                    <X className="h-4 w-4" aria-hidden />
                    {t('reject')}
                  </Button>
                  <Button
                    loading={busy && decide.variables?.action === 'approve'}
                    disabled={busy}
                    onClick={() => decide.mutate({ tenantId: req.tenantId, action: 'approve' })}
                  >
                    <Check className="h-4 w-4" aria-hidden />
                    {t('approve')}
                  </Button>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
