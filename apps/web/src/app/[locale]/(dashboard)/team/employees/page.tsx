'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Banknote, Clock, Pencil, Plus, Wallet } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import Link from 'next/link';
import { FormEvent, useState } from 'react';
import {
  EMPLOYEE_POSITIONS,
  EMPLOYEE_POSITION_NAMES,
  SELLER_PAY_TYPES,
  type CashRegisterDto,
  type EmployeeDto,
  type EmployeePosition,
  type EmployeeShiftDto,
  type Locale,
  type RoleDto,
  type SalaryPaymentDto,
  type SellerPayType,
} from '@my-store/shared';
import { api, assetUrl } from '@/lib/api-client';
import { formatDate, formatMoney, formatNumber } from '@/lib/format';
import { Badge, Button, Card, ErrorText, Field, Input, Modal, Select, Spinner } from '@/components/ui';

export default function EmployeesPage() {
  const t = useTranslations('employees');
  const tc = useTranslations('common');
  const locale = useLocale() as Locale;

  const [editing, setEditing] = useState<EmployeeDto | null | 'new'>(null);
  const [paying, setPaying] = useState<EmployeeDto | null>(null);
  const [shiftFor, setShiftFor] = useState<EmployeeDto | null>(null);
  const [tempPasswordInfo, setTempPasswordInfo] = useState<{ name: string; password: string } | null>(null);

  const { data: employees, isPending, error } = useQuery({
    queryKey: ['employees'],
    queryFn: () => api.get<EmployeeDto[]>('/employees'),
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-black text-ink">{t('title')}</h1>
        <Button onClick={() => setEditing('new')}>
          <Plus className="h-4 w-4" aria-hidden />
          {t('new')}
        </Button>
      </div>

      <ErrorText error={error} />
      {isPending ? (
        <Spinner />
      ) : (
        <Card className="overflow-x-auto">
          <table className="w-full min-w-[680px] text-sm">
            <thead>
              <tr className="border-b border-line text-xs text-ink-muted">
                <th className="p-3 text-start font-medium">{t('name')}</th>
                <th className="p-3 text-start font-medium">{t('position')}</th>
                <th className="p-3 text-start font-medium">{t('salary')}</th>
                <th className="p-3 text-start font-medium">{t('hiredAt')}</th>
                <th className="p-3 text-start font-medium">{tc('actions')}</th>
              </tr>
            </thead>
            <tbody>
              {employees?.length === 0 && (
                <tr>
                  <td colSpan={5} className="p-8 text-center text-ink-faint">
                    {tc('noData')}
                  </td>
                </tr>
              )}
              {employees?.map((employee) => (
                <tr
                  key={employee.id}
                  className="border-b border-line/60 transition-colors last:border-0 hover:bg-surface-3/50"
                >
                  <td className="p-3">
                    <p className="font-bold text-ink">{employee.fullName}</p>
                    {!employee.isActive && <Badge tone="danger">{tc('inactive')}</Badge>}
                  </td>
                  <td className="p-3 text-ink-muted">{employee.position}</td>
                  <td className="p-3 font-bold text-ink">
                    {formatMoney(employee.salary, locale)}{' '}
                    <span className="text-xs font-normal text-ink-faint">{tc('currency')}</span>
                  </td>
                  <td className="p-3 text-xs text-ink-faint">
                    {formatDate(employee.hiredAt, locale)}
                  </td>
                  <td className="p-3">
                    <div className="flex gap-1">
                      <Link
                        href={`/${locale}/team/employees/${employee.id}`}
                        aria-label={t('account')}
                        title={t('account')}
                        className="cursor-pointer rounded-lg p-1.5 text-ink-muted transition-colors hover:bg-primary-100 hover:text-primary-800 dark:hover:bg-primary-800/40"
                      >
                        <Wallet className="h-4 w-4" />
                      </Link>
                      <button
                        onClick={() => setShiftFor(employee)}
                        aria-label={t('shift')}
                        title={t('shift')}
                        className="cursor-pointer rounded-lg p-1.5 text-ink-muted transition-colors hover:bg-primary-100 hover:text-primary-800 dark:hover:bg-primary-800/40"
                      >
                        <Clock className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => setPaying(employee)}
                        aria-label={t('paySalary')}
                        title={t('paySalary')}
                        className="cursor-pointer rounded-lg p-1.5 text-ink-muted transition-colors hover:bg-primary-100 hover:text-primary-800 dark:hover:bg-primary-800/40"
                      >
                        <Banknote className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => setEditing(employee)}
                        aria-label={tc('edit')}
                        className="cursor-pointer rounded-lg p-1.5 text-ink-muted transition-colors hover:bg-primary-100 hover:text-primary-800 dark:hover:bg-primary-800/40"
                      >
                        <Pencil className="h-4 w-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      <SalaryHistory />

      {editing !== null && (
        <EmployeeModal
          employee={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
          onCreatedWithLogin={(name, password) => setTempPasswordInfo({ name, password })}
        />
      )}
      {paying && <PaySalaryModal employee={paying} onClose={() => setPaying(null)} />}
      {shiftFor && <ShiftModal employee={shiftFor} onClose={() => setShiftFor(null)} />}
      {tempPasswordInfo && (
        <TempPasswordModal info={tempPasswordInfo} onClose={() => setTempPasswordInfo(null)} />
      )}
    </div>
  );
}

function SalaryHistory() {
  const t = useTranslations('employees');
  const tc = useTranslations('common');
  const locale = useLocale() as Locale;
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);

  const { data } = useQuery({
    queryKey: ['salary-payments', page],
    queryFn: () =>
      api.getPaged<SalaryPaymentDto[]>(`/employees/salary-payments?page=${page}&limit=10`),
  });

  const markPaid = useMutation({
    mutationFn: (payment: SalaryPaymentDto) =>
      api.patch(`/employees/${payment.employeeId}/salary-payments/${payment.id}/mark-paid`, {}),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['salary-payments'] }),
  });

  if (!data || data.items.length === 0) return null;
  return (
    <div className="space-y-3">
      <h2 className="text-base font-bold text-ink">{t('salaryHistory')}</h2>
      <Card className="overflow-x-auto">
        <table className="w-full min-w-[780px] text-sm">
          <thead>
            <tr className="border-b border-line text-xs text-ink-muted">
              <th className="p-3 text-start font-medium">{t('name')}</th>
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
                <td className="p-3 text-ink">{payment.employeeName}</td>
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
                  {payment.receiptImageUrl && (
                    <a
                      href={assetUrl(payment.receiptImageUrl)}
                      target="_blank"
                      rel="noreferrer"
                      className="me-2 cursor-pointer text-xs font-semibold text-primary-700 hover:underline dark:text-primary-300"
                    >
                      {t('receipt')}
                    </a>
                  )}
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
      </Card>
      {data.meta.totalPages > 1 && (
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

function EmployeeModal({
  employee,
  onClose,
  onCreatedWithLogin,
}: {
  employee: EmployeeDto | null;
  onClose: () => void;
  onCreatedWithLogin: (name: string, password: string) => void;
}) {
  const t = useTranslations('employees');
  const tc = useTranslations('common');
  const locale = useLocale() as Locale;
  const queryClient = useQueryClient();
  const [positionPreset, setPositionPreset] = useState<EmployeePosition>('WORKER');
  const [customPosition, setCustomPosition] = useState('');
  const [form, setForm] = useState({
    fullName: employee?.fullName ?? '',
    position: employee?.position ?? '',
    phone: employee?.phone ?? '',
    payType: (employee?.payType ?? 'FIXED_SALARY') as SellerPayType,
    salary: employee?.salary ?? '',
    isActive: employee?.isActive ?? true,
    notes: employee?.notes ?? '',
  });
  const [email, setEmail] = useState('');
  const [createLogin, setCreateLogin] = useState(true);
  const [accessLevel, setAccessLevel] = useState<'FULL' | 'CUSTOM'>('FULL');
  const [customRoleId, setCustomRoleId] = useState('');
  const set = (patch: Partial<typeof form>) => setForm((f) => ({ ...f, ...patch }));

  const { data: roles } = useQuery({
    queryKey: ['roles'],
    queryFn: () => api.get<RoleDto[]>('/roles'),
  });
  const customRoles = roles?.filter((r) => !r.isSystem) ?? [];

  const [reassignRoleId, setReassignRoleId] = useState(employee?.roleId ?? '');
  const reassignRole = useMutation({
    mutationFn: () => api.patch(`/users/${employee!.userId}`, { roleId: reassignRoleId }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['employees'] }),
  });

  const mutation = useMutation({
    mutationFn: () => {
      if (employee) {
        return api.patch<EmployeeDto>(`/employees/${employee.id}`, {
          fullName: form.fullName,
          position: form.position,
          phone: form.phone || undefined,
          payType: form.payType,
          salary: Number(form.salary),
          notes: form.notes || undefined,
          isActive: form.isActive,
        });
      }
      const position = positionPreset === 'OTHER' ? customPosition : EMPLOYEE_POSITION_NAMES[positionPreset];
      const useCustomRole = positionPreset === 'MANAGER' && accessLevel === 'CUSTOM' && customRoleId;
      return api.post<EmployeeDto>('/employees', {
        fullName: form.fullName,
        position,
        positionPreset,
        phone: form.phone || undefined,
        payType: form.payType,
        salary: Number(form.salary),
        notes: form.notes || undefined,
        email: email || undefined,
        createLogin: email ? createLogin : undefined,
        roleId: useCustomRole ? customRoleId : undefined,
      });
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['employees'] });
      if (!employee && data.tempPassword) {
        onCreatedWithLogin(form.fullName, data.tempPassword);
      }
      onClose();
    },
  });

  function submit(e: FormEvent) {
    e.preventDefault();
    mutation.mutate();
  }

  return (
    <Modal open title={employee ? `${tc('edit')}: ${employee.fullName}` : t('new')} onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        <Field label={t('name')}>
          <Input required value={form.fullName} onChange={(e) => set({ fullName: e.target.value })} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          {employee ? (
            <Field label={t('position')}>
              <Input required value={form.position} onChange={(e) => set({ position: e.target.value })} />
            </Field>
          ) : (
            <Field label={t('positionPreset')}>
              <Select
                value={positionPreset}
                onChange={(e) => setPositionPreset(e.target.value as EmployeePosition)}
              >
                {EMPLOYEE_POSITIONS.map((preset) => (
                  <option key={preset} value={preset}>
                    {EMPLOYEE_POSITION_NAMES[preset]}
                  </option>
                ))}
              </Select>
            </Field>
          )}
          <Field label={t('payType')}>
            <Select value={form.payType} onChange={(e) => set({ payType: e.target.value as SellerPayType })}>
              {SELLER_PAY_TYPES.map((pt) => (
                <option key={pt} value={pt}>
                  {t(`payTypes.${pt}`)}
                </option>
              ))}
            </Select>
          </Field>
          <Field label={t('salary')}>
            <Input
              required
              type="number"
              min={0}
              step="0.01"
              dir="ltr"
              value={form.salary}
              onChange={(e) => set({ salary: e.target.value })}
            />
          </Field>
        </div>
        {!employee && positionPreset === 'OTHER' && (
          <Field label={t('positionOther')}>
            <Input required value={customPosition} onChange={(e) => setCustomPosition(e.target.value)} />
          </Field>
        )}
        <Field label={t('phone')}>
          <Input dir="ltr" value={form.phone} onChange={(e) => set({ phone: e.target.value })} />
        </Field>
        {!employee && (
          <>
            <Field label={t('email')} hint={t('createLoginHint')}>
              <Input type="email" dir="ltr" value={email} onChange={(e) => setEmail(e.target.value)} />
            </Field>
            {email && (
              <label className="flex cursor-pointer items-center gap-2 text-sm text-ink">
                <input
                  type="checkbox"
                  checked={createLogin}
                  onChange={(e) => setCreateLogin(e.target.checked)}
                  className="h-4 w-4 cursor-pointer accent-primary-600"
                />
                {t('createLogin')}
              </label>
            )}
            {email && createLogin && positionPreset === 'MANAGER' && (
              <Field label={t('accessLevel')}>
                <div className="space-y-2">
                  <div className="flex gap-1.5">
                    {(['FULL', 'CUSTOM'] as const).map((level) => (
                      <button
                        key={level}
                        type="button"
                        onClick={() => setAccessLevel(level)}
                        className={`cursor-pointer rounded-full px-3.5 py-1.5 text-xs font-semibold transition-colors duration-200 ${
                          accessLevel === level
                            ? 'bg-primary-700 text-white dark:bg-primary-600'
                            : 'border border-line bg-surface-2 text-ink-muted hover:text-ink'
                        }`}
                      >
                        {t(`accessLevels.${level}`)}
                      </button>
                    ))}
                  </div>
                  {accessLevel === 'CUSTOM' && (
                    <Select value={customRoleId} onChange={(e) => setCustomRoleId(e.target.value)}>
                      <option value="" disabled>
                        {t('selectCustomRole')}
                      </option>
                      {customRoles.map((role) => (
                        <option key={role.id} value={role.id}>
                          {role.name}
                        </option>
                      ))}
                    </Select>
                  )}
                  {accessLevel === 'CUSTOM' && customRoles.length === 0 && (
                    <p className="text-xs text-ink-faint">{t('noCustomRoles')}</p>
                  )}
                </div>
              </Field>
            )}
          </>
        )}
        {employee && (
          <label className="flex cursor-pointer items-center gap-2 text-sm text-ink">
            <input
              type="checkbox"
              checked={form.isActive}
              onChange={(e) => set({ isActive: e.target.checked })}
              className="h-4 w-4 cursor-pointer accent-primary-600"
            />
            {tc('active')}
          </label>
        )}
        {employee && (
          <Field label={t('accessLevel')} hint={employee.userId ? undefined : t('noLoginAccount')}>
            {employee.userId ? (
              <div className="flex items-center gap-2">
                <Select value={reassignRoleId} onChange={(e) => setReassignRoleId(e.target.value)}>
                  {roles?.map((role) => (
                    <option key={role.id} value={role.id}>
                      {role.name}
                    </option>
                  ))}
                </Select>
                <Button
                  type="button"
                  variant="outline"
                  className="min-h-8 shrink-0 px-2.5 text-xs"
                  loading={reassignRole.isPending}
                  disabled={!reassignRoleId || reassignRoleId === employee.roleId}
                  onClick={() => reassignRole.mutate()}
                >
                  {tc('save')}
                </Button>
              </div>
            ) : null}
            <ErrorText error={reassignRole.error} />
          </Field>
        )}
        <Field label={t('notes')}>
          <Input value={form.notes} onChange={(e) => set({ notes: e.target.value })} />
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

function TempPasswordModal({
  info,
  onClose,
}: {
  info: { name: string; password: string };
  onClose: () => void;
}) {
  const t = useTranslations('employees');
  const tc = useTranslations('common');
  const [copied, setCopied] = useState(false);

  return (
    <Modal open title={t('tempPasswordTitle')} onClose={onClose}>
      <div className="space-y-4">
        <p className="text-sm text-ink-muted">{t('tempPasswordHint', { name: info.name })}</p>
        <div className="flex items-center justify-between gap-3 rounded-lg border border-line bg-surface-3/50 px-3 py-2.5">
          <code dir="ltr" className="text-sm font-bold text-ink">{info.password}</code>
          <Button
            type="button"
            variant="outline"
            className="min-h-8 px-2.5 text-xs"
            onClick={() => {
              navigator.clipboard.writeText(info.password);
              setCopied(true);
              setTimeout(() => setCopied(false), 1500);
            }}
          >
            {copied ? tc('confirm') : t('copy')}
          </Button>
        </div>
        <Button type="button" onClick={onClose}>
          {t('close')}
        </Button>
      </div>
    </Modal>
  );
}

function ShiftModal({ employee, onClose }: { employee: EmployeeDto; onClose: () => void }) {
  const t = useTranslations('employees');
  const tc = useTranslations('common');
  const locale = useLocale() as Locale;
  const queryClient = useQueryClient();
  const [openingCash, setOpeningCash] = useState('');
  const [closingCash, setClosingCash] = useState('');
  const [registerId, setRegisterId] = useState('');

  const { data: shifts, isPending } = useQuery({
    queryKey: ['employee-shifts', employee.id],
    queryFn: () => api.get<EmployeeShiftDto[]>(`/employees/${employee.id}/shifts`),
  });
  const { data: registers } = useQuery({
    queryKey: ['cash-registers'],
    queryFn: () => api.get<CashRegisterDto[]>('/cash-registers'),
  });
  const openShift = shifts?.find((s) => !s.endedAt);

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['employee-shifts', employee.id] });
    queryClient.invalidateQueries({ queryKey: ['cash-registers'] });
  };

  const startMutation = useMutation({
    mutationFn: () =>
      api.post(`/employees/${employee.id}/shifts`, {
        openingCash: Number(openingCash),
        registerId: registerId || undefined,
      }),
    onSuccess: invalidate,
  });
  const endMutation = useMutation({
    mutationFn: () =>
      api.patch(`/employees/${employee.id}/shifts/${openShift?.id}`, {
        closingCash: Number(closingCash),
      }),
    onSuccess: invalidate,
  });

  return (
    <Modal open title={`${t('shift')}: ${employee.fullName}`} onClose={onClose}>
      {isPending ? (
        <Spinner />
      ) : openShift ? (
        <div className="space-y-4">
          <div className="rounded-lg border border-line bg-surface-3/50 p-3 text-sm">
            <p className="font-semibold text-ink">{t('shiftOpen')}</p>
            <p className="mt-1 text-xs text-ink-faint">
              {t('shiftStartedAt')}: {formatDate(openShift.startedAt, locale)}
            </p>
            <p className="mt-1 text-xs text-ink-muted">
              {t('openingCash')}: {formatMoney(openShift.openingCash, locale)}
            </p>
          </div>
          <Field label={t('closingCash')}>
            <Input
              type="number"
              min={0}
              step="0.01"
              dir="ltr"
              value={closingCash}
              onChange={(e) => setClosingCash(e.target.value)}
            />
          </Field>
          <ErrorText error={endMutation.error} />
          <Button
            loading={endMutation.isPending}
            disabled={!closingCash}
            onClick={() => endMutation.mutate()}
          >
            {t('endShift')}
          </Button>
        </div>
      ) : (
        <div className="space-y-4">
          <p className="text-sm text-ink-faint">{t('noOpenShift')}</p>
          <Field label={t('openingCash')}>
            <Input
              type="number"
              min={0}
              step="0.01"
              dir="ltr"
              value={openingCash}
              onChange={(e) => setOpeningCash(e.target.value)}
            />
          </Field>
          <Field label={t('register')}>
            <Select value={registerId} onChange={(e) => setRegisterId(e.target.value)}>
              <option value="">{t('noRegister')}</option>
              {registers?.map((register) => (
                <option key={register.id} value={register.id}>
                  {register.name} — {register.branchName}
                </option>
              ))}
            </Select>
          </Field>
          <ErrorText error={startMutation.error} />
          <Button
            loading={startMutation.isPending}
            disabled={!openingCash}
            onClick={() => startMutation.mutate()}
          >
            {t('startShift')}
          </Button>
        </div>
      )}
      <div className="mt-4">
        <Button type="button" variant="ghost" onClick={onClose}>
          {tc('cancel')}
        </Button>
      </div>
    </Modal>
  );
}

function PaySalaryModal({ employee, onClose }: { employee: EmployeeDto; onClose: () => void }) {
  const t = useTranslations('employees');
  const tc = useTranslations('common');
  const queryClient = useQueryClient();
  const [amount, setAmount] = useState(employee.salary);
  const [bonus, setBonus] = useState('0');
  const [deduction, setDeduction] = useState('0');
  const [status, setStatus] = useState<'PAID' | 'PENDING'>('PAID');
  const [period, setPeriod] = useState('');
  const [registerId, setRegisterId] = useState('');
  const [note, setNote] = useState('');
  const [receipt, setReceipt] = useState<File | null>(null);

  const { data: registers } = useQuery({
    queryKey: ['cash-registers'],
    queryFn: () => api.get<CashRegisterDto[]>('/cash-registers'),
  });

  const mutation = useMutation({
    mutationFn: async () => {
      let receiptImageUrl: string | undefined;
      if (receipt) {
        const form = new FormData();
        form.append('file', receipt);
        receiptImageUrl = (await api.upload<{ url: string }>('/uploads/salary-receipts', form)).url;
      }
      return api.post(`/employees/${employee.id}/salary-payments`, {
        amount: Number(amount),
        receiptImageUrl,
        bonus: Number(bonus) || 0,
        deduction: Number(deduction) || 0,
        status,
        period,
        registerId: registerId || undefined,
        note: note || undefined,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['salary-payments'] });
      queryClient.invalidateQueries({ queryKey: ['cash-registers'] });
      onClose();
    },
  });

  function submit(e: FormEvent) {
    e.preventDefault();
    mutation.mutate();
  }

  return (
    <Modal open title={`${t('paySalary')}: ${employee.fullName}`} onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
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
          <Field label={t('period')} hint={t('periodHint')}>
            <Input required dir="ltr" value={period} onChange={(e) => setPeriod(e.target.value)} placeholder="2026-09" />
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label={t('bonus')}>
            <Input type="number" min={0} step="0.01" dir="ltr" value={bonus} onChange={(e) => setBonus(e.target.value)} />
          </Field>
          <Field label={t('deduction')}>
            <Input
              type="number"
              min={0}
              step="0.01"
              dir="ltr"
              value={deduction}
              onChange={(e) => setDeduction(e.target.value)}
            />
          </Field>
        </div>
        <Field label={t('status')}>
          <Select value={status} onChange={(e) => setStatus(e.target.value as 'PAID' | 'PENDING')}>
            <option value="PAID">{t('salaryStatus.PAID')}</option>
            <option value="PENDING">{t('salaryStatus.PENDING')}</option>
          </Select>
        </Field>
        <Field label={t('register')} hint={t('registerHint')}>
          <Select value={registerId} onChange={(e) => setRegisterId(e.target.value)}>
            <option value="">{t('noRegister')}</option>
            {registers?.map((register) => (
              <option key={register.id} value={register.id}>
                {register.name} — {register.branchName}
              </option>
            ))}
          </Select>
        </Field>
        <Field label={t('receipt')} hint={t('receiptHint')}>
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp,application/pdf"
            onChange={(e) => setReceipt(e.target.files?.[0] ?? null)}
            className="block w-full cursor-pointer text-sm text-ink-muted file:me-3 file:cursor-pointer file:rounded-lg file:border-0 file:bg-primary-50 file:px-3 file:py-2 file:text-sm file:font-semibold file:text-primary-700"
          />
        </Field>
        <Field label={t('note')}>
          <Input value={note} onChange={(e) => setNote(e.target.value)} />
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
