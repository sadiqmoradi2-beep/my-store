'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Minus, Pencil, Plus, ScanBarcode, Search, Trash2, X } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { FormEvent, useRef, useState } from 'react';
import type { BranchDto, CartDto, Locale, PosSaleResultDto, ProductDto } from '@my-store/shared';
import { api } from '@/lib/api-client';
import { formatMoney, formatNumber } from '@/lib/format';
import { Button, Card, ErrorText, Field, Input, Modal, Select, Spinner, cn, inputClass } from '@/components/ui';
import { useAuthStore } from '@/stores/auth-store';

export default function PosPage() {
  const t = useTranslations('pos');
  const tc = useTranslations('common');
  const locale = useLocale() as Locale;
  const queryClient = useQueryClient();
  const user = useAuthStore((s) => s.user);

  const [branchId, setBranchId] = useState(user?.branchId ?? '');
  const [cartId, setCartId] = useState<string | null>(null);
  const [cashReceived, setCashReceived] = useState('');
  const [result, setResult] = useState<PosSaleResultDto | null>(null);
  const barcodeRef = useRef<HTMLInputElement>(null);

  const { data: branches } = useQuery({
    queryKey: ['branches'],
    queryFn: () => api.get<BranchDto[]>('/branches'),
  });
  const effectiveBranchId = branchId || branches?.[0]?.id || '';

  const { data: cart } = useQuery({
    queryKey: ['pos-cart', cartId],
    queryFn: () => api.get<CartDto>(`/carts/${cartId}`),
    enabled: !!cartId,
  });

  const invalidateCart = () => queryClient.invalidateQueries({ queryKey: ['pos-cart'] });

  const ensureCart = async () => {
    if (cartId) return cartId;
    const created = await api.post<CartDto>('/carts', { branchId: effectiveBranchId });
    setCartId(created.id);
    return created.id;
  };

  const addProduct = useMutation({
    mutationFn: async (productId: string) => {
      const id = await ensureCart();
      return api.post(`/carts/${id}/items`, { productId, quantity: 1 });
    },
    onSuccess: invalidateCart,
  });

  const saleMutation = useMutation({
    mutationFn: () =>
      api.post<PosSaleResultDto>('/pos/sale', {
        cartId,
        cashReceived: cashReceived !== '' ? Number(cashReceived) : undefined,
      }),
    onSuccess: (sale) => {
      setResult(sale);
      setCartId(null);
      setCashReceived('');
      queryClient.invalidateQueries({ queryKey: ['products'] });
      queryClient.invalidateQueries({ queryKey: ['stocks'] });
      queryClient.invalidateQueries({ queryKey: ['orders'] });
      queryClient.invalidateQueries({ queryKey: ['cash-registers'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
    },
  });

  const clearCart = useMutation({
    mutationFn: () => api.delete(`/carts/${cartId}`),
    onSuccess: () => {
      setCartId(null);
      setCashReceived('');
    },
  });

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_380px]">
      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-xl font-black text-ink">{t('title')}</h1>
          {branches && branches.length > 1 && (
            <Select
              value={effectiveBranchId}
              onChange={(e) => setBranchId(e.target.value)}
              disabled={!!cartId}
              className="max-w-48"
            >
              {branches.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </Select>
          )}
        </div>

        <BarcodeInput
          inputRef={barcodeRef}
          onScan={(productId) => addProduct.mutate(productId)}
        />
        <ErrorText error={addProduct.error} />

        <ProductSearch onPick={(p) => addProduct.mutate(p.id)} />
      </div>

      <div className="space-y-4">
        <Card className="p-4">
          <h2 className="mb-3 text-base font-bold text-ink">{t('cart')}</h2>
          {!cart || cart.items.length === 0 ? (
            <p className="py-8 text-center text-sm text-ink-faint">{t('emptyCart')}</p>
          ) : (
            <div className="space-y-2">
              {cart.items.map((item) => (
                <CartRow key={item.id} cartId={cart.id} item={item} onChanged={invalidateCart} />
              ))}
            </div>
          )}

          {cart && cart.items.length > 0 && (
            <>
              <div className="mt-4 space-y-1.5 border-t border-line pt-4 text-sm">
                <SummaryRow label={t('subtotal')} value={formatMoney(cart.subtotal, locale)} />
                <div className="flex items-center justify-between border-t border-line pt-2 text-base font-black text-ink">
                  <span>{t('total')}</span>
                  <span>
                    {formatMoney(cart.total, locale)}{' '}
                    <span className="text-xs font-normal text-ink-faint">{tc('currency')}</span>
                  </span>
                </div>
              </div>

              <div className="mt-4 space-y-3 border-t border-line pt-4">
                <Field label={t('cashReceived')} hint={t('cashReceivedHint')}>
                  <Input
                    type="number"
                    min={0}
                    step="0.01"
                    dir="ltr"
                    value={cashReceived}
                    onChange={(e) => setCashReceived(e.target.value)}
                  />
                </Field>
                {cashReceived !== '' && Number(cashReceived) >= Number(cart.total) && (
                  <p className="text-sm font-bold text-primary-700 dark:text-primary-300">
                    {t('change')}: {formatMoney(Number(cashReceived) - Number(cart.total), locale)}{' '}
                    {tc('currency')}
                  </p>
                )}
                <ErrorText error={saleMutation.error} />
                <ErrorText error={clearCart.error} />
                <div className="flex gap-2">
                  <Button
                    className="flex-1"
                    loading={saleMutation.isPending}
                    onClick={() => saleMutation.mutate()}
                  >
                    {t('completeSale')}
                  </Button>
                  <Button
                    variant="danger"
                    loading={clearCart.isPending}
                    onClick={() => {
                      if (confirm(t('clearConfirm'))) clearCart.mutate();
                    }}
                  >
                    <Trash2 className="h-4 w-4" aria-hidden />
                  </Button>
                </div>
              </div>
            </>
          )}
        </Card>
      </div>

      {result && (
        <SaleResultModal
          result={result}
          onClose={() => {
            setResult(null);
            barcodeRef.current?.focus();
          }}
        />
      )}
    </div>
  );
}

function BarcodeInput({
  inputRef,
  onScan,
}: {
  inputRef: React.RefObject<HTMLInputElement | null>;
  onScan: (productId: string) => void;
}) {
  const t = useTranslations('pos');
  const [code, setCode] = useState('');
  const [notFound, setNotFound] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!code.trim()) return;
    setNotFound(false);
    try {
      const product = await api.get<ProductDto>(`/products/barcode/${encodeURIComponent(code.trim())}`);
      onScan(product.id);
      setCode('');
    } catch {
      setNotFound(true);
    }
  }

  return (
    <form onSubmit={submit}>
      <div className="relative">
        <ScanBarcode
          className="pointer-events-none absolute start-3 top-1/2 h-5 w-5 -translate-y-1/2 text-ink-faint"
          aria-hidden
        />
        <input
          ref={inputRef}
          autoFocus
          dir="ltr"
          placeholder={t('scanPlaceholder')}
          value={code}
          onChange={(e) => {
            setCode(e.target.value);
            setNotFound(false);
          }}
          className={cn(inputClass, 'ps-10 text-base')}
        />
      </div>
      {notFound && <p className="mt-1 text-xs text-red-600 dark:text-red-400">{t('barcodeNotFound')}</p>}
    </form>
  );
}

