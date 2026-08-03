import { Type } from 'class-transformer';
import {
  IsArray,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  Matches,
  Min,
  ValidateNested,
} from 'class-validator';

export class MonsterSpeedDto {
  @IsInt() @Min(0) @IsOptional() walk?: number;
  @IsInt() @Min(0) @IsOptional() fly?: number;
  @IsInt() @Min(0) @IsOptional() swim?: number;
  @IsInt() @Min(0) @IsOptional() climb?: number;
  @IsInt() @Min(0) @IsOptional() burrow?: number;
}

export class MonsterAbilityScoresDto {
  @IsInt() @Min(1) strength: number;
  @IsInt() @Min(1) dexterity: number;
  @IsInt() @Min(1) constitution: number;
  @IsInt() @Min(1) intelligence: number;
  @IsInt() @Min(1) wisdom: number;
  @IsInt() @Min(1) charisma: number;
}

export class MonsterSensesDto {
  @IsInt() @Min(0) @IsOptional() darkvision?: number;
  @IsInt() @Min(0) @IsOptional() blindsight?: number;
  @IsInt() @Min(0) @IsOptional() truesight?: number;
  @IsInt() @Min(0) @IsOptional() tremorsense?: number;
  @IsInt() @Min(0) passive_perception: number;
}

export class MonsterEntryDto {
  @IsString() @IsNotEmpty() name: string;
  @IsString() @IsNotEmpty() description: string;
}

export class CreateMonsterDto {
  @IsString() @IsNotEmpty() name: string;
  @IsString() @IsNotEmpty() size: string;
  @IsString() @IsNotEmpty() type: string;
  @IsString() @IsNotEmpty() alignment: string;

  // Default token color, e.g. "#e74c3c" — set via a browser <input type="color">.
  @IsString()
  @IsOptional()
  @Matches(/^#[0-9a-fA-F]{6}$/, {
    message: 'color must be a hex value, e.g. "#e74c3c"',
  })
  color?: string;

  @IsInt() @Min(0) armor_class: number;
  @IsString() @IsOptional() armor_class_desc?: string;
  @IsInt() @Min(0) hit_points: number;
  @IsString() @IsNotEmpty() hit_dice: string;

  @ValidateNested() @Type(() => MonsterSpeedDto) speed: MonsterSpeedDto;
  @ValidateNested()
  @Type(() => MonsterAbilityScoresDto)
  ability_scores: MonsterAbilityScoresDto;

  @IsObject() @IsOptional() saving_throws?: Record<string, number>;
  @IsObject() @IsOptional() skills?: Record<string, number>;

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  damage_vulnerabilities?: string[];
  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  damage_resistances?: string[];
  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  damage_immunities?: string[];
  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  condition_immunities?: string[];

  @ValidateNested() @Type(() => MonsterSensesDto) senses: MonsterSensesDto;

  @IsArray() @IsString({ each: true }) languages: string[];

  @IsString() @IsNotEmpty() challenge_rating: string;
  @IsNumber() @Min(0) xp: number;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => MonsterEntryDto)
  @IsOptional()
  traits?: MonsterEntryDto[];
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => MonsterEntryDto)
  actions: MonsterEntryDto[];
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => MonsterEntryDto)
  @IsOptional()
  reactions?: MonsterEntryDto[];
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => MonsterEntryDto)
  @IsOptional()
  legendary_actions?: MonsterEntryDto[];

  @IsString() @IsOptional() description?: string;
}
