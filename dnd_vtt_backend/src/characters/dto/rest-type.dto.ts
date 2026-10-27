import { IsIn, IsInt, IsOptional, Min } from 'class-validator';

const REST_TYPES = ['short_rest', 'long_rest'] as const;

// POST :id/spell-rest
export class SpellRestDto {
  @IsIn(REST_TYPES) type: (typeof REST_TYPES)[number];
}

// POST :id/life-rest — the Hit Dice fields only apply to a short rest.
export class LifeRestDto extends SpellRestDto {
  @IsInt() @Min(0) @IsOptional() hitDiceUsed?: number;
  @IsInt() @Min(0) @IsOptional() healed?: number;
}
