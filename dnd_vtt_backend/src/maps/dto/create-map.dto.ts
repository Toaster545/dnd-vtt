import { IsInt, IsNotEmpty, IsOptional, IsString, Min } from 'class-validator';

export class CreateMapDto {
  @IsString() @IsOptional() campaign_id?: string;
  @IsString() @IsNotEmpty() name: string;
  @IsString() @IsNotEmpty() image_url: string;
  @IsInt() @Min(1) @IsOptional() grid_size?: number;
}
