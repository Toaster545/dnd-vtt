import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../../environments/environment';
import { Character } from '../models/character.model';

const API = environment.apiUrl;

@Injectable({ providedIn: 'root' })
export class CharacterService {
  private http = inject(HttpClient);

  async getMyCharacters(): Promise<Character[]> {
    return firstValueFrom(this.http.get<Character[]>(`${API}/characters`));
  }

  // Per-campaign copies (campaign_id set), each with a `campaign_name` and `edit_unlocked`
  // (campaign_members.edit_unlocked) tacked on — the counterpart to getMyCharacters()'s portable
  // templates. Powers the player's "Characters" tab.
  async getMyCampaignCopies(): Promise<(Character & { campaign_name: string; edit_unlocked: boolean })[]> {
    return firstValueFrom(
      this.http.get<(Character & { campaign_name: string; edit_unlocked: boolean })[]>(`${API}/characters/copies`)
    );
  }

  async getCharacter(id: string): Promise<Character> {
    return firstValueFrom(this.http.get<Character>(`${API}/characters/${id}`));
  }

  async saveCharacter(character: Character): Promise<Character> {
    if (character.id) {
      return firstValueFrom(
        this.http.put<Character>(`${API}/characters/${character.id}`, character)
      );
    } else {
      return firstValueFrom(
        this.http.post<Character>(`${API}/characters`, character)
      );
    }
  }

  async deleteCharacter(id: string): Promise<void> {
    await firstValueFrom(this.http.delete(`${API}/characters/${id}`));
  }
}
