import { Component, inject, signal, OnInit } from '@angular/core';
import { RouterLink } from '@angular/router';
import { MatDialog } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { CharacterService } from '../../../core/services/character.service';
import { Character } from '../../../core/models/character.model';
import { ConfirmService } from '../../../shared/confirm.service';
import { CharacterDisplayComponent } from '../../../shared/character-display/character-display';

const CHAR_VIEWED_KEY = 'dnd-char-viewed';
function sortByRecentlyViewed<T extends { id?: string }>(chars: T[]): T[] {
  const views: Record<string, number> = JSON.parse(localStorage.getItem(CHAR_VIEWED_KEY) ?? '{}');
  return [...chars].sort((a, b) => (views[b.id!] ?? 0) - (views[a.id!] ?? 0));
}

@Component({
  selector: 'app-character-list',
  imports: [RouterLink, MatIconModule, MatTooltipModule],
  templateUrl: './character-list.html',
  styleUrl: './character-list.scss',
})
export class CharacterListComponent implements OnInit {
  private characterService = inject(CharacterService);
  private confirm = inject(ConfirmService);
  private dialog = inject(MatDialog);

  characters = signal<Character[]>([]);
  loading = signal(true);
  error = signal<string | null>(null);

  async ngOnInit() {
    try {
      this.characters.set(sortByRecentlyViewed(await this.characterService.getMyCharacters()));
    } catch (e: any) {
      this.error.set(e.message);
    } finally {
      this.loading.set(false);
    }
  }

  viewSheet(char: Character) {
    this.dialog.open(CharacterDisplayComponent, {
      data: { character: char },
      maxWidth: '860px',
      width: '95vw',
      maxHeight: '92vh',
      panelClass: 'char-sheet-dialog',
    });
  }

  async delete(id: string) {
    const char = this.characters().find(c => c.id === id);
    if (!await this.confirm.confirm(`Delete "${char?.name ?? 'this character'}"? This cannot be undone.`, 'Delete Character')) return;
    await this.characterService.deleteCharacter(id);
    this.characters.update(chars => chars.filter(c => c.id !== id));
  }
}
