import { IsIn, IsOptional, IsString } from 'class-validator';
import { OCR_PROVIDER_IDS } from '../../providers/provider-id';

export class CreateJobDto {
  @IsOptional()
  @IsString()
  webhook_url?: string;

  /** Server OCR backend: gemini (cloud) or qwen (self-hosted OpenAI-compatible). */
  @IsOptional()
  @IsIn(OCR_PROVIDER_IDS)
  provider?: (typeof OCR_PROVIDER_IDS)[number];
}
