'use client';

import { PERMISSIONS } from '@my-store/shared';
import { useLocale, useTranslations } from 'next-intl';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/components/ui';
import { useAuthStore } from '@/stores/auth-store';

const TAB_KEYS = ['account', 'personalization', 'modules', 'roles'] as const;

/** Unlike account/personalization, these tabs are gated by a specific permission */
const TAB_PERMISSIONS: Partial<Record<(typeof TAB_KEYS)[number], string>> = {
  modules: PERMISSIONS.MODULES_MANAGE,
  roles: PERMISSIONS.ROLES_READ,
};

export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  const t = useTranslations('settings');
  const locale = useLocale();
  const pathname = usePathname();
  const user = useAuthStore((s) => s.user);
  const base = `/${locale}/settings`;

  const tabs = TAB_KEYS.filter((key) => {
    const required = TAB_PERMISSIONS[key];
    return !required || !user || user.permissions?.includes(required);
  }).map((key) => {
    const href = key === 'account' ? base : `${base}/${key}`;
    const active = key === 'account' ? pathname === base : pathname.startsWith(href);
    return { key, href, active };
  });

  return (
    <div className="space-y-4">
      <nav className="flex gap-1 overflow-x-auto border-b border-line">
        {tabs.map((tab) => (
          <Link
            key={tab.key}
            href={tab.href}
            className={cn(
              'whitespace-nowrap border-b-2 px-3 py-2.5 text-sm font-medium transition-colors duration-200',
              tab.active
                ? 'border-primary-600 text-primary-700 dark:text-primary-300'
                : 'border-transparent text-ink-muted hover:text-ink',
            )}
          >
            {t(`tabs.${tab.key}`)}
          </Link>
        ))}
      </nav>
      {children}
    </div>
  );
}
