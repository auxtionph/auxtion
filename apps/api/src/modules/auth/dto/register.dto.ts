import {
  IsEmail,
  IsString,
  MinLength,
  MaxLength,
  IsOptional,
  Matches,
} from 'class-validator';

export class RegisterDto {
  @IsEmail()
  email: string;

  @IsString()
  @MinLength(8)
  @MaxLength(32)
  password: string;

  @IsString()
  @MinLength(2)
  @MaxLength(50)
  displayName: string;

  @IsOptional()
  @Matches(/^(09|\+639)\d{9}$/, {
    message: 'Phone must be a valid PH number (09XXXXXXXXX or +639XXXXXXXXX)',
  })
  phone?: string;
}
