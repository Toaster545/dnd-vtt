import { Injectable, inject } from '@angular/core';
import { SupabaseService } from './supabase.service';
import { Character } from '../models/character.model';

@Injectable({ providedIn: 'root' })
export class CharacterService {
  private supabase = inject(SupabaseService).client;

  async getMyCharacters(): Promise<Character[]> {
    const { data, error } = await this.supabase
      .from('characters')
      .select('*')
      .order('created_at', { ascending: false });
    if (error) throw error;
    return data ?? [];
  }

  async getCharacter(id: string): Promise<Character> {
    const { data, error } = await this.supabase
      .from('characters')
      .select('*')
      .eq('id', id)
      .single();
    if (error) throw error;
    return data;
  }

  async saveCharacter(character: Character): Promise<Character> {
    const payload = { ...character, updated_at: new Date().toISOString() };

    if (character.id) {
      const { data, error } = await this.supabase
        .from('characters')
        .update(payload)
        .eq('id', character.id)
        .select()
        .single();
      if (error) throw error;
      return data;
    } else {
      const { data, error } = await this.supabase
        .from('characters')
        .insert(payload)
        .select()
        .single();
      if (error) throw error;
      return data;
    }
  }

  async deleteCharacter(id: string): Promise<void> {
    const { error } = await this.supabase.from('characters').delete().eq('id', id);
    if (error) throw error;
  }
}
