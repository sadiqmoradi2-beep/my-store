'use client';

import { useQuery } from '@tanstack/react-query';
import { useLocale, useTranslations } from 'next-intl';
import { useState } from 'react';
import { PAYMENT_METHODS, type Locale, type PaymentMethod, type SaleDto } from '@my-store/shared';
import { api } from '@/lib/api-client';
import { formatDate, formatMoney, formatNumber } from '@/lib/format';
import { Badge, Button, Card, ErrorText, Select, Spinner } from '@/components/ui';
import { ExportButtons } from '@/components/export-buttons';

export function SalesList({ from, to }: { from: string; to: string }) {
  const t = useTranslations('cash');
  const tc = useTranslations('common');
  const tp = useTranslations('pos');
  const locale = useLocale() as Locale;
  const [page, setPage] = useState(1);
  const [method, setMethod] = useState<PaymentMethod | ''>('');

  const { data, isPending, error } = useQuery({
    queryKey: ['sales', from, to, method, page],
    queryFn: () =>
      api.getPaged<SaleDto[]>(
        `/sales?page=${page}&limit=10&from=${from}&to=${to}${method ? `&paymentMethod=${method}` : ''}`,
      ),
  });

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-base font-bold text-ink">{t('salesTitle')}</h2>
        <div className="flex items-center gap-2">
          <Select
            value={method}
            onChange={(e) => {
              setMethod(e.target.value as PaymentMethod | '');
              setPage(1);
            }}
            className="!min-h-9 !py-1 text-sm"
          >
            <option value="">{t('allMethods')}</option>
            {PAYMENT_METHODS.map((m) => (
              <option key={m} value={m}>
                {tp(`methods.${m}`)}
              </option>
            ))}
          </Select>
          <ExportButtons path="/exports/sales" />
        </div>
      </div>

      <ErrorText error={error} />
      {isPending ? (
        <Spinner />
      ) : (
        <Card className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr className="border-b border-line text-xs text-ink-muted">
                <th className="p-3 text-start font-medium">{t('saleNumber')}</th>
                <th className="p-3 text-start font-medium">{t('method')}</th>
                <th className="p-3 text-start font-medium">{t('total')}</th>
                <th className="p-3 text-start font-medium">{t('profit')}</th>
                <th className="p-3 text-start font-medium">{t('performedBy')}</th>
                <th className="p-3 text-start font-medium">{t('date')}</th>
              </tr>
            </thead>
            <tbody>
              {data?.items.length === 0 && (
                <tr>
                  <td colSpan={6} className="p-8 text-center text-ink-faint">
                    {tc('noData')}
                  </td>
                </tr>
              )}
              {data?.items.map((sale) => (
                <tr key={sale.id} className="border-b border-line/60 last:border-0">
                  <td className="p-3 font-bold text-ink">#{formatNumber(sale.saleNumber, locale)}</td>
                  <td className="p-3">
                    <Badge tone="APPROVED">{tp(`methods.${sale.paymentMethod}`)}</Badge>
                  </td>
                  <td className="p-3 font-bold text-ink">{formatMoney(sale.total, locale)}</td>
                  <td className="p-3 text-ink-muted">{formatMoney(sale.profit, locale)}</td>
                  <td className="p-3 text-ink-muted">{sale.createdByName}</td>
                  <td className="p-3 text-xs text-ink-faint">{formatDate(sale.createdAt, locale)}</td>
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
          <Button variant="outline" disabled={page >= data.meta.totalPages} onClick={() => setPage((p) => p + 1)}>
            {tc('next')}
          </Button>
        </div>
      )}
    </div>
  );
}
