'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { PiggyBank, Plus, Trash2, Pencil } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { FormEvent, useState } from 'react';
import {
  PARTNER_ENTRY_TYPES,
  type CashRegisterDto,
  type Locale,
  type PartnerDto,
  type PartnerEntryType,
  type PartnerLedgerEntryDto,
} from '@my-store/shared';
import { api } from '@/lib/api-client';
import { formatDate, formatMoney, formatNumber } from '@/lib/format';
import { Badge, Button, Card, ErrorText, Field, Input, Modal, Select, Spinner } from '@/components/ui';

const ENTRY_TONES: Record<PartnerEntryType, string> = {
  PROFIT: 'APPROVED',
  LOSS: 'danger',
  WITHDRAWAL: 'PENDING',
  ADJUSTMENT: 'SHIPPING',
};

export default function PartnersPage() {
  const t = useTranslations('partners');
  const tc = useTranslations('common');
  const queryClient = useQueryClient();

  const [editing, setEditing] = useState<PartnerDto | null | 'new'>(null);
  const [entryFor, setEntryFor] = useState<PartnerDto | null>(null);
  const [distributing, setDistributing] = useState(false);

  const { data: partners, isPending, error } = useQuery({
    queryKey: ['partners'],
    queryFn: () => api.get<PartnerDto[]>('/partners'),
  });

  const removeMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/partners/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['partners'] }),
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-black text-ink">{t('title')}</h1>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => setDistributing(true)}>
            <PiggyBank className="h-4 w-4" aria-hidden />
            {t('distribute')}
          </Button>
          <Button onClick={() => setEditing('new')}>
            <Plus className="h-4 w-4" aria-hidden />
            {t('new')}
          </Button>
        </div>
      </div>

      <ErrorText error={error} />
      <ErrorText error={removeMutation.error} />

      {isPending ? (
        <Spinner />
      ) : partners && partners.length > 0 ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {partners.map((partner) => (
            <PartnerCard
              key={partner.id}
              partner={partner}
              onEdit={() => setEditing(partner)}
              onRemove={() => {
                if (confirm(t('deleteConfirm'))) removeMutation.mutate(partner.id);
              }}
              onAddEntry={() => setEntryFor(partner)}
            />
          ))}
        </div>
      ) : (
        <Card className="p-8 text-center text-ink-faint">{tc('noData')}</Card>
      )}

      <LedgerHistory />

      {editing && <PartnerModal partner={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />}
      {entryFor && <LedgerEntryModal partner={entryFor} onClose={() => setEntryFor(null)} />}
      {distributing && <DistributeModal onClose={() => setDistributing(false)} />}
    </div>
  );
}

