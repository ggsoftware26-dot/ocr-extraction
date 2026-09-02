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

export const clientSchemaFieldSchema = z.object({
  key: z.string().trim().min(1).max(100),
  description: z.string().trim().min(1).max(500),
});

export const clientSchemaSchema = z
  .array(clientSchemaFieldSchema)
  .min(1)
  .max(50);

export type ClientSchemaField = z.infer<typeof clientSchemaFieldSchema>;

/** Parses and validates the client-supplied `schema` request field (a JSON string). */
export function parseClientSchema(raw: string): ClientSchemaField[] {
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    throw new Error('schema must be valid JSON');
  }

  const result = clientSchemaSchema.safeParse(json);
  if (!result.success) {
    const message = result.error.issues
      .map((issue) => `${issue.path.join('.') || 'schema'}: ${issue.message}`)
      .join('; ');
    throw new Error(`Invalid schema: ${message}`);
  }
  return result.data;
}

export type TokenUsageMeta = {
  prompt_tokens: number;
  candidates_tokens: number;
  thoughts_tokens: number;
  total_tokens: number;
};

export type ExtractionPricingMeta = {
  currency: 'USD';
  input_per_1m_usd: number;
  output_per_1m_usd: number;
  note: string;
};

export type ExtractionMeta = {
  processing_time_ms: number;
  model: string;
  usage: TokenUsageMeta;
  cost_usd: number | null;
  pricing: ExtractionPricingMeta | null;
};

export type StoredExtractionDocument = ExtractionResult & {
  meta?: ExtractionMeta;
};

const HEBREW_ASCII_QUOTE = /([\u0590-\u05FF])"([\u0590-\u05FF])/g;

export function normalizeHebrewQuotes(text: string): string {
  return text.replace(HEBREW_ASCII_QUOTE, '$1\u05F4$2');
}

export function parseExtractionResult(input: unknown): ExtractionResult {
  return normalizeResult(extractionResultSchema.parse(input));
}

export function parseStoredExtractionDocument(input: unknown): {
  result: ExtractionResult;
  meta: ExtractionMeta | null;
} {
  if (!input || typeof input !== 'object') {
    throw new Error('Stored extraction document must be an object');
  }
  const record = input as Record<string, unknown>;
  return {
    result: parseExtractionResult(input),
    meta: parseExtractionMeta(record.meta),
  };
}

export function parseExtractionMeta(input: unknown): ExtractionMeta | null {
  if (!input || typeof input !== 'object') {
    return null;
  }
  const raw = input as Record<string, unknown>;
  const usage = raw.usage;
  if (!usage || typeof usage !== 'object') {
    return null;
  }
  const usageRaw = usage as Record<string, unknown>;
  const processingTime = asNonNegInt(raw.processing_time_ms);
  const model = typeof raw.model === 'string' ? raw.model : '';
  if (processingTime === null || !model) {
    return null;
  }

  return {
    processing_time_ms: processingTime,
    model,
    usage: {
      prompt_tokens: asNonNegInt(usageRaw.prompt_tokens) ?? 0,
      candidates_tokens: asNonNegInt(usageRaw.candidates_tokens) ?? 0,
      thoughts_tokens: asNonNegInt(usageRaw.thoughts_tokens) ?? 0,
      total_tokens: asNonNegInt(usageRaw.total_tokens) ?? 0,
    },
    cost_usd: asFiniteNumber(raw.cost_usd),
    pricing: parsePricingMeta(raw.pricing),
  };
}

function parsePricingMeta(input: unknown): ExtractionPricingMeta | null {
  if (!input || typeof input !== 'object') {
    return null;
  }
  const raw = input as Record<string, unknown>;
  const inputPrice = asFiniteNumber(raw.input_per_1m_usd);
  const outputPrice = asFiniteNumber(raw.output_per_1m_usd);
  if (inputPrice === null || outputPrice === null) {
    return null;
  }
  return {
    currency: 'USD',
    input_per_1m_usd: inputPrice,
    output_per_1m_usd: outputPrice,
    note: typeof raw.note === 'string' ? raw.note : '',
  };
}

function asNonNegInt(value: unknown): number | null {
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n) || n < 0) {
    return null;
  }
  return Math.trunc(n);
}

function asFiniteNumber(value: unknown): number | null {
  if (value === null || value === undefined) {
    return null;
  }
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : null;
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
  clientSchema?: ClientSchemaField[],
): string {
  const base = [
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

  if (!clientSchema?.length) {
    return base;
  }

  const requested = [
    '',
    'The client also expects these specific fields, on top of anything else you find:',
    ...clientSchema.map((field) => `- ${field.key}: ${field.description}`),
    '',
    'For each field listed above, find the best matching value in the document by meaning — using its name and description, not just literal text matches — and output it in fields[] using EXACTLY that key (do not rename, translate, or reformat the key). If you cannot find a confident value for one of these fields, omit it rather than guessing. Continue to also report any other distinct facts you find as additional fields, with your own descriptive snake_case keys, exactly as you would without this list.',
  ].join('\n');

  return base + requested;
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
