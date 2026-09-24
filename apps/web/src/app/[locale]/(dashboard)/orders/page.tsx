'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocale, useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import {
  ORDER_STATUSES,
  ORDER_TRANSITIONS,
  type Locale,
  type OrderDto,
  type OrderStatus,
} from '@my-store/shared';
import { api } from '@/lib/api-client';
import { formatDate, formatMoney, formatNumber } from '@/lib/format';
import { Badge, Button, Card, ErrorText, Spinner, cn } from '@/components/ui';
import { ExportButtons } from '@/components/export-buttons';

export default function OrdersPage() {
  const t = useTranslations('orders');
  const tc = useTranslations('common');
  const locale = useLocale() as Locale;
  const queryClient = useQueryClient();

  const [status, setStatus] = useState<OrderStatus | ''>('');
  const [page, setPage] = useState(1);

  // Preselect the status filter from the URL query (e.g., from clickable dashboard tiles)
  useEffect(() => {
    const fromUrl = new URLSearchParams(window.location.search).get('status') as OrderStatus | null;
    if (fromUrl && ORDER_STATUSES.includes(fromUrl)) setStatus(fromUrl);
  }, []);

  const { data, isPending, error } = useQuery({
    queryKey: ['orders', status, page],
    queryFn: () =>
      api.getPaged<OrderDto[]>(`/orders?page=${page}&limit=15${status ? `&status=${status}` : ''}`),
  });

  const transitionMutation = useMutation({
    mutationFn: ({ id, toStatus }: { id: string; toStatus: OrderStatus }) =>
      api.post(`/orders/${id}/transition`, { toStatus }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['orders'] });
      queryClient.invalidateQueries({ queryKey: ['stocks'] });
      queryClient.invalidateQueries({ queryKey: ['products'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
    },
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-black text-ink">{t('title')}</h1>
        <ExportButtons path="/exports/orders" />
      </div>

      <div className="flex flex-wrap gap-1.5">
        <FilterTab active={status === ''} onClick={() => { setStatus(''); setPage(1); }}>
          {t('all')}
        </FilterTab>
        {ORDER_STATUSES.map((s) => (
          <FilterTab key={s} active={status === s} onClick={() => { setStatus(s); setPage(1); }}>
            {t(`statuses.${s}`)}
          </FilterTab>
        ))}
      </div>

      <ErrorText error={error} />
      <ErrorText error={transitionMutation.error} />
      {isPending ? (
        <Spinner />
      ) : (
        <Card className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-sm">
            <thead>
              <tr className="border-b border-line text-xs text-ink-muted">
                <th className="p-3 text-start font-medium">{t('orderNumber')}</th>
                <th className="p-3 text-start font-medium">{t('items')}</th>
                <th className="p-3 text-start font-medium">{t('total')}</th>
                <th className="p-3 text-start font-medium">{t('status')}</th>
                <th className="p-3 text-start font-medium">{tc('actions')}</th>
              </tr>
            </thead>
            <tbody>
              {data?.items.length === 0 && (
                <tr>
                  <td colSpan={5} className="p-8 text-center text-ink-faint">
                    {tc('noData')}
                  </td>
                </tr>
              )}
              {data?.items.map((order) => (
                <tr
                  key={order.id}
                  className="border-b border-line/60 transition-colors last:border-0 hover:bg-surface-3/50"
                >
                  <td className="p-3">
                    <p className="font-bold text-ink">#{formatNumber(order.orderNumber, locale)}</p>
                    <p className="text-xs text-ink-faint">{formatDate(order.createdAt, locale)}</p>
                  </td>
                  <td className="p-3 text-ink-muted">
                    {formatNumber(order.items.length, locale)}
                  </td>
                  <td className="p-3 font-bold text-ink">
                    {formatMoney(order.total, locale)}{' '}
                    <span className="text-xs font-normal text-ink-faint">{tc('currency')}</span>
                  </td>
                  <td className="p-3">
                    <Badge tone={order.status}>{t(`statuses.${order.status}`)}</Badge>
                  </td>
                  <td className="p-3">
                    <div className="flex flex-wrap gap-1.5">
                      {ORDER_TRANSITIONS[order.status]
                        .map((next) => (
                          <Button
                            key={next}
                            variant={next === 'CANCELLED' ? 'danger' : 'outline'}
                            className="min-h-8 px-2.5 text-xs"
                            loading={
                              transitionMutation.isPending &&
                              transitionMutation.variables?.id === order.id &&
                              transitionMutation.variables?.toStatus === next
                            }
                            onClick={() => {
                              if (confirm(t('transitionConfirm', { status: t(`statuses.${next}`) }))) {
                                transitionMutation.mutate({ id: order.id, toStatus: next });
                              }
                            }}
                          >
                            {t(`actions.${next}`)}
                          </Button>
                        ))}
                    </div>
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

function FilterTab({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'cursor-pointer rounded-full px-3.5 py-1.5 text-xs font-semibold transition-colors duration-200',
        active
          ? 'bg-primary-700 text-white dark:bg-primary-600'
          : 'border border-line bg-surface-2 text-ink-muted hover:text-ink',
      )}
    >
      {children}
    </button>
  );
}
