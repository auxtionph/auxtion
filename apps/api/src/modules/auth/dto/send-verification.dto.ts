import { IsString } from 'class-validator';

export class SendVerificationDto {
  @IsString()
  userId: string;
}
