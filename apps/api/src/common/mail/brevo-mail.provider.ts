import { MailMessage, MailProvider } from './mail-provider';

/**
 * Sends email over Brevo's HTTPS API instead of SMTP — cloud hosts that block outbound SMTP
 * ports (Render included) can still reach this over normal HTTPS.
 */
export class BrevoMailProvider implements MailProvider {
  constructor(
    private readonly apiKey: string,
    private readonly fromEmail: string,
    private readonly fromName: string,
  ) {}

  async send(message: MailMessage): Promise<void> {
    const res = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: { 'api-key': this.apiKey, 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({
        sender: { email: this.fromEmail, name: this.fromName },
        to: [{ email: message.to }],
        subject: message.subject,
        htmlContent: message.html,
      }),
    });
    if (!res.ok) {
      throw new Error(`Brevo send failed (${res.status}): ${await res.text()}`);
    }
  }
}
