import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  CreateBucketCommand,
  GetObjectCommand,
  HeadBucketCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { envBoolean, requireEnv } from '../common/env';

@Injectable()
export class StorageService implements OnModuleInit {
  private readonly logger = new Logger(StorageService.name);
  private readonly client: S3Client;
  private readonly bucket: string;

  constructor(private readonly config: ConfigService) {
    this.bucket = requireEnv(config, 'S3_BUCKET');
    this.client = new S3Client({
      region: this.config.get<string>('S3_REGION') ?? 'us-east-1',
      endpoint: this.config.get<string>('S3_ENDPOINT'),
      forcePathStyle: envBoolean(this.config, 'S3_FORCE_PATH_STYLE', true),
      credentials: {
        accessKeyId: requireEnv(this.config, 'S3_ACCESS_KEY'),
        secretAccessKey: requireEnv(this.config, 'S3_SECRET_KEY'),
      },
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

  private async ensureBucket(): Promise<void> {
    try {
      await this.client.send(new HeadBucketCommand({ Bucket: this.bucket }));
    } catch {
      this.logger.log(`Creating bucket ${this.bucket}`);
      await this.client.send(new CreateBucketCommand({ Bucket: this.bucket }));
    }
  }
}
