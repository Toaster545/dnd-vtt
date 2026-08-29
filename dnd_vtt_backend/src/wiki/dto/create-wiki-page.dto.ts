import {
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

export type WikiVisibility = 'shared' | 'dm_only';

export class CreateWikiPageDto {
  @IsString() @IsNotEmpty() campaignId: string;
  @IsString() @IsNotEmpty() @MaxLength(200) title: string;
  @IsString() @IsOptional() @MaxLength(500) folder?: string;
  @IsString() @IsOptional() body?: string;
  @IsIn(['shared', 'dm_only']) @IsOptional() visibility?: WikiVisibility;
}
