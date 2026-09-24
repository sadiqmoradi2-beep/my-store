'use client';

import { useMutation } from '@tanstack/react-query';
import { ArrowDown, ArrowUp, Check } from 'lucide-react';
import { useTranslations } from 'next-intl';
import type { AuthUser, UiAccent, UiDensity, UiFontScale, UiPrefs } from '@my-store/shared';
import { api } from '@/lib/api-client';
import { useAuthStore } from '@/stores/auth-store';
import { Button, Card, ErrorText, cn } from '@/components/ui';

const ACCENT_SWATCHES: { key: UiAccent; color: string }[] = [
  { key: 'shal', color: '#177c62' },
  { key: 'blue', color: '#2563eb' },
  { key: 'violet', color: '#7c3aed' },
  { key: 'rose', color: '#e11d48' },
  { key: 'amber', color: '#d97706' },
];

/** Menu keys the user can reorder — kept in sync with the sidebar's NAV_ITEMS */
const MENU_KEYS = [
  'dashboard',
  'pos',
  'catalog',
  'orders',
  'finance',
  'returns',
  'suppliers',
  'team',
  'workSeasons',
  'reports',
  'activityLog',
  'backups',
  'settings',
];

export default function PersonalizationPage() {
  const t = useTranslations('settings');
  const tn = useTranslations('nav');
  const user = useAuthStore((s) => s.user);
  const setUser = useAuthStore((s) => s.setUser);

  const prefs = user?.uiPrefs ?? {};
  const effectiveOrder = [
    ...(prefs.menuOrder ?? []).filter((k) => MENU_KEYS.includes(k)),
    ...MENU_KEYS.filter((k) => !(prefs.menuOrder ?? []).includes(k)),
  ];

  const save = useMutation({
    mutationFn: (patch: UiPrefs) => api.patch<AuthUser>('/auth/me/prefs', patch),
    onSuccess: setUser,
  });

  const move = (index: number, delta: -1 | 1) => {
    const next = [...effectiveOrder];
    const target = index + delta;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target], next[index]];
    save.mutate({ menuOrder: next });
  };

  const segment = <T extends string>(
    options: readonly T[],
    active: T,
    onPick: (value: T) => void,
    label: (value: T) => string,
  ) => (
    <div className="flex gap-1.5">
      {options.map((option) => (
        <button
          key={option}
          onClick={() => onPick(option)}
          disabled={save.isPending}
          className={cn(
            'cursor-pointer rounded-full px-3.5 py-1.5 text-xs font-semibold transition-colors duration-200',
            option === active
              ? 'bg-primary-700 text-white dark:bg-primary-600'
              : 'border border-line bg-surface-2 text-ink-muted hover:text-ink',
          )}
        >
          {label(option)}
        </button>
      ))}
    </div>
  );

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-black text-ink">{t('title')}</h1>
        <p className="mt-1 text-sm text-ink-muted">{t('hint')}</p>
      </div>

      <ErrorText error={save.error} />

      <Card className="space-y-5 p-5">
        <div>
          <p className="mb-2 text-sm font-semibold text-ink">{t('accent')}</p>
          <div className="flex gap-2.5">
            {ACCENT_SWATCHES.map(({ key, color }) => {
              const active = (prefs.accent ?? 'shal') === key;
              return (
                <button
                  key={key}
                  aria-label={key}
                  onClick={() => save.mutate({ accent: key })}
                  disabled={save.isPending}
                  className={cn(
                    'flex h-9 w-9 cursor-pointer items-center justify-center rounded-full transition-transform duration-200 hover:scale-110',
                    active && 'ring-2 ring-offset-2 ring-offset-surface-2',
                  )}
                  style={{ background: color, ...(active && { boxShadow: `0 0 0 2px ${color}` }) }}
                >
                  {active && <Check className="h-4 w-4 text-white" aria-hidden />}
                </button>
              );
            })}
          </div>
        </div>

        <div>
          <p className="mb-2 text-sm font-semibold text-ink">{t('fontScale')}</p>
          {segment(
            ['sm', 'md', 'lg'] as const,
            (prefs.fontScale ?? 'md') as UiFontScale,
            (v) => save.mutate({ fontScale: v }),
            (v) => t(`fontScales.${v}`),
          )}
        </div>

        <div>
          <p className="mb-2 text-sm font-semibold text-ink">{t('density')}</p>
          {segment(
            ['comfortable', 'compact'] as const,
            (prefs.density ?? 'comfortable') as UiDensity,
            (v) => save.mutate({ density: v }),
            (v) => t(`densities.${v}`),
          )}
        </div>
      </Card>

      <Card className="p-5">
        <p className="mb-1 text-sm font-semibold text-ink">{t('menuOrder')}</p>
        <p className="mb-3 text-xs text-ink-faint">{t('menuOrderHint')}</p>
        <ul className="divide-y divide-line/60">
          {effectiveOrder.map((key, index) => (
            <li key={key} className="flex items-center justify-between gap-3 py-1.5">
              <span className="text-sm text-ink">{tn(key)}</span>
              <span className="flex gap-1">
                <Button
                  variant="ghost"
                  className="min-h-7 px-1.5"
                  disabled={index === 0 || save.isPending}
                  onClick={() => move(index, -1)}
                  aria-label="up"
                >
                  <ArrowUp className="h-3.5 w-3.5" aria-hidden />
                </Button>
                <Button
                  variant="ghost"
                  className="min-h-7 px-1.5"
                  disabled={index === effectiveOrder.length - 1 || save.isPending}
                  onClick={() => move(index, 1)}
                  aria-label="down"
                >
                  <ArrowDown className="h-3.5 w-3.5" aria-hidden />
                </Button>
              </span>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
