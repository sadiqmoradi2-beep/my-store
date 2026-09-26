'use client';

import { useQuery } from '@tanstack/react-query';
import { FileText } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import type { DebtLedgerDto, Locale } from '@my-store/shared';
import { api, assetUrl } from '@/lib/api-client';
import { formatDate, formatMoney } from '@/lib/format';
import { BackLink, Badge, Card, ErrorText, Spinner } from '@/components/ui';

const STATUS_TONES = {
  OPEN: 'PENDING',
  PARTIAL: 'SHIPPING',
  SETTLED: 'DELIVERED',
} as const;

export function DebtLedgerView({
  kind,
  id,
  showHeader = true,
}: {
  kind: 'supplier' | 'employee';
  id: string;
  /** false = no back link and no counterparty name heading — for embedding inside a page that already has these (like the employee account page) */
  showHeader?: boolean;
}) {
  const t = useTranslations('debts');
  const tc = useTranslations('common');
  const locale = useLocale() as Locale;

  const { data, isPending, error } = useQuery({
    queryKey: ['debt-ledger', kind, id],
    queryFn: () => api.get<DebtLedgerDto>(`/debts/by-${kind}/${id}`),
  });

  if (isPending) return <Spinner />;
  if (error) return <ErrorText error={error} />;
  if (!data) return null;

  return (
    <div className="space-y-4">
      {showHeader && (
        <>
          <BackLink href={`/${locale}/loans`} label={t('title')} />
          <h1 className="text-xl font-black text-ink">{data.party.name}</h1>
        </>
      )}

      {data.totals.length > 0 && (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {data.totals.map((row) => (
            <Card key={row.currency} className="p-4">
              <p className="text-sm text-ink-muted">{t(`currencies.${row.currency}`)}</p>
              <dl className="mt-2 space-y-1 text-sm">
                <div className="flex justify-between">
                  <dt className="text-ink-muted">{t('totalDebts')}</dt>
                  <dd className="font-bold text-ink">{formatMoney(row.amount, locale)}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-ink-muted">{t('totalPaid')}</dt>
                  <dd className="font-bold text-primary-700 dark:text-primary-300">
                    {formatMoney(row.paidAmount, locale)}
                  </dd>
                </div>
                <div className="flex justify-between border-t border-line pt-1">
                  <dt className="text-ink-muted">{t('totalRemaining')}</dt>
                  <dd className="font-black text-ink">{formatMoney(row.remaining, locale)}</dd>
                </div>
              </dl>
            </Card>
          ))}
        </div>
      )}

      <div className="space-y-3">
        {data.debts.length === 0 && (
          <Card className="p-8 text-center text-ink-faint">{tc('noData')}</Card>
        )}
        {data.debts.map((debt) => {
          const remaining = Number(debt.amount) - Number(debt.paidAmount);
          return (
            <Card key={debt.id} className="p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Badge tone={debt.direction === 'RECEIVABLE' ? 'APPROVED' : 'danger'}>
                    {t(`directions.${debt.direction}`)}
                  </Badge>
                  <Badge tone={STATUS_TONES[debt.status]}>{t(`statuses.${debt.status}`)}</Badge>
                  <span className="text-xs text-ink-faint">{formatDate(debt.createdAt, locale)}</span>
                </div>
                <div className="text-sm">
                  <span className="font-bold text-ink">{formatMoney(debt.amount, locale)}</span>{' '}
                  <span className="text-xs text-ink-faint">{t(`currencies.${debt.currency}`)}</span>
                  {kind !== 'employee' && (
                    <span className="ms-2 text-xs text-ink-muted">
                      {t(`payerReceiver.${debt.direction}`)}
                    </span>
                  )}
                </div>
              </div>
              {debt.notes && <p className="mt-1 text-xs text-ink-faint">{debt.notes}</p>}

              {debt.payments.length > 0 ? (
                <div className="mt-3 overflow-x-auto border-t border-line pt-3">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="text-ink-muted">
                        <th className="p-1.5 text-start font-medium">{tc('date')}</th>
                        <th className="p-1.5 text-start font-medium">{t('amount')}</th>
                        <th className="p-1.5 text-start font-medium">{t('performedBy')}</th>
                        <th className="p-1.5 text-start font-medium">{t('notes')}</th>
                        <th className="p-1.5 text-start font-medium">{t('proof')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {debt.payments.map((payment) => (
                        <tr key={payment.id} className="border-t border-line/60">
                          <td className="p-1.5 text-ink-muted">{formatDate(payment.createdAt, locale)}</td>
                          <td className="p-1.5 font-bold text-ink">{formatMoney(payment.amount, locale)}</td>
                          <td className="p-1.5 text-ink-muted">{payment.performedByName ?? '—'}</td>
                          <td className="p-1.5 text-ink-faint">{payment.note ?? '—'}</td>
                          <td className="p-1.5">
                            {payment.proofImageUrl ? (
                              payment.proofImageUrl.toLowerCase().endsWith('.pdf') ? (
                                <a
                                  href={assetUrl(payment.proofImageUrl)}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="inline-flex items-center gap-1 text-primary-700 hover:underline dark:text-primary-300"
                                >
                                  <FileText size={14} />
                                  {t('viewDownload')}
                                </a>
                              ) : (
                                <a href={assetUrl(payment.proofImageUrl)} target="_blank" rel="noreferrer">
                                  <img
                                    src={assetUrl(payment.proofImageUrl)}
                                    alt={t('proof')}
                                    className="h-8 w-8 rounded-md border border-line object-cover"
                                  />
                                </a>
                              )
                            ) : (
                              '—'
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="mt-2 text-xs text-ink-faint">
                  {t('remainingHint', {
                    amount: `${formatMoney(remaining, locale)} ${t(`currencies.${debt.currency}`)}`,
                  })}
                </p>
              )}
            </Card>
          );
        })}
      </div>
    </div>
  );
}
