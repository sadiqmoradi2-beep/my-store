'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { FormEvent, useState } from 'react';
import {
  RESET_SCOPES,
  RESET_SCOPE_DESCRIPTIONS,
  RESET_SCOPE_NAMES,
  type AuthUser,
  type ResetScope,
  type TenantDto,
} from '@my-store/shared';
import { api } from '@/lib/api-client';
import { useAuthStore } from '@/stores/auth-store';
import { Button, Card, ErrorText, Field, Input, Select } from '@/components/ui';
import { TwoFactorCard } from '@/components/two-factor-card';

export default function AccountSettingsPage() {
  const t = useTranslations('settings.account');
  const user = useAuthStore((s) => s.user);
  const setUser = useAuthStore((s) => s.setUser);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-black text-ink">{t('title')}</h1>
        <p className="mt-1 text-sm text-ink-muted">{t('hint')}</p>
      </div>

      <ChangeEmailCard currentEmail={user?.email ?? ''} onSuccess={setUser} />
      <ChangePasswordCard />
      <TwoFactorCard />
      <ActivityLogRetentionCard />
      <WipeDataCard />
    </div>
  );
}

function ActivityLogRetentionCard() {
  const t = useTranslations('settings.account');
  const queryClient = useQueryClient();
  const [days, setDays] = useState('');
  const [saved, setSaved] = useState(false);
  const [cleanupBeforeDate, setCleanupBeforeDate] = useState('');

  const { data: tenant } = useQuery({
    queryKey: ['tenant-current'],
    queryFn: () => api.get<TenantDto>('/tenants/current'),
  });
  const currentRetentionDays = tenant?.settings?.activityLogRetentionDays;

  const save = useMutation({
    mutationFn: () =>
      api.patch('/tenants/current', {
        settings: { activityLogRetentionDays: days === '' ? null : Number(days) },
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tenant-current'] });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    },
  });

  const cleanupByDays = useMutation({
    mutationFn: () => api.delete<{ deleted: number }>(`/sys-log-audit/cleanup?olderThanDays=${Number(days)}`),
  });
  const cleanupByDate = useMutation({
    mutationFn: () => api.delete<{ deleted: number }>(`/sys-log-audit/cleanup?before=${cleanupBeforeDate}`),
  });

  return (
    <Card className="p-5">
      <p className="mb-1 text-sm font-semibold text-ink">{t('retentionSection')}</p>
      <p className="mb-3 text-xs text-ink-faint">{t('retentionHint')}</p>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          save.mutate();
        }}
        className="flex flex-wrap items-end gap-3"
      >
        <Field label={t('retentionDays')}>
          <Input
            type="number"
            min={0}
            dir="ltr"
            placeholder={
              currentRetentionDays != null ? String(currentRetentionDays) : t('retentionDaysUnset')
            }
            value={days}
            onChange={(e) => setDays(e.target.value)}
            className="w-32"
          />
        </Field>
        <Button type="submit" loading={save.isPending}>
          {t('retentionSave')}
        </Button>
        {saved && <span className="text-xs font-semibold text-primary-700 dark:text-primary-300">{t('retentionSaved')}</span>}
      </form>
      <ErrorText error={save.error} />

      <div className="mt-4 flex flex-wrap items-end gap-3 border-t border-line pt-4">
        <Button
          type="button"
          variant="outline"
          disabled={!days}
          loading={cleanupByDays.isPending}
          onClick={() => cleanupByDays.mutate()}
        >
          {t('retentionCleanupByDays')}
        </Button>
        <Field label={t('retentionCleanupBeforeDate')}>
          <Input
            type="date"
            dir="ltr"
            value={cleanupBeforeDate}
            onChange={(e) => setCleanupBeforeDate(e.target.value)}
            className="w-40"
          />
        </Field>
        <Button
          type="button"
          variant="outline"
          disabled={!cleanupBeforeDate}
          loading={cleanupByDate.isPending}
          onClick={() => cleanupByDate.mutate()}
        >
          {t('retentionCleanupNow')}
        </Button>
      </div>
      <ErrorText error={cleanupByDays.error ?? cleanupByDate.error} />
      {(cleanupByDays.isSuccess || cleanupByDate.isSuccess) && (
        <p className="mt-2 text-xs font-semibold text-primary-700 dark:text-primary-300">
          {t('retentionCleanupDone', {
            count: (cleanupByDays.data ?? cleanupByDate.data)?.deleted ?? 0,
          })}
        </p>
      )}
    </Card>
  );
}

