import { IsInt, IsNotEmpty, IsOptional, IsString, Min } from 'class-validator';

export class GrantItemDto {
  @IsString() @IsNotEmpty() itemIndex: string;
  @IsInt() @Min(1) @IsOptional() quantity?: number;
}

export class RevokeItemDto {
  @IsString() @IsNotEmpty() itemIndex: string;
  // Omitted removes the whole stack.
  @IsInt() @Min(1) @IsOptional() quantity?: number;
}
