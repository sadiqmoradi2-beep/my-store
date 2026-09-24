'use client';

import { LogOut, ShieldCheck } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { api, tryRefresh } from '@/lib/api-client';
import { useAuthStore } from '@/stores/auth-store';
import { Spinner, cn } from '@/components/ui';

export default function PlatformAdminLayout({ children }: { children: React.ReactNode }) {
  const t = useTranslations('platformAdmin');
  const tCommon = useTranslations('common');
  const locale = useLocale();
  const router = useRouter();
  const pathname = usePathname();
  const { accessToken, user, bootstrapped, setBootstrapped, clear } = useAuthStore();

  const base = `/${locale}/platform-admin`;
  const tabs = [
    { key: 'pending', href: base, label: t('tabPending'), active: pathname === base },
    { key: 'tenants', href: `${base}/tenants`, label: t('tabTenants'), active: pathname.startsWith(`${base}/tenants`) },
    { key: 'licenses', href: `${base}/licenses`, label: t('tabLicenses'), active: pathname.startsWith(`${base}/licenses`) },
    { key: 'feedback', href: `${base}/feedback`, label: t('tabFeedback'), active: pathname.startsWith(`${base}/feedback`) },
  ];

  useEffect(() => {
    if (accessToken) return;
    tryRefresh().then((ok) => {
      if (!ok) {
        setBootstrapped();
        router.replace(`/${locale}/login`);
      }
    });
  }, [accessToken, locale, router, setBootstrapped]);

  useEffect(() => {
    if (user && user.roleKey !== 'SUPER_ADMIN') router.replace(`/${locale}/dashboard`);
  }, [user, locale, router]);

  async function logout() {
    await api.post('/auth/logout').catch(() => undefined);
    clear();
    router.replace(`/${locale}/login`);
  }

  if (!accessToken || user?.roleKey !== 'SUPER_ADMIN') {
    return bootstrapped && accessToken ? null : <Spinner className="min-h-dvh" />;
  }

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="sticky top-0 z-20 flex min-h-14 items-center justify-between gap-3 border-b border-line bg-surface/80 px-4 backdrop-blur">
        <div className="flex items-center gap-2.5">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary-700 text-accent-300">
            <ShieldCheck className="h-4 w-4" />
          </span>
          <span className="text-base font-black tracking-tight text-ink">{t('title')}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="hidden text-sm font-medium text-ink-muted sm:block">{user.fullName}</span>
          <button
            onClick={logout}
            aria-label={tCommon('logout')}
            title={tCommon('logout')}
            className="cursor-pointer rounded-lg p-2 text-ink-muted transition-colors duration-200 hover:bg-red-50 hover:text-red-700 dark:hover:bg-red-950/50 dark:hover:text-red-400"
          >
            <LogOut className="h-[18px] w-[18px] rtl:rotate-180" />
          </button>
        </div>
      </header>
      <nav className="flex gap-1 border-b border-line bg-surface px-4">
        {tabs.map((tab) => (
          <Link
            key={tab.key}
            href={tab.href}
            className={cn(
              'border-b-2 px-3 py-2.5 text-sm font-medium transition-colors duration-200',
              tab.active
                ? 'border-primary-600 text-primary-700 dark:text-primary-300'
                : 'border-transparent text-ink-muted hover:text-ink',
            )}
          >
            {tab.label}
          </Link>
        ))}
      </nav>
      <main className="mx-auto w-full max-w-5xl flex-1 p-4 lg:p-6">{children}</main>
    </div>
  );
}
