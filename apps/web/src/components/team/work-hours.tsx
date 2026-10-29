'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, Check, Clock, X } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { FormEvent, useState } from 'react';
import {
  DEFAULT_STORE_TIME_ZONE,
  INCOME_PART_NAMES,
  storeDateOf,
  PERMISSIONS,
  type CashRegisterDto,
  type HourlyPayPreviewDto,
  type Locale,
  type WorkIntervalDto,
} from '@my-store/shared';
import { api } from '@/lib/api-client';
import { formatMoney, formatStoreDateTime } from '@/lib/format';
import { Badge, Button, Card, ErrorText, Field, Input, Modal, Select, Spinner } from '@/components/ui';
import { useAuthStore } from '@/stores/auth-store';

const STATUS_TONES: Record<WorkIntervalDto['status'], string> = {
  PENDING: 'PENDING',
  APPROVED: 'APPROVED',
  REJECTED: 'danger',
  PAID: 'DELIVERED',
};

const pad = (n: number) => String(n).padStart(2, '0');

const isRealDay = (v: string) => /^\d{4}-\d{2}-\d{2}$/.test(v) && Number(v.slice(0, 4)) >= 2000;

export function hm(minutes: number | null | undefined) {
  if (minutes == null) return '—';
  return `${Math.floor(minutes / 60)}h ${pad(minutes % 60)}m`;
}

