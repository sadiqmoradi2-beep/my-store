'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocale, useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { FormEvent, useEffect, useState } from 'react';
import { PERMISSIONS } from '@my-store/shared';
import type { BranchDto } from '@my-store/shared';
import { api } from '@/lib/api-client';
import { Badge, Button, Card, ErrorText, Field, Input, Spinner } from '@/components/ui';
import { useAuthStore } from '@/stores/auth-store';

export default function BranchesPage() {
  const t = useTranslations('branches');
  const tc = useTranslations('common');
  const locale = useLocale();
  const router = useRouter();
  const queryClient = useQueryClient();
  const user = useAuthStore((s) => s.user);
  const can = (p: string) => !!user?.permissions?.includes(p);
  const allowed = can(PERMISSIONS.BRANCHES_READ);

  useEffect(() => {
    if (user && !allowed) router.replace(`/${locale}/settings`);
  }, [user, allowed, locale, router]);

  const [form, setForm] = useState({ name: '', code: '', address: '', phone: '' });

  const { data, isPending, error } = useQuery({
    queryKey: ['branches'],
    queryFn: () => api.get<BranchDto[]>('/branches'),
    enabled: allowed,
  });

  const refresh = () => {
    for (const key of ['branches', 'cash-registers', 'income-summary']) {
      queryClient.invalidateQueries({ queryKey: [key] });
    }
  };

  const create = useMutation({
    mutationFn: () =>
      api.post('/branches', {
        name: form.name,
        code: form.code.toUpperCase(),
        address: form.address || undefined,
        phone: form.phone || undefined,
      }),
    onSuccess: () => {
      setForm({ name: '', code: '', address: '', phone: '' });
      refresh();
    },
  });

  const remove = useMutation({
    mutationFn: (id: string) => api.delete(`/branches/${id}`),
    onSuccess: refresh,
  });

  if (user && !allowed) {
    return <p className="p-8 text-center text-sm text-ink-faint">{tc('accessDenied')}</p>;
  }

  function submit(e: FormEvent) {
    e.preventDefault();
    create.mutate();
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-black text-ink">{t('title')}</h1>
        <p className="mt-1 text-sm text-ink-muted">{t('hint')}</p>
      </div>

      <ErrorText error={error} />
      <ErrorText error={remove.error} />
      {isPending ? (
        <Spinner />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {data?.map((b) => (
            <Card key={b.id} className="p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate font-bold text-ink">{b.name}</p>
                  <p className="mt-0.5 text-xs text-ink-faint" dir="ltr">
                    {b.code}
                  </p>
                </div>
                {b.isMain && <Badge tone="DELIVERED">{t('main')}</Badge>}
              </div>
              {(b.address || b.phone) && (
                <p className="mt-2 text-xs text-ink-muted">{[b.address, b.phone].filter(Boolean).join(' · ')}</p>
              )}
              <p className="mt-2 text-xs text-ink-faint">{t('warehouses', { count: b.warehouses.length })}</p>
              {!b.isMain && can(PERMISSIONS.BRANCHES_DELETE) && (
                <Button
                  type="button"
                  variant="ghost"
                  className="mt-3 h-8 px-2 text-xs text-red-600 dark:text-red-400"
                  loading={remove.isPending && remove.variables === b.id}
                  onClick={() => {
                    if (window.confirm(t('confirmDelete', { name: b.name }))) remove.mutate(b.id);
                  }}
                >
                  {tc('delete')}
                </Button>
              )}
            </Card>
          ))}
          {data?.length === 0 && <p className="text-sm text-ink-faint">{t('empty')}</p>}
        </div>
      )}

      {can(PERMISSIONS.BRANCHES_CREATE) && (
        <Card className="p-4">
          <h2 className="font-bold text-ink">{t('add')}</h2>
          <p className="mt-1 text-xs text-ink-muted">{t('addHint')}</p>
          <form onSubmit={submit} className="mt-3 grid gap-3 sm:grid-cols-2">
            <Field label={t('name')}>
              <Input required minLength={2} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </Field>
            <Field label={t('code')} hint={t('codeHint')}>
              <Input
                required
                dir="ltr"
                minLength={2}
                maxLength={20}
                pattern="[A-Za-z0-9_\-]+"
                value={form.code}
                onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })}
              />
            </Field>
            <Field label={t('address')}>
              <Input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />
            </Field>
            <Field label={t('phone')}>
              <Input dir="ltr" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
            </Field>
            <div className="sm:col-span-2">
              <ErrorText error={create.error} />
              <Button type="submit" loading={create.isPending}>
                {t('add')}
              </Button>
            </div>
          </form>
        </Card>
      )}
    </div>
  );
}
