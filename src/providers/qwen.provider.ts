import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { jsonrepair } from 'jsonrepair';
import { envNumber } from '../common/env';
import {
  buildExtractionPrompt,
  parseExtractionResult,
  toGlobalPage,
  type ExtractionResult,
} from '../extraction/schema';
import type {
  OcrExtractOutput,
  OcrInput,
  OcrProvider,
  TokenUsage,
} from './ocr-provider';
import { emptyTokenUsage, mergeTokenUsage } from './ocr-provider';

/**
 * OpenAI-compatible vision chat (Ollama / vLLM / LM Studio).
 * Local Mac example:
 *   ollama pull qwen2.5vl:7b
 *   QWEN_BASE_URL=http://127.0.0.1:11434/v1
 *   QWEN_MODEL=qwen2.5vl:7b
 */
@Injectable()
export class QwenProvider implements OcrProvider {
  private readonly logger = new Logger(QwenProvider.name);
  private readonly baseUrl: string;
  private readonly model: string;
  private readonly apiKey: string;
  private readonly timeoutMs: number;

  constructor(config: ConfigService) {
    const raw =
      config.get<string>('QWEN_BASE_URL')?.trim() ||
      'http://127.0.0.1:11434/v1';
    this.baseUrl = raw.replace(/\/$/, '');
    this.model = config.get<string>('QWEN_MODEL')?.trim() || 'qwen2.5vl:7b';
    this.apiKey = config.get<string>('QWEN_API_KEY')?.trim() || 'ollama';
    this.timeoutMs = envNumber(config, 'EXTRACT_TIMEOUT_MS', 180_000);
  }

  async extract(input: OcrInput): Promise<OcrExtractOutput> {
    if (input.mimeType === 'application/pdf') {
      throw new Error(
        'Qwen/Ollama vision expects images. Convert PDF pages to images, or use the Gemini provider for PDFs.',
      );
    }
    if (!input.mimeType.startsWith('image/')) {
      throw new Error(
        `Qwen provider does not support mime type ${input.mimeType}`,
      );
    }

    let first: OcrExtractOutput;
    try {
      first = await this.callModel(input, 'full');
    } catch (error) {
      this.logger.warn(
        `First Qwen pass failed (${errorMessage(error)}); retrying once`,
      );
      first = await this.callModel(input, 'full');
    }

    if (!isSparseResult(first.result)) {
      return first;
    }

    this.logger.warn(
      'Qwen returned empty fields/tables; retrying with a stricter field-extraction prompt',
    );
    try {
      const second = await this.callModel(input, 'fields');
      return {
        model: second.model || first.model,
        usage: mergeTokenUsage([first.usage, second.usage]),
        result: {
          document_type:
            second.result.document_type ?? first.result.document_type,
          summary: second.result.summary || first.result.summary,
          fields: second.result.fields,
          tables: second.result.tables,
        },
      };
    } catch (error) {
      this.logger.warn(
        `Qwen field-retry failed (${errorMessage(error)}); keeping first result`,
      );
      return first;
    }
  }

