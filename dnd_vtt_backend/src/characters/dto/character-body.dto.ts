import {
  IsArray,
  IsBoolean,
  IsInt,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';

// Typed view of the fields the character endpoints rely on. The rest of the body is the
// character's JSON `data` blob, which is deliberately open-ended — this DTO is only ever used
// through ValidateOnlyPipe, so undeclared keys are passed through, not stripped.
export class CharacterBodyDto {
  @IsString() @IsOptional() name?: string;
  @IsString() @IsOptional() race?: string;
  @IsString() @IsOptional() class?: string;
  @IsInt() @Min(1) @Max(20) @IsOptional() level?: number;
  @IsInt() @IsOptional() draft_step?: number;

  @IsNumber() @IsOptional() current_hp?: number;
  @IsNumber() @IsOptional() max_hp?: number;
  @IsArray() @IsOptional() equipment?: unknown[];
  @IsArray() @IsOptional() classes?: unknown[];
  @IsArray() @IsOptional() spells?: unknown[];
  @IsObject() @IsOptional() currency?: Record<string, unknown>;
  @IsObject() @IsOptional() resource_uses?: Record<string, unknown>;
  @IsBoolean() @IsOptional() heroic_inspiration?: boolean;
}
