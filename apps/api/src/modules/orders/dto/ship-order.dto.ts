import { IsEnum, IsString, MinLength } from 'class-validator';
import { Courier } from '@prisma/client';

export class ShipOrderDto {
  @IsEnum(Courier)
  courier: Courier;

  @IsString()
  @MinLength(6)
  trackingNumber: string;
}
