'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CalendarRange, Lock, Plus } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { FormEvent, useState } from 'react';
import type { CapitalEntryDto, CapitalEntryType, Locale, WorkSeasonDto } from '@my-store/shared';
import { api } from '@/lib/api-client';
import { formatDate, formatMoney, formatNumber } from '@/lib/format';
import { Badge, Button, Card, ErrorText, Field, Input, Modal, Select, Spinner } from '@/components/ui';

type SeasonDetail = WorkSeasonDto & { entries: CapitalEntryDto[] };

export default function WorkSeasonsPage() {
  const t = useTranslations('workSeasons');
  const tc = useTranslations('common');
  const queryClient = useQueryClient();

  const [newSeason, setNewSeason] = useState(false);
  const [newEntry, setNewEntry] = useState(false);

  const { data: seasons, isPending, error } = useQuery({
    queryKey: ['work-seasons'],
    queryFn: () => api.get<WorkSeasonDto[]>('/work-seasons'),
  });
  const open = seasons?.find((s) => s.status === 'OPEN') ?? null;

  const closeMutation = useMutation({
    mutationFn: (id: string) => api.post(`/work-seasons/${id}/close`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['work-seasons'] }),
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-black text-ink">{t('title')}</h1>
        {!open && (
          <Button onClick={() => setNewSeason(true)}>
            <Plus className="h-4 w-4" aria-hidden />
            {t('new')}
          </Button>
        )}
      </div>

      <ErrorText error={error} />
      <ErrorText error={closeMutation.error} />
      {isPending ? (
        <Spinner />
      ) : (
        <>
          {open && (
            <OpenSeason
              season={open}
              onAddEntry={() => setNewEntry(true)}
              onClose={() => {
                if (confirm(t('closeConfirm'))) closeMutation.mutate(open.id);
              }}
              closing={closeMutation.isPending}
            />
          )}

          <h2 className="text-base font-bold text-ink">{t('history')}</h2>
          <div className="space-y-3">
            {seasons?.filter((s) => s.status === 'CLOSED').length === 0 && (
              <Card className="p-6 text-center text-sm text-ink-faint">{tc('noData')}</Card>
            )}
            {seasons
              ?.filter((s) => s.status === 'CLOSED')
              .map((season) => <ClosedSeason key={season.id} season={season} />)}
          </div>
        </>
      )}

      {newSeason && <SeasonModal seasons={seasons ?? []} onClose={() => setNewSeason(false)} />}
      {newEntry && open && <EntryModal seasonId={open.id} onClose={() => setNewEntry(false)} />}
    </div>
  );
}

