'use client';

import { useQuery } from '@tanstack/react-query';
import { CreditCard, HandCoins, Landmark, Plus, ReceiptText, Wallet } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useState } from 'react';
import {
  PERMISSIONS,
  type CashRegisterDto,
  type CashTransactionDto,
  type CashTransactionType,
  type IncomePart,
  type IncomeSummaryDto,
  type Locale,
} from '@my-store/shared';
import { api, assetUrl } from '@/lib/api-client';
import { formatDate, formatMoney, formatNumber } from '@/lib/format';
import { Badge, Button, Card, ErrorText, Select, Spinner, cn } from '@/components/ui';
import { ExportButtons } from '@/components/export-buttons';
import { useAuthStore } from '@/stores/auth-store';
import { SalesList } from '@/components/income/sales-list';
import { SessionReport } from '@/components/sessions/session-report';
import { TransactionModal } from '@/components/income/transaction-modal';
import { useRequirePermission } from '@/hooks/use-require-permission';

const TX_TONES: Record<CashTransactionType, string> = {
  SALE: 'APPROVED',
  INCOME: 'APPROVED',
  EXPENSE: 'danger',
  REFUND: 'danger',
  WITHDRAWAL: 'RETURNED',
};


const PART_ICONS: Record<IncomePart, typeof Wallet> = {
  CASH: Wallet,
  CARD: CreditCard,
  EBT: ReceiptText,
  ZELLE: Landmark,
  DEBIT_CARD: HandCoins,
};

const RANGES = ['today', 'week', 'month', 'all'] as const;
type RangeKey = (typeof RANGES)[number];

const isoDay = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

function rangeDates(range: RangeKey): { from: string; to: string } {
  const now = new Date();
  const to = isoDay(now);
  if (range === 'today') return { from: to, to };
  if (range === 'week') return { from: isoDay(new Date(now.getTime() - 6 * 86_400_000)), to };
  if (range === 'month') return { from: isoDay(new Date(now.getFullYear(), now.getMonth(), 1)), to };
  return { from: '2000-01-01', to };
}

