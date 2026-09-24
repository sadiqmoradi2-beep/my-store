'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CalendarDays, Pencil, Plus } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { FormEvent, use, useState } from 'react';
import {
  ATTENDANCE_STATUSES,
  ATTENDANCE_STATUS_NAMES,
  type AttendanceStatus,
  type DebtDirection,
  type EmployeeAttendanceDto,
  type EmployeeDto,
  type Locale,
  type SalaryPaymentDto,
} from '@my-store/shared';
import { DebtLedgerView } from '@/components/debts/debt-ledger-view';
import { api } from '@/lib/api-client';
import { formatDate, formatMoney, formatNumber } from '@/lib/format';
import { BackLink, Badge, Button, Card, ErrorText, Field, Input, Modal, Select, Spinner } from '@/components/ui';

const ATTENDANCE_TONES: Record<AttendanceStatus, string> = {
  PRESENT: 'DELIVERED',
  ABSENT: 'danger',
  LEAVE: 'PENDING',
  HALF_DAY: 'SHIPPING',
};

function todayISODate() {
  return new Date().toISOString().slice(0, 10);
}

export default function EmployeeAccountPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const t = useTranslations('employees');
  const locale = useLocale() as Locale;

  const { data: employees, isPending, error } = useQuery({
    queryKey: ['employees'],
    queryFn: () => api.get<EmployeeDto[]>('/employees'),
  });
  const employee = employees?.find((e) => e.id === id);

  if (isPending) return <Spinner />;
  if (error) return <ErrorText error={error} />;
  if (!employee) return <ErrorText error={new Error(t('title'))} />;

  return (
    <div className="space-y-4">
      <BackLink href={`/${locale}/team/employees`} label={t('backToList')} />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-black text-ink">{employee.fullName}</h1>
          <p className="mt-1 text-sm text-ink-muted">{employee.position}</p>
        </div>
        {!employee.isActive && <Badge tone="danger">{t('title')}</Badge>}
      </div>

      <Card className="grid gap-3 p-4 sm:grid-cols-3">
        <div>
          <p className="text-xs text-ink-faint">{t('phone')}</p>
          <p className="mt-1 font-bold text-ink" dir="ltr">
            {employee.phone ?? '—'}
          </p>
        </div>
        <div>
          <p className="text-xs text-ink-faint">{t('salary')}</p>
          <p className="mt-1 font-bold text-ink">{formatMoney(employee.salary, locale)}</p>
        </div>
        <div>
          <p className="text-xs text-ink-faint">{t('hiredAt')}</p>
          <p className="mt-1 font-bold text-ink">{formatDate(employee.hiredAt, locale)}</p>
        </div>
      </Card>

      <section className="space-y-3">
        <h2 className="text-base font-bold text-ink">{t('financialLedger')}</h2>
        <DebtLedgerView kind="employee" id={id} showHeader={false} />
        <NewAdvanceForm employeeId={id} />
        <SalaryHistory employeeId={id} />
      </section>

      <section className="space-y-3">
        <div className="flex items-center gap-2">
          <CalendarDays className="h-4 w-4 text-primary-600" aria-hidden />
          <h2 className="text-base font-bold text-ink">{t('attendanceTitle')}</h2>
        </div>
        <AttendanceSection employeeId={id} />
      </section>
    </div>
  );
}

function NewAdvanceForm({ employeeId }: { employeeId: string }) {
  const t = useTranslations('employees');
  const td = useTranslations('debts');
  const tc = useTranslations('common');
  const queryClient = useQueryClient();
  const [direction, setDirection] = useState<DebtDirection>('RECEIVABLE');
  const [amount, setAmount] = useState('');
  const [notes, setNotes] = useState('');

  const mutation = useMutation({
    mutationFn: () =>
      api.post('/debts', {
        direction,
        employeeId,
        amount: Number(amount),
        notes: notes || undefined,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['debt-ledger', 'employee', employeeId] });
      setAmount('');
      setNotes('');
    },
  });

  function submit(e: FormEvent) {
    e.preventDefault();
    mutation.mutate();
  }

  return (
    <Card className="p-4">
      <h3 className="mb-1 text-sm font-bold text-ink">{t('newAdvance')}</h3>
      <p className="mb-3 text-xs text-ink-faint">{t('advanceHint')}</p>
      <form onSubmit={submit} className="flex flex-wrap items-end gap-3">
        <Field label={td('direction')}>
          <Select value={direction} onChange={(e) => setDirection(e.target.value as DebtDirection)}>
            <option value="RECEIVABLE">{td('directions.RECEIVABLE')}</option>
            <option value="PAYABLE">{td('directions.PAYABLE')}</option>
          </Select>
        </Field>
        <Field label={td('amount')}>
          <Input
            required
            type="number"
            min={0.01}
            step="0.01"
            dir="ltr"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className="w-32"
          />
        </Field>
        <Field label={td('notes')}>
          <Input value={notes} onChange={(e) => setNotes(e.target.value)} />
        </Field>
        <Button type="submit" loading={mutation.isPending}>
          {tc('create')}
        </Button>
      </form>
      <ErrorText error={mutation.error} />
    </Card>
  );
}

