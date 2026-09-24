'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocale, useTranslations } from 'next-intl';
import { FormEvent, useState } from 'react';
import { PLATFORM_FEEDBACK_TYPES } from '@my-store/shared';
import type { Locale, PlatformFeedbackDto, PlatformFeedbackType } from '@my-store/shared';
import { api } from '@/lib/api-client';
import { formatDate } from '@/lib/format';
import { Badge, Button, Card, ErrorText, Field, Input, Select, Spinner, Textarea } from '@/components/ui';

const STATUS_TONES: Record<string, string> = {
  NEW: 'PENDING',
  IN_PROGRESS: 'APPROVED',
  DONE: 'DELIVERED',
  REJECTED: 'danger',
};

export default function FeedbackPage() {
  const t = useTranslations('feedback');
  const locale = useLocale() as Locale;
  const queryClient = useQueryClient();
  const [type, setType] = useState<PlatformFeedbackType>('SUGGESTION');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [submitted, setSubmitted] = useState(false);

  const { data, isPending } = useQuery({
    queryKey: ['feedback', 'mine'],
    queryFn: () => api.getPaged<PlatformFeedbackDto[]>('/feedback/mine?page=1&limit=20'),
  });

  const submit = useMutation({
    mutationFn: () => api.post<PlatformFeedbackDto>('/feedback', { type, subject, body }),
    onSuccess: () => {
      setSubject('');
      setBody('');
      setSubmitted(true);
      queryClient.invalidateQueries({ queryKey: ['feedback', 'mine'] });
    },
  });

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitted(false);
    submit.mutate();
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-black text-ink">{t('title')}</h1>
        <p className="mt-1 text-sm text-ink-muted">{t('hint')}</p>
      </div>

      <Card className="p-5">
        <form onSubmit={onSubmit} className="space-y-3">
          <Field label={t('type')}>
            <Select value={type} onChange={(e) => setType(e.target.value as PlatformFeedbackType)}>
              {PLATFORM_FEEDBACK_TYPES.map((value) => (
                <option key={value} value={value}>
                  {t(`types.${value}`)}
                </option>
              ))}
            </Select>
          </Field>
          <Field label={t('subject')}>
            <Input required value={subject} onChange={(e) => setSubject(e.target.value)} />
          </Field>
          <Field label={t('body')}>
            <Textarea required rows={4} value={body} onChange={(e) => setBody(e.target.value)} />
          </Field>
          <ErrorText error={submit.error} />
          {submitted && (
            <p className="text-sm font-medium text-primary-700 dark:text-primary-300">{t('submitted')}</p>
          )}
          <Button type="submit" loading={submit.isPending}>
            {t('submit')}
          </Button>
        </form>
      </Card>

      <div>
        <p className="mb-2 text-sm font-semibold text-ink">{t('mySubmissions')}</p>
        {isPending || !data ? (
          <Spinner />
        ) : data.items.length === 0 ? (
          <Card className="p-6 text-center text-sm text-ink-muted">{t('noItems')}</Card>
        ) : (
          <div className="space-y-2">
            {data.items.map((item) => (
              <Card key={item.id} className="p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="font-semibold text-ink">{item.subject}</p>
                  <Badge tone={STATUS_TONES[item.status]}>{t(`statuses.${item.status}`)}</Badge>
                </div>
                <p className="mt-1 text-sm text-ink-muted">{item.body}</p>
                <p className="mt-2 text-xs text-ink-faint">{formatDate(item.createdAt, locale)}</p>
                {item.adminNote && (
                  <p className="mt-2 rounded-lg bg-surface-3 p-2 text-xs text-ink-muted">
                    <span className="font-semibold">{t('adminNote')}: </span>
                    {item.adminNote}
                  </p>
                )}
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
