import { Injectable, NotFoundException } from '@nestjs/common';
import {
  parseStoredExtractionDocument,
  type ExtractionMeta,
  type ExtractionResult,
} from '../extraction/schema';
import { StorageService } from '../storage/storage.service';

export type ResultFileKind = 'image' | 'pdf' | 'doc';

export type StoredResultView = {
  job_id: string;
  name: string;
  kind: ResultFileKind;
  has_preview: boolean;
  status: 'completed';
  result: ExtractionResult;
  created_at: string;
  processing_time_ms: number | null;
  model: string | null;
  usage: ExtractionMeta['usage'] | null;
  cost_usd: number | null;
  pricing: ExtractionMeta['pricing'] | null;
  error: null;
};

export type ResultPreview = {
  body: Buffer;
  contentType: string;
  name: string;
};

@Injectable()
export class ResultsService {
  constructor(private readonly storage: StorageService) {}

  async list(limit = 50): Promise<{ items: StoredResultView[]; total: number }> {
    const cappedLimit = Math.min(Math.max(limit, 1), 200);
    const resultObjects = await this.storage.listObjects('results/', 1000);
    const uploadObjects = await this.storage.listObjects('uploads/', 1000);
    const uploadsByJob = buildUploadIndex(uploadObjects);

    const items = (
      await Promise.all(
        resultObjects
          .filter((object) => object.key.endsWith('.json'))
          .map(async (object) => {
            const jobId = jobIdFromResultKey(object.key);
            if (!jobId) {
              return null;
            }
            return this.buildView(jobId, object, uploadsByJob.get(jobId));
          }),
      )
    ).filter((item): item is StoredResultView => item !== null);

    items.sort(
      (a, b) =>
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
    );

    return {
      items: items.slice(0, cappedLimit),
      total: items.length,
    };
  }

  async get(jobId: string): Promise<StoredResultView> {
    const key = this.storage.resultKey(jobId);
    const head = await this.storage.headObject(key);
    if (!head) {
      throw new NotFoundException(`Result ${jobId} not found`);
    }

    const upload = await this.storage.findUploadForJob(jobId);
    const view = await this.buildView(jobId, head, upload ?? undefined);
    if (!view) {
      throw new NotFoundException(`Result ${jobId} is invalid`);
    }
    return view;
  }

  async getPreview(jobId: string): Promise<ResultPreview> {
    const upload = await this.storage.findUploadForJob(jobId);
    if (!upload) {
      throw new NotFoundException(`Preview for ${jobId} not found`);
    }

    const body = await this.storage.getObject(upload.key);
    const name = this.storage.uploadNameFromKey(upload.key);
    return {
      body,
      contentType: resolveContentType(name, upload.contentType),
      name,
    };
  }

  private async buildView(
    jobId: string,
    resultObject: { key: string; lastModified?: Date },
    upload?: { key: string; lastModified?: Date; contentType?: string },
  ): Promise<StoredResultView | null> {
    try {
      const raw = await this.storage.getObject(resultObject.key);
      const { result, meta } = parseStoredExtractionDocument(
        JSON.parse(raw.toString('utf8')),
      );
      const name = upload
        ? this.storage.uploadNameFromKey(upload.key)
        : `${jobId}.json`;

      return {
        job_id: jobId,
        name,
        kind: fileKind(name),
        has_preview: Boolean(upload),
        status: 'completed',
        result,
        created_at: (
          resultObject.lastModified ?? new Date(0)
        ).toISOString(),
        processing_time_ms: meta?.processing_time_ms ?? null,
        model: meta?.model ?? null,
        usage: meta?.usage ?? null,
        cost_usd: meta?.cost_usd ?? null,
        pricing: meta?.pricing ?? null,
        error: null,
      };
    } catch {
      return null;
    }
  }
}

function buildUploadIndex(
  uploadObjects: { key: string; lastModified?: Date; contentType?: string }[],
) {
  const map = new Map<
    string,
    { key: string; lastModified?: Date; contentType?: string }
  >();

  for (const object of uploadObjects) {
    const match = /^uploads\/([^/]+)\/.+/.exec(object.key);
    if (!match) {
      continue;
    }
    map.set(match[1], object);
  }

  return map;
}

function jobIdFromResultKey(key: string): string | null {
  const match = /^results\/(.+)\.json$/.exec(key);
  return match?.[1] ?? null;
}

function fileKind(name: string): ResultFileKind {
  const ext = name.split('.').pop()?.toLowerCase() ?? '';
  if (ext === 'pdf') {
    return 'pdf';
  }
  if (['jpg', 'jpeg', 'png', 'webp', 'gif', 'tif', 'tiff', 'bmp'].includes(ext)) {
    return 'image';
  }
  return 'doc';
}

function resolveContentType(name: string, stored?: string): string {
  if (stored) {
    return stored;
  }

  const ext = name.split('.').pop()?.toLowerCase() ?? '';
  const byExt: Record<string, string> = {
    pdf: 'application/pdf',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    png: 'image/png',
    webp: 'image/webp',
    gif: 'image/gif',
    tif: 'image/tiff',
    tiff: 'image/tiff',
    bmp: 'image/bmp',
  };
  return byExt[ext] ?? 'application/octet-stream';
}
