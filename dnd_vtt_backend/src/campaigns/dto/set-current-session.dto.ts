import { IsOptional, IsString } from 'class-validator';

export class SetCurrentSessionDto {
  // null clears the campaign's current session.
  @IsString() @IsOptional() session_id: string | null;
}
