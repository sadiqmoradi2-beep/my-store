'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { FileText, PackagePlus, Pencil, Plus, Trash2, X } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { FormEvent, useState } from 'react';
import type {
  BranchDto,
  CashRegisterDto,
  Locale,
  ProductDto,
  PurchaseDto,
  SupplierDto,
} from '@my-store/shared';
import { api, assetUrl } from '@/lib/api-client';
import { formatDate, formatMoney, formatNumber } from '@/lib/format';
import { Button, Card, ErrorText, Field, Input, Modal, Select, Spinner } from '@/components/ui';

export default function SuppliersPage() {
  const t = useTranslations('suppliers');
  const tc = useTranslations('common');
  const locale = useLocale() as Locale;
  const queryClient = useQueryClient();

  const [editing, setEditing] = useState<SupplierDto | null | 'new'>(null);
  /** false = closed; '' = open with no preselected supplier; non-empty string = ID of the preselected supplier */
  const [purchasing, setPurchasing] = useState<string | false>(false);

  const { data: suppliers, isPending, error } = useQuery({
    queryKey: ['suppliers'],
    queryFn: () => api.get<SupplierDto[]>('/suppliers'),
  });

  const removeMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/suppliers/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['suppliers'] }),
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-black text-ink">{t('title')}</h1>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setPurchasing('')}>
            <PackagePlus className="h-4 w-4" aria-hidden />
            {t('newPurchase')}
          </Button>
          <Button onClick={() => setEditing('new')}>
            <Plus className="h-4 w-4" aria-hidden />
            {t('new')}
          </Button>
        </div>
      </div>

      <ErrorText error={error} />
      <ErrorText error={removeMutation.error} />
      {isPending ? (
        <Spinner />
      ) : (
        <Card className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-sm">
            <thead>
              <tr className="border-b border-line text-xs text-ink-muted">
                <th className="p-3 text-start font-medium">{t('name')}</th>
                <th className="p-3 text-start font-medium">{t('phone')}</th>
                <th className="p-3 text-start font-medium">{t('purchasesCount')}</th>
                <th className="p-3 text-start font-medium">{t('purchasesTotal')}</th>
                <th className="p-3 text-start font-medium">{t('purchaseNumber')}</th>
                <th className="p-3 text-start font-medium">{tc('actions')}</th>
              </tr>
            </thead>
            <tbody>
              {suppliers?.length === 0 && (
                <tr>
                  <td colSpan={6} className="p-8 text-center text-ink-faint">
                    {tc('noData')}
                  </td>
                </tr>
              )}
              {suppliers?.map((supplier) => (
                <tr
                  key={supplier.id}
                  className="border-b border-line/60 transition-colors last:border-0 hover:bg-surface-3/50"
                >
                  <td className="p-3">
                    <p className="font-bold text-ink">{supplier.name}</p>
                    {supplier.address && <p className="text-xs text-ink-faint">{supplier.address}</p>}
                  </td>
                  <td className="p-3 text-ink-muted" dir="ltr">
                    {supplier.phone ?? '—'}
                  </td>
                  <td className="p-3 text-ink-muted">
                    {formatNumber(supplier.purchasesCount ?? 0, locale)}
                  </td>
                  <td className="p-3 font-bold text-ink">
                    {formatMoney(supplier.purchasesTotal ?? 0, locale)}{' '}
                    <span className="text-xs font-normal text-ink-faint">{tc('currency')}</span>
                  </td>
                  <td className="p-3 text-ink-muted" dir="ltr">
                    {supplier.lastPurchaseNumber != null
                      ? `#${formatNumber(supplier.lastPurchaseNumber, locale)}`
                      : '—'}
                  </td>
                  <td className="p-3">
                    <div className="flex gap-1">
                      <button
                        onClick={() => setPurchasing(supplier.id)}
                        aria-label={t('quickPurchase')}
                        title={t('quickPurchase')}
                        className="cursor-pointer rounded-lg p-1.5 text-ink-muted transition-colors hover:bg-primary-100 hover:text-primary-800 dark:hover:bg-primary-800/40"
                      >
                        <PackagePlus className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => setEditing(supplier)}
                        aria-label={tc('edit')}
                        className="cursor-pointer rounded-lg p-1.5 text-ink-muted transition-colors hover:bg-primary-100 hover:text-primary-800 dark:hover:bg-primary-800/40"
                      >
                        <Pencil className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => {
                          if (confirm(t('deleteConfirm'))) removeMutation.mutate(supplier.id);
                        }}
                        aria-label={tc('delete')}
                        className="cursor-pointer rounded-lg p-1.5 text-ink-muted transition-colors hover:bg-red-50 hover:text-red-700 dark:hover:bg-red-950/40"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      <PurchaseHistory />

      {editing !== null && (
        <SupplierModal
          supplier={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
        />
      )}
      {purchasing !== false && (
        <PurchaseModal presetSupplierId={purchasing || undefined} onClose={() => setPurchasing(false)} />
      )}
    </div>
  );
}

function PurchaseHistory() {
  const t = useTranslations('suppliers');
  const tc = useTranslations('common');
  const locale = useLocale() as Locale;
  const [page, setPage] = useState(1);

  const { data } = useQuery({
    queryKey: ['purchases', page],
    queryFn: () => api.getPaged<PurchaseDto[]>(`/suppliers/purchases?page=${page}&limit=10`),
  });

  if (!data || data.items.length === 0) return null;
  return (
    <div className="space-y-3">
      <h2 className="text-base font-bold text-ink">{t('purchaseHistory')}</h2>
      <Card className="overflow-x-auto">
        <table className="w-full min-w-[640px] text-sm">
          <thead>
            <tr className="border-b border-line text-xs text-ink-muted">
              <th className="p-3 text-start font-medium">{t('purchaseNumber')}</th>
              <th className="p-3 text-start font-medium">{t('supplier')}</th>
              <th className="p-3 text-start font-medium">{t('items')}</th>
              <th className="p-3 text-start font-medium">{t('total')}</th>
              <th className="p-3 text-start font-medium">{t('paid')}</th>
              <th className="p-3 text-start font-medium">{t('invoiceImage')}</th>
            </tr>
          </thead>
          <tbody>
            {data.items.map((purchase) => (
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
                    purchase.invoiceImageUrl.toLowerCase().endsWith('.pdf') ? (
                      <a
                        href={assetUrl(purchase.invoiceImageUrl)}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 text-xs font-medium text-primary-700 hover:underline dark:text-primary-300"
                      >
                        <FileText size={16} />
                        {t('viewDownload')}
                      </a>
                    ) : (
                      <a
                        href={assetUrl(purchase.invoiceImageUrl)}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-block"
                      >
                        <img
                          src={assetUrl(purchase.invoiceImageUrl)}
                          alt={t('invoiceImage')}
                          className="h-10 w-10 rounded-md border border-line object-cover"
                        />
                      </a>
                    )
                  ) : (
                    <span className="text-xs text-ink-faint">—</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
      {data.meta.totalPages > 1 && (
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

function SupplierModal({ supplier, onClose }: { supplier: SupplierDto | null; onClose: () => void }) {
  const t = useTranslations('suppliers');
  const tc = useTranslations('common');
  const queryClient = useQueryClient();
  const [form, setForm] = useState({
    name: supplier?.name ?? '',
    phone: supplier?.phone ?? '',
    email: supplier?.email ?? '',
    address: supplier?.address ?? '',
    notes: supplier?.notes ?? '',
  });
  const set = (patch: Partial<typeof form>) => setForm((f) => ({ ...f, ...patch }));

  const mutation = useMutation({
    mutationFn: () => {
      const payload = {
        name: form.name,
        phone: form.phone || undefined,
        email: form.email || undefined,
        address: form.address || undefined,
        notes: form.notes || undefined,
      };
      return supplier
        ? api.patch(`/suppliers/${supplier.id}`, payload)
        : api.post('/suppliers', payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['suppliers'] });
      onClose();
    },
  });

  function submit(e: FormEvent) {
    e.preventDefault();
    mutation.mutate();
  }

  return (
    <Modal open title={supplier ? `${tc('edit')}: ${supplier.name}` : t('new')} onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        <Field label={t('name')}>
          <Input required value={form.name} onChange={(e) => set({ name: e.target.value })} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label={t('phone')}>
            <Input dir="ltr" value={form.phone} onChange={(e) => set({ phone: e.target.value })} />
          </Field>
          <Field label={t('email')}>
            <Input type="email" dir="ltr" value={form.email} onChange={(e) => set({ email: e.target.value })} />
          </Field>
        </div>
        <Field label={t('address')}>
          <Input value={form.address} onChange={(e) => set({ address: e.target.value })} />
        </Field>
        <Field label={t('notes')}>
          <Input value={form.notes} onChange={(e) => set({ notes: e.target.value })} />
        </Field>
        <ErrorText error={mutation.error} />
        <div className="flex gap-2">
          <Button type="submit" loading={mutation.isPending}>
            {tc('save')}
          </Button>
          <Button type="button" variant="ghost" onClick={onClose}>
            {tc('cancel')}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

interface PurchaseLine {
  productId: string;
  productName: string;
  quantity: string;
  unitCost: string;
}

function PurchaseModal({
  onClose,
  presetSupplierId,
}: {
  onClose: () => void;
  presetSupplierId?: string;
}) {
  const t = useTranslations('suppliers');
  const tc = useTranslations('common');
  const locale = useLocale() as Locale;
  const queryClient = useQueryClient();

  const [supplierId, setSupplierId] = useState(presetSupplierId ?? '');
  const [branchId, setBranchId] = useState('');
  const [paidAmount, setPaidAmount] = useState('');
  const [registerId, setRegisterId] = useState('');
  const [lines, setLines] = useState<PurchaseLine[]>([]);
  const [search, setSearch] = useState('');
  const [invoiceFile, setInvoiceFile] = useState<File | null>(null);
  const [uploadError, setUploadError] = useState<unknown>(null);
  const [uploading, setUploading] = useState(false);

  const { data: suppliers } = useQuery({
    queryKey: ['suppliers'],
    queryFn: () => api.get<SupplierDto[]>('/suppliers'),
  });
  const { data: branches } = useQuery({
    queryKey: ['branches'],
    queryFn: () => api.get<BranchDto[]>('/branches'),
  });
  const { data: registers } = useQuery({
    queryKey: ['cash-registers'],
    queryFn: () => api.get<CashRegisterDto[]>('/cash-registers'),
  });
  const { data: products } = useQuery({
    queryKey: ['purchase-products', search],
    queryFn: () =>
      api.getPaged<ProductDto[]>(`/products?limit=8${search ? `&search=${encodeURIComponent(search)}` : ''}`),
    enabled: search.length > 0,
  });

  const total = lines.reduce(
    (sum, line) => sum + Number(line.quantity || 0) * Number(line.unitCost || 0),
    0,
  );

  const mutation = useMutation({
    mutationFn: async () => {
      let invoiceImageUrl: string | undefined;
      if (invoiceFile) {
        setUploading(true);
        setUploadError(null);
        try {
          const form = new FormData();
          form.append('file', invoiceFile);
          const res = await api.upload<{ url: string }>('/uploads/purchase-invoices', form);
          invoiceImageUrl = res.url;
        } catch (err) {
          setUploadError(err);
          throw err;
        } finally {
          setUploading(false);
        }
      }
      return api.post('/suppliers/purchases', {
        supplierId,
        branchId: branchId || branches?.[0]?.id,
        paidAmount: paidAmount === '' ? undefined : Number(paidAmount),
        registerId: registerId || undefined,
        invoiceImageUrl,
        items: lines.map((line) => ({
          productId: line.productId,
          quantity: Number(line.quantity),
          unitCost: Number(line.unitCost),
        })),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['purchases'] });
      queryClient.invalidateQueries({ queryKey: ['suppliers'] });
      queryClient.invalidateQueries({ queryKey: ['products'] });
      queryClient.invalidateQueries({ queryKey: ['stocks'] });
      queryClient.invalidateQueries({ queryKey: ['debts'] });
      queryClient.invalidateQueries({ queryKey: ['debts-summary'] });
      queryClient.invalidateQueries({ queryKey: ['cash-registers'] });
      onClose();
    },
  });

  function addLine(product: ProductDto) {
    if (lines.some((l) => l.productId === product.id)) return;
    setLines([
      ...lines,
      {
        productId: product.id,
        productName: product.name,
        quantity: '1',
        unitCost: product.purchasePrice,
      },
    ]);
    setSearch('');
  }

  function setLine(productId: string, patch: Partial<PurchaseLine>) {
    setLines((ls) => ls.map((l) => (l.productId === productId ? { ...l, ...patch } : l)));
  }

  function submit(e: FormEvent) {
    e.preventDefault();
    if (lines.length === 0) return;
    mutation.mutate();
  }

  return (
    <Modal open title={t('newPurchase')} onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <Field label={t('supplier')}>
            <Select required value={supplierId} onChange={(e) => setSupplierId(e.target.value)}>
              <option value="" disabled>
                {t('selectSupplier')}
              </option>
              {suppliers?.map((supplier) => (
                <option key={supplier.id} value={supplier.id}>
                  {supplier.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label={t('branch')}>
            <Select value={branchId || branches?.[0]?.id || ''} onChange={(e) => setBranchId(e.target.value)}>
              {branches?.map((branch) => (
                <option key={branch.id} value={branch.id}>
                  {branch.name}
                </option>
              ))}
            </Select>
          </Field>
        </div>

        <Field label={t('addProduct')}>
          <Input
            placeholder={tc('search')}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </Field>
        {search && products && (
          <div className="max-h-36 space-y-1 overflow-y-auto rounded-lg border border-line p-1">
            {products.items.map((product) => (
              <button
                key={product.id}
                type="button"
                onClick={() => addLine(product)}
                className="flex w-full cursor-pointer items-center justify-between rounded-md p-2 text-start text-sm transition-colors hover:bg-surface-3"
              >
                <span className="text-ink">{product.name}</span>
                <span className="text-xs text-ink-faint">
                  {formatMoney(product.purchasePrice, locale)}
                </span>
              </button>
            ))}
            {products.items.length === 0 && (
              <p className="p-2 text-center text-xs text-ink-faint">{tc('noData')}</p>
            )}
          </div>
        )}

        {lines.length > 0 && (
          <div className="space-y-2">
            {lines.map((line) => (
              <div key={line.productId} className="flex items-center gap-2 rounded-lg bg-surface-3/50 p-2">
                <p className="min-w-0 flex-1 truncate text-sm text-ink">{line.productName}</p>
                <Input
                  type="number"
                  min={1}
                  dir="ltr"
                  aria-label={t('quantity')}
                  value={line.quantity}
                  onChange={(e) => setLine(line.productId, { quantity: e.target.value })}
                  className="w-20"
                />
                <Input
                  type="number"
                  min={0}
                  step="0.01"
                  dir="ltr"
                  aria-label={t('unitCost')}
                  value={line.unitCost}
                  onChange={(e) => setLine(line.productId, { unitCost: e.target.value })}
                  className="w-28"
                />
                <button
                  type="button"
                  onClick={() => setLines((ls) => ls.filter((l) => l.productId !== line.productId))}
                  aria-label={tc('delete')}
                  className="cursor-pointer rounded p-1 text-ink-faint hover:text-red-600"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            ))}
            <p className="text-end text-sm font-bold text-ink">
              {t('total')}: {formatMoney(total, locale)} {tc('currency')}
            </p>
          </div>
        )}

        <div className="grid grid-cols-2 gap-3">
          <Field label={t('paidAmount')} hint={t('paidAmountHint')}>
            <Input
              type="number"
              min={0}
              step="0.01"
              dir="ltr"
              value={paidAmount}
              onChange={(e) => setPaidAmount(e.target.value)}
            />
          </Field>
          <Field label={t('register')}>
            <Select value={registerId} onChange={(e) => setRegisterId(e.target.value)}>
              <option value="">{t('noRegister')}</option>
              {registers?.map((register) => (
                <option key={register.id} value={register.id}>
                  {register.name}
                </option>
              ))}
            </Select>
          </Field>
        </div>

        <Field label={t('invoiceImage')} hint={t('invoiceImageHint')}>
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp,application/pdf"
            onChange={(e) => setInvoiceFile(e.target.files?.[0] ?? null)}
            className="block w-full text-sm text-ink-muted file:me-3 file:rounded-lg file:border-0 file:bg-surface-3 file:px-3 file:py-2 file:text-sm file:font-medium file:text-ink"
          />
        </Field>

        <ErrorText error={uploadError} />
        <ErrorText error={mutation.error} />
        <div className="flex gap-2">
          <Button
            type="submit"
            loading={mutation.isPending || uploading}
            disabled={lines.length === 0 || !supplierId}
          >
            {t('submitPurchase')}
          </Button>
          <Button type="button" variant="ghost" onClick={onClose}>
            {tc('cancel')}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
