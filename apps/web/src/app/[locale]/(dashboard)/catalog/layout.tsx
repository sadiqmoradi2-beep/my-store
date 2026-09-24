'use client';

import { useLocale, useTranslations } from 'next-intl';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/components/ui';

const TAB_KEYS = ['products', 'inventory', 'categories'] as const;

/** All three are core modules — always enabled — so no module gating is needed here */
export default function CatalogLayout({ children }: { children: React.ReactNode }) {
  const t = useTranslations('nav');
  const locale = useLocale();
  const pathname = usePathname();
  const base = `/${locale}/catalog`;

  const tabs = TAB_KEYS.map((key) => {
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
