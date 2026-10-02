'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import type { CategoryDto, ProductDto } from '@my-store/shared';
import { api } from '@/lib/api-client';
import { Button, ErrorText, Field, Input, Select } from '@/components/ui';
import { flattenTree } from '@/components/products/product-form';

const NEW_CATEGORY = '__new__';

/** Create a brand-new product right inside a purchase; the purchase itself then adds its stock */
export function NewProductForm({
  onCreated,
  onCancel,
}: {
  onCreated: (product: ProductDto) => void;
  onCancel: () => void;
}) {
  const t = useTranslations('suppliers');
  const tc = useTranslations('common');
  const queryClient = useQueryClient();
  const [form, setForm] = useState({
    name: '',
    barcode: '',
    categoryId: '',
    newCategory: '',
    purchasePrice: '',
    salePrice: '',
  });
  const set = (patch: Partial<typeof form>) => setForm((f) => ({ ...f, ...patch }));

  const { data: tree } = useQuery({
    queryKey: ['categories'],
    queryFn: () => api.get<CategoryDto[]>('/categories/tree'),
  });
  const categories = flattenTree(tree ?? []);
  // No category yet (e.g. right after a reset) → type a new one
  const categoryChoice = form.categoryId || (categories.length ? categories[0].id : NEW_CATEGORY);

  const mutation = useMutation({
    mutationFn: async () => {
      let categoryId = categoryChoice;
      if (categoryId === NEW_CATEGORY) {
        const slug =
          form.newCategory.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || `category-${Date.now()}`;
        categoryId = (await api.post<CategoryDto>('/categories', { name: form.newCategory, slug })).id;
      }
      return api.post<ProductDto>('/products', {
        name: form.name,
        barcode: form.barcode || undefined,
        categoryId,
        purchasePrice: Number(form.purchasePrice),
        salePrice: Number(form.salePrice),
      });
    },
    onSuccess: (product) => {
      queryClient.invalidateQueries({ queryKey: ['products'] });
      queryClient.invalidateQueries({ queryKey: ['categories'] });
      onCreated(product);
    },
  });

  return (
    <div className="space-y-3 rounded-lg border border-dashed border-primary-400 p-3">
      <p className="text-xs text-ink-muted">{t('newItemHint')}</p>
      <div className="grid grid-cols-2 gap-3">
        <Field label={t('itemName')}>
          <Input value={form.name} onChange={(e) => set({ name: e.target.value })} />
        </Field>
        <Field label={t('barcode')}>
          <Input dir="ltr" value={form.barcode} onChange={(e) => set({ barcode: e.target.value })} />
        </Field>
        <Field label={t('category')}>
          <Select value={categoryChoice} onChange={(e) => set({ categoryId: e.target.value })}>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.label}
              </option>
            ))}
            <option value={NEW_CATEGORY}>{t('newCategory')}</option>
          </Select>
        </Field>
        {categoryChoice === NEW_CATEGORY ? (
          <Field label={t('newCategoryName')}>
            <Input value={form.newCategory} onChange={(e) => set({ newCategory: e.target.value })} />
          </Field>
        ) : (
          <div />
        )}
        <Field label={t('unitCost')}>
          <Input
            type="number"
            min={0}
            step="0.01"
            dir="ltr"
            value={form.purchasePrice}
            onChange={(e) => set({ purchasePrice: e.target.value })}
          />
        </Field>
        <Field label={t('salePrice')}>
          <Input
            type="number"
            min={0}
            step="0.01"
            dir="ltr"
            value={form.salePrice}
            onChange={(e) => set({ salePrice: e.target.value })}
          />
        </Field>
      </div>
      <ErrorText error={mutation.error} />
      <div className="flex gap-2">
        <Button
          type="button"
          loading={mutation.isPending}
          disabled={
            !form.name.trim() ||
            form.purchasePrice === '' ||
            form.salePrice === '' ||
            (categoryChoice === NEW_CATEGORY && !form.newCategory.trim())
          }
          onClick={() => mutation.mutate()}
        >
          {t('createAndAdd')}
        </Button>
        <Button type="button" variant="ghost" onClick={onCancel}>
          {tc('cancel')}
        </Button>
      </div>
    </div>
  );
}
