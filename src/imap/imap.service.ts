import { Injectable, Logger, OnApplicationShutdown } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ImapFlow } from 'imapflow';
import { loadImapConfig, type ImapConfig } from './imap.config';
import { AttachmentExtractorService } from './attachment-extractor.service';
import {
  MessageFilterService,
  resolveAttachmentMimeType,
} from './message-filter.service';
import { ProcessedMessageStore } from './processed-message.store';
import { OcrClientService } from '../ocr-client/ocr-client.service';

const MAX_BACKOFF_MS = 60 * 60_000; // 1 hour
const OVERQUOTA_BACKOFF_MS = 60 * 60_000; // 1 hour

@Injectable()
export class ImapService implements OnApplicationShutdown {
  private readonly logger = new Logger(ImapService.name);
  private readonly config: ImapConfig;
  private running = false;
  private loopPromise: Promise<void> | null = null;
  private client: ImapFlow | null = null;
  private reconnectDelayMs: number;
  /** Highest UID already examined this process lifetime (skips + queued). */
  private lastUid = 0;

  constructor(
    config: ConfigService,
    private readonly extractor: AttachmentExtractorService,
    private readonly filter: MessageFilterService,
    private readonly store: ProcessedMessageStore,
    private readonly ocrClient: OcrClientService,
  ) {
    this.config = loadImapConfig(config);
    this.reconnectDelayMs = this.config.reconnectDelayMs;
  }

  start(): void {
    if (!this.config.enabled) {
      this.logger.log('IMAP ingestion disabled (IMAP_ENABLED=false)');
      return;
    }
    if (this.running) {
      return;
    }
    this.running = true;
    this.logger.log(
      `Starting IMAP IDLE on ${this.config.host} mailbox=${this.config.mailbox} (maxIdle=${this.config.maxIdleMs}ms, sinceDays=${this.config.sinceDays})`,
    );
    this.loopPromise = this.runLoop();
  }

  stop(): void {
    this.running = false;
    this.closeClient();
  }

  onApplicationShutdown(): void {
    this.stop();
  }

  private async runLoop(): Promise<void> {
    while (this.running) {
      try {
        await this.runSession();
        this.reconnectDelayMs = this.config.reconnectDelayMs;
      } catch (error) {
        const detail = formatImapError(error);
        this.logger.error(`IMAP session ended: ${detail}`);
        if (isOverQuota(error, detail)) {
          this.reconnectDelayMs = OVERQUOTA_BACKOFF_MS;
          this.logger.warn(
            `Gmail OVERQUOTA detected — backing off ${this.reconnectDelayMs}ms before reconnect`,
          );
        } else {
          this.reconnectDelayMs = Math.min(
            this.reconnectDelayMs * 2,
            MAX_BACKOFF_MS,
          );
        }
      } finally {
        this.closeClient();
      }

      if (!this.running) {
        break;
      }

      this.logger.log(`IMAP reconnecting in ${this.reconnectDelayMs}ms`);
      await sleep(this.reconnectDelayMs);
    }
  }

  private async runSession(): Promise<void> {
    let lastErrorDetail = '';
    const client = new ImapFlow({
      host: this.config.host,
      port: this.config.port,
      secure: this.config.port === 993,
      auth: {
        user: this.config.user,
        pass: this.config.password,
      },
      logger: false,
      // Keep IDLE refresh short; we also race a JS timer because idle() may
      // not resolve on Gmail EXISTS / maxIdleTime in practice.
      maxIdleTime: this.config.maxIdleMs,
      connectionTimeout: 30_000,
      greetingTimeout: 30_000,
    });
    this.client = client;

    client.on('error', (error: Error) => {
      lastErrorDetail = formatImapError(error);
      this.logger.warn(`IMAP connection error: ${lastErrorDetail}`);
    });

    try {
      await client.connect();
      this.logger.log(
        `IMAP connected (lastUid=${this.lastUid}); draining unseen, then IDLE`,
      );

      await this.drainUnseen(client);

      while (this.running && client.usable) {
        this.logger.log(
          `IMAP waiting for mail (IDLE + ${this.config.maxIdleMs}ms timer, lastUid=${this.lastUid})`,
        );
        try {
          await this.waitForExistsOrTimeout(client);
        } catch (error) {
          if (!this.running) {
            return;
          }
          throw enrichImapError(error, lastErrorDetail);
        }

        if (!this.running || !client.usable) {
          break;
        }

        this.logger.log('IMAP wake; checking for new mail');
        await this.drainUnseen(client);
      }
    } catch (error) {
      throw enrichImapError(error, lastErrorDetail);
    }
  }

