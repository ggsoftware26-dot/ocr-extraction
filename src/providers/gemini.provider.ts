import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GoogleGenAI, Type } from '@google/genai';
import { jsonrepair } from 'jsonrepair';
import { envNumber, requireEnv } from '../common/env';
import {
  buildExtractionPrompt,
  parseExtractionResult,
  toGlobalPage,
  type ExtractionResult,
} from '../extraction/schema';
import type { OcrInput, OcrProvider } from './ocr-provider';

const geminiResponseSchema = {
  type: Type.OBJECT,
  properties: {
    document_type: { type: Type.STRING },
    summary: { type: Type.STRING },
    fields: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          key: { type: Type.STRING },
          value: { type: Type.STRING },
          description: { type: Type.STRING },
          confidence: { type: Type.NUMBER },
          page: { type: Type.INTEGER },
        },
        required: ['key', 'value', 'description', 'confidence', 'page'],
      },
    },
    tables: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          name: { type: Type.STRING },
          description: { type: Type.STRING },
          headers: {
            type: Type.ARRAY,
            items: { type: Type.STRING },
          },
          rows: {
            type: Type.ARRAY,
            items: {
              type: Type.ARRAY,
              items: { type: Type.STRING },
            },
          },
          page: { type: Type.INTEGER },
        },
        required: ['name', 'description', 'headers', 'rows', 'page'],
      },
    },
  },
  required: ['document_type', 'summary', 'fields', 'tables'],
};

@Injectable()
export class GeminiProvider implements OcrProvider {
  private readonly logger = new Logger(GeminiProvider.name);
  private readonly client: GoogleGenAI;
  private readonly model: string;
  private readonly timeoutMs: number;

  constructor(config: ConfigService) {
    this.client = new GoogleGenAI({
      apiKey: requireEnv(config, 'GEMINI_API_KEY'),
    });
    this.model = config.get<string>('GEMINI_MODEL') ?? 'gemini-2.5-flash';
    this.timeoutMs = envNumber(config, 'EXTRACT_TIMEOUT_MS', 60_000);
  }

  async extract(input: OcrInput): Promise<ExtractionResult> {
    try {
      return await this.callModel(input);
    } catch (error) {
      this.logger.warn(
        `First Gemini pass failed (${errorMessage(error)}); retrying once`,
      );
      return this.callModel(input);
    }
  }

  private async callModel(input: OcrInput): Promise<ExtractionResult> {
    const prompt = buildExtractionPrompt(input.pageStart, input.pageCount);
    const response = await this.client.models.generateContent({
      model: this.model,
      contents: [
        {
          role: 'user',
          parts: [
            { text: prompt },
            {
              inlineData: {
                mimeType: input.mimeType,
                data: input.bytes.toString('base64'),
              },
            },
          ],
        },
      ],
      config: {
        abortSignal: AbortSignal.timeout(this.timeoutMs),
        responseMimeType: 'application/json',
        responseSchema: geminiResponseSchema,
      },
    });

    const text = response.text;
    if (!text) {
      throw new Error('Gemini returned an empty response');
    }

    const parsed = parseExtractionResult(parseJson(text));
    return {
      ...parsed,
      fields: parsed.fields.map((field) => ({
        ...field,
        page: toGlobalPage(field.page, input.pageStart),
      })),
      tables: parsed.tables.map((table) => ({
        ...table,
        page: toGlobalPage(table.page, input.pageStart),
      })),
    };
  }
}

function parseJson(text: string): unknown {
  const trimmed = text
    .trim()
    .replace(/^```json\s*/i, '')
    .replace(/```$/u, '');
  try {
    return JSON.parse(trimmed) as unknown;
  } catch {
    return JSON.parse(jsonrepair(trimmed)) as unknown;
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
