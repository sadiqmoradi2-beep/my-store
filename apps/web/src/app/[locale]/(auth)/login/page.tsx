'use client';

import { useLocale, useTranslations } from 'next-intl';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { FormEvent, Suspense, useState } from 'react';
import type { AuthUser } from '@my-store/shared';
import { api } from '@/lib/api-client';
import { useAuthStore } from '@/stores/auth-store';
import { Button, ErrorText, Field, Input } from '@/components/ui';

type LoginResult = { accessToken: string; user: AuthUser } | { requires2fa: true };

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  );
}

function LoginForm() {
  const t = useTranslations('auth');
  const locale = useLocale();
  const router = useRouter();
  const searchParams = useSearchParams();
  const setAuth = useAuthStore((s) => s.setAuth);
  const justReset = searchParams.get('reset') === '1';

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [totpCode, setTotpCode] = useState('');
  const [needsTotp, setNeedsTotp] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const result = await api.post<LoginResult>('/auth/login', {
        email,
        password,
        ...(totpCode && { totpCode }),
      });
      if ('requires2fa' in result) {
        setNeedsTotp(true);
        setLoading(false);
        return;
      }
      setAuth(result.accessToken, result.user);
      const dest = result.user.roleKey === 'SUPER_ADMIN' ? 'platform-admin' : 'dashboard';
      router.replace(`/${locale}/${dest}`);
    } catch (err) {
      setError(err);
      setLoading(false);
    }
  }

  return (
    <div>
      <h1 className="text-2xl font-black text-ink">{t('loginTitle')}</h1>
      <p className="mt-1 text-sm text-ink-muted">{t('loginSubtitle')}</p>

      {justReset && (
        <p className="mt-4 rounded-lg border border-primary-500/50 bg-primary-50 px-3 py-2 text-sm font-medium text-primary-700 dark:bg-primary-950/30 dark:text-primary-300">
          {t('resetSuccess')}
        </p>
      )}

      <form onSubmit={onSubmit} className="mt-8 space-y-4">
        <Field label={t('email')}>
          <Input
            type="email"
            dir="ltr"
            required
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="admin@demo.af"
            disabled={needsTotp}
          />
        </Field>
        <Field label={t('password')}>
          <Input
            type="password"
            dir="ltr"
            required
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            disabled={needsTotp}
          />
        </Field>
        {!needsTotp && (
          <p className="text-end">
            <Link
              href={`/${locale}/forgot-password`}
              className="text-sm font-medium text-primary-700 hover:underline dark:text-primary-300"
            >
              {t('forgotPasswordLink')}
            </Link>
          </p>
        )}
        {needsTotp && (
          <Field label={t('totpCode')} hint={t('totpHint')}>
            <Input
              dir="ltr"
              required
              autoFocus
              inputMode="numeric"
              maxLength={6}
              autoComplete="one-time-code"
              value={totpCode}
              onChange={(e) => setTotpCode(e.target.value.replace(/\D/g, ''))}
              placeholder="123456"
            />
          </Field>
        )}
        <ErrorText error={error} />
        <Button type="submit" loading={loading} className="w-full">
          {needsTotp ? t('verifyCode') : t('login')}
        </Button>
      </form>

      <p className="mt-6 text-center text-sm text-ink-muted">
        {t('noAccount')}{' '}
        <Link
          href={`/${locale}/register`}
          className="font-semibold text-primary-700 hover:underline dark:text-primary-300"
        >
          {t('registerLink')}
        </Link>
      </p>
    </div>
  );
}
