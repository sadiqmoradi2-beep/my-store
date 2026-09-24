export interface MailMessage {
  to: string;
  subject: string;
  html: string;
}

/** Mail-sending abstraction — a real implementation (SMTP/SendGrid/Mailgun, etc.) can later replace it without changing MailService */
export interface MailProvider {
  send(message: MailMessage): Promise<void>;
}

export const MAIL_PROVIDER = Symbol('MAIL_PROVIDER');
