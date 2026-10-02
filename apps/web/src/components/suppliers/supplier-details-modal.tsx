'use client';

import { useQuery } from '@tanstack/react-query';
import { PackagePlus } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useState } from 'react';
import type { Locale, PurchaseDto, SupplierDto, SupplierProductSummaryDto } from '@my-store/shared';
import { api } from '@/lib/api-client';
import { formatDate, formatMoney, formatNumber } from '@/lib/format';
import { Button, Card, Modal, Spinner, cn } from '@/components/ui';
import { ReceiptLink } from '@/components/receipt-link';

/** A supplier at a glance: how much of each product was bought, and every purchase with its date */
export function SupplierDetailsModal({
  supplier,
  onClose,
  onPurchase,
}: {
  supplier: SupplierDto;
  onClose: () => void;
  onPurchase: () => void;
}) {
  const t = useTranslations('suppliers');
  const tc = useTranslations('common');
  const locale = useLocale() as Locale;
  const [tab, setTab] = useState<'products' | 'purchases'>('products');
  const [page, setPage] = useState(1);

  const { data: products, isPending: productsPending } = useQuery({
    queryKey: ['supplier-products', supplier.id],
    queryFn: () => api.get<SupplierProductSummaryDto[]>(`/suppliers/${supplier.id}/products`),
  });
  const { data: purchases, isPending: purchasesPending } = useQuery({
    queryKey: ['purchases', 'supplier', supplier.id, page],
    queryFn: () =>
      api.getPaged<PurchaseDto[]>(`/suppliers/purchases?supplierId=${supplier.id}&page=${page}&limit=10`),
    enabled: tab === 'purchases',
  });

  const totalQuantity = (products ?? []).reduce((sum, p) => sum + p.quantity, 0);

  return (
    <Modal open wide title={supplier.name} onClose={onClose}>
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat label={t('purchasesCount')} value={formatNumber(supplier.purchasesCount ?? 0, locale)} />
          <Stat label={t('purchasesTotal')} value={formatMoney(supplier.purchasesTotal ?? 0, locale)} />
          <Stat label={t('productsCount')} value={formatNumber(products?.length ?? 0, locale)} />
          <Stat label={t('totalQuantity')} value={formatNumber(totalQuantity, locale)} />
        </div>
        {(supplier.phone || supplier.address) && (
          <p className="text-sm text-ink-muted">{[supplier.phone, supplier.address].filter(Boolean).join(' · ')}</p>
        )}

        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex gap-1.5">
            {(['products', 'purchases'] as const).map((key) => (
              <button
                key={key}
                type="button"
                onClick={() => setTab(key)}
                className={cn(
                  'cursor-pointer rounded-full px-3.5 py-1.5 text-xs font-semibold transition-colors duration-200',
                  tab === key
                    ? 'bg-primary-700 text-white dark:bg-primary-600'
                    : 'border border-line bg-surface-2 text-ink-muted hover:text-ink',
                )}
              >
                {key === 'products' ? t('productsBought') : t('purchaseHistory')}
              </button>
            ))}
          </div>
          <Button type="button" onClick={onPurchase}>
            <PackagePlus className="h-4 w-4" aria-hidden />
            {t('newPurchase')}
          </Button>
        </div>

        {tab === 'products' &&
          (productsPending ? (
            <Spinner />
          ) : products?.length === 0 ? (
            <p className="p-6 text-center text-sm text-ink-faint">{tc('noData')}</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[520px] text-sm">
                <thead>
                  <tr className="border-b border-line text-xs text-ink-muted">
                    <th className="p-2 text-start font-medium">{t('product')}</th>
                    <th className="p-2 text-start font-medium">{t('quantity')}</th>
                    <th className="p-2 text-start font-medium">{t('total')}</th>
                    <th className="p-2 text-start font-medium">{t('purchasesCount')}</th>
                    <th className="p-2 text-start font-medium">{t('lastPurchase')}</th>
                  </tr>
                </thead>
                <tbody>
                  {products?.map((p) => (
                    <tr key={p.productId} className="border-b border-line/60 last:border-0">
                      <td className="p-2 font-medium text-ink">{p.productName}</td>
                      <td className="p-2 font-bold text-ink">{formatNumber(p.quantity, locale)}</td>
                      <td className="p-2 text-ink">{formatMoney(p.total, locale)}</td>
                      <td className="p-2 text-ink-muted">{formatNumber(p.purchases, locale)}</td>
                      <td className="p-2 text-ink-muted">{formatDate(p.lastPurchasedAt, locale)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}

        {tab === 'purchases' &&
          (purchasesPending ? (
            <Spinner />
          ) : purchases?.items.length === 0 ? (
            <p className="p-6 text-center text-sm text-ink-faint">{tc('noData')}</p>
          ) : (
            <div className="space-y-2">
              {purchases?.items.map((purchase) => (
                <Card key={purchase.id} className="p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
                    <span className="font-bold text-ink">
                      #{formatNumber(purchase.purchaseNumber, locale)}{' '}
                      <span className="font-normal text-ink-muted">
                        · {t('received')}: {formatDate(purchase.receivedAt, locale)}
                      </span>
                    </span>
                    <span className="flex items-center gap-3">
                      <span className="text-ink-muted">
                        {t('paid')}:{' '}
                        {formatMoney((Number(purchase.paidAmount) + Number(purchase.debtPaidAmount)).toFixed(2), locale)}
                      </span>
                      <span className="font-bold text-ink">{formatMoney(purchase.total, locale)}</span>
                      <ReceiptLink url={purchase.invoiceImageUrl} label={t('viewDownload')} />
                    </span>
                  </div>
                  <ul className="mt-2 space-y-0.5 text-xs text-ink-muted">
                    {purchase.items.map((item) => (
                      <li key={item.id} className="flex justify-between gap-2">
                        <span className="text-ink">{item.productName}</span>
                        <span dir="ltr">
                          {formatNumber(item.quantity, locale)} × {formatMoney(item.unitCost, locale)} ={' '}
                          {formatMoney(item.total, locale)}
                        </span>
                      </li>
                    ))}
                  </ul>
                </Card>
              ))}
              {purchases && purchases.meta.totalPages > 1 && (
                <div className="flex items-center justify-between">
                  <Button variant="outline" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
                    {tc('prev')}
                  </Button>
                  <span className="text-sm text-ink-muted">
                    {tc('page', {
                      page: formatNumber(purchases.meta.page, locale),
                      total: formatNumber(purchases.meta.totalPages, locale),
                    })}
                  </span>
                  <Button
                    variant="outline"
                    disabled={page >= purchases.meta.totalPages}
                    onClick={() => setPage((p) => p + 1)}
                  >
                    {tc('next')}
                  </Button>
                </div>
              )}
            </div>
          ))}
      </div>
    </Modal>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-surface-3 p-3">
      <p className="text-xs text-ink-faint">{label}</p>
      <p className="mt-0.5 font-black text-ink">{value}</p>
    </div>
  );
}