function PartnerCard({
  partner,
  onEdit,
  onRemove,
  onAddEntry,
}: {
  partner: PartnerDto;
  onEdit: () => void;
  onRemove: () => void;
  onAddEntry: () => void;
}) {
  const t = useTranslations('partners');
  const tc = useTranslations('common');
  const locale = useLocale() as Locale;
  const balance = Number(partner.balance);

  return (
    <Card className="space-y-3 p-4">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="font-bold text-ink">{partner.name}</p>
          {partner.phone && <p className="text-xs text-ink-faint" dir="ltr">{partner.phone}</p>}
        </div>
        <div className="flex items-center gap-1">
          {!partner.isActive && <Badge tone="danger">{tc('inactive')}</Badge>}
          <button
            onClick={onEdit}
            className="cursor-pointer rounded-lg p-1.5 text-ink-muted hover:bg-surface-3 hover:text-ink"
            aria-label={tc('edit')}
          >
            <Pencil className="h-4 w-4" aria-hidden />
          </button>
          <button
            onClick={onRemove}
            className="cursor-pointer rounded-lg p-1.5 text-ink-muted hover:bg-red-100 hover:text-red-700 dark:hover:bg-red-900/30"
            aria-label={tc('delete')}
          >
            <Trash2 className="h-4 w-4" aria-hidden />
          </button>
        </div>
      </div>

      {partner.sharePercent != null && (
        <p className="text-xs text-ink-muted">
          {t('sharePercent')}: <span className="font-medium text-ink">{formatNumber(Number(partner.sharePercent), locale)}%</span>
        </p>
      )}

      <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
        <div className="flex justify-between col-span-2 border-b border-line pb-1">
          <dt className="text-ink-muted">{t('balance')}</dt>
          <dd className={`font-black ${balance < 0 ? 'text-red-700 dark:text-red-400' : 'text-primary-700 dark:text-primary-300'}`}>
            {formatMoney(partner.balance, locale)}
          </dd>
        </div>
        <div className="flex justify-between">
          <dt className="text-ink-muted">{t('totalProfit')}</dt>
          <dd className="text-ink">{formatMoney(partner.totalProfit, locale)}</dd>
        </div>
        <div className="flex justify-between">
          <dt className="text-ink-muted">{t('totalLoss')}</dt>
          <dd className="text-ink">{formatMoney(partner.totalLoss, locale)}</dd>
        </div>
        <div className="flex justify-between col-span-2">
          <dt className="text-ink-muted">{t('totalWithdrawn')}</dt>
          <dd className="text-ink">{formatMoney(partner.totalWithdrawn, locale)}</dd>
        </div>
      </dl>

      {partner.notes && <p className="text-xs text-ink-faint">{partner.notes}</p>}

      <Button variant="outline" className="w-full" onClick={onAddEntry}>
        {t('recordEntry')}
      </Button>
    </Card>
  );
}

function PartnerModal({ partner, onClose }: { partner: PartnerDto | null; onClose: () => void }) {
  const t = useTranslations('partners');
  const tc = useTranslations('common');
  const queryClient = useQueryClient();
  const [name, setName] = useState(partner?.name ?? '');
  const [phone, setPhone] = useState(partner?.phone ?? '');
  const [sharePercent, setSharePercent] = useState(partner?.sharePercent ?? '');
  const [notes, setNotes] = useState(partner?.notes ?? '');
  const [isActive, setIsActive] = useState(partner?.isActive ?? true);

  const mutation = useMutation({
    mutationFn: () => {
      const body = {
        name,
        phone: phone || undefined,
        sharePercent: sharePercent === '' ? undefined : Number(sharePercent),
        notes: notes || undefined,
        ...(partner && { isActive }),
      };
      return partner ? api.patch(`/partners/${partner.id}`, body) : api.post('/partners', body);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['partners'] });
      onClose();
    },
  });

  function submit(e: FormEvent) {
    e.preventDefault();
    mutation.mutate();
  }

  return (
    <Modal open title={partner ? t('editPartner') : t('newPartner')} onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        <Field label={t('name')}>
          <Input required value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label={t('phone')}>
            <Input dir="ltr" value={phone} onChange={(e) => setPhone(e.target.value)} />
          </Field>
          <Field label={t('sharePercent')} hint={t('sharePercentHint')}>
            <Input
              type="number"
              min={0}
              max={100}
              step="0.01"
              dir="ltr"
              value={sharePercent}
              onChange={(e) => setSharePercent(e.target.value)}
            />
          </Field>
        </div>
        <Field label={t('notes')}>
          <Input value={notes} onChange={(e) => setNotes(e.target.value)} />
        </Field>
        {partner && (
          <label className="flex items-center gap-2 text-sm text-ink">
            <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} />
            {tc('active')}
          </label>
        )}
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

