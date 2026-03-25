import {
  IsString,
  IsInt,
  IsEnum,
  IsOptional,
  MinLength,
  MaxLength,
  Min,
  IsArray,
} from 'class-validator';
import { ShopItemType } from '@prisma/client';

export class UpdateShopItemDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  title?: string;

  @IsOptional()
  @IsString()
  @MinLength(10)
  @MaxLength(1000)
  description?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  photos?: string[];

  @IsOptional()
  @IsInt()
  @Min(1)
  price?: number;

  @IsOptional()
  @IsEnum(ShopItemType)
  type?: ShopItemType;

  @IsOptional()
  @IsInt()
  queueOrder?: number;
}
