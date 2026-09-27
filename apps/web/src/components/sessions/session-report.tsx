'use client';

import { useQuery } from '@tanstack/react-query';
import { useLocale, useTranslations } from 'next-intl';
import Link from 'next/link';
import type { Locale, SessionReportDto } from '@my-store/shared';
import { api } from '@/lib/api-client';
import { formatMoney, formatNumber } from '@/lib/format';
import { Card, ErrorText, Spinner } from '@/components/ui';

/**
 * Work-session figures of a period: how many sessions are open, how much cash people are holding,
 * what was harvested and how the closed sessions ended — summed per person.
 */
export function SessionReport({ from, to, showCards = true }: { from: string; to: string; showCards?: boolean }) {
  const t = useTranslations('sessions');
  const tc = useTranslations('common');
  const locale = useLocale() as Locale;

  const { data, isPending, error } = useQuery({
    queryKey: ['session-report', from, to],
    queryFn: () => api.get<SessionReportDto>(`/work-sessions/report?from=${from}&to=${to}`),
    retry: false,
  });

  if (isPending) return <Spinner />;
  if (error || !data) return <ErrorText error={error} />;

  const cards = [
    { label: t('report.active'), value: formatNumber(data.totals.activeCount, locale) },
    { label: t('report.cashHeld'), value: formatMoney(data.totals.cashHeld, locale), money: true },
    { label: t('report.harvested'), value: formatMoney(data.totals.harvested, locale), money: true },
    { label: t('report.difference'), value: formatMoney(data.totals.difference, locale), money: true },
  ];

  return (
    <div className="space-y-3">
      {showCards && (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {cards.map((card) => (
            <Card key={card.label} className="p-4">
              <p className="text-sm text-ink-muted">{card.label}</p>
              <p className="mt-1 text-xl font-black text-ink">
                {card.value}
                {card.money && <span className="ms-1 text-xs font-normal text-ink-faint">{tc('currency')}</span>}
              </p>
            </Card>
          ))}
        </div>
      )}
      <Card className="overflow-x-auto">
        <table className="w-full min-w-[720px] text-sm">
          <thead>
            <tr className="border-b border-line text-xs text-ink-muted">
              <th className="p-3 text-start font-medium">{t('person')}</th>
              <th className="p-3 text-start font-medium">{t('role')}</th>
              <th className="p-3 text-start font-medium">{t('report.sessions')}</th>
              <th className="p-3 text-start font-medium">{t('cards.income')}</th>
              <th className="p-3 text-start font-medium">{t('cards.expenses')}</th>
              <th className="p-3 text-start font-medium">{t('cards.harvested')}</th>
              <th className="p-3 text-start font-medium">{t('report.cashHeld')}</th>
              <th className="p-3 text-start font-medium">{t('report.difference')}</th>
            </tr>
          </thead>
          <tbody>
            {data.rows.length === 0 && (
              <tr>
                <td colSpan={8} className="p-8 text-center text-ink-faint">
                  {tc('noData')}
                </td>
              </tr>
            )}
            {data.rows.map((row) => (
              <tr key={`${row.role}:${row.personId}`} className="border-b border-line/60 last:border-0">
                <td className="p-3 font-semibold text-ink">{row.personName}</td>
                <td className="p-3 text-ink-muted">{t(`roles.${row.role}`)}</td>
                <td className="p-3 text-ink-muted">{formatNumber(row.sessions, locale)}</td>
                <td className="p-3 text-ink">{formatMoney(row.income, locale)}</td>
                <td className="p-3 text-ink-muted">{formatMoney(row.expenses, locale)}</td>
                <td className="p-3 text-ink">{formatMoney(row.harvested, locale)}</td>
                <td className="p-3 font-bold text-ink">{formatMoney(row.cashHeld, locale)}</td>
                <td
                  className={
                    Number(row.difference) < 0
                      ? 'p-3 font-bold text-red-700 dark:text-red-400'
                      : 'p-3 text-ink-muted'
                  }
                >
                  {formatMoney(row.difference, locale)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
      <Link
        href={`/${locale}/sessions`}
        className="inline-block text-sm font-semibold text-primary-700 hover:underline dark:text-primary-300"
      >
        {t('openSessions')}
      </Link>
    </div>
  );
}
