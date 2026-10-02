'use client';

import { useQuery } from '@tanstack/react-query';
import { HandCoins, Plus } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import {
  PERMISSIONS,
  SESSION_ROLES,
  SESSION_STATUSES,
  type Locale,
  type SessionRole,
  type SessionStatus,
  type WorkSessionDto,
} from '@my-store/shared';
import { api } from '@/lib/api-client';
import { formatDateTime, formatMoney } from '@/lib/format';
import { Badge, Button, Card, ErrorText, Input, Select, Spinner } from '@/components/ui';
import { HarvestModal } from '@/components/sessions/session-modals';
import { StartSessionModal, type SessionPerson } from '@/components/sessions/start-session-modal';
import { useAuthStore } from '@/stores/auth-store';

const RESULT_TONES = { BALANCED: 'APPROVED', SHORTAGE: 'danger', SURPLUS: 'PENDING' } as const;

export default function SessionsPage() {
  const t = useTranslations('sessions');
  const tc = useTranslations('common');
  const locale = useLocale() as Locale;
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const canManage = !!user?.permissions?.includes(PERMISSIONS.SESSIONS_MANAGE);
  const canCollect = !!user?.permissions?.includes(PERMISSIONS.SESSIONS_HARVEST);
  const sessionsPermissions: string[] = [
    PERMISSIONS.SESSIONS_READ,
    PERMISSIONS.SESSIONS_READ_OWN,
    PERMISSIONS.SESSIONS_MANAGE,
  ];
  const allowed = !!user?.permissions?.some((p) => sessionsPermissions.includes(p));

  useEffect(() => {
    if (user && !allowed) router.replace(`/${locale}/dashboard`);
  }, [user, allowed, locale, router]);

  const [starting, setStarting] = useState(false);
  const [harvesting, setHarvesting] = useState<WorkSessionDto | null>(null);
  const [filters, setFilters] = useState({
    q: '',
    role: '' as SessionRole | '',
    personId: '',
    status: 'CLOSED' as SessionStatus | '',
    from: '',
    to: '',
  });
  const [page, setPage] = useState(1);
  const setFilter = (patch: Partial<typeof filters>) => {
    setFilters((f) => ({ ...f, ...patch }));
    setPage(1);
  };

  const active = useQuery({
    queryKey: ['work-sessions', 'active'],
    queryFn: () => api.getPaged<WorkSessionDto[]>('/work-sessions?status=ACTIVE&limit=100'),
    refetchInterval: 30_000,
    enabled: allowed,
  });
  const { data: people } = useQuery({
    queryKey: ['session-people'],
    queryFn: () => api.get<SessionPerson[]>('/work-sessions/people'),
    enabled: canManage,
  });
  const history = useQuery({
    queryKey: ['work-sessions', 'history', filters, page],
    queryFn: () => {
      const qs = new URLSearchParams({ page: String(page), limit: '15' });
      if (filters.q) qs.set('q', filters.q);
      if (filters.role) qs.set('role', filters.role);
      if (filters.role && filters.personId) qs.set('personId', filters.personId);
      if (filters.status) qs.set('status', filters.status);
      if (filters.from) qs.set('from', filters.from);
      if (filters.to) qs.set('to', filters.to);
      return api.getPaged<WorkSessionDto[]>(`/work-sessions?${qs.toString()}`);
    },
    enabled: allowed,
  });

  if (!allowed) {
    return <p className="p-8 text-center text-sm text-ink-faint">{tc('accessDenied')}</p>;
  }

  const money = (value: string | number) => formatMoney(value, locale);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-black text-ink">{t('title')}</h1>
          <p className="mt-1 text-sm text-ink-muted">{t('subtitle')}</p>
        </div>
        {canManage && (
          <Button onClick={() => setStarting(true)} className="!px-5">
            <Plus className="h-4 w-4" aria-hidden />
            {t('startNew')}
          </Button>
        )}
      </div>

      <section className="space-y-3">
        <h2 className="text-base font-bold text-ink">{t('activeSessions')}</h2>
        <ErrorText error={active.error} />
        {active.isPending ? (
          <Spinner />
        ) : (
          <Card className="overflow-x-auto">
            <table className="w-full min-w-[900px] text-sm">
              <thead>
                <tr className="border-b border-line text-xs text-ink-muted">
                  <th className="p-3 text-start font-medium">{t('person')}</th>
                  <th className="p-3 text-start font-medium">{t('role')}</th>
                  <th className="p-3 text-start font-medium">{t('started')}</th>
                  <th className="p-3 text-start font-medium">{t('cards.openingCash')}</th>
                  <th className="p-3 text-start font-medium">{t('cards.income')}</th>
                  <th className="p-3 text-start font-medium">{t('cards.harvested')}</th>
                  <th className="p-3 text-start font-medium">{t('cards.cashBox')}</th>
                  <th className="p-3 text-start font-medium">{t('status')}</th>
                  <th className="p-3 text-start font-medium">{tc('actions')}</th>
                </tr>
              </thead>
              <tbody>
                {active.data?.items.length === 0 && (
                  <tr>
                    <td colSpan={9} className="p-8 text-center text-ink-faint">
                      {t('noActive')}
                    </td>
                  </tr>
                )}
                {active.data?.items.map((s) => (
                  <tr
                    key={s.id}
                    onClick={() => router.push(`/${locale}/sessions/${s.id}`)}
                    className="cursor-pointer border-b border-line/60 transition-colors last:border-0 hover:bg-surface-3/50"
                  >
                    <td className="p-3">
                      <p className="font-bold text-ink">{s.personName}</p>
                      <p className="text-xs text-ink-faint">{s.code}</p>
                    </td>
                    <td className="p-3 text-ink-muted">{t(`roles.${s.role}`)}</td>
                    <td className="p-3 text-xs text-ink-faint">{formatDateTime(s.startedAt, locale)}</td>
                    <td className="p-3 text-ink-muted">{money(s.openingCash)}</td>
                    <td className="p-3 text-ink">{money(s.figures.salesTotal)}</td>
                    <td className="p-3 text-ink">
                      {money(s.figures.harvestedTotal)}
                      {s.figures.pendingHarvests > 0 && (
                        <span className="ms-1.5">
                          <Badge tone="PENDING">{t('pendingCount', { count: s.figures.pendingHarvests })}</Badge>
                        </span>
                      )}
                    </td>
                    <td className="p-3 font-bold text-ink">{money(s.figures.expectedCash)}</td>
                    <td className="p-3">
                      <Badge tone="APPROVED">{t('statuses.ACTIVE')}</Badge>
                    </td>
                    <td className="p-3" onClick={(e) => e.stopPropagation()}>
                      <div className="flex gap-1.5">
                        <Link
                          href={`/${locale}/sessions/${s.id}`}
                          className="rounded-lg border border-line px-2.5 py-1 text-xs font-semibold text-ink-muted transition-colors hover:text-ink"
                        >
                          {t('view')}
                        </Link>
                        <button
                          type="button"
                          onClick={() => setHarvesting(s)}
                          title={canCollect ? t('harvest') : t('requestHarvest')}
                          className="flex cursor-pointer items-center gap-1 rounded-lg border border-line px-2.5 py-1 text-xs font-semibold text-primary-700 transition-colors hover:bg-primary-50 dark:text-primary-300 dark:hover:bg-primary-900/20"
                        >
                          <HandCoins className="h-3.5 w-3.5" aria-hidden />
                          {canCollect ? t('harvest') : t('requestHarvest')}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="text-base font-bold text-ink">{t('history')}</h2>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-6">
          <Input
            placeholder={t('searchPlaceholder')}
            value={filters.q}
            onChange={(e) => setFilter({ q: e.target.value })}
            className="lg:col-span-2"
          />
          <Select value={filters.role} onChange={(e) => setFilter({ role: e.target.value as SessionRole | '', personId: '' })}>
            <option value="">{t('allRoles')}</option>
            {SESSION_ROLES.filter((r) => r !== 'SELLER').map((r) => (
              <option key={r} value={r}>
                {t(`roles.${r}`)}
              </option>
            ))}
          </Select>
          {canManage && (
            <Select
              value={filters.personId}
              disabled={!filters.role}
              onChange={(e) => setFilter({ personId: e.target.value })}
            >
              <option value="">{t('allPeople')}</option>
              {(people ?? [])
                .filter((p) => p.role === filters.role)
                .map((p) => (
                  <option key={p.personId} value={p.personId}>
                    {p.name}
                  </option>
                ))}
            </Select>
          )}
          <Select value={filters.status} onChange={(e) => setFilter({ status: e.target.value as SessionStatus | '' })}>
            <option value="">{t('allStatuses')}</option>
            {SESSION_STATUSES.map((s) => (
              <option key={s} value={s}>
                {t(`statuses.${s}`)}
              </option>
            ))}
          </Select>
          <div className="flex gap-2">
            <Input type="date" dir="ltr" aria-label={t('from')} value={filters.from} onChange={(e) => setFilter({ from: e.target.value })} />
            <Input type="date" dir="ltr" aria-label={t('to')} value={filters.to} onChange={(e) => setFilter({ to: e.target.value })} />
          </div>
        </div>

        <ErrorText error={history.error} />
        {history.isPending ? (
          <Spinner />
        ) : (
          <Card className="overflow-x-auto">
            <table className="w-full min-w-[1180px] text-sm">
              <thead>
                <tr className="border-b border-line text-xs text-ink-muted">
                  <th className="p-3 text-start font-medium">{t('sessionId')}</th>
                  <th className="p-3 text-start font-medium">{t('person')}</th>
                  <th className="p-3 text-start font-medium">{t('role')}</th>
                  <th className="p-3 text-start font-medium">{t('startDate')}</th>
                  <th className="p-3 text-start font-medium">{t('endDate')}</th>
                  <th className="p-3 text-start font-medium">{t('cards.openingCash')}</th>
                  <th className="p-3 text-start font-medium">{t('cards.income')}</th>
                  <th className="p-3 text-start font-medium">{t('cards.expenses')}</th>
                  <th className="p-3 text-start font-medium">{t('cards.harvested')}</th>
                  <th className="p-3 text-start font-medium">{t('expectedClosing')}</th>
                  <th className="p-3 text-start font-medium">{t('actualClosing')}</th>
                  <th className="p-3 text-start font-medium">{t('difference')}</th>
                  <th className="p-3 text-start font-medium">{t('status')}</th>
                </tr>
              </thead>
              <tbody>
                {history.data?.items.length === 0 && (
                  <tr>
                    <td colSpan={13} className="p-8 text-center text-ink-faint">
                      {tc('noData')}
                    </td>
                  </tr>
                )}
                {history.data?.items.map((s) => (
                  <tr
                    key={s.id}
                    onClick={() => router.push(`/${locale}/sessions/${s.id}`)}
                    className="cursor-pointer border-b border-line/60 transition-colors last:border-0 hover:bg-surface-3/50"
                  >
                    <td className="p-3 font-semibold text-primary-700 dark:text-primary-300">{s.code}</td>
                    <td className="p-3 text-ink">{s.personName}</td>
                    <td className="p-3 text-ink-muted">{t(`roles.${s.role}`)}</td>
                    <td className="p-3 text-xs text-ink-faint">{formatDateTime(s.startedAt, locale)}</td>
                    <td className="p-3 text-xs text-ink-faint">{s.closedAt ? formatDateTime(s.closedAt, locale) : '—'}</td>
                    <td className="p-3 text-ink-muted">{money(s.openingCash)}</td>
                    <td className="p-3 text-ink">{money(s.figures.salesTotal)}</td>
                    <td className="p-3 text-ink-muted">{money(s.figures.totalExpenses)}</td>
                    <td className="p-3 text-ink">{money(s.figures.harvestedTotal)}</td>
                    <td className="p-3 text-ink-muted">{s.expectedClosingCash ? money(s.expectedClosingCash) : '—'}</td>
                    <td className="p-3 text-ink-muted">{s.actualClosingCash ? money(s.actualClosingCash) : '—'}</td>
                    <td className="p-3">
                      {s.difference && s.result ? (
                        <span className="flex items-center gap-1.5 font-bold text-ink">
                          {money(s.difference)}
                          <Badge tone={RESULT_TONES[s.result]}>{t(`results.${s.result}`)}</Badge>
                        </span>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td className="p-3">
                      <Badge tone={s.status === 'ACTIVE' ? 'APPROVED' : 'neutral'}>{t(`statuses.${s.status}`)}</Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        )}
        {history.data && history.data.meta.totalPages > 1 && (
          <div className="flex items-center justify-between">
            <Button variant="outline" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
              {tc('prev')}
            </Button>
            <span className="text-sm text-ink-muted">
              {tc('page', { page: history.data.meta.page, total: history.data.meta.totalPages })}
            </span>
            <Button variant="outline" disabled={page >= history.data.meta.totalPages} onClick={() => setPage((p) => p + 1)}>
              {tc('next')}
            </Button>
          </div>
        )}
      </section>

      {starting && (
        <StartSessionModal
          onClose={() => setStarting(false)}
          onStarted={(session) => {
            setStarting(false);
            router.push(`/${locale}/sessions/${session.id}`);
          }}
        />
      )}
      {harvesting && <HarvestModal session={harvesting} canCollect={canCollect} onClose={() => setHarvesting(null)} />}
    </div>
  );
}
