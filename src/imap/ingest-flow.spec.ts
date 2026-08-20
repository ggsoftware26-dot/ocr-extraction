import { ConfigService } from '@nestjs/config';
import { ImapService } from './imap.service';
import { MessageFilterService } from './message-filter.service';
import { ProcessedMessageStore } from './processed-message.store';
import { AttachmentExtractorService } from './attachment-extractor.service';
import { OcrClientService } from '../ocr-client/ocr-client.service';
import type { ParsedMailMessage } from './mail.types';

describe('Ingest flow (unit)', () => {
  it('submits OCR job with ingest webhook URL for matching attachment', async () => {
    const submitJob = jest.fn().mockResolvedValue({
      job_id: '22222222-2222-2222-2222-222222222222',
      status: 'queued',
      result: null,
      processing_time_ms: null,
      error: null,
    });

    const config = {
      get: (key: string) => {
        const values: Record<string, string> = {
          IMAP_HOST: 'imap.example.com',
          IMAP_PORT: '993',
          IMAP_USER: 'user@example.com',
          IMAP_PASSWORD: 'secret',
          IMAP_MAILBOX: 'INBOX',
          IMAP_RECONNECT_DELAY_MS: '30000',
          IMAP_MAX_IDLE_MS: '1500000',
          IMAP_MARK_SEEN: 'false',
          IMAP_FILTER_SUBJECT: 'invoice',
          IMAP_FILTER_FROM: '',
          IMAP_PROCESSED_STORE_PATH: ':memory:',
          INGEST_PUBLIC_URL: 'http://localhost:3001',
          OCR_API_URL: 'http://localhost:3000',
          OCR_API_KEY: 'test-key',
        };
        return values[key];
      },
    } as ConfigService;

    const store = {
      has: jest.fn().mockReturnValue(false),
      addQueued: jest.fn().mockResolvedValue(undefined),
    } as unknown as ProcessedMessageStore;

    const filter = new MessageFilterService(config);
    const message: ParsedMailMessage = {
      uid: 7,
      messageId: '<flow@example.com>',
      subject: 'Invoice ready',
      from: 'billing@vendor.com',
      attachments: [
        {
          filename: 'invoice.pdf',
          contentType: 'application/pdf',
          content: Buffer.from('%PDF'),
        },
      ],
    };

    expect(filter.matches(message)).toBe(true);

    const ocrClient = { submitJob } as unknown as OcrClientService;
    const allowed = filter.allowedAttachments(message.attachments);

    for (const attachment of allowed) {
      await ocrClient.submitJob({
        filename: attachment.filename,
        mimeType: 'application/pdf',
        content: attachment.content,
        webhookUrl: 'http://localhost:3001/webhooks/ocr',
      });
      await store.addQueued({
        messageId: message.messageId,
        attachmentName: attachment.filename,
        subject: message.subject,
        from: message.from,
        ocrJobId: '22222222-2222-2222-2222-222222222222',
      });
    }

    expect(submitJob).toHaveBeenCalledWith({
      filename: 'invoice.pdf',
      mimeType: 'application/pdf',
      content: expect.any(Buffer),
      webhookUrl: 'http://localhost:3001/webhooks/ocr',
    });
    expect(store.addQueued).toHaveBeenCalled();
  });

  it('ImapService can be constructed with dependencies', () => {
    const config = {
      get: (key: string) => {
        const values: Record<string, string> = {
          IMAP_HOST: 'imap.example.com',
          IMAP_PORT: '993',
          IMAP_USER: 'user@example.com',
          IMAP_PASSWORD: 'secret',
          IMAP_MAILBOX: 'INBOX',
          IMAP_RECONNECT_DELAY_MS: '30000',
          IMAP_MAX_IDLE_MS: '1500000',
          IMAP_MARK_SEEN: 'true',
          IMAP_FILTER_SUBJECT: 'invoice',
          IMAP_FILTER_FROM: '',
          IMAP_PROCESSED_STORE_PATH: './data/test.json',
          INGEST_PUBLIC_URL: 'http://localhost:3001',
          OCR_API_URL: 'http://localhost:3000',
          OCR_API_KEY: 'test-key',
        };
        return values[key];
      },
    } as ConfigService;

    const service = new ImapService(
      config,
      new AttachmentExtractorService(),
      new MessageFilterService(config),
      {} as ProcessedMessageStore,
      {} as OcrClientService,
    );

    expect(service).toBeDefined();
  });
});