function LedgerEntryModal({ partner, onClose }: { partner: PartnerDto; onClose: () => void }) {
  const t = useTranslations('partners');
  const tc = useTranslations('common');
  const queryClient = useQueryClient();
  const [type, setType] = useState<PartnerEntryType>('PROFIT');
  const [amount, setAmount] = useState('');
  const [period, setPeriod] = useState('');
  const [method, setMethod] = useState('');
  const [note, setNote] = useState('');
  const [registerId, setRegisterId] = useState('');

  const { data: registers } = useQuery({
    queryKey: ['cash-registers'],
    queryFn: () => api.get<CashRegisterDto[]>('/cash-registers'),
    enabled: type === 'WITHDRAWAL',
  });

  const mutation = useMutation({
    mutationFn: () =>
      api.post(`/partners/${partner.id}/entries`, {
        type,
        amount: Number(amount),
        period: period || undefined,
        method: method || undefined,
        note: note || undefined,
        registerId: type === 'WITHDRAWAL' ? registerId || undefined : undefined,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['partners'] });
      queryClient.invalidateQueries({ queryKey: ['partners-ledger'] });
      queryClient.invalidateQueries({ queryKey: ['cash-registers'] });
      onClose();
    },
  });

  function submit(e: FormEvent) {
    e.preventDefault();
    mutation.mutate();
  }

  return (
    <Modal open title={`${t('recordEntry')}: ${partner.name}`} onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <Field label={t('entryType')}>
            <Select value={type} onChange={(e) => setType(e.target.value as PartnerEntryType)}>
              {PARTNER_ENTRY_TYPES.map((entryType) => (
                <option key={entryType} value={entryType}>
                  {t(`entryTypes.${entryType}`)}
                </option>
              ))}
            </Select>
          </Field>
          <Field label={t('amount')}>
            <Input
              required
              type="number"
              min={type === 'ADJUSTMENT' ? undefined : 0.01}
              step="0.01"
              dir="ltr"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
          </Field>
        </div>
        {type === 'WITHDRAWAL' && (
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
        )}
        <Field label={t('period')} hint={t('periodHint')}>
          <Input dir="ltr" value={period} onChange={(e) => setPeriod(e.target.value)} placeholder="2026-09" />
        </Field>
        <Field label={t('method')} hint={t('methodHint')}>
          <Input value={method} onChange={(e) => setMethod(e.target.value)} />
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

interface DistributionPreviewRow {
  partnerId: string;
  partnerName: string;
  sharePercent: string;
  amount: string;
  method: string;
}

function DistributeModal({ onClose }: { onClose: () => void }) {
  const t = useTranslations('partners');
  const tc = useTranslations('common');
  const locale = useLocale() as Locale;
  const queryClient = useQueryClient();
  const [totalAmount, setTotalAmount] = useState('');
  const [type, setType] = useState<'PROFIT' | 'LOSS'>('PROFIT');
  const [period, setPeriod] = useState('');
  const [preview, setPreview] = useState<DistributionPreviewRow[] | null>(null);

  const previewMutation = useMutation({
    mutationFn: () =>
      api.post<DistributionPreviewRow[]>('/partners/distribute/preview', {
        totalAmount: Number(totalAmount),
        type,
        period: period || undefined,
      }),
    onSuccess: (rows) => setPreview(rows),
  });

  const confirmMutation = useMutation({
    mutationFn: () =>
      api.post('/partners/distribute', {
        totalAmount: Number(totalAmount),
        type,
        period: period || undefined,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['partners'] });
      queryClient.invalidateQueries({ queryKey: ['partners-ledger'] });
      onClose();
    },
  });

  function submitPreview(e: FormEvent) {
    e.preventDefault();
    setPreview(null);
    previewMutation.mutate();
  }

  return (
    <Modal open title={t('distribute')} onClose={onClose}>
      <form onSubmit={submitPreview} className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <Field label={t('entryType')}>
            <Select value={type} onChange={(e) => { setType(e.target.value as 'PROFIT' | 'LOSS'); setPreview(null); }}>
              <option value="PROFIT">{t('entryTypes.PROFIT')}</option>
              <option value="LOSS">{t('entryTypes.LOSS')}</option>
            </Select>
          </Field>
          <Field label={t('totalAmount')}>
            <Input
              required
              type="number"
              min={0.01}
              step="0.01"
              dir="ltr"
              value={totalAmount}
              onChange={(e) => { setTotalAmount(e.target.value); setPreview(null); }}
            />
          </Field>
        </div>
        <Field label={t('period')} hint={t('periodHint')}>
          <Input dir="ltr" value={period} onChange={(e) => setPeriod(e.target.value)} placeholder="2026-09" />
        </Field>
        <ErrorText error={previewMutation.error} />
        <Button type="submit" variant="outline" loading={previewMutation.isPending}>
          {t('previewDistribution')}
        </Button>

        {preview && (
          <div className="space-y-2 border-t border-line pt-3">
            {preview.length === 0 ? (
              <p className="text-sm text-ink-faint">{t('noActivePartners')}</p>
            ) : (
              <>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-xs text-ink-muted">
                      <th className="p-1.5 text-start font-medium">{t('name')}</th>
                      <th className="p-1.5 text-start font-medium">{t('sharePercent')}</th>
                      <th className="p-1.5 text-start font-medium">{t('amount')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {preview.map((row) => (
                      <tr key={row.partnerId} className="border-t border-line/60">
                        <td className="p-1.5 text-ink">{row.partnerName}</td>
                        <td className="p-1.5 text-ink-muted" dir="ltr">{formatNumber(Number(row.sharePercent), locale)}%</td>
                        <td className="p-1.5 font-bold text-ink">{formatMoney(row.amount, locale)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <ErrorText error={confirmMutation.error} />
                <Button
                  type="button"
                  loading={confirmMutation.isPending}
                  onClick={() => confirmMutation.mutate()}
                  className="w-full"
                >
                  {t('confirmDistribution')}
                </Button>
              </>
            )}
          </div>
        )}

        <Button type="button" variant="ghost" onClick={onClose} className="w-full">
          {tc('cancel')}
        </Button>
      </form>
    </Modal>
  );
}

function LedgerHistory() {
  const t = useTranslations('partners');
  const tc = useTranslations('common');
  const locale = useLocale() as Locale;
  const [page, setPage] = useState(1);

  const { data } = useQuery({
    queryKey: ['partners-ledger', page],
    queryFn: () => api.getPaged<PartnerLedgerEntryDto[]>(`/partners/ledger?page=${page}&limit=15`),
  });

  if (!data || data.items.length === 0) return null;
  return (
    <div className="space-y-3">
      <h2 className="text-base font-bold text-ink">{t('ledgerHistory')}</h2>
      <Card className="overflow-x-auto">
        <table className="w-full min-w-[720px] text-sm">
          <thead>
            <tr className="border-b border-line text-xs text-ink-muted">
              <th className="p-3 text-start font-medium">{t('name')}</th>
              <th className="p-3 text-start font-medium">{t('entryType')}</th>
              <th className="p-3 text-start font-medium">{t('amount')}</th>
              <th className="p-3 text-start font-medium">{t('period')}</th>
              <th className="p-3 text-start font-medium">{t('method')}</th>
              <th className="p-3 text-start font-medium">{tc('date')}</th>
            </tr>
          </thead>
          <tbody>
            {data.items.map((entry) => (
              <tr key={entry.id} className="border-b border-line/60 last:border-0">
                <td className="p-3 text-ink">{entry.partnerName}</td>
                <td className="p-3">
                  <Badge tone={ENTRY_TONES[entry.type]}>{t(`entryTypes.${entry.type}`)}</Badge>
                </td>
                <td className="p-3 font-bold text-ink">{formatMoney(entry.amount, locale)}</td>
                <td className="p-3 text-ink-muted" dir="ltr">{entry.period ?? '—'}</td>
                <td className="p-3 text-xs text-ink-faint">{entry.method ?? '—'}</td>
                <td className="p-3 text-xs text-ink-faint">{formatDate(entry.createdAt, locale)}</td>
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
          <Button variant="outline" disabled={page >= data.meta.totalPages} onClick={() => setPage((p) => p + 1)}>
            {tc('next')}
          </Button>
        </div>
      )}
    </div>
  );
}
