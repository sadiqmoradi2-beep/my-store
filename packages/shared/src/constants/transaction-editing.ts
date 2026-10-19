/** Store Admin → Settings: how long after recording a manual transaction may be corrected. DISABLED is the default. */
export const TRANSACTION_EDITING_WINDOWS = ['DISABLED', '1h', '24h', '7d', '30d', '1y'] as const;
export type TransactionEditingWindow = (typeof TRANSACTION_EDITING_WINDOWS)[number];

export const TRANSACTION_EDITING_WINDOW_MS: Record<TransactionEditingWindow, number> = {
  DISABLED: 0,
  '1h': 3_600_000,
  '24h': 86_400_000,
  '7d': 7 * 86_400_000,
  '30d': 30 * 86_400_000,
  '1y': 365 * 86_400_000,
};

/** The store's editing window — anything missing or unknown counts as DISABLED */
export function transactionEditingWindowOf(settings: unknown): TransactionEditingWindow {
  const value = (settings as { transactionEditingWindow?: unknown } | null | undefined)?.transactionEditingWindow;
  return (TRANSACTION_EDITING_WINDOWS as readonly unknown[]).includes(value) ? (value as TransactionEditingWindow) : 'DISABLED';
}

/** Only manually entered transactions of these types can be corrected (linked ones go through their own workflow) */
export const CORRECTABLE_TRANSACTION_TYPES = ['INCOME', 'EXPENSE', 'WITHDRAWAL'] as const;

/** referenceType of a correction entry */
export const CORRECTION_REFERENCE_TYPE = 'correction';

/** An exception grant (after re-entering the password) is valid this long, once */
export const EDIT_GRANT_TTL_MS = 10 * 60_000;
