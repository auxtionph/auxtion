import { IsArray, IsString } from 'class-validator';

export class ReorderQueueDto {
  @IsArray()
  @IsString({ each: true })
  itemIds: string[]; // ordered list of item IDs
}
