/** Shared sales constants — payment methods, income parts, cash transactions */

/** How a sale is paid at the POS — all recorded as immediate income. */
export const PAYMENT_METHODS = ['CASH', 'CARD', 'EBT', 'ZELLE', 'DEBIT_CARD'] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export const PAYMENT_METHOD_NAMES: Record<PaymentMethod, string> = {
  CASH: 'Cash',
  CARD: 'Card',
  EBT: 'EBT',
  ZELLE: 'Zelle',
  // shown as "System" — the internal code stays DEBIT_CARD so every existing account, sale and link is unchanged
  DEBIT_CARD: 'System',
};

/** Card and EBT are retired: kept for history, never offered for or accepted on new activity */
export const RETIRED_PAYMENT_METHODS = ['CARD', 'EBT'] as const;
/** What a new sale can be paid with */
export const ACTIVE_PAYMENT_METHODS = ['CASH', 'DEBIT_CARD', 'ZELLE'] as const;

export const PAYMENT_METHOD_HINTS: Record<PaymentMethod, string> = {
  CASH: 'Cash payment',
  CARD: 'Card payment — the money goes to Income → Card',
  EBT: 'Government assistance (Electronic Benefit Transfer)',
  ZELLE: 'Bank transfer payment',
  DEBIT_CARD: 'System payment — the money goes to Income → System',
};

/** The parts of Income — every payment received lands in one of them */
export const INCOME_PARTS = ['CASH', 'CARD', 'EBT', 'ZELLE', 'DEBIT_CARD'] as const;
export type IncomePart = (typeof INCOME_PARTS)[number];

export const INCOME_PART_NAMES: Record<IncomePart, string> = {
  CASH: 'Cash',
  CARD: 'Card',
  EBT: 'EBT',
  ZELLE: 'Zelle',
  DEBIT_CARD: 'System',
};

/** Retired accounts: their balances and history stay intact and visible, but nothing new is posted to them */
export const RETIRED_INCOME_PARTS = ['CARD', 'EBT'] as const;
/** The main boxes in use, in display order: Cash, System (formerly Debit Card), Zelle */
export const ACTIVE_INCOME_PARTS = ['CASH', 'DEBIT_CARD', 'ZELLE'] as const;
export const isRetiredPart = (part: string) => (RETIRED_INCOME_PARTS as readonly string[]).includes(part);

/** Which Income part receives the money of each payment method — each has its own bucket. */
export const PAYMENT_METHOD_PART: Record<PaymentMethod, IncomePart> = {
  CASH: 'CASH',
  CARD: 'CARD',
  EBT: 'EBT',
  ZELLE: 'ZELLE',
  DEBIT_CARD: 'DEBIT_CARD',
};

export const CASH_TRANSACTION_TYPES = ['SALE', 'INCOME', 'EXPENSE', 'REFUND', 'WITHDRAWAL', 'TRANSFER_IN', 'TRANSFER_OUT'] as const;
export type CashTransactionType = (typeof CASH_TRANSACTION_TYPES)[number];

/** Direction of each cash transaction type's effect on balance: +1 money in, −1 money out */
export const CASH_TRANSACTION_DIRECTION: Record<CashTransactionType, 1 | -1> = {
  SALE: 1,
  INCOME: 1,
  EXPENSE: -1,
  REFUND: -1,
  WITHDRAWAL: -1,
  // internal transfer legs: move money between the store's own accounts — never income or expense
  TRANSFER_IN: 1,
  TRANSFER_OUT: -1,
};

/** Internal transfer legs — excluded from income / expense totals everywhere */
export const TRANSFER_TRANSACTION_TYPES = ['TRANSFER_IN', 'TRANSFER_OUT'] as const;
export const TRANSFER_REFERENCE_TYPE = 'transfer';

// ─────────────────── Display names ───────────────────

export const CASH_TRANSACTION_TYPE_NAMES: Record<CashTransactionType, string> = {
  SALE: 'Sale',
  INCOME: 'Income',
  EXPENSE: 'Expense',
  REFUND: 'Refund',
  WITHDRAWAL: 'Withdrawal',
  TRANSFER_IN: 'Transfer in',
  TRANSFER_OUT: 'Transfer out',
};

// ─────────────────── Online payment options ───────────────────

export const ONLINE_PROVIDERS = ['VISA_CARD', 'OTHER_ONLINE', 'AUTOMATIC'] as const;
export type OnlineProvider = (typeof ONLINE_PROVIDERS)[number];

export const ONLINE_PROVIDER_NAMES: Record<OnlineProvider, string> = {
  VISA_CARD: 'Visa card',
  OTHER_ONLINE: 'Other online methods',
  AUTOMATIC: 'Automatic payment',
};
