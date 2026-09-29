'use client';

import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, Banknote, ShoppingBag, TrendingUp } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import Link from 'next/link';
import { PERMISSIONS } from '@my-store/shared';
import type { DashboardSummaryDto, Locale, SalesReportDto } from '@my-store/shared';
import { api } from '@/lib/api-client';
import { formatMoney, formatNumber } from '@/lib/format';
import { Card, ErrorText, Spinner, cn } from '@/components/ui';
import { SalesChart } from '@/components/reports/sales-chart';
import { BarList } from '@/components/reports/bar-list';
import { useRequirePermission } from '@/hooks/use-require-permission';

const DAY_MS = 86_400_000;

export default function DashboardPage() {
  const t = useTranslations('dashboard');
  const tReports = useTranslations('reports');
  const tc = useTranslations('common');
  const locale = useLocale() as Locale;
  const allowed = useRequirePermission(PERMISSIONS.DASHBOARD_VIEW);

  const { data, isPending, error } = useQuery({
    queryKey: ['dashboard'],
    queryFn: () => api.get<DashboardSummaryDto>('/dashboard/summary'),
    enabled: allowed,
  });

  const { data: enabledModules } = useQuery({
    queryKey: ['enabled-modules'],
    queryFn: () => api.get<string[]>('/modules/enabled'),
    staleTime: 60_000,
  });
  const reportsEnabled = !enabledModules || enabledModules.includes('reports');

  const from = new Date(Date.now() - 6 * DAY_MS).toISOString().slice(0, 10);
  const to = new Date().toISOString().slice(0, 10);
  const sales = useQuery({
    queryKey: ['dashboard-sales-trend', from, to],
    queryFn: () => api.get<SalesReportDto>(`/reports/sales?from=${from}&to=${to}&granularity=day`),
    enabled: allowed && reportsEnabled,
    retry: false,
  });

  if (!allowed) {
    return <p className="p-8 text-center text-sm text-ink-faint">{tc('accessDenied')}</p>;
  }
  if (isPending) return <Spinner />;
  if (error) return <ErrorText error={error} />;
  if (!data) return null;

  const stats = [
    { label: t('todaySales'), value: formatMoney(data.todaySales, locale), icon: Banknote, accent: true },
    { label: t('monthSales'), value: formatMoney(data.monthSales, locale), icon: Banknote },
    { label: t('todayProfit'), value: formatMoney(data.todayProfit, locale), icon: TrendingUp },
    { label: t('monthProfit'), value: formatMoney(data.monthProfit, locale), icon: TrendingUp, accent: true },
    { label: t('todaySalesCount'), value: formatNumber(data.todaySalesCount, locale), icon: ShoppingBag },
  ];

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-black text-ink">{t('title')}</h1>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5 lg:gap-4">
        {stats.map(({ label, value, icon: Icon, accent }) => (
          <Link key={label} href={`/${locale}/reports`}>
            <Card
              className={cn(
                'relative overflow-hidden p-4 transition-colors hover:border-primary-400',
                accent && 'border-accent-300 dark:border-accent-700',
              )}
            >
              <div
                className={cn(
                  'mb-3 flex h-9 w-9 items-center justify-center rounded-lg',
                  accent
                    ? 'bg-accent-100 text-accent-600 dark:bg-accent-700/20 dark:text-accent-300'
                    : 'bg-primary-100 text-primary-700 dark:bg-primary-800/40 dark:text-primary-300',
                )}
              >
                <Icon className="h-5 w-5" aria-hidden />
              </div>
              <p className="text-xs text-ink-muted">{label}</p>
              <p className="mt-1 text-lg font-black text-ink">
                {value} <span className="text-xs font-normal text-ink-faint">{tc('currency')}</span>
              </p>
            </Card>
          </Link>
        ))}
      </div>

      {data.lowStockCount > 0 && (
        <Link href={`/${locale}/alerts`}>
          <Card className="flex items-center gap-3 border-accent-300 bg-accent-100/40 p-4 transition-colors hover:border-accent-500 dark:border-accent-700 dark:bg-accent-700/10">
            <AlertTriangle className="h-5 w-5 shrink-0 text-accent-600 dark:text-accent-300" aria-hidden />
            <div>
              <p className="text-sm font-bold text-ink">{t('lowStock')}</p>
              <p className="text-xs text-ink-muted">
                {t('lowStockItems', { count: formatNumber(data.lowStockCount, locale) })}
              </p>
            </div>
          </Card>
        </Link>
      )}

      {reportsEnabled && (sales.data?.points.length ?? 0) > 0 && (
        <Card className="p-5">
          <h2 className="mb-3 text-sm font-bold text-ink">{t('salesTrend')}</h2>
          <SalesChart
            points={sales.data?.points ?? []}
            locale={locale}
            labels={{
              revenue: tReports('revenue'),
              profit: tReports('profit'),
              sales: tReports('salesCount'),
              empty: tc('noData'),
            }}
          />
        </Card>
      )}

      <div className="grid gap-4">
        <Card className="p-5">
          <h2 className="mb-4 text-sm font-bold text-ink">{t('topProducts')}</h2>
          {data.topProducts.length === 0 ? (
            <p className="text-sm text-ink-faint">{tc('noData')}</p>
          ) : (
            <BarList
              rows={data.topProducts.map((p, index) => ({
                key: p.productId,
                href: `/${locale}/catalog/products/${p.productId}/edit`,
                name: `${formatNumber(index + 1, locale)}. ${p.name}`,
                hint: t('sold', { count: formatNumber(p.quantity, locale) }),
                value: Number(p.total),
                display: formatMoney(p.total, locale),
              }))}
              empty={tc('noData')}
            />
          )}
        </Card>
      </div>
    </div>
  );
}
