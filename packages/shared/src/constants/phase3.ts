/** Phase 3 constants — sellers, employees, work season, debts/credits, returns, suppliers */

export const DEBT_DIRECTIONS = ['RECEIVABLE', 'PAYABLE'] as const;
export type DebtDirection = (typeof DEBT_DIRECTIONS)[number];

export const ATTENDANCE_STATUSES = ['PRESENT', 'ABSENT', 'LEAVE', 'HALF_DAY'] as const;
export type AttendanceStatus = (typeof ATTENDANCE_STATUSES)[number];

export const ATTENDANCE_STATUS_NAMES: Record<AttendanceStatus, string> = {
  PRESENT: 'Present',
  ABSENT: 'Absent',
  LEAVE: 'Leave',
  HALF_DAY: 'Half day',
};

export const DEBT_STATUSES = ['OPEN', 'PARTIAL', 'SETTLED'] as const;
export type DebtStatus = (typeof DEBT_STATUSES)[number];

export const SEASON_STATUSES = ['OPEN', 'CLOSED'] as const;
export type SeasonStatus = (typeof SEASON_STATUSES)[number];

export const CAPITAL_ENTRY_TYPES = ['DEPOSIT', 'WITHDRAWAL'] as const;
export type CapitalEntryType = (typeof CAPITAL_ENTRY_TYPES)[number];

export const CURRENCIES = ['USDT'] as const;
export type Currency = (typeof CURRENCIES)[number];

export const SELLER_PAY_TYPES = ['COMMISSION', 'FIXED_SALARY'] as const;
export type SellerPayType = (typeof SELLER_PAY_TYPES)[number];

export const SELLER_PAY_TYPE_NAMES: Record<SellerPayType, string> = {
  COMMISSION: 'Commission',
  FIXED_SALARY: 'Fixed salary',
};

export const EMPLOYEE_POSITIONS = ['WORKER', 'SELLER', 'MANAGER', 'OTHER'] as const;
export type EmployeePosition = (typeof EMPLOYEE_POSITIONS)[number];

export const EMPLOYEE_POSITION_NAMES: Record<EmployeePosition, string> = {
  WORKER: 'Worker',
  SELLER: 'Seller',
  MANAGER: 'Manager',
  OTHER: 'Other',
};

/** Default system role corresponding to each position — used when automatically creating a user account for an employee */
export const EMPLOYEE_POSITION_ROLE: Record<EmployeePosition, string> = {
  WORKER: 'WAREHOUSE_STAFF',
  SELLER: 'SELLER',
  MANAGER: 'BRANCH_MANAGER',
  OTHER: 'EMPLOYEE',
};

export const DEBT_DIRECTION_NAMES: Record<DebtDirection, string> = {
  RECEIVABLE: 'Receivable',
  PAYABLE: 'Payable',
};

export const DEBT_STATUS_NAMES: Record<DebtStatus, string> = {
  OPEN: 'Open',
  PARTIAL: 'Partial',
  SETTLED: 'Settled',
};

export const CAPITAL_ENTRY_TYPE_NAMES: Record<CapitalEntryType, string> = {
  DEPOSIT: 'Capital in',
  WITHDRAWAL: 'Capital out',
};

export const SALARY_PAYMENT_STATUSES = ['PENDING', 'PAID'] as const;
export type SalaryPaymentStatus = (typeof SALARY_PAYMENT_STATUSES)[number];

export const SALARY_PAYMENT_STATUS_NAMES: Record<SalaryPaymentStatus, string> = {
  PENDING: 'Pending',
  PAID: 'Paid',
};

/** Debt status based on remaining balance */
export function debtStatusFor(amount: number, paidAmount: number): DebtStatus {
  if (paidAmount <= 0) return 'OPEN';
  return paidAmount >= amount ? 'SETTLED' : 'PARTIAL';
}

/** Seller's commission from a delivered order */
export function computeCommission(orderTotal: number, percent: number): number {
  if (percent <= 0 || orderTotal <= 0) return 0;
  return Math.round(orderTotal * percent) / 100;
}
