import { Body, Controller, Get, Post } from '@nestjs/common';
import { ProcessedMessageStore } from '../imap/processed-message.store';
import type { OcrWebhookPayload } from './webhooks.service';
import { WebhooksService } from './webhooks.service';

@Controller()
export class WebhooksController {
  constructor(
    private readonly webhooks: WebhooksService,
    private readonly store: ProcessedMessageStore,
  ) {}

  @Get('health')
  health() {
    return { status: 'ok', service: 'ingest' };
  }

  @Get('records')
  records() {
    return { records: this.store.list() };
  }

  @Post('webhooks/ocr')
  async ocrWebhook(@Body() body: OcrWebhookPayload) {
    await this.webhooks.handleOcrWebhook(body);
    return { received: true };
  }
}
