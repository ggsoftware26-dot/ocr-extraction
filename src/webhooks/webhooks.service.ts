import { Injectable, Logger } from '@nestjs/common';
import type { ExtractionResult } from '../extraction/schema';
import { ProcessedMessageStore } from '../imap/processed-message.store';
import { MailService } from '../mail/mail.service';

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

  constructor(
    private readonly store: ProcessedMessageStore,
    private readonly mail: MailService,
  ) {}

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

      void this.mail
        .sendOcrResult({
          record,
          result: payload.result,
          processingTimeMs: payload.processing_time_ms,
        })
        .catch((error) => {
          this.logger.error(
            [
              `Failed to email OCR result for job ${payload.job_id}:`,
              error instanceof Error ? error.message : String(error),
              `(SMTP ${process.env.SMTP_HOST ?? 'smtp.gmail.com'}:${process.env.SMTP_PORT ?? '465'} — if Connection timeout, try SMTP_PORT=465 SMTP_SECURE=true or check VPS outbound SMTP)`,
            ].join(' '),
          );
        });
      return;
    }

    this.logger.error(
      `OCR failed for job ${payload.job_id} (${record.attachmentName}): ${payload.error ?? 'unknown error'}`,
    );

    void this.mail
      .sendOcrFailure({
        record,
        error: payload.error ?? 'unknown error',
        processingTimeMs: payload.processing_time_ms,
      })
      .catch((error) => {
        this.logger.error(
          `Failed to email OCR failure for job ${payload.job_id}: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      });
  }
}
