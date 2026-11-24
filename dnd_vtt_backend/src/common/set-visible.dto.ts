import { IsBoolean } from 'class-validator';

export class SetVisibleDto {
  @IsBoolean() visible: boolean;
}
