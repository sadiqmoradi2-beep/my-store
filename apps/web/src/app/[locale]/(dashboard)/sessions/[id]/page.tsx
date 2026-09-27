'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { use, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import {
  PERMISSIONS,
  type HarvestDto,
  type Locale,
  type SessionAdjustmentDto,
  type SessionAuditDto,
  type SessionTimelineItemDto,
  type WorkSessionDto,
} from '@my-store/shared';
import { api } from '@/lib/api-client';
import { formatDateTime, formatDuration, formatMoney } from '@/lib/format';
import { BackLink, Badge, Button, Card, ErrorText, Spinner } from '@/components/ui';
import { CloseSessionModal, HarvestModal, ReasonModal } from '@/components/sessions/session-modals';
import { useAuthStore } from '@/stores/auth-store';

const RESULT_TONES = { BALANCED: 'APPROVED', SHORTAGE: 'danger', SURPLUS: 'PENDING' } as const;
const HARVEST_TONES = { APPROVED: 'APPROVED', PENDING: 'PENDING', REJECTED: 'danger' } as const;

type Modal = 'harvest' | 'close' | 'adjust' | 'reopen' | 'limit' | null;

export default function SessionDetailsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const t = useTranslations('sessions');
  const locale = useLocale() as Locale;
  const queryClient = useQueryClient();
  const user = useAuthStore((s) => s.user);
  const has = (p: string) => !!user?.permissions?.includes(p);
  const [modal, setModal] = useState<Modal>(null);

  const { data: session, isPending, error } = useQuery({
    queryKey: ['work-session', id],
    queryFn: () => api.get<WorkSessionDto>(`/work-sessions/${id}`),
    refetchInterval: (q) => (q.state.data?.status === 'ACTIVE' ? 30_000 : false),
  });
  const timeline = useQuery({
    queryKey: ['work-session', id, 'timeline'],
    queryFn: () => api.get<SessionTimelineItemDto[]>(`/work-sessions/${id}/timeline`),
    refetchInterval: session?.status === 'ACTIVE' ? 30_000 : false,
  });
  const harvests = useQuery({
    queryKey: ['work-session', id, 'harvests'],
    queryFn: () => api.get<HarvestDto[]>(`/work-sessions/${id}/harvests`),
  });
  const adjustments = useQuery({
    queryKey: ['work-session', id, 'adjustments'],
    queryFn: () => api.get<SessionAdjustmentDto[]>(`/work-sessions/${id}/adjustments`),
  });
  const audit = useQuery({
    queryKey: ['work-session', id, 'audit'],
    queryFn: () => api.get<SessionAuditDto[]>(`/work-sessions/${id}/audit`),
  });

  const decide = useMutation({
    mutationFn: ({ harvestId, action }: { harvestId: string; action: 'approve' | 'reject' }) =>
      api.post(`/work-sessions/${id}/harvests/${harvestId}/${action}`, {}),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['work-session'] }),
  });

  if (isPending) return <Spinner />;
  if (error || !session) return <ErrorText error={error} />;

  const money = (v: string | number) => formatMoney(v, locale);
  const f = session.figures;
  const isActive = session.status === 'ACTIVE';
  const canCollect = has(PERMISSIONS.SESSIONS_HARVEST);
  const canManage = has(PERMISSIONS.SESSIONS_MANAGE);
  const canOverride = has(PERMISSIONS.SESSIONS_OVERRIDE);
  const cards: { label: string; value: string; accent?: boolean; hint?: string }[] = [
    { label: t('cards.openingCash'), value: money(session.openingCash) },
    { label: t('cards.income'), value: money(f.salesTotal), hint: t('cards.incomeHint', { cash: money(f.salesCash) }) },
    { label: t('cards.expenses'), value: money(f.totalExpenses) },
    { label: t('cards.otherCash'), value: money(f.otherCashReceived) },
    { label: t('cards.harvested'), value: money(f.harvestedTotal) },
    { label: t('cards.cashBox'), value: money(f.expectedCash), accent: true },
    { label: t('cards.remainingLimit'), value: money(f.remainingHarvestLimit), hint: t('cards.limitOf', { limit: money(session.harvestLimit) }) },
    { label: t('cards.duration'), value: formatDuration(session.durationMinutes) },
  ];

  return (
    <div className="space-y-6">
      <BackLink href={`/${locale}/sessions`} label={t('title')} />

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-xl font-black text-ink">{session.code}</h1>
            <Badge tone={isActive ? 'APPROVED' : 'neutral'}>{t(`statuses.${session.status}`)}</Badge>
            {session.result && <Badge tone={RESULT_TONES[session.result]}>{t(`results.${session.result}`)}</Badge>}
          </div>
          <p className="mt-1 text-sm text-ink-muted">
            {session.personName} · {t(`roles.${session.role}`)}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {isActive && (
            <Button variant="outline" onClick={() => setModal('harvest')}>
              {canCollect ? t('harvest') : t('requestHarvest')}
            </Button>
          )}
          {isActive && canManage && (
            <Button variant="outline" onClick={() => setModal('limit')}>
              {t('changeLimit')}
            </Button>
          )}
          {isActive && canOverride && (
            <Button variant="outline" onClick={() => setModal('adjust')}>
              {t('addAdjustment')}
            </Button>
          )}
          {isActive && canManage && <Button onClick={() => setModal('close')}>{t('closeSession')}</Button>}
          {!isActive && canOverride && (
            <Button variant="outline" onClick={() => setModal('reopen')}>
              {t('reopen')}
            </Button>
          )}
        </div>
      </div>

      <Card className="grid gap-x-6 gap-y-3 p-4 text-sm sm:grid-cols-2 lg:grid-cols-4">
        <Info label={t('sessionId')} value={session.code} />
        <Info label={t('startedAt')} value={formatDateTime(session.startedAt, locale)} />
        <Info label={t('endedAt')} value={session.closedAt ? formatDateTime(session.closedAt, locale) : '—'} />
        <Info label={t('createdBy')} value={session.createdByName ?? '—'} />
        <Info label={t('openingNotes')} value={session.openingNotes || '—'} />
        <Info label={t('closingNotes')} value={session.closingNotes || '—'} />
        <Info label={t('closedBy')} value={session.closedByName ?? '—'} />
        <Info label={t('status')} value={t(`statuses.${session.status}`)} />
      </Card>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {cards.map((c) => (
          <Card key={c.label} className={c.accent ? 'border-primary-400 p-4 dark:border-primary-700' : 'p-4'}>
            <p className="text-xs text-ink-muted">{c.label}</p>
            <p className="mt-1 text-xl font-black text-ink">{c.value}</p>
            {c.hint && <p className="mt-1 text-xs text-ink-faint">{c.hint}</p>}
          </Card>
        ))}
      </div>

      <Card className="p-4">
        <h2 className="mb-3 text-sm font-bold text-ink">{t('formula')}</h2>
        <dl className="grid gap-x-8 gap-y-1.5 text-sm sm:grid-cols-2">
          <Row label={t('formulaOpening')} value={`+ ${money(session.openingCash)}`} />
          <Row label={t('formulaCashSales')} value={`+ ${money(f.salesCash)}`} />
          <Row label={t('formulaOther')} value={`+ ${money(f.otherCashReceived)}`} />
          <Row label={t('formulaAdjustments')} value={money(f.adjustments)} />
          <Row label={t('formulaExpenses')} value={`− ${money(f.cashExpenses)}`} />
          <Row label={t('formulaHarvested')} value={`− ${money(f.harvestedCash)}`} />
          <div className="flex justify-between border-t border-line pt-2 font-black text-ink sm:col-span-2">
            <dt>{t('expectedCash')}</dt>
            <dd>{money(f.expectedCash)}</dd>
          </div>
          {!isActive && session.actualClosingCash && session.difference && (
            <>
              <Row label={t('actualClosingCash')} value={money(session.actualClosingCash)} />
              <Row label={t('difference')} value={money(session.difference)} />
            </>
          )}
        </dl>
        <p className="mt-2 text-xs text-ink-faint">{t('formulaNote')}</p>
      </Card>

      <section className="space-y-2">
        <h2 className="text-base font-bold text-ink">{t('harvestHistory')}</h2>
        <ErrorText error={decide.error} />
        <Card className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-sm">
            <thead>
              <tr className="border-b border-line text-xs text-ink-muted">
                <th className="p-3 text-start font-medium">{t('harvestId')}</th>
                <th className="p-3 text-start font-medium">{t('date')}</th>
                <th className="p-3 text-start font-medium">{t('amount')}</th>
                <th className="p-3 text-start font-medium">{t('method')}</th>
                <th className="p-3 text-start font-medium">{t('status')}</th>
                <th className="p-3 text-start font-medium">{t('collectedBy')}</th>
                <th className="p-3 text-start font-medium">{t('note')}</th>
                <th className="p-3 text-start font-medium" />
              </tr>
            </thead>
            <tbody>
              {harvests.data?.length === 0 && (
                <tr>
                  <td colSpan={8} className="p-6 text-center text-ink-faint">
                    {t('noHarvests')}
                  </td>
                </tr>
              )}
              {harvests.data?.map((h) => (
                <tr key={h.id} className="border-b border-line/60 last:border-0">
                  <td className="p-3 font-semibold text-ink">HRV-{String(h.number).padStart(4, '0')}</td>
                  <td className="p-3 text-xs text-ink-faint">{formatDateTime(h.harvestedAt, locale)}</td>
                  <td className="p-3 font-bold text-ink">{money(h.amount)}</td>
                  <td className="p-3 text-ink-muted">{t(`parts.${h.method}`)}</td>
                  <td className="p-3">
                    <Badge tone={HARVEST_TONES[h.status]}>{t(`harvestStatuses.${h.status}`)}</Badge>
                  </td>
                  <td className="p-3 text-ink-muted">{h.collectedByName ?? h.requestedByName ?? '—'}</td>
                  <td className="p-3 text-ink-muted">{h.note ?? '—'}</td>
                  <td className="p-3">
                    {h.status === 'PENDING' && canCollect && isActive && (
                      <div className="flex gap-1.5">
                        <Button
                          className="!px-2 !py-1 text-xs"
                          disabled={decide.isPending}
                          onClick={() => decide.mutate({ harvestId: h.id, action: 'approve' })}
                        >
                          {t('approve')}
                        </Button>
                        <Button
                          variant="outline"
                          className="!px-2 !py-1 text-xs"
                          disabled={decide.isPending}
                          onClick={() => decide.mutate({ harvestId: h.id, action: 'reject' })}
                        >
                          {t('reject')}
                        </Button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      </section>

      <section className="space-y-2">
        <h2 className="text-base font-bold text-ink">{t('timeline')}</h2>
        <Card className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr className="border-b border-line text-xs text-ink-muted">
                <th className="p-3 text-start font-medium">{t('time')}</th>
                <th className="p-3 text-start font-medium">{t('event')}</th>
                <th className="p-3 text-start font-medium">{t('amount')}</th>
                <th className="p-3 text-start font-medium">{t('cashEffect')}</th>
                <th className="p-3 text-start font-medium">{t('cardBalanceAfter')}</th>
              </tr>
            </thead>
            <tbody>
              {timeline.data?.map((e, index) => (
                <tr key={index} className="border-b border-line/60 last:border-0">
                  <td className="p-3 text-xs text-ink-faint">{formatDateTime(e.at, locale)}</td>
                  <td className="p-3">
                    <p className="text-ink">{e.label}</p>
                    {e.note && <p className="text-xs text-ink-faint">{e.note}</p>}
                  </td>
                  <td className={Number(e.amount) < 0 ? 'p-3 font-bold text-red-700 dark:text-red-400' : 'p-3 font-bold text-primary-700 dark:text-primary-300'}>
                    {Number(e.amount) > 0 ? '+' : ''}
                    {money(e.amount)}
                  </td>
                  <td className="p-3 text-ink-muted">{Number(e.cashEffect) === 0 ? '—' : money(e.cashEffect)}</td>
                  <td className="p-3 text-ink">{e.balanceAfter ? money(e.balanceAfter) : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
        <p className="text-xs text-ink-faint">{t('timelineNote')}</p>
      </section>

      {(adjustments.data?.length ?? 0) > 0 && (
        <section className="space-y-2">
          <h2 className="text-base font-bold text-ink">{t('adjustments')}</h2>
          <Card className="divide-y divide-line/60">
            {adjustments.data?.map((a) => (
              <div key={a.id} className="flex flex-wrap items-center justify-between gap-2 p-3 text-sm">
                <span className="text-ink">{a.reason}</span>
                <span className="flex items-center gap-3">
                  <span className="text-xs text-ink-faint">
                    {a.createdByName} · {formatDateTime(a.createdAt, locale)}
                  </span>
                  <span className="font-bold text-ink">{money(a.amount)}</span>
                </span>
              </div>
            ))}
          </Card>
        </section>
      )}

      <section className="space-y-2">
        <h2 className="text-base font-bold text-ink">{t('auditHistory')}</h2>
        <Card className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr className="border-b border-line text-xs text-ink-muted">
                <th className="p-3 text-start font-medium">{t('time')}</th>
                <th className="p-3 text-start font-medium">{t('action')}</th>
                <th className="p-3 text-start font-medium">{t('user')}</th>
                <th className="p-3 text-start font-medium">{t('change')}</th>
                <th className="p-3 text-start font-medium">{t('reason')}</th>
              </tr>
            </thead>
            <tbody>
              {audit.data?.map((a) => (
                <tr key={a.id} className="border-b border-line/60 align-top last:border-0">
                  <td className="p-3 text-xs text-ink-faint">{formatDateTime(a.createdAt, locale)}</td>
                  <td className="p-3 font-semibold text-ink">{t(`auditActions.${a.action.replace('.', '_')}`)}</td>
                  <td className="p-3 text-ink-muted">{a.userName}</td>
                  <td className="max-w-xs break-words p-3 font-mono text-xs text-ink-muted" dir="ltr">
                    {a.oldValue != null && <div>− {JSON.stringify(a.oldValue)}</div>}
                    {a.newValue != null && <div>+ {JSON.stringify(a.newValue)}</div>}
                  </td>
                  <td className="p-3 text-ink-muted">{a.reason ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      </section>

      {modal === 'harvest' && <HarvestModal session={session} canCollect={canCollect} onClose={() => setModal(null)} />}
      {modal === 'close' && <CloseSessionModal session={session} onClose={() => setModal(null)} />}
      {(modal === 'adjust' || modal === 'reopen' || modal === 'limit') && (
        <ReasonModal session={session} mode={modal} onClose={() => setModal(null)} />
      )}
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs text-ink-faint">{label}</p>
      <p className="mt-0.5 break-words font-medium text-ink">{value}</p>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between text-ink-muted">
      <dt>{label}</dt>
      <dd className="font-medium text-ink">{value}</dd>
    </div>
  );
}
