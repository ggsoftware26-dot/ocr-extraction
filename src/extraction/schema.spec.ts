import {
  buildExtractionPrompt,
  mergeExtractionResults,
  parseClientSchema,
  parseExtractionResult,
  parseStoredExtractionDocument,
  toGlobalPage,
} from './schema';

describe('extraction schema', () => {
  it('parses open-ended extraction JSON and normalizes empty values', () => {
    const result = parseExtractionResult({
      document_type: 'unknown',
      summary: 'A scanned invoice',
      fields: [
        {
          key: 'invoice_number',
          value: 'INV-001',
          description: 'Vendor invoice identifier',
          confidence: 1.4,
          page: 0,
        },
      ],
      tables: [],
    });

    expect(result.document_type).toBeNull();
    expect(result.fields[0].confidence).toBe(1);
    expect(result.fields[0].page).toBeNull();
  });

  it('maps local batch pages to global pages', () => {
    expect(toGlobalPage(1, 11)).toBe(11);
    expect(toGlobalPage(2, 11)).toBe(12);
    expect(toGlobalPage(null, 11)).toBeNull();
  });

  it('merges batched results', () => {
    const merged = mergeExtractionResults([
      {
        document_type: 'invoice',
        summary: 'Page one.',
        fields: [
          {
            key: 'vendor',
            value: 'Acme',
            description: 'Seller name',
            confidence: 0.9,
            page: 1,
          },
        ],
        tables: [],
      },
      {
        document_type: 'invoice',
        summary: 'Page two.',
        fields: [
          {
            key: 'total',
            value: '12.00',
            description: 'Amount due',
            confidence: 0.8,
            page: 11,
          },
        ],
        tables: [],
      },
    ]);

    expect(merged.document_type).toBe('invoice');
    expect(merged.summary).toBe('Page one. Page two.');
    expect(merged.fields).toHaveLength(2);
  });

  it('replaces ASCII quotes between Hebrew letters with gershayim', () => {
    const result = parseExtractionResult({
      document_type: 'order',
      summary: '',
      fields: [
        {
          key: 'seller_legal_name',
          value: 'המרכז הבריאותי ד.ע בע"מ',
          description: 'The legal registered name of the seller.',
          confidence: 0.99,
          page: 1,
        },
      ],
      tables: [],
    });

    expect(result.fields[0].value).toBe('המרכז הבריאותי ד.ע בע\u05F4מ');
    expect(JSON.stringify(result.fields[0])).not.toContain('\\"');
  });

  it('parses stored documents with meta and ignores unknown meta on result parse', () => {
    const parsed = parseStoredExtractionDocument({
      document_type: 'invoice',
      summary: 'A doc',
      fields: [],
      tables: [],
      meta: {
        processing_time_ms: 1200,
        model: 'gemini-2.5-flash',
        usage: {
          prompt_tokens: 100,
          candidates_tokens: 20,
          thoughts_tokens: 5,
          total_tokens: 125,
        },
        cost_usd: 0.00008,
        pricing: {
          currency: 'USD',
          input_per_1m_usd: 0.3,
          output_per_1m_usd: 2.5,
          note: 'estimate',
        },
      },
    });

    expect(parsed.result.document_type).toBe('invoice');
    expect(parsed.meta).toMatchObject({
      processing_time_ms: 1200,
      model: 'gemini-2.5-flash',
      usage: { total_tokens: 125 },
      cost_usd: 0.00008,
    });
  });

  it('returns null meta for legacy stored documents', () => {
    const parsed = parseStoredExtractionDocument({
      document_type: 'invoice',
      summary: 'legacy',
      fields: [],
      tables: [],
    });
    expect(parsed.meta).toBeNull();
  });

  describe('parseClientSchema', () => {
    it('parses a valid client schema JSON string', () => {
      const fields = parseClientSchema(
        JSON.stringify([
          { key: 'total_amount', description: 'Total amount due' },
        ]),
      );
      expect(fields).toEqual([
        { key: 'total_amount', description: 'Total amount due' },
      ]);
    });

    it('rejects invalid JSON', () => {
      expect(() => parseClientSchema('not json')).toThrow(
        'schema must be valid JSON',
      );
    });

    it('rejects a schema missing required fields', () => {
      expect(() =>
        parseClientSchema(JSON.stringify([{ key: 'total_amount' }])),
      ).toThrow('Invalid schema');
    });

    it('rejects an empty array', () => {
      expect(() => parseClientSchema('[]')).toThrow('Invalid schema');
    });
  });

  describe('buildExtractionPrompt', () => {
    it('omits the requested-fields section when no client schema is given', () => {
      const prompt = buildExtractionPrompt(1, 3);
      expect(prompt).not.toContain('client also expects');
    });

    it('appends the requested fields with their exact keys and descriptions', () => {
      const prompt = buildExtractionPrompt(1, 3, [
        { key: 'total_amount', description: 'Total amount due' },
        { key: 'supplier_name', description: 'The vendor or business name' },
      ]);
      expect(prompt).toContain('client also expects');
      expect(prompt).toContain('- total_amount: Total amount due');
      expect(prompt).toContain('- supplier_name: The vendor or business name');
    });
  });
});
