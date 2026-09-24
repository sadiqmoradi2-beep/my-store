'use client';

import { useQuery } from '@tanstack/react-query';
import { useLocale, useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { PERMISSIONS } from '@my-store/shared';
import type { ActivityLogDto, Locale } from '@my-store/shared';
import { api } from '@/lib/api-client';
import { formatDate, formatNumber } from '@/lib/format';
import { Badge, Card, ErrorText, Input, Spinner, Button } from '@/components/ui';
import { useAuthStore } from '@/stores/auth-store';

const METHOD_TONES: Record<string, string> = {
  POST: 'APPROVED',
  PATCH: 'PENDING',
  PUT: 'PENDING',
  DELETE: 'danger',
};

export default function ActivityLogPage() {
  const t = useTranslations('activityLog');
  const tc = useTranslations('common');
  const locale = useLocale() as Locale;
  const router = useRouter();
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);

  const user = useAuthStore((s) => s.user);
  const allowed = !!user?.permissions?.includes(PERMISSIONS.ACTIVITY_READ);

  useEffect(() => {
    if (user && !allowed) router.replace(`/${locale}/dashboard`);
  }, [user, allowed, locale, router]);

  const { data, isPending, error } = useQuery({
    queryKey: ['activity-log', page, search],
    queryFn: () =>
      api.getPaged<ActivityLogDto[]>(
        `/sys-log-audit?page=${page}&limit=20${search ? `&search=${encodeURIComponent(search)}` : ''}`,
      ),
    enabled: allowed,
  });

  if (user && !allowed) {
    return <p className="p-8 text-center text-sm text-ink-faint">{tc('accessDenied')}</p>;
  }

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-black text-ink">{t('title')}</h1>

      <Input
        placeholder={t('searchHint')}
        value={search}
        onChange={(e) => {
          setSearch(e.target.value);
          setPage(1);
        }}
        className="max-w-sm"
      />

      <ErrorText error={error} />
      {isPending ? (
        <Spinner />
      ) : (
        <Card className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-sm">
            <thead>
              <tr className="border-b border-line text-xs text-ink-muted">
                <th className="p-3 text-start font-medium">{t('date')}</th>
                <th className="p-3 text-start font-medium">{t('user')}</th>
                <th className="p-3 text-start font-medium">{t('action')}</th>
                <th className="p-3 text-start font-medium">{t('method')}</th>
                <th className="p-3 text-start font-medium">{t('path')}</th>
                <th className="p-3 text-start font-medium">{t('status')}</th>
              </tr>
            </thead>
            <tbody>
              {data?.items.length === 0 && (
                <tr>
                  <td colSpan={6} className="p-8 text-center text-ink-faint">
                    {tc('noData')}
                  </td>
                </tr>
              )}
              {data?.items.map((row) => (
                <tr
                  key={row.id}
                  className="border-b border-line/60 transition-colors last:border-0 hover:bg-surface-3/50"
                >
                  <td className="p-3 text-xs text-ink-muted">{formatDate(row.createdAt, locale)}</td>
                  <td className="p-3 font-semibold text-ink">{row.userName ?? '—'}</td>
                  <td className="p-3">
                    <code dir="ltr" className="rounded bg-surface-3 px-1.5 py-0.5 text-xs text-ink">
                      {row.action}
                    </code>
                  </td>
                  <td className="p-3">
                    <Badge tone={METHOD_TONES[row.method]}>{row.method}</Badge>
                  </td>
                  <td className="p-3">
                    <span dir="ltr" className="block max-w-64 truncate text-xs text-ink-faint">
                      {row.path}
                    </span>
                  </td>
                  <td className="p-3">
                    <Badge tone={row.statusCode < 400 ? 'DELIVERED' : 'danger'}>
                      {formatNumber(row.statusCode, locale)}
                    </Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      {data && data.meta.totalPages > 1 && (
        <div className="flex items-center justify-between">
          <Button variant="outline" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
            {tc('prev')}
          </Button>
          <span className="text-sm text-ink-muted">
            {tc('page', {
              page: formatNumber(data.meta.page, locale),
              total: formatNumber(data.meta.totalPages, locale),
            })}
          </span>
          <Button
            variant="outline"
            disabled={page >= data.meta.totalPages}
            onClick={() => setPage((p) => p + 1)}
          >
            {tc('next')}
          </Button>
        </div>
      )}
    </div>
  );
}