function ProductSearch({ onPick }: { onPick: (product: ProductDto) => void }) {
  const t = useTranslations('pos');
  const tc = useTranslations('common');
  const locale = useLocale() as Locale;
  const [search, setSearch] = useState('');

  const { data, isFetching } = useQuery({
    queryKey: ['pos-products', search],
    queryFn: () =>
      api.getPaged<ProductDto[]>(`/products?limit=12${search ? `&search=${encodeURIComponent(search)}` : ''}`),
  });

  return (
    <Card className="p-4">
      <div className="relative mb-3">
        <Search
          className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-faint"
          aria-hidden
        />
        <Input
          placeholder={tc('search')}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="ps-9"
        />
      </div>
      {isFetching && !data ? (
        <Spinner className="py-8" />
      ) : (
        <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
          {data?.items.length === 0 && (
            <p className="col-span-full py-6 text-center text-sm text-ink-faint">{tc('noData')}</p>
          )}
          {data?.items.map((product) => (
            <button
              key={product.id}
              onClick={() => onPick(product)}
              disabled={(product.totalStock ?? 0) <= 0}
              className={cn(
                'cursor-pointer rounded-lg border border-line p-3 text-start transition-colors hover:border-primary-400',
                (product.totalStock ?? 0) <= 0 && 'cursor-not-allowed opacity-50',
              )}
            >
              <p className="truncate text-sm font-bold text-ink">{product.name}</p>
              <div className="mt-1 flex items-center justify-between text-xs">
                <span className="text-ink-faint">
                  {t('stock')}: {formatNumber(product.totalStock ?? 0, locale)}
                </span>
                <span className="font-bold text-primary-700 dark:text-primary-300">
                  {formatMoney(product.salePrice, locale)}
                </span>
              </div>
            </button>
          ))}
        </div>
      )}
    </Card>
  );
}

