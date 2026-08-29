import {
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import type { WikiVisibility } from './create-wiki-page.dto';

export class UpdateWikiPageDto {
  @IsString() @IsNotEmpty() @MaxLength(200) @IsOptional() title?: string;
  @IsString() @IsOptional() @MaxLength(500) folder?: string;
  @IsString() @IsOptional() body?: string;
  @IsIn(['shared', 'dm_only']) @IsOptional() visibility?: WikiVisibility;
  /**
   * The `updated_at` the client last saw. When present and stale, the update is rejected with
   * 409 so a second editor doesn't silently clobber the first. Omit to force-write.
   */
  @IsString() @IsOptional() expectedUpdatedAt?: string;
}
