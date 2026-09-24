/** Partners' profit & loss constants */

export const PARTNER_ENTRY_TYPES = ['PROFIT', 'LOSS', 'WITHDRAWAL', 'ADJUSTMENT'] as const;
export type PartnerEntryType = (typeof PARTNER_ENTRY_TYPES)[number];

export const PARTNER_ENTRY_TYPE_NAMES: Record<PartnerEntryType, string> = {
  PROFIT: 'Profit share',
  LOSS: 'Loss share',
  WITHDRAWAL: 'Withdrawal',
  ADJUSTMENT: 'Adjustment',
};

/**
 * A partner's proportional share of a total profit/loss figure, given their sharePercent.
 * Used to preview/auto-fill a distribution before it's recorded as ledger entries.
 */
export function computePartnerShare(totalAmount: number, sharePercent: number): number {
  if (sharePercent <= 0 || totalAmount === 0) return 0;
  return Math.round(totalAmount * (sharePercent / 100) * 100) / 100;
}

/**
 * Running balance for a partner from their ledger entries:
 * profit adds, loss and withdrawals subtract, adjustments apply as signed.
 */
export function computePartnerBalance(
  entries: { type: PartnerEntryType; amount: number }[],
): number {
  return entries.reduce((balance, entry) => {
    switch (entry.type) {
      case 'PROFIT':
        return balance + entry.amount;
      case 'LOSS':
      case 'WITHDRAWAL':
        return balance - entry.amount;
      case 'ADJUSTMENT':
        return balance + entry.amount;
      default:
        return balance;
    }
  }, 0);
}
