import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { OcrClientModule } from '../ocr-client/ocr-client.module';
import { AttachmentExtractorService } from './attachment-extractor.service';
import { ImapService } from './imap.service';
import { MessageFilterService } from './message-filter.service';
import { ProcessedMessageStore } from './processed-message.store';

@Module({
  imports: [ConfigModule, OcrClientModule],
  providers: [
    ProcessedMessageStore,
    AttachmentExtractorService,
    MessageFilterService,
    ImapService,
  ],
  exports: [ImapService, ProcessedMessageStore],
})
export class ImapModule {}
