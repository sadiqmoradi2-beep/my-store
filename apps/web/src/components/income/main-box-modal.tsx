'use client';

import { useQuery } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { ACTIVE_INCOME_PARTS, type CashRegisterDto } from '@my-store/shared';
import { api } from '@/lib/api-client';
import { Button, Field, Modal, Select, Spinner } from '@/components/ui';
import { TransactionForm } from './transaction-modal';
import { useFinancialActor } from './financial-actor-field';

/** Display order of the main boxes: Cash, System, Zelle */
const order = (part: string) => (ACTIVE_INCOME_PARTS as readonly string[]).indexOf(part);

/**
 * Income → New Transaction: first choose the Main Box (Cash / System / Zelle of this store) the transaction is
 * recorded on — required, no preselected default. The server re-checks store, active state and box type.
 */
export function TransactionModal({ onClose }: { onClose: () => void }) {
  const t = useTranslations('cash');
  const tc = useTranslations('common');
  const { data: registers, isPending } = useQuery({
    queryKey: ['cash-registers'],
    queryFn: () => api.get<CashRegisterDto[]>('/cash-registers'),
  });
  // a Financial Personnel login may only use its own branch's boxes (the server enforces it too)
  const actor = useFinancialActor();
  const ownBranch = actor.data?.actor ? actor.data.branchId : null;
  const boxes = (registers ?? [])
    .filter((r) => r.isActive && !r.retired && order(r.part) !== -1 && (!ownBranch || r.branchId === ownBranch))
    .sort((a, b) => (a.branchName ?? '').localeCompare(b.branchName ?? '') || order(a.part) - order(b.part));
  const multiBranch = new Set(boxes.map((b) => b.branchId)).size > 1;
  const [boxId, setBoxId] = useState('');
  const box = boxes.find((b) => b.id === boxId);

  const field = (
    <Field label={t('mainBox')} hint={box ? undefined : t('mainBoxRequired')}>
      <Select required value={boxId} onChange={(e) => setBoxId(e.target.value)} aria-invalid={!box}>
        <option value="" disabled>
          {t('selectMainBox')}
        </option>
        {boxes.map((b) => (
          <option key={b.id} value={b.id}>
            {t(`parts.${b.part}`)}
            {multiBranch ? ` — ${b.branchName}` : ''}
          </option>
        ))}
      </Select>
    </Field>
  );

  if (!box) {
    return (
      <Modal open title={t('newTransaction')} onClose={onClose}>
        {isPending ? <Spinner /> : <div className="space-y-4">{field}</div>}
        <div className="mt-4 flex gap-2">
          <Button type="button" variant="ghost" onClick={onClose}>
            {tc('cancel')}
          </Button>
        </div>
      </Modal>
    );
  }
  // a different box remounts the form, so nothing typed for one box is posted to another
  return <TransactionForm key={box.id} register={box} mainBoxField={<div className="mb-4">{field}</div>} onClose={onClose} />;
}
