'use client';

import { useQuery } from '@tanstack/react-query';
import { Printer } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useState } from 'react';
import type { Locale, ProductDto } from '@my-store/shared';
import { api } from '@/lib/api-client';
import { code128Rects } from '@/lib/code128';
import { formatMoney } from '@/lib/format';
import { BackLink, Button, Card, ErrorText, Input, Spinner } from '@/components/ui';

function Barcode({ value }: { value: string }) {
  const encoded = code128Rects(value);
  if (!encoded) return <p className="text-[9px] text-ink-faint">—</p>;
  return (
    <svg
      viewBox={`0 0 ${encoded.totalModules} 32`}
      preserveAspectRatio="none"
      className="h-9 w-full"
      role="img"
      aria-label={value}
    >
      {encoded.rects.map((r, i) => (
        <rect key={i} x={r.x} y={0} width={r.width} height={32} fill="#000" />
      ))}
    </svg>
  );
}

export default function LabelsPage() {
  const t = useTranslations('labels');
  const tc = useTranslations('common');
  const locale = useLocale() as Locale;

  const [search, setSearch] = useState('');
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [showPrice, setShowPrice] = useState(true);

  const { data, isPending, error } = useQuery({
    queryKey: ['products-labels', search],
    queryFn: () =>
      api.getPaged<ProductDto[]>(
        `/products?page=1&limit=50${search ? `&search=${encodeURIComponent(search)}` : ''}`,
      ),
  });

  const setQty = (id: string, qty: number) =>
    setQuantities((q) => {
      const next = { ...q };
      if (qty <= 0) delete next[id];
      else next[id] = Math.min(qty, 99);
      return next;
    });

  const selected = (data?.items ?? []).filter((p) => quantities[p.id]);
  const labels = selected.flatMap((p) => Array.from({ length: quantities[p.id] }, () => p));

  return (
    <div className="space-y-4">
      <div className="print:hidden">
        <BackLink href={`/${locale}/catalog/products`} label={t('backToList')} />
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3 print:hidden">
        <div>
          <h1 className="text-xl font-black text-ink">{t('title')}</h1>
          <p className="mt-1 text-sm text-ink-muted">{t('hint')}</p>
        </div>
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-1.5 text-sm text-ink-muted">
            <input
              type="checkbox"
              checked={showPrice}
              onChange={(e) => setShowPrice(e.target.checked)}
              className="h-4 w-4"
            />
            {t('showPrice')}
          </label>
          <Button disabled={labels.length === 0} onClick={() => window.print()}>
            <Printer className="h-4 w-4" aria-hidden />
            {t('print', { count: labels.length })}
          </Button>
        </div>
      </div>

      <Input
        placeholder={tc('search')}
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="max-w-sm print:hidden"
      />

      <ErrorText error={error} />
      {isPending ? (
        <Spinner />
      ) : (
        <Card className="overflow-x-auto print:hidden">
          <table className="w-full min-w-[560px] text-sm">
            <thead>
              <tr className="border-b border-line text-xs text-ink-muted">
                <th className="p-3 text-start font-medium">{t('product')}</th>
                <th className="p-3 text-start font-medium">SKU</th>
                <th className="p-3 text-start font-medium">{t('barcode')}</th>
                <th className="p-3 text-start font-medium">{t('count')}</th>
              </tr>
            </thead>
            <tbody>
              {data?.items.map((p) => (
                <tr key={p.id} className="border-b border-line/60 last:border-0">
                  <td className="p-3 font-semibold text-ink">{p.name}</td>
                  <td className="p-3 text-xs text-ink-muted" dir="ltr">
                    {p.sku}
                  </td>
                  <td className="p-3 text-xs text-ink-faint" dir="ltr">
                    {p.barcode ?? '—'}
                  </td>
                  <td className="p-3">
                    <Input
                      type="number"
                      min={0}
                      max={99}
                      value={quantities[p.id] ?? 0}
                      onChange={(e) => setQty(p.id, Number(e.target.value))}
                      className="w-20"
                      dir="ltr"
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      {labels.length > 0 && (
        <div>
          <p className="mb-2 text-sm font-semibold text-ink print:hidden">{t('preview')}</p>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 print:grid-cols-4 print:gap-[3mm]">
            {labels.map((p, i) => (
              <div
                key={`${p.id}-${i}`}
                className="break-inside-avoid rounded-lg border border-line bg-white p-2.5 text-center text-black print:rounded-none print:border-black/40"
              >
                <p className="truncate text-[11px] font-bold leading-tight">{p.name}</p>
                {showPrice && (
                  <p className="text-[11px] font-black">
                    {formatMoney(p.salePrice, locale)} {tc('currency')}
                  </p>
                )}
                <Barcode value={p.barcode ?? p.sku} />
                <p className="text-[9px] tracking-wide" dir="ltr">
                  {p.barcode ?? p.sku}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
