import { Logger } from '@nestjs/common';
import { ChannelMessage, NotificationChannelProvider } from './notification-channel.provider';

/**
 * Default implementation of the external channels: just logs (placeholder).
 * It can be swapped for a real SMS/WhatsApp gateway without changing the
 * processor or caller — simply register the real provider under the
 * SMS_PROVIDER/WHATSAPP_PROVIDER token.
 */
export class LogChannelProvider implements NotificationChannelProvider {
  private readonly logger = new Logger(LogChannelProvider.name);

  constructor(private readonly channelName: string) {}

  async send(message: ChannelMessage): Promise<void> {
    this.logger.log(`[${this.channelName} → ${message.to}] ${message.title}`);
  }
}
