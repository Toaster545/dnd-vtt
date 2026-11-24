import {
  IsArray,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
} from 'class-validator';

export class UpdateEncounterDto {
  @IsString() @IsOptional() name?: string;
  @IsString() @IsOptional() summary?: string;
  // Legacy single-map callers; map_ids supersedes it. null clears the entry level.
  @IsString() @IsOptional() map_id?: string | null;
  @IsArray() @IsString({ each: true }) @IsOptional() map_ids?: string[];
  @IsObject() @IsOptional() level_names?: Record<string, string>;
  @IsArray() @IsOptional() monsters?: string[];
  @IsArray() @IsOptional() character_ids?: string[];
}

export class SetPlayerLevelDto {
  @IsString() @IsNotEmpty() map_id: string;
}
