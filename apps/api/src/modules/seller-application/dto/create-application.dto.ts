import { IsString, MinLength, MaxLength, Matches } from 'class-validator';

export class CreateApplicationDto {
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  fullName: string;

  @IsString()
  idImageUrl: string;

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
