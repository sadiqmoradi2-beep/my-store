'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Bell, CheckCheck } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useRef, useState } from 'react';
import {
  NOTIFICATION_TYPE_NAMES,
  type Locale,
  type NotificationDto,
  type NotificationType,
} from '@my-store/shared';
import { api } from '@/lib/api-client';
import { formatDate, formatNumber } from '@/lib/format';
import { cn } from '@/components/ui';
import { useClickOutside } from '@/hooks/use-click-outside';

/** Where each notification type should navigate to when clicked — null means stay in place */
function notificationTarget(locale: Locale, refType: string | null, refId: string | null): string | null {
  if (!refId) return null;
  switch (refType) {
    case 'product':
      return `/${locale}/catalog/products/${refId}/edit`;
    case 'order':
      return `/${locale}/orders`;
    case 'debt':
      return `/${locale}/finance/debts`;
    case 'subscription':
      return `/${locale}/settings/subscription`;
    default:
      return null;
  }
}

export function NotificationBell() {
  const t = useTranslations('notifications');
  const tc = useTranslations('common');
  const locale = useLocale() as Locale;
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  useClickOutside(containerRef, () => setOpen(false));
  const queryClient = useQueryClient();

  const { data: unread } = useQuery({
    queryKey: ['notifications-unread'],
    queryFn: () => api.get<{ count: number }>('/notifications/unread-count'),
    refetchInterval: 30_000,
  });
  const { data, isPending } = useQuery({
    queryKey: ['notifications'],
    queryFn: () => api.getPaged<NotificationDto[]>('/notifications?page=1&limit=10'),
    enabled: open,
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['notifications'] });
    queryClient.invalidateQueries({ queryKey: ['notifications-unread'] });
  };
  const readMutation = useMutation({
    mutationFn: (id: string) => api.post(`/notifications/${id}/read`),
    onSuccess: invalidate,
  });
  const readAllMutation = useMutation({
    mutationFn: () => api.post('/notifications/read-all'),
    onSuccess: invalidate,
  });

  const count = unread?.count ?? 0;

  return (
    <div className="relative" ref={containerRef}>
      <button
        onClick={() => setOpen((o) => !o)}
        aria-label={t('title')}
        title={t('title')}
        className="relative cursor-pointer rounded-lg p-2 text-ink-muted transition-colors duration-200 hover:bg-surface-3 hover:text-ink"
      >
        <Bell className="h-[18px] w-[18px]" />
        {count > 0 && (
          <span className="absolute -end-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-accent-500 px-1 text-[10px] font-bold text-white">
            {count > 99 ? `${formatNumber(99, locale)}+` : formatNumber(count, locale)}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute end-0 top-full z-30 mt-2 w-80 max-w-[85vw] overflow-hidden rounded-xl border border-line bg-surface-2 shadow-xl">
            <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-2.5">
              <h2 className="text-sm font-bold text-ink">{t('title')}</h2>
              {count > 0 && (
                <button
                  onClick={() => readAllMutation.mutate()}
                  disabled={readAllMutation.isPending}
                  className="flex cursor-pointer items-center gap-1 text-xs font-semibold text-primary-700 transition-colors hover:text-primary-800 disabled:opacity-50 dark:text-primary-300 dark:hover:text-primary-200"
                >
                  <CheckCheck className="h-3.5 w-3.5" aria-hidden />
                  {t('readAll')}
                </button>
              )}
            </div>

            <div className="max-h-80 overflow-y-auto">
              {isPending && <p className="p-6 text-center text-sm text-ink-faint">{tc('loading')}</p>}
              {data?.items.length === 0 && (
                <p className="p-6 text-center text-sm text-ink-faint">{t('empty')}</p>
              )}
              {data?.items.map((item) => {
                const typeName = NOTIFICATION_TYPE_NAMES[item.type as NotificationType] ?? item.type;
                const isUnread = !item.readAt;
                const target = notificationTarget(locale, item.refType, item.refId);
                return (
                  <button
                    key={item.id}
                    onClick={() => {
                      if (isUnread) readMutation.mutate(item.id);
                      if (target) {
                        setOpen(false);
                        router.push(target);
                      }
                    }}
                    className={cn(
                      'flex w-full gap-2.5 border-b border-line/60 p-3 text-start transition-colors last:border-0',
                      (isUnread || target) && 'cursor-pointer hover:bg-surface-3',
                      isUnread && 'bg-primary-50/60 dark:bg-primary-900/20',
                      !isUnread && !target && 'cursor-default',
                    )}
                  >
                    <span
                      className={cn(
                        'mt-1.5 h-2 w-2 shrink-0 rounded-full',
                        isUnread ? 'bg-primary-500' : 'bg-transparent',
                      )}
                      aria-hidden
                    />
                    <span className="min-w-0 flex-1">
                      <span className={cn('block truncate text-sm text-ink', isUnread && 'font-bold')}>
                        {item.title}
                      </span>
                      {item.body && (
                        <span className="mt-0.5 block text-xs text-ink-muted">{item.body}</span>
                      )}
                      <span className="mt-1 flex items-center gap-2 text-[11px] text-ink-faint">
                        <span>{typeName}</span>
                        <span>·</span>
                        <span>{formatDate(item.createdAt, locale)}</span>
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
      )}
    </div>
  );
}
