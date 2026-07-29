import { IsString, IsNotEmpty, IsOptional } from 'class-validator';

export class CreateCampaignDto {
  @IsString() @IsNotEmpty() name: string;
  @IsString() @IsOptional() description?: string;
}
