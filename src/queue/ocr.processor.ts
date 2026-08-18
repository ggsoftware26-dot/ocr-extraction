import { Logger } from '@nestjs/common';
import { OnWorkerEvent, Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { ConfigService } from '@nestjs/config';
import { OCR_QUEUE } from '../common/constants';
import { envNumber } from '../common/env';
import { ExtractionService } from '../extraction/extraction.service';
import type { ExtractionResult } from '../extraction/schema';
import { StorageService } from '../storage/storage.service';
import { jobProcessingTimeMs, type OcrJobData } from '../jobs/job.types';

@Processor(OCR_QUEUE, {
  concurrency: Number(process.env.WORKER_CONCURRENCY ?? 4),
})
export class OcrProcessor extends WorkerHost {
  private readonly logger = new Logger(OcrProcessor.name);
  private readonly timeoutMs: number;

  constructor(
    private readonly extraction: ExtractionService,
    private readonly storage: StorageService,
    config: ConfigService,
  ) {
    super();
    this.timeoutMs = envNumber(config, 'EXTRACT_TIMEOUT_MS', 60_000);
  }

  async process(job: Job<OcrJobData>): Promise<ExtractionResult> {
    const { jobId, objectKey, mimeType } = job.data;
    this.logger.log(`Processing job ${jobId} (${mimeType})`);

    const bytes = await this.storage.getObject(objectKey);
    const result = await this.extraction.extract(bytes, mimeType);

    await this.storage.putObject(
      this.storage.resultKey(jobId),
      Buffer.from(JSON.stringify(result)),
      'application/json',
    );

    return result;
  }

  @OnWorkerEvent('completed')
  async onCompleted(job: Job<OcrJobData>, result: ExtractionResult) {
    await this.notifyWebhook(job, {
      job_id: job.data.jobId,
      status: 'completed',
      result,
      processing_time_ms: jobProcessingTimeMs(job),
      error: null,
    });
  }

  @OnWorkerEvent('failed')
  async onFailed(job: Job<OcrJobData> | undefined, error: Error) {
    if (!job) {
      return;
    }
    const maxAttempts = job.opts.attempts ?? 1;
    if (job.attemptsMade < maxAttempts) {
      return;
    }
    await this.notifyWebhook(job, {
      job_id: job.data.jobId,
      status: 'failed',
      result: null,
      processing_time_ms: jobProcessingTimeMs(job),
      error: error.message,
    });
  }

  private async notifyWebhook(
    job: Job<OcrJobData>,
    payload: {
      job_id: string;
      status: 'completed' | 'failed';
      result: ExtractionResult | null;
      processing_time_ms: number | null;
      error: string | null;
    },
  ): Promise<void> {
    const url = job.data.webhookUrl;
    if (!url) {
      return;
    }
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(Math.min(this.timeoutMs, 5_000)),
      });
      if (!response.ok) {
        this.logger.warn(
          `Webhook ${url} responded ${response.status} for job ${job.data.jobId}`,
        );
      }
    } catch (error) {
      this.logger.warn(
        `Webhook ${url} failed for job ${job.data.jobId}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }
}