  /**
   * Wait until Gmail pushes EXISTS or the catch-up timer fires.
   * Do not rely on `idle()` resolving — with Gmail it often stays pending
   * even after EXISTS (we saw EXISTS logged without idle() returning).
   */
  private waitForExistsOrTimeout(client: ImapFlow): Promise<void> {
    return new Promise((resolve, reject) => {
      let settled = false;

      const finish = (reason: string) => {
        if (settled) {
          return;
        }
        settled = true;
        clearTimeout(timer);
        client.off('exists', onExists);
        this.logger.debug(`IMAP wait finished: ${reason}`);
        resolve();
      };

      const onExists = (data: { path?: string; count?: number }) => {
        this.logger.log(
          `IMAP EXISTS notify: ${data.path ?? this.config.mailbox} now has ${data.count ?? '?'} message(s)`,
        );
        finish('exists');
      };

      const timer = setTimeout(
        () => finish('timer'),
        this.config.maxIdleMs,
      );

      client.on('exists', onExists);

      // Run IDLE so Gmail will push EXISTS; ignore its settle timing.
      void client
        .idle()
        .then(() => finish('idle-ended'))
        .catch((error: unknown) => {
          if (!this.running) {
            finish('stopped');
            return;
          }
          if (!settled) {
            settled = true;
            clearTimeout(timer);
            client.off('exists', onExists);
            reject(error instanceof Error ? error : new Error(String(error)));
          }
        });
    });
  }

  /** Process unseen until a pass finds nothing new above lastUid. */
  private async drainUnseen(client: ImapFlow): Promise<void> {
    for (let pass = 0; pass < 20 && this.running && client.usable; pass++) {
      const examined = await this.processUnseen(client);
      if (examined === 0) {
        return;
      }
    }
  }

  /** @returns number of UIDs examined this pass */
  private async processUnseen(client: ImapFlow): Promise<number> {
    const lock = await client.getMailboxLock(this.config.mailbox);
    try {
      let allUids: number[];

      if (this.lastUid > 0) {
        // After first drain: UID range (not only UNSEEN). Gmail EXISTS + UNSEEN
        // search alone is unreliable for catch-up.
        const rawUids = await client.search(
          { uid: `${this.lastUid + 1}:*` },
          { uid: true },
        );
        allUids = Array.isArray(rawUids) ? rawUids : [];
      } else {
        const query: { seen: false; since?: Date } = { seen: false };
        if (this.config.sinceDays > 0) {
          const since = new Date();
          since.setHours(0, 0, 0, 0);
          since.setDate(since.getDate() - this.config.sinceDays);
          query.since = since;
        }
        const rawUids = await client.search(query, { uid: true });
        allUids = Array.isArray(rawUids) ? rawUids : [];
      }

      const uids = allUids.filter((uid) => uid > this.lastUid);

      if (uids.length === 0) {
        this.logger.debug(
          this.lastUid > 0
            ? `No new messages above UID ${this.lastUid}`
            : this.config.sinceDays > 0
              ? `No unseen messages in the last ${this.config.sinceDays} day(s)`
              : 'No unseen messages',
        );
        return 0;
      }

      this.logger.log(
        `Found ${uids.length} new message(s) above UID ${this.lastUid}`,
      );

      for (const uid of uids) {
        if (!this.running || !client.usable) {
          break;
        }
        await this.processMessage(client, uid);
        // Advance even on filter skips so later passes only see newer mail.
        this.lastUid = Math.max(this.lastUid, uid);
      }

      return uids.length;
    } finally {
      lock.release();
    }
  }

