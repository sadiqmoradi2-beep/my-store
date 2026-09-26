'use client';

import {
  AlertTriangle,
  CalendarRange,
  ChartColumn,
  Contact,
  HandCoins,
  DatabaseBackup,
  History,
  LayoutDashboard,
  MessageSquare,
  Package,
  ScanBarcode,
  Settings,
  Store,
  Truck,
  Undo2,
  Vault,
  X,
} from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { PERMISSIONS } from '@my-store/shared';
import { useLocale, useTranslations } from 'next-intl';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { api } from '@/lib/api-client';
import { cn } from '@/components/ui';
import { useAuthStore } from '@/stores/auth-store';

/** module: the feature-gating module key — without it, the item is always visible */
const NAV_ITEMS = [
  { key: 'dashboard', href: 'dashboard', icon: LayoutDashboard },
  { key: 'alerts', href: 'alerts', icon: AlertTriangle },
  { key: 'pos', href: 'pos', icon: ScanBarcode, module: 'cash-register' },
  { key: 'catalog', href: 'catalog', icon: Package },
  { key: 'income', href: 'income', icon: Vault, module: 'cash-register' },
  { key: 'loans', href: 'loans', icon: HandCoins, module: 'debts' },
  { key: 'returns', href: 'returns', icon: Undo2, module: 'returns' },
  { key: 'suppliers', href: 'suppliers', icon: Truck, module: 'suppliers' },
  { key: 'team', href: 'team', icon: Contact, modules: ['sellers', 'employees', 'partners'] },
  { key: 'workSeasons', href: 'work-seasons', icon: CalendarRange, module: 'work-season' },
  { key: 'reports', href: 'reports', icon: ChartColumn, module: 'reports' },
  {
    key: 'activityLog',
    href: 'sys-log-audit',
    icon: History,
    module: 'activity-log',
    permission: PERMISSIONS.ACTIVITY_READ,
  },
  {
    key: 'backups',
    href: 'backups',
    icon: DatabaseBackup,
    module: 'backups',
    permission: PERMISSIONS.BACKUPS_MANAGE,
  },
  { key: 'settings', href: 'settings', icon: Settings },
  { key: 'feedback', href: 'feedback', icon: MessageSquare },
] as const;

export function Sidebar({ open, onClose }: { open: boolean; onClose: () => void }) {
  const t = useTranslations('nav');
  const locale = useLocale();
  const pathname = usePathname();
  const user = useAuthStore((s) => s.user);

  const { data: enabledModules } = useQuery({
    queryKey: ['enabled-modules'],
    queryFn: () => api.get<string[]>('/modules/enabled'),
    staleTime: 60_000,
    enabled: !!user,
  });
  const menuOrder = user?.uiPrefs?.menuOrder;
  const visibleItems = NAV_ITEMS.filter(
    (item) =>
      (!('module' in item) || !enabledModules || enabledModules.includes(item.module as string)) &&
      (!('modules' in item) ||
        !enabledModules ||
        (item.modules as readonly string[]).some((m) => enabledModules.includes(m))) &&
      (!('permission' in item) || !user || user.permissions?.includes(item.permission as string)),
  ).sort((a, b) => {
    if (!menuOrder?.length) return 0;
    const ia = menuOrder.indexOf(a.key);
    const ib = menuOrder.indexOf(b.key);
    return (ia === -1 ? menuOrder.length : ia) - (ib === -1 ? menuOrder.length : ib);
  });

  return (
    <>
      {open && (
        <button
          aria-label="close menu"
          onClick={onClose}
          className="fixed inset-0 z-30 cursor-pointer bg-black/40 lg:hidden"
        />
      )}
      <aside
        className={cn(
          'fixed inset-y-0 start-0 z-40 flex min-h-0 w-64 flex-col border-e border-line bg-surface-2 transition-transform duration-200 print:hidden lg:static lg:translate-x-0',
          open ? 'translate-x-0' : 'max-lg:ltr:-translate-x-full max-lg:rtl:translate-x-full',
        )}
      >
        <div className="flex items-center justify-between gap-3 border-b border-line p-4">
          <div className="flex items-center gap-2.5">
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary-700 text-accent-300">
              <Store className="h-5 w-5" />
            </span>
            <span className="text-lg font-black tracking-tight text-ink">MY STORE</span>
          </div>
          <button
            onClick={onClose}
            aria-label="close"
            className="cursor-pointer rounded-lg p-1.5 text-ink-faint hover:bg-surface-3 lg:hidden"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <nav className="flex-1 space-y-1 overflow-y-auto p-3">
          {visibleItems.map(({ key, href, icon: Icon }) => {
            const full = `/${locale}/${href}`;
            const active = pathname.startsWith(full);
            return (
              <Link
                key={key}
                href={full}
                onClick={onClose}
                className={cn(
                  'flex min-h-10 items-center gap-3 rounded-lg px-3 text-sm font-medium transition-colors duration-200',
                  active
                    ? 'bg-primary-700 text-white shadow-sm dark:bg-primary-600'
                    : 'text-ink-muted hover:bg-surface-3 hover:text-ink',
                )}
              >
                <Icon className="h-[18px] w-[18px] shrink-0" aria-hidden />
                {t(key)}
              </Link>
            );
          })}
        </nav>

        {user && (
          <div className="border-t border-line p-4">
            <p className="truncate text-sm font-semibold text-ink">{user.fullName}</p>
            <p className="truncate text-xs text-ink-faint" dir="ltr">
              {user.email}
            </p>
            <a
              href="mailto:sadiqmoradi2@gmail.com"
              className="mt-1 block cursor-pointer text-xs text-ink-faint hover:text-ink"
            >
              Contact Us
            </a>
          </div>
        )}
      </aside>
    </>
  );
}
