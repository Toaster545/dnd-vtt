import { Component, inject, signal, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { SessionService } from '../../../core/services/session.service';
import { Session } from '../../../core/models/session.model';
import { DmCharactersComponent } from './dm-characters/dm-characters';
import { ConfirmService } from '../../../shared/confirm.service';

type CreateSection = 'sessions' | 'encounters' | 'characters';

@Component({
  selector: 'app-dm-create',
  imports: [FormsModule, MatIconModule, MatTooltipModule, DmCharactersComponent],
  templateUrl: './dm-create.html',
  styleUrl: './dm-create.scss',
})
export class DmCreateComponent implements OnInit {
  private sessionService = inject(SessionService);
  private confirm = inject(ConfirmService);

  activeSection = signal<CreateSection>('characters');
  sessions = signal<Session[]>([]);
  showForm = signal(false);
  saving = signal(false);
  newName = '';
  newDescription = '';

  async ngOnInit() { await this.load(); }
  private async load() { this.sessions.set(await this.sessionService.getAll()); }

  async createSession() {
    if (!this.newName.trim()) return;
    this.saving.set(true);
    try {
      await this.sessionService.create(this.newName.trim(), this.newDescription.trim());
      this.newName = '';
      this.newDescription = '';
      this.showForm.set(false);
      await this.load();
    } finally { this.saving.set(false); }
  }

  async deleteSession(id: string) {
    const session = this.sessions().find(s => s.id === id);
    const name = session?.name ?? 'this session';
    if (!await this.confirm.confirm(`Delete "${name}"? This cannot be undone.`, 'Delete Session')) return;
    await this.sessionService.remove(id);
    await this.load();
  }

  formatDate(iso: string): string {
    return new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
  }
}
