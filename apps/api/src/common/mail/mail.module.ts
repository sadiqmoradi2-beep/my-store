import { Global, Module } from '@nestjs/common';
import { MAIL_PROVIDER } from './mail-provider';
import { LogMailProvider } from './log-mail.provider';
import { MailService } from './mail.service';

/** Global — every module (auth, others later) can access MailService without an explicit import */
@Global()
@Module({
  providers: [MailService, { provide: MAIL_PROVIDER, useValue: new LogMailProvider() }],
  exports: [MailService],
})
export class MailModule {}
