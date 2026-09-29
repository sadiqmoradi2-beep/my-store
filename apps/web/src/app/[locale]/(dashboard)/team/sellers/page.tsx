'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Banknote, Pencil, Plus, Trash2 } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { FormEvent, useState } from 'react';
import { PERMISSIONS, SELLER_PAY_TYPES, SELLER_PAY_TYPE_NAMES, type CashRegisterDto, type Locale, type RoleDto, type SellerDto, type SellerPayType, type UserDto } from '@my-store/shared';
import { api } from '@/lib/api-client';
import { formatMoney, formatNumber } from '@/lib/format';
import { Badge, Button, Card, ErrorText, Field, Input, Modal, Select, Spinner, Textarea } from '@/components/ui';
import { useRequirePermission } from '@/hooks/use-require-permission';
import { useAuthStore } from '@/stores/auth-store';

export default function SellersPage() {
  const t = useTranslations('sellers');
  const tc = useTranslations('common');
  const locale = useLocale() as Locale;
  const allowed = useRequirePermission(PERMISSIONS.SELLERS_READ);
  const canDeleteAccount = !!useAuthStore((s) => s.user)?.permissions?.includes(PERMISSIONS.USERS_DELETE);
  const queryClient = useQueryClient();

  const [editing, setEditing] = useState<SellerDto | null | 'new'>(null);
  const [payingSalary, setPayingSalary] = useState<SellerDto | null>(null);
  const [tempPasswordInfo, setTempPasswordInfo] = useState<{ name: string; password: string } | null>(null);

  const { data: sellers, isPending, error } = useQuery({
    queryKey: ['sellers'],
    queryFn: () => api.get<SellerDto[]>('/sellers'),
    enabled: allowed,
  });

  const deleteAccount = useMutation({
    mutationFn: (seller: SellerDto) => api.delete(`/users/${seller.userId}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['sellers'] }),
  });

  if (!allowed) {
    return <p className="p-8 text-center text-sm text-ink-faint">{tc('accessDenied')}</p>;
  }

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
          <table className="w-full min-w-[720px] text-sm">
            <thead>
              <tr className="border-b border-line text-xs text-ink-muted">
                <th className="p-3 text-start font-medium">{t('seller')}</th>
                <th className="p-3 text-start font-medium">{t('payType')}</th>
                <th className="p-3 text-start font-medium">{t('salesCount')}</th>
                <th className="p-3 text-start font-medium">{t('salesTotal')}</th>
                <th className="p-3 text-start font-medium">{t('commissionTotal')}</th>
                <th className="p-3 text-start font-medium">{tc('actions')}</th>
              </tr>
            </thead>
            <tbody>
              {sellers?.length === 0 && (
                <tr>
                  <td colSpan={6} className="p-8 text-center text-ink-faint">
                    {tc('noData')}
                  </td>
                </tr>
              )}
              {sellers?.map((seller) => (
                <tr
                  key={seller.id}
                  className="border-b border-line/60 transition-colors last:border-0 hover:bg-surface-3/50"
                >
                  <td className="p-3">
                    <p className="font-bold text-ink">{seller.fullName}</p>
                    <div className="mt-0.5 flex items-center gap-2">
                      <span className="text-xs text-ink-faint" dir="ltr">
                        {seller.email}
                      </span>
                      {!seller.isActive && <Badge tone="danger">{tc('inactive')}</Badge>}
                    </div>
                  </td>
                  <td className="p-3 font-bold text-ink">
                    {seller.payType === 'FIXED_SALARY' ? (
                      <>
                        {t('fixedSalaryShort')}
                        {seller.fixedSalaryAmount && (
                          <span className="ms-1 text-xs font-normal text-ink-faint">
                            ({formatMoney(seller.fixedSalaryAmount, locale)} {tc('currency')})
                          </span>
                        )}
                      </>
                    ) : (
                      `${formatNumber(Number(seller.commissionPercent), locale)}%`
                    )}
                  </td>
                  <td className="p-3 text-ink-muted">
                    {formatNumber(seller.salesCount ?? 0, locale)}
                  </td>
                  <td className="p-3 text-ink">
                    {formatMoney(seller.salesTotal ?? 0, locale)}{' '}
                    <span className="text-xs text-ink-faint">{tc('currency')}</span>
                  </td>
                  <td className="p-3 font-bold text-primary-700 dark:text-primary-300">
                    {formatMoney(seller.commissionTotal ?? 0, locale)}{' '}
                    <span className="text-xs font-normal text-ink-faint">{tc('currency')}</span>
                  </td>
                  <td className="p-3">
                    <div className="flex gap-1">
                      {seller.payType === 'FIXED_SALARY' && (
                        <button
                          onClick={() => setPayingSalary(seller)}
                          aria-label={t('paySalary')}
                          title={t('paySalary')}
                          className="cursor-pointer rounded-lg p-1.5 text-ink-muted transition-colors hover:bg-primary-100 hover:text-primary-800 dark:hover:bg-primary-800/40"
                        >
                          <Banknote className="h-4 w-4" />
                        </button>
                      )}
                      <button
                        onClick={() => setEditing(seller)}
                        aria-label={tc('edit')}
                        className="cursor-pointer rounded-lg p-1.5 text-ink-muted transition-colors hover:bg-primary-100 hover:text-primary-800 dark:hover:bg-primary-800/40"
                      >
                        <Pencil className="h-4 w-4" />
                      </button>
                      {canDeleteAccount && (
                        <button
                          onClick={() => {
                            if (confirm(t('deleteAccountConfirm'))) deleteAccount.mutate(seller);
                          }}
                          disabled={deleteAccount.isPending}
                          aria-label={t('deleteAccount')}
                          title={t('deleteAccount')}
                          className="cursor-pointer rounded-lg p-1.5 text-ink-muted transition-colors hover:bg-red-100 hover:text-red-700 dark:hover:bg-red-900/30"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
      <ErrorText error={deleteAccount.error} />

      {editing !== null && (
        <SellerModal
          seller={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
          onCreatedWithLogin={(name, password) => setTempPasswordInfo({ name, password })}
        />
      )}
      {payingSalary && (
        <PaySellerSalaryModal seller={payingSalary} onClose={() => setPayingSalary(null)} />
      )}
      {tempPasswordInfo && (
        <TempPasswordModal info={tempPasswordInfo} onClose={() => setTempPasswordInfo(null)} />
      )}
    </div>
  );
}

function SellerModal({
  seller,
  onClose,
  onCreatedWithLogin,
}: {
  seller: SellerDto | null;
  onClose: () => void;
  onCreatedWithLogin: (name: string, password: string) => void;
}) {
  const t = useTranslations('sellers');
  const tc = useTranslations('common');
  const locale = useLocale() as Locale;
  const queryClient = useQueryClient();
  const [accountSource, setAccountSource] = useState<'NEW' | 'EXISTING'>('NEW');
  const [userId, setUserId] = useState('');
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [payType, setPayType] = useState<SellerPayType>(seller?.payType ?? 'COMMISSION');
  const [percent, setPercent] = useState(seller?.commissionPercent ?? '');
  const [fixedAmount, setFixedAmount] = useState(seller?.fixedSalaryAmount ?? '');
  const [isActive, setIsActive] = useState(seller?.isActive ?? true);
  const [notes, setNotes] = useState(seller?.notes ?? '');

  const { data: users } = useQuery({
    queryKey: ['users-for-seller'],
    queryFn: () => api.getPaged<UserDto[]>('/users?limit=100'),
    enabled: !seller && accountSource === 'EXISTING',
  });

  const { data: roles } = useQuery({
    queryKey: ['roles'],
    queryFn: () => api.get<RoleDto[]>('/roles'),
    enabled: !!seller,
  });
  const [reassignRoleId, setReassignRoleId] = useState(seller?.roleId ?? '');
  const reassignRole = useMutation({
    mutationFn: () => api.patch(`/users/${seller!.userId}`, { roleId: reassignRoleId }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['sellers'] }),
  });

  const mutation = useMutation({
    mutationFn: () => {
      const payload = {
        payType,
        commissionPercent: payType === 'COMMISSION' ? Number(percent) : undefined,
        fixedSalaryAmount: payType === 'FIXED_SALARY' ? Number(fixedAmount) : undefined,
        notes: notes || undefined,
      };
      if (seller) return api.patch(`/sellers/${seller.id}`, { ...payload, isActive });
      return api.post<SellerDto & { tempPassword?: string }>('/sellers', {
        ...payload,
        ...(accountSource === 'EXISTING'
          ? { userId }
          : { fullName, email, phone: phone || undefined }),
      });
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['sellers'] });
      if (!seller && (data as { tempPassword?: string })?.tempPassword) {
        onCreatedWithLogin(fullName, (data as { tempPassword: string }).tempPassword);
      }
      onClose();
    },
  });

  function submit(e: FormEvent) {
    e.preventDefault();
    mutation.mutate();
  }

  return (
    <Modal open title={seller ? `${tc('edit')}: ${seller.fullName}` : t('new')} onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        {!seller && (
          <>
            <Field label={t('accountSource')}>
              <div className="flex gap-1.5">
                {(['NEW', 'EXISTING'] as const).map((src) => (
                  <button
                    key={src}
                    type="button"
                    onClick={() => setAccountSource(src)}
                    className={`cursor-pointer rounded-full px-3.5 py-1.5 text-xs font-semibold transition-colors duration-200 ${
                      accountSource === src
                        ? 'bg-primary-700 text-white dark:bg-primary-600'
                        : 'border border-line bg-surface-2 text-ink-muted hover:text-ink'
                    }`}
                  >
                    {t(`accountSources.${src}`)}
                  </button>
                ))}
              </div>
            </Field>
            {accountSource === 'EXISTING' ? (
              <Field label={t('user')}>
                <Select required value={userId} onChange={(e) => setUserId(e.target.value)}>
                  <option value="" disabled>
                    {t('selectUser')}
                  </option>
                  {users?.items.map((user) => (
                    <option key={user.id} value={user.id}>
                      {user.fullName} — {user.email}
                    </option>
                  ))}
                </Select>
              </Field>
            ) : (
              <>
                <Field label={t('fullName')}>
                  <Input required value={fullName} onChange={(e) => setFullName(e.target.value)} />
                </Field>
                <div className="grid grid-cols-2 gap-3">
                  <Field label={t('email')}>
                    <Input required type="email" dir="ltr" value={email} onChange={(e) => setEmail(e.target.value)} />
                  </Field>
                  <Field label={t('phone')}>
                    <Input dir="ltr" value={phone} onChange={(e) => setPhone(e.target.value)} />
                  </Field>
                </div>
              </>
            )}
          </>
        )}
        <Field label={t('payType')}>
          <Select value={payType} onChange={(e) => setPayType(e.target.value as SellerPayType)}>
            {SELLER_PAY_TYPES.map((type) => (
              <option key={type} value={type}>
                {SELLER_PAY_TYPE_NAMES[type]}
              </option>
            ))}
          </Select>
        </Field>
        {payType === 'COMMISSION' ? (
          <Field label={t('commissionPercent')} hint={t('commissionHint')}>
            <Input
              required
              type="number"
              min={0}
              max={100}
              step="0.01"
              dir="ltr"
              value={percent}
              onChange={(e) => setPercent(e.target.value)}
            />
          </Field>
        ) : (
          <Field label={t('fixedSalaryAmount')}>
            <Input
              required
              type="number"
              min={0}
              step="0.01"
              dir="ltr"
              value={fixedAmount}
              onChange={(e) => setFixedAmount(e.target.value)}
            />
          </Field>
        )}
        {seller && (
          <label className="flex cursor-pointer items-center gap-2 text-sm text-ink">
            <input
              type="checkbox"
              checked={isActive}
              onChange={(e) => setIsActive(e.target.checked)}
              className="h-4 w-4 cursor-pointer accent-primary-600"
            />
            {tc('active')}
          </label>
        )}
        {seller && (
          <Field label={t('role')}>
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
                disabled={!reassignRoleId || reassignRoleId === seller.roleId}
                onClick={() => reassignRole.mutate()}
              >
                {tc('save')}
              </Button>
            </div>
            <ErrorText error={reassignRole.error} />
          </Field>
        )}
        <Field label={t('notes')}>
          <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} />
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

function PaySellerSalaryModal({ seller, onClose }: { seller: SellerDto; onClose: () => void }) {
  const t = useTranslations('sellers');
  const tc = useTranslations('common');
  const queryClient = useQueryClient();
  const [amount, setAmount] = useState(seller.fixedSalaryAmount ?? '');
  const [period, setPeriod] = useState('');
  const [registerId, setRegisterId] = useState('');
  const [note, setNote] = useState('');

  const { data: registers } = useQuery({
    queryKey: ['cash-registers'],
    queryFn: () => api.get<CashRegisterDto[]>('/cash-registers'),
  });

  const mutation = useMutation({
    mutationFn: () =>
      api.post(`/sellers/${seller.id}/salary-payments`, {
        amount: Number(amount),
        period,
        registerId: registerId || undefined,
        note: note || undefined,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sellers'] });
      queryClient.invalidateQueries({ queryKey: ['cash-registers'] });
      onClose();
    },
  });

  function submit(e: FormEvent) {
    e.preventDefault();
    mutation.mutate();
  }

  return (
    <Modal open title={`${t('paySalary')}: ${seller.fullName}`} onClose={onClose}>
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
            <Input required dir="ltr" value={period} onChange={(e) => setPeriod(e.target.value)} placeholder="1405-04" />
          </Field>
        </div>
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

function TempPasswordModal({
  info,
  onClose,
}: {
  info: { name: string; password: string };
  onClose: () => void;
}) {
  const t = useTranslations('sellers');
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
