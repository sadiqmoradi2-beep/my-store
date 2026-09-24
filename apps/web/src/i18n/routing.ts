import { defineRouting } from 'next-intl/routing';

export const routing = defineRouting({
  locales: ['en'],
  defaultLocale: 'en',
  localePrefix: 'always',
});

export type AppLocale = (typeof routing.locales)[number];

export function dirOf(_locale: string): 'rtl' | 'ltr' {
  return 'ltr';
}
