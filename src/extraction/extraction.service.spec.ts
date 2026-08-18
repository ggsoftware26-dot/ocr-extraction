import { ConfigService } from '@nestjs/config';
import { PDFDocument } from 'pdf-lib';
import { ExtractionService } from './extraction.service';
import type { ExtractionResult } from './schema';

async function makePdf(pages: number): Promise<Buffer> {
  const doc = await PDFDocument.create();
  for (let i = 0; i < pages; i += 1) {
    doc.addPage();
  }
  return Buffer.from(await doc.save());
}

function emptyResult(): ExtractionResult {
  return {
    document_type: 'invoice',
    summary: 'doc',
    fields: [],
    tables: [],
  };
}

describe('ExtractionService', () => {
  const config = {
    get: (key: string) => {
      const values: Record<string, string> = {
        PDF_PAGE_THRESHOLD: '15',
        PDF_PAGE_BATCH_SIZE: '10',
        PDF_BATCH_CONCURRENCY: '2',
      };
      return values[key];
    },
  } as unknown as ConfigService;

  it('sends small PDFs in one provider call', async () => {
    const extract = jest.fn(() => Promise.resolve(emptyResult()));
    const service = new ExtractionService({ extract }, config);
    const bytes = await makePdf(3);

    await service.extract(bytes, 'application/pdf');

    expect(extract).toHaveBeenCalledTimes(1);
    expect(extract.mock.calls[0][0]).toMatchObject({
      mimeType: 'application/pdf',
      pageStart: 1,
      pageCount: 3,
    });
  });

  it('splits large PDFs into page batches', async () => {
    const extract = jest.fn(() => Promise.resolve(emptyResult()));
    const service = new ExtractionService({ extract }, config);
    const bytes = await makePdf(20);

    await service.extract(bytes, 'application/pdf');

    expect(extract).toHaveBeenCalledTimes(2);
    expect(extract.mock.calls[0][0]).toMatchObject({
      pageStart: 1,
      pageCount: 10,
    });
    expect(extract.mock.calls[1][0]).toMatchObject({
      pageStart: 11,
      pageCount: 10,
    });
  });
});
