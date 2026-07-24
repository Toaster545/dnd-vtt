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
