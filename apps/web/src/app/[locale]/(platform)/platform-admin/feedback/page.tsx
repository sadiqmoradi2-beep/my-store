'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocale, useTranslations } from 'next-intl';
import { useState } from 'react';
import {
  PLATFORM_FEEDBACK_STATUSES,
  PLATFORM_FEEDBACK_TYPES,
  PLATFORM_FEEDBACK_TYPE_NAMES,
} from '@my-store/shared';
import type { Locale, PlatformFeedbackDto, PlatformFeedbackStatus, PlatformFeedbackType } from '@my-store/shared';
import { api } from '@/lib/api-client';
import { formatDate } from '@/lib/format';
import { Badge, Button, Card, ErrorText, Input, Select, Spinner, Textarea } from '@/components/ui';

const STATUS_TONES: Record<string, string> = {
  NEW: 'PENDING',
  IN_PROGRESS: 'APPROVED',
  DONE: 'DELIVERED',
  REJECTED: 'danger',
};

export default function PlatformFeedbackPage() {
  const t = useTranslations('platformAdmin');
  const tf = useTranslations('feedback');
  const locale = useLocale() as Locale;
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<PlatformFeedbackStatus | ''>('');
  const [type, setType] = useState<PlatformFeedbackType | ''>('');
  const [page, setPage] = useState(1);
  const [notes, setNotes] = useState<Record<string, string>>({});

  const { data, isPending, error } = useQuery({
    queryKey: ['platform-admin', 'feedback', page, search, status, type],
    queryFn: () =>
      api.getPaged<PlatformFeedbackDto[]>(
        `/feedback?page=${page}&limit=20` +
          (search ? `&search=${encodeURIComponent(search)}` : '') +
          (status ? `&status=${status}` : '') +
          (type ? `&type=${type}` : ''),
      ),
  });

  const update = useMutation({
    mutationFn: ({ id, dto }: { id: string; dto: { status?: PlatformFeedbackStatus; adminNote?: string } }) =>
      api.patch<PlatformFeedbackDto>(`/feedback/${id}`, dto),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['platform-admin', 'feedback'] });
    },
  });

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-black text-ink">{t('feedbackTitle')}</h1>
        <p className="mt-1 text-sm text-ink-muted">{t('feedbackHint')}</p>
      </div>

      <div className="flex flex-wrap gap-3">
        <Input
          placeholder={t('feedbackSearchPlaceholder')}
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(1);
          }}
          className="max-w-xs"
        />
        <Select
          value={status}
          onChange={(e) => {
            setStatus(e.target.value as PlatformFeedbackStatus | '');
            setPage(1);
          }}
          className="max-w-40"
        >
          <option value="">{t('allStatuses')}</option>
          {PLATFORM_FEEDBACK_STATUSES.map((value) => (
            <option key={value} value={value}>
              {tf(`statuses.${value}`)}
            </option>
          ))}
        </Select>
        <Select
          value={type}
          onChange={(e) => {
            setType(e.target.value as PlatformFeedbackType | '');
            setPage(1);
          }}
          className="max-w-48"
        >
          <option value="">{t('allTypes')}</option>
          {PLATFORM_FEEDBACK_TYPES.map((value) => (
            <option key={value} value={value}>
              {PLATFORM_FEEDBACK_TYPE_NAMES[value]}
            </option>
          ))}
        </Select>
      </div>

      <ErrorText error={error} />
      {isPending || !data ? (
        <Spinner />
      ) : data.items.length === 0 ? (
        <Card className="p-8 text-center text-sm text-ink-muted">{t('noFeedback')}</Card>
      ) : (
        <div className="space-y-3">
          {data.items.map((item) => {
            const noteValue = notes[item.id] ?? item.adminNote ?? '';
            const saving = update.isPending && update.variables?.id === item.id;
            return (
              <Card key={item.id} className="space-y-3 p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="font-bold text-ink">{item.subject}</p>
                    <p className="text-xs text-ink-faint">
                      {item.tenantName} — {item.submitterName} — {formatDate(item.createdAt, locale)}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge>{PLATFORM_FEEDBACK_TYPE_NAMES[item.type]}</Badge>
                    <Badge tone={STATUS_TONES[item.status]}>{tf(`statuses.${item.status}`)}</Badge>
                  </div>
                </div>
                <p className="text-sm text-ink-muted">{item.body}</p>
                <div className="flex flex-wrap items-end gap-2">
                  <Select
                    value={item.status}
                    onChange={(e) =>
                      update.mutate({ id: item.id, dto: { status: e.target.value as PlatformFeedbackStatus } })
                    }
                    className="max-w-48"
                  >
                    {PLATFORM_FEEDBACK_STATUSES.map((value) => (
                      <option key={value} value={value}>
                        {tf(`statuses.${value}`)}
                      </option>
                    ))}
                  </Select>
                  <Textarea
                    rows={2}
                    placeholder={tf('adminNote')}
                    value={noteValue}
                    onChange={(e) => setNotes((prev) => ({ ...prev, [item.id]: e.target.value }))}
                    className="min-w-64 flex-1"
                  />
                  <Button
                    variant="outline"
                    loading={saving}
                    onClick={() => update.mutate({ id: item.id, dto: { adminNote: noteValue } })}
                  >
                    {t('saveNote')}
                  </Button>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
