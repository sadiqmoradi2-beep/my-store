/** Data-reset scopes — used by Settings > Account > Reset data (two-step: pick scope, confirm with password) */

export const RESET_SCOPES = [
  'ALL',
  'PRODUCTS',
  'ORDERS',
  'CASH',
  'SUPPLIERS',
  'DEBTS',
  'EMPLOYEES_HISTORY',
  'SELLERS_HISTORY',
  'WORK_SEASONS',
  'PARTNERS_LEDGER',
  'NOTIFICATIONS',
] as const;
export type ResetScope = (typeof RESET_SCOPES)[number];

export const RESET_SCOPE_NAMES: Record<ResetScope, string> = {
  ALL: 'Everything (full reset)',
  PRODUCTS: 'Products & catalog',
  ORDERS: 'Orders & carts',
  CASH: 'Income & cash transactions',
  SUPPLIERS: 'Suppliers & purchases',
  DEBTS: 'Debts & credits',
  EMPLOYEES_HISTORY: 'Employee attendance, shifts & salary history',
  SELLERS_HISTORY: 'Seller salary & commission history',
  WORK_SEASONS: 'Work seasons',
  PARTNERS_LEDGER: 'Partner ledger entries',
  NOTIFICATIONS: 'Notifications',
};

export const RESET_SCOPE_DESCRIPTIONS: Record<ResetScope, string> = {
  ALL: 'Deletes all business data (products, orders, suppliers, financials, history) — your account, users, branches, registers and settings stay intact.',
  PRODUCTS:
    'Deletes your entire product catalog. Because orders and carts reference products, this also deletes all orders, carts and purchase returns — there is no way to remove products while keeping order history that references them.',
  ORDERS: 'Deletes all orders, order items, statuses, payments and carts. Products are kept.',
  CASH: 'Deletes all cash transactions, payments and payment-gateway intents. Cash register balances reset to their opening balance.',
  SUPPLIERS: 'Deletes all suppliers and purchase records.',
  DEBTS: 'Deletes all debt/credit records and their payments.',
  EMPLOYEES_HISTORY: 'Deletes attendance, shift and salary payment history — employee accounts themselves are kept.',
  SELLERS_HISTORY: 'Deletes salary and commission history — seller profiles themselves are kept.',
  WORK_SEASONS: 'Deletes all work seasons and their capital entries.',
  PARTNERS_LEDGER: 'Deletes all partner ledger entries — partner records themselves are kept.',
  NOTIFICATIONS: 'Deletes all notifications.',
};

/** BACKUP_MODELS keys to delete for each scope, in a safe child-before-parent order; ALL is handled separately (every non-preserved key) */
export const RESET_SCOPE_MODEL_KEYS: Record<Exclude<ResetScope, 'ALL'>, string[]> = {
  PRODUCTS: [
    'purchaseReturn',
    'orderItem',
    'orderStatusHistory',
    'payment',
    'order',
    'cartItem',
    'cart',
    'wishlistItem',
    'stockMovement',
    'stock',
    'priceHistory',
    'productImage',
    'product',
  ],
  ORDERS: ['orderItem', 'orderStatusHistory', 'payment', 'order', 'cartItem', 'cart'],
  CASH: ['payment', 'cashTransaction', 'gatewayIntent'],
  SUPPLIERS: ['purchaseReturn', 'purchaseItem', 'purchase', 'supplier'],
  DEBTS: ['debtPayment', 'debt'],
  EMPLOYEES_HISTORY: ['employeeAttendance', 'employeeShift', 'salaryPayment'],
  SELLERS_HISTORY: ['sellerSalaryPayment', 'commissionEntry'],
  WORK_SEASONS: ['capitalEntry', 'workSeason'],
  PARTNERS_LEDGER: ['partnerLedgerEntry'],
  NOTIFICATIONS: ['notification'],
};
