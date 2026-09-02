import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { envNumber } from '../common/env';
import { OcrProviderRegistry } from '../providers/ocr-provider.registry';
import {
  mergeTokenUsage,
  type OcrExtractOutput,
  type OcrProvider,
  type TokenUsage,
} from '../providers/ocr-provider';
import type { OcrProviderId } from '../providers/provider-id';
import { mergeExtractionResults, type ExtractionResult } from './schema';
import { countPdfPages, mapPool, splitPdfIntoBatches } from './pdf.util';

export type ExtractionOutcome = {
  result: ExtractionResult;
  model: string;
  usage: TokenUsage;
  provider: OcrProviderId;
};

@Injectable()
export class ExtractionService {
  private readonly logger = new Logger(ExtractionService.name);
  private readonly pageThreshold: number;
  private readonly batchSize: number;
  private readonly batchConcurrency: number;

  constructor(
    private readonly providers: OcrProviderRegistry,
    config: ConfigService,
  ) {
    this.pageThreshold = envNumber(config, 'PDF_PAGE_THRESHOLD', 15);
    this.batchSize = envNumber(config, 'PDF_PAGE_BATCH_SIZE', 10);
    this.batchConcurrency = envNumber(config, 'PDF_BATCH_CONCURRENCY', 2);
  }

  async extract(
    bytes: Buffer,
    mimeType: string,
    providerId?: string | null,
  ): Promise<ExtractionOutcome> {
    const { id, provider } = this.providers.resolve(providerId);

    if (mimeType === 'application/pdf') {
      const outcome = await this.extractPdf(bytes, provider);
      return { ...outcome, provider: id };
    }

    const single = await provider.extract({
      bytes,
      mimeType,
      pageStart: 1,
      pageCount: 1,
    });
    return { ...single, provider: id };
  }

  private async extractPdf(
    bytes: Buffer,
    provider: OcrProvider,
  ): Promise<Omit<ExtractionOutcome, 'provider'>> {
    const pageCount = await countPdfPages(bytes);
    this.logger.log(`PDF has ${pageCount} page(s)`);

    if (pageCount <= this.pageThreshold) {
      return provider.extract({
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
      provider.extract({
        bytes: batch.bytes,
        mimeType: 'application/pdf',
        pageStart: batch.pageStart,
        pageCount: batch.pageCount,
      }),
    );

    return mergeOutcomes(parts);
  }
}

function mergeOutcomes(
  parts: OcrExtractOutput[],
): Omit<ExtractionOutcome, 'provider'> {
  return {
    result: mergeExtractionResults(parts.map((part) => part.result)),
    model: parts[0]?.model ?? 'unknown',
    usage: mergeTokenUsage(parts.map((part) => part.usage)),
  };
}
