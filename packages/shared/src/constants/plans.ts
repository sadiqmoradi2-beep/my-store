import { PlanCode } from './modules';

export interface PlanDefinition {
  code: PlanCode;
  name: string;
  priceMonthly: number;
  /** Yearly price — optional since the free plan has no separate yearly price to display */
  priceYearly?: number;
  limits: { maxBranches: number; maxUsers: number; maxProducts: number };
}

/**
 * Plan rank for comparing modules' minPlan — STARTER and BUSINESS are equal rank (both have "all
 * services" except enterprise-level features); they differ only in branch/user limits and price.
 */
export const PLAN_RANK: Record<PlanCode, number> = { FREE: 0, STARTER: 1, BUSINESS: 1, ENTERPRISE: 2 };

export const PLANS: PlanDefinition[] = [
  {
    code: 'FREE',
    name: 'Free',
    priceMonthly: 0,
    limits: { maxBranches: 1, maxUsers: 3, maxProducts: 100 },
  },
  {
    code: 'STARTER',
    name: 'Basic',
    priceMonthly: 5,
    priceYearly: 50,
    limits: { maxBranches: 1, maxUsers: 10, maxProducts: 300 },
  },
  {
    code: 'BUSINESS',
    name: 'Business',
    priceMonthly: 10,
    priceYearly: 100,
    limits: { maxBranches: 3, maxUsers: 30, maxProducts: 1000 },
  },
  {
    code: 'ENTERPRISE',
    name: 'Enterprise',
    priceMonthly: 30,
    priceYearly: 300,
    limits: { maxBranches: -1, maxUsers: -1, maxProducts: -1 },
  },
];
