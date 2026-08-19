import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { loadImapConfig } from '../imap/imap.config';

export type OcrJobView = {
  job_id: string;
  status: string;
  result: unknown;
  processing_time_ms: number | null;
  error: string | null;
};

@Injectable()
export class OcrClientService {
  private readonly apiUrl: string;
  private readonly apiKey: string;

  constructor(config: ConfigService) {
    const imapConfig = loadImapConfig(config);
    this.apiUrl = imapConfig.ocrApiUrl.replace(/\/$/, '');
    this.apiKey = imapConfig.ocrApiKey;
  }

  async submitJob(input: {
    filename: string;
    mimeType: string;
    content: Buffer;
    webhookUrl: string;
  }): Promise<OcrJobView> {
    const form = new FormData();
    const blob = new Blob([Uint8Array.from(input.content)], {
      type: input.mimeType,
    });
    form.append('file', blob, input.filename);
    form.append('webhook_url', input.webhookUrl);

    const response = await fetch(`${this.apiUrl}/v1/jobs`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: form,
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(
        `OCR API responded ${response.status}: ${body.slice(0, 500)}`,
      );
    }

    return (await response.json()) as OcrJobView;
  }
}
