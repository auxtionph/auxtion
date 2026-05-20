import {
  IsString,
  IsInt,
  IsEnum,
  IsOptional,
  MaxLength,
  Min,
  IsArray,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ShopItemType } from '@prisma/client';
import { PhotoDto } from './create-shop-item.dto';

export class UpdateShopItemDto {
  @IsOptional()
  @IsString()
  @MaxLength(100)
  title?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  description?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PhotoDto)
  photos?: PhotoDto[];

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