export default function IncomePage() {
  const t = useTranslations('cash');
  const tc = useTranslations('common');
  const locale = useLocale() as Locale;

  const user = useAuthStore((s) => s.user);
  const canSeeSessions = !!user?.permissions?.includes(PERMISSIONS.SESSIONS_READ);
  const allowed = useRequirePermission(PERMISSIONS.CASH_READ);
  const [range, setRange] = useState<RangeKey>('month');
  const [selectedPart, setSelectedPart] = useState<IncomePart>('CASH');
  const [registerId, setRegisterId] = useState<string | null>(null);
  const [newTx, setNewTx] = useState(false);
  const { from, to } = rangeDates(range);

  const { data: summary, isPending, error } = useQuery({
    queryKey: ['income-summary', from, to],
    queryFn: () => api.get<IncomeSummaryDto>(`/cash-registers/income-summary?from=${from}&to=${to}`),
    enabled: allowed,
  });
  const { data: registers } = useQuery({
    queryKey: ['cash-registers'],
    queryFn: () => api.get<CashRegisterDto[]>('/cash-registers'),
    enabled: allowed,
  });

  if (!allowed) {
    return <p className="p-8 text-center text-sm text-ink-faint">{tc('accessDenied')}</p>;
  }

  const partRegisters = (registers ?? []).filter((r) => r.part === selectedPart);
  const selected = partRegisters.find((r) => r.id === registerId) ?? partRegisters[0] ?? null;

  const money = (value: string | number) => (
    <>
      {formatMoney(value, locale)} <span className="text-xs font-normal text-ink-faint">{tc('currency')}</span>
    </>
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-black text-ink">{t('title')}</h1>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex gap-1.5">
            {RANGES.map((r) => (
              <button
                key={r}
                type="button"
                onClick={() => setRange(r)}
                className={cn(
                  'cursor-pointer rounded-full px-3.5 py-1.5 text-xs font-semibold transition-colors duration-200',
                  range === r
                    ? 'bg-primary-700 text-white dark:bg-primary-600'
                    : 'border border-line bg-surface-2 text-ink-muted hover:text-ink',
                )}
              >
                {t(`ranges.${r}`)}
              </button>
            ))}
          </div>
          <ExportButtons path="/exports/cash" />
        </div>
      </div>

      <ErrorText error={error} />
      {isPending ? (
        <Spinner />
      ) : (
        summary && (
          <>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <Card className="border-primary-300 p-4 dark:border-primary-700">
                <p className="text-sm text-ink-muted">{t('totalIncome')}</p>
                <p className="mt-1 text-2xl font-black text-primary-700 dark:text-primary-300">
                  {money(summary.totals.totalIncome)}
                </p>
                <p className="mt-1 text-xs text-ink-faint">{t('totalIncomeHint')}</p>
              </Card>
              <Card className="p-4">
                <p className="text-sm text-ink-muted">{t('totalSales')}</p>
                <p className="mt-1 text-2xl font-black text-ink">{money(summary.totals.totalSales)}</p>
                <p className="mt-1 text-xs text-ink-faint">
                  {t('salesCount', { count: formatNumber(summary.totals.salesCount, locale) })}
                </p>
              </Card>
              <Card className="p-4">
                <p className="text-sm text-ink-muted">{t('totalProfit')}</p>
                <p className="mt-1 text-2xl font-black text-ink">{money(summary.totals.totalProfit)}</p>
              </Card>
              <Card className="p-4">
                <p className="text-sm text-ink-muted">{t('totalBalance')}</p>
                <p className="mt-1 text-2xl font-black text-ink">{money(summary.totals.totalBalance)}</p>
                <p className="mt-1 text-xs text-ink-faint">{t('totalBalanceHint')}</p>
              </Card>
            </div>

            <div className="grid gap-3 md:grid-cols-3 lg:grid-cols-5">
              {summary.parts.map((part) => {
                const Icon = PART_ICONS[part.part];
                const active = selectedPart === part.part;
                return (
                  <div
                    key={part.part}
                    role="button"
                    tabIndex={0}
                    onClick={() => {
                      setSelectedPart(part.part);
                      setRegisterId(null);
                    }}
                    onKeyDown={(e) => e.key === 'Enter' && setSelectedPart(part.part)}
                    className={cn(
                      'cursor-pointer rounded-xl border p-4 text-start transition-colors',
                      active
                        ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/20'
                        : 'border-line bg-surface-2 hover:border-primary-300',
                    )}
                  >
                    <div className="flex items-center gap-2">
                      <Icon className="h-4 w-4 text-primary-600" aria-hidden />
                      <span className="font-bold text-ink">{t(`parts.${part.part}`)}</span>
                    </div>
                    <p className="mt-2 text-xs text-ink-muted">{t('balance')}</p>
                    <p className="text-lg font-black text-ink">{money(part.balance)}</p>
                    <dl className="mt-2 grid grid-cols-3 gap-2 text-xs">
                      <div>
                        <dt className="text-ink-faint">{t('partIncome')}</dt>
                        <dd className="font-bold text-primary-700 dark:text-primary-300">{formatMoney(part.income, locale)}</dd>
                      </div>
                      <div>
                        <dt className="text-ink-faint">{t('partSpent')}</dt>
                        <dd className="font-bold text-red-700 dark:text-red-400">{formatMoney(part.expenses, locale)}</dd>
                      </div>
                      <div>
                        <dt className="text-ink-faint">{t('profit')}</dt>
                        <dd className="font-bold text-ink">{formatMoney(part.profit, locale)}</dd>
                      </div>
                    </dl>
                  </div>
                );
              })}
            </div>

          </>
        )
      )}

      {partRegisters.length > 1 && (
        <Select value={selected?.id ?? ''} onChange={(e) => setRegisterId(e.target.value)} className="max-w-64">
          {partRegisters.map((r) => (
            <option key={r.id} value={r.id}>
              {t(`parts.${r.part}`)} — {r.branchName}
            </option>
          ))}
        </Select>
      )}
      {selected && <RegisterTransactions register={selected} onNewTx={() => setNewTx(true)} />}

      {canSeeSessions && (
        <section className="space-y-2">
          <h2 className="text-base font-bold text-ink">{t('sessionsTitle')}</h2>
          <SessionReport from={from} to={to} />
        </section>
      )}

      <SalesList from={from} to={to} />

      {newTx && selected && <TransactionModal register={selected} onClose={() => setNewTx(false)} />}
    </div>
  );
}

