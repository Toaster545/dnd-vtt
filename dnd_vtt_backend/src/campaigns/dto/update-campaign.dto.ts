import { IsArray, IsString, IsOptional } from 'class-validator';

export class UpdateCampaignDto {
  @IsString() @IsOptional() description?: string;
  @IsOptional() background_url?: string | null;
  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  allowed_sources?: string[];
}
