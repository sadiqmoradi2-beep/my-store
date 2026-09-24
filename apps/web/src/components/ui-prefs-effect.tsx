'use client';

import { useEffect } from 'react';
import { UI_ACCENTS } from '@my-store/shared';
import { useAuthStore } from '@/stores/auth-store';

/** Applies personalization classes (color/font/density) to the <html> element */
export function UiPrefsEffect() {
  const prefs = useAuthStore((s) => s.user?.uiPrefs);

  useEffect(() => {
    const root = document.documentElement;
    for (const accent of UI_ACCENTS) root.classList.remove(`accent-${accent}`);
    root.classList.remove('font-scale-sm', 'font-scale-lg', 'density-compact');

    if (prefs?.accent && prefs.accent !== 'shal') root.classList.add(`accent-${prefs.accent}`);
    if (prefs?.fontScale === 'sm') root.classList.add('font-scale-sm');
    if (prefs?.fontScale === 'lg') root.classList.add('font-scale-lg');
    if (prefs?.density === 'compact') root.classList.add('density-compact');
  }, [prefs]);

  return null;
}
