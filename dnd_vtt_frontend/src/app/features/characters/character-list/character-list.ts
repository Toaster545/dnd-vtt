import { Component, inject, signal, OnInit } from '@angular/core';
import { RouterLink } from '@angular/router';
import { CharacterService } from '../../../core/services/character.service';
import { Character } from '../../../core/models/character.model';

@Component({
  selector: 'app-character-list',
  imports: [RouterLink],
  templateUrl: './character-list.html',
  styleUrl: './character-list.scss',
})
export class CharacterListComponent implements OnInit {
  private characterService = inject(CharacterService);

  characters = signal<Character[]>([]);
  loading = signal(true);
  error = signal<string | null>(null);

  async ngOnInit() {
    try {
      this.characters.set(await this.characterService.getMyCharacters());
    } catch (e: any) {
      this.error.set(e.message);
    } finally {
      this.loading.set(false);
    }
  }

  async delete(id: string) {
    if (!confirm('Delete this character?')) return;
    await this.characterService.deleteCharacter(id);
    this.characters.update(chars => chars.filter(c => c.id !== id));
  }
}
