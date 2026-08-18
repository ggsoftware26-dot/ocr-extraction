import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { randomUUID } from 'crypto';
import {
  ALLOWED_MIME_TYPES,
  MIME_BY_EXTENSION,
  OCR_QUEUE,
} from '../common/constants';
import { StorageService } from '../storage/storage.service';
import type { ExtractionResult } from '../extraction/schema';
import {
  jobProcessingTimeMs,
  type JobStatus,
  type OcrJobData,
} from './job.types';

export type JobView = {
  job_id: string;
  status: JobStatus;
  result: ExtractionResult | null;
  processing_time_ms: number | null;
  error: string | null;
};

@Injectable()
export class JobsService {
  constructor(
    @InjectQueue(OCR_QUEUE) private readonly queue: Queue<OcrJobData>,
    private readonly storage: StorageService,
  ) {}

  async create(
    file: Express.Multer.File,
    webhookUrl?: string,
  ): Promise<JobView> {
    if (!file.buffer?.length) {
      throw new BadRequestException('file is empty');
    }
    const mimeType = resolveMimeType(file);
    const jobId = randomUUID();
    const objectKey = this.storage.uploadKey(jobId, file.originalname);

    await this.storage.putObject(objectKey, file.buffer, mimeType);

    const data: OcrJobData = {
      jobId,
      objectKey,
      mimeType,
      originalName: file.originalname,
      webhookUrl: parseWebhookUrl(webhookUrl),
    };

    await this.queue.add('extract', data, {
      jobId,
    });

    return {
      job_id: jobId,
      status: 'queued',
      result: null,
      processing_time_ms: null,
      error: null,
    };
  }

  async get(jobId: string): Promise<JobView> {
    const job = await this.queue.getJob(jobId);
    if (!job) {
      throw new NotFoundException(`Job ${jobId} not found`);
    }

    const state = await job.getState();
    const status = mapBullState(state);

    if (status === 'completed') {
      return {
        job_id: jobId,
        status,
        result: (job.returnvalue as ExtractionResult | undefined) ?? null,
        processing_time_ms: jobProcessingTimeMs(job),
        error: null,
      };
    }

    if (status === 'failed') {
      return {
        job_id: jobId,
        status,
        result: null,
        processing_time_ms: jobProcessingTimeMs(job),
        error: job.failedReason ?? 'Extraction failed',
      };
    }

    return {
      job_id: jobId,
      status,
      result: null,
      processing_time_ms:
        status === 'processing' ? jobProcessingTimeMs(job) : null,
      error: null,
    };
  }
}

function resolveMimeType(file: Express.Multer.File): string {
  const reported = (file.mimetype || '').toLowerCase();
  if ((ALLOWED_MIME_TYPES as readonly string[]).includes(reported)) {
    return reported === 'image/jpg' ? 'image/jpeg' : reported;
  }

  const ext = file.originalname.split('.').pop()?.toLowerCase() ?? '';
  const fromExt = MIME_BY_EXTENSION[ext];
  if (fromExt) {
    return fromExt;
  }

  throw new BadRequestException(
    'Unsupported file type. Upload a PDF or image (jpeg, png, webp, gif, tiff, bmp).',
  );
}

function parseWebhookUrl(value?: string): string | undefined {
  if (!value) {
    return undefined;
  }
  try {
    const url = new URL(value);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      throw new Error('invalid protocol');
    }
    return url.toString();
  } catch {
    throw new BadRequestException('webhook_url must be a valid http(s) URL');
  }
}

function mapBullState(state: string): JobStatus {
  switch (state) {
    case 'active':
      return 'processing';
    case 'completed':
      return 'completed';
    case 'failed':
      return 'failed';
    default:
      return 'queued';
  }
}
