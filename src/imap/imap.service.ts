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

@Injectable()
export class ImapService implements OnApplicationShutdown {
  private readonly logger = new Logger(ImapService.name);
  private readonly config: ImapConfig;
  private running = false;
  private pollTimer: NodeJS.Timeout | null = null;

  constructor(
    config: ConfigService,
    private readonly extractor: AttachmentExtractorService,
    private readonly filter: MessageFilterService,
    private readonly store: ProcessedMessageStore,
    private readonly ocrClient: OcrClientService,
  ) {
    this.config = loadImapConfig(config);
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
      `Starting IMAP poll loop every ${this.config.pollIntervalMs}ms on ${this.config.host}`,
    );
    void this.pollOnce();
    this.pollTimer = setInterval(() => {
      void this.pollOnce();
    }, this.config.pollIntervalMs);
  }

  stop(): void {
    this.running = false;
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
  }

  onApplicationShutdown(): void {
    this.stop();
  }

  async pollOnce(): Promise<void> {
    if (!this.running) {
      return;
    }

    const client = new ImapFlow({
      host: this.config.host,
      port: this.config.port,
      secure: this.config.port === 993,
      auth: {
        user: this.config.user,
        pass: this.config.password,
      },
      logger: false,
    });

    try {
      await client.connect();
      const lock = await client.getMailboxLock(this.config.mailbox);
      try {
        const uids = await client.search({ seen: false }, { uid: true });
        if (!uids || uids.length === 0) {
          this.logger.debug('No unseen messages');
          return;
        }

        this.logger.log(`Found ${uids.length} unseen message(s)`);

        for (const uid of uids) {
          await this.processMessage(client, uid);
        }
      } finally {
        lock.release();
      }
    } catch (error) {
      this.logger.error(
        `IMAP poll failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    } finally {
      await client.logout().catch(() => undefined);
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
