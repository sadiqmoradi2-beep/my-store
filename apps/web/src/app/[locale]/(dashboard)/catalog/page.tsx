'use client';

import { useLocale } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

export default function CatalogIndexPage() {
  const locale = useLocale();
  const router = useRouter();

  useEffect(() => {
    router.replace(`/${locale}/catalog/products`);
  }, [locale, router]);

  return null;
}
