import { CashTransactionType, IncomePart, PaymentMethod } from '../constants/sales';
import {
  AttendanceStatus,
  Currency,
  DebtDirection,
  DebtKind,
  DebtStatus,
  SalaryPaymentStatus,
  SellerPayType,
} from '../constants/phase3';
import { PartnerEntryType } from '../constants/partners';
import { HarvestStatus, SessionResult, SessionRole, SessionStatus } from '../constants/sessions';
import { CalendarType, Locale } from './auth';

export type { Currency, IncomePart, PaymentMethod };
export type StockMovementType =
  | 'PURCHASE_IN'
  | 'SALE_OUT'
  | 'TRANSFER_IN'
  | 'TRANSFER_OUT'
  | 'ADJUSTMENT'
  | 'RETURN_IN'
  | 'RETURN_OUT';
export type PriceType = 'PURCHASE' | 'SALE' | 'WHOLESALE' | 'PROMO';

export interface TenantDto {
  id: string;
  name: string;
  slug: string;
  phone: string | null;
  address: string | null;
  createdAt: string;
  settings?: Record<string, unknown> | null;
}

export interface BranchDto {
  id: string;
  name: string;
  code: string;
  address: string | null;
  phone: string | null;
  isMain: boolean;
  warehouses: WarehouseDto[];
}

export interface WarehouseDto {
  id: string;
  branchId: string;
  name: string;
  phone: string | null;
  ownerName: string | null;
  isDefault: boolean;
}

export interface UserDto {
  id: string;
  email: string;
  fullName: string;
  phone: string | null;
  roleId: string;
  roleKey: string;
  branchId: string | null;
  status: 'ACTIVE' | 'INACTIVE' | 'SUSPENDED';
  locale: Locale;
  calendar: CalendarType;
  createdAt: string;
}

export interface CategoryDto {
  id: string;
  parentId: string | null;
  name: string;
  slug: string;
  imageUrl: string | null;
  sortOrder: number;
  isActive: boolean;
  children?: CategoryDto[];
  productCount?: number;
}

export interface ProductDto {
  id: string;
  categoryId: string;
  categoryName?: string;
  name: string;
  slug: string;
  sku: string;
  barcode: string | null;
  description: string | null;
  unit: string;
  purchasePrice: string;
  salePrice: string;
  wholesalePrice: string | null;
  promoPrice: string | null;
  currency: Currency;
  exchangeRate: string | null;
  minStockLevel: number;
  expiryDate: string | null;
  isActive: boolean;
  totalStock?: number;
  createdAt: string;
}

export interface PriceHistoryDto {
  id: string;
  productId: string;
  priceType: PriceType;
  oldPrice: string | null;
  newPrice: string;
  currency: Currency;
  changedByName: string;
  createdAt: string;
}

export interface StockDto {
  id: string;
  productId: string;
  productName: string;
  productSku: string;
  warehouseId: string;
  warehouseName: string;
  quantity: number;
  minStockLevel: number;
}

export interface StockMovementDto {
  id: string;
  productId: string;
  productName?: string;
  warehouseId: string;
  type: StockMovementType;
  quantity: number;
  reason: string | null;
  createdAt: string;
}

// ─────────────────────── Phase 2 ───────────────────────

export interface SaleItemDto {
  id: string;
  productId: string;
  productName: string;
  quantity: number;
  unitPrice: string;
  unitCost: string;
  total: string;
}

export interface SaleDto {
  id: string;
  saleNumber: number;
  branchId: string;
  branchName?: string;
  total: string;
  cost: string;
  profit: string;
  paymentMethod: PaymentMethod;
  registerId: string | null;
  sessionId: string | null;
  notes: string | null;
  createdByName?: string;
  items: SaleItemDto[];
  createdAt: string;
}

export interface CartItemDto {
  id: string;
  productId: string;
  productName: string;
  unit: string;
  quantity: number;
  unitPrice: string;
  purchasePrice: string;
  available?: number;
}

export interface CartDto {
  id: string;
  branchId: string;
  items: CartItemDto[];
  subtotal: string;
  cost: string;
  total: string;
}

