import {
  IsBoolean,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
} from 'class-validator';

export const INVENTORY_ACTIONS = [
  'equip',
  'attune',
  'unattune',
  'repair',
  'use',
  'recover',
  'transfer',
  'remove',
] as const;

export class InventoryOperationDto {
  @IsIn(INVENTORY_ACTIONS) action: (typeof INVENTORY_ACTIONS)[number];
  @IsBoolean() @IsOptional() equipped?: boolean;
  @IsString() @IsOptional() baseItemIndex?: string;
  @IsNumber() @IsOptional() amount?: number;
  @IsBoolean() @IsOptional() replaceConcentration?: boolean;
  @IsString() @IsOptional() event?: string;
  @IsString() @IsOptional() targetId?: string;
}
