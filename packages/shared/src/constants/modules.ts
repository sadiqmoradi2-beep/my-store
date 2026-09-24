export type PlanCode = 'FREE' | 'STARTER' | 'BUSINESS' | 'ENTERPRISE';

export interface ModuleDefinition {
  key: string;
  name: string;
  version: string;
  isCore: boolean;
  dependsOn: string[];
  minPlan: PlanCode;
}

export const MODULE_REGISTRY: ModuleDefinition[] = [
  { key: 'dashboard', name: 'Dashboard', version: '1.0.0', isCore: true, dependsOn: [], minPlan: 'FREE' },
  { key: 'users', name: 'Users & Roles', version: '1.0.0', isCore: true, dependsOn: [], minPlan: 'FREE' },
  { key: 'branches', name: 'Branches', version: '1.0.0', isCore: true, dependsOn: [], minPlan: 'FREE' },
  { key: 'categories', name: 'Categories', version: '1.0.0', isCore: true, dependsOn: [], minPlan: 'FREE' },
  { key: 'products', name: 'Products', version: '1.0.0', isCore: true, dependsOn: ['categories'], minPlan: 'FREE' },
  { key: 'inventory', name: 'Inventory', version: '1.0.0', isCore: true, dependsOn: ['products', 'branches'], minPlan: 'FREE' },
  { key: 'orders', name: 'Orders', version: '1.0.0', isCore: true, dependsOn: ['products', 'inventory'], minPlan: 'FREE' },
  { key: 'cart', name: 'Cart', version: '1.0.0', isCore: false, dependsOn: ['products'], minPlan: 'FREE' },
  { key: 'payments', name: 'Payments', version: '1.0.0', isCore: false, dependsOn: ['orders'], minPlan: 'FREE' },
  { key: 'cash-register', name: 'Cash Register', version: '1.0.0', isCore: true, dependsOn: ['branches'], minPlan: 'FREE' },
  { key: 'sellers', name: 'Sellers', version: '1.0.0', isCore: false, dependsOn: ['users'], minPlan: 'BUSINESS' },
  { key: 'employees', name: 'Employees', version: '1.0.0', isCore: false, dependsOn: ['users'], minPlan: 'BUSINESS' },
  { key: 'work-season', name: 'Work Season', version: '1.0.0', isCore: false, dependsOn: ['users'], minPlan: 'ENTERPRISE' },
  { key: 'debts', name: 'Debts & Credits', version: '1.0.0', isCore: false, dependsOn: [], minPlan: 'BUSINESS' },
  { key: 'returns', name: 'Return Purchase', version: '1.0.0', isCore: false, dependsOn: ['suppliers', 'inventory'], minPlan: 'FREE' },
  { key: 'suppliers', name: 'Suppliers', version: '1.0.0', isCore: false, dependsOn: ['inventory'], minPlan: 'BUSINESS' },
  { key: 'reports', name: 'Reports', version: '1.0.0', isCore: false, dependsOn: ['orders'], minPlan: 'BUSINESS' },
  { key: 'partners', name: 'Partners', version: '1.0.0', isCore: false, dependsOn: [], minPlan: 'ENTERPRISE' },
  { key: 'notifications', name: 'Notifications', version: '1.0.0', isCore: false, dependsOn: [], minPlan: 'BUSINESS' },
  { key: 'activity-log', name: 'Activity Log', version: '1.0.0', isCore: false, dependsOn: [], minPlan: 'ENTERPRISE' },
  { key: 'backups', name: 'Backups', version: '1.0.0', isCore: false, dependsOn: [], minPlan: 'ENTERPRISE' },
];

export const CORE_MODULE_KEYS = MODULE_REGISTRY.filter((m) => m.isCore).map((m) => m.key);
