export const ORDER_STATUSES = [
  'PENDING',
  'APPROVED',
  'DELIVERED',
  'CANCELLED',
] as const;

export type OrderStatus = (typeof ORDER_STATUSES)[number];

export const ORDER_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  PENDING: ['APPROVED', 'CANCELLED'],
  APPROVED: ['DELIVERED', 'CANCELLED'],
  DELIVERED: [],
  CANCELLED: [],
};

export function canTransition(from: OrderStatus, to: OrderStatus): boolean {
  return ORDER_TRANSITIONS[from].includes(to);
}

/** Transitions that deduct stock (SALE_OUT) */
export const STOCK_DEDUCT_ON: OrderStatus = 'APPROVED';

/** After these statuses, cancellation restores stock (RETURN_IN) */
export const STOCK_RESTORE_STATUSES: OrderStatus[] = ['APPROVED', 'DELIVERED'];

export const ORDER_STATUS_NAMES: Record<OrderStatus, string> = {
  PENDING: 'Pending',
  APPROVED: 'Approved',
  DELIVERED: 'Delivered',
  CANCELLED: 'Cancelled',
};
