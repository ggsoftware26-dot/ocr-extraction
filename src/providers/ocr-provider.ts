import type { ExtractionResult } from '../extraction/schema';

export type OcrInput = {
  bytes: Buffer;
  mimeType: string;
  pageStart: number;
  pageCount: number;
};

export interface OcrProvider {
  extract(input: OcrInput): Promise<ExtractionResult>;
}

export const OCR_PROVIDER = Symbol('OCR_PROVIDER');