export type GatewayPurpose = 'SUBSCRIPTION';
export type GatewayIntentStatus = 'PENDING' | 'PAID' | 'FAILED' | 'EXPIRED';

export interface GatewayIntentDto {
  id: string;
  tenantId: string;
  purpose: GatewayPurpose;
  referenceId: string | null;
  provider: string | null;
  amount: string;
  currency: Currency;
  status: GatewayIntentStatus;
  providerRef: string | null;
  meta: Record<string, unknown> | null;
  createdAt: string;
  confirmedAt: string | null;
}

export interface CashRegisterDto {
  id: string;
  branchId: string;
  branchName?: string;
  name: string;
  part: IncomePart;
  isDefault: boolean;
  isActive: boolean;
  openingBalance: string;
  balance: string;
}

export interface CashTransactionDto {
  id: string;
  registerId: string;
  type: CashTransactionType;
  amount: string;
  balanceAfter: string;
  category: string | null;
  note: string | null;
  referenceType: string | null;
  referenceId: string | null;
  sessionId?: string | null;
  /** The work session (cash box) that paid / received it */
  sessionCode?: string | null;
  sessionPerson?: string | null;
  performedByName?: string;
  createdAt: string;
}


export interface PosSaleResultDto {
  sale: SaleDto;
  change: string;
}

export interface IncomePartSummaryDto {
  part: IncomePart;
  name: string;
  /** Current money held in this part (all its registers) */
  balance: string;
  /** Money that came into this part during the range (sales, loans received, debts collected, other income) */
  income: string;
  /** Money that went out of this part during the range (expenses, salaries, withdrawals, debts paid) */
  expenses: string;
  /** Profit of the sales paid into this part during the range */
  profit: string;
  salesCount: number;
}

export interface IncomeSummaryDto {
  from: string;
  to: string;
  parts: IncomePartSummaryDto[];
  totals: {
    /** Sum of the income of Cash, EBT and Zelle */
    totalIncome: string;
    totalBalance: string;
    /** Every sale of the range, paid or not */
    totalSales: string;
    totalProfit: string;
    salesCount: number;
  };
}

// ─────────────────────── Phase 3 ───────────────────────

export interface SellerDto {
  id: string;
  userId: string;
  fullName: string;
  email: string;
  payType: SellerPayType;
  commissionPercent: string;
  fixedSalaryAmount: string | null;
  isActive: boolean;
  notes: string | null;
  salesCount?: number;
  salesTotal?: string;
  commissionTotal?: string;
  createdAt: string;
  roleId: string | null;
  roleName: string | null;
}

export interface CommissionEntryDto {
  id: string;
  saleId: string;
  saleNumber?: number;
  amount: string;
  percent: string;
  createdAt: string;
}

export interface SellerSalaryPaymentDto {
  id: string;
  sellerProfileId: string;
  amount: string;
  period: string;
  registerId: string | null;
  note: string | null;
  createdAt: string;
}

export interface EmployeeDto {
  id: string;
  fullName: string;
  position: string;
  phone: string | null;
  payType: SellerPayType;
  salary: string;
  hiredAt: string;
  isActive: boolean;
  notes: string | null;
  createdAt: string;
  tempPassword?: string;
  /** Linked login account, if this employee has one (null if never given login access) */
  userId: string | null;
  roleId: string | null;
  roleName: string | null;
}

export interface SalaryPaymentDto {
  id: string;
  employeeId: string;
  employeeName?: string;
  receiptImageUrl: string | null;
  amount: string;
  bonus: string;
  deduction: string;
  netAmount: string;
  status: SalaryPaymentStatus;
  period: string;
  registerId: string | null;
  note: string | null;
  createdAt: string;
  paidAt: string | null;
}

export interface EmployeeShiftDto {
  id: string;
  employeeId: string;
  registerId: string | null;
  openingCash: string;
  closingCash: string | null;
  startedAt: string;
  endedAt: string | null;
}

export interface EmployeeAttendanceDto {
  id: string;
  employeeId: string;
  date: string;
  status: AttendanceStatus;
  checkIn: string | null;
  checkOut: string | null;
  note: string | null;
  recordedByName?: string;
  createdAt: string;
}

