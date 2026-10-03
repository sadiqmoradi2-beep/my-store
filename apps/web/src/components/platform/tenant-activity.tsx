'use client';

import { useQuery } from '@tanstack/react-query';
import { useLocale, useTranslations } from 'next-intl';
import { useState } from 'react';
import type { Locale, TenantActivityDto } from '@my-store/shared';
import { api } from '@/lib/api-client';
import { formatDateTime, formatNumber } from '@/lib/format';
import { Badge, Button, Card, ErrorText, Input, Spinner, cn } from '@/components/ui';

type Who = 'all' | 'admins' | 'staff';

/** A store's activity log for the platform admin: who did what, filterable by store admins vs other users */
export function TenantActivity({ tenantId }: { tenantId: string }) {
  const t = useTranslations('platformAdmin.activity');
  const tc = useTranslations('common');
  const locale = useLocale() as Locale;
  const [who, setWho] = useState<Who>('all');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);

  const { data, isPending, error } = useQuery({
    queryKey: ['platform-admin', 'tenant-activity', tenantId, who, search, page],
    queryFn: () =>
      api.getPaged<TenantActivityDto[]>(
        `/tenants/${tenantId}/activity?page=${page}&limit=20&who=${who}${search ? `&search=${encodeURIComponent(search)}` : ''}`,
      ),
  });

  return (
    <Card className="space-y-3 p-5">
      <p className="text-sm font-semibold text-ink">{t('title')}</p>
      <div className="flex flex-wrap items-center gap-2">
        {(['all', 'admins', 'staff'] as const).map((key) => (
          <button
            key={key}
            type="button"
            onClick={() => {
              setWho(key);
              setPage(1);
            }}
            className={cn(
              'cursor-pointer rounded-full px-3.5 py-1.5 text-xs font-semibold transition-colors duration-200',
              who === key
                ? 'bg-primary-700 text-white dark:bg-primary-600'
                : 'border border-line bg-surface-2 text-ink-muted hover:text-ink',
            )}
          >
            {t(`who.${key}`)}
          </button>
        ))}
        <Input
          placeholder={t('search')}
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(1);
          }}
          className="max-w-xs"
        />
      </div>

      <ErrorText error={error} />
      {isPending ? (
        <Spinner />
      ) : data?.items.length === 0 ? (
        <p className="p-6 text-center text-sm text-ink-faint">{tc('noData')}</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-sm">
            <thead>
              <tr className="border-b border-line text-xs text-ink-muted">
                <th className="p-2 text-start font-medium">{t('when')}</th>
                <th className="p-2 text-start font-medium">{t('user')}</th>
                <th className="p-2 text-start font-medium">{t('action')}</th>
                <th className="p-2 text-start font-medium">{t('path')}</th>
                <th className="p-2 text-start font-medium">{t('status')}</th>
              </tr>
            </thead>
            <tbody>
              {data?.items.map((row) => (
                <tr key={row.id} className="border-b border-line/60 last:border-0">
                  <td className="p-2 text-xs text-ink-muted">{formatDateTime(row.createdAt, locale)}</td>
                  <td className="p-2">
                    <p className="font-semibold text-ink">{row.userName ?? '—'}</p>
                    {row.userEmail && (
                      <p className="text-xs text-ink-faint" dir="ltr">
                        {row.userEmail}
                      </p>
                    )}
                    {row.roleKey && (
                      <Badge tone={row.roleKey === 'ADMIN' ? 'APPROVED' : 'neutral'}>{row.roleKey}</Badge>
                    )}
                  </td>
                  <td className="p-2">
                    <code dir="ltr" className="rounded bg-surface-3 px-1.5 py-0.5 text-xs text-ink">
                      {row.method} {row.action}
                    </code>
                  </td>
                  <td className="p-2">
                    <span dir="ltr" className="block max-w-64 truncate text-xs text-ink-faint">
                      {row.path}
                    </span>
                  </td>
                  <td className="p-2">
                    <Badge tone={row.statusCode < 400 ? 'DELIVERED' : 'danger'}>{row.statusCode}</Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
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
          <Button variant="outline" disabled={page >= data.meta.totalPages} onClick={() => setPage((p) => p + 1)}>
            {tc('next')}
          </Button>
        </div>
      )}
    </Card>
  );
}