  private closeClient(): void {
    const client = this.client;
    this.client = null;
    if (!client) {
      return;
    }
    try {
      if (client.usable) {
        void client.logout().catch(() => {
          try {
            client.close();
          } catch {
            // ignore
          }
        });
      } else {
        client.close();
      }
    } catch {
      // ignore
    }
  }

  private async processMessage(client: ImapFlow, uid: number): Promise<void> {
    const fetched = await client.fetchOne(
      uid,
      { source: true, envelope: true },
      { uid: true },
    );

    if (!fetched || !fetched.source) {
      this.logger.warn(`Message UID ${uid} has no source; skipping`);
      return;
    }

    const message = await this.extractor.parse(uid, Buffer.from(fetched.source));

    if (!this.filter.matches(message)) {
      this.logger.debug(
        `Skipping UID ${uid} (${message.subject}) — filter mismatch`,
      );
      return;
    }

    const attachments = this.filter.allowedAttachments(message.attachments);
    if (!attachments.length) {
      return;
    }

    let processedAny = false;

    for (const attachment of attachments) {
      if (this.store.has(message.messageId, attachment.filename)) {
        this.logger.debug(
          `Already processed ${message.messageId} / ${attachment.filename}`,
        );
        continue;
      }

      const mimeType = resolveAttachmentMimeType(attachment);
      const webhookUrl = `${this.config.ingestPublicUrl.replace(/\/$/, '')}/webhooks/ocr`;

      try {
        const job = await this.ocrClient.submitJob({
          filename: attachment.filename,
          mimeType,
          content: attachment.content,
          webhookUrl,
        });

        await this.store.addQueued({
          messageId: message.messageId,
          attachmentName: attachment.filename,
          subject: message.subject,
          from: message.from,
          ocrJobId: job.job_id,
        });

        this.logger.log(
          `Queued OCR job ${job.job_id} for "${attachment.filename}" from "${message.subject}"`,
        );
        processedAny = true;
      } catch (error) {
        this.logger.error(
          `Failed to submit OCR job for UID ${uid} / ${attachment.filename}: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
    }

    if (processedAny && this.config.markSeen) {
      await client.messageFlagsAdd(uid, ['\\Seen'], { uid: true });
      this.logger.debug(`Marked UID ${uid} as seen`);
    }
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function formatImapError(error: unknown): string {
  if (!(error instanceof Error)) {
    return String(error);
  }
  const parts = [error.message];
  const withExtras = error as Error & {
    code?: unknown;
    responseText?: unknown;
    responseStatus?: unknown;
    reason?: unknown;
  };
  if (withExtras.code) {
    parts.push(`(${String(withExtras.code)})`);
  }
  if (withExtras.reason) {
    parts.push(String(withExtras.reason));
  }
  if (withExtras.responseText) {
    parts.push(String(withExtras.responseText));
  }
  // ImapFlow sometimes attaches BYE reason on nested err
  const nested = (error as { err?: { reason?: string } }).err;
  if (nested?.reason) {
    parts.push(nested.reason);
  }
  return parts.join(' ');
}

function enrichImapError(error: unknown, extraDetail: string): Error {
  const base = formatImapError(error);
  if (
    extraDetail &&
    !base.includes(extraDetail) &&
    /OVERQUOTA|bandwidth limits/i.test(extraDetail)
  ) {
    return new Error(`${base} — ${extraDetail}`);
  }
  if (error instanceof Error) {
    return error;
  }
  return new Error(base);
}

function isOverQuota(error: unknown, detail: string): boolean {
  const blob = `${detail} ${formatImapError(error)}`;
  if (/OVERQUOTA|bandwidth limits/i.test(blob)) {
    return true;
  }
  if (error && typeof error === 'object') {
    const nested = (error as { err?: { reason?: string } }).err?.reason;
    if (nested && /OVERQUOTA|bandwidth limits/i.test(nested)) {
      return true;
    }
  }
  return false;
}
