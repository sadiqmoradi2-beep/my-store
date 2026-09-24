'use client';

import { useLocale, useTranslations } from 'next-intl';
import Link from 'next/link';
import { FormEvent, useState } from 'react';
import { api } from '@/lib/api-client';
import { Button, ErrorText, Field, Input } from '@/components/ui';

export default function ForgotPasswordPage() {
  const t = useTranslations('auth');
  const locale = useLocale();
  const [email, setEmail] = useState('');
  const [error, setError] = useState<unknown>(null);
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await api.post('/auth/forgot-password', { email });
      setSent(true);
    } catch (err) {
      setError(err);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <h1 className="text-2xl font-black text-ink">{t('forgotPasswordTitle')}</h1>
      <p className="mt-1 text-sm text-ink-muted">{t('forgotPasswordHint')}</p>

      {sent ? (
        <p className="mt-8 rounded-lg border border-primary-500/50 bg-primary-50 px-3 py-2 text-sm font-medium text-primary-700 dark:bg-primary-950/30 dark:text-primary-300">
          {t('resetLinkSentGeneric')}
        </p>
      ) : (
        <form onSubmit={onSubmit} className="mt-8 space-y-4">
          <Field label={t('email')}>
            <Input
              type="email"
              dir="ltr"
              required
              autoComplete="email"
              autoFocus
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </Field>
          <ErrorText error={error} />
          <Button type="submit" loading={loading} className="w-full">
            {t('sendResetLink')}
          </Button>
        </form>
      )}

      <p className="mt-6 text-center text-sm text-ink-muted">
        <Link
          href={`/${locale}/login`}
          className="font-semibold text-primary-700 hover:underline dark:text-primary-300"
        >
          {t('backToLogin')}
        </Link>
      </p>
    </div>
  );
}
