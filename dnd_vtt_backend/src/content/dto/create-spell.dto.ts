import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';

export class SpellSubclassRefDto {
  @IsString() @IsNotEmpty() class: string;
  @IsString() @IsNotEmpty() subclass: string;
  @IsString() @IsOptional() variant?: string;
}

export class SpellScalingDto {
  @IsString() @IsNotEmpty() label: string;
  @IsObject() values: Record<string, string>;
}

export class SpellMechanicsDto {
  @IsArray() @IsString({ each: true }) @IsOptional() spell_attacks?: string[];
  @IsArray() @IsString({ each: true }) @IsOptional() saving_throws?: string[];
  @IsArray() @IsString({ each: true }) @IsOptional() ability_checks?: string[];
  @IsArray() @IsString({ each: true }) @IsOptional() damage_types?: string[];
  @IsArray() @IsString({ each: true }) @IsOptional() conditions?: string[];
  @IsArray() @IsString({ each: true }) @IsOptional() affects_creature_types?: string[];
  @IsArray() @IsString({ each: true }) @IsOptional() grants_damage_immunities?: string[];
  @IsArray() @IsString({ each: true }) @IsOptional() grants_damage_resistances?: string[];
  @IsArray() @IsString({ each: true }) @IsOptional() grants_damage_vulnerabilities?: string[];
  @IsArray() @IsString({ each: true }) @IsOptional() grants_condition_immunities?: string[];
  @IsArray() @IsString({ each: true }) @IsOptional() area_tags?: string[];
  @IsArray() @IsString({ each: true }) @IsOptional() misc_tags?: string[];
  @ValidateNested() @Type(() => SpellScalingDto) @IsOptional() scaling?: SpellScalingDto;
}

export class SpellSourceDto {
  @IsString() @IsOptional() book?: string;
  @IsNumber() @IsOptional() edition?: number;
  @IsString() @IsOptional() code?: string;
  @IsNumber() @IsOptional() page?: number;
  @IsBoolean() @IsOptional() srd_5_2_1?: boolean;
  @IsString() @IsOptional() srd_name?: string;
  @IsString() @IsOptional() rules_text?: string;
}

export class CreateSpellDto {
  @IsString() @IsNotEmpty() name: string;
  @IsInt() @Min(0) @Max(9) level: number;
  @IsString() @IsNotEmpty() school: string;
  @IsString() @IsNotEmpty() casting_time: string;
  @IsString() @IsNotEmpty() range: string;
  @IsArray() @IsString({ each: true }) components: string[];
  @IsString() @IsOptional() material?: string;
  @IsNumber() @IsOptional() material_cost_cp?: number;
  @IsBoolean() @IsOptional() material_consumed?: boolean;
  @IsString() @IsNotEmpty() duration: string;
  @IsBoolean() ritual: boolean;
  @IsBoolean() concentration: boolean;

  @IsArray() @IsString({ each: true }) classes: string[];
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SpellSubclassRefDto)
  @IsOptional()
  subclasses?: SpellSubclassRefDto[];
  @IsArray() @IsString({ each: true }) @IsOptional() species?: string[];
  @IsArray() @IsString({ each: true }) @IsOptional() backgrounds?: string[];
  @IsArray() @IsString({ each: true }) @IsOptional() feats?: string[];
  @IsArray() @IsString({ each: true }) @IsOptional() other_options?: string[];

  @ValidateNested() @Type(() => SpellMechanicsDto) @IsOptional() mechanics?: SpellMechanicsDto;

  @IsString() @IsNotEmpty() description: string;
  @IsString() @IsOptional() higher_levels?: string;
  @IsString() @IsOptional() cantrip_upgrade?: string;

  @ValidateNested() @Type(() => SpellSourceDto) @IsOptional() source?: SpellSourceDto;
}
