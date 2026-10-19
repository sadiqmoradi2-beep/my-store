'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { FormEvent, useMemo, useState } from 'react';
import {
  COMMON_STORE_TIME_ZONES,
  DEFAULT_STORE_TIME_ZONE,
  PERMISSIONS,
  storeClockTime,
  storeTimeZoneOf,
  type AuthUser,
  type TenantDto,
} from '@my-store/shared';
import { api } from '@/lib/api-client';
import { Button, Card, ErrorText, Field, Select } from '@/components/ui';
import { useAuthStore } from '@/stores/auth-store';

/** Store Admin → the store's IANA time zone (decides which calendar day attendance, pay and reports use) */
export function TimeZoneCard() {
  const t = useTranslations('settings.account');
  const queryClient = useQueryClient();
  const user = useAuthStore((s) => s.user);
  const setUser = useAuthStore((s) => s.setUser);
  const canEdit = !!user?.permissions?.includes(PERMISSIONS.TENANTS_UPDATE);
  const { data: tenant } = useQuery({
    queryKey: ['tenant-current'],
    queryFn: () => api.get<TenantDto>('/tenants/current'),
    enabled: canEdit,
  });
  const current = storeTimeZoneOf(tenant?.settings);
  const chosenExplicitly = !!(tenant?.settings as { timeZone?: string } | undefined)?.timeZone;
  const [choice, setChoice] = useState<string | null>(null);
  const value = choice ?? current;

  const all = useMemo(() => {
    const supported = (Intl as unknown as { supportedValuesOf?: (k: string) => string[] }).supportedValuesOf?.('timeZone') ?? [];
    return supported.filter((z) => !(COMMON_STORE_TIME_ZONES as readonly string[]).includes(z));
  }, []);

  const save = useMutation({
    mutationFn: () => api.patch('/tenants/current/time-zone', { timeZone: value }),
    onSuccess: async () => {
      queryClient.invalidateQueries({ queryKey: ['tenant-current'] });
      setUser(await api.get<AuthUser>('/auth/me'));
      setChoice(null);
    },
  });

  if (!canEdit) return null;

  function submit(e: FormEvent) {
    e.preventDefault();
    save.mutate();
  }

  return (
    <Card className="p-5">
      <p className="mb-1 text-sm font-semibold text-ink">{t('timeZoneSection')}</p>
      <p className="mb-3 text-xs text-ink-faint">{t('timeZoneHint')}</p>
      {!chosenExplicitly && tenant && (
        <p className="mb-3 rounded-lg bg-surface-3 p-2 text-xs text-ink-muted">
          {t('timeZoneDefault', { zone: DEFAULT_STORE_TIME_ZONE })}
        </p>
      )}
      <form onSubmit={submit} className="flex flex-wrap items-end gap-3">
        <Field label={t('timeZone')}>
          <Select value={value} onChange={(e) => setChoice(e.target.value)} className="w-72">
            <optgroup label={t('timeZoneCommon')}>
              {COMMON_STORE_TIME_ZONES.map((z) => (
                <option key={z} value={z}>
                  {z}
                </option>
              ))}
            </optgroup>
            <optgroup label={t('timeZoneAll')}>
              {all.map((z) => (
                <option key={z} value={z}>
                  {z}
                </option>
              ))}
            </optgroup>
          </Select>
        </Field>
        <Button type="submit" loading={save.isPending} disabled={value === current && chosenExplicitly}>
          {t('timeZoneSave')}
        </Button>
        <span className="pb-2 text-xs text-ink-faint">{t('timeZoneNow', { time: storeClockTime(new Date(), value) })}</span>
      </form>
      <ErrorText error={save.error} />
    </Card>
  );
}
