export interface BackupModel {
  /** The Prisma client key and the data key in the backup file */
  key: string;
  where: (tenantId: string) => Record<string, unknown>;
  /** Json columns whose null value must become JsonNull on restore */
  jsonFields?: string[];
}

const t = (tenantId: string) => ({ tenantId });

/**
 * Insertion order: parents before children. Deletion on restore happens in reverse.
 * ActivityLog is deliberately excluded (the audit trail shouldn't be overwritten by a restore);
 * Subscription/TenantModule/Backup are platform-level, not store data.
 */
export const BACKUP_MODELS: BackupModel[] = [
  { key: 'role', where: t },
  { key: 'rolePermission', where: (tenantId) => ({ role: { tenantId } }) },
  { key: 'branch', where: t },
  { key: 'user', where: t, jsonFields: ['uiPrefs'] },
  { key: 'warehouse', where: t },
  { key: 'category', where: t },
  { key: 'product', where: t },
  { key: 'productImage', where: (tenantId) => ({ product: { tenantId } }) },
  { key: 'priceHistory', where: t },
  { key: 'cart', where: t },
  { key: 'cartItem', where: (tenantId) => ({ cart: { tenantId } }) },
  { key: 'sellerProfile', where: t },
  { key: 'employee', where: t },
  { key: 'partner', where: t },
  { key: 'workSession', where: t },
  { key: 'cashHarvest', where: t },
  { key: 'sessionAdjustment', where: t },
  { key: 'workSessionAudit', where: t },
  { key: 'sale', where: t },
  { key: 'saleItem', where: (tenantId) => ({ sale: { tenantId } }) },
  { key: 'cashRegister', where: t },
  { key: 'cashTransaction', where: t },
  { key: 'stock', where: t },
  { key: 'stockMovement', where: t },
  { key: 'sellerSalaryPayment', where: t },
  { key: 'commissionEntry', where: t },
  { key: 'employeeAttendance', where: t },
  { key: 'employeeShift', where: t },
  { key: 'salaryPayment', where: t },
  { key: 'supplier', where: t },
  { key: 'purchase', where: t },
  { key: 'purchaseItem', where: (tenantId) => ({ purchase: { tenantId } }) },
  { key: 'purchaseReturn', where: t },
  { key: 'debt', where: t },
  { key: 'debtPayment', where: t },
  { key: 'partnerLedgerEntry', where: t },
  { key: 'notification', where: t },
  { key: 'gatewayIntent', where: t },
];

/** Parents before children for self-referencing trees (categories) */
export function sortByParentFirst<T extends { id: string; parentId: string | null }>(rows: T[]): T[] {
  const placed = new Set<string>();
  const result: T[] = [];
  let remaining = rows;
  while (remaining.length) {
    const ready = remaining.filter((r) => !r.parentId || placed.has(r.parentId));
    if (!ready.length) {
      result.push(...remaining);
      break;
    }
    for (const row of ready) placed.add(row.id);
    result.push(...ready);
    remaining = remaining.filter((r) => !placed.has(r.id));
  }
  return result;
}
