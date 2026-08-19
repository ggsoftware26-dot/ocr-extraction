import { Injectable, Logger } from '@nestjs/common';
import type { ExtractionResult } from '../extraction/schema';
import { ProcessedMessageStore } from '../imap/processed-message.store';

export type OcrWebhookPayload = {
  job_id: string;
  status: 'completed' | 'failed';
  result: ExtractionResult | null;
  processing_time_ms: number | null;
  error: string | null;
};

@Injectable()
export class WebhooksService {
  private readonly logger = new Logger(WebhooksService.name);

  constructor(private readonly store: ProcessedMessageStore) {}

  async handleOcrWebhook(payload: OcrWebhookPayload): Promise<void> {
    const record = await this.store.updateFromWebhook({
      ocrJobId: payload.job_id,
      status: payload.status,
      result: payload.result,
      error: payload.error,
      processingTimeMs: payload.processing_time_ms,
    });

    if (!record) {
      this.logger.warn(
        `Received OCR webhook for unknown job ${payload.job_id}`,
      );
      return;
    }

    if (payload.status === 'completed' && payload.result) {
      this.logger.log(
        [
          `OCR completed for job ${payload.job_id}`,
          `from="${record.from}"`,
          `subject="${record.subject}"`,
          `attachment="${record.attachmentName}"`,
          `document_type="${payload.result.document_type}"`,
          `summary="${payload.result.summary}"`,
        ].join(' '),
      );
      return;
    }

    this.logger.error(
      `OCR failed for job ${payload.job_id} (${record.attachmentName}): ${payload.error ?? 'unknown error'}`,
    );
  }
}
