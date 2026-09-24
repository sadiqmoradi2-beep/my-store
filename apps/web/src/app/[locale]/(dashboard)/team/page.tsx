'use client';

import { useLocale } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

export default function TeamIndexPage() {
  const locale = useLocale();
  const router = useRouter();

  useEffect(() => {
    router.replace(`/${locale}/team/employees`);
  }, [locale, router]);

  return null;
}
