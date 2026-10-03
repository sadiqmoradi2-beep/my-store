'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { PERMISSIONS } from '@my-store/shared';
import type { BillingCycle, GatewayIntentDto, Locale, PlanDto, SubscriptionDto } from '@my-store/shared';
import { api } from '@/lib/api-client';
import { formatDate, formatNumber } from '@/lib/format';
import { Badge, Button, Card, ErrorText, Modal, Spinner, cn } from '@/components/ui';
import { useAuthStore } from '@/stores/auth-store';

interface ChangePlanDto {
  planCode: PlanDto['code'];
  paymentMethod: 'ONLINE' | 'CASH';
  gatewayIntentId?: string;
  billingCycle: BillingCycle;
}

export default function SubscriptionPage() {
  const t = useTranslations('subscription');
  const tc = useTranslations('common');
  const locale = useLocale() as Locale;
  const router = useRouter();
  const queryClient = useQueryClient();
  const [changed, setChanged] = useState(false);
  const [choosing, setChoosing] = useState<PlanDto | null>(null);

  const user = useAuthStore((s) => s.user);
  const allowed = !!user?.permissions?.includes(PERMISSIONS.SUBSCRIPTION_MANAGE);

  useEffect(() => {
    if (user && !allowed) router.replace(`/${locale}/settings`);
  }, [user, allowed, locale, router]);

  const { data: sub, isPending, error } = useQuery({
    queryKey: ['subscription'],
    queryFn: () => api.get<SubscriptionDto>('/subscription'),
    enabled: allowed,
  });
  const { data: plans } = useQuery({
    queryKey: ['plans'],
    queryFn: () => api.get<PlanDto[]>('/subscription/plans'),
    enabled: allowed,
  });

  if (user && !allowed) {
    return <p className="p-8 text-center text-sm text-ink-faint">{tc('accessDenied')}</p>;
  }

  const change = useMutation({
    mutationFn: (dto: ChangePlanDto) => api.post<SubscriptionDto>('/subscription/change', dto),
    onSuccess: (data) => {
      queryClient.setQueryData(['subscription'], data);
      queryClient.invalidateQueries({ queryKey: ['modules'] });
      queryClient.invalidateQueries({ queryKey: ['enabled-modules'] });
      setChanged(true);
      setChoosing(null);
    },
  });

  const hasPending = !!sub?.pendingPlan;

  const limitLabel = (value: number) =>
    value === -1 ? t('unlimited') : formatNumber(value, locale);

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
            className={cn(
              'h-full rounded-full',
              used >= max ? 'bg-red-600' : 'bg-primary-600',
            )}
            style={{ width: `${Math.min(100, (used / max) * 100)}%` }}
          />
        </div>
      )}
    </div>
  );

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-black text-ink">{t('title')}</h1>
        <p className="mt-1 text-sm text-ink-muted">{t('hint')}</p>
      </div>

      <ErrorText error={error} />
      <ErrorText error={change.error} />
      {changed && (
        <Card className="border-primary-500/50 p-3 text-sm font-medium text-primary-700 dark:text-primary-300">
          {hasPending ? t('pendingCreated') : t('changed')}
        </Card>
      )}
      {sub?.pendingPlan && (
        <Card className="border-accent-400/60 bg-accent-100/30 p-4 text-sm dark:bg-accent-700/10">
          <p className="font-semibold text-ink">
            {t('pendingBanner', { plan: sub.pendingPlan.name })}
          </p>
          {sub.pendingRequestedAt && (
            <p className="mt-1 text-xs text-ink-faint">
              {t('pendingSince')}: {formatDate(sub.pendingRequestedAt, locale)}
            </p>
          )}
        </Card>
      )}

      {isPending || !sub ? (
        <Spinner />
      ) : (
        <>
          <div className="grid gap-3 lg:grid-cols-2">
            <Card className="p-5">
              <p className="text-sm text-ink-muted">{t('currentPlan')}</p>
              <div className="mt-1 flex items-center gap-2">
                <p className="text-2xl font-black text-ink">{sub.plan.name}</p>
                <Badge tone={sub.status === 'ACTIVE' ? 'DELIVERED' : 'PENDING'}>
                  {t(`statuses.${sub.status}`)}
                </Badge>
              </div>
              <p className="mt-2 text-xs text-ink-faint">
                {t('since')}: {formatDate(sub.startsAt, locale)}
              </p>
              {sub.billingCycle && (
                <p className="mt-1 text-xs text-ink-faint">
                  {t('billingCycle')}: {t(sub.billingCycle === 'YEARLY' ? 'yearly' : 'monthly')}
                </p>
              )}
              {sub.endsAt && (
                <p className="mt-1 text-xs text-ink-faint">
                  {t('endsAt')}: {formatDate(sub.endsAt, locale)}
                </p>
              )}
              {sub.plan.code !== 'FREE' && !hasPending && (
                <Button variant="outline" className="mt-3" onClick={() => setChoosing(sub.plan)}>
                  {t('renew')}
                </Button>
              )}
            </Card>

            <Card className="space-y-3 p-5">
              <p className="text-sm font-semibold text-ink">{t('usage')}</p>
              {usageRow(t('branches'), sub.usage.branches, sub.plan.limits.maxBranches)}
              {usageRow(t('warehouses'), sub.usage.warehouses, sub.plan.limits.maxWarehouses ?? -1)}
              {usageRow(t('users'), sub.usage.users, sub.plan.limits.maxUsers)}
              {usageRow(t('products'), sub.usage.products, sub.plan.limits.maxProducts)}
            </Card>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {plans?.map((plan) => {
              const isCurrent = plan.code === sub.plan.code;
              const isThisPending = sub.pendingPlan?.code === plan.code;
              const name = plan.name;
              return (
                <Card
                  key={plan.code}
                  className={cn('flex flex-col p-5', isCurrent && 'border-primary-500 ring-1 ring-primary-500/30')}
                >
                  <div className="flex items-center gap-2">
                    <p className="text-lg font-black text-ink">{name}</p>
                    {plan.requiresApproval && <Badge tone="PENDING">{t('needsApproval')}</Badge>}
                  </div>
                  <p className="mt-1 text-sm font-semibold text-primary-700 dark:text-primary-300" dir="ltr">
                    {Number(plan.priceMonthly) === 0
                      ? t('free')
                      : t('perMonth', { price: formatNumber(Number(plan.priceMonthly), locale) })}
                  </p>
                  {plan.priceYearly != null && (
                    <p className="text-xs text-ink-faint" dir="ltr">
                      {t('perYear', { price: formatNumber(Number(plan.priceYearly), locale) })}
                    </p>
                  )}
                  <ul className="mt-3 flex-1 space-y-1.5 text-sm text-ink-muted">
                    <li className="font-semibold text-ink">{t('allFeatures')}</li>
                    <li>
                      {t('branches')}: {limitLabel(plan.limits.maxBranches)}
                    </li>
                    <li>
                      {t('warehouses')}: {limitLabel(plan.limits.maxWarehouses ?? -1)}
                    </li>
                    <li>
                      {t('users')}: {limitLabel(plan.limits.maxUsers)}
                    </li>
                    <li>
                      {t('products')}: {limitLabel(plan.limits.maxProducts)}
                    </li>
                  </ul>
                  {isCurrent ? (
                    <p className="mt-4 inline-flex items-center gap-1.5 text-sm font-semibold text-primary-700 dark:text-primary-300">
                      <Check className="h-4 w-4" aria-hidden />
                      {t('current')}
                    </p>
                  ) : isThisPending ? (
                    <p className="mt-4 text-sm font-semibold text-accent-700 dark:text-accent-300">
                      {t('awaitingApproval')}
                    </p>
                  ) : (
                    <Button
                      variant="outline"
                      className="mt-4"
                      disabled={hasPending}
                      onClick={() => setChoosing(plan)}
                    >
                      {t('choose')}
                    </Button>
                  )}
                </Card>
              );
            })}
          </div>
        </>
      )}

      {choosing && (
        <ChoosePlanModal
          plan={choosing}
          onClose={() => setChoosing(null)}
          onConfirm={(dto) => change.mutate(dto)}
          submitting={change.isPending}
          error={change.error}
        />
      )}
    </div>
  );
}

