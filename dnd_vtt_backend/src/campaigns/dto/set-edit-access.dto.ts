import { IsBoolean } from 'class-validator';

export class SetEditAccessDto {
  @IsBoolean() unlocked: boolean;
}
