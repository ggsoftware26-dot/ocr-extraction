import { Module } from '@nestjs/common';
import { OCR_PROVIDER, TEXT_PROVIDER } from './ocr-provider';
import { GeminiProvider } from './gemini.provider';

@Module({
  providers: [
    GeminiProvider,
    {
      provide: OCR_PROVIDER,
      useExisting: GeminiProvider,
    },
    {
      provide: TEXT_PROVIDER,
      useExisting: GeminiProvider,
    },
  ],
  exports: [OCR_PROVIDER, TEXT_PROVIDER, GeminiProvider],
})
export class ProvidersModule {}
