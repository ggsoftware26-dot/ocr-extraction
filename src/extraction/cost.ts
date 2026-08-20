import { ConfigService } from '@nestjs/config';
import { envNumber } from '../common/env';
import type { TokenUsage } from '../providers/ocr-provider';

export type PricingInfo = {
  currency: 'USD';
  input_per_1m_usd: number;
  output_per_1m_usd: number;
  note: string;
};

export type CostEstimate = {
  cost_usd: number;
  pricing: PricingInfo;
};

/** Defaults match Gemini 2.5 Flash paid tier (text/image/video). Override via env. */
export function loadPricing(config: ConfigService): PricingInfo {
  return {
    currency: 'USD',
    input_per_1m_usd: envNumber(config, 'GEMINI_INPUT_PRICE_PER_1M', 0.3),
    output_per_1m_usd: envNumber(config, 'GEMINI_OUTPUT_PRICE_PER_1M', 2.5),
    note: 'estimate from configured Gemini rates; output includes thinking tokens',
  };
}

export function estimateCostUsd(
  usage: TokenUsage,
  pricing: PricingInfo,
): number {
  const inputCost = (usage.prompt_tokens / 1_000_000) * pricing.input_per_1m_usd;
  const outputTokens = usage.candidates_tokens + usage.thoughts_tokens;
  const outputCost = (outputTokens / 1_000_000) * pricing.output_per_1m_usd;
  return roundUsd(inputCost + outputCost);
}

export function buildCostEstimate(
  usage: TokenUsage,
  config: ConfigService,
): CostEstimate {
  const pricing = loadPricing(config);
  return {
    cost_usd: estimateCostUsd(usage, pricing),
    pricing,
  };
}

function roundUsd(value: number): number {
  return Math.round(value * 1_000_000) / 1_000_000;
}
