import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { INestApplication } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { ProcessedMessageStore } from '../src/imap/processed-message.store';
import { WebhooksController } from '../src/webhooks/webhooks.controller';
import { WebhooksService } from '../src/webhooks/webhooks.service';

describe('Ingest webhook (e2e)', () => {
  let app: INestApplication<App>;
  let dir: string;
  let store: ProcessedMessageStore;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'ingest-e2e-'));
    const storePath = join(dir, 'processed.json');

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [ConfigModule.forRoot({ isGlobal: true })],
      controllers: [WebhooksController],
      providers: [WebhooksService, ProcessedMessageStore],
    })
      .overrideProvider(ProcessedMessageStore)
      .useFactory({
        factory: () => {
          const config = {
            get: (key: string) => {
              if (key === 'IMAP_PROCESSED_STORE_PATH') return storePath;
              if (key === 'IMAP_HOST') return 'imap.example.com';
              if (key === 'IMAP_USER') return 'user@example.com';
              if (key === 'IMAP_PASSWORD') return 'secret';
              if (key === 'OCR_API_KEY') return 'test-key';
              return undefined;
            },
          };
          return new ProcessedMessageStore(config as never);
        },
      })
      .compile();

    app = moduleFixture.createNestApplication();
    store = moduleFixture.get(ProcessedMessageStore);
    await store.onModuleInit();
    await app.init();
  });

  afterEach(async () => {
    await app.close();
    await rm(dir, { recursive: true, force: true });
  });

  it('GET /health', () => {
    return request(app.getHttpServer())
      .get('/health')
      .expect(200)
      .expect({ status: 'ok', service: 'ingest' });
  });

  it('POST /webhooks/ocr updates stored record', async () => {
    await store.addQueued({
      messageId: '<invoice@example.com>',
      attachmentName: 'invoice.pdf',
      subject: 'Invoice March',
      from: 'billing@vendor.com',
      ocrJobId: '11111111-1111-1111-1111-111111111111',
    });

    await request(app.getHttpServer())
      .post('/webhooks/ocr')
      .send({
        job_id: '11111111-1111-1111-1111-111111111111',
        status: 'completed',
        processing_time_ms: 900,
        error: null,
        result: {
          document_type: 'invoice',
          summary: 'March invoice',
          fields: [],
          tables: [],
        },
      })
      .expect(201);

    const records = store.list();
    expect(records).toHaveLength(1);
    expect(records[0].status).toBe('completed');
    expect(records[0].result?.document_type).toBe('invoice');
  });
});
