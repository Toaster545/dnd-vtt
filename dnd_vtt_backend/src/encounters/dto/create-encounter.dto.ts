import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsArray,
  IsObject,
} from 'class-validator';

export class CreateEncounterDto {
  @IsString() @IsNotEmpty() name: string;
  @IsString() @IsNotEmpty() session_id: string;
  @IsString() @IsOptional() map_id?: string;
  // Ordered dungeon levels, entry level first — supersedes map_id when present.
  @IsArray() @IsString({ each: true }) @IsOptional() map_ids?: string[];
  // Level names keyed by map id, set alongside map_ids; a blank name shows the map's own name.
  @IsObject() @IsOptional() level_names?: Record<string, string>;
  @IsArray() @IsOptional() monsters?: string[];
  @IsArray() @IsOptional() character_ids?: string[];
}
