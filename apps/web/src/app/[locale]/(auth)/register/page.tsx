'use client';

import { useLocale, useTranslations } from 'next-intl';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { FormEvent, useState } from 'react';
import type { AuthUser } from '@my-store/shared';
import { api } from '@/lib/api-client';
import { useAuthStore } from '@/stores/auth-store';
import { Button, ErrorText, Field, Input } from '@/components/ui';

export default function RegisterPage() {
  const t = useTranslations('auth');
  const locale = useLocale();
  const router = useRouter();
  const setAuth = useAuthStore((s) => s.setAuth);

  const [form, setForm] = useState({
    storeName: '',
    slug: '',
    fullName: '',
    email: '',
    password: '',
    phone: '',
    licenseKey: '',
  });
  const [error, setError] = useState<unknown>(null);
  const [loading, setLoading] = useState(false);

  const set = (key: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [key]: e.target.value }));

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const result = await api.post<{ accessToken: string; user: AuthUser }>(
        '/auth/register-tenant',
        { ...form, phone: form.phone || undefined },
      );
      setAuth(result.accessToken, result.user);
      router.replace(`/${locale}/dashboard`);
    } catch (err) {
      setError(err);
      setLoading(false);
    }
  }

  return (
    <div>
      <h1 className="text-2xl font-black text-ink">{t('registerTitle')}</h1>
      <p className="mt-1 text-sm text-ink-muted">{t('registerSubtitle')}</p>

      <form onSubmit={onSubmit} className="mt-8 space-y-4">
        <Field label={t('licenseKey')} hint={t('licenseKeyHint')}>
          <Input
            required
            dir="ltr"
            value={form.licenseKey}
            onChange={set('licenseKey')}
            placeholder="MYST-XXXX-XXXX-XXXX"
            className="uppercase"
          />
        </Field>
        <Field label={t('storeName')}>
          <Input required minLength={2} value={form.storeName} onChange={set('storeName')} />
        </Field>
        <Field label={t('slug')} hint={t('slugHint')}>
          <Input
            required
            dir="ltr"
            pattern="[a-z0-9-]+"
            minLength={3}
            value={form.slug}
            onChange={set('slug')}
            placeholder="my-store"
          />
        </Field>
        <Field label={t('fullName')}>
          <Input required minLength={2} value={form.fullName} onChange={set('fullName')} />
        </Field>
        <Field label={t('email')}>
          <Input type="email" dir="ltr" required value={form.email} onChange={set('email')} />
        </Field>
        <Field label={t('password')}>
          <Input
            type="password"
            dir="ltr"
            required
            minLength={8}
            value={form.password}
            onChange={set('password')}
          />
        </Field>
        <Field label={t('phone')}>
          <Input dir="ltr" value={form.phone} onChange={set('phone')} />
        </Field>
        <ErrorText error={error} />
        <Button type="submit" loading={loading} className="w-full">
          {t('register')}
        </Button>
      </form>

      <p className="mt-6 text-center text-sm text-ink-muted">
        {t('haveAccount')}{' '}
        <Link
          href={`/${locale}/login`}
          className="font-semibold text-primary-700 hover:underline dark:text-primary-300"
        >
          {t('loginLink')}
        </Link>
      </p>
    </div>
  );
}
