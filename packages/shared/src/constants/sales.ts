/** Shared sales constants and logic — Phase 2 (payment, cash register, purchasing power) */

export const PAYMENT_STATUSES = ['PENDING', 'PAID', 'FAILED', 'REFUNDED'] as const;
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];

export const ORDER_PAYMENT_STATUSES = ['UNPAID', 'PARTIAL', 'PAID', 'REFUNDED'] as const;
export type OrderPaymentStatus = (typeof ORDER_PAYMENT_STATUSES)[number];

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

export const ORDER_PAYMENT_STATUS_NAMES: Record<OrderPaymentStatus, string> = {
  UNPAID: 'Unpaid',
  PARTIAL: 'Partial',
  PAID: 'Paid',
  REFUNDED: 'Refunded',
};

// ─────────────────── Online payment options ───────────────────

export const ONLINE_PROVIDERS = ['VISA_CARD', 'OTHER_ONLINE', 'AUTOMATIC'] as const;
export type OnlineProvider = (typeof ONLINE_PROVIDERS)[number];

export const ONLINE_PROVIDER_NAMES: Record<OnlineProvider, string> = {
  VISA_CARD: 'Visa card',
  OTHER_ONLINE: 'Other online methods',
  AUTOMATIC: 'Automatic payment',
};
