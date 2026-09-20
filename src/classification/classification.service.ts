import { Inject, Injectable } from '@nestjs/common';
import { TEXT_PROVIDER, type TextProvider } from '../providers/ocr-provider';
import {
  anomalyGeminiSchema,
  anomalyResultSchema,
  buildAnomalyPrompt,
  buildCategorizePrompt,
  categorizeGeminiSchema,
  categorizeResultSchema,
  type AnomalyResult,
  type CategorizeResult,
  type CategoryOption,
} from './schema';

@Injectable()
export class ClassificationService {
  constructor(
    @Inject(TEXT_PROVIDER) private readonly textProvider: TextProvider,
  ) {}

  async categorizeSupplier(
    supplierName: string,
    categories: CategoryOption[],
  ): Promise<CategorizeResult> {
    const prompt = buildCategorizePrompt(supplierName, categories);
    const raw = await this.textProvider.generateJson(
      prompt,
      categorizeGeminiSchema,
    );
    const parsed = categorizeResultSchema.parse(raw);

    const validIds = new Set(categories.map((category) => category.id));
    if (!validIds.has(parsed.category_id)) {
      throw new Error(
        `Model returned category_id ${parsed.category_id}, which is not one of the offered categories`,
      );
    }

    return parsed;
  }

  async detectAnomaly(
    categoryName: string,
    lineItems: string[],
  ): Promise<AnomalyResult> {
    if (lineItems.length === 0) {
      return { has_anomaly: false };
    }

    const prompt = buildAnomalyPrompt(categoryName, lineItems);
    const raw = await this.textProvider.generateJson(
      prompt,
      anomalyGeminiSchema,
    );
    return anomalyResultSchema.parse(raw);
  }
}
