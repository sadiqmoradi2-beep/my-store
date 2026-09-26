'use client';

import { useQuery } from '@tanstack/react-query';
import { useLocale, useTranslations } from 'next-intl';
import { useParams } from 'next/navigation';
import { SUBSCRIPTION_HISTORY_EVENT_NAMES } from '@my-store/shared';
import type { Locale, TenantDetailDto } from '@my-store/shared';
import { api } from '@/lib/api-client';
import { formatDate, formatNumber } from '@/lib/format';
import { BackLink, Badge, Card, cn, ErrorText, Spinner } from '@/components/ui';

export default function PlatformTenantDetailPage() {
  const t = useTranslations('platformAdmin');
  const tSub = useTranslations('subscription');
  const tc = useTranslations('common');
  const locale = useLocale() as Locale;
  const params = useParams<{ tenantId: string }>();

  const { data: tenant, isPending, error } = useQuery({
    queryKey: ['platform-admin', 'tenant', params.tenantId],
    queryFn: () => api.get<TenantDetailDto>(`/tenants/${params.tenantId}`),
  });

  const limitLabel = (value: number) => (value === -1 ? tSub('unlimited') : formatNumber(value, locale));

  const usageRow = (label: string, used: number, max: number) => (
    <div>
      <div className="flex justify-between text-sm">
        <span className="text-ink-muted">{label}</span>
        <span className="font-semibold text-ink">
          {formatNumber(used, locale)} / {limitLabel(max)}
        </span>
      </div>
      {max !== -1 && (
        <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-surface-3">
          <div
            className={cn('h-full rounded-full', used >= max ? 'bg-red-600' : 'bg-primary-600')}
            style={{ width: `${Math.min(100, (used / max) * 100)}%` }}
          />
        </div>
      )}
    </div>
  );

  return (
    <div className="space-y-4">
      <BackLink href={`/${locale}/platform-admin/tenants`} label={t('backToList')} />

      <ErrorText error={error} />
      {isPending || !tenant ? (
        <Spinner />
      ) : (
        <>
          <Card className="p-5">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-xl font-black text-ink">{tenant.name}</h1>
              <Badge tone={tenant.isActive ? 'DELIVERED' : 'danger'}>
                {tenant.isActive ? tc('active') : tc('inactive')}
              </Badge>
            </div>
            <p className="mt-1 text-xs text-ink-faint" dir="ltr">
              {tenant.slug}
            </p>
            <div className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
              <p>
                <span className="text-ink-muted">{t('since')}: </span>
                <span className="text-ink">{formatDate(tenant.createdAt, locale)}</span>
              </p>
              {tenant.phone && (
                <p>
                  <span className="text-ink-muted">{t('phone')}: </span>
                  <span className="text-ink" dir="ltr">
                    {tenant.phone}
                  </span>
                </p>
              )}
              {tenant.address && (
                <p className="sm:col-span-2">
                  <span className="text-ink-muted">{t('address')}: </span>
                  <span className="text-ink">{tenant.address}</span>
                </p>
              )}
            </div>
          </Card>

          <Card className="p-5">
            <p className="text-sm font-semibold text-ink">{t('subscriptionSection')}</p>
            {!tenant.subscription ? (
              <p className="mt-2 text-sm text-ink-muted">{t('noPlan')}</p>
            ) : (
              <div className="mt-2 space-y-1.5 text-sm">
                <p>
                  <span className="text-ink-muted">{tSub('currentPlan')}: </span>
                  <span className="font-semibold text-ink">
                    {tenant.subscription.plan.name}
                  </span>{' '}
                  <Badge tone={tenant.subscription.status === 'ACTIVE' ? 'DELIVERED' : 'PENDING'}>
                    {tSub(`statuses.${tenant.subscription.status}`)}
                  </Badge>
                </p>
                {tenant.subscription.billingCycle && (
                  <p>
                    <span className="text-ink-muted">{tSub('billingCycle')}: </span>
                    <span className="text-ink">
                      {tSub(tenant.subscription.billingCycle === 'YEARLY' ? 'yearly' : 'monthly')}
                    </span>
                  </p>
                )}
                {tenant.subscription.endsAt && (
                  <p>
                    <span className="text-ink-muted">{tSub('endsAt')}: </span>
                    <span className="text-ink">{formatDate(tenant.subscription.endsAt, locale)}</span>
                  </p>
                )}
                {tenant.subscription.pendingPlan && (
                  <p className="text-accent-700 dark:text-accent-300">
                    {tSub('pendingBanner', {
                      plan: tenant.subscription.pendingPlan.name,
                    })}
                  </p>
                )}
              </div>
            )}
          </Card>

          {tenant.subscription && (
            <Card className="space-y-3 p-5">
              <p className="text-sm font-semibold text-ink">{t('usageSection')}</p>
              {usageRow(tSub('branches'), tenant.usage.branches, tenant.subscription.plan.limits.maxBranches)}
              {usageRow(tSub('users'), tenant.usage.users, tenant.subscription.plan.limits.maxUsers)}
              {usageRow(tSub('products'), tenant.usage.products, tenant.subscription.plan.limits.maxProducts)}
            </Card>
          )}

          <Card className="p-5">
            <p className="text-sm font-semibold text-ink">{t('behaviorSection')}</p>
            <div className="mt-2 grid gap-2 text-sm sm:grid-cols-2">
              <p>
                <span className="text-ink-muted">{t('lastAdminLogin')}: </span>
                <span className="text-ink">
                  {tenant.behavior.lastAdminLoginAt
                    ? formatDate(tenant.behavior.lastAdminLoginAt, locale)
                    : t('neverLoggedIn')}
                </span>
              </p>
              <p>
                <span className="text-ink-muted">{t('totalSales')}: </span>
                <span className="text-ink">{formatNumber(tenant.behavior.totalSales, locale)}</span>
              </p>
            </div>
          </Card>

          <Card className="p-5">
            <p className="text-sm font-semibold text-ink">{t('historySection')}</p>
            {tenant.history.length === 0 ? (
              <p className="mt-2 text-sm text-ink-muted">{t('noHistory')}</p>
            ) : (
              <div className="mt-2 divide-y divide-line">
                {tenant.history.map((row) => (
                  <div key={row.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
                    <div>
                      <span className="font-medium text-ink">{SUBSCRIPTION_HISTORY_EVENT_NAMES[row.event]}</span>
                      <span className="text-ink-muted">
                        {' '}
                        — {row.fromPlanCode ?? '—'} → {row.toPlanCode}
                      </span>
                    </div>
                    <span className="text-xs text-ink-faint">{formatDate(row.createdAt, locale)}</span>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </>
      )}
    </div>
  );
}
