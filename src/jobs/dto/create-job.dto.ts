import { IsOptional, IsString } from 'class-validator';

export class CreateJobDto {
  @IsOptional()
  @IsString()
  webhook_url?: string;
}
