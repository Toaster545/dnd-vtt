import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { SupabaseService } from '../common/supabase.service';

@Injectable()
export class CharactersService {
  constructor(private supabase: SupabaseService) {}

  async findAllForUser(userId: string) {
    const { data, error } = await this.supabase.client
      .from('characters')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });
    if (error) throw new Error(error.message);
    return data ?? [];
  }

  async findOne(id: string, userId: string) {
    const { data, error } = await this.supabase.client
      .from('characters')
      .select('*')
      .eq('id', id)
      .single();
    if (error || !data) throw new NotFoundException('Character not found');
    if (data.user_id !== userId) throw new ForbiddenException();
    return data;
  }

  async create(userId: string, body: Record<string, unknown>) {
    const { data, error } = await this.supabase.client
      .from('characters')
      .insert({ ...body, user_id: userId })
      .select()
      .single();
    if (error) throw new Error(error.message);
    return data;
  }

  async update(id: string, userId: string, body: Record<string, unknown>) {
    await this.findOne(id, userId);
    const { data, error } = await this.supabase.client
      .from('characters')
      .update({ ...body, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single();
    if (error) throw new Error(error.message);
    return data;
  }

  async remove(id: string, userId: string) {
    await this.findOne(id, userId);
    const { error } = await this.supabase.client
      .from('characters')
      .delete()
      .eq('id', id);
    if (error) throw new Error(error.message);
    return { deleted: true };
  }
}
