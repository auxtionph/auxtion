import { IsString, IsInt, Min } from 'class-validator';

export class CreateOfferDto {
  @IsString()
  itemId: string;

  @IsInt()
  @Min(1)
  amount: number; // centavos
}
