import { IsString, IsNotEmpty, MaxLength } from 'class-validator';

export class SaveAddressDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(20)
  phone!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  line1!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  city!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  province!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(20)
  postalCode!: string;
}
