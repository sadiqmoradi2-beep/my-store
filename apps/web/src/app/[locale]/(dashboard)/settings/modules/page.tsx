'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocale, useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { PERMISSIONS } from '@my-store/shared';
import type { Locale, ModuleStateDto } from '@my-store/shared';
import { api } from '@/lib/api-client';
import { Badge, Card, ErrorText, Spinner, cn } from '@/components/ui';
import { useAuthStore } from '@/stores/auth-store';

export default function ModulesPage() {
  const t = useTranslations('modules');
  const tc = useTranslations('common');
  const locale = useLocale() as Locale;
  const router = useRouter();
  const queryClient = useQueryClient();

  const user = useAuthStore((s) => s.user);
  const allowed = !!user?.permissions?.includes(PERMISSIONS.MODULES_MANAGE);

  useEffect(() => {
    if (user && !allowed) router.replace(`/${locale}/settings`);
  }, [user, allowed, locale, router]);

  const { data, isPending, error } = useQuery({
    queryKey: ['modules'],
    queryFn: () => api.get<ModuleStateDto[]>('/modules'),
    enabled: allowed,
  });

  if (user && !allowed) {
    return <p className="p-8 text-center text-sm text-ink-faint">{tc('accessDenied')}</p>;
  }

  const toggle = useMutation({
    mutationFn: ({ key, enabled }: { key: string; enabled: boolean }) =>
      api.patch<ModuleStateDto[]>(`/modules/${key}`, { enabled }),
    onSuccess: (modules) => {
      queryClient.setQueryData(['modules'], modules);
      queryClient.invalidateQueries({ queryKey: ['enabled-modules'] });
    },
  });

  const nameOf = (m: ModuleStateDto) => m.name;
  const byKey = new Map((data ?? []).map((m) => [m.key, m]));

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-black text-ink">{t('title')}</h1>
        <p className="mt-1 text-sm text-ink-muted">{t('hint')}</p>
      </div>

      <ErrorText error={error} />
      <ErrorText error={toggle.error} />
      {isPending ? (
        <Spinner />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {data?.map((m) => {
            const on = m.enabled;
            return (
              <Card key={m.key} className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-bold text-ink">{nameOf(m)}</p>
                    <p className="mt-0.5 text-xs text-ink-faint" dir="ltr">
                      {t('version')} {m.version}
                    </p>
                  </div>
                  {m.isCore ? (
                    <Badge tone="DELIVERED">{t('core')}</Badge>
                  ) : (
                    <button
                      role="switch"
                      aria-checked={on}
                      disabled={toggle.isPending}
                      onClick={() => toggle.mutate({ key: m.key, enabled: !m.enabled })}
                      className={cn(
                        'relative h-6 w-11 shrink-0 cursor-pointer rounded-full transition-colors duration-200 disabled:cursor-not-allowed',
                        on ? 'bg-primary-600' : 'bg-surface-3 border border-line',
                      )}
                    >
                      <span
                        className={cn(
                          'absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all duration-200',
                          on ? 'ltr:left-[22px] rtl:right-[22px]' : 'ltr:left-0.5 rtl:right-0.5',
                        )}
                      />
                    </button>
                  )}
                </div>

                {m.dependsOn.length > 0 && (
                  <p className="mt-2 text-xs text-ink-faint">
                    {t('dependsOn')}: {m.dependsOn.map((d) => (byKey.get(d) ? nameOf(byKey.get(d)!) : d)).join(', ')}
                  </p>
                )}
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
