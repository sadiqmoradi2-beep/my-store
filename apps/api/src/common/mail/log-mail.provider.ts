import { Logger } from '@nestjs/common';
import { MailMessage, MailProvider } from './mail-provider';

/**
 * Default mail implementation: just logs (placeholder) — until a real SMTP/service is configured.
 * It can be swapped for real sending without changing MailService or its callers — simply register
 * the real provider under the MAIL_PROVIDER token.
 */
export class LogMailProvider implements MailProvider {
  private readonly logger = new Logger(LogMailProvider.name);

  async send(message: MailMessage): Promise<void> {
    this.logger.log(`[MAIL → ${message.to}] ${message.subject}\n${message.html}`);
  }
}
