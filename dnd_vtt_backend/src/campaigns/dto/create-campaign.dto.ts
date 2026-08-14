import { IsArray, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class CreateCampaignDto {
  @IsString() @IsNotEmpty() name: string;
  @IsString() @IsOptional() description?: string;
  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  allowed_sources?: string[];
}
