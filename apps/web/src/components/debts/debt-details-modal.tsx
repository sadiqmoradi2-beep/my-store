'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Paperclip } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { PERMISSIONS, type DebtDto, type DebtPaymentDto, type Locale } from '@my-store/shared';
import { api } from '@/lib/api-client';
import { formatDate, formatMoney } from '@/lib/format';
import { Badge, ErrorText, Modal, Spinner } from '@/components/ui';
import { ReceiptLink } from '@/components/receipt-link';
import { useAuthStore } from '@/stores/auth-store';

/** One Loan / Deficit: its own receipt and every payment with the payment receipt */
export function DebtDetailsModal({ debtId, onClose }: { debtId: string; onClose: () => void }) {
  const t = useTranslations('debts');
  const tc = useTranslations('common');
  const locale = useLocale() as Locale;
  const queryClient = useQueryClient();
  const canManage = !!useAuthStore((s) => s.user?.permissions?.includes(PERMISSIONS.DEBTS_MANAGE));

  const attachSlip = useMutation({
    mutationFn: async ({ paymentId, file }: { paymentId: string; file: File }) => {
      const form = new FormData();
      form.append('file', file);
      const { url } = await api.upload<{ url: string }>('/uploads/payment-proofs', form);
      return api.patch(`/debts/${debtId}/payments/${paymentId}/slip`, { proofImageUrl: url });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['debt', debtId] });
      queryClient.invalidateQueries({ queryKey: ['debt-ledger'] });
    },
  });

  const { data: debt, isPending, error } = useQuery({
    queryKey: ['debt', debtId],
    queryFn: () => api.get<DebtDto & { payments: DebtPaymentDto[] }>(`/debts/${debtId}`),
  });

  return (
    <Modal open wide title={debt ? `${t(`kinds.${debt.kind}`)}: ${debt.partyName}` : t('details')} onClose={onClose}>
      <ErrorText error={error} />
      {isPending || !debt ? (
        <Spinner />
      ) : (
        <div className="space-y-4">
          <dl className="grid grid-cols-2 gap-3 rounded-lg bg-surface-3 p-3 text-sm sm:grid-cols-4">
            <div>
              <dt className="text-ink-faint">{t('amount')}</dt>
              <dd className="font-bold text-ink">{formatMoney(debt.amount, locale)}</dd>
            </div>
            <div>
              <dt className="text-ink-faint">{t('totalPaid')}</dt>
              <dd className="font-bold text-ink">{formatMoney(debt.paidAmount, locale)}</dd>
            </div>
            <div>
              <dt className="text-ink-faint">{t('remaining')}</dt>
              <dd className="font-bold text-ink">
                {formatMoney(Number(debt.amount) - Number(debt.paidAmount), locale)}
              </dd>
            </div>
            <div>
              <dt className="text-ink-faint">{t('direction')}</dt>
              <dd>
                <Badge tone={debt.direction === 'RECEIVABLE' ? 'APPROVED' : 'danger'}>
                  {t(`directions.${debt.direction}`)}
                </Badge>
              </dd>
            </div>
          </dl>
          <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
            <span className="text-ink-muted">
              {tc('date')}: <span className="text-ink">{formatDate(debt.createdAt, locale)}</span>
            </span>
            {debt.dueDate && (
              <span className="text-ink-muted">
                {t('dueDate')}: <span className="text-ink">{formatDate(debt.dueDate, locale)}</span>
              </span>
            )}
            <span className="flex items-center gap-2 text-ink-muted">
              {t('receipt')}: <ReceiptLink url={debt.receiptUrl} label={t('viewDownload')} />
            </span>
          </div>
          {debt.notes && <p className="text-sm text-ink-muted">{debt.notes}</p>}

          <div>
            <h3 className="mb-2 text-sm font-bold text-ink">{t('paymentsTitle')}</h3>
            <ErrorText error={attachSlip.error} />
            {debt.payments.length === 0 ? (
              <p className="text-sm text-ink-faint">{t('noPayments')}</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[520px] text-sm">
                  <thead>
                    <tr className="border-b border-line text-xs text-ink-muted">
                      <th className="p-2 text-start font-medium">{tc('date')}</th>
                      <th className="p-2 text-start font-medium">{t('amount')}</th>
                      <th className="p-2 text-start font-medium">{t('performedBy')}</th>
                      <th className="p-2 text-start font-medium">{t('notes')}</th>
                      <th className="p-2 text-start font-medium">{t('proof')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {debt.payments.map((p) => (
                      <tr key={p.id} className="border-b border-line/60 last:border-0">
                        <td className="p-2 text-ink-muted">{formatDate(p.createdAt, locale)}</td>
                        <td className="p-2 font-bold text-ink">{formatMoney(p.amount, locale)}</td>
                        <td className="p-2 text-ink-muted">{p.performedByName ?? '—'}</td>
                        <td className="p-2 text-ink-faint">{p.note ?? '—'}</td>
                        <td className="p-2">
                          <span className="flex items-center gap-2">
                            <ReceiptLink url={p.proofImageUrl} label={t('viewDownload')} />
                            {canManage && (
                              <label
                                className="inline-flex cursor-pointer items-center gap-1 rounded-md border border-line px-2 py-1 text-xs font-medium text-primary-700 hover:bg-surface-3 dark:text-primary-300"
                                title={p.proofImageUrl ? t('replaceSlip') : t('addSlip')}
                              >
                                <Paperclip className="h-3.5 w-3.5" aria-hidden />
                                {attachSlip.isPending && attachSlip.variables?.paymentId === p.id
                                  ? '…'
                                  : p.proofImageUrl
                                    ? t('replaceSlip')
                                    : t('addSlip')}
                                <input
                                  type="file"
                                  accept="image/jpeg,image/png,image/webp,application/pdf"
                                  className="sr-only"
                                  onChange={(e) => {
                                    const file = e.target.files?.[0];
                                    if (file) attachSlip.mutate({ paymentId: p.id, file });
                                    e.target.value = '';
                                  }}
                                />
                              </label>
                            )}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}
    </Modal>
  );
}
