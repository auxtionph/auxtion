/* eslint-disable */
import { IsString, IsInt, IsEnum, IsArray, IsOptional, Min, MaxLength } from 'class-validator';
import { ShopItemCategory } from '@prisma/client';

export class UpdateStorefrontItemDto {
  @IsOptional()
  @IsString()
  @MaxLength(120)
  title?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  description?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  price?: number;

  @IsOptional()
  @IsEnum(ShopItemCategory)
  category?: ShopItemCategory;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  photos?: string[];
}