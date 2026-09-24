export interface ChannelMessage {
  to: string;
  title: string;
  body?: string;
}

/** Abstraction over a send channel — a real implementation (Twilio/Kavenegar/WhatsApp Business API, etc.) is plugged in later */
export interface NotificationChannelProvider {
  send(message: ChannelMessage): Promise<void>;
}

export const SMS_PROVIDER = Symbol('SMS_PROVIDER');
export const WHATSAPP_PROVIDER = Symbol('WHATSAPP_PROVIDER');
