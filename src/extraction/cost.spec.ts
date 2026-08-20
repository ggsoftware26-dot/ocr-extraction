import { ConfigService } from '@nestjs/config';
import { estimateCostUsd, loadPricing } from './cost';

describe('cost estimate', () => {
  const config = {
    get: (key: string) => {
      const values: Record<string, string> = {
        GEMINI_INPUT_PRICE_PER_1M: '0.30',
        GEMINI_OUTPUT_PRICE_PER_1M: '2.50',
      };
      return values[key];
    },
  } as unknown as ConfigService;

  it('estimates USD from prompt and output tokens', () => {
    const pricing = loadPricing(config);
    const cost = estimateCostUsd(
      {
        prompt_tokens: 1_000_000,
        candidates_tokens: 400_000,
        thoughts_tokens: 100_000,
        total_tokens: 1_500_000,
      },
      pricing,
    );

    // 1M * 0.30 + 0.5M * 2.50 = 0.30 + 1.25 = 1.55
    expect(cost).toBe(1.55);
  });
});
