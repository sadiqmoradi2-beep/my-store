'use client';

import { useLocale } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

export default function FinanceIndexPage() {
  const locale = useLocale();
  const router = useRouter();

  useEffect(() => {
    router.replace(`/${locale}/finance/cash`);
  }, [locale, router]);

  return null;
}
