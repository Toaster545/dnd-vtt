import { Component, input, output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';

export interface StatBlockEntry { name: string; description: string; }

// Renders/edits one repeatable list of {name, description} entries — traits, actions,
// reactions, and legendary actions all share this exact shape in the monster JSON schema.
@Component({
  selector: 'app-monster-entry-list',
  imports: [FormsModule, MatIconModule],
  templateUrl: './entry-list.html',
})
export class EntryListComponent {
  readonly title       = input.required<string>();
  readonly placeholder = input('');
  readonly required    = input(false);
  readonly entries     = input.required<StatBlockEntry[]>();
  readonly entriesChange = output<StatBlockEntry[]>();

  add() {
    this.entriesChange.emit([...this.entries(), { name: '', description: '' }]);
  }
  remove(i: number) {
    this.entriesChange.emit(this.entries().filter((_, idx) => idx !== i));
  }
  update(i: number, patch: Partial<StatBlockEntry>) {
    this.entriesChange.emit(this.entries().map((e, idx) => (idx === i ? { ...e, ...patch } : e)));
  }
}
