import { Type } from 'class-transformer';
import {
  IsArray,
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
}
