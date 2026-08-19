import { ConfigService } from '@nestjs/config';
import { envBoolean, envNumber, requireEnv } from '../common/env';

export type MailConfig = {
  enabled: boolean;
  host: string;
  port: number;
  secure: boolean;
  user: string;
  password: string;
  notifyTo: string;
  connectionTimeoutMs: number;
};

export function loadMailConfig(config: ConfigService): MailConfig {
  const user = requireEnv(config, 'IMAP_USER');
  const password = requireEnv(config, 'IMAP_PASSWORD');

  return {
    enabled: envBoolean(config, 'INGEST_NOTIFY_ENABLED', true),
    host: config.get<string>('SMTP_HOST') || 'smtp.gmail.com',
    port: envNumber(config, 'SMTP_PORT', 465),
    secure: envBoolean(config, 'SMTP_SECURE', true),
    user,
    password,
    notifyTo: config.get<string>('INGEST_NOTIFY_EMAIL') || user,
    connectionTimeoutMs: envNumber(config, 'SMTP_CONNECTION_TIMEOUT_MS', 15_000),
  };
}
