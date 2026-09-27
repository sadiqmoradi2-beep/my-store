/** Work Sessions — the cash/business period of a Seller, Employee or Partner */

export const SESSION_ROLES = ['SELLER', 'EMPLOYEE', 'PARTNER'] as const;
export type SessionRole = (typeof SESSION_ROLES)[number];

export const SESSION_ROLE_NAMES: Record<SessionRole, string> = {
  SELLER: 'Seller',
  EMPLOYEE: 'Employee',
  PARTNER: 'Partner',
};

export const SESSION_STATUSES = ['ACTIVE', 'CLOSED'] as const;
export type SessionStatus = (typeof SESSION_STATUSES)[number];

export const SESSION_STATUS_NAMES: Record<SessionStatus, string> = {
  ACTIVE: 'Active',
  CLOSED: 'Closed',
};

/** A seller/employee can ask for a harvest; a manager approves it (approved harvests count, pending ones do not) */
export const HARVEST_STATUSES = ['PENDING', 'APPROVED', 'REJECTED'] as const;
export type HarvestStatus = (typeof HARVEST_STATUSES)[number];

export const SESSION_RESULTS = ['BALANCED', 'SHORTAGE', 'SURPLUS'] as const;
export type SessionResult = (typeof SESSION_RESULTS)[number];

/** Actual closing cash minus the expected cash: 0 = balanced, below 0 = shortage, above 0 = surplus */
export function sessionResult(difference: number): SessionResult {
  if (difference === 0) return 'BALANCED';
  return difference < 0 ? 'SHORTAGE' : 'SURPLUS';
}

/**
 * Expected cash in a person's cash box.
 * Only cash moves the box: card / EBT / Zelle sales and non-cash harvests never count.
 */
export function expectedSessionCash(input: {
  openingCash: number;
  cashSales: number;
  otherCashReceived: number;
  adjustments: number;
  cashExpenses: number;
  cashHarvested: number;
}): number {
  return (
    input.openingCash +
    input.cashSales +
    input.otherCashReceived +
    input.adjustments -
    input.cashExpenses -
    input.cashHarvested
  );
}
