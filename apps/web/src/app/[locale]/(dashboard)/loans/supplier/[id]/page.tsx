'use client';

import { use } from 'react';
import { useTranslations } from 'next-intl';
import { PERMISSIONS } from '@my-store/shared';
import { DebtLedgerView } from '@/components/debts/debt-ledger-view';
import { useRequirePermission } from '@/hooks/use-require-permission';

export default function DebtSupplierLedgerPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const tc = useTranslations('common');
  const allowed = useRequirePermission(PERMISSIONS.DEBTS_READ);

  if (!allowed) {
    return <p className="p-8 text-center text-sm text-ink-faint">{tc('accessDenied')}</p>;
  }
  return <DebtLedgerView kind="supplier" id={id} />;
}
