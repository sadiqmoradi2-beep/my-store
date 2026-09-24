import type { Metadata } from 'next';
import { NextIntlClientProvider, hasLocale } from 'next-intl';
import { setRequestLocale } from 'next-intl/server';
import { ThemeProvider } from 'next-themes';
import { Vazirmatn } from 'next/font/google';
import { notFound } from 'next/navigation';
import { dirOf, routing } from '@/i18n/routing';
import { QueryProvider } from '@/providers/query-provider';
import '../globals.css';

const vazirmatn = Vazirmatn({
  subsets: ['arabic', 'latin'],
  variable: '--font-vazirmatn',
});

export const metadata: Metadata = {
  title: 'MY STORE — Sales Management Platform',
  description: 'MY STORE — Enterprise SaaS Sales Management Platform',
};

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export default async function LocaleLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  setRequestLocale(locale);

  return (
    <html lang={locale} dir={dirOf(locale)} className={vazirmatn.variable} suppressHydrationWarning>
      <body className="antialiased">
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
          <NextIntlClientProvider>
            <QueryProvider>{children}</QueryProvider>
          </NextIntlClientProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
