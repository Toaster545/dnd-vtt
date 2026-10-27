import {
  IsBoolean,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
} from 'class-validator';

export class CastSpellDto {
  @IsString() @IsNotEmpty() spellIndex: string;
  @IsString() @IsNotEmpty() sourceKey: string;
  @IsIn(['cantrip', 'slot', 'pact', 'restricted', 'free'])
  method: 'cantrip' | 'slot' | 'pact' | 'restricted' | 'free';

  // slot / pact / restricted
  @IsString() @IsOptional() poolKey?: string;
  @IsInt() @IsOptional() slotLevel?: number;

  // free
  @IsString() @IsOptional() freeCastKey?: string;
  @IsInt() @IsOptional() maxUses?: number;
  @IsIn(['short_rest', 'long_rest']) @IsOptional() recovery?:
    'short_rest' | 'long_rest' | null;
  @IsBoolean() @IsOptional() atWill?: boolean;

  @IsBoolean() @IsOptional() replaceConcentration?: boolean;
}
