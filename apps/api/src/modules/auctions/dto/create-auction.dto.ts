import {
  IsString,
  IsDateString,
  IsOptional,
  IsUrl,
  MinLength,
  MaxLength,
} from 'class-validator';

export class CreateAuctionDto {
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  title!: string;

  @IsDateString()
  startTime!: string;

  @IsOptional()
  @IsString()
  coverImageUrl?: string;
}