/** Hourly payroll for one employee: review recorded work, then pay approved hours for a chosen range */
export function WorkHours({ employeeId }: { employeeId: string }) {
  const t = useTranslations('workHours');
  const locale = useLocale() as Locale;
  const queryClient = useQueryClient();
  const canManage = !!useAuthStore((s) => s.user?.permissions?.includes(PERMISSIONS.EMPLOYEES_MANAGE));
  const tz = useAuthStore((s) => s.user?.timeZone) ?? DEFAULT_STORE_TIME_ZONE;
  const today = storeDateOf(new Date(), tz);
  const [range, setRange] = useState({ from: `${today.slice(0, 8)}01`, to: today });
  const [acting, setActing] = useState<{ row: WorkIntervalDto; mode: 'approve' | 'reject' } | null>(null);
  const qs = `from=${range.from}&to=${range.to}`;
  // a date being typed passes through values like "0002-09-01" — wait for a complete, sensible range
  const valid = isRealDay(range.from) && isRealDay(range.to) && range.from <= range.to;

  // a manager first pulls in new attendance days / sessions; a reader only lists
  const { data: rows, isPending, error } = useQuery({
    queryKey: ['work-intervals', employeeId, range],
    queryFn: () =>
      canManage
        ? api
            .post<WorkIntervalDto[]>(`/employees/${employeeId}/work-intervals/sync`, range)
            .catch(() => api.get<WorkIntervalDto[]>(`/employees/${employeeId}/work-intervals?${qs}`))
        : api.get<WorkIntervalDto[]>(`/employees/${employeeId}/work-intervals?${qs}`),
    enabled: valid,
  });
  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ['work-intervals', employeeId] });
    queryClient.invalidateQueries({ queryKey: ['hourly-preview', employeeId] });
  };

  const totals = (rows ?? []).reduce(
    (acc, r) => {
      if (r.status === 'APPROVED') acc.approved += r.approvedMinutes ?? 0;
      if (r.status === 'PAID') acc.paid += r.approvedMinutes ?? 0;
      if (r.status === 'PENDING') acc.pending += 1;
      return acc;
    },
    { approved: 0, paid: 0, pending: 0 },
  );

  return (
    <div className="space-y-3">
      <Card className="flex flex-wrap items-end gap-3 p-4">
        <Field label={t('from')}>
          <Input type="date" dir="ltr" value={range.from} max={range.to} onChange={(e) => setRange({ ...range, from: e.target.value })} />
        </Field>
        <Field label={t('to')}>
          <Input type="date" dir="ltr" value={range.to} min={range.from} onChange={(e) => setRange({ ...range, to: e.target.value })} />
        </Field>
        <div className="flex flex-wrap gap-4 pb-2 text-sm">
          <span className="text-ink-muted">{t('pendingCount', { count: totals.pending })}</span>
          <span className="text-ink-muted">
            {t('approvedLabel')}: <span className="font-bold text-ink">{hm(totals.approved)}</span>
          </span>
          <span className="text-ink-muted">
            {t('paidLabel')}: <span className="font-bold text-ink">{hm(totals.paid)}</span>
          </span>
        </div>
      </Card>
      <p className="text-xs text-ink-faint">{t('sourceHint')}</p>

      <ErrorText error={error} />
      {!valid ? null : isPending ? (
        <Spinner />
      ) : rows?.length === 0 ? (
        <p className="p-6 text-center text-sm text-ink-faint">{t('empty')}</p>
      ) : (
        <Card className="overflow-x-auto">
          <table className="w-full min-w-[820px] text-sm">
            <thead>
              <tr className="border-b border-line text-xs text-ink-muted">
                <th className="p-2 text-start font-medium">{t('source')}</th>
                <th className="p-2 text-start font-medium">{t('start')}</th>
                <th className="p-2 text-start font-medium">{t('end')}</th>
                <th className="p-2 text-start font-medium">{t('recorded')}</th>
                <th className="p-2 text-start font-medium">{t('payable')}</th>
                <th className="p-2 text-start font-medium">{t('status')}</th>
                <th className="p-2 text-start font-medium" />
              </tr>
            </thead>
            <tbody>
              {rows?.map((r) => (
                <tr key={r.id} className="border-b border-line/60 align-top last:border-0">
                  <td className="p-2">
                    <p className="font-medium text-ink">{r.sourceLabel}</p>
                    {r.overlapsWith.length > 0 && (
                      <p className="mt-0.5 flex items-center gap-1 text-xs text-accent-700 dark:text-accent-300">
                        <AlertTriangle className="h-3 w-3" aria-hidden /> {t('overlap')}
                      </p>
                    )}
                    {r.needsReview && r.status === 'PENDING' && (
                      <p className="mt-0.5 flex items-center gap-1 text-xs text-red-600 dark:text-red-400">
                        <Clock className="h-3 w-3" aria-hidden /> {t('noEnd')}
                      </p>
                    )}
                    {r.correctionReason && <p className="mt-0.5 text-xs text-ink-faint">{r.correctionReason}</p>}
                  </td>
                  <td className="p-2 text-ink-muted">{formatStoreDateTime(r.startAt, tz, locale)}</td>
                  <td className="p-2 text-ink-muted">{r.endAt ? formatStoreDateTime(r.endAt, tz, locale) : '—'}</td>
                  <td className="p-2 text-ink">{hm(r.recordedMinutes)}</td>
                  <td className="p-2 font-bold text-ink">
                    {hm(r.approvedMinutes)}
                    {r.hourlyRate && <span className="block text-xs font-normal text-ink-faint">@ {formatMoney(r.hourlyRate, locale)}/h</span>}
                  </td>
                  <td className="p-2">
                    <Badge tone={STATUS_TONES[r.status]}>{t(`statuses.${r.status}`)}</Badge>
                  </td>
                  <td className="p-2">
                    {canManage && (r.status === 'PENDING' || r.status === 'REJECTED') && (
                      <button type="button" onClick={() => setActing({ row: r, mode: 'approve' })} className="me-1 inline-flex cursor-pointer items-center gap-1 rounded-md border border-line px-2 py-1 text-xs font-medium text-primary-700 hover:bg-surface-3 dark:text-primary-300">
                        <Check className="h-3.5 w-3.5" aria-hidden /> {t('approve')}
                      </button>
                    )}
                    {canManage && (r.status === 'PENDING' || r.status === 'APPROVED') && (
                      <button type="button" onClick={() => setActing({ row: r, mode: 'reject' })} className="inline-flex cursor-pointer items-center gap-1 rounded-md border border-line px-2 py-1 text-xs font-medium text-red-700 hover:bg-surface-3 dark:text-red-400">
                        <X className="h-3.5 w-3.5" aria-hidden /> {t('reject')}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      {canManage && valid && <HourlyPay employeeId={employeeId} range={range} onPaid={refresh} />}
      {acting && <ReviewModal employeeId={employeeId} row={acting.row} mode={acting.mode} onClose={() => setActing(null)} onDone={refresh} />}
    </div>
  );
}

function ReviewModal({
  employeeId,
  row,
  mode,
  onClose,
  onDone,
}: {
  employeeId: string;
  row: WorkIntervalDto;
  mode: 'approve' | 'reject';
  onClose: () => void;
  onDone: () => void;
}) {
  const t = useTranslations('workHours');
  const tc = useTranslations('common');
  const [hours, setHours] = useState(row.recordedMinutes != null ? String(Math.floor(row.recordedMinutes / 60)) : '');
  const [minutes, setMinutes] = useState(row.recordedMinutes != null ? String(row.recordedMinutes % 60) : '');
  const [reason, setReason] = useState('');
  const payable = hours === '' && minutes === '' ? null : Number(hours || 0) * 60 + Number(minutes || 0);
  const corrected = mode === 'approve' && payable !== row.recordedMinutes;

  const mutation = useMutation({
    mutationFn: () =>
      mode === 'approve'
        ? api.post(`/employees/${employeeId}/work-intervals/${row.id}/approve`, {
            ...(corrected && { approvedMinutes: payable }),
            reason: reason || undefined,
          })
        : api.post(`/employees/${employeeId}/work-intervals/${row.id}/reject`, { reason }),
    onSuccess: () => {
      onDone();
      onClose();
    },
  });

  function submit(e: FormEvent) {
    e.preventDefault();
    mutation.mutate();
  }

  return (
    <Modal open title={`${mode === 'approve' ? t('approve') : t('reject')}: ${row.sourceLabel}`} onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        <p className="text-sm text-ink-muted">
          {t('recorded')}: <span className="font-bold text-ink">{hm(row.recordedMinutes)}</span>
        </p>
        {mode === 'approve' && (
          <div className="grid grid-cols-2 gap-3">
            <Field label={t('payableHours')}>
              <Input required type="number" min={0} max={168} step={1} dir="ltr" value={hours} onChange={(e) => setHours(e.target.value)} />
            </Field>
            <Field label={t('payableMinutes')}>
              <Input type="number" min={0} max={59} step={1} dir="ltr" value={minutes} onChange={(e) => setMinutes(e.target.value)} />
            </Field>
          </div>
        )}
        {(mode === 'reject' || corrected) && (
          <Field label={t('reason')} hint={mode === 'approve' ? t('correctionHint') : undefined}>
            <Input required minLength={3} value={reason} onChange={(e) => setReason(e.target.value)} />
          </Field>
        )}
        <ErrorText error={mutation.error} />
        <div className="flex gap-2">
          <Button type="submit" loading={mutation.isPending} variant={mode === 'reject' ? 'danger' : 'primary'}>
            {mode === 'approve' ? (corrected ? t('approveCorrected') : t('approve')) : t('reject')}
          </Button>
          <Button type="button" variant="ghost" onClick={onClose}>
            {tc('cancel')}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

function HourlyPay({ employeeId, range, onPaid }: { employeeId: string; range: { from: string; to: string }; onPaid: () => void }) {
  const t = useTranslations('workHours');
  const locale = useLocale() as Locale;
  const [registerId, setRegisterId] = useState('');
  const [note, setNote] = useState('');
  const [done, setDone] = useState<string | null>(null);

  const { data: preview } = useQuery({
    queryKey: ['hourly-preview', employeeId, range],
    queryFn: () => api.get<HourlyPayPreviewDto>(`/employees/${employeeId}/hourly-pay/preview?from=${range.from}&to=${range.to}`),
  });
  const { data: registers } = useQuery({
    queryKey: ['cash-registers'],
    queryFn: () => api.get<CashRegisterDto[]>('/cash-registers'),
  });

  const pay = useMutation({
    mutationFn: () =>
      api.post<{ totalAmount: string }>(`/employees/${employeeId}/hourly-pay`, {
        ...range,
        intervalIds: preview!.intervals.map((i) => i.id),
        registerId: registerId || undefined,
        note: note || undefined,
      }),
    onSuccess: (res) => {
      setDone(res.totalAmount);
      onPaid();
    },
  });

  if (!preview) return null;
  return (
    <Card className="space-y-3 p-4">
      <p className="text-sm font-semibold text-ink">{t('payTitle')}</p>
      {preview.intervals.length === 0 ? (
        <p className="text-sm text-ink-faint">{t('nothingToPay')}</p>
      ) : (
        <>
          <p className="text-sm text-ink-muted">
            {t('previewLine', { count: preview.intervals.length, time: hm(preview.totalMinutes) })}{' '}
            <span className="text-lg font-black text-ink">{formatMoney(preview.totalAmount, locale)} USDT</span>
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label={t('payFrom')} hint={t('payFromHint')}>
              <Select value={registerId} onChange={(e) => setRegisterId(e.target.value)}>
                <option value="">{t('noCashEffect')}</option>
                {registers?.filter((x) => !x.retired).map((r) => (
                  <option key={r.id} value={r.id}>
                    {INCOME_PART_NAMES[r.part]} — {r.branchName}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label={t('note')}>
              <Input value={note} onChange={(e) => setNote(e.target.value)} />
            </Field>
          </div>
          <ErrorText error={pay.error} />
          <Button
            type="button"
            loading={pay.isPending}
            onClick={() => confirm(t('confirmPay', { amount: preview.totalAmount, time: hm(preview.totalMinutes) })) && pay.mutate()}
          >
            {t('pay')}
          </Button>
        </>
      )}
      {done && <p className="rounded-lg bg-surface-3 p-2 text-sm text-ink">{t('paidDone', { amount: done })}</p>}
    </Card>
  );
}
