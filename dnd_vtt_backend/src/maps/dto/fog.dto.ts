import { Type } from 'class-transformer';
import { IsArray, IsBoolean, IsInt, ValidateNested } from 'class-validator';

export class FogCellDto {
  @IsInt() col: number;
  @IsInt() row: number;
}

export class PaintFogDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => FogCellDto)
  cells: FogCellDto[];

  // true un-hides the painted cells, false hides them.
  @IsBoolean() revealed: boolean;
}