function OpenSeason({
  season,
  onAddEntry,
  onClose,
  closing,
}: {
  season: WorkSeasonDto;
  onAddEntry: () => void;
  onClose: () => void;
  closing: boolean;
}) {
  const t = useTranslations('workSeasons');
  const tc = useTranslations('common');
  const locale = useLocale() as Locale;

  const { data: detail } = useQuery({
    queryKey: ['work-season', season.id],
    queryFn: () => api.get<SeasonDetail>(`/work-seasons/${season.id}`),
  });

  return (
    <Card className="border-primary-400 p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <CalendarRange className="h-5 w-5 text-primary-600" aria-hidden />
            <h2 className="text-lg font-black text-ink">{season.name}</h2>
            <Badge tone="APPROVED">{t('open')}</Badge>
            <Badge tone="neutral">{season.currency}</Badge>
          </div>
          <p className="mt-1 text-xs text-ink-faint">
            {t('startedAt', { date: formatDate(season.startsAt, locale) })}
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={onAddEntry}>
            <Plus className="h-4 w-4" aria-hidden />
            {t('newEntry')}
          </Button>
          <Button variant="danger" loading={closing} onClick={onClose}>
            <Lock className="h-4 w-4" aria-hidden />
            {t('close')}
          </Button>
        </div>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label={t('openingCapital')} value={formatMoney(season.openingCapital, locale)} suffix={tc('currency')} />
        <Stat label={t('openingCash')} value={formatMoney(season.openingCash, locale)} suffix={tc('currency')} />
        <Stat label={t('capitalIn')} value={formatMoney(season.capitalIn ?? 0, locale)} suffix={tc('currency')} />
        <Stat label={t('capitalOut')} value={formatMoney(season.capitalOut ?? 0, locale)} suffix={tc('currency')} />
      </div>

      {detail && detail.entries.length > 0 && (
        <div className="mt-4 divide-y divide-line/60 border-t border-line pt-2">
          {detail.entries.map((entry) => (
            <div key={entry.id} className="flex items-center justify-between gap-3 py-2 text-sm">
              <div>
                <Badge tone={entry.type === 'DEPOSIT' ? 'APPROVED' : 'danger'}>
                  {t(`entryTypes.${entry.type}`)}
                </Badge>
                {entry.note && <span className="ms-2 text-xs text-ink-faint">{entry.note}</span>}
              </div>
              <div className="text-end">
                <p className="font-bold text-ink">{formatMoney(entry.amount, locale)}</p>
                <p className="text-xs text-ink-faint">{formatDate(entry.createdAt, locale)}</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

function ClosedSeason({ season }: { season: WorkSeasonDto }) {
  const t = useTranslations('workSeasons');
  const tc = useTranslations('common');
  const locale = useLocale() as Locale;
  const report = season.closingReport;

  return (
    <Card className="p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="font-bold text-ink">{season.name}</p>
          <p className="text-xs text-ink-faint">
            {formatDate(season.startsAt, locale)}
            {' ← '}
            {season.endsAt ? formatDate(season.endsAt, locale) : '—'}
          </p>
        </div>
        <Badge tone="RETURNED">{t('closed')}</Badge>
      </div>
      {report && (
        <div className="mt-3 grid gap-3 border-t border-line pt-3 sm:grid-cols-3 lg:grid-cols-6">
          <Stat label={t('report.salesTotal')} value={formatMoney(report.salesTotal, locale)} suffix={tc('currency')} />
          <Stat label={t('report.profit')} value={formatMoney(report.profit, locale)} suffix={tc('currency')} />
          <Stat label={t('report.ordersCount')} value={formatNumber(report.ordersCount, locale)} />
          <Stat label={t('report.expensesTotal')} value={formatMoney(report.expensesTotal, locale)} suffix={tc('currency')} />
          <Stat label={t('capitalIn')} value={formatMoney(report.capitalIn, locale)} suffix={tc('currency')} />
          <Stat label={t('capitalOut')} value={formatMoney(report.capitalOut, locale)} suffix={tc('currency')} />
        </div>
      )}
    </Card>
  );
}

function Stat({ label, value, suffix }: { label: string; value: string; suffix?: string }) {
  return (
    <div className="rounded-lg bg-surface-3/50 p-3">
      <p className="text-xs text-ink-muted">{label}</p>
      <p className="mt-1 font-black text-ink">
        {value} {suffix && <span className="text-xs font-normal text-ink-faint">{suffix}</span>}
      </p>
    </div>
  );
}

function SeasonModal({ seasons, onClose }: { seasons: WorkSeasonDto[]; onClose: () => void }) {
  const t = useTranslations('workSeasons');
  const tc = useTranslations('common');
  const locale = useLocale() as Locale;
  const queryClient = useQueryClient();

  const lastClosed = seasons
    .filter((s) => s.status === 'CLOSED')
    .sort((a, b) => new Date(b.endsAt ?? 0).getTime() - new Date(a.endsAt ?? 0).getTime())[0];
  const carriedCapital = lastClosed
    ? Number(lastClosed.openingCapital) + Number(lastClosed.capitalIn ?? 0) - Number(lastClosed.capitalOut ?? 0)
    : null;

  const [name, setName] = useState('');
  const [startsAt, setStartsAt] = useState(() => new Date().toISOString().slice(0, 10));
  const [openingCapital, setOpeningCapital] = useState(() =>
    carriedCapital != null ? String(carriedCapital) : '',
  );
  const [openingCash, setOpeningCash] = useState('');

  const mutation = useMutation({
    mutationFn: () =>
      api.post('/work-seasons', {
        name,
        startsAt: startsAt || undefined,
        openingCapital: openingCapital === '' ? undefined : Number(openingCapital),
        openingCash: openingCash === '' ? undefined : Number(openingCash),
        currency: 'USDT',
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['work-seasons'] });
      onClose();
    },
  });

  function submit(e: FormEvent) {
    e.preventDefault();
    mutation.mutate();
  }

  return (
    <Modal open title={t('new')} onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        <Field label={t('name')}>
          <Input required value={name} onChange={(e) => setName(e.target.value)} placeholder={t('namePlaceholder')} />
        </Field>
        <Field label={t('startsAt')}>
          <Input required type="date" dir="ltr" value={startsAt} onChange={(e) => setStartsAt(e.target.value)} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field
            label={t('openingCapital')}
            hint={carriedCapital != null ? t('openingCapitalCarriedHint', { amount: formatMoney(carriedCapital, locale) }) : undefined}
          >
            <Input type="number" min={0} step="0.01" dir="ltr" value={openingCapital} onChange={(e) => setOpeningCapital(e.target.value)} />
          </Field>
          <Field label={t('openingCash')}>
            <Input type="number" min={0} step="0.01" dir="ltr" value={openingCash} onChange={(e) => setOpeningCash(e.target.value)} />
          </Field>
        </div>
        <ErrorText error={mutation.error} />
        <div className="flex gap-2">
          <Button type="submit" loading={mutation.isPending}>
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

function EntryModal({ seasonId, onClose }: { seasonId: string; onClose: () => void }) {
  const t = useTranslations('workSeasons');
  const tc = useTranslations('common');
  const queryClient = useQueryClient();
  const [type, setType] = useState<CapitalEntryType>('DEPOSIT');
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');

  const mutation = useMutation({
    mutationFn: () =>
      api.post(`/work-seasons/${seasonId}/entries`, {
        type,
        amount: Number(amount),
        note: note || undefined,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['work-seasons'] });
      queryClient.invalidateQueries({ queryKey: ['work-season', seasonId] });
      onClose();
    },
  });

  function submit(e: FormEvent) {
    e.preventDefault();
    mutation.mutate();
  }

  return (
    <Modal open title={t('newEntry')} onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        <Field label={t('entryType')}>
          <Select value={type} onChange={(e) => setType(e.target.value as CapitalEntryType)}>
            <option value="DEPOSIT">{t('entryTypes.DEPOSIT')}</option>
            <option value="WITHDRAWAL">{t('entryTypes.WITHDRAWAL')}</option>
          </Select>
        </Field>
        <Field label={t('amount')}>
          <Input required type="number" min={0.01} step="0.01" dir="ltr" value={amount} onChange={(e) => setAmount(e.target.value)} />
        </Field>
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
