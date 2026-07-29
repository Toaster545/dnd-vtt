import { IsString, IsNotEmpty, IsOptional, IsArray } from 'class-validator';

export class CreateEncounterDto {
  @IsString() @IsNotEmpty() name: string;
  @IsString() @IsNotEmpty() session_id: string;
  @IsString() @IsOptional() map_id?: string;
  @IsArray() @IsOptional() monsters?: string[];
  @IsArray() @IsOptional() character_ids?: string[];
}
