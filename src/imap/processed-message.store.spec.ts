import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { ConfigService } from '@nestjs/config';
import { ProcessedMessageStore } from './processed-message.store';

describe('ProcessedMessageStore', () => {
  let dir: string;
  let storePath: string;
  let store: ProcessedMessageStore;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'imap-store-'));
    storePath = join(dir, 'processed.json');
    const config = {
      get: (key: string) => {
        if (key === 'IMAP_PROCESSED_STORE_PATH') return storePath;
        if (key === 'IMAP_HOST') return 'imap.example.com';
        if (key === 'IMAP_USER') return 'user@example.com';
        if (key === 'IMAP_PASSWORD') return 'secret';
        if (key === 'OCR_API_KEY') return 'test-key';
        return undefined;
      },
    } as ConfigService;
    store = new ProcessedMessageStore(config);
    await store.onModuleInit();
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it('tracks queued records and deduplicates', async () => {
    await store.addQueued({
      messageId: '<a@example.com>',
      attachmentName: 'invoice.pdf',
      subject: 'Invoice',
      from: 'billing@vendor.com',
      ocrJobId: 'job-1',
    });

    expect(store.has('<a@example.com>', 'invoice.pdf')).toBe(true);
    expect(store.list()).toHaveLength(1);
  });

  it('updates records from OCR webhook payload', async () => {
    await store.addQueued({
      messageId: '<a@example.com>',
      attachmentName: 'invoice.pdf',
      subject: 'Invoice',
      from: 'billing@vendor.com',
      ocrJobId: 'job-1',
    });

    const updated = await store.updateFromWebhook({
      ocrJobId: 'job-1',
      status: 'completed',
      result: {
        document_type: 'invoice',
        summary: 'March invoice',
        fields: [],
        tables: [],
      },
      error: null,
      processingTimeMs: 1200,
    });

    expect(updated?.status).toBe('completed');
    expect(updated?.result?.document_type).toBe('invoice');

    const raw = await readFile(storePath, 'utf8');
    expect(raw).toContain('job-1');
    expect(raw).toContain('invoice');
  });
});
