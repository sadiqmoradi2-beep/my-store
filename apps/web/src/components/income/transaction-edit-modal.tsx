'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocale, useTranslations } from 'next-intl';
import { FormEvent, useState } from 'react';
import {
  DEFAULT_STORE_TIME_ZONE,
  storeDateOf,
  type CashLedgerEventDto,
  type CashTransactionDto,
  type CashTransactionEditDto,
  type CashTransactionEditStatusDto,
  type Locale,
} from '@my-store/shared';
import { api } from '@/lib/api-client';
import { formatMoney, formatStoreDateTime } from '@/lib/format';
import { Badge, Button, ErrorText, Field, Input, Modal, Select, Spinner, Textarea } from '@/components/ui';
import { useAuthStore } from '@/stores/auth-store';

const LEDGER_QUERIES = ['cash-registers', 'cash-transactions', 'income-summary', 'work-sessions', 'work-session', 'session-report'];

/** Store Admin: correct amount / date / account / description of one manual transaction (backend re-checks everything) */
export function TransactionEditModal({ tx, onClose }: { tx: CashTransactionDto; onClose: () => void }) {
  const t = useTranslations('cash.edit');
  const queryClient = useQueryClient();
  const tz = useAuthStore((s) => s.user?.timeZone) ?? DEFAULT_STORE_TIME_ZONE;
  // one key per opened dialog: a retried save is applied once
  const [requestId] = useState(() => crypto.randomUUID());
  const { data: status, isPending, error } = useQuery({
    queryKey: ['tx-edit-status', tx.id],
    queryFn: () => api.get<CashTransactionEditStatusDto>(`/cash-transactions/${tx.id}/edit-status`),
  });
  const [form, setForm] = useState<{ amount: string; date: string; registerId: string; note: string } | null>(null);
  const [reason, setReason] = useState('');
  const [password, setPassword] = useState('');
  const [totpCode, setTotpCode] = useState('');

  const initial = status && {
    amount: String(Number(status.amount)),
    date: storeDateOf(new Date(status.date), tz),
    registerId: status.registerId,
    note: status.note ?? '',
  };
  const values = form ?? initial;
  const set = (key: 'amount' | 'date' | 'registerId' | 'note', value: string) => setForm({ ...values!, [key]: value });

  const save = useMutation({
    mutationFn: async () => {
      if (!status || !values || !initial) return;
      let grantId: string | undefined;
      if (status.mode === 'EXCEPTION') {
        grantId = (
          await api.post<{ grantId: string }>(`/cash-transactions/${tx.id}/exception`, {
            reason,
            password,
            ...(status.twoFactorRequired && { totpCode }),
          })
        ).grantId;
      }
      return api.post(`/cash-transactions/${tx.id}/corrections`, {
        requestId,
        expectedVersion: status.version,
        reason,
        grantId,
        ...(values.amount !== initial.amount && { amount: Number(values.amount) }),
        ...(values.date !== initial.date && { date: values.date }),
        ...(values.registerId !== initial.registerId && { registerId: values.registerId }),
        ...(values.note !== initial.note && { note: values.note }),
      });
    },
    onSuccess: () => {
      for (const key of [...LEDGER_QUERIES, 'tx-edit-status', 'tx-corrections']) queryClient.invalidateQueries({ queryKey: [key] });
      onClose();
    },
  });

  function submit(e: FormEvent) {
    e.preventDefault();
    save.mutate();
  }

  return (
    <Modal open title={t('title')} onClose={onClose}>
      <ErrorText error={error} />
      {isPending && <Spinner />}
      {status && !status.editable && <p className="rounded-lg bg-surface-3 p-3 text-sm text-ink-muted">{status.blockedReason}</p>}
      {status && status.editable && values && (
        <form onSubmit={submit} className="space-y-4">
          <p className="rounded-lg bg-surface-3 p-2 text-xs text-ink-muted">
            {status.mode === 'WINDOW'
              ? t('windowOpen', { deadline: formatStoreDateTime(status.deadline!, tz) })
              : status.recordedAt
                ? t('windowClosed')
                : t('legacy')}
          </p>
          <div className="grid grid-cols-2 gap-3">
            <Field label={t('amount')}>
              <Input required type="number" min="0.01" step="0.01" dir="ltr" value={values.amount} onChange={(e) => set('amount', e.target.value)} />
            </Field>
            <Field label={t('date')}>
              <Input required type="date" dir="ltr" max={storeDateOf(new Date(), tz)} value={values.date} onChange={(e) => set('date', e.target.value)} />
            </Field>
          </div>
          <Field label={t('account')}>
            <Select value={values.registerId} onChange={(e) => set('registerId', e.target.value)}>
              {status.accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label={t('description')}>
            <Input value={values.note} onChange={(e) => set('note', e.target.value)} maxLength={1000} />
          </Field>
          <Field label={t('reason')} hint={t('reasonHint')}>
            <Textarea required minLength={3} maxLength={500} rows={2} value={reason} onChange={(e) => setReason(e.target.value)} />
          </Field>
          {status.mode === 'EXCEPTION' && (
            <fieldset className="space-y-3 rounded-lg border border-amber-400/60 p-3">
              <legend className="px-1 text-sm font-semibold text-ink">{t('exceptionTitle')}</legend>
              <p className="text-xs text-ink-muted">{t('exceptionHint')}</p>
              <Field label={t('password')}>
                <Input required type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
              </Field>
              {status.twoFactorRequired && (
                <Field label={t('totp')}>
                  <Input required inputMode="numeric" dir="ltr" maxLength={6} value={totpCode} onChange={(e) => setTotpCode(e.target.value)} />
                </Field>
              )}
            </fieldset>
          )}
          <p className="text-xs text-ink-faint">{t('entriesNote')}</p>
          <ErrorText error={save.error} />
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={onClose}>
              {t('cancel')}
            </Button>
            <Button type="submit" loading={save.isPending} disabled={!form}>
              {status.mode === 'EXCEPTION' ? t('saveException') : t('save')}
            </Button>
          </div>
        </form>
      )}
    </Modal>
  );
}

const STATE_TONES: Record<CashTransactionEditDto['ledgerState'], string> = {
  ACTIVE: 'APPROVED',
  UNDONE_BY_RESTORE: 'RETURNED',
  REMOVED_BY_RESET: 'danger',
};

/** Read-only correction history of one transaction (append-only on the server) */
export function TransactionHistoryModal({ tx, onClose }: { tx: CashTransactionDto; onClose: () => void }) {
  const t = useTranslations('cash.edit');
  const locale = useLocale() as Locale;
  const tz = useAuthStore((s) => s.user?.timeZone) ?? DEFAULT_STORE_TIME_ZONE;
  const { data, isPending, error } = useQuery({
    queryKey: ['tx-corrections', tx.id],
    queryFn: () => api.get<{ edits: CashTransactionEditDto[]; events: CashLedgerEventDto[] }>(`/cash-transactions/${tx.id}/corrections`),
  });
  const money = (v: string) => formatMoney(v, locale);
  return (
    <Modal open wide title={t('historyTitle')} onClose={onClose}>
      <ErrorText error={error} />
      {isPending && <Spinner />}
      {data && data.edits.length === 0 && <p className="text-sm text-ink-faint">{t('noHistory')}</p>}
      <ul className="space-y-3">
        {data?.edits.map((e) => (
          <li key={e.id} className="rounded-lg border border-line p-3 text-sm">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-semibold text-ink">{formatStoreDateTime(e.createdAt, tz, locale)}</span>
              <span className="text-ink-muted">{e.editorName}</span>
              <Badge tone={e.mode === 'EXCEPTION' ? 'RETURNED' : 'neutral'}>{t(`modes.${e.mode}`)}</Badge>
              <Badge tone="neutral">{t(`methods.${e.method}`)}</Badge>
              <Badge tone={STATE_TONES[e.ledgerState]}>{t(`states.${e.ledgerState}`)}</Badge>
            </div>
            <p className="mt-1 text-ink-muted">
              {t('reason')}: <span className="text-ink">{e.reason}</span>
            </p>
            <dl className="mt-2 grid gap-1 text-xs sm:grid-cols-2">
              {e.amountBefore !== e.amountAfter && <Change label={t('amount')} from={money(e.amountBefore)} to={money(e.amountAfter)} />}
              {e.dateBefore !== e.dateAfter && (
                <Change label={t('date')} from={formatStoreDateTime(e.dateBefore, tz, locale)} to={formatStoreDateTime(e.dateAfter, tz, locale)} />
              )}
              {e.registerBeforeName !== e.registerAfterName && <Change label={t('account')} from={e.registerBeforeName} to={e.registerAfterName} />}
              {e.noteBefore !== e.noteAfter && <Change label={t('description')} from={e.noteBefore ?? '—'} to={e.noteAfter ?? '—'} />}
              {e.balanceChanges.map((b) => (
                <Change key={b.registerId} label={`${t('balance')} ${b.registerName}`} from={money(b.before)} to={money(b.after)} />
              ))}
            </dl>
          </li>
        ))}
      </ul>
      {data && data.events.length > 0 && (
        <div className="mt-4 space-y-1 text-xs text-ink-muted">
          <p className="font-semibold text-ink">{t('eventsTitle')}</p>
          {data.events.map((ev) => (
            <p key={ev.id}>
              {formatStoreDateTime(ev.createdAt, tz, locale)} — {t(`events.${ev.kind}`)}
              {ev.backupCreatedAt && ` (${t('backupOf', { date: formatStoreDateTime(ev.backupCreatedAt, tz, locale) })})`}
              {ev.userName && ` · ${ev.userName}`}
            </p>
          ))}
        </div>
      )}
    </Modal>
  );
}

function Change({ label, from, to }: { label: string; from: string; to: string }) {
  return (
    <div>
      <dt className="text-ink-faint">{label}</dt>
      <dd className="text-ink">
        <span className="line-through opacity-60">{from}</span> → {to}
      </dd>
    </div>
  );
}
