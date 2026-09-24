'use client';

import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useLocale, useTranslations } from 'next-intl';
import { useState } from 'react';
import type {
  BranchDto,
  BranchReportRow,
  CashReportRow,
  Locale,
  ProductReportRow,
  ReportGranularity,
  SalesReportDto,
  SellerReportRow,
} from '@my-store/shared';
import { api } from '@/lib/api-client';
import { formatDate, formatMoney, formatNumber } from '@/lib/format';
import { SalesChart } from '@/components/reports/sales-chart';
import { BarList } from '@/components/reports/bar-list';
import { Button, Card, ErrorText, Field, Input, Select, Spinner, cn } from '@/components/ui';
import { ExportButtons } from '@/components/export-buttons';
import { Printer } from 'lucide-react';

const DAY_MS = 86_400_000;
const PRESETS = [7, 30, 90] as const;

const CASH_TYPE_TONES: Record<string, string> = {
  SALE: 'DELIVERED',
  INCOME: 'APPROVED',
  EXPENSE: 'danger',
  REFUND: 'PENDING',
  WITHDRAWAL: 'RETURNED',
};

function isoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export default function ReportsPage() {
  const t = useTranslations('reports');
  const tc = useTranslations('common');
  const tCash = useTranslations('cash');
  const locale = useLocale() as Locale;

  const [from, setFrom] = useState(() => isoDate(new Date(Date.now() - 30 * DAY_MS)));
  const [to, setTo] = useState(() => isoDate(new Date()));
  const [granularity, setGranularity] = useState<ReportGranularity>('day');
  const [branchId, setBranchId] = useState('');
  const [productTab, setProductTab] = useState<'top' | 'low'>('top');

  const range = `from=${from}&to=${to}`;
  const activePreset = PRESETS.find(
    (days) => from === isoDate(new Date(Date.now() - days * DAY_MS)) && to === isoDate(new Date()),
  );

  const { data: branches } = useQuery({
    queryKey: ['branches'],
    queryFn: () => api.get<BranchDto[]>('/branches'),
  });
  const sales = useQuery({
    queryKey: ['report-sales', range, granularity, branchId],
    queryFn: () =>
      api.get<SalesReportDto>(
        `/reports/sales?${range}&granularity=${granularity}${branchId ? `&branchId=${branchId}` : ''}`,
      ),
    placeholderData: keepPreviousData,
  });
  const products = useQuery({
    queryKey: ['report-products', range],
    queryFn: () => api.get<{ top: ProductReportRow[]; low: ProductReportRow[] }>(`/reports/products?${range}`),
    placeholderData: keepPreviousData,
  });
  const cash = useQuery({
    queryKey: ['report-cash', range],
    queryFn: () => api.get<CashReportRow[]>(`/reports/cash?${range}`),
    placeholderData: keepPreviousData,
  });
  const branchReport = useQuery({
    queryKey: ['report-branches', range],
    queryFn: () => api.get<BranchReportRow[]>(`/reports/branches?${range}`),
    placeholderData: keepPreviousData,
  });
  const sellerReport = useQuery({
    queryKey: ['report-sellers', range],
    queryFn: () => api.get<SellerReportRow[]>(`/reports/sellers?${range}`),
    placeholderData: keepPreviousData,
  });

  const totals = sales.data?.totals;
  const stats = totals
    ? [
        { label: t('salesTotal'), value: formatMoney(totals.salesTotal, locale), money: true, accent: true },
        { label: t('profit'), value: formatMoney(totals.profit, locale), money: true },
        { label: t('ordersCount'), value: formatNumber(totals.ordersCount, locale), money: false },
        { label: t('averageOrder'), value: formatMoney(totals.averageOrder, locale), money: true },
      ]
    : null;

  const fetching =
    sales.isFetching ||
    products.isFetching ||
    cash.isFetching ||
    branchReport.isFetching ||
    sellerReport.isFetching;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-black text-ink">{t('title')}</h1>
        <div className="flex flex-wrap gap-2 print:hidden">
          <Button variant="outline" onClick={() => window.print()}>
            <Printer className="h-4 w-4" aria-hidden />
            {tc('print')}
          </Button>
          <ExportButtons
            path="/exports/sales-report"
            query={{ from, to, granularity, ...(branchId && { branchId }) }}
          />
        </div>
      </div>

      {/* Filter row — scope applies to all sections below */}
      <div className="flex flex-wrap items-end gap-3 print:hidden">
        <div className="flex gap-1.5">
          {PRESETS.map((days) => (
            <button
              key={days}
              onClick={() => {
                setFrom(isoDate(new Date(Date.now() - days * DAY_MS)));
                setTo(isoDate(new Date()));
              }}
              className={cn(
                'cursor-pointer rounded-full px-3.5 py-1.5 text-xs font-semibold transition-colors duration-200',
                activePreset === days
                  ? 'bg-primary-700 text-white dark:bg-primary-600'
                  : 'border border-line bg-surface-2 text-ink-muted hover:text-ink',
              )}
            >
              {t('lastDays', { count: formatNumber(days, locale) })}
            </button>
          ))}
        </div>
        <Field label={t('fromDate')}>
          <Input type="date" dir="ltr" value={from} onChange={(e) => setFrom(e.target.value)} className="w-40" />
        </Field>
        <Field label={t('toDate')}>
          <Input type="date" dir="ltr" value={to} onChange={(e) => setTo(e.target.value)} className="w-40" />
        </Field>
        <div className="flex gap-1.5 pb-2.5">
          {(['day', 'month'] as const).map((g) => (
            <button
              key={g}
              onClick={() => setGranularity(g)}
              className={cn(
                'cursor-pointer rounded-full px-3.5 py-1.5 text-xs font-semibold transition-colors duration-200',
                granularity === g
                  ? 'bg-primary-700 text-white dark:bg-primary-600'
                  : 'border border-line bg-surface-2 text-ink-muted hover:text-ink',
              )}
            >
              {t(`granularities.${g}`)}
            </button>
          ))}
        </div>
        <Field label={t('branch')}>
          <Select value={branchId} onChange={(e) => setBranchId(e.target.value)} className="w-44">
            <option value="">{t('allBranches')}</option>
            {branches?.map((branch) => (
              <option key={branch.id} value={branch.id}>
                {branch.name}
              </option>
            ))}
          </Select>
        </Field>
      </div>

      <ErrorText error={sales.error} />
      {sales.isPending ? (
        <Spinner />
      ) : (
        <div className={cn('space-y-4 transition-opacity duration-200', fetching && 'opacity-60')}>
          {stats && (
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4 lg:gap-4">
              {stats.map(({ label, value, money, accent }) => (
                <Card key={label} className={cn('p-4', accent && 'border-accent-300 dark:border-accent-700')}>
                  <p className="text-xs text-ink-muted">{label}</p>
                  <p className="mt-1 text-lg font-black text-ink">
                    {value}{' '}
                    {money && <span className="text-xs font-normal text-ink-faint">{tc('currency')}</span>}
                  </p>
                </Card>
              ))}
            </div>
          )}

          <Card className="p-5">
            <h2 className="mb-3 text-sm font-bold text-ink">{t('trendTitle')}</h2>
            <SalesChart
              points={sales.data?.points ?? []}
              locale={locale}
              labels={{
                revenue: t('revenue'),
                profit: t('profit'),
                orders: t('ordersCount'),
                empty: tc('noData'),
              }}
            />
            {(sales.data?.points.length ?? 0) > 0 && (
              <details className="mt-3">
                <summary className="cursor-pointer text-xs font-semibold text-ink-muted hover:text-ink">
                  {t('dataTable')}
                </summary>
                <div className="mt-2 overflow-x-auto">
                  <table className="w-full min-w-[520px] text-sm">
                    <thead>
                      <tr className="border-b border-line text-xs text-ink-muted">
                        <th className="p-2 text-start font-medium">{t('date')}</th>
                        <th className="p-2 text-start font-medium">{t('revenue')}</th>
                        <th className="p-2 text-start font-medium">{t('cost')}</th>
                        <th className="p-2 text-start font-medium">{t('profit')}</th>
                        <th className="p-2 text-start font-medium">{t('ordersCount')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {sales.data?.points.map((point) => (
                        <tr key={point.bucket} className="border-b border-line/60 last:border-0">
                          <td className="p-2 text-ink">{formatDate(point.bucket, locale)}</td>
                          <td className="p-2 text-ink">{formatMoney(point.total, locale)}</td>
                          <td className="p-2 text-ink-muted">{formatMoney(point.cost, locale)}</td>
                          <td className="p-2 text-ink">{formatMoney(point.profit, locale)}</td>
                          <td className="p-2 text-ink-muted">{formatNumber(point.orders, locale)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </details>
            )}
          </Card>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card className="p-5">
              <div className="mb-4 flex items-center justify-between gap-3">
                <h2 className="text-sm font-bold text-ink">{t('productsTitle')}</h2>
                <div className="flex gap-1.5">
                  {(['top', 'low'] as const).map((tab) => (
                    <button
                      key={tab}
                      onClick={() => setProductTab(tab)}
                      className={cn(
                        'cursor-pointer rounded-full px-3 py-1 text-xs font-semibold transition-colors duration-200',
                        productTab === tab
                          ? 'bg-primary-700 text-white dark:bg-primary-600'
                          : 'border border-line bg-surface-2 text-ink-muted hover:text-ink',
                      )}
                    >
                      {t(`productTabs.${tab}`)}
                    </button>
                  ))}
                </div>
              </div>
              <BarList
                rows={(products.data?.[productTab] ?? []).map((row) => ({
                  key: row.productId,
                  name: row.name,
                  hint: t('soldCount', { count: formatNumber(row.quantity, locale) }),
                  value: Number(row.revenue),
                  display: formatMoney(row.revenue, locale),
                }))}
                empty={tc('noData')}
              />
            </Card>

            <Card className="p-5">
              <h2 className="mb-4 text-sm font-bold text-ink">{t('branchesTitle')}</h2>
              <BarList
                rows={(branchReport.data ?? []).map((row) => ({
                  key: row.branchId,
                  name: row.name,
                  hint: t('ordersHint', { count: formatNumber(row.ordersCount, locale) }),
                  value: Number(row.total),
                  display: formatMoney(row.total, locale),
                }))}
                empty={tc('noData')}
              />
              {(branchReport.data?.length ?? 0) > 0 && (
                <table className="mt-4 w-full text-sm">
                  <thead>
                    <tr className="border-b border-line text-xs text-ink-muted">
                      <th className="p-2 text-start font-medium">{t('branch')}</th>
                      <th className="p-2 text-start font-medium">{t('salesTotal')}</th>
                      <th className="p-2 text-start font-medium">{t('profit')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {branchReport.data!.map((row) => (
                      <tr key={row.branchId} className="border-b border-line/60 last:border-0">
                        <td className="p-2 text-ink">{row.name}</td>
                        <td className="p-2 text-ink-muted">{formatMoney(row.total, locale)}</td>
                        <td className="p-2 font-bold text-ink">{formatMoney(row.profit, locale)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </Card>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card className="p-5">
              <h2 className="mb-4 text-sm font-bold text-ink">{t('cashTitle')}</h2>
              {(cash.data?.length ?? 0) === 0 ? (
                <p className="text-sm text-ink-faint">{tc('noData')}</p>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-line text-xs text-ink-muted">
                      <th className="p-2 text-start font-medium">{tCash('txType')}</th>
                      <th className="p-2 text-start font-medium">{tCash('category')}</th>
                      <th className="p-2 text-start font-medium">{t('txCount')}</th>
                      <th className="p-2 text-start font-medium">{tCash('amount')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {cash.data?.map((row) => (
                      <tr
                        key={`${row.type}-${row.category ?? ''}`}
                        className="border-b border-line/60 last:border-0"
                      >
                        <td className="p-2">
                          <span
                            className={cn(
                              'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium',
                              badgeToneClass(CASH_TYPE_TONES[row.type]),
                            )}
                          >
                            {tCash(`txTypes.${row.type}`)}
                          </span>
                        </td>
                        <td className="p-2 text-ink-muted">{row.category ?? '—'}</td>
                        <td className="p-2 text-ink-muted">{formatNumber(row.count, locale)}</td>
                        <td className="p-2 font-semibold text-ink">{formatMoney(row.total, locale)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </Card>
          </div>

          <Card className="p-5">
            <h2 className="mb-4 text-sm font-bold text-ink">{t('topSellersTitle')}</h2>
            {(sellerReport.data?.length ?? 0) === 0 ? (
              <p className="text-sm text-ink-faint">{tc('noData')}</p>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-line text-xs text-ink-muted">
                    <th className="p-2 text-start font-medium">{t('seller')}</th>
                    <th className="p-2 text-start font-medium">{t('ordersCount')}</th>
                    <th className="p-2 text-start font-medium">{t('itemsSold')}</th>
                    <th className="p-2 text-start font-medium">{t('salesTotal')}</th>
                    <th className="p-2 text-start font-medium">{t('profit')}</th>
                  </tr>
                </thead>
                <tbody>
                  {sellerReport.data?.map((row) => (
                    <tr key={row.sellerId} className="border-b border-line/60 last:border-0">
                      <td className="p-2 font-semibold text-ink">{row.name}</td>
                      <td className="p-2 text-ink-muted">{formatNumber(row.ordersCount, locale)}</td>
                      <td className="p-2 text-ink-muted">{formatNumber(row.itemsSold, locale)}</td>
                      <td className="p-2 text-ink">{formatMoney(row.total, locale)}</td>
                      <td className="p-2 font-bold text-ink">{formatMoney(row.profit, locale)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Card>
        </div>
      )}
    </div>
  );
}

/* Reuse Badge classes without changing the shared component */
const BADGE_TONES: Record<string, string> = {
  PENDING: 'bg-accent-100 text-accent-700 dark:bg-accent-700/20 dark:text-accent-300',
  APPROVED: 'bg-primary-100 text-primary-800 dark:bg-primary-800/40 dark:text-primary-200',
  DELIVERED: 'bg-primary-600 text-white dark:bg-primary-500',
  danger: 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300',
};

function badgeToneClass(tone?: string): string {
  return BADGE_TONES[tone ?? ''] ?? 'bg-surface-3 text-ink-muted';
}
