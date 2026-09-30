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
    this.transporter = createTransport({
      host,
      port,
      secure: port === 465,
      auth: { user, pass },
      // Render (and many cloud hosts) have no IPv6 egress; Node's default resolver can still
      // hand back an IPv6 address first, which then fails with ENETUNREACH — force IPv4.
      // (nodemailer passes this straight through to net.connect; its own types don't list it)
      family: 4,
    } as Parameters<typeof createTransport>[0]);
  }

  async send(message: MailMessage): Promise<void> {
    await this.transporter.sendMail({ from: this.from, to: message.to, subject: message.subject, html: message.html });
  }
}
