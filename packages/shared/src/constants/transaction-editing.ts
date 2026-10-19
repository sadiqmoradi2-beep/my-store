/** Store Admin → Settings: how long after recording a manual transaction may be corrected. DISABLED is the default. */
export const TRANSACTION_EDITING_WINDOWS = ['DISABLED', '1h', '24h', '7d', '30d', '1y'] as const;
export type TransactionEditingWindow = (typeof TRANSACTION_EDITING_WINDOWS)[number];

export const TRANSACTION_EDITING_WINDOW_MS: Record<TransactionEditingWindow, number> = {
  DISABLED: 0,
  '1h': 3_600_000,
  '24h': 86_400_000,
  '7d': 7 * 86_400_000,
  '30d': 30 * 86_400_000,
  '1y': 365 * 86_400_000,
};

/** The store's editing window — anything missing or unknown counts as DISABLED */
export function transactionEditingWindowOf(settings: unknown): TransactionEditingWindow {
  const value = (settings as { transactionEditingWindow?: unknown } | null | undefined)?.transactionEditingWindow;
  return (TRANSACTION_EDITING_WINDOWS as readonly unknown[]).includes(value) ? (value as TransactionEditingWindow) : 'DISABLED';
}

/** Only manually entered transactions of these types can be corrected (linked ones go through their own workflow) */
export const CORRECTABLE_TRANSACTION_TYPES = ['INCOME', 'EXPENSE', 'WITHDRAWAL'] as const;

/** referenceType of a correction entry */
export const CORRECTION_REFERENCE_TYPE = 'correction';

/** An exception grant (after re-entering the password) is valid this long, once */
export const EDIT_GRANT_TTL_MS = 10 * 60_000;

/**
 * Financial Personnel attribution on manual Income / Expense / Withdrawal transactions.
 * PAYMENT = who paid / handed over the money, RECEIVE = who received it, TRANSFER = who sent / moved it.
 * Attribution only: it never moves money (a real account-to-account move is an Internal Transfer).
 * Cash already records Paid By / Who Is Paid (required), so only Transferred By is added there.
 */
export const FINANCIAL_OPERATIONS = ['PAYMENT', 'RECEIVE', 'TRANSFER'] as const;
export type FinancialOperation = (typeof FINANCIAL_OPERATIONS)[number];
export const FINANCIAL_OPERATIONS_BY_PART: Record<'CASH' | 'CARD' | 'EBT' | 'ZELLE' | 'DEBIT_CARD', readonly FinancialOperation[]> = {
  CASH: ['TRANSFER'],
  CARD: ['PAYMENT', 'RECEIVE', 'TRANSFER'],
  EBT: ['PAYMENT', 'RECEIVE', 'TRANSFER'],
  ZELLE: ['PAYMENT', 'RECEIVE', 'TRANSFER'],
  DEBIT_CARD: ['PAYMENT', 'RECEIVE', 'TRANSFER'],
};

/** What a Financial Personnel login may be granted — nothing by default (least privilege) */
export const FINANCIAL_PERSONNEL_CAPABILITIES = [
  'cash.income.create',
  'cash.expense.create',
  'cash.withdrawal.create',
  'cash.transfer.create',
] as const;
export type FinancialPersonnelCapability = (typeof FINANCIAL_PERSONNEL_CAPABILITIES)[number];

/** The capability that allows creating a manual transaction of this type (besides cash.transact) */
export const CREATE_PERMISSION_OF_TYPE: Record<'INCOME' | 'EXPENSE' | 'WITHDRAWAL', FinancialPersonnelCapability> = {
  INCOME: 'cash.income.create',
  EXPENSE: 'cash.expense.create',
  WITHDRAWAL: 'cash.withdrawal.create',
};

/** Key prefix of the hidden per-person role of a Financial Personnel login */
export const FINANCIAL_PERSONNEL_ROLE_PREFIX = 'FP_';
