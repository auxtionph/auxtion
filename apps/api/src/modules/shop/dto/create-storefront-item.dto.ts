/* eslint-disable */
import { IsString, IsInt, IsEnum, IsArray, Min, MaxLength } from 'class-validator';
import { ShopItemCategory } from '@prisma/client';

export class CreateStorefrontItemDto {
  @IsString()
  @MaxLength(120)
  title!: string;

  @IsString()
  @MaxLength(1000)
  description!: string;

  @IsInt()
  @Min(1)
  price!: number;

  @IsEnum(ShopItemCategory)
  category!: ShopItemCategory;

  @IsArray()
  @IsString({ each: true })
  photos!: string[];
}