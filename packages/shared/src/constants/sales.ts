/** Shared sales constants — payment methods, income parts, cash transactions */

/** How a sale is paid at the POS */
export const PAYMENT_METHODS = ['CASH', 'CARD', 'EBT', 'ZELLE', 'LOAN', 'DEFICIT'] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export const PAYMENT_METHOD_NAMES: Record<PaymentMethod, string> = {
  CASH: 'Cash',
  CARD: 'Card',
  EBT: 'EBT',
  ZELLE: 'Zelle',
  LOAN: 'Loan',
  DEFICIT: 'Deficit',
};

export const PAYMENT_METHOD_HINTS: Record<PaymentMethod, string> = {
  CASH: 'Cash payment',
  CARD: 'Debit / credit card payment',
  EBT: 'Government assistance (Electronic Benefit Transfer)',
  ZELLE: 'Bank transfer payment',
  LOAN: 'Not paid now — recorded in Loan & Deficit',
  DEFICIT: 'Not paid now — recorded in Loan & Deficit',
};

/** The three parts of Income — every payment received lands in one of them */
export const INCOME_PARTS = ['CASH', 'EBT', 'ZELLE'] as const;
export type IncomePart = (typeof INCOME_PARTS)[number];

export const INCOME_PART_NAMES: Record<IncomePart, string> = {
  CASH: 'Cash',
  EBT: 'EBT',
  ZELLE: 'Zelle',
};

/** Which Income part receives the money of each payment method (Card goes to the bank/Zelle part). LOAN and DEFICIT are unpaid — no money yet. */
export const PAYMENT_METHOD_PART: Record<PaymentMethod, IncomePart | null> = {
  CASH: 'CASH',
  CARD: 'ZELLE',
  EBT: 'EBT',
  ZELLE: 'ZELLE',
  LOAN: null,
  DEFICIT: null,
};

/** Methods that leave the sale unpaid — the amount becomes a receivable in Loan & Deficit */
export const UNPAID_PAYMENT_METHODS: PaymentMethod[] = ['LOAN', 'DEFICIT'];

export function isUnpaidMethod(method: PaymentMethod): boolean {
  return UNPAID_PAYMENT_METHODS.includes(method);
}

export const CASH_TRANSACTION_TYPES = ['SALE', 'INCOME', 'EXPENSE', 'REFUND', 'WITHDRAWAL'] as const;
export type CashTransactionType = (typeof CASH_TRANSACTION_TYPES)[number];

/** Direction of each cash transaction type's effect on balance: +1 money in, −1 money out */
export const CASH_TRANSACTION_DIRECTION: Record<CashTransactionType, 1 | -1> = {
  SALE: 1,
  INCOME: 1,
  EXPENSE: -1,
  REFUND: -1,
  WITHDRAWAL: -1,
};

// ─────────────────── Display names ───────────────────

export const CASH_TRANSACTION_TYPE_NAMES: Record<CashTransactionType, string> = {
  SALE: 'Sale',
  INCOME: 'Income',
  EXPENSE: 'Expense',
  REFUND: 'Refund',
  WITHDRAWAL: 'Withdrawal',
};

// ─────────────────── Online payment options ───────────────────

export const ONLINE_PROVIDERS = ['VISA_CARD', 'OTHER_ONLINE', 'AUTOMATIC'] as const;
export type OnlineProvider = (typeof ONLINE_PROVIDERS)[number];

export const ONLINE_PROVIDER_NAMES: Record<OnlineProvider, string> = {
  VISA_CARD: 'Visa card',
  OTHER_ONLINE: 'Other online methods',
  AUTOMATIC: 'Automatic payment',
};
