import { RoleKey } from '../constants/roles';

export type Locale = 'en';
export type CalendarType = 'GREGORIAN';
export type ThemePreference = 'light' | 'dark' | 'system';

export const UI_ACCENTS = ['shal', 'blue', 'violet', 'rose', 'amber'] as const;
export type UiAccent = (typeof UI_ACCENTS)[number];

export const UI_FONT_SCALES = ['sm', 'md', 'lg'] as const;
export type UiFontScale = (typeof UI_FONT_SCALES)[number];

export const UI_DENSITIES = ['comfortable', 'compact'] as const;
export type UiDensity = (typeof UI_DENSITIES)[number];

/** Dashboard personalization — stored on User.uiPrefs. */
export interface UiPrefs {
  accent?: UiAccent;
  fontScale?: UiFontScale;
  density?: UiDensity;
  /** Preferred menu item order; newly added keys are appended to the end. */
  menuOrder?: string[];
}

export interface AuthUser {
  id: string;
  tenantId: string | null;
  email: string;
  fullName: string;
  roleKey: RoleKey;
  branchId: string | null;
  locale: Locale;
  calendar: CalendarType;
  theme: ThemePreference;
  uiPrefs: UiPrefs | null;
  twoFactorEnabled: boolean;
  permissions: string[];
  /** The platform admin stopped this store's plan — the store is read-only */
  planStopped?: boolean;
}

export interface LoginResponse {
  accessToken: string;
  user: AuthUser;
}

/** Login response shape when 2FA is enabled and the code hasn't been provided yet. */
export interface TwoFactorRequired {
  requires2fa: true;
}

export interface TwoFactorSetup {
  secret: string;
  otpauthUrl: string;
}

export interface JwtPayload {
  sub: string;
  tenantId: string | null;
  roleId: string;
  roleKey: RoleKey;
}
