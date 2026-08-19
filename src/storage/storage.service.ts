import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  CreateBucketCommand,
  GetObjectCommand,
  HeadBucketCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import type { BucketLocationConstraint } from '@aws-sdk/client-s3';
import { envBoolean, requireEnv } from '../common/env';

export type StoredObject = {
  key: string;
  lastModified?: Date;
  size?: number;
  contentType?: string;
};

@Injectable()
export class StorageService implements OnModuleInit {
  private readonly logger = new Logger(StorageService.name);
  private readonly client: S3Client;
  private readonly bucket: string;

  private readonly region: string;

  constructor(private readonly config: ConfigService) {
    this.bucket = requireEnv(config, 'S3_BUCKET');
    const configuredRegion = this.config.get<string>('S3_REGION') ?? 'us-east-1';
    // Cloudflare R2 accepts "auto" in docs; AWS SDK needs a concrete region for signing.
    this.region = configuredRegion === 'auto' ? 'us-east-1' : configuredRegion;
    const endpoint = normalizeEndpoint(this.config.get<string>('S3_ENDPOINT'));
    const accessKeyId = this.config.get<string>('S3_ACCESS_KEY');
    const secretAccessKey = this.config.get<string>('S3_SECRET_KEY');

    this.client = new S3Client({
      region: this.region,
      ...(endpoint ? { endpoint } : {}),
      forcePathStyle: envBoolean(this.config, 'S3_FORCE_PATH_STYLE', true),
      ...(accessKeyId && secretAccessKey
        ? { credentials: { accessKeyId, secretAccessKey } }
        : {}),
    });
  }

  async onModuleInit(): Promise<void> {
    await this.ensureBucket();
  }

  uploadKey(jobId: string, originalName: string): string {
    const safeName = originalName.replace(/[^\w.-]+/g, '_') || 'file';
    return `uploads/${jobId}/${safeName}`;
  }

  resultKey(jobId: string): string {
    return `results/${jobId}.json`;
  }

  async putObject(
    key: string,
    body: Buffer,
    contentType: string,
  ): Promise<void> {
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: body,
        ContentType: contentType,
      }),
    );
  }

  async getObject(key: string): Promise<Buffer> {
    const response = await this.client.send(
      new GetObjectCommand({
        Bucket: this.bucket,
        Key: key,
      }),
    );
    if (!response.Body) {
      throw new Error(`Empty object body for key ${key}`);
    }
    const bytes = await response.Body.transformToByteArray();
    return Buffer.from(bytes);
  }

  async headObject(key: string): Promise<StoredObject | null> {
    try {
      const response = await this.client.send(
        new HeadObjectCommand({
          Bucket: this.bucket,
          Key: key,
        }),
      );
      return {
        key,
        lastModified: response.LastModified,
        size: response.ContentLength,
        contentType: response.ContentType,
      };
    } catch (error) {
      if (isNotFoundError(error)) {
        return null;
      }
      throw error;
    }
  }

  async listObjects(prefix: string, maxKeys = 1000): Promise<StoredObject[]> {
    const items: StoredObject[] = [];
    let continuationToken: string | undefined;

    do {
      const response = await this.client.send(
        new ListObjectsV2Command({
          Bucket: this.bucket,
          Prefix: prefix,
          MaxKeys: Math.min(maxKeys - items.length, 1000),
          ContinuationToken: continuationToken,
        }),
      );

      for (const object of response.Contents ?? []) {
        if (!object.Key) {
          continue;
        }
        items.push({
          key: object.Key,
          lastModified: object.LastModified,
          size: object.Size,
        });
        if (items.length >= maxKeys) {
          return items;
        }
      }

      continuationToken = response.IsTruncated
        ? response.NextContinuationToken
        : undefined;
    } while (continuationToken);

    return items;
  }

  uploadPrefix(jobId: string): string {
    return `uploads/${jobId}/`;
  }

  async findUploadForJob(jobId: string): Promise<StoredObject | null> {
    const objects = await this.listObjects(this.uploadPrefix(jobId), 1);
    return objects[0] ?? null;
  }

  uploadNameFromKey(key: string): string {
    const parts = key.split('/');
    return parts[parts.length - 1] || 'file';
  }

  private async ensureBucket(): Promise<void> {
    try {
      await this.client.send(new HeadBucketCommand({ Bucket: this.bucket }));
      return;
    } catch (error) {
      if (isR2Endpoint(this.config.get<string>('S3_ENDPOINT'))) {
        this.logger.warn(
          `R2 bucket "${this.bucket}" not verified at startup — create it in Cloudflare if missing: ${errorMessage(error)}`,
        );
        return;
      }

      this.logger.log(`Creating bucket ${this.bucket}`);
      const needsLocation = this.region !== 'us-east-1';
      await this.client.send(
        new CreateBucketCommand({
          Bucket: this.bucket,
          ...(needsLocation
            ? {
                CreateBucketConfiguration: {
                  LocationConstraint: this.region as BucketLocationConstraint,
                },
              }
            : {}),
        }),
      );
    }
  }
}

function normalizeEndpoint(value?: string): string | undefined {
  const trimmed = value?.trim();
  if (!trimmed) {
    return undefined;
  }
  return trimmed.replace(/\/+$/, '');
}

function isR2Endpoint(value?: string): boolean {
  return (value ?? '').includes('r2.cloudflarestorage.com');
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function isNotFoundError(error: unknown): boolean {
  const name =
    error instanceof Error
      ? error.name
      : typeof error === 'object' && error !== null && '$metadata' in error
        ? String((error as { name?: string }).name ?? '')
        : '';
  const status =
    typeof error === 'object' && error !== null && '$metadata' in error
      ? (error as { $metadata?: { httpStatusCode?: number } }).$metadata
          ?.httpStatusCode
      : undefined;
  return name === 'NotFound' || name === 'NoSuchKey' || status === 404;
}
