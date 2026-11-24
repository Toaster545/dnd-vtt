import { IsInt, IsNotEmpty, IsString, Matches, Min } from 'class-validator';

export class SetTokenColorDto {
  @Matches(/^#[0-9a-fA-F]{6}$/, {
    message: 'color must be a hex string like #a1b2c3',
  })
  color: string;
}

// A planned move destination, in grid squares.
export class SetTokenPlanDto {
  @IsInt() @Min(0) x: number;
  @IsInt() @Min(0) y: number;
}

export class MoveTokenDto {
  @IsString() @IsNotEmpty() target_map_id: string;
}
