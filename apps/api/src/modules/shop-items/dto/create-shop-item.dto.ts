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

export class CreateShopItemDto {
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  title: string;

  @IsString()
  @MinLength(1)
  @MaxLength(1000)
  description: string;

  @IsArray()
  @IsString({ each: true })
  photos: string[];

  @IsInt()
  @Min(1)
  price: number; // centavos

  @IsEnum(ShopItemType)
  type: ShopItemType;

  @IsOptional()
  @IsInt()
  queueOrder?: number;
}
