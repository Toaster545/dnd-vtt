import { Component, inject, input, effect, signal, computed } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { NotesService } from '../../../core/services/notes.service';
import { AuthService } from '../../../core/services/auth.service';
import { ConfirmService } from '../../confirm.service';
import { Note, NoteEntityType, NoteVisibility } from '../../../core/models/notes.model';

// Identical in every place it's used (campaign/session/encounter, DM and player) — the one
// genuinely shared component in the app rather than the usual copy-per-feature pattern, since
// there's no per-context variation beyond which entity it's pointed at.
@Component({
  selector: 'app-notes-panel',
  imports: [FormsModule, MatIconModule, MatTooltipModule],
  templateUrl: './notes-panel.html',
})
export class NotesPanelComponent {
  private notesService = inject(NotesService);
  private confirm = inject(ConfirmService);
  auth = inject(AuthService);

  readonly entityType = input.required<NoteEntityType>();
  readonly entityId = input.required<string>();

  notes = signal<Note[]>([]);
  loading = signal(true);
  posting = signal(false);

  newContent = '';
  newVisibility: NoteVisibility = 'shared';

  editingId = signal<string | null>(null);
  editContent = '';

  currentUserId = computed(() => this.auth.profile()?.id);

  constructor() {
    effect(() => {
      const type = this.entityType();
      const id = this.entityId();
      if (type && id) void this.load(type, id);
    });
  }

  private async load(type: NoteEntityType, id: string) {
    this.loading.set(true);
    try {
      this.notes.set(await this.notesService.list(type, id));
    } finally {
      this.loading.set(false);
    }
  }

  canEdit(note: Note): boolean {
    return note.author_id === this.currentUserId() || this.auth.isAdmin();
  }

  async post() {
    if (!this.newContent.trim()) return;
    this.posting.set(true);
    try {
      const visibility = this.auth.isAdmin() ? this.newVisibility : undefined;
      await this.notesService.create(this.entityType(), this.entityId(), this.newContent.trim(), visibility);
      this.newContent = '';
      this.newVisibility = 'shared';
      await this.load(this.entityType(), this.entityId());
    } finally {
      this.posting.set(false);
    }
  }

  startEdit(note: Note) {
    this.editingId.set(note.id);
    this.editContent = note.content;
  }

  cancelEdit() {
    this.editingId.set(null);
    this.editContent = '';
  }

  async saveEdit(note: Note) {
    if (!this.editContent.trim()) return;
    await this.notesService.update(note.id, this.editContent.trim());
    this.cancelEdit();
    await this.load(this.entityType(), this.entityId());
  }

  async remove(note: Note) {
    if (!(await this.confirm.confirm('Delete this note? This cannot be undone.', 'Delete Note'))) return;
    await this.notesService.remove(note.id);
    await this.load(this.entityType(), this.entityId());
  }

  formatDate(iso: string): string {
    return new Date(iso).toLocaleString(undefined, {
      year: 'numeric', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
    });
  }
}
