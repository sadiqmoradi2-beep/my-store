'use client';

import { LogOut, Menu, Moon, Sun } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useTheme } from 'next-themes';
import { useEffect, useState } from 'react';
import { api } from '@/lib/api-client';
import { useAuthStore } from '@/stores/auth-store';
import { NotificationBell } from './notification-bell';

export function Topbar({ onMenu }: { onMenu: () => void }) {
  const t = useTranslations('common');
  const locale = useLocale();
  const router = useRouter();
  const { clear } = useAuthStore();

  async function logout() {
    await api.post('/auth/logout').catch(() => undefined);
    clear();
    router.replace(`/${locale}/login`);
  }

  return (
    <header className="sticky top-0 z-20 flex min-h-14 items-center gap-2 border-b border-line bg-surface/80 px-4 backdrop-blur print:hidden">
      <button
        onClick={onMenu}
        aria-label="menu"
        className="cursor-pointer rounded-lg p-2 text-ink-muted hover:bg-surface-3 lg:hidden"
      >
        <Menu className="h-5 w-5" />
      </button>

      <div className="flex-1" />

      <NotificationBell />

      <ThemeToggle label={t('theme')} />

      <button
        onClick={logout}
        aria-label={t('logout')}
        title={t('logout')}
        className="cursor-pointer rounded-lg p-2 text-ink-muted transition-colors duration-200 hover:bg-red-50 hover:text-red-700 dark:hover:bg-red-950/50 dark:hover:text-red-400"
      >
        <LogOut className="h-[18px] w-[18px] rtl:rotate-180" />
      </button>
    </header>
  );
}

function ThemeToggle({ label }: { label: string }) {
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  return (
    <button
      onClick={() => setTheme(resolvedTheme === 'dark' ? 'light' : 'dark')}
      aria-label={label}
      className="cursor-pointer rounded-lg p-2 text-ink-muted transition-colors duration-200 hover:bg-surface-3 hover:text-ink"
    >
      {mounted && resolvedTheme === 'dark' ? (
        <Sun className="h-[18px] w-[18px]" />
      ) : (
        <Moon className="h-[18px] w-[18px]" />
      )}
    </button>
  );
}
