import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GeminiProvider } from './gemini.provider';
import type { OcrProvider } from './ocr-provider';
import {
  parseOcrProviderId,
  type OcrProviderId,
} from './provider-id';
import { QwenProvider } from './qwen.provider';

@Injectable()
export class OcrProviderRegistry {
  private readonly defaultId: OcrProviderId;

  constructor(
    private readonly gemini: GeminiProvider,
    private readonly qwen: QwenProvider,
    config: ConfigService,
  ) {
    this.defaultId = parseOcrProviderId(
      config.get<string>('OCR_PROVIDER'),
      'gemini',
    );
  }

  resolve(providerId?: string | null): {
    id: OcrProviderId;
    provider: OcrProvider;
  } {
    const id = parseOcrProviderId(providerId, this.defaultId);
    return {
      id,
      provider: id === 'qwen' ? this.qwen : this.gemini,
    };
  }

  defaultProviderId(): OcrProviderId {
    return this.defaultId;
  }
}
