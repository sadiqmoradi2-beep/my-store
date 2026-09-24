'use client';

import { use } from 'react';
import { DebtLedgerView } from '@/components/debts/debt-ledger-view';

export default function DebtSupplierLedgerPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return <DebtLedgerView kind="supplier" id={id} />;
}
