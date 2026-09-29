'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useLocale, useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { PERMISSIONS } from '@my-store/shared';
import { api } from '@/lib/api-client';
import { ProductForm, ProductFormValues } from '@/components/products/product-form';
import { BackLink, Card } from '@/components/ui';
import { useRequirePermission } from '@/hooks/use-require-permission';

export default function NewProductPage() {
  const t = useTranslations('products');
  const tc = useTranslations('common');
  const locale = useLocale();
  const router = useRouter();
  const queryClient = useQueryClient();
  const allowed = useRequirePermission(PERMISSIONS.PRODUCTS_CREATE);

  const mutation = useMutation({
    mutationFn: (values: ProductFormValues) => api.post('/products', values),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['products'] });
      router.push(`/${locale}/catalog/products`);
    },
  });

  if (!allowed) {
    return <p className="p-8 text-center text-sm text-ink-faint">{tc('accessDenied')}</p>;
  }

  return (
    <div className="space-y-4">
      <BackLink href={`/${locale}/catalog/products`} label={t('backToList')} />
      <h1 className="text-xl font-black text-ink">{t('new')}</h1>
      <Card className="p-5">
        <ProductForm
          onSubmit={(v) => mutation.mutate(v)}
          submitting={mutation.isPending}
          error={mutation.error}
        />
      </Card>
    </div>
  );
}
