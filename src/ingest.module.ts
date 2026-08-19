import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ImapModule } from './imap/imap.module';
import { WebhooksModule } from './webhooks/webhooks.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ImapModule,
    WebhooksModule,
  ],
})
export class IngestModule {}
