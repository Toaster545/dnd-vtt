import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsNumber,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';

// The DB stores these flags as 0/1 and the API echoes them back raw, so a client resending a
// token it just read sends numbers; normalise before the boolean check.
const toBoolean = ({ value }: { value: unknown }) =>
  value === 0 ? false : value === 1 ? true : value;

// A token create/update. The client resends the whole token on edit, so every field is optional
// and `null` is accepted wherever the column is nullable. Server-owned columns (`map_id`,
// planned_x/y, ...) are not declared and get stripped by the whitelist.
export class UpsertTokenDto {
  @IsString() @IsOptional() id?: string;
  @IsString() @IsOptional() label?: string;
  @IsString() @IsOptional() color?: string;
  @IsNumber() @IsOptional() x?: number;
  @IsNumber() @IsOptional() y?: number;
  @IsNumber() @Min(0) @IsOptional() size?: number;
  @IsNumber() @IsOptional() hp?: number | null;
  @IsNumber() @IsOptional() max_hp?: number | null;
  @Transform(toBoolean) @IsBoolean() @IsOptional() is_player?: boolean;
  @IsString() @IsOptional() character_id?: string | null;
  @IsString() @IsOptional() monster_index?: string | null;
  @IsString() @IsOptional() companion_id?: string | null;
  @IsNumber() @IsOptional() initiative?: number | null;
  @Transform(toBoolean) @IsBoolean() @IsOptional() visible_to_players?: boolean;
  @Transform(toBoolean)
  @IsBoolean()
  @IsOptional()
  name_visible_to_players?: boolean;
}
