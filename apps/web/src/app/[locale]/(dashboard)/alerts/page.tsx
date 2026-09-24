'use client';

import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, Clock } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import Link from 'next/link';
import { PERMISSIONS, type DebtDto, type Locale, type LowStockItemDto } from '@my-store/shared';
import { api } from '@/lib/api-client';
import { formatDate, formatMoney, formatNumber } from '@/lib/format';
import { Badge, Card, ErrorText, Spinner } from '@/components/ui';
import { useAuthStore } from '@/stores/auth-store';

export default function AlertsPage() {
  const t = useTranslations('alerts');
  const td = useTranslations('debts');
  const locale = useLocale() as Locale;
  const user = useAuthStore((s) => s.user);

  const { data: enabledModules } = useQuery({
    queryKey: ['enabled-modules'],
    queryFn: () => api.get<string[]>('/modules/enabled'),
    staleTime: 60_000,
  });
  const debtsEnabled =
    (!enabledModules || enabledModules.includes('debts')) &&
    (!user || user.permissions?.includes(PERMISSIONS.DEBTS_READ));

  const lowStock = useQuery({
    queryKey: ['alerts-low-stock'],
    queryFn: () => api.get<LowStockItemDto[]>('/inventory/low-stock'),
  });

  const overdueDebts = useQuery({
    queryKey: ['alerts-overdue-debts'],
    queryFn: () => api.getPaged<DebtDto[]>('/debts?overdue=true&limit=50'),
    enabled: debtsEnabled,
  });

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-black text-ink">{t('title')}</h1>

      <section className="space-y-3">
        <div className="flex items-center gap-2">
          <AlertTriangle className="h-5 w-5 text-accent-600 dark:text-accent-300" aria-hidden />
          <h2 className="text-sm font-bold text-ink">
            {t('lowStockSectionTitle')}
            {lowStock.data && lowStock.data.length > 0 && (
              <span className="ms-2 text-xs font-normal text-ink-muted">
                ({formatNumber(lowStock.data.length, locale)})
              </span>
            )}
          </h2>
        </div>
        <ErrorText error={lowStock.error} />
        {lowStock.isPending ? (
          <Spinner />
        ) : lowStock.data?.length === 0 ? (
          <Card className="p-6 text-center text-sm text-ink-faint">{t('noLowStock')}</Card>
        ) : (
          <Card className="overflow-x-auto">
            <table className="w-full min-w-[560px] text-sm">
              <thead>
                <tr className="border-b border-line text-xs text-ink-muted">
                  <th className="p-3 text-start font-medium">{t('product')}</th>
                  <th className="p-3 text-start font-medium">{t('warehouse')}</th>
                  <th className="p-3 text-start font-medium">{t('quantity')}</th>
                  <th className="p-3 text-start font-medium">{t('minStockLevel')}</th>
                </tr>
              </thead>
              <tbody>
                {lowStock.data?.map((row) => (
                  <tr
                    key={`${row.productId}`}
                    className="border-b border-line/60 transition-colors last:border-0 hover:bg-surface-3/50"
                  >
                    <td className="p-3 font-medium text-ink">{row.productName}</td>
                    <td className="p-3 text-ink-muted">{row.warehouseName}</td>
                    <td className="p-3">
                      <Badge tone="danger">{formatNumber(row.quantity, locale)}</Badge>
                    </td>
                    <td className="p-3 text-ink-muted">{formatNumber(row.minStockLevel, locale)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        )}
      </section>

      {debtsEnabled && (
        <section className="space-y-3">
          <div className="flex items-center gap-2">
            <Clock className="h-5 w-5 text-accent-600 dark:text-accent-300" aria-hidden />
            <h2 className="text-sm font-bold text-ink">
              {t('overdueDebtsSectionTitle')}
              {overdueDebts.data && overdueDebts.data.items.length > 0 && (
                <span className="ms-2 text-xs font-normal text-ink-muted">
                  ({formatNumber(overdueDebts.data.items.length, locale)})
                </span>
              )}
            </h2>
          </div>
          <ErrorText error={overdueDebts.error} />
          {overdueDebts.isPending ? (
            <Spinner />
          ) : overdueDebts.data?.items.length === 0 ? (
            <Card className="p-6 text-center text-sm text-ink-faint">{t('noOverdueDebts')}</Card>
          ) : (
            <Card className="overflow-x-auto">
              <table className="w-full min-w-[560px] text-sm">
                <thead>
                  <tr className="border-b border-line text-xs text-ink-muted">
                    <th className="p-3 text-start font-medium">{td('party')}</th>
                    <th className="p-3 text-start font-medium">{td('direction')}</th>
                    <th className="p-3 text-start font-medium">{td('remaining')}</th>
                    <th className="p-3 text-start font-medium">{td('dueDate')}</th>
                  </tr>
                </thead>
                <tbody>
                  {overdueDebts.data?.items.map((debt) => {
                    const remaining = Number(debt.amount) - Number(debt.paidAmount);
                    const party = debt.supplierId;
                    return (
                      <tr
                        key={debt.id}
                        className="border-b border-line/60 transition-colors last:border-0 hover:bg-surface-3/50"
                      >
                        <td className="p-3 font-bold text-ink">
                          {party ? (
                            <Link
                              href={`/${locale}/finance/debts/supplier/${party}`}
                              className="text-primary-700 hover:underline dark:text-primary-300"
                            >
                              {debt.partyName}
                            </Link>
                          ) : (
                            debt.partyName
                          )}
                        </td>
                        <td className="p-3">
                          <Badge tone={debt.direction === 'RECEIVABLE' ? 'APPROVED' : 'danger'}>
                            {td(`directions.${debt.direction}`)}
                          </Badge>
                        </td>
                        <td className="p-3 font-bold text-ink">
                          {formatMoney(remaining, locale)}{' '}
                          <span className="text-xs text-ink-faint">{td(`currencies.${debt.currency}`)}</span>
                        </td>
                        <td className="p-3 text-xs text-red-600 dark:text-red-400">
                          {debt.dueDate ? formatDate(debt.dueDate, locale) : '—'}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </Card>
          )}
        </section>
      )}
    </div>
  );
}
