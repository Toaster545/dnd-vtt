import { IsIn, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export type NoteEntityType = 'campaign' | 'session' | 'encounter';
export type NoteVisibility = 'shared' | 'dm_only';

export class CreateNoteDto {
  @IsIn(['campaign', 'session', 'encounter']) entityType: NoteEntityType;
  @IsString() @IsNotEmpty() entityId: string;
  @IsString() @IsNotEmpty() content: string;
  @IsIn(['shared', 'dm_only']) @IsOptional() visibility?: NoteVisibility;
}