function SalaryHistory({ employeeId }: { employeeId: string }) {
  const t = useTranslations('employees');
  const tc = useTranslations('common');
  const locale = useLocale() as Locale;
  const queryClient = useQueryClient();

  const { data } = useQuery({
    queryKey: ['salary-payments', employeeId],
    queryFn: () =>
      api.getPaged<SalaryPaymentDto[]>(`/employees/salary-payments?employeeId=${employeeId}&limit=20`),
  });

  const markPaid = useMutation({
    mutationFn: (payment: SalaryPaymentDto) =>
      api.patch(`/employees/${employeeId}/salary-payments/${payment.id}/mark-paid`, {}),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['salary-payments', employeeId] }),
  });

  if (!data || data.items.length === 0) return null;
  return (
    <Card className="overflow-x-auto p-0">
      <h3 className="p-4 pb-0 text-sm font-bold text-ink">{t('salaryHistory')}</h3>
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-line text-xs text-ink-muted">
            <th className="p-3 text-start font-medium">{t('period')}</th>
            <th className="p-3 text-start font-medium">{t('amount')}</th>
            <th className="p-3 text-start font-medium">{t('bonus')}</th>
            <th className="p-3 text-start font-medium">{t('deduction')}</th>
            <th className="p-3 text-start font-medium">{t('netAmount')}</th>
            <th className="p-3 text-start font-medium">{t('status')}</th>
            <th className="p-3 text-start font-medium">{t('paidAt')}</th>
            <th className="p-3 text-start font-medium" />
          </tr>
        </thead>
        <tbody>
          {data.items.map((payment) => (
            <tr key={payment.id} className="border-b border-line/60 last:border-0">
              <td className="p-3 text-ink-muted" dir="ltr">
                {payment.period}
              </td>
              <td className="p-3 text-ink">{formatMoney(payment.amount, locale)}</td>
              <td className="p-3 text-ink-muted">{formatMoney(payment.bonus, locale)}</td>
              <td className="p-3 text-ink-muted">{formatMoney(payment.deduction, locale)}</td>
              <td className="p-3 font-bold text-ink">{formatMoney(payment.netAmount, locale)}</td>
              <td className="p-3">
                <Badge tone={payment.status === 'PAID' ? 'APPROVED' : 'PENDING'}>
                  {t(`salaryStatus.${payment.status}`)}
                </Badge>
              </td>
              <td className="p-3 text-xs text-ink-faint">
                {payment.paidAt ? formatDate(payment.paidAt, locale) : '—'}
              </td>
              <td className="p-3">
                {payment.status === 'PENDING' && (
                  <Button
                    variant="outline"
                    className="!px-2 !py-1 text-xs"
                    disabled={markPaid.isPending}
                    onClick={() => markPaid.mutate(payment)}
                  >
                    {t('markPaid')}
                  </Button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="p-2 text-end text-xs text-ink-faint">
        {tc('page', { page: formatNumber(1, locale), total: formatNumber(data.meta.totalPages, locale) })}
      </p>
    </Card>
  );
}

function monthRange(offset: number) {
  const now = new Date();
  const from = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + offset, 1));
  const to = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + offset + 1, 0));
  return { from: from.toISOString().slice(0, 10), to: to.toISOString().slice(0, 10) };
}

