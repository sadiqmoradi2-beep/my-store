'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { PackageSearch, Pencil, Plus, Tags, Trash2 } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import Link from 'next/link';
import { FormEvent, useState } from 'react';
import type { BranchDto, Locale, ProductDto } from '@my-store/shared';
import { api } from '@/lib/api-client';
import { formatDate, formatMoney, formatNumber } from '@/lib/format';
import { Badge, Button, Card, ErrorText, Field, Input, Modal, Select, Spinner } from '@/components/ui';
import { ExportButtons } from '@/components/export-buttons';

export default function ProductsPage() {
  const t = useTranslations('products');
  const tc = useTranslations('common');
  const locale = useLocale() as Locale;
  const queryClient = useQueryClient();

  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [requestOpen, setRequestOpen] = useState(false);

  const { data, isPending, error } = useQuery({
    queryKey: ['products', page, search],
    queryFn: () =>
      api.getPaged<ProductDto[]>(
        `/products?page=${page}&limit=15${search ? `&search=${encodeURIComponent(search)}` : ''}`,
      ),
  });

  const removeMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/products/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['products'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
    },
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-black text-ink">{t('title')}</h1>
        <div className="flex flex-wrap gap-2">
          <ExportButtons path="/exports/products" />
          <Link href={`/${locale}/catalog/products/labels`}>
            <Button variant="outline">
              <Tags className="h-4 w-4" aria-hidden />
              {t('printLabels')}
            </Button>
          </Link>
          <Button variant="outline" onClick={() => setRequestOpen(true)}>
            <PackageSearch className="h-4 w-4" aria-hidden />
            {t('requestFromWarehouse')}
          </Button>
          <Link href={`/${locale}/catalog/products/new`}>
            <Button>
              <Plus className="h-4 w-4" aria-hidden />
              {t('new')}
            </Button>
          </Link>
        </div>
      </div>

      <Input
        placeholder={tc('search')}
        value={search}
        onChange={(e) => {
          setSearch(e.target.value);
          setPage(1);
        }}
        className="max-w-sm"
      />

      <ErrorText error={error} />
      {isPending ? (
        <Spinner />
      ) : (
        <Card className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr className="border-b border-line text-start text-xs text-ink-muted">
                <th className="p-3 text-start font-medium">{t('name')}</th>
                <th className="p-3 text-start font-medium">{t('sku')}</th>
                <th className="p-3 text-start font-medium">{t('category')}</th>
                <th className="p-3 text-start font-medium">{t('salePrice')}</th>
                <th className="p-3 text-start font-medium">{t('stock')}</th>
                <th className="p-3 text-start font-medium">{t('expiryDate')}</th>
                <th className="p-3 text-start font-medium">{tc('actions')}</th>
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
              {data?.items.map((product) => {
                const low =
                  product.totalStock !== undefined && product.totalStock <= product.minStockLevel;
                const expiryDate = product.expiryDate ? new Date(product.expiryDate) : null;
                const expiringSoon =
                  expiryDate && expiryDate.getTime() - Date.now() <= 30 * 24 * 60 * 60 * 1000;
                const expired = expiryDate && expiryDate.getTime() < Date.now();
                return (
                  <tr
                    key={product.id}
                    className="border-b border-line/60 transition-colors last:border-0 hover:bg-surface-3/50"
                  >
                    <td className="p-3 font-medium text-ink">{product.name}</td>
                    <td className="p-3">
                      <span dir="ltr" className="font-mono text-xs text-ink-muted">
                        {product.sku}
                      </span>
                    </td>
                    <td className="p-3 text-ink-muted">{product.categoryName}</td>
                    <td className="p-3 font-semibold text-ink">
                      {formatMoney(product.salePrice, locale)}
                    </td>
                    <td className="p-3">
                      <span className="me-2 font-semibold text-ink">
                        {formatNumber(product.totalStock ?? 0, locale)}
                      </span>
                      {low && <Badge tone="danger">{t('stock')} ↓</Badge>}
                    </td>
                    <td className="p-3 text-xs text-ink-muted">
                      {expiryDate ? (
                        <>
                          <span className="me-2">{formatDate(product.expiryDate!, locale)}</span>
                          {expired ? (
                            <Badge tone="danger">{t('expired')}</Badge>
                          ) : expiringSoon ? (
                            <Badge tone="PENDING">{t('expiringSoon')}</Badge>
                          ) : null}
                        </>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td className="p-3">
                      <div className="flex items-center gap-1">
                        <Link
                          href={`/${locale}/catalog/products/${product.id}/edit`}
                          aria-label={tc('edit')}
                          className="cursor-pointer rounded-lg p-2 text-ink-muted transition-colors hover:bg-surface-3 hover:text-primary-700"
                        >
                          <Pencil className="h-4 w-4" />
                        </Link>
                        <button
                          aria-label={tc('delete')}
                          onClick={() => {
                            if (confirm(t('deleteConfirm'))) removeMutation.mutate(product.id);
                          }}
                          className="cursor-pointer rounded-lg p-2 text-ink-muted transition-colors hover:bg-red-50 hover:text-red-700 dark:hover:bg-red-950/40"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
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

      {requestOpen && <RequestFromWarehouseModal onClose={() => setRequestOpen(false)} />}
    </div>
  );
}

function RequestFromWarehouseModal({ onClose }: { onClose: () => void }) {
  const t = useTranslations('inventory');
  const tp = useTranslations('products');
  const tc = useTranslations('common');
  const queryClient = useQueryClient();

  const [toWarehouseId, setToWarehouseId] = useState('');
  const [fromWarehouseId, setFromWarehouseId] = useState('');
  const [productId, setProductId] = useState('');
  const [productSearch, setProductSearch] = useState('');
  const [quantity, setQuantity] = useState('1');
  const [reason, setReason] = useState('');
  const [receiptFile, setReceiptFile] = useState<File | null>(null);

  const { data: branches } = useQuery({
    queryKey: ['branches'],
    queryFn: () => api.get<BranchDto[]>('/branches'),
  });
  const warehouses = (branches ?? []).flatMap((b) =>
    b.warehouses.map((w) => ({ ...w, label: `${b.name} — ${w.name}` })),
  );
  const { data: productResults } = useQuery({
    queryKey: ['products-search', productSearch],
    queryFn: () =>
      api.getPaged<ProductDto[]>(`/products?limit=6&search=${encodeURIComponent(productSearch)}`),
    enabled: productSearch.length >= 2,
  });

  const mutation = useMutation({
    mutationFn: async () => {
      let receiptImageUrl: string | undefined;
      if (receiptFile) {
        const body = new FormData();
        body.append('file', receiptFile);
        const res = await api.upload<{ url: string }>('/uploads/warehouse-requests', body);
        receiptImageUrl = res.url;
      }
      return api.post('/inventory/transfer', {
        productId,
        quantity: Number(quantity),
        fromWarehouseId,
        toWarehouseId,
        reason: reason || undefined,
        receiptImageUrl,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['stocks'] });
      queryClient.invalidateQueries({ queryKey: ['products'] });
      onClose();
    },
  });

  const canSubmit = toWarehouseId && fromWarehouseId && fromWarehouseId !== toWarehouseId && productId;

  function submit(e: FormEvent) {
    e.preventDefault();
    if (canSubmit) mutation.mutate();
  }

  return (
    <Modal open title={tp('requestFromWarehouse')} onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        <Field label={tp('requestDestination')}>
          <Select required value={toWarehouseId} onChange={(e) => setToWarehouseId(e.target.value)}>
            <option value="" disabled>
              {t('warehouse')}
            </option>
            {warehouses.map((w) => (
              <option key={w.id} value={w.id}>
                {w.label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label={tp('requestSource')}>
          <Select required value={fromWarehouseId} onChange={(e) => setFromWarehouseId(e.target.value)}>
            <option value="" disabled>
              {t('warehouse')}
            </option>
            {warehouses
              .filter((w) => w.id !== toWarehouseId)
              .map((w) => (
                <option key={w.id} value={w.id}>
                  {w.label}
                </option>
              ))}
          </Select>
        </Field>

        <Field label={t('product')}>
          <div className="relative">
            <Input
              value={productId ? productResults?.items.find((p) => p.id === productId)?.name ?? productSearch : productSearch}
              onChange={(e) => {
                setProductSearch(e.target.value);
                setProductId('');
              }}
              placeholder={tc('search')}
            />
            {!productId && productResults && productResults.items.length > 0 && (
              <div className="absolute z-10 mt-1 w-full overflow-hidden rounded-lg border border-line bg-surface-2 shadow-lg">
                {productResults.items.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => {
                      setProductId(p.id);
                      setProductSearch(p.name);
                    }}
                    className="flex w-full cursor-pointer items-center justify-between px-3 py-2 text-start text-sm hover:bg-surface-3"
                  >
                    <span className="text-ink">{p.name}</span>
                    <span className="text-xs text-ink-faint" dir="ltr">{p.sku}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </Field>

        <Field label={t('quantity')}>
          <Input
            required
            type="number"
            min={1}
            dir="ltr"
            value={quantity}
            onChange={(e) => setQuantity(e.target.value)}
          />
        </Field>

        <Field label={tp('requestReceiptImage')}>
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp"
            onChange={(e) => setReceiptFile(e.target.files?.[0] ?? null)}
            className="block w-full text-sm text-ink-muted file:me-3 file:rounded-lg file:border-0 file:bg-surface-3 file:px-3 file:py-2 file:text-sm file:font-medium file:text-ink"
          />
        </Field>

        <Field label={t('reason')}>
          <Input value={reason} onChange={(e) => setReason(e.target.value)} />
        </Field>

        <ErrorText error={mutation.error} />
        <div className="flex gap-2">
          <Button type="submit" loading={mutation.isPending} disabled={!canSubmit}>
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
