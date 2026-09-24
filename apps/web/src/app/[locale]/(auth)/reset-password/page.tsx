'use client';

import { useLocale, useTranslations } from 'next-intl';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { FormEvent, Suspense, useState } from 'react';
import { api } from '@/lib/api-client';
import { Button, ErrorText, Field, Input } from '@/components/ui';

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={null}>
      <ResetPasswordForm />
    </Suspense>
  );
}

function ResetPasswordForm() {
  const t = useTranslations('auth');
  const locale = useLocale();
  const router = useRouter();
  const searchParams = useSearchParams();
  const email = searchParams.get('email');
  const token = searchParams.get('token');

  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [mismatch, setMismatch] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [loading, setLoading] = useState(false);

  if (!email || !token) {
    return (
      <div>
        <h1 className="text-2xl font-black text-ink">{t('resetPasswordTitle')}</h1>
        <p className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/50 dark:text-red-300">
          {t('resetInvalidLink')}
        </p>
        <p className="mt-6 text-center text-sm text-ink-muted">
          <Link
            href={`/${locale}/forgot-password`}
            className="font-semibold text-primary-700 hover:underline dark:text-primary-300"
          >
            {t('forgotPasswordLink')}
          </Link>
        </p>
      </div>
    );
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (newPassword !== confirmPassword) {
      setMismatch(true);
      return;
    }
    setMismatch(false);
    setLoading(true);
    try {
      await api.post('/auth/reset-password', { email, token, newPassword });
      router.replace(`/${locale}/login?reset=1`);
    } catch (err) {
      setError(err);
      setLoading(false);
    }
  }

  return (
    <div>
      <h1 className="text-2xl font-black text-ink">{t('resetPasswordTitle')}</h1>

      <form onSubmit={onSubmit} className="mt-8 space-y-4">
        <Field label={t('newPassword')}>
          <Input
            type="password"
            dir="ltr"
            required
            autoFocus
            autoComplete="new-password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
          />
        </Field>
        <Field label={t('confirmPassword')} error={mismatch ? t('passwordsDontMatch') : undefined}>
          <Input
            type="password"
            dir="ltr"
            required
            autoComplete="new-password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
          />
        </Field>
        <ErrorText error={error} />
        <Button type="submit" loading={loading} className="w-full">
          {t('resetPassword')}
        </Button>
      </form>
    </div>
  );
}
