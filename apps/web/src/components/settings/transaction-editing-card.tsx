'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { FormEvent, useState } from 'react';
import {
  ROLES,
  TRANSACTION_EDITING_WINDOWS,
  transactionEditingWindowOf,
  type TenantDto,
  type TransactionEditingWindow,
} from '@my-store/shared';
import { api } from '@/lib/api-client';
import { Button, Card, ErrorText, Field, Select } from '@/components/ui';
import { useAuthStore } from '@/stores/auth-store';

/** Store Admin → Settings: how long manual transactions stay correctable (DISABLED by default) */
export function TransactionEditingCard() {
  const t = useTranslations('settings.account');
  const queryClient = useQueryClient();
  const isAdmin = useAuthStore((s) => s.user?.roleKey === ROLES.ADMIN);
  const { data: tenant } = useQuery({
    queryKey: ['tenant-current'],
    queryFn: () => api.get<TenantDto>('/tenants/current'),
    enabled: isAdmin,
  });
  const current = transactionEditingWindowOf(tenant?.settings);
  const [choice, setChoice] = useState<TransactionEditingWindow | null>(null);
  const value = choice ?? current;

  const save = useMutation({
    mutationFn: () => api.patch('/tenants/current/transaction-editing', { window: value }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tenant-current'] });
      setChoice(null);
    },
  });

  if (!isAdmin) return null;

  function submit(e: FormEvent) {
    e.preventDefault();
    save.mutate();
  }

  return (
    <Card className="p-5">
      <p className="mb-1 text-sm font-semibold text-ink">{t('editingSection')}</p>
      <p className="mb-3 text-xs text-ink-faint">{t('editingHint')}</p>
      <p className="mb-3 rounded-lg bg-surface-3 p-2 text-xs text-ink-muted">
        {t('editingCurrent', { window: t(`editingWindows.${current}`) })}
      </p>
      <form onSubmit={submit} className="flex flex-wrap items-end gap-3">
        <Field label={t('editingWindow')}>
          <Select value={value} onChange={(e) => setChoice(e.target.value as TransactionEditingWindow)} className="w-56">
            {TRANSACTION_EDITING_WINDOWS.map((w) => (
              <option key={w} value={w}>
                {t(`editingWindows.${w}`)}
              </option>
            ))}
          </Select>
        </Field>
        <Button type="submit" loading={save.isPending} disabled={value === current}>
          {t('editingSave')}
        </Button>
      </form>
      <ErrorText error={save.error} />
    </Card>
  );
}
