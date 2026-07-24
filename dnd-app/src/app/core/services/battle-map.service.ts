import { Injectable, inject } from '@angular/core';
import { SupabaseService } from './supabase.service';
import { BattleMap, MapToken } from '../models/campaign.model';
import { Observable } from 'rxjs';

@Injectable({ providedIn: 'root' })
export class BattleMapService {
  private supabase = inject(SupabaseService).client;

  async getMapsForCampaign(campaignId: string): Promise<BattleMap[]> {
    const { data, error } = await this.supabase
      .from('battle_maps')
      .select('*')
      .eq('campaign_id', campaignId);
    if (error) throw error;
    return data ?? [];
  }

  async getMap(mapId: string): Promise<BattleMap> {
    const { data, error } = await this.supabase
      .from('battle_maps')
      .select('*')
      .eq('id', mapId)
      .single();
    if (error) throw error;
    return data;
  }

  async createMap(map: BattleMap): Promise<BattleMap> {
    const { data, error } = await this.supabase
      .from('battle_maps')
      .insert(map)
      .select()
      .single();
    if (error) throw error;
    return data;
  }

  async uploadMapImage(file: File, campaignId: string): Promise<string> {
    const path = `${campaignId}/${Date.now()}_${file.name}`;
    const { error } = await this.supabase.storage
      .from('maps')
      .upload(path, file, { upsert: false });
    if (error) throw error;

    const { data } = this.supabase.storage.from('maps').getPublicUrl(path);
    return data.publicUrl;
  }

  async getTokens(mapId: string): Promise<MapToken[]> {
    const { data, error } = await this.supabase
      .from('map_tokens')
      .select('*')
      .eq('map_id', mapId);
    if (error) throw error;
    return data ?? [];
  }

  async upsertToken(token: MapToken): Promise<MapToken> {
    const { data, error } = await this.supabase
      .from('map_tokens')
      .upsert(token)
      .select()
      .single();
    if (error) throw error;
    return data;
  }

  async deleteToken(tokenId: string): Promise<void> {
    const { error } = await this.supabase
      .from('map_tokens')
      .delete()
      .eq('id', tokenId);
    if (error) throw error;
  }

  watchTokens(mapId: string): Observable<MapToken[]> {
    return new Observable(observer => {
      this.getTokens(mapId).then(tokens => observer.next(tokens));

      const channel = this.supabase
        .channel(`tokens:${mapId}`)
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'map_tokens', filter: `map_id=eq.${mapId}` },
          () => this.getTokens(mapId).then(tokens => observer.next(tokens))
        )
        .subscribe();

      return () => this.supabase.removeChannel(channel);
    });
  }
}
