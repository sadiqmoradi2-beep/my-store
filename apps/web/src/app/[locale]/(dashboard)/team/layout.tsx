'use client';

import { useQuery } from '@tanstack/react-query';
import { PERMISSIONS } from '@my-store/shared';
import { useLocale, useTranslations } from 'next-intl';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { api } from '@/lib/api-client';
import { cn } from '@/components/ui';
import { useAuthStore } from '@/stores/auth-store';

const TAB_KEYS = ['sellers', 'employees', 'partners'] as const;

const TAB_MODULE: Record<(typeof TAB_KEYS)[number], string> = {
  sellers: 'sellers',
  employees: 'employees',
  partners: 'partners',
};

const TAB_PERMISSION: Record<(typeof TAB_KEYS)[number], string> = {
  sellers: PERMISSIONS.SELLERS_READ,
  employees: PERMISSIONS.EMPLOYEES_READ,
  partners: PERMISSIONS.PARTNERS_READ,
};

export default function TeamLayout({ children }: { children: React.ReactNode }) {
  const t = useTranslations('nav');
  const locale = useLocale();
  const pathname = usePathname();
  const user = useAuthStore((s) => s.user);
  const base = `/${locale}/team`;

  const { data: enabledModules } = useQuery({
    queryKey: ['enabled-modules'],
    queryFn: () => api.get<string[]>('/modules/enabled'),
    staleTime: 60_000,
    enabled: !!user,
  });

  const tabs = TAB_KEYS.filter(
    (key) =>
      (!enabledModules || enabledModules.includes(TAB_MODULE[key])) &&
      (!user || user.permissions?.includes(TAB_PERMISSION[key])),
  ).map((key) => {
    const href = `${base}/${key}`;
    return { key, href, active: pathname.startsWith(href) };
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
            {t(tab.key)}
          </Link>
        ))}
      </nav>
      {children}
    </div>
  );
}
