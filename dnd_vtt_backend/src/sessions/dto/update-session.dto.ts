import { IsString, IsOptional } from 'class-validator';

export class UpdateSessionDto {
  @IsString() @IsOptional() description?: string;
  @IsOptional() background_url?: string | null;
}
