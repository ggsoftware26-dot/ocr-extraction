import { Module } from '@nestjs/common';
import { OCR_PROVIDER } from './ocr-provider';
import { GeminiProvider } from './gemini.provider';

@Module({
  providers: [
    GeminiProvider,
    {
      provide: OCR_PROVIDER,
      useExisting: GeminiProvider,
    },
  ],
  exports: [OCR_PROVIDER, GeminiProvider],
})
export class ProvidersModule {}