function ChoosePlanModal({
  plan,
  onClose,
  onConfirm,
  submitting,
  error,
}: {
  plan: PlanDto;
  onClose: () => void;
  onConfirm: (dto: ChangePlanDto) => void;
  submitting: boolean;
  error: unknown;
}) {
  const t = useTranslations('subscription');
  const locale = useLocale() as Locale;
  const [cycle, setCycle] = useState<BillingCycle | null>(plan.priceYearly == null ? 'MONTHLY' : null);
  const [method, setMethod] = useState<'ONLINE' | 'CASH' | null>(null);
  const [intent, setIntent] = useState<GatewayIntentDto | null>(null);
  const name = plan.name;
  const isFree = Number(plan.priceMonthly) === 0;
  const cycleAmount = (c: BillingCycle) => (c === 'YEARLY' ? Number(plan.priceYearly) : Number(plan.priceMonthly));

  const createIntent = useMutation({
    mutationFn: () =>
      api.post<GatewayIntentDto>('/payment-gateway/intents', {
        purpose: 'SUBSCRIPTION',
        referenceId: plan.code,
        provider: 'AUTOMATIC',
        amount: cycleAmount(cycle ?? 'MONTHLY'),
        currency: 'USD',
      }),
    onSuccess: (data) => setIntent(data),
  });

  const confirmIntent = useMutation({
    mutationFn: () => api.post<GatewayIntentDto>(`/payment-gateway/intents/${intent!.id}/confirm`, {}),
    onSuccess: (data) => {
      setIntent(data);
      onConfirm({ planCode: plan.code, paymentMethod: 'ONLINE', gatewayIntentId: data.id, billingCycle: cycle! });
    },
  });

  return (
    <Modal open title={t('chooseTitle', { plan: name })} onClose={onClose}>
      <div className="space-y-4">
        {cycle === null && (
          <>
            <p className="text-sm text-ink-muted">{t('chooseBillingCycle')}</p>
            <div className="grid grid-cols-2 gap-3">
              <Button onClick={() => setCycle('MONTHLY')}>
                {t('monthly')} — {formatNumber(cycleAmount('MONTHLY'), locale)}
              </Button>
              <Button variant="outline" onClick={() => setCycle('YEARLY')}>
                {t('yearly')} — {formatNumber(cycleAmount('YEARLY'), locale)}
              </Button>
            </div>
          </>
        )}

        {cycle !== null && method === null && (
          <>
            <p className="text-sm text-ink-muted">{t('choosePaymentMethod')}</p>
            <div className="grid grid-cols-2 gap-3">
              <Button
                onClick={() => {
                  setMethod('ONLINE');
                  if (!isFree) createIntent.mutate();
                }}
              >
                {t('payOnline')}
              </Button>
              <Button variant="outline" onClick={() => setMethod('CASH')}>
                {t('payCash')}
              </Button>
            </div>
          </>
        )}

        {method === 'ONLINE' && isFree && (
          <div className="space-y-3">
            <p className="text-sm text-ink-muted">{t('freeActivateHint')}</p>
            <Button
              loading={submitting}
              onClick={() => onConfirm({ planCode: plan.code, paymentMethod: 'ONLINE', billingCycle: cycle! })}
            >
              {t('confirmActivate')}
            </Button>
          </div>
        )}

        {method === 'ONLINE' && !isFree && (
          <div className="space-y-3">
            <ErrorText error={createIntent.error} />
            {!intent || createIntent.isPending ? (
              <Spinner />
            ) : intent.status === 'PAID' ? (
              <p className="text-sm font-semibold text-primary-700 dark:text-primary-300">
                {t('paymentConfirmed')}
              </p>
            ) : (
              <>
                <p className="text-sm text-ink-muted">{t('awaitingOnlinePayment')}</p>
                <ErrorText error={confirmIntent.error} />
                <Button loading={confirmIntent.isPending} onClick={() => confirmIntent.mutate()}>
                  {t('mockConfirmPayment')}
                </Button>
              </>
            )}
          </div>
        )}

        {method === 'CASH' && (
          <div className="space-y-3">
            <p className="text-sm text-ink-muted">{t('cashRequestHint')}</p>
            <ErrorText error={error} />
            <Button
              loading={submitting}
              onClick={() => onConfirm({ planCode: plan.code, paymentMethod: 'CASH', billingCycle: cycle! })}
            >
              {t('sendCashRequest')}
            </Button>
          </div>
        )}

        <Button type="button" variant="ghost" onClick={onClose}>
          {t('cancelChoose')}
        </Button>
      </div>
    </Modal>
  );
}
