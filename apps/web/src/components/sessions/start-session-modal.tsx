'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { TriangleAlert } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { FormEvent, useState } from 'react';
import { SESSION_ROLES, type SessionRole, type WorkSessionDto } from '@my-store/shared';
import { api } from '@/lib/api-client';
import { Button, ErrorText, Field, Input, Modal, Select, Textarea } from '@/components/ui';

export interface SessionPerson {
  role: SessionRole;
  personId: string;
  name: string;
  activeSessionId: string | null;
  activeSessionCode: string | null;
}

const pad = (n: number) => String(n).padStart(2, '0');
const todayDate = () => {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};
const nowTime = () => {
  const d = new Date();
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

export function StartSessionModal({
  onClose,
  onStarted,
}: {
  onClose: () => void;
  onStarted: (session: WorkSessionDto) => void;
}) {
  const t = useTranslations('sessions');
  const tc = useTranslations('common');
  const queryClient = useQueryClient();
  const [form, setForm] = useState({
    role: 'SELLER' as SessionRole,
    personId: '',
    date: todayDate(),
    time: nowTime(),
    openingCash: '0',
    harvestLimit: '',
    openingNotes: '',
  });
  const set = (patch: Partial<typeof form>) => setForm((f) => ({ ...f, ...patch }));

  const { data: people } = useQuery({
    queryKey: ['session-people'],
    queryFn: () => api.get<SessionPerson[]>('/work-sessions/people'),
  });
  const candidates = (people ?? []).filter((p) => p.role === form.role);
  const chosen = candidates.find((p) => p.personId === form.personId);

  const mutation = useMutation({
    mutationFn: () =>
      api.post<WorkSessionDto>('/work-sessions', {
        role: form.role,
        personId: form.personId,
        startedAt: new Date(`${form.date}T${form.time}`).toISOString(),
        openingCash: Number(form.openingCash),
        harvestLimit: Number(form.harvestLimit),
        openingNotes: form.openingNotes || undefined,
      }),
    onSuccess: (session) => {
      queryClient.invalidateQueries({ queryKey: ['work-sessions'] });
      queryClient.invalidateQueries({ queryKey: ['session-people'] });
      onStarted(session);
    },
  });

  function submit(e: FormEvent) {
    e.preventDefault();
    mutation.mutate();
  }

  return (
    <Modal open title={t('startNew')} onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <Field label={t('role')}>
            <Select value={form.role} onChange={(e) => set({ role: e.target.value as SessionRole, personId: '' })}>
              {SESSION_ROLES.map((r) => (
                <option key={r} value={r}>
                  {t(`roles.${r}`)}
                </option>
              ))}
            </Select>
          </Field>
          <Field label={t('person')}>
            <Select required value={form.personId} onChange={(e) => set({ personId: e.target.value })}>
              <option value="" disabled>
                {t('selectPerson')}
              </option>
              {candidates.map((p) => (
                <option key={p.personId} value={p.personId}>
                  {p.name}
                  {p.activeSessionCode ? ` — ${p.activeSessionCode}` : ''}
                </option>
              ))}
            </Select>
          </Field>
        </div>

        {chosen?.activeSessionCode && (
          <p className="flex items-start gap-2 rounded-lg bg-accent-100 p-3 text-sm text-accent-700 dark:bg-accent-700/20 dark:text-accent-300">
            <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
            {t('alreadyActive', { name: chosen.name, code: chosen.activeSessionCode })}
          </p>
        )}

        <div className="grid grid-cols-2 gap-3">
          <Field label={t('startDate')}>
            <Input required type="date" dir="ltr" value={form.date} onChange={(e) => set({ date: e.target.value })} />
          </Field>
          <Field label={t('startTime')}>
            <Input required type="time" dir="ltr" value={form.time} onChange={(e) => set({ time: e.target.value })} />
          </Field>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Field label={t('openingCash')} hint={t('openingCashHint')}>
            <Input
              required
              type="number"
              min={0}
              step="0.01"
              dir="ltr"
              value={form.openingCash}
              onChange={(e) => set({ openingCash: e.target.value })}
            />
          </Field>
          <Field label={t('harvestLimit')} hint={t('harvestLimitHint')}>
            <Input
              required
              type="number"
              min={0}
              step="0.01"
              dir="ltr"
              value={form.harvestLimit}
              onChange={(e) => set({ harvestLimit: e.target.value })}
            />
          </Field>
        </div>

        <Field label={t('openingNotes')}>
          <Textarea value={form.openingNotes} onChange={(e) => set({ openingNotes: e.target.value })} />
        </Field>

        <Field label={t('status')}>
          <Input disabled value={t('statuses.ACTIVE')} readOnly />
        </Field>

        <ErrorText error={mutation.error} />
        <div className="flex gap-2">
          <Button type="submit" loading={mutation.isPending} disabled={!!chosen?.activeSessionCode || !form.personId}>
            {t('start')}
          </Button>
          <Button type="button" variant="ghost" onClick={onClose}>
            {tc('cancel')}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
