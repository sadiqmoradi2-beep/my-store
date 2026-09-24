'use client';

import { useQuery } from '@tanstack/react-query';
import { useLocale, useTranslations } from 'next-intl';
import Link from 'next/link';
import { useState } from 'react';
import type { Locale, TenantListItemDto } from '@my-store/shared';
import { api } from '@/lib/api-client';
import { formatDate } from '@/lib/format';
import { Badge, Button, Card, ErrorText, Input, Spinner } from '@/components/ui';

const STATUS_TONES: Record<string, string> = {
  ACTIVE: 'DELIVERED',
  TRIAL: 'PENDING',
  PAST_DUE: 'danger',
  CANCELLED: 'danger',
  EXPIRED: 'danger',
};

export default function PlatformTenantsPage() {
  const t = useTranslations('platformAdmin');
  const tc = useTranslations('common');
  const locale = useLocale() as Locale;
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);

  const { data, isPending, error } = useQuery({
    queryKey: ['platform-admin', 'tenants', page, search],
    queryFn: () =>
      api.getPaged<TenantListItemDto[]>(
        `/tenants?page=${page}&limit=20${search ? `&search=${encodeURIComponent(search)}` : ''}`,
      ),
  });

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-black text-ink">{t('tenantsTitle')}</h1>
        <p className="mt-1 text-sm text-ink-muted">{t('tenantsHint')}</p>
      </div>

      <Input
        placeholder={t('searchPlaceholder')}
        value={search}
        onChange={(e) => {
          setSearch(e.target.value);
          setPage(1);
        }}
        className="max-w-sm"
      />

      <ErrorText error={error} />
      {isPending || !data ? (
        <Spinner />
      ) : data.items.length === 0 ? (
        <Card className="p-8 text-center text-sm text-ink-muted">{t('noTenants')}</Card>
      ) : (
        <div className="space-y-3">
          {data.items.map((tenant) => (
            <Link key={tenant.id} href={`/${locale}/platform-admin/tenants/${tenant.id}`} className="block">
              <Card className="flex flex-wrap items-center justify-between gap-4 p-4 transition-colors hover:border-primary-400">
                <div>
                  <p className="font-bold text-ink">{tenant.name}</p>
                  <p className="mt-0.5 text-xs text-ink-faint" dir="ltr">
                    {tenant.slug}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Badge tone={tenant.isActive ? 'DELIVERED' : 'danger'}>
                    {tenant.isActive ? tc('active') : tc('inactive')}
                  </Badge>
                  {tenant.plan && (
                    <Badge>{tenant.plan.name}</Badge>
                  )}
                  {tenant.subscriptionStatus && (
                    <Badge tone={STATUS_TONES[tenant.subscriptionStatus]}>
                      {tenant.subscriptionStatus}
                    </Badge>
                  )}
                  {tenant.endsAt && (
                    <span className="text-xs text-ink-faint">{formatDate(tenant.endsAt, locale)}</span>
                  )}
                </div>
              </Card>
            </Link>
          ))}
        </div>
      )}

      {data && data.meta.totalPages > 1 && (
        <div className="flex items-center justify-between">
          <Button variant="outline" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
            {tc('prev')}
          </Button>
          <span className="text-sm text-ink-muted">
            {tc('page', { page: data.meta.page, total: data.meta.totalPages })}
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