  private async callModel(
    input: OcrInput,
    mode: 'full' | 'fields',
  ): Promise<OcrExtractOutput> {
    const prompt = buildQwenPrompt(input.pageStart, input.pageCount, mode);
    const dataUrl = `data:${input.mimeType};base64,${input.bytes.toString('base64')}`;
    const url = `${this.baseUrl}/chat/completions`;

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: this.model,
        temperature: 0,
        // Ollama / Qwen: leave room for many fields (default caps are too small).
        max_tokens: 4096,
        response_format: { type: 'json_object' },
        messages: [
          {
            role: 'system',
            content:
              'You are a careful document OCR engine. Always return JSON. Prefer extracting many concrete fields over a vague summary.',
          },
          {
            role: 'user',
            content: [
              // Image first — works better for many local VLMs.
              { type: 'image_url', image_url: { url: dataUrl } },
              { type: 'text', text: prompt },
            ],
          },
        ],
      }),
      signal: AbortSignal.timeout(this.timeoutMs),
    });

    const rawBody = await response.text();
    if (!response.ok) {
      throw new Error(
        `Qwen API ${response.status} from ${url}: ${rawBody.slice(0, 500)}`,
      );
    }

    let payload: {
      choices?: Array<{ message?: { content?: string | null } }>;
      usage?: Record<string, unknown>;
      model?: string;
    };
    try {
      payload = JSON.parse(rawBody) as typeof payload;
    } catch {
      throw new Error(`Qwen returned non-JSON body: ${rawBody.slice(0, 300)}`);
    }

    const text = payload.choices?.[0]?.message?.content;
    if (!text) {
      throw new Error('Qwen returned an empty response');
    }

    this.logger.debug(`Qwen raw (${mode}): ${text.slice(0, 500)}`);

    const parsed = parseExtractionResult(parseJson(text));
    return {
      model: payload.model || this.model,
      usage: readUsage(payload.usage),
      result: {
        ...parsed,
        fields: parsed.fields.map((field) => ({
          ...field,
          page: toGlobalPage(field.page, input.pageStart),
        })),
        tables: parsed.tables.map((table) => ({
          ...table,
          page: toGlobalPage(table.page, input.pageStart),
        })),
      },
    };
  }
}

function buildQwenPrompt(
  pageStart: number,
  pageCount: number,
  mode: 'full' | 'fields',
): string {
  const base = buildExtractionPrompt(pageStart, pageCount);
  const example = [
    'Example of a GOOD response (illustrative values only — use real text from THIS image):',
    '{',
    '  "document_type": "receipt",',
    '  "summary": "Grocery receipt from Store Name dated 2024-01-15.",',
    '  "fields": [',
    '    {"key": "merchant_name", "value": "Store Name", "description": "Business name printed at the top", "confidence": 0.9, "page": 1},',
    '    {"key": "date", "value": "15/01/2024", "description": "Transaction date", "confidence": 0.85, "page": 1},',
    '    {"key": "total_amount", "value": "42.50", "description": "Total amount due", "confidence": 0.9, "page": 1},',
    '    {"key": "currency", "value": "ILS", "description": "Currency if shown", "confidence": 0.7, "page": 1}',
    '  ],',
    '  "tables": [',
    '    {',
    '      "name": "line_items",',
    '      "description": "Purchased items",',
    '      "headers": ["item", "qty", "price"],',
    '      "rows": [["Milk", "1", "5.90"], ["Bread", "2", "12.00"]],',
    '      "page": 1',
    '    }',
    '  ]',
    '}',
  ].join('\n');

  const critical = [
    'CRITICAL:',
    '- Read ALL visible printed text on the document (ignore unrelated background/hands if possible).',
    '- fields[] MUST list every distinct readable fact: merchant, address, phone, date, time, receipt/invoice number, subtotal, tax, total, payment method, etc.',
    '- Returning empty fields[] when text is visible is WRONG.',
    '- tables[] must capture line items when a list of products/services is visible.',
    '- Each tables[].rows entry MUST be an array of strings (never an object), aligned with headers.',
    '- Output ONLY JSON. No markdown fences.',
  ].join('\n');

  if (mode === 'fields') {
    return [
      base,
      '',
      critical,
      '',
      'Your previous answer only had document_type/summary. Now fill fields[] and tables[] with real values from the image. Do not leave fields empty.',
      '',
      example,
    ].join('\n');
  }

  return [base, '', critical, '', example].join('\n');
}

function isSparseResult(result: ExtractionResult): boolean {
  return result.fields.length === 0 && result.tables.length === 0;
}

function readUsage(metadata: unknown): TokenUsage {
  if (!metadata || typeof metadata !== 'object') {
    return emptyTokenUsage();
  }
  const raw = metadata as Record<string, unknown>;
  const prompt = asNonNegInt(raw.prompt_tokens);
  const completion = asNonNegInt(raw.completion_tokens);
  const total = asNonNegInt(raw.total_tokens) || prompt + completion;
  return {
    prompt_tokens: prompt,
    candidates_tokens: completion,
    thoughts_tokens: 0,
    total_tokens: total,
  };
}

function asNonNegInt(value: unknown): number {
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n) || n < 0) {
    return 0;
  }
  return Math.trunc(n);
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
