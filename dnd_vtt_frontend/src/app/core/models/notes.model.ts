export type NoteEntityType = 'campaign' | 'session' | 'encounter';
export type NoteVisibility = 'shared' | 'dm_only';

export interface Note {
  id: string;
  entity_type: NoteEntityType;
  entity_id: string;
  author_id: string;
  username: string;
  visibility: NoteVisibility;
  content: string;
  created_at: string;
  updated_at: string;
}
