'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useLocale, useTranslations } from 'next-intl';
import { FormEvent, useState } from 'react';
import {
  INCOME_PARTS,
  sessionResult,
  type IncomePart,
  type Locale,
  type WorkSessionDto,
} from '@my-store/shared';
import { api } from '@/lib/api-client';
import { formatMoney } from '@/lib/format';
import { Badge, Button, ErrorText, Field, Input, Modal, Select, Textarea } from '@/components/ui';

const pad = (n: number) => String(n).padStart(2, '0');
const localNow = () => {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

function useRefresh() {
  const queryClient = useQueryClient();
  return () => {
    for (const key of ['work-sessions', 'work-session', 'session-people', 'income-summary', 'session-report', 'cash-registers']) {
      queryClient.invalidateQueries({ queryKey: [key] });
    }
  };
}

/** Record a harvest — or send a request when the user is not allowed to collect */
export function HarvestModal({
  session,
  canCollect,
  onClose,
}: {
  session: WorkSessionDto;
  canCollect: boolean;
  onClose: () => void;
}) {
  const t = useTranslations('sessions');
  const tc = useTranslations('common');
  const locale = useLocale() as Locale;
  const refresh = useRefresh();
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState<IncomePart>('CASH');
  const [note, setNote] = useState('');

  const mutation = useMutation({
    mutationFn: () =>
      api.post(`/work-sessions/${session.id}/harvests`, {
        amount: Number(amount),
        method,
        note: note || undefined,
      }),
    onSuccess: () => {
      refresh();
      onClose();
    },
  });

  function submit(e: FormEvent) {
    e.preventDefault();
    mutation.mutate();
  }

  return (
    <Modal open title={`${canCollect ? t('harvest') : t('requestHarvest')}: ${session.code}`} onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        <dl className="grid grid-cols-2 gap-2 rounded-lg bg-surface-3 p-3 text-sm">
          <div>
            <dt className="text-ink-faint">{t('cards.cashBox')}</dt>
            <dd className="font-bold text-ink">{formatMoney(session.figures.expectedCash, locale)}</dd>
          </div>
          <div>
            <dt className="text-ink-faint">{t('cards.remainingLimit')}</dt>
            <dd className="font-bold text-ink">{formatMoney(session.figures.remainingHarvestLimit, locale)}</dd>
          </div>
        </dl>
        {!canCollect && <p className="text-xs text-ink-muted">{t('requestHint')}</p>}
        <div className="grid grid-cols-2 gap-3">
          <Field label={t('amount')}>
            <Input
              required
              type="number"
              min={0.01}
              step="0.01"
              dir="ltr"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
          </Field>
          <Field label={t('method')} hint={t('methodHint')}>
            <Select value={method} onChange={(e) => setMethod(e.target.value as IncomePart)}>
              {INCOME_PARTS.map((p) => (
                <option key={p} value={p}>
                  {t(`parts.${p}`)}
                </option>
              ))}
            </Select>
          </Field>
        </div>
        <Field label={t('note')}>
          <Input value={note} onChange={(e) => setNote(e.target.value)} />
        </Field>
        <ErrorText error={mutation.error} />
        <div className="flex gap-2">
          <Button type="submit" loading={mutation.isPending}>
            {canCollect ? t('recordHarvest') : t('sendRequest')}
          </Button>
          <Button type="button" variant="ghost" onClick={onClose}>
            {tc('cancel')}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

/** Close a session: closing time, the counted cash and notes — the system shows how far the count is from the expected cash */
export function CloseSessionModal({ session, onClose }: { session: WorkSessionDto; onClose: () => void }) {
  const t = useTranslations('sessions');
  const tc = useTranslations('common');
  const locale = useLocale() as Locale;
  const refresh = useRefresh();
  const [closedAt, setClosedAt] = useState(localNow());
  const [actual, setActual] = useState('');
  const [notes, setNotes] = useState('');

  const expected = Number(session.figures.expectedCash);
  const difference = actual === '' ? null : Number(actual) - expected;
  const result = difference === null ? null : sessionResult(Math.round(difference * 100) / 100);

  const mutation = useMutation({
    mutationFn: () =>
      api.post(`/work-sessions/${session.id}/close`, {
        closedAt: new Date(closedAt).toISOString(),
        actualClosingCash: Number(actual),
        closingNotes: notes || undefined,
      }),
    onSuccess: () => {
      refresh();
      onClose();
    },
  });

  function submit(e: FormEvent) {
    e.preventDefault();
    mutation.mutate();
  }

  return (
    <Modal open title={`${t('closeSession')}: ${session.code}`} onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        {session.figures.pendingHarvests > 0 && (
          <p className="rounded-lg bg-accent-100 p-3 text-sm text-accent-700 dark:bg-accent-700/20 dark:text-accent-300">
            {t('pendingBlock', { count: session.figures.pendingHarvests })}
          </p>
        )}
        <Field label={t('closingDateTime')}>
          <Input required type="datetime-local" dir="ltr" value={closedAt} onChange={(e) => setClosedAt(e.target.value)} />
        </Field>
        <div className="rounded-lg bg-surface-3 p-3 text-sm">
          <p className="text-ink-faint">{t('expectedCash')}</p>
          <p className="text-lg font-black text-ink">{formatMoney(expected, locale)}</p>
        </div>
        <Field label={t('actualClosingCash')} hint={t('actualHint')}>
          <Input
            required
            type="number"
            min={0}
            step="0.01"
            dir="ltr"
            value={actual}
            onChange={(e) => setActual(e.target.value)}
          />
        </Field>
        {result && difference !== null && (
          <div className="flex items-center justify-between rounded-lg border border-line p-3 text-sm">
            <span className="text-ink-muted">{t('difference')}</span>
            <span className="flex items-center gap-2 font-bold text-ink">
              {formatMoney(difference, locale)}
              <Badge tone={result === 'BALANCED' ? 'APPROVED' : result === 'SHORTAGE' ? 'danger' : 'PENDING'}>
                {t(`results.${result}`)}
              </Badge>
            </span>
          </div>
        )}
        <Field label={t('closingNotes')}>
          <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} />
        </Field>
        <p className="text-xs text-ink-faint">{t('closeNoAlter')}</p>
        <ErrorText error={mutation.error} />
        <div className="flex gap-2">
          <Button type="submit" loading={mutation.isPending} disabled={session.figures.pendingHarvests > 0}>
            {t('closeSession')}
          </Button>
          <Button type="button" variant="ghost" onClick={onClose}>
            {tc('cancel')}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

/** A cash adjustment (audited correction) or a reopen — both need a reason */
export function ReasonModal({
  session,
  mode,
  onClose,
}: {
  session: WorkSessionDto;
  mode: 'adjust' | 'reopen' | 'limit';
  onClose: () => void;
}) {
  const t = useTranslations('sessions');
  const tc = useTranslations('common');
  const refresh = useRefresh();
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');

  const mutation = useMutation({
    mutationFn: () =>
      mode === 'adjust'
        ? api.post(`/work-sessions/${session.id}/adjustments`, { amount: Number(amount), reason })
        : mode === 'limit'
          ? api.patch(`/work-sessions/${session.id}`, { harvestLimit: Number(amount), reason: reason || undefined })
          : api.post(`/work-sessions/${session.id}/reopen`, { reason }),
    onSuccess: () => {
      refresh();
      onClose();
    },
  });

  function submit(e: FormEvent) {
    e.preventDefault();
    mutation.mutate();
  }

  return (
    <Modal
      open
      title={`${mode === 'adjust' ? t('addAdjustment') : mode === 'limit' ? t('changeLimit') : t('reopen')}: ${session.code}`}
      onClose={onClose}
    >
      <form onSubmit={submit} className="space-y-4">
        <p className="text-xs text-ink-muted">
          {mode === 'adjust' ? t('adjustHint') : mode === 'limit' ? t('limitHint') : t('reopenHint')}
        </p>
        {mode === 'adjust' && (
          <Field label={t('adjustAmount')} hint={t('adjustAmountHint')}>
            <Input required type="number" step="0.01" dir="ltr" value={amount} onChange={(e) => setAmount(e.target.value)} />
          </Field>
        )}
        {mode === 'limit' && (
          <Field label={t('newLimit')}>
            <Input required type="number" min={0} step="0.01" dir="ltr" value={amount} onChange={(e) => setAmount(e.target.value)} />
          </Field>
        )}
        <Field label={t('reason')}>
          <Textarea required={mode !== 'limit'} minLength={mode === 'limit' ? undefined : 3} value={reason} onChange={(e) => setReason(e.target.value)} />
        </Field>
        <ErrorText error={mutation.error} />
        <div className="flex gap-2">
          <Button type="submit" loading={mutation.isPending}>
            {tc('confirm')}
          </Button>
          <Button type="button" variant="ghost" onClick={onClose}>
            {tc('cancel')}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