function CartRow({
  cartId,
  item,
  onChanged,
}: {
  cartId: string;
  item: CartDto['items'][number];
  onChanged: () => void;
}) {
  const t = useTranslations('pos');
  const locale = useLocale() as Locale;
  const [editingPrice, setEditingPrice] = useState(false);
  const [priceMode, setPriceMode] = useState<'unit' | 'total'>('unit');
  const [priceInput, setPriceInput] = useState<string | number>(item.unitPrice);

  const updateQty = useMutation({
    mutationFn: (quantity: number) =>
      api.patch(`/carts/${cartId}/items/${item.productId}`, { quantity }),
    onSuccess: onChanged,
  });
  const updatePrice = useMutation({
    mutationFn: (unitPrice: number) =>
      api.patch(`/carts/${cartId}/items/${item.productId}`, { quantity: item.quantity, unitPrice }),
    onSuccess: () => {
      setEditingPrice(false);
      onChanged();
    },
  });
  const removeItem = useMutation({
    mutationFn: () => api.delete(`/carts/${cartId}/items/${item.productId}`),
    onSuccess: onChanged,
  });

  const effectiveUnitPrice =
    priceMode === 'total' ? Number(priceInput) / (item.quantity || 1) : Number(priceInput);
  const isBelowCost = effectiveUnitPrice < Number(item.purchasePrice);

  return (
    <div className="flex items-center gap-2 rounded-lg bg-surface-3/50 p-2">
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-ink">{item.productName}</p>
        {editingPrice ? (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              updatePrice.mutate(Math.round(effectiveUnitPrice * 100) / 100);
            }}
            className="mt-1 space-y-1.5"
          >
            <div className="flex gap-1">
              {(['unit', 'total'] as const).map((mode) => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => {
                    setPriceMode(mode);
                    setPriceInput(mode === 'total' ? Number(item.unitPrice) * item.quantity : item.unitPrice);
                  }}
                  className={cn(
                    'cursor-pointer rounded-full px-2 py-0.5 text-[11px] font-semibold transition-colors duration-200',
                    priceMode === mode
                      ? 'bg-primary-700 text-white dark:bg-primary-600'
                      : 'border border-line bg-surface-2 text-ink-muted hover:text-ink',
                  )}
                >
                  {mode === 'unit' ? t('priceModeUnit') : t('priceModeTotal')}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-1.5">
              <Input
                type="number"
                min={0}
                step="0.01"
                dir="ltr"
                autoFocus
                value={priceInput}
                onChange={(e) => setPriceInput(e.target.value)}
                className="h-7 w-24 px-2 text-xs"
              />
              <Button type="submit" loading={updatePrice.isPending} className="h-7 px-2 text-xs">
                {t('applyManualPrice')}
              </Button>
              <button
                type="button"
                onClick={() => {
                  setEditingPrice(false);
                  setPriceMode('unit');
                  setPriceInput(item.unitPrice);
                }}
                className="cursor-pointer text-xs text-ink-faint hover:text-ink"
              >
                ×
              </button>
            </div>
          </form>
        ) : (
          <button
            type="button"
            onClick={() => {
              setPriceInput(item.unitPrice);
              setEditingPrice(true);
            }}
            className="flex cursor-pointer items-center gap-1 text-xs text-ink-faint hover:text-ink"
          >
            {formatMoney(item.unitPrice, locale)} × {formatNumber(item.quantity, locale)}
            <Pencil className="h-3 w-3" aria-hidden />
          </button>
        )}
        {editingPrice && isBelowCost && (
          <p className="mt-1 text-xs font-semibold text-red-600 dark:text-red-400">
            {t('manualPriceLossWarning', { cost: formatMoney(item.purchasePrice, locale) })}
          </p>
        )}
      </div>
      <div className="flex items-center gap-1">
        <QtyButton
          label="-"
          onClick={() =>
            item.quantity <= 1 ? removeItem.mutate() : updateQty.mutate(item.quantity - 1)
          }
        >
          <Minus className="h-3.5 w-3.5" />
        </QtyButton>
        <span className="w-7 text-center text-sm font-bold text-ink">
          {formatNumber(item.quantity, locale)}
        </span>
        <QtyButton label="+" onClick={() => updateQty.mutate(item.quantity + 1)}>
          <Plus className="h-3.5 w-3.5" />
        </QtyButton>
        <QtyButton label="remove" danger onClick={() => removeItem.mutate()}>
          <X className="h-3.5 w-3.5" />
        </QtyButton>
      </div>
    </div>
  );
}

function QtyButton({
  label,
  danger,
  onClick,
  children,
}: {
  label: string;
  danger?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      aria-label={label}
      className={cn(
        'cursor-pointer rounded-md border border-line p-1.5 text-ink-muted transition-colors',
        danger ? 'hover:border-red-400 hover:text-red-600' : 'hover:border-primary-400 hover:text-primary-700',
      )}
    >
      {children}
    </button>
  );
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between text-ink-muted">
      <span>{label}</span>
      <span>{value}</span>
    </div>
  );
}

function SaleResultModal({ result, onClose }: { result: PosSaleResultDto; onClose: () => void }) {
  const t = useTranslations('pos');
  const tc = useTranslations('common');
  const locale = useLocale() as Locale;

  return (
    <Modal open title={t('saleComplete')} onClose={onClose}>
      <div className="space-y-3 text-sm">
        <SummaryRow
          label={t('orderNumber')}
          value={`#${formatNumber(result.order.orderNumber, locale)}`}
        />
        <SummaryRow
          label={t('total')}
          value={`${formatMoney(result.order.total, locale)} ${tc('currency')}`}
        />
        {Number(result.change) > 0 && (
          <div className="flex items-center justify-between rounded-lg bg-accent-100 p-3 text-base font-black text-accent-700 dark:bg-accent-700/20 dark:text-accent-300">
            <span>{t('change')}</span>
            <span>
              {formatMoney(result.change, locale)} {tc('currency')}
            </span>
          </div>
        )}
        <Button className="w-full" onClick={onClose}>
          {t('newSale')}
        </Button>
      </div>
    </Modal>
  );
}
