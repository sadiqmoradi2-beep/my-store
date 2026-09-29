import { useLocale } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { useAuthStore } from '@/stores/auth-store';

/**
 * Blocks a page to users lacking the given permission — redirects away and returns `false`
 * while the redirect is in flight. A page must still early-return on `allowed === false` so
 * its content/queries never mount for a user without this permission (defense against someone
 * reaching the URL directly when the nav link that would normally lead here is hidden).
 */
export function useRequirePermission(permission: string, redirectTo = '/dashboard') {
  const locale = useLocale();
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const allowed = !!user?.permissions?.includes(permission);

  useEffect(() => {
    if (user && !allowed) router.replace(`/${locale}${redirectTo}`);
  }, [user, allowed, locale, redirectTo, router]);

  return allowed;
}
