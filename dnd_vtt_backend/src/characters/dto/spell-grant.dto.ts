import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class GrantSpellDto {
  @IsString() @IsNotEmpty() spellIndex: string;
  @IsString() @IsOptional() sourceName?: string;
}

export class RevokeSpellDto {
  @IsString() @IsNotEmpty() spellIndex: string;
}
