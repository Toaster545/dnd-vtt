import { IsInt, Max, Min } from 'class-validator';

export class SetPartyLevelDto {
  @IsInt()
  @Min(1)
  @Max(20)
  level: number;
}
