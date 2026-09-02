import { IsOptional, IsString } from 'class-validator';

export class CreateJobDto {
  @IsOptional()
  @IsString()
  webhook_url?: string;

  /**
   * Optional JSON-encoded array of `{ key, description }` fields the client
   * expects back, e.g. `[{"key":"total_amount","description":"Total due"}]`.
   * When present, the model is asked to also map matching values onto these
   * exact keys, in addition to its normal open-ended extraction.
   */
  @IsOptional()
  @IsString()
  schema?: string;
}
