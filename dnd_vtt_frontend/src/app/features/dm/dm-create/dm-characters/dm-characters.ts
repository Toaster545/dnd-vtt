import { Component, inject, signal, OnInit } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';

const CHAR_VIEWED_KEY = 'dnd-char-viewed';
function markCharacterViewed(id: string) {
  const views: Record<string, number> = JSON.parse(localStorage.getItem(CHAR_VIEWED_KEY) ?? '{}');
  views[id] = Date.now();
  localStorage.setItem(CHAR_VIEWED_KEY, JSON.stringify(views));
}
function sortByRecentlyViewed<T extends { id?: string }>(chars: T[]): T[] {
  const views: Record<string, number> = JSON.parse(localStorage.getItem(CHAR_VIEWED_KEY) ?? '{}');
  return [...chars].sort((a, b) => (views[b.id!] ?? 0) - (views[a.id!] ?? 0));
}
import { MatTooltipModule } from '@angular/material/tooltip';
import { CharacterService } from '../../../../core/services/character.service';
import { Character } from '../../../../core/models/character.model';
import { CharacterWizardComponent } from '../character-wizard/character-wizard';
import { ConfirmService } from '../../../../shared/confirm.service';

@Component({
  selector: 'app-dm-characters',
  imports: [CharacterWizardComponent, MatIconModule, MatTooltipModule],
  templateUrl: './dm-characters.html',
  styleUrl: './dm-characters.scss',
})
export class DmCharactersComponent implements OnInit {
  private characterService = inject(CharacterService);
  private confirm = inject(ConfirmService);

  characters = signal<Character[]>([]);
  editingCharacter = signal<Character | null>(null);
  showWizard = signal(false);

  async ngOnInit() { await this.load(); }
  private async load() { this.characters.set(sortByRecentlyViewed(await this.characterService.getMyCharacters())); }

  openCreate() { this.editingCharacter.set(null); this.showWizard.set(true); }
  openEdit(character: Character) {
    if (character.id) markCharacterViewed(character.id);
    this.editingCharacter.set(character);
    this.showWizard.set(true);
  }
  async onSaved() { this.showWizard.set(false); await this.load(); }
  onCancelled() { this.showWizard.set(false); this.load(); }

  async deleteCharacter(id: string) {
    const char = this.characters().find(c => c.id === id);
    const name = char?.name ?? 'this character';
    if (!await this.confirm.confirm(`Delete "${name}"? This cannot be undone.`, 'Delete Character')) return;
    await this.characterService.deleteCharacter(id);
    await this.load();
  }

  classLabel(c: Character): string {
    return c.subclass ? `${c.subclass} (${c.class})` : c.class;
  }
}
