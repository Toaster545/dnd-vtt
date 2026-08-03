import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../../environments/environment';
import { Character } from '../models/character.model';

export interface SpellCastCommand {
  spellIndex: string;
  sourceKey: string;
  method: 'cantrip' | 'slot' | 'pact' | 'free';
  poolKey?: string;
  slotLevel?: number;
  freeCastKey?: string;
  maxUses?: number;
  recovery?: 'short_rest' | 'long_rest' | null;
  atWill?: boolean;
  replaceConcentration?: boolean;
}

export interface SpellCastResponse {
  character: Character;
  cast: {
    spellIndex: string;
    spellName: string;
    castLevel: number;
    method: SpellCastCommand['method'];
    resourceLabel: string;
    concentration: boolean;
  };
}

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

  async castSpell(id: string, command: SpellCastCommand): Promise<SpellCastResponse> {
    return firstValueFrom(
      this.http.post<SpellCastResponse>(`${API}/characters/${id}/cast`, command)
    );
  }

  async restoreSpellcasting(id: string, type: 'short_rest' | 'long_rest'): Promise<Character> {
    return firstValueFrom(
      this.http.post<Character>(`${API}/characters/${id}/spell-rest`, { type })
    );
  }

  async endConcentration(id: string): Promise<Character> {
    return firstValueFrom(
      this.http.patch<Character>(`${API}/characters/${id}/concentration`, {})
    );
  }

  // DM-only: grants (or stacks more of) an item from the SRD/custom item catalog onto a party
  // member's campaign copy. The backend rejects this unless the caller DMs that character's campaign.
  async grantItem(id: string, itemIndex: string, quantity: number): Promise<Character> {
    return firstValueFrom(
      this.http.post<Character>(`${API}/characters/${id}/grant-item`, { itemIndex, quantity })
    );
  }

  // Omit `quantity` to remove the whole stack; the backend clamps anything >= what's on hand
  // to a full removal too.
  async revokeItem(id: string, itemIndex: string, quantity?: number): Promise<Character> {
    return firstValueFrom(
      this.http.post<Character>(`${API}/characters/${id}/revoke-item`, { itemIndex, quantity })
    );
  }

  // DM-only counterpart to grantItem for spells: adds a spell to `granted_spells`, independent
  // of the character's class/race/feat spellcasting progression. `sourceName` labels it in the
  // Spells tab (defaults to "DM Gift" on the backend when omitted).
  async grantSpell(id: string, spellIndex: string, sourceName?: string): Promise<Character> {
    return firstValueFrom(
      this.http.post<Character>(`${API}/characters/${id}/grant-spell`, { spellIndex, sourceName })
    );
  }

  async revokeSpell(id: string, spellIndex: string): Promise<Character> {
    return firstValueFrom(
      this.http.post<Character>(`${API}/characters/${id}/revoke-spell`, { spellIndex })
    );
  }
}
