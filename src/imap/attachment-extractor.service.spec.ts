import { AttachmentExtractorService } from './attachment-extractor.service';

describe('AttachmentExtractorService', () => {
  const extractor = new AttachmentExtractorService();

  it('extracts pdf attachment from multipart message', async () => {
    const source = Buffer.from(
      [
        'From: billing@vendor.com',
        'To: user@example.com',
        'Subject: Invoice for March',
        'Message-ID: <invoice-123@example.com>',
        'MIME-Version: 1.0',
        'Content-Type: multipart/mixed; boundary="boundary42"',
        '',
        '--boundary42',
        'Content-Type: text/plain',
        '',
        'Please find your invoice attached.',
        '--boundary42',
        'Content-Type: application/pdf; name="invoice.pdf"',
        'Content-Disposition: attachment; filename="invoice.pdf"',
        'Content-Transfer-Encoding: base64',
        '',
        Buffer.from('%PDF-1.4').toString('base64'),
        '--boundary42--',
        '',
      ].join('\r\n'),
      'utf8',
    );

    const parsed = await extractor.parse(42, source);

    expect(parsed.messageId).toBe('<invoice-123@example.com>');
    expect(parsed.subject).toBe('Invoice for March');
    expect(parsed.from).toContain('billing@vendor.com');
    expect(parsed.attachments).toHaveLength(1);
    expect(parsed.attachments[0].filename).toBe('invoice.pdf');
    expect(parsed.attachments[0].content.subarray(0, 4).toString()).toBe('%PDF');
  });
});
