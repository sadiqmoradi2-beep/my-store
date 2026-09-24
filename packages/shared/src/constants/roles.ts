export const ROLES = {
  SUPER_ADMIN: 'SUPER_ADMIN',
  ADMIN: 'ADMIN',
  BRANCH_MANAGER: 'BRANCH_MANAGER',
  SALES_MANAGER: 'SALES_MANAGER',
  SELLER: 'SELLER',
  EMPLOYEE: 'EMPLOYEE',
  WAREHOUSE_STAFF: 'WAREHOUSE_STAFF',
  CASHIER: 'CASHIER',
} as const;

export type RoleKey = (typeof ROLES)[keyof typeof ROLES];

export const SYSTEM_ROLE_NAMES: Record<RoleKey, string> = {
  SUPER_ADMIN: 'Super Admin',
  ADMIN: 'Admin',
  BRANCH_MANAGER: 'Branch Manager',
  SALES_MANAGER: 'Sales Manager',
  SELLER: 'Seller',
  EMPLOYEE: 'Employee',
  WAREHOUSE_STAFF: 'Warehouse Staff',
  CASHIER: 'Cashier',
};
