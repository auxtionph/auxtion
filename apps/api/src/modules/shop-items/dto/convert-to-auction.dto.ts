import { IsInt, Min } from 'class-validator';

export class ConvertToAuctionDto {
  // Centavos. Guards against undefined/negative/NaN reaching price math
  // (e.g. Math.round(undefined * 0.7) → NaN minimumOffer).
  @IsInt()
  @Min(1)
  startingPrice: number;
}
