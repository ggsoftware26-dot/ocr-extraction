import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import nodemailer from 'nodemailer';
import type { ExtractionResult } from '../extraction/schema';
import type { ProcessedRecord } from '../imap/processed-message.store';
import { loadMailConfig } from './mail.config';

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private readonly config: ReturnType<typeof loadMailConfig>;
  private transporter: nodemailer.Transporter | null = null;

  constructor(private readonly configService: ConfigService) {
    this.config = loadMailConfig(configService);
  }

  async sendOcrResult(input: {
    record: ProcessedRecord;
    result: ExtractionResult;
    processingTimeMs: number | null;
  }): Promise<void> {
    if (!this.config.enabled) {
      this.logger.debug('Email notifications disabled (INGEST_NOTIFY_ENABLED=false)');
      return;
    }

    const { record, result, processingTimeMs } = input;
    const payload = {
      job_id: record.ocrJobId,
      status: 'completed',
      processing_time_ms: processingTimeMs,
      source: {
        message_id: record.messageId,
        subject: record.subject,
        from: record.from,
        attachment: record.attachmentName,
      },
      result,
    };

    const json = JSON.stringify(payload, null, 2);

    this.logger.log(
      `Sending OCR result email for job ${record.ocrJobId} to ${this.config.notifyTo} via ${this.config.host}:${this.config.port}`,
    );

    await this.getTransporter().sendMail({
      from: this.config.user,
      to: this.config.notifyTo,
      subject: `OCR result: ${record.attachmentName} (${result.document_type})`,
      text: [
        'OCR extraction completed.',
        '',
        `From: ${record.from}`,
        `Subject: ${record.subject}`,
        `Attachment: ${record.attachmentName}`,
        `Document type: ${result.document_type}`,
        `Summary: ${result.summary}`,
        processingTimeMs !== null ? `Processing time: ${processingTimeMs}ms` : '',
        '',
        'Full result (JSON):',
        json,
      ]
        .filter(Boolean)
        .join('\n'),
      attachments: [
        {
          filename: `${record.ocrJobId}.json`,
          content: json,
          contentType: 'application/json',
        },
      ],
    });

    this.logger.log(
      `Sent OCR result for job ${record.ocrJobId} to ${this.config.notifyTo}`,
    );
  }

  async sendOcrFailure(input: {
    record: ProcessedRecord;
    error: string;
    processingTimeMs: number | null;
  }): Promise<void> {
    if (!this.config.enabled) {
      return;
    }

    const { record, error, processingTimeMs } = input;

    await this.getTransporter().sendMail({
      from: this.config.user,
      to: this.config.notifyTo,
      subject: `OCR failed: ${record.attachmentName}`,
      text: [
        'OCR extraction failed.',
        '',
        `From: ${record.from}`,
        `Subject: ${record.subject}`,
        `Attachment: ${record.attachmentName}`,
        `Job ID: ${record.ocrJobId}`,
        processingTimeMs !== null ? `Processing time: ${processingTimeMs}ms` : '',
        '',
        `Error: ${error}`,
      ]
        .filter(Boolean)
        .join('\n'),
    });

    this.logger.log(
      `Sent OCR failure notice for job ${record.ocrJobId} to ${this.config.notifyTo}`,
    );
  }

  private getTransporter(): nodemailer.Transporter {
    if (!this.transporter) {
      this.transporter = nodemailer.createTransport({
        host: this.config.host,
        port: this.config.port,
        secure: this.config.secure,
        auth: {
          user: this.config.user,
          pass: this.config.password,
        },
        connectionTimeout: this.config.connectionTimeoutMs,
        greetingTimeout: this.config.connectionTimeoutMs,
        socketTimeout: this.config.connectionTimeoutMs,
        tls: {
          minVersion: 'TLSv1.2',
        },
      });
    }
    return this.transporter;
  }
}
