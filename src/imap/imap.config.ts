import { ConfigService } from '@nestjs/config';
import { envBoolean, envNumber, requireEnv } from '../common/env';

export type ImapConfig = {
  enabled: boolean;
  host: string;
  port: number;
  user: string;
  password: string;
  mailbox: string;
  /** Initial delay before reconnecting after a dropped session. */
  reconnectDelayMs: number;
  /** Max IDLE wait before refreshing (Gmail caps ~29m). */
  maxIdleMs: number;
  /**
   * Only process unseen mail with INTERNALDATE on/after this many days ago.
   * 0 = no date filter (all unseen).
   */
  sinceDays: number;
  markSeen: boolean;
  filterSubject: string[];
  filterFrom: string | null;
  processedStorePath: string;
  ingestPublicUrl: string;
  ocrApiUrl: string;
  ocrApiKey: string;
};

function normalizePassword(raw: string): string {
  // Google App Passwords are often copied with spaces: "xxxx xxxx xxxx xxxx"
  return raw.replace(/\s+/g, '');
}

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
    reconnectDelayMs: envNumber(config, 'IMAP_RECONNECT_DELAY_MS', 30_000),
    // Short IDLE refresh: Gmail often does not push EXISTS reliably.
    maxIdleMs: envNumber(config, 'IMAP_MAX_IDLE_MS', 60_000),
    sinceDays: envNumber(config, 'IMAP_SINCE_DAYS', 7),
  };

  if (!enabled) {
    return {
      ...shared,
      host: '',
      port: envNumber(config, 'IMAP_PORT', 993),
      user: '',
      password: '',
      mailbox: config.get<string>('IMAP_MAILBOX') || 'INBOX',
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
    password: normalizePassword(requireEnv(config, 'IMAP_PASSWORD')),
    mailbox: config.get<string>('IMAP_MAILBOX') || 'INBOX',
    markSeen: envBoolean(config, 'IMAP_MARK_SEEN', true),
    filterSubject: filterSubjectRaw
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean),
    filterFrom: filterFromRaw.trim() || null,
    ocrApiKey: requireEnv(config, 'OCR_API_KEY'),
  };
}
