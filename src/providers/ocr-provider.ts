import type { ExtractionResult } from '../extraction/schema';

export type OcrInput = {
  bytes: Buffer;
  mimeType: string;
  pageStart: number;
  pageCount: number;
};

export type TokenUsage = {
  prompt_tokens: number;
  candidates_tokens: number;
  thoughts_tokens: number;
  total_tokens: number;
};

export type OcrExtractOutput = {
  result: ExtractionResult;
  model: string;
  usage: TokenUsage;
};

export interface OcrProvider {
  extract(input: OcrInput): Promise<OcrExtractOutput>;
}

export const OCR_PROVIDER = Symbol('OCR_PROVIDER');

export function emptyTokenUsage(): TokenUsage {
  return {
    prompt_tokens: 0,
    candidates_tokens: 0,
    thoughts_tokens: 0,
    total_tokens: 0,
  };
}

export function mergeTokenUsage(parts: TokenUsage[]): TokenUsage {
  return parts.reduce(
    (acc, part) => ({
      prompt_tokens: acc.prompt_tokens + part.prompt_tokens,
      candidates_tokens: acc.candidates_tokens + part.candidates_tokens,
      thoughts_tokens: acc.thoughts_tokens + part.thoughts_tokens,
      total_tokens: acc.total_tokens + part.total_tokens,
    }),
    emptyTokenUsage(),
  );
}
