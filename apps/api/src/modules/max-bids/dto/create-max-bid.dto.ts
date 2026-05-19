import { IsString, IsInt, Min } from 'class-validator';

export class CreateMaxBidDto {
  @IsString()
  auctionId: string;

  @IsString()
  itemId: string;

  @IsInt()
  @Min(1)
  amount: number;
}
