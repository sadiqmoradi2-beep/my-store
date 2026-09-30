import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MAIL_PROVIDER } from './mail-provider';
import { LogMailProvider } from './log-mail.provider';
import { SmtpMailProvider } from './smtp-mail.provider';
import { BrevoMailProvider } from './brevo-mail.provider';
import { MailService } from './mail.service';

/** Global — every module (auth, others later) can access MailService without an explicit import */
@Global()
@Module({
  providers: [
    MailService,
    {
      provide: MAIL_PROVIDER,
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        // Brevo first — an HTTPS API, unlike SMTP it isn't blocked by hosts that filter outbound
        // mail ports (Render included)
        const brevo = config.get<{ apiKey?: string; fromEmail?: string; fromName: string }>('brevo')!;
        if (brevo.apiKey && brevo.fromEmail) {
          return new BrevoMailProvider(brevo.apiKey, brevo.fromEmail, brevo.fromName);
        }
        const smtp = config.get<{ host?: string; port: number; user?: string; pass?: string; from: string }>('smtp')!;
        if (smtp.host && smtp.user && smtp.pass) {
          return new SmtpMailProvider(smtp.host, smtp.port, smtp.user, smtp.pass, smtp.from);
        }
        // Nothing configured (e.g. local dev) — log the email instead of sending it
        return new LogMailProvider();
      },
    },
  ],
  exports: [MailService],
})
export class MailModule {}
