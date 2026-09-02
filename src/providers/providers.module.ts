import { Module } from '@nestjs/common';
import { GeminiProvider } from './gemini.provider';
import { OcrProviderRegistry } from './ocr-provider.registry';
import { QwenProvider } from './qwen.provider';

@Module({
  providers: [GeminiProvider, QwenProvider, OcrProviderRegistry],
  exports: [OcrProviderRegistry, GeminiProvider, QwenProvider],
})
export class ProvidersModule {}
