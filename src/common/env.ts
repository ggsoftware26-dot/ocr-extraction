import { ConfigService } from '@nestjs/config';

export function requireEnv(config: ConfigService, key: string): string {
  const value = config.get<string>(key);
  if (value === undefined || value === '') {
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return value;
}

export function envNumber(
  config: ConfigService,
  key: string,
  fallback: number,
): number {
  const raw = config.get<string>(key);
  if (raw === undefined || raw === '') {
    return fallback;
  }
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function envBoolean(
  config: ConfigService,
  key: string,
  fallback: boolean,
): boolean {
  const raw = config.get<string>(key);
  if (raw === undefined || raw === '') {
    return fallback;
  }
  return raw === 'true' || raw === '1';
}
