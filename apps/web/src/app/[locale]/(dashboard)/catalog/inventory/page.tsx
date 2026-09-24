'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeftRight,
  Banknote,
  ClipboardList,
  Minus,
  PackagePlus,
  Plus,
  SlidersHorizontal,
  Warehouse,
} from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import Link from 'next/link';
import { FormEvent, useEffect, useState } from 'react';
import type { BranchDto, CategoryDto, Locale, ProductDto, StockDto, SupplierDto } from '@my-store/shared';
import { api } from '@/lib/api-client';
import { formatNumber } from '@/lib/format';
import { Badge, Button, Card, ErrorText, Field, Input, Modal, Select, Spinner } from '@/components/ui';
import { ExportButtons } from '@/components/export-buttons';
import { flattenTree } from '@/components/products/product-form';

type ModalKind = 'in' | 'out' | 'pay' | 'adjust' | 'transfer' | null;

export default function InventoryPage() {
  const t = useTranslations('inventory');
  const tc = useTranslations('common');
  const locale = useLocale() as Locale;

  const [warehouseId, setWarehouseId] = useState('');
  const [modal, setModal] = useState<ModalKind>(null);
  const [rowContext, setRowContext] = useState<{ productId: string; warehouseId: string } | null>(null);
  const [createWarehouseOpen, setCreateWarehouseOpen] = useState(false);

  function openForRow(kind: ModalKind, productId: string, stockWarehouseId: string) {
    setRowContext({ productId, warehouseId: stockWarehouseId });
    setModal(kind);
  }

  const { data: branches } = useQuery({
    queryKey: ['branches'],
    queryFn: () => api.get<BranchDto[]>('/branches'),
  });
  const warehouses = (branches ?? []).flatMap((b) =>
    b.warehouses.map((w) => ({ ...w, label: `${b.name} — ${w.name}` })),
  );

  const { data: stocks, isPending, error } = useQuery({
    queryKey: ['stocks', warehouseId],
    queryFn: () =>
      api.get<StockDto[]>(`/inventory/stocks${warehouseId ? `?warehouseId=${warehouseId}` : ''}`),
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-black text-ink">{t('title')}</h1>
        <div className="flex flex-wrap gap-2">
          <ExportButtons path="/exports/stock" />
          <Link href={`/${locale}/catalog/inventory/purchase-report`}>
            <Button variant="outline">
              <ClipboardList className="h-4 w-4" aria-hidden />
              {t('purchaseReport')}
            </Button>
          </Link>
          <Button
            onClick={() => {
              setRowContext(null);
              setModal('in');
            }}
          >
            <PackagePlus className="h-4 w-4" aria-hidden />
            {t('stockIn')}
          </Button>
          <Button
            variant="outline"
            onClick={() => {
              setRowContext(null);
              setModal('out');
            }}
          >
            <Minus className="h-4 w-4" aria-hidden />
            {t('stockOut')}
          </Button>
          <Button
            variant="outline"
            onClick={() => {
              setRowContext(null);
              setModal('adjust');
            }}
          >
            <SlidersHorizontal className="h-4 w-4" aria-hidden />
            {t('adjust')}
          </Button>
          <Button
            variant="outline"
            onClick={() => {
              setRowContext(null);
              setModal('transfer');
            }}>
            <ArrowLeftRight className="h-4 w-4" aria-hidden />
            {t('transfer')}
          </Button>
          <Button variant="outline" onClick={() => setCreateWarehouseOpen(true)}>
            <Warehouse className="h-4 w-4" aria-hidden />
            {t('newWarehouse')}
          </Button>
        </div>
      </div>

      <Select
        value={warehouseId}
        onChange={(e) => setWarehouseId(e.target.value)}
        className="max-w-sm"
        aria-label={t('warehouse')}
      >
        <option value="">{t('allWarehouses')}</option>
        {warehouses.map((w) => (
          <option key={w.id} value={w.id}>
            {w.label}
          </option>
        ))}
      </Select>

      <ErrorText error={error} />
      {isPending ? (
        <Spinner />
      ) : (
        <Card className="overflow-x-auto">
          <table className="w-full min-w-[560px] text-sm">
            <thead>
              <tr className="border-b border-line text-xs text-ink-muted">
                <th className="p-3 text-start font-medium">{t('product')}</th>
                <th className="p-3 text-start font-medium">SKU</th>
                <th className="p-3 text-start font-medium">{t('warehouse')}</th>
                <th className="p-3 text-start font-medium">{t('quantity')}</th>
                <th className="p-3 text-start font-medium">{tc('actions')}</th>
              </tr>
            </thead>
            <tbody>
              {stocks?.length === 0 && (
                <tr>
                  <td colSpan={5} className="p-8 text-center text-ink-faint">
                    {tc('noData')}
                  </td>
                </tr>
              )}
              {stocks?.map((stock) => {
                const low = stock.minStockLevel > 0 && stock.quantity <= stock.minStockLevel;
                return (
                  <tr
                    key={stock.id}
                    className="border-b border-line/60 transition-colors last:border-0 hover:bg-surface-3/50"
                  >
                    <td className="p-3 font-medium text-ink">{stock.productName}</td>
                    <td className="p-3">
                      <span dir="ltr" className="font-mono text-xs text-ink-muted">
                        {stock.productSku}
                      </span>
                    </td>
                    <td className="p-3 text-ink-muted">{stock.warehouseName}</td>
                    <td className="p-3">
                      <span className="me-2 font-bold text-ink">
                        {formatNumber(stock.quantity, locale)}
                      </span>
                      {low && <Badge tone="danger">{t('lowStockBadge')}</Badge>}
                    </td>
                    <td className="p-3">
                      <div className="flex gap-1">
                        <button
                          onClick={() => openForRow('in', stock.productId, stock.warehouseId)}
                          aria-label={t('stockIn')}
                          title={t('stockIn')}
                          className="cursor-pointer rounded-lg p-1.5 text-ink-muted transition-colors hover:bg-primary-100 hover:text-primary-800 dark:hover:bg-primary-800/40"
                        >
                          <Plus className="h-4 w-4" aria-hidden />
                        </button>
                        <button
                          onClick={() => openForRow('out', stock.productId, stock.warehouseId)}
                          aria-label={t('stockOut')}
                          title={t('stockOut')}
                          className="cursor-pointer rounded-lg p-1.5 text-ink-muted transition-colors hover:bg-red-100 hover:text-red-700 dark:hover:bg-red-900/30"
                        >
                          <Minus className="h-4 w-4" aria-hidden />
                        </button>
                        <button
                          onClick={() => {
                            setRowContext({ productId: stock.productId, warehouseId: stock.warehouseId });
                            setModal('pay');
                          }}
                          aria-label={t('recordPurchasePayment')}
                          title={t('recordPurchasePayment')}
                          className="cursor-pointer rounded-lg p-1.5 text-ink-muted transition-colors hover:bg-accent-100 hover:text-accent-700 dark:hover:bg-accent-800/40"
                        >
                          <Banknote className="h-4 w-4" aria-hidden />
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

      <InventoryModal
        kind={modal}
        warehouses={warehouses}
        initialProductId={rowContext?.productId}
        initialWarehouseId={rowContext?.warehouseId}
        onClose={() => {
          setModal(null);
          setRowContext(null);
        }}
      />
      {createWarehouseOpen && (
        <CreateWarehouseModal branches={branches ?? []} onClose={() => setCreateWarehouseOpen(false)} />
      )}
    </div>
  );
}

function CreateWarehouseModal({
  branches,
  onClose,
}: {
  branches: BranchDto[];
  onClose: () => void;
}) {
  const t = useTranslations('inventory');
  const tc = useTranslations('common');
  const queryClient = useQueryClient();
  const [branchId, setBranchId] = useState('');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [ownerName, setOwnerName] = useState('');

  const mutation = useMutation({
    mutationFn: () =>
      api.post(`/branches/${branchId}/warehouses`, {
        name,
        phone: phone || undefined,
        ownerName: ownerName || undefined,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['branches'] });
      onClose();
    },
  });

  function submit(e: FormEvent) {
    e.preventDefault();
    mutation.mutate();
  }

  return (
    <Modal open title={t('newWarehouse')} onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        <Field label={t('branch')}>
          <Select required value={branchId} onChange={(e) => setBranchId(e.target.value)}>
            <option value="" disabled>
              {t('warehouse')}
            </option>
            {branches.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label={t('warehouseName')}>
          <Input required value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field label={t('warehousePhone')}>
          <Input dir="ltr" value={phone} onChange={(e) => setPhone(e.target.value)} />
        </Field>
        <Field label={t('warehouseOwner')}>
          <Input value={ownerName} onChange={(e) => setOwnerName(e.target.value)} />
        </Field>
        <ErrorText error={mutation.error} />
        <div className="flex gap-2">
          <Button type="submit" loading={mutation.isPending}>
            {tc('create')}
          </Button>
          <Button type="button" variant="ghost" onClick={onClose}>
            {tc('cancel')}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

function InventoryModal({
  kind,
  warehouses,
  initialProductId,
  initialWarehouseId,
  onClose,
}: {
  kind: ModalKind;
  warehouses: { id: string; branchId: string; label: string }[];
  initialProductId?: string;
  initialWarehouseId?: string;
  onClose: () => void;
}) {
  const t = useTranslations('inventory');
  const tp = useTranslations('products');
  const ts = useTranslations('suppliers');
  const tc = useTranslations('common');
  const queryClient = useQueryClient();

  const isInLike = kind === 'in' || kind === 'pay';
  const [newProductMode, setNewProductMode] = useState(false);

  const { data: products } = useQuery({
    queryKey: ['products-all'],
    queryFn: () => api.getPaged<ProductDto[]>('/products?limit=100').then((r) => r.items),
    enabled: kind !== null && !newProductMode,
  });

  const { data: suppliers } = useQuery({
    queryKey: ['suppliers'],
    queryFn: () => api.get<SupplierDto[]>('/suppliers'),
    enabled: isInLike,
  });

  const { data: categoryTree } = useQuery({
    queryKey: ['categories'],
    queryFn: () => api.get<CategoryDto[]>('/categories/tree'),
    enabled: isInLike && newProductMode,
  });
  const categories = flattenTree(categoryTree ?? []);

  const [form, setForm] = useState({
    productId: '',
    warehouseId: '',
    toWarehouseId: '',
    quantity: '1',
    reason: '',
    supplierId: '',
    unitCost: '',
  });
  const [newProduct, setNewProduct] = useState({
    name: '',
    sku: '',
    categoryId: '',
    salePrice: '',
    purchasePrice: '',
  });
  const setNewProductField =
    (key: keyof typeof newProduct) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
      setNewProduct((p) => ({ ...p, [key]: e.target.value }));
  const set =
    (key: keyof typeof form) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
      setForm((f) => ({ ...f, [key]: e.target.value }));

  const [invoiceFile, setInvoiceFile] = useState<File | null>(null);

  // Reset the form on each open, pre-filling product/warehouse when opened from a specific stock row
  useEffect(() => {
    if (!kind) return;
    setNewProductMode(false);
    setInvoiceFile(null);
    setForm({
      productId: initialProductId ?? '',
      warehouseId: initialWarehouseId ?? '',
      toWarehouseId: '',
      quantity: '1',
      reason: '',
      supplierId: '',
      unitCost: '',
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kind, initialProductId, initialWarehouseId]);

  // Default the unit purchase price from the product's current purchase price — editable, since the purchase price may differ each time
  useEffect(() => {
    if (!isInLike || newProductMode) return;
    const product = products?.find((p) => p.id === form.productId);
    if (product) setForm((f) => ({ ...f, unitCost: String(product.purchasePrice) }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.productId]);

  async function uploadInvoiceIfAny(): Promise<string | undefined> {
    if (!invoiceFile) return undefined;
    const body = new FormData();
    body.append('file', invoiceFile);
    const res = await api.upload<{ url: string }>('/uploads/purchase-invoices', body);
    return res.url;
  }

  const mutation = useMutation({
    mutationFn: async () => {
      if (isInLike && newProductMode) {
        const branchId = warehouses.find((w) => w.id === form.warehouseId)?.branchId;
        const invoiceImageUrl = await uploadInvoiceIfAny();
        return api.post('/products', {
          name: newProduct.name,
          sku: newProduct.sku,
          categoryId: newProduct.categoryId,
          salePrice: Number(newProduct.salePrice),
          purchasePrice: Number(newProduct.purchasePrice),
          currency: 'USDT',
          supplierId: form.supplierId,
          branchId,
          initialQuantity: Number(form.quantity),
          invoiceImageUrl,
        });
      }
      const base = {
        productId: form.productId,
        quantity: Number(form.quantity),
        reason: form.reason || undefined,
      };
      if (kind === 'transfer') {
        return api.post('/inventory/transfer', {
          ...base,
          fromWarehouseId: form.warehouseId,
          toWarehouseId: form.toWarehouseId,
        });
      }
      if (kind === 'adjust') {
        return api.post('/inventory/adjust', {
          productId: form.productId,
          warehouseId: form.warehouseId,
          newQuantity: Number(form.quantity),
          reason: form.reason || undefined,
        });
      }
      if (kind === 'out') {
        return api.post('/inventory/out', { ...base, warehouseId: form.warehouseId });
      }
      if (form.supplierId) {
        const branchId = warehouses.find((w) => w.id === form.warehouseId)?.branchId;
        const invoiceImageUrl = await uploadInvoiceIfAny();
        return api.post('/suppliers/purchases', {
          supplierId: form.supplierId,
          branchId,
          invoiceImageUrl,
          items: [
            {
              productId: form.productId,
              quantity: Number(form.quantity),
              unitCost: Number(form.unitCost),
            },
          ],
          notes: form.reason || undefined,
        });
      }
      return api.post('/inventory/in', { ...base, warehouseId: form.warehouseId });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['stocks'] });
      queryClient.invalidateQueries({ queryKey: ['products'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      if (form.supplierId) {
        queryClient.invalidateQueries({ queryKey: ['purchases'] });
        queryClient.invalidateQueries({ queryKey: ['suppliers'] });
        queryClient.invalidateQueries({ queryKey: ['debts'] });
        queryClient.invalidateQueries({ queryKey: ['debts-summary'] });
        queryClient.invalidateQueries({ queryKey: ['cash-registers'] });
      }
      onClose();
    },
  });

  const titles: Record<Exclude<ModalKind, null>, string> = {
    in: t('stockIn'),
    out: t('stockOut'),
    pay: t('recordPurchasePayment'),
    adjust: t('adjust'),
    transfer: t('transfer'),
  };

  function submit(e: FormEvent) {
    e.preventDefault();
    mutation.mutate();
  }

  if (!kind) return null;
  return (
    <Modal open title={titles[kind]} onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        {kind === 'in' && (
          <div className="flex gap-2">
            <Button
              type="button"
              variant={newProductMode ? 'outline' : 'primary'}
              onClick={() => setNewProductMode(false)}
            >
              {t('existingProduct')}
            </Button>
            <Button
              type="button"
              variant={newProductMode ? 'primary' : 'outline'}
              onClick={() => setNewProductMode(true)}
            >
              {t('newProduct')}
            </Button>
          </div>
        )}
        {kind === 'in' && newProductMode ? (
          <>
            <p className="text-xs text-ink-muted">{t('newProductHint')}</p>
            <Field label={tp('name')}>
              <Input required value={newProduct.name} onChange={setNewProductField('name')} />
            </Field>
            <Field label={tp('sku')}>
              <Input required dir="ltr" value={newProduct.sku} onChange={setNewProductField('sku')} />
            </Field>
            <Field label={tp('category')}>
              <Select required value={newProduct.categoryId} onChange={setNewProductField('categoryId')}>
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
            <div className="grid grid-cols-2 gap-4">
              <Field label={tp('purchasePrice')}>
                <Input
                  required
                  type="number"
                  min={0}
                  step="0.01"
                  dir="ltr"
                  value={newProduct.purchasePrice}
                  onChange={setNewProductField('purchasePrice')}
                />
              </Field>
              <Field label={tp('salePrice')}>
                <Input
                  required
                  type="number"
                  min={0}
                  step="0.01"
                  dir="ltr"
                  value={newProduct.salePrice}
                  onChange={setNewProductField('salePrice')}
                />
              </Field>
            </div>
          </>
        ) : (
          <Field label={t('product')}>
            <Select required value={form.productId} onChange={set('productId')}>
              <option value="" disabled>
                {tc('search')}
              </option>
              {products?.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} ({p.sku})
                </option>
              ))}
            </Select>
          </Field>
        )}
        <Field label={kind === 'transfer' ? t('fromWarehouse') : t('warehouse')}>
          <Select required value={form.warehouseId} onChange={set('warehouseId')}>
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
        {kind === 'transfer' && (
          <Field label={t('toWarehouse')}>
            <Select required value={form.toWarehouseId} onChange={set('toWarehouseId')}>
              <option value="" disabled>
                {t('warehouse')}
              </option>
              {warehouses
                .filter((w) => w.id !== form.warehouseId)
                .map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.label}
                  </option>
                ))}
            </Select>
          </Field>
        )}
        <Field label={kind === 'adjust' ? t('newQuantity') : t('quantity')}>
          <Input
            required
            type="number"
            min={kind === 'adjust' ? 0 : 1}
            dir="ltr"
            value={form.quantity}
            onChange={set('quantity')}
          />
        </Field>
        {isInLike && (
          <Field
            label={newProductMode || kind === 'pay' ? tp('supplier') : t('supplierOptional')}
            hint={newProductMode || kind === 'pay' ? undefined : t('supplierHint')}
          >
            <Select
              required={newProductMode || kind === 'pay'}
              value={form.supplierId}
              onChange={set('supplierId')}
            >
              <option value="">{t('supplier')}</option>
              {suppliers?.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </Select>
          </Field>
        )}
        {isInLike && !newProductMode && form.supplierId && (
          <Field label={ts('unitCost')}>
            <Input
              required
              type="number"
              min={0}
              step="0.01"
              dir="ltr"
              value={form.unitCost}
              onChange={set('unitCost')}
            />
          </Field>
        )}
        {isInLike && form.supplierId && (
          <Field label={ts('invoiceImage')} hint={ts('invoiceImageHint')}>
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              onChange={(e) => setInvoiceFile(e.target.files?.[0] ?? null)}
              className="block w-full text-sm text-ink-muted file:me-3 file:rounded-lg file:border-0 file:bg-surface-3 file:px-3 file:py-2 file:text-sm file:font-medium file:text-ink"
            />
          </Field>
        )}
        {!(kind === 'in' && newProductMode) && (
          <Field label={t('reason')}>
            <Input value={form.reason} onChange={set('reason')} />
          </Field>
        )}
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
