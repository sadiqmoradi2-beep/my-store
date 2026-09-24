import { OrderStatus } from '../constants/order-status';
import {
  CashTransactionType,
  OrderPaymentStatus,
  PaymentStatus,
} from '../constants/sales';
import {
  AttendanceStatus,
  CapitalEntryType,
  Currency,
  DebtDirection,
  DebtStatus,
  SalaryPaymentStatus,
  SeasonStatus,
  SellerPayType,
} from '../constants/phase3';
import { PartnerEntryType } from '../constants/partners';
import { CalendarType, Locale } from './auth';

export type { Currency };
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

export interface OrderItemDto {
  id: string;
  productId: string;
  productName: string;
  quantity: number;
  unitPrice: string;
  total: string;
}

export interface OrderDto {
  id: string;
  orderNumber: number;
  branchId: string;
  branchName?: string;
  status: OrderStatus;
  subtotal: string;
  total: string;
  currency: Currency;
  paymentStatus: OrderPaymentStatus;
  paidTotal: string;
  notes: string | null;
  items: OrderItemDto[];
  createdAt: string;
}

// ─────────────────────── Phase 2 ───────────────────────

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

export interface PaymentDto {
  id: string;
  orderId: string;
  status: PaymentStatus;
  amount: string;
  registerId: string | null;
  receivedByName?: string;
  note: string | null;
  createdAt: string;
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
  isDefault: boolean;
  isActive: boolean;
  isNetProfitBox: boolean;
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
  performedByName?: string;
  createdAt: string;
}


export interface PosSaleResultDto {
  order: OrderDto;
  payment: PaymentDto | null;
  change: string;
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
  ordersCount?: number;
  salesTotal?: string;
  commissionTotal?: string;
  createdAt: string;
}

export interface CommissionEntryDto {
  id: string;
  orderId: string;
  orderNumber?: number;
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

export interface WorkSeasonDto {
  id: string;
  name: string;
  status: SeasonStatus;
  startsAt: string;
  endsAt: string | null;
  currency: Currency;
  openingCapital: string;
  openingCash: string;
  closingReport: SeasonReport | null;
  capitalIn?: string;
  capitalOut?: string;
  createdAt: string;
}

export interface SeasonReport {
  salesTotal: string;
  salesCost: string;
  profit: string;
  ordersCount: number;
  expensesTotal: string;
  capitalIn: string;
  capitalOut: string;
}

export interface CapitalEntryDto {
  id: string;
  seasonId: string;
  type: CapitalEntryType;
  amount: string;
  note: string | null;
  performedByName?: string;
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
  orders: number;
}

export interface SalesReportDto {
  points: SalesReportPoint[];
  totals: {
    salesTotal: string;
    salesCost: string;
    profit: string;
    ordersCount: number;
    averageOrder: string;
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
  ordersCount: number;
  total: string;
  cost: string;
  profit: string;
}

export interface SellerReportRow {
  sellerId: string;
  name: string;
  ordersCount: number;
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
  behavior: { lastAdminLoginAt: string | null; totalOrders: number };
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
  todayOrders: number;
  ordersByStatus: Record<OrderStatus, number>;
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
