import { Component, inject, signal, OnInit } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { CharacterService } from '../../../core/services/character.service';
import { Character } from '../../../core/models/character.model';
import { CharacterPlaySheetComponent } from './character-play-sheet/character-play-sheet';

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

@Component({
  selector: 'app-dm-play',
  imports: [MatIconModule, CharacterPlaySheetComponent],
  templateUrl: './dm-play.html',
  styleUrl: './dm-play.scss',
})
export class DmPlayComponent implements OnInit {
  private characterService = inject(CharacterService);

  characters        = signal<Character[]>([]);
  selectedCharacter  = signal<Character | null>(null);
  loadingCharacters  = signal(true);

  async ngOnInit() {
    try {
      this.characters.set(sortByRecentlyViewed(await this.characterService.getMyCharacters()));
    } finally {
      this.loadingCharacters.set(false);
    }
  }

  openCharacter(character: Character) {
    if (character.id) markCharacterViewed(character.id);
    this.characters.set(sortByRecentlyViewed(this.characters()));
    this.selectedCharacter.set(character);
  }

  backToCharacterList() {
    this.selectedCharacter.set(null);
  }

  onCharacterSaved(character: Character) {
    this.selectedCharacter.set(character);
    this.characters.update(list => list.map(c => c.id === character.id ? character : c));
  }

  classLabel(c: Character): string {
    return c.subclass ? `${c.subclass} (${c.class})` : c.class;
  }
}
