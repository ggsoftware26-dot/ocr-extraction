import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { envNumber } from '../common/env';
import { OCR_PROVIDER, type OcrProvider } from '../providers/ocr-provider';
import { mergeExtractionResults, type ExtractionResult } from './schema';
import { countPdfPages, mapPool, splitPdfIntoBatches } from './pdf.util';

@Injectable()
export class ExtractionService {
  private readonly logger = new Logger(ExtractionService.name);
  private readonly pageThreshold: number;
  private readonly batchSize: number;
  private readonly batchConcurrency: number;

  constructor(
    @Inject(OCR_PROVIDER) private readonly provider: OcrProvider,
    config: ConfigService,
  ) {
    this.pageThreshold = envNumber(config, 'PDF_PAGE_THRESHOLD', 15);
    this.batchSize = envNumber(config, 'PDF_PAGE_BATCH_SIZE', 10);
    this.batchConcurrency = envNumber(config, 'PDF_BATCH_CONCURRENCY', 2);
  }

  async extract(bytes: Buffer, mimeType: string): Promise<ExtractionResult> {
    if (mimeType === 'application/pdf') {
      return this.extractPdf(bytes);
    }

    return this.provider.extract({
      bytes,
      mimeType,
      pageStart: 1,
      pageCount: 1,
    });
  }

  private async extractPdf(bytes: Buffer): Promise<ExtractionResult> {
    const pageCount = await countPdfPages(bytes);
    this.logger.log(`PDF has ${pageCount} page(s)`);

    if (pageCount <= this.pageThreshold) {
      return this.provider.extract({
        bytes,
        mimeType: 'application/pdf',
        pageStart: 1,
        pageCount,
      });
    }

    const batches = await splitPdfIntoBatches(bytes, this.batchSize);
    this.logger.log(
      `Splitting PDF into ${batches.length} batches of up to ${this.batchSize} pages`,
    );

    const parts = await mapPool(batches, this.batchConcurrency, async (batch) =>
      this.provider.extract({
        bytes: batch.bytes,
        mimeType: 'application/pdf',
        pageStart: batch.pageStart,
        pageCount: batch.pageCount,
      }),
    );

    return mergeExtractionResults(parts);
  }
}
