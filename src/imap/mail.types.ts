export type MailAttachment = {
  filename: string;
  contentType: string;
  content: Buffer;
};

export type ParsedMailMessage = {
  uid: number;
  messageId: string;
  subject: string;
  from: string;
  attachments: MailAttachment[];
};
