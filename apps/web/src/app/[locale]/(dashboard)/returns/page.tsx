'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { FormEvent, useState } from 'react';
import type { BranchDto, Locale, ProductDto, PurchaseReturnDto, SupplierDto } from '@my-store/shared';
import { api } from '@/lib/api-client';
import { formatDate, formatMoney, formatNumber } from '@/lib/format';
import { Button, Card, ErrorText, Field, Input, Modal, Select, Spinner } from '@/components/ui';

export default function ReturnPurchasePage() {
  const t = useTranslations('returns');
  const tc = useTranslations('common');
  const locale = useLocale() as Locale;
  const [page, setPage] = useState(1);
  const [creating, setCreating] = useState(false);

  const { data, isPending, error } = useQuery({
    queryKey: ['purchase-returns', page],
    queryFn: () => api.getPaged<PurchaseReturnDto[]>(`/purchase-returns?page=${page}&limit=15`),
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-black text-ink">{t('listTitle')}</h1>
          <p className="mt-1 text-sm text-ink-muted">{t('hint')}</p>
        </div>
        <Button onClick={() => setCreating(true)}>
          <Plus className="h-4 w-4" aria-hidden />
          {t('new')}
        </Button>
      </div>

      <ErrorText error={error} />
      {isPending ? (
        <Spinner />
      ) : (
        <Card className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-sm">
            <thead>
              <tr className="border-b border-line text-xs text-ink-muted">
                <th className="p-3 text-start font-medium">{t('date')}</th>
                <th className="p-3 text-start font-medium">{t('supplier')}</th>
                <th className="p-3 text-start font-medium">{t('product')}</th>
                <th className="p-3 text-start font-medium">{t('quantity')}</th>
                <th className="p-3 text-start font-medium">{t('value')}</th>
                <th className="p-3 text-start font-medium">{t('noteCol')}</th>
                <th className="p-3 text-start font-medium">{t('by')}</th>
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
              {data?.items.map((ret) => (
                <tr key={ret.id} className="border-b border-line/60 last:border-0">
                  <td className="p-3 text-xs text-ink-faint">{formatDate(ret.createdAt, locale)}</td>
                  <td className="p-3 text-ink">{ret.supplierName}</td>
                  <td className="p-3">
                    <p className="font-medium text-ink">{ret.productName}</p>
                    <p className="text-xs text-ink-faint">{ret.warehouseName}</p>
                  </td>
                  <td className="p-3 text-ink-muted">{formatNumber(ret.quantity, locale)}</td>
                  <td className="p-3 font-bold text-ink">
                    {formatMoney(ret.total, locale)}{' '}
                    <span className="text-xs font-normal text-ink-faint">{tc('currency')}</span>
                  </td>
                  <td className="p-3 text-ink-muted">{ret.note ?? '—'}</td>
                  <td className="p-3 text-ink-muted">{ret.createdByName}</td>
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

      {creating && <NewReturnModal onClose={() => setCreating(false)} />}
    </div>
  );
}

function NewReturnModal({ onClose }: { onClose: () => void }) {
  const t = useTranslations('returns');
  const tc = useTranslations('common');
  const queryClient = useQueryClient();
  const [form, setForm] = useState({ supplierId: '', productId: '', warehouseId: '', quantity: '1', note: '' });
  const set = (key: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm((f) => ({ ...f, [key]: e.target.value }));

  const { data: suppliers } = useQuery({
    queryKey: ['suppliers'],
    queryFn: () => api.get<SupplierDto[]>('/suppliers'),
  });
  const { data: products } = useQuery({
    queryKey: ['products-all'],
    queryFn: () => api.getPaged<ProductDto[]>('/products?limit=100').then((r) => r.items),
  });
  const { data: branches } = useQuery({
    queryKey: ['branches'],
    queryFn: () => api.get<BranchDto[]>('/branches'),
  });
  const warehouses = (branches ?? []).flatMap((b) =>
    b.warehouses.map((w) => ({ id: w.id, label: `${b.name} — ${w.name}` })),
  );

  const mutation = useMutation({
    mutationFn: () =>
      api.post('/purchase-returns', {
        supplierId: form.supplierId,
        productId: form.productId,
        warehouseId: form.warehouseId,
        quantity: Number(form.quantity),
        note: form.note || undefined,
      }),
    onSuccess: () => {
      for (const key of ['purchase-returns', 'stocks', 'products', 'debts', 'debts-summary', 'debt-ledger']) {
        queryClient.invalidateQueries({ queryKey: [key] });
      }
      onClose();
    },
  });

  function submit(e: FormEvent) {
    e.preventDefault();
    mutation.mutate();
  }

  return (
    <Modal open title={t('new')} onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        <Field label={t('supplier')}>
          <Select required value={form.supplierId} onChange={set('supplierId')}>
            <option value="" disabled>
              {t('selectSupplier')}
            </option>
            {suppliers?.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label={t('product')}>
          <Select required value={form.productId} onChange={set('productId')}>
            <option value="" disabled>
              {t('selectProduct')}
            </option>
            {products?.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} ({p.sku})
              </option>
            ))}
          </Select>
        </Field>
        <Field label={t('warehouse')}>
          <Select required value={form.warehouseId} onChange={set('warehouseId')}>
            <option value="" disabled>
              {t('selectWarehouse')}
            </option>
            {warehouses.map((w) => (
              <option key={w.id} value={w.id}>
                {w.label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label={t('quantity')}>
          <Input required type="number" min={1} dir="ltr" value={form.quantity} onChange={set('quantity')} />
        </Field>
        <Field label={t('note')} hint={t('noteHint')}>
          <Input value={form.note} onChange={set('note')} />
        </Field>
        <ErrorText error={mutation.error} />
        <div className="flex gap-2">
          <Button type="submit" loading={mutation.isPending}>
            {tc('confirm')}
          </Button>
          <Button type="button" variant="ghost" onClick={onClose}>
            {tc('cancel')}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
