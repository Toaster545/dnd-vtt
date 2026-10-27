import {
  IsArray,
  IsBoolean,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
} from 'class-validator';

export class CreateCompanionDto {
  @IsString() @IsNotEmpty() kind: string;
  @IsString() @IsNotEmpty() form: string;
  @IsString() @IsOptional() name?: string;
}

// One endpoint, many actions (see CompanionsService.update): which of the optional fields
// matter depends on `action`, and the service validates those combinations. `revision` is the
// optimistic-concurrency token from the last read.
export class UpdateCompanionDto {
  @IsString() @IsNotEmpty() action: string;
  @IsNumber() revision: number;

  @IsString() @IsOptional() name?: string;
  @IsString() @IsOptional() portrait_image?: string | null;
  @IsNumber() @IsOptional() amount?: number;
  @IsArray() @IsString({ each: true }) @IsOptional() conditions?: string[];
  @IsString() @IsOptional() form?: string;
  @IsNumber() @IsOptional() slotLevel?: number;
  @IsString() @IsOptional() poolKey?: string;
  @IsString() @IsOptional() command?: string;
  @IsString() @IsOptional() cost?: string;
  @IsString() @IsOptional() key?: string;
  @IsBoolean() @IsOptional() bonus?: boolean;
  @IsString() @IsOptional() target?: string;
  @IsString() @IsOptional() field?: string;
  @IsNumber() @IsOptional() hitDice?: number;
}
