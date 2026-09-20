import { Type } from '@google/genai';
import { z } from 'zod';

export type CategoryOption = { id: number; name: string };

export const categorizeGeminiSchema = {
  type: Type.OBJECT,
  properties: {
    category_id: { type: Type.INTEGER },
  },
  required: ['category_id'],
};

export const categorizeResultSchema = z.object({
  category_id: z.coerce.number().int(),
});

export type CategorizeResult = z.infer<typeof categorizeResultSchema>;

export const anomalyGeminiSchema = {
  type: Type.OBJECT,
  properties: {
    has_anomaly: { type: Type.BOOLEAN },
    reason: { type: Type.STRING },
  },
  required: ['has_anomaly'],
};

export const anomalyResultSchema = z.object({
  has_anomaly: z.boolean(),
  reason: z
    .string()
    .trim()
    .transform((value) => (value.length > 0 ? value : undefined))
    .optional(),
});

export type AnomalyResult = z.infer<typeof anomalyResultSchema>;

export function buildCategorizePrompt(
  supplierName: string,
  categories: CategoryOption[],
): string {
  const list = categories
    .map((category) => `- ${category.id}: ${category.name}`)
    .join('\n');

  return [
    'You are classifying a business expense supplier into exactly one fixed accounting category.',
    '',
    `Supplier name: ${supplierName}`,
    '',
    'Categories (id: name):',
    list,
    '',
    'Pick the single best-matching category id for this supplier, based on what this business typically sells.',
    'Respond with only the category_id, using one of the ids listed above. Never invent a new id.',
  ].join('\n');
}

export function buildAnomalyPrompt(
  categoryName: string,
  lineItems: string[],
): string {
  const list = lineItems.map((item) => `- ${item}`).join('\n');

  return [
    'You are checking a receipt for anomalies. This supplier is known to sometimes sell a mix of goods,',
    `and its default expense category is "${categoryName}".`,
    '',
    'Receipt line items:',
    list,
    '',
    `Decide whether any line item looks out of place for the "${categoryName}" category`,
    '(for example, personal or unrelated goods mixed into a business receipt).',
    'If something looks anomalous, set has_anomaly to true and give a short reason in Hebrew.',
    'If everything is consistent with the category, set has_anomaly to false and omit reason.',
  ].join('\n');
}
