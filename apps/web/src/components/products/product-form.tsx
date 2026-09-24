'use client';

import { useQuery } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { FormEvent, useState } from 'react';
import type { BranchDto, CategoryDto, ProductDto, SupplierDto } from '@my-store/shared';
import { api } from '@/lib/api-client';
import { Button, ErrorText, Field, Input, Select, Textarea } from '@/components/ui';

export interface ProductFormValues {
  name: string;
  sku?: string;
  barcode?: string;
  categoryId: string;
  description?: string;
  unit?: string;
  purchasePrice: number;
  salePrice: number;
  wholesalePrice?: number;
  minStockLevel?: number;
  expiryDate?: string;
  currency: 'USDT';
  supplierId?: string;
  branchId?: string;
  initialQuantity?: number;
  invoiceImageUrl?: string;
  stockWarehouseId?: string;
}

export function flattenTree(nodes: CategoryDto[], depth = 0): { id: string; label: string }[] {
  return nodes.flatMap((node) => [
    { id: node.id, label: `${'— '.repeat(depth)}${node.name}` },
    ...flattenTree(node.children ?? [], depth + 1),
  ]);
}

export function ProductForm({
  initial,
  onSubmit,
  submitting,
  error,
}: {
  initial?: Partial<ProductDto>;
  onSubmit: (values: ProductFormValues) => void;
  submitting: boolean;
  error: unknown;
}) {
  const t = useTranslations('products');
  const tc = useTranslations('common');

  const { data: tree } = useQuery({
    queryKey: ['categories'],
    queryFn: () => api.get<CategoryDto[]>('/categories/tree'),
  });
  const categories = flattenTree(tree ?? []);

  const isNew = !initial;
  const { data: suppliers } = useQuery({
    queryKey: ['suppliers'],
    queryFn: () => api.get<SupplierDto[]>('/suppliers'),
    enabled: isNew,
  });
  const { data: branches } = useQuery({
    queryKey: ['branches'],
    queryFn: () => api.get<BranchDto[]>('/branches'),
    enabled: isNew,
  });

  const [autoSku, setAutoSku] = useState(!initial);
  const [form, setForm] = useState({
    name: initial?.name ?? '',
    sku: initial?.sku ?? '',
    barcode: initial?.barcode ?? '',
    categoryId: initial?.categoryId ?? '',
    description: initial?.description ?? '',
    unit: initial?.unit ?? 'pcs',
    purchasePrice: initial?.purchasePrice ?? '',
    salePrice: initial?.salePrice ?? '',
    wholesalePrice: initial?.wholesalePrice ?? '',
    minStockLevel: initial?.minStockLevel?.toString() ?? '0',
    expiryDate: initial?.expiryDate?.slice(0, 10) ?? '',
    currency: 'USDT' as const,
  });

  const [registerPurchase, setRegisterPurchase] = useState(false);
  const [purchase, setPurchase] = useState({ supplierId: '', branchId: '', initialQuantity: '' });
  const [invoiceFile, setInvoiceFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<unknown>(null);
  const [stockScope, setStockScope] = useState<'ALL' | 'SPECIFIC'>('ALL');
  const [stockWarehouseId, setStockWarehouseId] = useState('');
  const warehouseOptions = (branches ?? []).flatMap((b) =>
    b.warehouses.map((w) => ({ id: w.id, label: `${b.name} — ${w.name}` })),
  );

  const set =
    (key: keyof typeof form) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
      setForm((f) => ({ ...f, [key]: e.target.value }));

  async function submit(e: FormEvent) {
    e.preventDefault();
    let invoiceImageUrl: string | undefined;
    if (isNew && registerPurchase && invoiceFile) {
      setUploading(true);
      setUploadError(null);
      try {
        const form = new FormData();
        form.append('file', invoiceFile);
        const res = await api.upload<{ url: string }>('/uploads/purchase-invoices', form);
        invoiceImageUrl = res.url;
      } catch (err) {
        setUploadError(err);
        setUploading(false);
        return;
      }
      setUploading(false);
    }
    onSubmit({
      name: form.name,
      sku: autoSku ? undefined : form.sku,
      barcode: form.barcode || undefined,
      categoryId: form.categoryId,
      description: form.description || undefined,
      unit: form.unit || undefined,
      purchasePrice: Number(form.purchasePrice),
      salePrice: Number(form.salePrice),
      wholesalePrice: form.wholesalePrice === '' ? undefined : Number(form.wholesalePrice),
      minStockLevel: Number(form.minStockLevel || 0),
      expiryDate: form.expiryDate || undefined,
      currency: form.currency,
      ...(isNew && stockScope === 'SPECIFIC' && { stockWarehouseId }),
      ...(isNew &&
        registerPurchase && {
          supplierId: purchase.supplierId,
          branchId: purchase.branchId,
          initialQuantity: Number(purchase.initialQuantity),
          invoiceImageUrl,
        }),
    });
  }

  return (
    <form onSubmit={submit} className="grid gap-4 lg:grid-cols-2">
      <Field label={t('name')}>
        <Input required value={form.name} onChange={set('name')} />
      </Field>
      <Field label={t('category')}>
        <Select required value={form.categoryId} onChange={set('categoryId')}>
          <option value="" disabled>
            {tc('search')}
          </option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.label}
            </option>
          ))}
        </Select>
      </Field>
      <Field label={t('sku')}>
        <div className="space-y-1.5">
          {isNew && (
            <label className="flex items-center gap-2 text-xs font-medium text-ink-muted">
              <input
                type="checkbox"
                checked={autoSku}
                onChange={(e) => setAutoSku(e.target.checked)}
                className="h-4 w-4"
              />
              {t('autoGenerateSku')}
            </label>
          )}
          {!autoSku && <Input required dir="ltr" value={form.sku} onChange={set('sku')} />}
        </div>
      </Field>
      <Field label={t('barcode')} hint={initial ? undefined : t('barcodeAutoHint')}>
        <Input dir="ltr" value={form.barcode} onChange={set('barcode')} placeholder={initial ? undefined : t('barcodeAutoPlaceholder')} />
      </Field>
      <Field label={t('purchasePrice')}>
        <Input required type="number" min={0} step="0.01" dir="ltr" value={form.purchasePrice} onChange={set('purchasePrice')} />
      </Field>
      <Field label={t('salePrice')}>
        <Input required type="number" min={0} step="0.01" dir="ltr" value={form.salePrice} onChange={set('salePrice')} />
      </Field>
      <Field label={t('wholesalePrice')}>
        <Input type="number" min={0} step="0.01" dir="ltr" value={form.wholesalePrice} onChange={set('wholesalePrice')} />
      </Field>
      <Field label={t('minStock')}>
        <Input type="number" min={0} dir="ltr" value={form.minStockLevel} onChange={set('minStockLevel')} />
      </Field>
      <Field label={t('unit')}>
        <Input value={form.unit} onChange={set('unit')} />
      </Field>
      <Field label={t('expiryDate')} hint={t('expiryDateHint')}>
        <Input type="date" dir="ltr" value={form.expiryDate} onChange={set('expiryDate')} />
      </Field>
      <div className="lg:col-span-2">
        <Field label={t('description')}>
          <Textarea value={form.description} onChange={set('description')} />
        </Field>
      </div>

      {isNew && (
        <div className="lg:col-span-2 space-y-2">
          <Field label={t('stockScope')}>
            <div className="flex gap-1.5">
              {(['ALL', 'SPECIFIC'] as const).map((scope) => (
                <button
                  key={scope}
                  type="button"
                  onClick={() => setStockScope(scope)}
                  className={`cursor-pointer rounded-full px-3.5 py-1.5 text-xs font-semibold transition-colors duration-200 ${
                    stockScope === scope
                      ? 'bg-primary-700 text-white dark:bg-primary-600'
                      : 'border border-line bg-surface-2 text-ink-muted hover:text-ink'
                  }`}
                >
                  {t(`stockScopes.${scope}`)}
                </button>
              ))}
            </div>
          </Field>
          {stockScope === 'SPECIFIC' && (
            <Select required value={stockWarehouseId} onChange={(e) => setStockWarehouseId(e.target.value)}>
              <option value="" disabled>
                {t('selectWarehouse')}
              </option>
              {warehouseOptions.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.label}
                </option>
              ))}
            </Select>
          )}
          <p className="text-xs text-ink-muted">
            {stockScope === 'ALL' ? t('stockScopeAllHint') : t('stockScopeSpecificHint')}
          </p>
        </div>
      )}

      {isNew && (
        <div className="lg:col-span-2 space-y-3 rounded-lg border border-line p-4">
          <label className="flex items-center gap-2 text-sm font-semibold text-ink">
            <input
              type="checkbox"
              checked={registerPurchase}
              onChange={(e) => setRegisterPurchase(e.target.checked)}
              className="h-4 w-4"
            />
            {t('initialPurchase')}
          </label>
          <p className="text-xs text-ink-muted">{t('initialPurchaseHint')}</p>
          {registerPurchase && (
            <div className="grid gap-4 sm:grid-cols-3">
              <Field label={t('supplier')}>
                <Select
                  required
                  value={purchase.supplierId}
                  onChange={(e) => setPurchase((p) => ({ ...p, supplierId: e.target.value }))}
                >
                  <option value="" disabled>
                    {tc('search')}
                  </option>
                  {suppliers?.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label={t('branch')}>
                <Select
                  required
                  value={purchase.branchId}
                  onChange={(e) => setPurchase((p) => ({ ...p, branchId: e.target.value }))}
                >
                  <option value="" disabled>
                    {tc('search')}
                  </option>
                  {branches?.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label={t('initialQuantity')}>
                <Input
                  required
                  type="number"
                  min={1}
                  dir="ltr"
                  value={purchase.initialQuantity}
                  onChange={(e) => setPurchase((p) => ({ ...p, initialQuantity: e.target.value }))}
                />
              </Field>
              <div className="sm:col-span-3">
                <Field label={t('invoiceImage')} hint={t('invoiceImageHint')}>
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp,application/pdf"
                    onChange={(e) => setInvoiceFile(e.target.files?.[0] ?? null)}
                    className="block w-full text-sm text-ink-muted file:me-3 file:rounded-lg file:border-0 file:bg-surface-3 file:px-3 file:py-2 file:text-sm file:font-medium file:text-ink"
                  />
                </Field>
                <ErrorText error={uploadError} />
              </div>
            </div>
          )}
        </div>
      )}

      <div className="lg:col-span-2 space-y-3">
        <ErrorText error={error} />
        <Button type="submit" loading={submitting || uploading}>
          {tc('save')}
        </Button>
      </div>
    </form>
  );
}
