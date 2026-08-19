import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  ALLOWED_MIME_TYPES,
  MIME_BY_EXTENSION,
} from '../common/constants';
import { loadImapConfig } from './imap.config';
import type { MailAttachment, ParsedMailMessage } from './mail.types';

@Injectable()
export class MessageFilterService {
  private readonly filterSubject: string[];
  private readonly filterFrom: string | null;

  constructor(config: ConfigService) {
    const imapConfig = loadImapConfig(config);
    this.filterSubject = imapConfig.filterSubject;
    this.filterFrom = imapConfig.filterFrom;
  }

  matches(message: ParsedMailMessage): boolean {
    if (this.filterFrom && !message.from.toLowerCase().includes(this.filterFrom.toLowerCase())) {
      return false;
    }

    if (
      this.filterSubject.length > 0 &&
      !this.filterSubject.some((keyword) =>
        message.subject.toLowerCase().includes(keyword.toLowerCase()),
      )
    ) {
      return false;
    }

    return this.allowedAttachments(message.attachments).length > 0;
  }

  allowedAttachments(attachments: MailAttachment[]): MailAttachment[] {
    return attachments.filter((attachment) =>
      this.isAllowedAttachment(attachment),
    );
  }

  private isAllowedAttachment(attachment: MailAttachment): boolean {
    const mimeType = resolveAttachmentMimeType(attachment);
    return (ALLOWED_MIME_TYPES as readonly string[]).includes(mimeType);
  }
}

export function resolveAttachmentMimeType(attachment: MailAttachment): string {
  const reported = (attachment.contentType || '').split(';')[0].trim().toLowerCase();
  if ((ALLOWED_MIME_TYPES as readonly string[]).includes(reported)) {
    return reported === 'image/jpg' ? 'image/jpeg' : reported;
  }

  const ext = attachment.filename.split('.').pop()?.toLowerCase() ?? '';
  const fromExt = MIME_BY_EXTENSION[ext];
  if (fromExt) {
    return fromExt;
  }

  return reported;
}
