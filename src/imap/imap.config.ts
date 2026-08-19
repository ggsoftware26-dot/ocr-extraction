import { ConfigService } from '@nestjs/config';
import { envBoolean, envNumber, requireEnv } from '../common/env';

export type ImapConfig = {
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
  const filterSubjectRaw = config.get<string>('IMAP_FILTER_SUBJECT') ?? '';
  const filterFromRaw = config.get<string>('IMAP_FILTER_FROM') ?? '';

  return {
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
    processedStorePath:
      config.get<string>('IMAP_PROCESSED_STORE_PATH') ||
      './data/imap-processed.json',
    ingestPublicUrl:
      config.get<string>('INGEST_PUBLIC_URL') || 'http://localhost:3001',
    ocrApiUrl: config.get<string>('OCR_API_URL') || 'http://localhost:3000',
    ocrApiKey: requireEnv(config, 'OCR_API_KEY'),
  };
}
