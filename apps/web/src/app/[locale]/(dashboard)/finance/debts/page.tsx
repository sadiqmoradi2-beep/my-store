'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Banknote, Plus, Trash2, UserRound } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import Link from 'next/link';
import { FormEvent, useState } from 'react';
import {
  type CashRegisterDto,
  type Currency,
  type DebtDirection,
  type DebtDto,
  type DebtStatus,
  type Locale,
  type SupplierDto,
} from '@my-store/shared';
import { api } from '@/lib/api-client';
import { formatDate, formatMoney, formatNumber } from '@/lib/format';
import { Badge, Button, Card, ErrorText, Field, Input, Modal, Select, Spinner, cn } from '@/components/ui';
import { ExportButtons } from '@/components/export-buttons';

const STATUS_TONES: Record<DebtStatus, string> = {
  OPEN: 'PENDING',
  PARTIAL: 'SHIPPING',
  SETTLED: 'DELIVERED',
};

export default function DebtsPage() {
  const t = useTranslations('debts');
  const tc = useTranslations('common');
  const locale = useLocale() as Locale;

  const [direction, setDirection] = useState<DebtDirection | ''>('');
  const [page, setPage] = useState(1);
  const [creating, setCreating] = useState(false);
  const [paying, setPaying] = useState<DebtDto | null>(null);
  const queryClient = useQueryClient();

  const { data: summary } = useQuery({
    queryKey: ['debts-summary'],
    queryFn: () => api.get<{ receivable: string; payable: string }>('/debts/summary'),
  });
  const { data, isPending, error } = useQuery({
    queryKey: ['debts', direction, page],
    queryFn: () =>
      api.getPaged<DebtDto[]>(
        `/debts?page=${page}&limit=15${direction ? `&direction=${direction}` : ''}`,
      ),
  });

  const removeMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/debts/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['debts'] });
      queryClient.invalidateQueries({ queryKey: ['debts-summary'] });
    },
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-black text-ink">{t('title')}</h1>
        <div className="flex flex-wrap gap-2">
          <ExportButtons path="/exports/debts" />
          <Button onClick={() => setCreating(true)}>
            <Plus className="h-4 w-4" aria-hidden />
            {t('new')}
          </Button>
        </div>
      </div>

      {summary && (
        <div className="grid gap-3 sm:grid-cols-2">
          <Card className="p-4">
            <p className="text-sm text-ink-muted">{t('receivableTotal')}</p>
            <p className="mt-1 text-xl font-black text-primary-700 dark:text-primary-300">
              {formatMoney(summary.receivable, locale)}{' '}
              <span className="text-xs font-normal text-ink-faint">{tc('currency')}</span>
            </p>
          </Card>
          <Card className="p-4">
            <p className="text-sm text-ink-muted">{t('payableTotal')}</p>
            <p className="mt-1 text-xl font-black text-red-700 dark:text-red-400">
              {formatMoney(summary.payable, locale)}{' '}
              <span className="text-xs font-normal text-ink-faint">{tc('currency')}</span>
            </p>
          </Card>
        </div>
      )}

      <div className="flex flex-wrap gap-1.5">
        {(['', 'RECEIVABLE', 'PAYABLE'] as const).map((dir) => (
          <button
            key={dir || 'all'}
            onClick={() => {
              setDirection(dir);
              setPage(1);
            }}
            className={cn(
              'cursor-pointer rounded-full px-3.5 py-1.5 text-xs font-semibold transition-colors duration-200',
              direction === dir
                ? 'bg-primary-700 text-white dark:bg-primary-600'
                : 'border border-line bg-surface-2 text-ink-muted hover:text-ink',
            )}
          >
            {dir === '' ? t('all') : t(`directions.${dir}`)}
          </button>
        ))}
      </div>

      <ErrorText error={error} />
      <ErrorText error={removeMutation.error} />
      {isPending ? (
        <Spinner />
      ) : (
        <Card className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-sm">
            <thead>
              <tr className="border-b border-line text-xs text-ink-muted">
                <th className="p-3 text-start font-medium">{t('party')}</th>
                <th className="p-3 text-start font-medium">{t('direction')}</th>
                <th className="p-3 text-start font-medium">{t('amount')}</th>
                <th className="p-3 text-start font-medium">{t('remaining')}</th>
                <th className="p-3 text-start font-medium">{t('dueDate')}</th>
                <th className="p-3 text-start font-medium">{tc('actions')}</th>
              </tr>
            </thead>
            <tbody>
              {data?.items.length === 0 && (
                <tr>
                  <td colSpan={6} className="p-8 text-center text-ink-faint">
                    {tc('noData')}
                  </td>
                </tr>
              )}
              {data?.items.map((debt) => {
                const remaining = Number(debt.amount) - Number(debt.paidAmount);
                return (
                  <tr
                    key={debt.id}
                    className="border-b border-line/60 transition-colors last:border-0 hover:bg-surface-3/50"
                  >
                    <td className="p-3">
                      {debt.supplierId ? (
                        <Link
                          href={`/${locale}/finance/debts/supplier/${debt.supplierId}`}
                          className="font-bold text-primary-700 hover:underline dark:text-primary-300"
                        >
                          {debt.partyName}
                        </Link>
                      ) : (
                        <p className="font-bold text-ink">{debt.partyName}</p>
                      )}
                      {debt.notes && <p className="text-xs text-ink-faint">{debt.notes}</p>}
                    </td>
                    <td className="p-3">
                      <Badge tone={debt.direction === 'RECEIVABLE' ? 'APPROVED' : 'danger'}>
                        {t(`directions.${debt.direction}`)}
                      </Badge>
                    </td>
                    <td className="p-3 text-ink">
                      {formatMoney(debt.amount, locale)}{' '}
                      <span className="text-xs text-ink-faint">{t(`currencies.${debt.currency}`)}</span>
                    </td>
                    <td className="p-3">
                      <p className="font-bold text-ink">{formatMoney(remaining, locale)}</p>
                      <Badge tone={STATUS_TONES[debt.status]}>{t(`statuses.${debt.status}`)}</Badge>
                    </td>
                    <td className="p-3 text-xs text-ink-faint">
                      {debt.dueDate ? formatDate(debt.dueDate, locale) : '—'}
                    </td>
                    <td className="p-3">
                      <div className="flex gap-1">
                        {debt.status !== 'SETTLED' && (
                          <button
                            onClick={() => setPaying(debt)}
                            aria-label={t('pay')}
                            title={t('pay')}
                            className="cursor-pointer rounded-lg p-1.5 text-ink-muted transition-colors hover:bg-primary-100 hover:text-primary-800 dark:hover:bg-primary-800/40"
                          >
                            <Banknote className="h-4 w-4" />
                          </button>
                        )}
                        {Number(debt.paidAmount) === 0 && (
                          <button
                            onClick={() => {
                              if (confirm(t('deleteConfirm'))) removeMutation.mutate(debt.id);
                            }}
                            aria-label={tc('delete')}
                            className="cursor-pointer rounded-lg p-1.5 text-ink-muted transition-colors hover:bg-red-50 hover:text-red-700 dark:hover:bg-red-950/40"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Card>
      )}

      {data && data.meta.totalPages > 1 && (
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

      {creating && <DebtModal onClose={() => setCreating(false)} />}
      {paying && <PayDebtModal debt={paying} onClose={() => setPaying(null)} />}
    </div>
  );
}

function DebtModal({ onClose }: { onClose: () => void }) {
  const t = useTranslations('debts');
  const tc = useTranslations('common');
  const queryClient = useQueryClient();
  const [form, setForm] = useState({
    direction: 'RECEIVABLE' as DebtDirection,
    linkMode: 'text' as 'text' | 'link',
    partyName: '',
    partyId: '',
    amount: '',
    currency: 'USDT' as Currency,
    dueDate: '',
    notes: '',
  });
  const set = (patch: Partial<typeof form>) => setForm((f) => ({ ...f, ...patch }));

  const mutation = useMutation({
    mutationFn: () =>
      api.post('/debts', {
        direction: form.direction,
        ...(form.linkMode === 'link' ? { supplierId: form.partyId } : { partyName: form.partyName }),
        amount: Number(form.amount),
        currency: form.currency,
        dueDate: form.dueDate || undefined,
        notes: form.notes || undefined,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['debts'] });
      queryClient.invalidateQueries({ queryKey: ['debts-summary'] });
      onClose();
    },
  });

  function submit(e: FormEvent) {
    e.preventDefault();
    mutation.mutate();
  }

  // Only payables can be linked to a person (a supplier) — receivables are entered by name
  const linked = form.direction === 'PAYABLE' && form.linkMode === 'link';
  const canSubmit = linked ? !!form.partyId : !!form.partyName;

  return (
    <Modal open title={t('new')} onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        <Field label={t('direction')}>
          <Select
            value={form.direction}
            onChange={(e) =>
              set({ direction: e.target.value as DebtDirection, linkMode: 'text', partyId: '', partyName: '' })
            }
          >
            <option value="RECEIVABLE">{t('directions.RECEIVABLE')}</option>
            <option value="PAYABLE">{t('directions.PAYABLE')}</option>
          </Select>
        </Field>

        {form.direction === 'PAYABLE' && (
        <div className="flex flex-wrap gap-1.5">
          {(['link', 'text'] as const).map((mode) => (
            <button
              key={mode}
              type="button"
              onClick={() => set({ linkMode: mode, partyId: '', partyName: '' })}
              className={cn(
                'cursor-pointer rounded-full px-3.5 py-1.5 text-xs font-semibold transition-colors duration-200',
                form.linkMode === mode
                  ? 'bg-primary-700 text-white dark:bg-primary-600'
                  : 'border border-line bg-surface-2 text-ink-muted hover:text-ink',
              )}
            >
              {mode === 'link' ? t('linkToPerson') : t('freeText')}
            </button>
          ))}
        </div>
        )}

        {linked ? (
          <Field label={t('selectSupplier')}>
            <PartyPicker
              selectedId={form.partyId}
              onSelect={(id) => set({ partyId: id })}
            />
          </Field>
        ) : (
          <Field label={t('party')}>
            <Input required value={form.partyName} onChange={(e) => set({ partyName: e.target.value })} />
          </Field>
        )}

        <div className="grid grid-cols-2 gap-3">
          <Field label={t('amount')}>
            <Input
              required
              type="number"
              min={0.01}
              step="0.01"
              dir="ltr"
              value={form.amount}
              onChange={(e) => set({ amount: e.target.value })}
            />
          </Field>
        </div>
        <Field label={t('dueDate')}>
          <Input type="date" dir="ltr" value={form.dueDate} onChange={(e) => set({ dueDate: e.target.value })} />
        </Field>
        <Field label={t('notes')}>
          <Input value={form.notes} onChange={(e) => set({ notes: e.target.value })} />
        </Field>
        <ErrorText error={mutation.error} />
        <div className="flex gap-2">
          <Button type="submit" disabled={!canSubmit} loading={mutation.isPending}>
            {tc('create')}
          </Button>
          <Button type="button" variant="ghost" onClick={onClose}>
            {tc('cancel')}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

function PartyPicker({
  selectedId,
  onSelect,
}: {
  selectedId: string;
  onSelect: (id: string, name: string) => void;
}) {
  const t = useTranslations('debts');
  const [search, setSearch] = useState('');
  const [selectedName, setSelectedName] = useState('');

  const { data } = useQuery({
    queryKey: ['debt-party-search', search],
    queryFn: async (): Promise<{ items: SupplierDto[] }> => {
      const rows = await api.get<SupplierDto[]>('/suppliers');
      return {
        items: search ? rows.filter((r) => r.name.toLowerCase().includes(search.toLowerCase())) : rows.slice(0, 8),
      };
    },
  });

  if (selectedId && selectedName) {
    return (
      <div className="flex items-center justify-between gap-2 rounded-lg border border-line p-2.5 text-sm">
        <span className="flex items-center gap-2 text-ink">
          <UserRound className="h-4 w-4 text-primary-600" aria-hidden />
          {selectedName}
        </span>
        <button
          type="button"
          onClick={() => {
            setSelectedName('');
            onSelect('', '');
          }}
          className="cursor-pointer rounded p-1 text-ink-faint hover:text-red-600"
        >
          {t('change')}
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <Input
        placeholder={t('partySearch')}
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />
      <div className="max-h-40 space-y-1 overflow-y-auto">
        {data?.items.map((party) => {
          const name = party.name;
          return (
            <button
              key={party.id}
              type="button"
              onClick={() => {
                setSelectedName(name);
                onSelect(party.id, name);
              }}
              className="flex w-full cursor-pointer items-center justify-between rounded-lg p-2 text-start text-sm transition-colors hover:bg-surface-3"
            >
              <span className="text-ink">{name}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function PayDebtModal({ debt, onClose }: { debt: DebtDto; onClose: () => void }) {
  const t = useTranslations('debts');
  const tc = useTranslations('common');
  const locale = useLocale() as Locale;
  const queryClient = useQueryClient();
  const remaining = Number(debt.amount) - Number(debt.paidAmount);
  const [amount, setAmount] = useState(String(remaining));
  const [registerId, setRegisterId] = useState('');
  const [note, setNote] = useState('');
  const [proofFile, setProofFile] = useState<File | null>(null);
  const [uploadError, setUploadError] = useState<unknown>(null);
  const [uploading, setUploading] = useState(false);

  const { data: registers } = useQuery({
    queryKey: ['cash-registers'],
    queryFn: () => api.get<CashRegisterDto[]>('/cash-registers'),
  });

  const mutation = useMutation({
    mutationFn: async () => {
      let proofImageUrl: string | undefined;
      if (proofFile) {
        setUploading(true);
        setUploadError(null);
        try {
          const form = new FormData();
          form.append('file', proofFile);
          const res = await api.upload<{ url: string }>('/uploads/payment-proofs', form);
          proofImageUrl = res.url;
        } catch (err) {
          setUploadError(err);
          throw err;
        } finally {
          setUploading(false);
        }
      }
      return api.post(`/debts/${debt.id}/payments`, {
        amount: Number(amount),
        registerId: registerId || undefined,
        proofImageUrl,
        note: note || undefined,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['debts'] });
      queryClient.invalidateQueries({ queryKey: ['debts-summary'] });
      queryClient.invalidateQueries({ queryKey: ['debt-ledger'] });
      queryClient.invalidateQueries({ queryKey: ['cash-registers'] });
      onClose();
    },
  });

  function submit(e: FormEvent) {
    e.preventDefault();
    mutation.mutate();
  }

  return (
    <Modal open title={`${t('pay')}: ${debt.partyName}`} onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        <p className="text-sm text-ink-muted">
          {t('remainingHint', {
            amount: `${formatMoney(remaining, locale)} ${t(`currencies.${debt.currency}`)}`,
          })}
        </p>
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
        <Field
          label={t('register')}
          hint={debt.direction === 'RECEIVABLE' ? t('registerHintIn') : t('registerHintOut')}
        >
          <Select value={registerId} onChange={(e) => setRegisterId(e.target.value)}>
            <option value="">{t('noRegister')}</option>
            {registers?.map((register) => (
              <option key={register.id} value={register.id}>
                {register.name} — {register.branchName}
              </option>
            ))}
          </Select>
        </Field>
        <Field label={t('notes')}>
          <Input value={note} onChange={(e) => setNote(e.target.value)} />
        </Field>
        <Field label={t('proof')} hint={t('proofHint')}>
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp,application/pdf"
            onChange={(e) => setProofFile(e.target.files?.[0] ?? null)}
            className="block w-full text-sm text-ink-muted file:me-3 file:rounded-lg file:border-0 file:bg-surface-3 file:px-3 file:py-2 file:text-sm file:font-medium file:text-ink"
          />
        </Field>
        <ErrorText error={uploadError} />
        <ErrorText error={mutation.error} />
        <div className="flex gap-2">
          <Button type="submit" loading={mutation.isPending || uploading}>
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
