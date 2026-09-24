/** Phase 5 constants — cache, message queue, mobile */

export const NOTIFICATION_CHANNELS = ['IN_APP', 'SMS', 'WHATSAPP'] as const;
export type NotificationChannel = (typeof NOTIFICATION_CHANNELS)[number];

export const NOTIFICATION_CHANNEL_NAMES: Record<NotificationChannel, string> = {
  IN_APP: 'In-app',
  SMS: 'SMS',
  WHATSAPP: 'WhatsApp',
};

export const DISPATCH_STATUSES = ['PENDING', 'SENT', 'FAILED'] as const;
export type DispatchStatus = (typeof DISPATCH_STATUSES)[number];
