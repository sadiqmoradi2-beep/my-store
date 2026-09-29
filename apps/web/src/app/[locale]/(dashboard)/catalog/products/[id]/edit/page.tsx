'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocale, useTranslations } from 'next-intl';
import { useParams, useRouter } from 'next/navigation';
import { PERMISSIONS } from '@my-store/shared';
import type { Locale, PriceHistoryDto, ProductDto } from '@my-store/shared';
import { api } from '@/lib/api-client';
import { formatDate, formatMoney } from '@/lib/format';
import { ProductForm, ProductFormValues } from '@/components/products/product-form';
import { BackLink, Badge, Card, ErrorText, Spinner } from '@/components/ui';
import { useRequirePermission } from '@/hooks/use-require-permission';

export default function EditProductPage() {
  const t = useTranslations('products');
  const tc = useTranslations('common');
  const locale = useLocale() as Locale;
  const router = useRouter();
  const queryClient = useQueryClient();
  const { id } = useParams<{ id: string }>();
  const allowed = useRequirePermission(PERMISSIONS.PRODUCTS_UPDATE);

  const { data: product, isPending, error } = useQuery({
    queryKey: ['product', id],
    queryFn: () => api.get<ProductDto>(`/products/${id}`),
    enabled: allowed,
  });

  const { data: history } = useQuery({
    queryKey: ['price-history', id],
    queryFn: () => api.get<PriceHistoryDto[]>(`/products/${id}/price-history`),
    enabled: allowed,
  });

  const mutation = useMutation({
    mutationFn: (values: ProductFormValues) => api.patch(`/products/${id}`, values),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['products'] });
      queryClient.invalidateQueries({ queryKey: ['product', id] });
      queryClient.invalidateQueries({ queryKey: ['price-history', id] });
      router.push(`/${locale}/catalog/products`);
    },
  });

  if (!allowed) {
    return <p className="p-8 text-center text-sm text-ink-faint">{tc('accessDenied')}</p>;
  }
  if (isPending) return <Spinner />;
  if (error) return <ErrorText error={error} />;
  if (!product) return null;

  return (
    <div className="space-y-4">
      <BackLink href={`/${locale}/catalog/products`} label={t('backToList')} />
      <h1 className="text-xl font-black text-ink">
        {tc('edit')}: {product.name}
      </h1>

      <div className="grid gap-4 xl:grid-cols-[3fr_2fr]">
        <Card className="p-5">
          <ProductForm
            initial={product}
            onSubmit={(v) => mutation.mutate(v)}
            submitting={mutation.isPending}
            error={mutation.error}
          />
        </Card>

        <Card className="h-fit p-5">
          <h2 className="mb-4 text-sm font-bold text-ink">{t('priceHistory')}</h2>
          {!history?.length ? (
            <p className="text-sm text-ink-faint">{tc('noData')}</p>
          ) : (
            <ul className="space-y-3">
              {history.map((row) => (
                <li key={row.id} className="flex flex-wrap items-center gap-2 border-b border-line/60 pb-3 text-sm last:border-0">
                  <Badge tone="neutral">{t(`types.${row.priceType}`)}</Badge>
                  <span className="text-ink-faint line-through" dir="ltr">
                    {row.oldPrice ? formatMoney(row.oldPrice, locale) : '—'}
                  </span>
                  <span className="font-bold text-primary-700 dark:text-primary-300" dir="ltr">
                    {formatMoney(row.newPrice, locale)}
                  </span>
                  <span className="ms-auto text-xs text-ink-muted">
                    {row.changedByName} · {formatDate(row.createdAt, locale)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}
