import { IsArray, IsString, MinLength } from 'class-validator';

export class AnomalyCheckDto {
  @IsString()
  @MinLength(1)
  category_name!: string;

  @IsArray()
  @IsString({ each: true })
  line_items!: string[];
}
