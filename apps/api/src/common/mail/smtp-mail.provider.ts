import { createTransport, Transporter } from 'nodemailer';
import { MailMessage, MailProvider } from './mail-provider';

/** Sends real email over SMTP — any provider works (Gmail app password, Resend, Mailgun, Brevo, ...) */
export class SmtpMailProvider implements MailProvider {
  private readonly transporter: Transporter;

  constructor(
    host: string,
    port: number,
    user: string,
    pass: string,
    private readonly from: string,
  ) {
    this.transporter = createTransport({ host, port, secure: port === 465, auth: { user, pass } });
  }

  async send(message: MailMessage): Promise<void> {
    await this.transporter.sendMail({ from: this.from, to: message.to, subject: message.subject, html: message.html });
  }
}
