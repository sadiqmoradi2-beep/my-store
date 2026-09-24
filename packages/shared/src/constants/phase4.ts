/** Phase 4 constants — reports, notifications, activity log */

export const NOTIFICATION_TYPES = [
  'ORDER_CREATED',
  'LOW_STOCK',
  'PRODUCT_EXPIRING',
  'DEBT_DUE',
  'SYSTEM',
  'SUBSCRIPTION_EXPIRING',
] as const;
export type NotificationType = (typeof NOTIFICATION_TYPES)[number];

export const NOTIFICATION_TYPE_NAMES: Record<NotificationType, string> = {
  ORDER_CREATED: 'New order',
  LOW_STOCK: 'Low stock',
  PRODUCT_EXPIRING: 'Expiring product',
  DEBT_DUE: 'Debt due',
  SYSTEM: 'System',
  SUBSCRIPTION_EXPIRING: 'Subscription expiring',
};

export const REPORT_GRANULARITIES = ['day', 'month'] as const;
export type ReportGranularity = (typeof REPORT_GRANULARITIES)[number];

export const EXPORT_FORMATS = ['xlsx', 'csv'] as const;
export type ExportFormat = (typeof EXPORT_FORMATS)[number];

export const EXPORT_RESOURCES = [
  'products',
  'orders',
  'stock',
  'cash',
  'debts',
  'sales-report',
] as const;
export type ExportResource = (typeof EXPORT_RESOURCES)[number];

export const BACKUP_TYPES = ['MANUAL', 'AUTO'] as const;
export type BackupType = (typeof BACKUP_TYPES)[number];

export const BACKUP_TYPE_NAMES: Record<BackupType, string> = {
  MANUAL: 'Manual',
  AUTO: 'Automatic',
};

/** Maximum automatic backup versions kept per store */
export const AUTO_BACKUP_KEEP = 7;
