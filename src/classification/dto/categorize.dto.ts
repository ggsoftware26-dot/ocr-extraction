import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsInt,
  IsString,
  MinLength,
  ValidateNested,
} from 'class-validator';

export class CategoryOptionDto {
  @IsInt()
  id!: number;

  @IsString()
  @MinLength(1)
  name!: string;
}

export class CategorizeDto {
  @IsString()
  @MinLength(1)
  supplier_name!: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CategoryOptionDto)
  categories!: CategoryOptionDto[];
}
