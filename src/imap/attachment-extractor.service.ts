import { Injectable } from '@nestjs/common';
import { simpleParser } from 'mailparser';
import type { MailAttachment, ParsedMailMessage } from './mail.types';

@Injectable()
export class AttachmentExtractorService {
  async parse(uid: number, source: Buffer): Promise<ParsedMailMessage> {
    const parsed = await simpleParser(source);

    const messageId =
      parsed.messageId?.trim() ||
      `uid-${uid}-${parsed.date?.getTime() ?? Date.now()}`;
    const subject = parsed.subject?.trim() || '(no subject)';
    const from = formatAddress(parsed.from);

    const attachments: MailAttachment[] = [];

    for (const attachment of parsed.attachments) {
      if (!attachment.content?.length) {
        continue;
      }

      attachments.push({
        filename: sanitizeFilename(
          attachment.filename || attachment.contentType || 'attachment',
        ),
        contentType: attachment.contentType || 'application/octet-stream',
        content: Buffer.from(attachment.content),
      });
    }

    return {
      uid,
      messageId,
      subject,
      from,
      attachments,
    };
  }
}

function formatAddress(
  value: { text?: string; value?: Array<{ address?: string; name?: string }> } | undefined,
): string {
  if (!value) {
    return '(unknown sender)';
  }

  if (value.text?.trim()) {
    return value.text.trim();
  }

  const first = value.value?.[0];
  if (!first) {
    return '(unknown sender)';
  }

  if (first.name && first.address) {
    return `${first.name} <${first.address}>`;
  }

  return first.address || first.name || '(unknown sender)';
}

function sanitizeFilename(name: string): string {
  return name.replace(/[/\\]/g, '_').trim() || 'attachment';
}
