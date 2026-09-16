import { IsNotEmpty, IsString } from 'class-validator';

export class SetItemImageOverrideDto {
  @IsString() @IsNotEmpty() image_url: string;
}
