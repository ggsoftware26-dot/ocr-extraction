import { Module } from '@nestjs/common';
import { ImapModule } from '../imap/imap.module';
import { MailModule } from '../mail/mail.module';
import { WebhooksController } from './webhooks.controller';
import { WebhooksService } from './webhooks.service';

@Module({
  imports: [ImapModule, MailModule],
  controllers: [WebhooksController],
  providers: [WebhooksService],
})
export class WebhooksModule {}
