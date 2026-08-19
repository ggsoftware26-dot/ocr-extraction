import { ConfigService } from '@nestjs/config';
import { loadImapConfig } from './imap.config';
import { ImapService } from './imap.service';

describe('ImapService enable flag', () => {
  it('does not start polling when IMAP_ENABLED=false', () => {
    const config = {
      get: (key: string) => {
        if (key === 'IMAP_ENABLED') return 'false';
        if (key === 'IMAP_PROCESSED_STORE_PATH') return './data/test.json';
        return undefined;
      },
    } as ConfigService;

    const service = new ImapService(
      config,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );

    service.start();
    expect(loadImapConfig(config).enabled).toBe(false);
  });
});

describe('loadImapConfig', () => {
  it('does not require IMAP credentials when disabled', () => {
    const config = {
      get: (key: string) => {
        if (key === 'IMAP_ENABLED') return 'false';
        return undefined;
      },
    } as ConfigService;

    const loaded = loadImapConfig(config);
    expect(loaded.enabled).toBe(false);
    expect(loaded.host).toBe('');
  });

  it('requires IMAP credentials when enabled', () => {
    const config = {
      get: (key: string) => {
        const values: Record<string, string> = {
          IMAP_ENABLED: 'true',
          IMAP_HOST: 'imap.example.com',
          IMAP_USER: 'user@example.com',
          IMAP_PASSWORD: 'secret',
          OCR_API_KEY: 'test-key',
        };
        return values[key];
      },
    } as ConfigService;

    expect(loadImapConfig(config).enabled).toBe(true);
  });
});
