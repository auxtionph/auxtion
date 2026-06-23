import { IsString, MinLength, MaxLength, Matches, IsIn, IsOptional } from 'class-validator';

const VALID_ID_TYPES = [
  "Driver's License",
  'PhilSys National ID',
  'Passport',
  'SSS ID',
  'UMID',
  "Voter's ID",
  'PRC ID',
] as const;

export class CreateApplicationDto {
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  fullName: string;

  @IsString()
  idImageUrl: string;

  @IsOptional()
  @IsString()
  idImagePublicId?: string;

  @IsIn(VALID_ID_TYPES)
  idType: string;

  @IsString()
  @MinLength(4)
  @MaxLength(30)
  idNumber: string;

  @Matches(/^(09|\+639)\d{9}$/, {
    message: 'Phone must be a valid PH number',
  })
  contactNo: string;

  @IsString()
  @MinLength(20)
  @MaxLength(500)
  description: string;

  @IsString()
  @MinLength(5)
  @MaxLength(200)
  payoutInfo: string;
}
