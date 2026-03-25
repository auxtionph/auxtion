import {
  IsString,
  IsOptional,
  MinLength,
  MaxLength,
  Matches,
  IsUrl,
} from 'class-validator';

export class UpdateProfileDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(50)
  displayName?: string;

  @IsOptional()
  @Matches(/^(09|\+639)\d{9}$/, {
    message: 'Phone must be a valid PH number (09XXXXXXXXX or +639XXXXXXXXX)',
  })
  phone?: string;

  @IsOptional()
  @IsUrl()
  avatarUrl?: string;
}
