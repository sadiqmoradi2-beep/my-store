'use client';

import { useLocale, useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { tryRefresh } from '@/lib/api-client';
import { useAuthStore } from '@/stores/auth-store';
import { Sidebar } from '@/components/layout/sidebar';
import { Topbar } from '@/components/layout/topbar';
import { UiPrefsEffect } from '@/components/ui-prefs-effect';
import { Spinner } from '@/components/ui';

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const locale = useLocale();
  const router = useRouter();
  const { accessToken, user, bootstrapped, setBootstrapped } = useAuthStore();
  const [menuOpen, setMenuOpen] = useState(false);
  const t = useTranslations('common');

  useEffect(() => {
    if (accessToken) return;
    tryRefresh().then((ok) => {
      if (!ok) {
        setBootstrapped();
        router.replace(`/${locale}/login`);
      }
    });
  }, [accessToken, locale, router, setBootstrapped]);

  // The platform admin has no store — the tenant admin panel isn't useful for them
  useEffect(() => {
    if (user?.roleKey === 'SUPER_ADMIN') router.replace(`/${locale}/platform-admin`);
  }, [user, locale, router]);

  if (!accessToken) {
    return bootstrapped ? null : <Spinner className="min-h-dvh" />;
  }

  return (
    <div className="flex h-dvh overflow-hidden">
      <UiPrefsEffect />
      <Sidebar open={menuOpen} onClose={() => setMenuOpen(false)} />
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <Topbar onMenu={() => setMenuOpen(true)} />
        {user?.planStopped && (
          <p role="alert" className="bg-red-600 px-4 py-2 text-center text-sm font-semibold text-white">
            {t('planStoppedBanner')}
          </p>
        )}
        <main className="mx-auto w-full max-w-6xl flex-1 overflow-y-auto p-4 lg:p-6">{children}</main>
      </div>
    </div>
  );
}
