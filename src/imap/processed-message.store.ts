import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import type { ExtractionResult } from '../extraction/schema';
import { loadImapConfig } from './imap.config';

export type ProcessedStatus = 'queued' | 'completed' | 'failed';

export type ProcessedRecord = {
  id: string;
  messageId: string;
  attachmentName: string;
  subject: string;
  from: string;
  ocrJobId: string;
  status: ProcessedStatus;
  result: ExtractionResult | null;
  error: string | null;
  processingTimeMs: number | null;
  createdAt: string;
  updatedAt: string;
};

type StoreFile = {
  records: ProcessedRecord[];
};

@Injectable()
export class ProcessedMessageStore implements OnModuleInit {
  private readonly logger = new Logger(ProcessedMessageStore.name);
  private readonly storePath: string;
  private records = new Map<string, ProcessedRecord>();

  constructor(config: ConfigService) {
    this.storePath = loadImapConfig(config).processedStorePath;
  }

  async onModuleInit(): Promise<void> {
    await this.load();
  }

  makeId(messageId: string, attachmentName: string): string {
    return `${messageId}::${attachmentName}`;
  }

  has(messageId: string, attachmentName: string): boolean {
    return this.records.has(this.makeId(messageId, attachmentName));
  }

  findByOcrJobId(ocrJobId: string): ProcessedRecord | undefined {
    for (const record of this.records.values()) {
      if (record.ocrJobId === ocrJobId) {
        return record;
      }
    }
    return undefined;
  }

  async addQueued(input: {
    messageId: string;
    attachmentName: string;
    subject: string;
    from: string;
    ocrJobId: string;
  }): Promise<ProcessedRecord> {
    const now = new Date().toISOString();
    const record: ProcessedRecord = {
      id: this.makeId(input.messageId, input.attachmentName),
      messageId: input.messageId,
      attachmentName: input.attachmentName,
      subject: input.subject,
      from: input.from,
      ocrJobId: input.ocrJobId,
      status: 'queued',
      result: null,
      error: null,
      processingTimeMs: null,
      createdAt: now,
      updatedAt: now,
    };
    this.records.set(record.id, record);
    await this.persist();
    return record;
  }

  async updateFromWebhook(input: {
    ocrJobId: string;
    status: 'completed' | 'failed';
    result: ExtractionResult | null;
    error: string | null;
    processingTimeMs: number | null;
  }): Promise<ProcessedRecord | undefined> {
    const record = this.findByOcrJobId(input.ocrJobId);
    if (!record) {
      return undefined;
    }

    record.status = input.status;
    record.result = input.result;
    record.error = input.error;
    record.processingTimeMs = input.processingTimeMs;
    record.updatedAt = new Date().toISOString();
    this.records.set(record.id, record);
    await this.persist();
    return record;
  }

  list(): ProcessedRecord[] {
    return [...this.records.values()].sort((a, b) =>
      b.updatedAt.localeCompare(a.updatedAt),
    );
  }

  private async load(): Promise<void> {
    try {
      const raw = await readFile(this.storePath, 'utf8');
      const parsed = JSON.parse(raw) as StoreFile;
      this.records = new Map(
        (parsed.records ?? []).map((record) => [record.id, record]),
      );
      this.logger.log(
        `Loaded ${this.records.size} processed IMAP record(s) from ${this.storePath}`,
      );
    } catch (error) {
      if (isEnoent(error)) {
        this.logger.log(
          `No processed store at ${this.storePath}; starting fresh`,
        );
        return;
      }
      throw error;
    }
  }

  private async persist(): Promise<void> {
    await mkdir(dirname(this.storePath), { recursive: true });
    const payload: StoreFile = { records: this.list() };
    await writeFile(this.storePath, JSON.stringify(payload, null, 2), 'utf8');
  }
}

function isEnoent(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    error.code === 'ENOENT'
  );
}
