import { ConfigService } from '@nestjs/config';
import { loadImapConfig } from './imap.config';
import { ImapService } from './imap.service';

describe('ImapService enable flag', () => {
  it('does not start IDLE when IMAP_ENABLED=false', () => {
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

  it('strips spaces from Google-style app passwords', () => {
    const config = {
      get: (key: string) => {
        const values: Record<string, string> = {
          IMAP_ENABLED: 'true',
          IMAP_HOST: 'imap.example.com',
          IMAP_USER: 'user@example.com',
          IMAP_PASSWORD: 'abcd efgh ijkl mnop',
          OCR_API_KEY: 'test-key',
        };
        return values[key];
      },
    } as ConfigService;

    expect(loadImapConfig(config).password).toBe('abcdefghijklmnop');
  });

  it('defaults sinceDays to 7', () => {
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

    expect(loadImapConfig(config).sinceDays).toBe(7);
  });

  it('honors IMAP_SINCE_DAYS=0 as no date filter', () => {
    const config = {
      get: (key: string) => {
        const values: Record<string, string> = {
          IMAP_ENABLED: 'true',
          IMAP_HOST: 'imap.example.com',
          IMAP_USER: 'user@example.com',
          IMAP_PASSWORD: 'secret',
          OCR_API_KEY: 'test-key',
          IMAP_SINCE_DAYS: '0',
        };
        return values[key];
      },
    } as ConfigService;

    expect(loadImapConfig(config).sinceDays).toBe(0);
  });
});
