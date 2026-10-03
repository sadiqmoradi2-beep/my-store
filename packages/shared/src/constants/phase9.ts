/** Phase 9 constants — billing cycle, subscription history, platform feedback */

export const BILLING_CYCLES = ['MONTHLY', 'YEARLY'] as const;
export type BillingCycle = (typeof BILLING_CYCLES)[number];

export const BILLING_CYCLE_NAMES: Record<BillingCycle, string> = {
  MONTHLY: 'Monthly',
  YEARLY: 'Yearly',
};

export const SUBSCRIPTION_HISTORY_EVENTS = [
  'PLAN_CHANGED',
  'RENEWED',
  'EXPIRED_DOWNGRADE',
  'PLAN_STOPPED',
  'PLAN_RESUMED',
] as const;
export type SubscriptionHistoryEvent = (typeof SUBSCRIPTION_HISTORY_EVENTS)[number];

export const SUBSCRIPTION_HISTORY_EVENT_NAMES: Record<SubscriptionHistoryEvent, string> = {
  PLAN_CHANGED: 'Plan changed',
  RENEWED: 'Renewed',
  EXPIRED_DOWNGRADE: 'Expired — downgraded to Free',
  PLAN_STOPPED: 'Plan stopped by the platform admin',
  PLAN_RESUMED: 'Plan resumed by the platform admin',
};

export const PLATFORM_FEEDBACK_TYPES = ['SUGGESTION', 'COMPLAINT', 'BUG', 'FEATURE_REQUEST'] as const;
export type PlatformFeedbackType = (typeof PLATFORM_FEEDBACK_TYPES)[number];

export const PLATFORM_FEEDBACK_TYPE_NAMES: Record<PlatformFeedbackType, string> = {
  SUGGESTION: 'Suggestion',
  COMPLAINT: 'Complaint',
  BUG: 'Bug',
  FEATURE_REQUEST: 'Feature request',
};

export const PLATFORM_FEEDBACK_STATUSES = ['NEW', 'IN_PROGRESS', 'DONE', 'REJECTED'] as const;
export type PlatformFeedbackStatus = (typeof PLATFORM_FEEDBACK_STATUSES)[number];

export const PLATFORM_FEEDBACK_STATUS_NAMES: Record<PlatformFeedbackStatus, string> = {
  NEW: 'New',
  IN_PROGRESS: 'In progress',
  DONE: 'Done',
  REJECTED: 'Rejected',
};
