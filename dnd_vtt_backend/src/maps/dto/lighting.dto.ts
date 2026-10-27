import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';

export class WallDto {
  @IsNumber() x1: number;
  @IsNumber() y1: number;
  @IsNumber() x2: number;
  @IsNumber() y2: number;
}

// The wall tool resends the full set on every edit; the service enforces the per-map cap.
export class SetWallsDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => WallDto)
  walls: WallDto[];
}

export class SetAmbientLightDto {
  @IsNumber() @Min(0) @Max(100) level: number;
  @Matches(/^#[0-9a-f]{6}$/i, { message: 'color must be a hex color' })
  color: string;
}

export class UpsertLightDto {
  @IsString() @IsOptional() id?: string;
  // Set for a light carried by a token; its x/y are then ignored.
  @IsString() @IsOptional() token_id?: string | null;
  @IsNumber() @IsOptional() x?: number | null;
  @IsNumber() @IsOptional() y?: number | null;
  @IsNumber() @Min(0) @IsOptional() bright_radius_ft?: number;
  @IsNumber() @Min(0) @IsOptional() dim_radius_ft?: number;
  @IsString() @IsOptional() color?: string;
  @IsBoolean() @IsOptional() enabled?: boolean;
  @IsString() @IsOptional() label?: string;
}
