import { Injectable, NotFoundException } from '@nestjs/common';
import { SupabaseService } from '../common/supabase.service';

@Injectable()
export class MapsService {
  constructor(private supabase: SupabaseService) {}

  async findAll() {
    const { data, error } = await this.supabase.client
      .from('battle_maps')
      .select('*')
      .order('created_at', { ascending: false });
    if (error) throw new Error(error.message);
    return data ?? [];
  }

  async findOne(id: string) {
    const { data, error } = await this.supabase.client
      .from('battle_maps')
      .select('*')
      .eq('id', id)
      .single();
    if (error || !data) throw new NotFoundException('Map not found');
    return data;
  }

  async create(body: Record<string, unknown>) {
    const { data, error } = await this.supabase.client
      .from('battle_maps')
      .insert(body)
      .select()
      .single();
    if (error) throw new Error(error.message);
    return data;
  }

  async uploadImage(file: Express.Multer.File, campaignId: string): Promise<string> {
    const path = `${campaignId}/${Date.now()}_${file.originalname}`;
    const { error } = await this.supabase.client.storage
      .from('maps')
      .upload(path, file.buffer, { contentType: file.mimetype, upsert: false });
    if (error) throw new Error(error.message);

    const { data } = this.supabase.client.storage.from('maps').getPublicUrl(path);
    return data.publicUrl;
  }

  async getTokens(mapId: string) {
    const { data, error } = await this.supabase.client
      .from('map_tokens')
      .select('*')
      .eq('map_id', mapId);
    if (error) throw new Error(error.message);
    return data ?? [];
  }

  async upsertToken(mapId: string, token: Record<string, unknown>) {
    const { data, error } = await this.supabase.client
      .from('map_tokens')
      .upsert({ ...token, map_id: mapId })
      .select()
      .single();
    if (error) throw new Error(error.message);
    return data;
  }

  async deleteToken(tokenId: string) {
    const { error } = await this.supabase.client
      .from('map_tokens')
      .delete()
      .eq('id', tokenId);
    if (error) throw new Error(error.message);
    return { deleted: true };
  }
}
