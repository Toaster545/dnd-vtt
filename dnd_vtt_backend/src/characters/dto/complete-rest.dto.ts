import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  ValidateNested,
} from 'class-validator';

export class RestCreationDto {
  @IsString() @IsNotEmpty() planId: string;
  @IsString() @IsOptional() baseItemIndex?: string;
  @IsString() @IsOptional() itemIndex?: string;
  @IsBoolean() @IsOptional() attune?: boolean;
}

// Long Rest wrap-up for magic items (replicas, charge recovery). `requestId` makes retries
// idempotent, see InventoryService.rest.
export class CompleteRestDto {
  @IsString() @IsNotEmpty() @MaxLength(100) requestId: string;
  @IsBoolean() @IsOptional() correction?: boolean;
  @IsBoolean() @IsOptional() toolsConfirmed?: boolean;
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => RestCreationDto)
  @IsOptional()
  creations?: RestCreationDto[];
}
