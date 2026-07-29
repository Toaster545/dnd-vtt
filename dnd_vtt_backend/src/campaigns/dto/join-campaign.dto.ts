import { IsString, IsNotEmpty } from 'class-validator';

export class JoinCampaignDto {
  @IsString() @IsNotEmpty() joinCode: string;
  @IsString() @IsNotEmpty() characterId: string;
}
