/* eslint-disable */
import { IsString, IsNotEmpty, IsBoolean, IsOptional, MaxLength } from 'class-validator';

export class CreateAddressDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(20)
  phone!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  line1!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  city!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  province!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(20)
  postalCode!: string;

  @IsBoolean()
  @IsOptional()
  isDefault?: boolean;
}