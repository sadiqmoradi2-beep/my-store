'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocale, useTranslations } from 'next-intl';
import { FormEvent, useState } from 'react';
import type { CashRegisterDto, DirectoryPersonDto, Locale } from '@my-store/shared';
import { api } from '@/lib/api-client';
import { formatMoney } from '@/lib/format';
import { Button, ErrorText, Field, Input, Select } from '@/components/ui';
import { FinancialActorField, useFinancialActor } from './financial-actor-field';

function todayDate() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/**
 * Internal transfer from this account to another account of the store. Not income, not an expense:
 * the server moves the amount between both accounts in one step and records who transferred it.
 */
export function TransferForm({ register, typeField, onClose }: { register: CashRegisterDto; typeField: React.ReactNode; onClose: () => void }) {
  const t = useTranslations('cash');
  const tc = useTranslations('common');
  const locale = useLocale() as Locale;
  const queryClient = useQueryClient();
  // one key per opened form: a retried save creates the transfer once
  const [requestId] = useState(() => crypto.randomUUID());
  const [toRegisterId, setToRegisterId] = useState('');
  const [amount, setAmount] = useState('');
  const [personId, setPersonId] = useState('');
  const actorContext = useFinancialActor();
  const [date, setDate] = useState(todayDate);
  const [note, setNote] = useState('');
  const { data: registers } = useQuery({ queryKey: ['cash-registers'], queryFn: () => api.get<CashRegisterDto[]>('/cash-registers') });
  const { data: directory } = useQuery({ queryKey: ['people-directory'], queryFn: () => api.get<DirectoryPersonDto[]>('/team-people/directory') });
  const destinations = (registers ?? []).filter((r) => r.id !== register.id && r.isActive && !r.retired && (!actorContext.data?.actor || r.branchId === actorContext.data.branchId));
  const isToday = date === todayDate();

  const save = useMutation({
    mutationFn: () =>
      api.post('/cash-transfers', {
        requestId,
        fromRegisterId: register.id,
        toRegisterId,
        amount: Number(amount),
        transferredById: actorContext.data?.canSelectActor && personId ? personId : undefined,
        date: isToday ? undefined : new Date(`${date}T12:00:00`).toISOString(),
        note: note || undefined,
      }),
    onSuccess: () => {
      for (const key of ['cash-registers', 'cash-transactions', 'income-summary', 'cash-transfers']) queryClient.invalidateQueries({ queryKey: [key] });
      onClose();
    },
  });

  function submit(e: FormEvent) {
    e.preventDefault();
    save.mutate();
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        {typeField}
        <Field label={t('transfer.from')}>
          <Input disabled value={`${register.name} — ${formatMoney(register.balance, locale)}`} />
        </Field>
      </div>
      <p className="rounded-lg bg-surface-3 p-2 text-xs text-ink-muted">{t('transfer.hint')}</p>
      <Field label={t('transfer.to')}>
        <Select required value={toRegisterId} onChange={(e) => setToRegisterId(e.target.value)}>
          <option value="" disabled>
            {t('transfer.selectAccount')}
          </option>
          {destinations.map((r) => (
            <option key={r.id} value={r.id}>
              {t(`parts.${r.part}`)} — {r.branchName ?? r.name}
            </option>
          ))}
        </Select>
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label={t('amount')}>
          <Input required type="number" min={0.01} step="0.01" dir="ltr" value={amount} onChange={(e) => setAmount(e.target.value)} />
        </Field>
        <Field label={t('date')} hint={isToday ? undefined : t('pastDateHint')}>
          <Input required type="date" dir="ltr" max={todayDate()} value={date} onChange={(e) => setDate(e.target.value)} />
        </Field>
      </div>
      <FinancialActorField context={actorContext.data} error={actorContext.error} label={t('transfer.by')} value={personId} onChange={setPersonId} directory={directory} branchId={register.branchId} />
      <Field label={t('note')}>
        <Input value={note} maxLength={500} onChange={(e) => setNote(e.target.value)} />
      </Field>
      <ErrorText error={save.error} />
      <div className="flex gap-2">
        <Button type="submit" loading={save.isPending} disabled={!actorContext.data || !!actorContext.error}>
          {t('transfer.save')}
        </Button>
        <Button type="button" variant="ghost" onClick={onClose}>
          {tc('cancel')}
        </Button>
      </div>
    </form>
  );
}
