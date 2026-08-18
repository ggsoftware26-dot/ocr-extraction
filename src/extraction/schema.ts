import { z } from 'zod';

const nullableString = z
  .union([z.string(), z.null()])
  .optional()
  .transform((value) => {
    if (value === undefined || value === null) {
      return null;
    }
    const trimmed = value.trim();
    if (
      trimmed.length === 0 ||
      trimmed.toLowerCase() === 'null' ||
      trimmed.toLowerCase() === 'unknown'
    ) {
      return null;
    }
    return trimmed;
  });

const pageNumber = z
  .union([z.number(), z.null()])
  .optional()
  .transform((value) => {
    if (value === undefined || value === null || value <= 0) {
      return null;
    }
    return Math.trunc(value);
  });

export const extractedFieldSchema = z.object({
  key: z.string().min(1),
  value: z.string(),
  description: z.string(),
  confidence: z.coerce.number().transform((n) => Math.min(1, Math.max(0, n))),
  page: pageNumber,
});

export const extractedTableSchema = z.object({
  name: z.string().min(1),
  description: z.string(),
  headers: z.array(z.string()),
  rows: z.array(z.array(z.string())),
  page: pageNumber,
});

export const extractionResultSchema = z.object({
  document_type: nullableString,
  summary: z.string().default(''),
  fields: z.array(extractedFieldSchema).default([]),
  tables: z.array(extractedTableSchema).default([]),
});

export type ExtractedField = z.infer<typeof extractedFieldSchema>;
export type ExtractedTable = z.infer<typeof extractedTableSchema>;
export type ExtractionResult = z.infer<typeof extractionResultSchema>;

const HEBREW_ASCII_QUOTE = /([\u0590-\u05FF])"([\u0590-\u05FF])/g;

export function normalizeHebrewQuotes(text: string): string {
  return text.replace(HEBREW_ASCII_QUOTE, '$1\u05F4$2');
}

export function parseExtractionResult(input: unknown): ExtractionResult {
  return normalizeResult(extractionResultSchema.parse(input));
}

function normalizeResult(result: ExtractionResult): ExtractionResult {
  return {
    document_type: result.document_type
      ? normalizeHebrewQuotes(result.document_type)
      : result.document_type,
    summary: normalizeHebrewQuotes(result.summary),
    fields: result.fields.map((field) => ({
      ...field,
      key: normalizeHebrewQuotes(field.key),
      value: normalizeHebrewQuotes(field.value),
      description: normalizeHebrewQuotes(field.description),
    })),
    tables: result.tables.map((table) => ({
      ...table,
      name: normalizeHebrewQuotes(table.name),
      description: normalizeHebrewQuotes(table.description),
      headers: table.headers.map(normalizeHebrewQuotes),
      rows: table.rows.map((row) => row.map(normalizeHebrewQuotes)),
    })),
  };
}

export function buildExtractionPrompt(
  pageStart: number,
  pageCount: number,
): string {
  return [
    'You are an OCR extraction engine. Extract every distinct fact visible in this document.',
    '',
    'Rules:',
    '- Extract only what is visible. Never invent values, names, numbers, or dates.',
    '- If a value is unreadable or uncertain, omit that field.',
    '- Keep the original language and wording in values.',
    '- Keys must be snake_case, stable, and descriptive.',
    '- One field per distinct fact.',
    '- Put tabular data in tables, not as flattened fields.',
    '- confidence is 0 to 1 based on readability.',
    `- page is the 1-based index within THIS batch (1 is the first page of this batch). This batch has ${pageCount} page(s). The first page of this batch is global page ${pageStart}. Use 0 if page is unknown.`,
    '- document_type is a short label (invoice, receipt, id, contract, letter, photo, etc.) or empty if unknown.',
    '- summary is one or two sentences describing the document.',
  ].join('\n');
}

export function toGlobalPage(
  localPage: number | null,
  pageStart: number,
): number | null {
  if (localPage === null) {
    return null;
  }
  return pageStart + localPage - 1;
}

export function mergeExtractionResults(
  parts: ExtractionResult[],
): ExtractionResult {
  const fields: ExtractedField[] = [];
  const tables: ExtractedTable[] = [];
  const types: string[] = [];
  const summaries: string[] = [];

  for (const part of parts) {
    if (part.document_type) {
      types.push(part.document_type);
    }
    if (part.summary.trim()) {
      summaries.push(part.summary.trim());
    }
    fields.push(...part.fields);
    tables.push(...part.tables);
  }

  return {
    document_type: types[0] ?? null,
    summary: summaries.join(' '),
    fields,
    tables,
  };
}
