import { IsBoolean } from 'class-validator';

export class SetRaceClassVisibilityDto {
  @IsBoolean() visible: boolean;
}