function AttendanceSection({ employeeId }: { employeeId: string }) {
  const t = useTranslations('employees');
  const tc = useTranslations('common');
  const locale = useLocale() as Locale;
  const queryClient = useQueryClient();
  const [monthOffset, setMonthOffset] = useState(0);
  const [editing, setEditing] = useState<EmployeeAttendanceDto | null | 'new'>(null);
  const { from, to } = monthRange(monthOffset);

  const { data, isPending } = useQuery({
    queryKey: ['employee-attendance', employeeId, from, to],
    queryFn: () => api.get<EmployeeAttendanceDto[]>(`/employees/${employeeId}/attendance?from=${from}&to=${to}`),
  });

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: ['employee-attendance', employeeId] });

  const markMutation = useMutation({
    mutationFn: (status: AttendanceStatus) =>
      api.post(`/employees/${employeeId}/attendance`, { date: todayISODate(), status }),
    onSuccess: invalidate,
  });

  return (
    <Card className="p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-1.5">
          <span className="self-center text-xs text-ink-faint">{t('today')}:</span>
          {(['PRESENT', 'ABSENT', 'LEAVE'] as const).map((status) => (
            <Button
              key={status}
              type="button"
              variant="outline"
              className="min-h-8 px-2.5 text-xs"
              loading={markMutation.isPending && markMutation.variables === status}
              onClick={() => markMutation.mutate(status)}
            >
              {ATTENDANCE_STATUS_NAMES[status]}
            </Button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" className="min-h-8 px-2.5 text-xs" onClick={() => setMonthOffset((m) => m - 1)}>
            {t('prevMonth')}
          </Button>
          <Button variant="outline" className="min-h-8 px-2.5 text-xs" onClick={() => setMonthOffset((m) => m + 1)}>
            {t('nextMonth')}
          </Button>
          <Button className="min-h-8 px-2.5 text-xs" onClick={() => setEditing('new')}>
            <Plus className="h-3.5 w-3.5" aria-hidden />
          </Button>
        </div>
      </div>

      {isPending ? (
        <Spinner />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[480px] text-sm">
            <thead>
              <tr className="border-b border-line text-xs text-ink-muted">
                <th className="p-2 text-start font-medium">{t('date')}</th>
                <th className="p-2 text-start font-medium">{t('attendanceStatus')}</th>
                <th className="p-2 text-start font-medium">{t('checkIn')}</th>
                <th className="p-2 text-start font-medium">{t('checkOut')}</th>
                <th className="p-2 text-start font-medium">{tc('actions')}</th>
              </tr>
            </thead>
            <tbody>
              {data?.length === 0 && (
                <tr>
                  <td colSpan={5} className="p-6 text-center text-ink-faint">
                    {tc('noData')}
                  </td>
                </tr>
              )}
              {data?.map((row) => (
                <tr key={row.id} className="border-b border-line/60 last:border-0">
                  <td className="p-2 text-ink" dir="ltr">
                    {formatDate(row.date, locale)}
                  </td>
                  <td className="p-2">
                    <Badge tone={ATTENDANCE_TONES[row.status]}>
                      {ATTENDANCE_STATUS_NAMES[row.status]}
                    </Badge>
                  </td>
                  <td className="p-2 text-ink-muted" dir="ltr">
                    {row.checkIn ? formatDate(row.checkIn, locale) : '—'}
                  </td>
                  <td className="p-2 text-ink-muted" dir="ltr">
                    {row.checkOut ? formatDate(row.checkOut, locale) : '—'}
                  </td>
                  <td className="p-2">
                    <button
                      onClick={() => setEditing(row)}
                      aria-label={tc('edit')}
                      className="cursor-pointer rounded-lg p-1.5 text-ink-muted transition-colors hover:bg-primary-100 hover:text-primary-800 dark:hover:bg-primary-800/40"
                    >
                      <Pencil className="h-4 w-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {editing !== null && (
        <AttendanceModal
          employeeId={employeeId}
          entry={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
        />
      )}
    </Card>
  );
}

function AttendanceModal({
  employeeId,
  entry,
  onClose,
}: {
  employeeId: string;
  entry: EmployeeAttendanceDto | null;
  onClose: () => void;
}) {
  const t = useTranslations('employees');
  const tc = useTranslations('common');
  const locale = useLocale() as Locale;
  const queryClient = useQueryClient();
  const [date, setDate] = useState(entry?.date.slice(0, 10) ?? todayISODate());
  const [status, setStatus] = useState<AttendanceStatus>(entry?.status ?? 'PRESENT');
  const [checkIn, setCheckIn] = useState(entry?.checkIn?.slice(11, 16) ?? '');
  const [checkOut, setCheckOut] = useState(entry?.checkOut?.slice(11, 16) ?? '');
  const [note, setNote] = useState(entry?.note ?? '');

  const mutation = useMutation({
    mutationFn: () =>
      api.post(`/employees/${employeeId}/attendance`, {
        date,
        status,
        checkIn: checkIn ? `${date}T${checkIn}:00` : undefined,
        checkOut: checkOut ? `${date}T${checkOut}:00` : undefined,
        note: note || undefined,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['employee-attendance', employeeId] });
      onClose();
    },
  });

  function submit(e: FormEvent) {
    e.preventDefault();
    mutation.mutate();
  }

  return (
    <Modal open title={t('markAttendanceTitle')} onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <Field label={t('date')}>
            <Input required type="date" dir="ltr" value={date} onChange={(e) => setDate(e.target.value)} />
          </Field>
          <Field label={t('attendanceStatus')}>
            <Select value={status} onChange={(e) => setStatus(e.target.value as AttendanceStatus)}>
              {ATTENDANCE_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {ATTENDANCE_STATUS_NAMES[s]}
                </option>
              ))}
            </Select>
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label={t('checkIn')}>
            <Input type="time" dir="ltr" value={checkIn} onChange={(e) => setCheckIn(e.target.value)} />
          </Field>
          <Field label={t('checkOut')}>
            <Input type="time" dir="ltr" value={checkOut} onChange={(e) => setCheckOut(e.target.value)} />
          </Field>
        </div>
        <Field label={t('note')}>
          <Input value={note} onChange={(e) => setNote(e.target.value)} />
        </Field>
        <ErrorText error={mutation.error} />
        <div className="flex gap-2">
          <Button type="submit" loading={mutation.isPending}>
            {tc('save')}
          </Button>
          <Button type="button" variant="ghost" onClick={onClose}>
            {tc('cancel')}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