function WipeDataCard() {
  const t = useTranslations('settings.account');
  const [scope, setScope] = useState<ResetScope>('ALL');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [done, setDone] = useState(false);
  const confirmWord = 'DELETE ALL';

  const wipe = useMutation({
    mutationFn: () => api.post('/tenants/current/wipe-data', { password, confirm, scope }),
    onSuccess: () => {
      setDone(true);
      setPassword('');
      setConfirm('');
    },
  });

  function submit(e: FormEvent) {
    e.preventDefault();
    setDone(false);
    wipe.mutate();
  }

  return (
    <Card className="border-red-300 p-5 dark:border-red-800">
      <p className="mb-1 text-sm font-semibold text-red-700 dark:text-red-400">{t('wipeSection')}</p>
      <p className="mb-3 text-xs text-ink-faint">{t('wipeHint')}</p>
      <form onSubmit={submit} className="max-w-md space-y-3">
        <Field label={t('wipeScope')}>
          <Select
            value={scope}
            onChange={(e) => {
              setScope(e.target.value as ResetScope);
              setConfirm('');
            }}
          >
            {RESET_SCOPES.map((s) => (
              <option key={s} value={s}>
                {RESET_SCOPE_NAMES[s]}
              </option>
            ))}
          </Select>
        </Field>
        <p className="rounded-lg bg-red-50 p-2.5 text-xs text-red-800 dark:bg-red-900/20 dark:text-red-300">
          {RESET_SCOPE_DESCRIPTIONS[scope]}
        </p>
        <Field label={t('currentPassword')}>
          <Input
            type="password"
            dir="ltr"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </Field>
        <Field label={t('wipeConfirmLabel', { word: confirmWord })}>
          <Input required value={confirm} onChange={(e) => setConfirm(e.target.value)} />
        </Field>
        <ErrorText error={wipe.error} />
        {done && (
          <p className="text-sm font-medium text-primary-700 dark:text-primary-300">{t('wipeDone')}</p>
        )}
        <Button
          type="submit"
          variant="danger"
          loading={wipe.isPending}
          disabled={confirm !== confirmWord}
        >
          {t('wipeSubmit')}
        </Button>
      </form>
    </Card>
  );
}

function ChangeEmailCard({ currentEmail, onSuccess }: { currentEmail: string; onSuccess: (user: AuthUser) => void }) {
  const t = useTranslations('settings.account');
  const [newEmail, setNewEmail] = useState('');
  const [currentPassword, setCurrentPassword] = useState('');
  const [done, setDone] = useState(false);

  const change = useMutation({
    mutationFn: () => api.patch<AuthUser>('/auth/me/email', { newEmail, currentPassword }),
    onSuccess: (user) => {
      onSuccess(user);
      setCurrentPassword('');
      setDone(true);
    },
  });

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    setDone(false);
    change.mutate();
  }

  return (
    <Card className="p-5">
      <p className="mb-3 text-sm font-semibold text-ink">{t('emailSection')}</p>
      <form onSubmit={onSubmit} className="max-w-sm space-y-3">
        <Field label={t('currentEmail')}>
          <Input dir="ltr" value={currentEmail} disabled />
        </Field>
        <Field label={t('newEmail')}>
          <Input
            type="email"
            dir="ltr"
            required
            value={newEmail}
            onChange={(e) => setNewEmail(e.target.value)}
          />
        </Field>
        <Field label={t('currentPassword')}>
          <Input
            type="password"
            dir="ltr"
            required
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
          />
        </Field>
        <ErrorText error={change.error} />
        {done && <p className="text-sm font-medium text-primary-700 dark:text-primary-300">{t('emailChanged')}</p>}
        <Button type="submit" loading={change.isPending}>
          {t('changeEmail')}
        </Button>
      </form>
    </Card>
  );
}

function ChangePasswordCard() {
  const t = useTranslations('settings.account');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [mismatch, setMismatch] = useState(false);
  const [done, setDone] = useState(false);

  const change = useMutation({
    mutationFn: () => api.patch('/auth/me/password', { currentPassword, newPassword }),
    onSuccess: () => {
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setDone(true);
    },
  });

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    setDone(false);
    if (newPassword !== confirmPassword) {
      setMismatch(true);
      return;
    }
    setMismatch(false);
    change.mutate();
  }

  return (
    <Card className="p-5">
      <p className="mb-3 text-sm font-semibold text-ink">{t('passwordSection')}</p>
      <form onSubmit={onSubmit} className="max-w-sm space-y-3">
        <Field label={t('currentPassword')}>
          <Input
            type="password"
            dir="ltr"
            required
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
          />
        </Field>
        <Field label={t('newPassword')}>
          <Input
            type="password"
            dir="ltr"
            required
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
          />
        </Field>
        <Field label={t('confirmPassword')} error={mismatch ? t('passwordsDontMatch') : undefined}>
          <Input
            type="password"
            dir="ltr"
            required
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
          />
        </Field>
        <ErrorText error={change.error} />
        {done && <p className="text-sm font-medium text-primary-700 dark:text-primary-300">{t('passwordChanged')}</p>}
        <Button type="submit" loading={change.isPending}>
          {t('changePassword')}
        </Button>
      </form>
    </Card>
  );
}
