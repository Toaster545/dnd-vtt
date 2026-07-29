import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../../environments/environment';
import { Note, NoteEntityType, NoteVisibility } from '../models/notes.model';

const API = environment.apiUrl;

@Injectable({ providedIn: 'root' })
export class NotesService {
  private http = inject(HttpClient);

  list(entityType: NoteEntityType, entityId: string): Promise<Note[]> {
    return firstValueFrom(
      this.http.get<Note[]>(`${API}/notes`, { params: { entityType, entityId } }),
    );
  }

  create(entityType: NoteEntityType, entityId: string, content: string, visibility?: NoteVisibility): Promise<Note> {
    return firstValueFrom(this.http.post<Note>(`${API}/notes`, { entityType, entityId, content, visibility }));
  }

  update(id: string, content: string): Promise<Note> {
    return firstValueFrom(this.http.put<Note>(`${API}/notes/${id}`, { content }));
  }

  remove(id: string): Promise<void> {
    return firstValueFrom(this.http.delete<void>(`${API}/notes/${id}`));
  }
}