export interface SupplierDto {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  address: string | null;
  notes: string | null;
  purchasesCount?: number;
  purchasesTotal?: string;
  lastPurchaseNumber?: number | null;
  createdAt: string;
}

export interface PurchaseItemDto {
  id: string;
  productId: string;
  productName: string;
  quantity: number;
  unitCost: string;
  total: string;
}

export interface PurchaseDto {
  id: string;
  purchaseNumber: number;
  supplierId: string;
  supplierName?: string;
  branchId: string;
  branchName?: string;
  total: string;
  paidAmount: string;
  invoiceImageUrl: string | null;
  notes: string | null;
  items: PurchaseItemDto[];
  createdAt: string;
}

export interface DebtDto {
  id: string;
  direction: DebtDirection;
  status: DebtStatus;
  kind: DebtKind;
  partyName: string;
  supplierId: string | null;
  employeeId: string | null;
  amount: string;
  paidAmount: string;
  currency: Currency;
  dueDate: string | null;
  referenceType: string | null;
  referenceId: string | null;
  notes: string | null;
  createdAt: string;
}

export interface DebtPaymentDto {
  id: string;
  debtId: string;
  amount: string;
  currency: Currency;
  registerId: string | null;
  note: string | null;
  proofImageUrl: string | null;
  performedByName?: string;
  createdAt: string;
}

export interface DebtLedgerDto {
  party: { id: string; name: string };
  debts: (DebtDto & { payments: DebtPaymentDto[] })[];
  totals: { currency: Currency; amount: string; paidAmount: string; remaining: string }[];
}

// ─────────────────────── Phase 4 ───────────────────────

export interface SalesReportPoint {
  bucket: string;
  total: string;
  cost: string;
  profit: string;
  sales: number;
}

export interface SalesReportDto {
  points: SalesReportPoint[];
  totals: {
    salesTotal: string;
    salesCost: string;
    profit: string;
    salesCount: number;
    averageSale: string;
  };
}

export interface ProductReportRow {
  productId: string;
  name: string;
  quantity: number;
  revenue: string;
}

export interface CashReportRow {
  type: CashTransactionType;
  category: string | null;
  total: string;
  count: number;
}

export interface BranchReportRow {
  branchId: string;
  name: string;
  salesCount: number;
  total: string;
  cost: string;
  profit: string;
}

export interface SellerReportRow {
  sellerId: string;
  name: string;
  salesCount: number;
  itemsSold: number;
  total: string;
  cost: string;
  profit: string;
}

export interface NotificationDto {
  id: string;
  type: string;
  title: string;
  body: string | null;
  refType: string | null;
  refId: string | null;
  readAt: string | null;
  createdAt: string;
}

export interface ActivityLogDto {
  id: string;
  userId: string | null;
  userName: string | null;
  method: string;
  path: string;
  action: string;
  entityId: string | null;
  statusCode: number;
  createdAt: string;
}

export interface ModuleStateDto {
  key: string;
  name: string;
  version: string;
  isCore: boolean;
  dependsOn: string[];
  minPlan: 'FREE' | 'BUSINESS' | 'ENTERPRISE';
  /** Enabled per store settings (regardless of plan) */
  enabled: boolean;
  /** Current plan allows this module */
  allowedByPlan: boolean;
}

export interface PlanDto {
  code: 'FREE' | 'STARTER' | 'BUSINESS' | 'ENTERPRISE';
  name: string;
  priceMonthly: number;
  priceYearly: number | null;
  requiresApproval: boolean;
  limits: { maxBranches: number; maxUsers: number; maxProducts: number };
}

export interface SubscriptionDto {
  status: 'TRIAL' | 'ACTIVE' | 'PAST_DUE' | 'CANCELLED' | 'EXPIRED';
  startsAt: string;
  endsAt: string | null;
  billingCycle: 'MONTHLY' | 'YEARLY' | null;
  plan: PlanDto;
  pendingPlan: PlanDto | null;
  pendingRequestedAt: string | null;
  pendingBillingCycle: 'MONTHLY' | 'YEARLY' | null;
  usage: { branches: number; users: number; products: number };
}

