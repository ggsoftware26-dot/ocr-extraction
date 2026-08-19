import { ConfigService } from '@nestjs/config';
import { envBoolean, envNumber, requireEnv } from '../common/env';

export type ImapConfig = {
  enabled: boolean;
  host: string;
  port: number;
  user: string;
  password: string;
  mailbox: string;
  pollIntervalMs: number;
  markSeen: boolean;
  filterSubject: string[];
  filterFrom: string | null;
  processedStorePath: string;
  ingestPublicUrl: string;
  ocrApiUrl: string;
  ocrApiKey: string;
};

export function loadImapConfig(config: ConfigService): ImapConfig {
  const enabled = envBoolean(config, 'IMAP_ENABLED', true);
  const filterSubjectRaw = config.get<string>('IMAP_FILTER_SUBJECT') ?? '';
  const filterFromRaw = config.get<string>('IMAP_FILTER_FROM') ?? '';
  const shared = {
    enabled,
    processedStorePath:
      config.get<string>('IMAP_PROCESSED_STORE_PATH') ||
      './data/imap-processed.json',
    ingestPublicUrl:
      config.get<string>('INGEST_PUBLIC_URL') || 'http://localhost:3001',
    ocrApiUrl: config.get<string>('OCR_API_URL') || 'http://localhost:3000',
  };

  if (!enabled) {
    return {
      ...shared,
      host: '',
      port: envNumber(config, 'IMAP_PORT', 993),
      user: '',
      password: '',
      mailbox: config.get<string>('IMAP_MAILBOX') || 'INBOX',
      pollIntervalMs: envNumber(config, 'IMAP_POLL_INTERVAL_MS', 60_000),
      markSeen: envBoolean(config, 'IMAP_MARK_SEEN', true),
      filterSubject: [],
      filterFrom: null,
      ocrApiKey: config.get<string>('OCR_API_KEY') || '',
    };
  }

  return {
    ...shared,
    host: requireEnv(config, 'IMAP_HOST'),
    port: envNumber(config, 'IMAP_PORT', 993),
    user: requireEnv(config, 'IMAP_USER'),
    password: requireEnv(config, 'IMAP_PASSWORD'),
    mailbox: config.get<string>('IMAP_MAILBOX') || 'INBOX',
    pollIntervalMs: envNumber(config, 'IMAP_POLL_INTERVAL_MS', 60_000),
    markSeen: envBoolean(config, 'IMAP_MARK_SEEN', true),
    filterSubject: filterSubjectRaw
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean),
    filterFrom: filterFromRaw.trim() || null,
    ocrApiKey: requireEnv(config, 'OCR_API_KEY'),
  };
}
