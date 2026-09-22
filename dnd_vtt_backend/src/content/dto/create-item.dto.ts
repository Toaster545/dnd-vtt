import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsIn,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';

export class ItemMasteryDto {
  @IsString() @IsNotEmpty() property: string;
  @IsString() @IsNotEmpty() description: string;
}

export class ItemChargesDto {
  @IsNumber() @Min(1) max: number;
  @IsString() @IsNotEmpty() recovery: string;
}

export class ItemActionDto {
  @IsString() @IsNotEmpty() key: string;
  @IsString() @IsNotEmpty() name: string;
  @IsString() @IsOptional() description?: string;
  @IsIn(['action', 'bonus_action', 'reaction', 'free']) activation: string;
}

export class CreateItemDto {
  @IsString() @IsNotEmpty() name: string;
  @IsString() @IsNotEmpty() type: string;
  @IsString() @IsNotEmpty() category: string;

  @IsString() @IsOptional() damage?: string | null;
  @IsString() @IsOptional() damage_type?: string | null;
  @IsString() @IsOptional() armor_class?: string;

  @IsArray() @IsString({ each: true }) properties: string[];

  @IsNumber() @Min(0) weight: number;
  @IsString() @IsNotEmpty() cost: string;
  @IsString() @IsNotEmpty() description: string;

  @ValidateNested()
  @Type(() => ItemMasteryDto)
  @IsOptional()
  mastery?: ItemMasteryDto;

  // Magic item properties — all optional so mundane gear is unaffected.
  @IsString() @IsOptional() rarity?: string;

  // Either a plain "yes" (boolean true) or a restriction like "by a cleric".
  @IsOptional() requires_attunement?: boolean | string;

  // The item's own +N (or cursed -N), applied to attack/damage rolls for a weapon and AC for
  // armor/a shield — structured so a "+1 Longsword" actually behaves like one instead of the
  // bonus living only in the item's display name.
  @IsNumber() @IsOptional() enhancement_bonus?: number;

  @ValidateNested()
  @Type(() => ItemChargesDto)
  @IsOptional()
  charges?: ItemChargesDto;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ItemActionDto)
  @IsOptional()
  actions?: ItemActionDto[];

  // Set only via POST items/:index/image — accepted here too so editing an item elsewhere
  // (which resends the full object) doesn't wipe out a previously uploaded image.
  @IsString() @IsOptional() image_url?: string;
}

// Wrapper for POST items/bulk — a JSON file the user authors/exports containing several items
// at once, validated per-item with the same rules as a single create.
export class CreateItemsBulkDto {
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CreateItemDto)
  items: CreateItemDto[];
}