/** Pending plan-change request awaiting approval — for the platform admin panel (SUPER_ADMIN) */
export interface PendingSubscriptionDto {
  tenantId: string;
  tenantName: string;
  tenantSlug: string;
  currentPlan: PlanDto;
  pendingPlan: PlanDto;
  pendingBillingCycle: 'MONTHLY' | 'YEARLY' | null;
  pendingRequestedAt: string;
}

/** A row in the subscription change/renewal/expiration history — read-only, for the platform admin console */
export interface SubscriptionHistoryDto {
  id: string;
  event: 'PLAN_CHANGED' | 'RENEWED' | 'EXPIRED_DOWNGRADE';
  fromPlanCode: PlanDto['code'] | null;
  toPlanCode: PlanDto['code'];
  billingCycle: 'MONTHLY' | 'YEARLY' | null;
  startsAt: string;
  endsAt: string | null;
  createdAt: string;
}

/** A row in the platform's store list — platform admin console (SUPER_ADMIN) */
export interface TenantListItemDto {
  id: string;
  name: string;
  slug: string;
  isActive: boolean;
  createdAt: string;
  plan: PlanDto | null;
  subscriptionStatus: SubscriptionDto['status'] | null;
  endsAt: string | null;
  billingCycle: 'MONTHLY' | 'YEARLY' | null;
}

/** Full details of a store — profile + subscription + usage + history + behavior — platform admin console */
export interface TenantDetailDto {
  id: string;
  name: string;
  slug: string;
  phone: string | null;
  address: string | null;
  isActive: boolean;
  createdAt: string;
  subscription: {
    status: SubscriptionDto['status'];
    startsAt: string;
    endsAt: string | null;
    billingCycle: 'MONTHLY' | 'YEARLY' | null;
    plan: PlanDto;
    pendingPlan: PlanDto | null;
    pendingBillingCycle: 'MONTHLY' | 'YEARLY' | null;
    pendingRequestedAt: string | null;
  } | null;
  usage: { branches: number; users: number; products: number };
  history: SubscriptionHistoryDto[];
  behavior: { lastAdminLoginAt: string | null; totalSales: number };
}