const REFERENCE_FILTERS = ['', 'salary', 'partner'] as const;

function RegisterTransactions({
  register,
  onNewTx,
}: {
  register: CashRegisterDto;
  onNewTx: () => void;
}) {
  const t = useTranslations('cash');
  const tc = useTranslations('common');
  const locale = useLocale() as Locale;
  const [page, setPage] = useState(1);
  const [referenceType, setReferenceType] = useState<(typeof REFERENCE_FILTERS)[number]>('');

  const { data, isPending, error } = useQuery({
    queryKey: ['cash-transactions', register.id, page, referenceType],
    queryFn: () =>
      api.getPaged<CashTransactionDto[]>(
        `/cash-registers/${register.id}/transactions?page=${page}&limit=15${referenceType ? `&referenceType=${referenceType}` : ''}`,
      ),
  });

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-base font-bold text-ink">
          {t('transactionsOf', { name: t(`parts.${register.part}`) })}
        </h2>
        <div className="flex flex-wrap items-center gap-2">
          <Select
            value={referenceType}
            onChange={(e) => {
              setReferenceType(e.target.value as (typeof REFERENCE_FILTERS)[number]);
              setPage(1);
            }}
            className="!min-h-9 !py-1 text-sm"
          >
            {REFERENCE_FILTERS.map((ref) => (
              <option key={ref} value={ref}>
                {t(`referenceFilters.${ref || 'all'}`)}
              </option>
            ))}
          </Select>
          <Button variant="outline" onClick={onNewTx}>
            <Plus className="h-4 w-4" aria-hidden />
            {t('newTransaction')}
          </Button>
        </div>
      </div>

      <ErrorText error={error} />
      {isPending ? (
        <Spinner />
      ) : (
        <Card className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-sm">
            <thead>
              <tr className="border-b border-line text-xs text-ink-muted">
                <th className="p-3 text-start font-medium">{t('txType')}</th>
                <th className="p-3 text-start font-medium">{t('amount')}</th>
                <th className="p-3 text-start font-medium">{t('balanceAfter')}</th>
                <th className="p-3 text-start font-medium">{t('note')}</th>
                <th className="p-3 text-start font-medium">{t('paidByColumn')}</th>
                <th className="p-3 text-start font-medium">{t('performedBy')}</th>
                <th className="p-3 text-start font-medium">{t('date')}</th>
              </tr>
            </thead>
            <tbody>
              {data?.items.length === 0 && (
                <tr>
                  <td colSpan={7} className="p-8 text-center text-ink-faint">
                    {tc('noData')}
                  </td>
                </tr>
              )}
              {data?.items.map((tx) => (
                <tr key={tx.id} className="border-b border-line/60 last:border-0">
                  <td className="p-3">
                    <Badge tone={TX_TONES[tx.type]}>{t(`txTypes.${tx.type}`)}</Badge>
                  </td>
                  <td className="p-3 font-bold text-ink">{formatMoney(tx.amount, locale)}</td>
                  <td className="p-3 text-ink-muted">{formatMoney(tx.balanceAfter, locale)}</td>
                  <td className="p-3 text-ink-muted">
                    {tx.category ?? tx.note ?? '—'}
                    {tx.receiptUrl && (
                      <a
                        href={assetUrl(tx.receiptUrl)}
                        target="_blank"
                        rel="noreferrer"
                        className="ms-2 inline-flex items-center text-primary-600 hover:underline"
                        title={t('receipt')}
                      >
                        <ReceiptText className="h-4 w-4" aria-hidden />
                      </a>
                    )}
                  </td>
                  <td className="p-3 text-ink-muted">
                    {tx.sessionPerson ? (
                      <span title={tx.sessionCode ?? ''}>{tx.sessionPerson}</span>
                    ) : (
                      <span className="text-ink-faint">{t('mainBox')}</span>
                    )}
                  </td>
                  <td className="p-3 text-ink-muted">{tx.performedByName}</td>
                  <td className="p-3 text-xs text-ink-faint">{formatDate(tx.createdAt, locale)}</td>
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
    </div>
  );
}
