import { IsBoolean } from 'class-validator';

export class SetPartyVisibilityDto {
  @IsBoolean() visible: boolean;
}
