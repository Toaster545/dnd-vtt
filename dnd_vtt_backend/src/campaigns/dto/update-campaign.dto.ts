import { IsString, IsOptional } from 'class-validator';

export class UpdateCampaignDto {
  @IsString() @IsOptional() description?: string;
  @IsOptional() background_url?: string | null;
}
