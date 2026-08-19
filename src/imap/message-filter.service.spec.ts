import { ConfigService } from '@nestjs/config';
import { MessageFilterService } from './message-filter.service';
import type { ParsedMailMessage } from './mail.types';

function createFilter(
  subject = 'invoice,receipt',
  from: string | null = null,
): MessageFilterService {
  const config = {
    get: (key: string) => {
      if (key === 'IMAP_FILTER_SUBJECT') return subject;
      if (key === 'IMAP_FILTER_FROM') return from ?? '';
      if (key === 'IMAP_HOST') return 'imap.example.com';
      if (key === 'IMAP_USER') return 'user@example.com';
      if (key === 'IMAP_PASSWORD') return 'secret';
      if (key === 'OCR_API_KEY') return 'test-key';
      return undefined;
    },
  } as ConfigService;

  return new MessageFilterService(config);
}

function baseMessage(overrides: Partial<ParsedMailMessage> = {}): ParsedMailMessage {
  return {
    uid: 1,
    messageId: '<test@example.com>',
    subject: 'Your invoice #123',
    from: 'billing@vendor.com',
    attachments: [
      {
        filename: 'invoice.pdf',
        contentType: 'application/pdf',
        content: Buffer.from('%PDF'),
      },
    ],
    ...overrides,
  };
}

describe('MessageFilterService', () => {
  it('matches invoice subject with pdf attachment', () => {
    const filter = createFilter();
    expect(filter.matches(baseMessage())).toBe(true);
  });

  it('rejects when subject keywords do not match', () => {
    const filter = createFilter();
    expect(filter.matches(baseMessage({ subject: 'Meeting notes' }))).toBe(false);
  });

  it('rejects when from filter does not match', () => {
    const filter = createFilter('invoice', 'acme.com');
    expect(filter.matches(baseMessage({ from: 'other@vendor.com' }))).toBe(false);
  });

  it('accepts png attachments by extension', () => {
    const filter = createFilter();
    expect(
      filter.matches(
        baseMessage({
          attachments: [
            {
              filename: 'scan.png',
              contentType: 'application/octet-stream',
              content: Buffer.from('png'),
            },
          ],
        }),
      ),
    ).toBe(true);
  });

  it('rejects unsupported attachment types', () => {
    const filter = createFilter();
    expect(
      filter.matches(
        baseMessage({
          attachments: [
            {
              filename: 'notes.txt',
              contentType: 'text/plain',
              content: Buffer.from('hello'),
            },
          ],
        }),
      ),
    ).toBe(false);
  });

  it('allows any subject when filter list is empty', () => {
    const filter = createFilter('');
    expect(filter.matches(baseMessage({ subject: 'Random subject' }))).toBe(true);
  });
});