/** Store owner's suggestion/complaint about the platform — submitted from the store panel, reviewed in the platform admin panel */
export interface PlatformFeedbackDto {
  id: string;
  tenantId: string;
  tenantName?: string;
  submittedByUserId: string;
  submitterName?: string;
  type: 'SUGGESTION' | 'COMPLAINT' | 'BUG' | 'FEATURE_REQUEST';
  subject: string;
  body: string;
  status: 'NEW' | 'IN_PROGRESS' | 'DONE' | 'REJECTED';
  adminNote: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface BackupDto {
  id: string;
  type: 'MANUAL' | 'AUTO';
  status: 'COMPLETED' | 'FAILED';
  fileName: string;
  sizeBytes: number;
  note: string | null;
  createdAt: string;
}

export interface DashboardSummaryDto {
  todaySales: string;
  monthSales: string;
  todayProfit: string;
  monthProfit: string;
  todaySalesCount: number;
  lowStockCount: number;
  topProducts: { productId: string; name: string; quantity: number; total: string }[];
}

export interface LowStockItemDto {
  productId: string;
  productName: string;
  warehouseName: string;
  quantity: number;
  minStockLevel: number;
}

export interface PartnerDto {
  id: string;
  name: string;
  phone: string | null;
  sharePercent: string | null;
  notes: string | null;
  isActive: boolean;
  balance: string;
  totalProfit: string;
  totalLoss: string;
  totalWithdrawn: string;
  createdAt: string;
}

export interface PartnerLedgerEntryDto {
  id: string;
  partnerId: string;
  partnerName?: string;
  type: PartnerEntryType;
  amount: string;
  period: string | null;
  method: string | null;
  note: string | null;
  performedByName?: string | null;
  createdAt: string;
}

export interface RoleDto {
  id: string;
  key: string;
  name: string;
  isSystem: boolean;
  userCount: number;
  permissions: string[];
}

export interface PermissionDto {
  id: string;
  key: string;
  moduleKey: string;
  description: string | null;
}

export interface LicenseKeyDto {
  id: string;
  key: string;
  status: 'ACTIVE' | 'USED' | 'REVOKED';
  note: string | null;
  createdByName?: string;
  usedByTenantName?: string | null;
  usedAt: string | null;
  createdAt: string;
  planCode: PlanDto['code'];
  planName: string;
  expiresAt: string | null;
}

export interface PurchaseReturnDto {
  id: string;
  supplierId: string;
  supplierName: string;
  productId: string;
  productName: string;
  warehouseId: string;
  warehouseName: string;
  quantity: number;
  unitCost: string;
  total: string;
  note: string | null;
  createdByName: string;
  createdAt: string;
}


// ─────────────────────── Work Sessions ───────────────────────

export interface WorkSessionFiguresDto {
  /** All sales of the session, whatever the payment method */
  salesTotal: string;
  /** Sales paid in cash — the only sales that enter the physical cash box */
  salesCash: string;
  salesProfit: string;
  salesCount: number;
  /** Cash that came in besides sales (debts collected in cash, loans received…) */
  otherCashReceived: string;
  /** Expenses paid in cash from the box */
  cashExpenses: string;
  /** Expenses paid from any Income part */
  totalExpenses: string;
  /** Approved harvests of any method — counted against the harvest limit */
  harvestedTotal: string;
  /** Approved harvests that took cash out of the box */
  harvestedCash: string;
  pendingHarvests: number;
  adjustments: string;
  expectedCash: string;
  remainingHarvestLimit: string;
}

export interface WorkSessionDto {
  id: string;
  code: string;
  role: SessionRole;
  personId: string;
  personName: string;
  status: SessionStatus;
  startedAt: string;
  closedAt: string | null;
  openingCash: string;
  harvestLimit: string;
  openingNotes: string | null;
  closingNotes: string | null;
  actualClosingCash: string | null;
  expectedClosingCash: string | null;
  difference: string | null;
  result: SessionResult | null;
  createdByName?: string;
  closedByName?: string | null;
  durationMinutes: number;
  figures: WorkSessionFiguresDto;
}

export interface HarvestDto {
  id: string;
  number: number;
  sessionId: string;
  amount: string;
  method: IncomePart;
  status: HarvestStatus;
  note: string | null;
  harvestedAt: string;
  requestedByName?: string;
  collectedByName?: string | null;
  createdAt: string;
}

export interface SessionAdjustmentDto {
  id: string;
  amount: string;
  reason: string;
  createdByName?: string;
  createdAt: string;
}

export type SessionTimelineKind = 'START' | 'SALE' | 'INCOME' | 'EXPENSE' | 'HARVEST' | 'ADJUSTMENT' | 'CLOSE';

export interface SessionTimelineItemDto {
  at: string;
  kind: SessionTimelineKind;
  label: string;
  /** Amount of the event as shown (positive = money in, negative = money out) */
  amount: string;
  /** How much the event moved the physical cash box (0 for card / EBT / Zelle) */
  cashEffect: string;
  /** Expected cash in the box after the event */
  balanceAfter: string | null;
  note?: string | null;
}

export interface SessionAuditDto {
  id: string;
  action: string;
  userName?: string;
  oldValue: unknown;
  newValue: unknown;
  reason: string | null;
  createdAt: string;
}

export interface SessionReportRow {
  role: SessionRole;
  personId: string;
  personName: string;
  sessions: number;
  income: string;
  expenses: string;
  harvested: string;
  /** Expected cash still in the boxes of the person's active sessions */
  cashHeld: string;
  /** Sum of the closing differences of the closed sessions */
  difference: string;
}

export interface SessionReportDto {
  from: string;
  to: string;
  rows: SessionReportRow[];
  totals: {
    activeCount: number;
    closedCount: number;
    cashHeld: string;
    income: string;
    expenses: string;
    harvested: string;
    difference: string;
  };
}
