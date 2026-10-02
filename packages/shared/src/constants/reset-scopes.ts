/** Data-reset scopes — used by Settings > Account > Reset data (two-step: pick scope, confirm with password) */

export const RESET_SCOPES = [
  'ALL',
  'PRODUCTS',
  'SALES',
  'CASH',
  'SUPPLIERS',
  'DEBTS',
  'EMPLOYEES_HISTORY',
  'SELLERS_HISTORY',
  'WORK_SESSIONS',
  'PARTNERS_LEDGER',
  'TEAM',
  'NOTIFICATIONS',
] as const;
export type ResetScope = (typeof RESET_SCOPES)[number];

export const RESET_SCOPE_NAMES: Record<ResetScope, string> = {
  ALL: 'Everything',
  PRODUCTS: 'Products & catalog',
  SALES: 'Sales & carts',
  CASH: 'Income & cash transactions',
  SUPPLIERS: 'Suppliers & purchases',
  DEBTS: 'Debts & credits',
  EMPLOYEES_HISTORY: 'Employee attendance, shifts & salary history',
  SELLERS_HISTORY: 'Seller salary & commission history',
  WORK_SESSIONS: 'Work sessions',
  PARTNERS_LEDGER: 'Partner ledger entries',
  TEAM: 'Team (employees, sellers, partners)',
  NOTIFICATIONS: 'Notifications',
};

export const RESET_SCOPE_DESCRIPTIONS: Record<ResetScope, string> = {
  ALL: 'Deletes everything of this store: products, categories, inventory and warehouses, sales, suppliers, purchases, loans & deficits, the whole team, work sessions, all branches with their Cash / EBT / Zelle boxes, income and history — and every login account except yours. Only the roles stay; a fresh "Main Branch" is created and everything starts from zero.',
  PRODUCTS:
    'Deletes your entire catalog: products, categories and stock. Because sales, carts and purchases reference products, this also deletes all sales, carts, purchases and purchase returns.',
  SALES: 'Deletes all sales and carts. Products are kept.',
  CASH: 'Deletes all Income transactions (cash, EBT, Zelle) and payment-gateway intents. The Cash / EBT / Zelle balances go back to zero. Cash register balances reset to their opening balance.',
  SUPPLIERS: 'Deletes all suppliers and purchase records.',
  DEBTS: 'Deletes all debt/credit records and their payments.',
  EMPLOYEES_HISTORY: 'Deletes attendance, shift and salary payment history — employee accounts themselves are kept.',
  SELLERS_HISTORY: 'Deletes salary and commission history — seller profiles themselves are kept.',
  WORK_SESSIONS: 'Deletes all work sessions, their harvests, adjustments and audit history.',
  PARTNERS_LEDGER: 'Deletes all partner ledger entries — partner records themselves are kept.',
  TEAM: 'Deletes every employee, seller profile and partner with their attendance, shifts, salaries, commissions, ledger entries, work sessions, and their login accounts. Your own login and other admins are kept.',
  NOTIFICATIONS: 'Deletes all notifications.',
};

/** BACKUP_MODELS keys to delete for each scope, in a safe child-before-parent order; ALL is handled separately (every non-preserved key) */
export const RESET_SCOPE_MODEL_KEYS: Record<Exclude<ResetScope, 'ALL'>, string[]> = {
  PRODUCTS: [
    'purchaseReturn',
    'purchaseItem',
    'purchase',
    'saleItem',
    'sale',
    'cartItem',
    'cart',
    'stockMovement',
    'stock',
    'priceHistory',
    'productImage',
    'product',
    'category',
  ],
  SALES: ['saleItem', 'sale', 'cartItem', 'cart'],
  CASH: ['cashTransaction', 'gatewayIntent'],
  SUPPLIERS: ['purchaseReturn', 'purchaseItem', 'purchase', 'supplier'],
  DEBTS: ['debtPayment', 'debt'],
  EMPLOYEES_HISTORY: ['employeeAttendance', 'employeeShift', 'salaryPayment'],
  SELLERS_HISTORY: ['sellerSalaryPayment', 'commissionEntry'],
  WORK_SESSIONS: ['workSessionAudit', 'sessionAdjustment', 'cashHarvest', 'workSession'],
  PARTNERS_LEDGER: ['partnerLedgerEntry'],
  TEAM: [
    'workSessionAudit',
    'sessionAdjustment',
    'cashHarvest',
    'workSession',
    'sellerSalaryPayment',
    'commissionEntry',
    'sellerProfile',
    'employeeAttendance',
    'employeeShift',
    'salaryPayment',
    'employee',
    'partnerLedgerEntry',
    'partner',
  ],
  NOTIFICATIONS: ['notification'],
};
