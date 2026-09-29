'use client';

import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useLocale, useTranslations } from 'next-intl';
import { useState } from 'react';
import { PERMISSIONS } from '@my-store/shared';
import type { Locale, PurchaseDto, SupplierDto } from '@my-store/shared';
import { api, assetUrl } from '@/lib/api-client';
import { formatDate, formatMoney, formatNumber } from '@/lib/format';
import { BackLink, Button, Card, ErrorText, Field, Input, Select, Spinner } from '@/components/ui';
import { useRequirePermission } from '@/hooks/use-require-permission';

const DAY_MS = 86_400_000;
const isoDate = (d: Date) => d.toISOString().slice(0, 10);

export default function PurchaseReportPage() {
  const t = useTranslations('purchaseReport');
  const ti = useTranslations('inventory');
  const ts = useTranslations('suppliers');
  const tc = useTranslations('common');
  const locale = useLocale() as Locale;
  const allowed = useRequirePermission(PERMISSIONS.PURCHASES_READ);

  const [from, setFrom] = useState(() => isoDate(new Date(Date.now() - 30 * DAY_MS)));
  const [to, setTo] = useState(() => isoDate(new Date()));
  const [supplierId, setSupplierId] = useState('');
  const [page, setPage] = useState(1);

  const { data: suppliers } = useQuery({
    queryKey: ['suppliers'],
    queryFn: () => api.get<SupplierDto[]>('/suppliers'),
    enabled: allowed,
  });

  const query = `from=${from}&to=${to}${supplierId ? `&supplierId=${supplierId}` : ''}&page=${page}&limit=20`;
  const { data, isPending, error } = useQuery({
    queryKey: ['purchase-report', query],
    queryFn: () => api.getPaged<PurchaseDto[]>(`/suppliers/purchases?${query}`),
    placeholderData: keepPreviousData,
    enabled: allowed,
  });

  if (!allowed) {
    return <p className="p-8 text-center text-sm text-ink-faint">{tc('accessDenied')}</p>;
  }

  return (
    <div className="space-y-4">
      <BackLink href={`/${locale}/catalog/inventory`} label={ti('backToList')} />
      <h1 className="text-xl font-black text-ink">{t('title')}</h1>

      <div className="flex flex-wrap items-end gap-3">
        <Field label={t('fromDate')}>
          <Input type="date" dir="ltr" value={from} onChange={(e) => setFrom(e.target.value)} className="w-40" />
        </Field>
        <Field label={t('toDate')}>
          <Input type="date" dir="ltr" value={to} onChange={(e) => setTo(e.target.value)} className="w-40" />
        </Field>
        <Field label={ts('supplier')}>
          <Select value={supplierId} onChange={(e) => setSupplierId(e.target.value)} className="w-52">
            <option value="">{t('allSuppliers')}</option>
            {suppliers?.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </Select>
        </Field>
      </div>

      <ErrorText error={error} />
      {isPending ? (
        <Spinner />
      ) : (
        <Card className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-sm">
            <thead>
              <tr className="border-b border-line text-xs text-ink-muted">
                <th className="p-3 text-start font-medium">{ts('purchaseNumber')}</th>
                <th className="p-3 text-start font-medium">{ts('supplier')}</th>
                <th className="p-3 text-start font-medium">{ts('items')}</th>
                <th className="p-3 text-start font-medium">{ts('total')}</th>
                <th className="p-3 text-start font-medium">{ts('paid')}</th>
                <th className="p-3 text-start font-medium">{ts('invoiceImage')}</th>
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
              {data?.items.map((purchase) => (
                <tr key={purchase.id} className="border-b border-line/60 last:border-0">
                  <td className="p-3">
                    <p className="font-bold text-ink">#{formatNumber(purchase.purchaseNumber, locale)}</p>
                    <p className="text-xs text-ink-faint">{formatDate(purchase.createdAt, locale)}</p>
                  </td>
                  <td className="p-3 text-ink">{purchase.supplierName}</td>
                  <td className="p-3 text-ink-muted">{formatNumber(purchase.items.length, locale)}</td>
                  <td className="p-3 font-bold text-ink">{formatMoney(purchase.total, locale)}</td>
                  <td className="p-3 text-ink-muted">{formatMoney(purchase.paidAmount, locale)}</td>
                  <td className="p-3">
                    {purchase.invoiceImageUrl ? (
                      <a href={assetUrl(purchase.invoiceImageUrl)} target="_blank" rel="noreferrer">
                        <img
                          src={assetUrl(purchase.invoiceImageUrl)}
                          alt={ts('invoiceImage')}
                          className="h-10 w-10 rounded-md border border-line object-cover"
                        />
                      </a>
                    ) : (
                      <span className="text-xs text-ink-faint">—</span>
                    )}
                  </td>
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
