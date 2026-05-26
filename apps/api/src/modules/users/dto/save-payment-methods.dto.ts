import { IsString, IsOptional, MaxLength } from 'class-validator';

export class SavePaymentMethodsDto {
  @IsOptional()
  @IsString()
  @MaxLength(20)
  gcashNumber?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  gcashName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  bankName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  bankAccountNumber?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  bankAccountName?: string;
}
