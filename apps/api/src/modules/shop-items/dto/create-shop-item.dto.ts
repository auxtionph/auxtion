import {
  IsString,
  IsInt,
  IsEnum,
  IsOptional,
  MinLength,
  MaxLength,
  Min,
  IsArray,
  ValidateNested,
  IsNumber,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ShopItemType } from '@prisma/client';

export class PhotoDto {
  @IsString()
  url: string;

  @IsString()
  publicId: string;

  @IsOptional()
  @IsNumber()
  width?: number;

  @IsOptional()
  @IsNumber()
  height?: number;
}

export class CreateShopItemDto {
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  title: string;

  @IsString()
  @MinLength(1)
  @MaxLength(1000)
  description: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PhotoDto)
  photos?: PhotoDto[];

  @IsInt()
  @Min(1)
  price: number; // centavos

  @IsEnum(ShopItemType)
  type: ShopItemType;

  @IsOptional()
  @IsInt()
  queueOrder?: number;
}