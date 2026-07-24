import { Injectable, BadRequestException, UnauthorizedException } from '@nestjs/common';
import { SupabaseService } from '../common/supabase.service';

@Injectable()
export class AuthService {
  constructor(private supabase: SupabaseService) {}

  async register(email: string, password: string, username: string) {
    const { data, error } = await this.supabase.client.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });
    if (error) throw new BadRequestException(error.message);

    const { error: profileError } = await this.supabase.client
      .from('profiles')
      .insert({ id: data.user.id, email, username, role: 'player' });
    if (profileError) throw new BadRequestException(profileError.message);

    return { message: 'Account created. You can now sign in.' };
  }

  async login(email: string, password: string) {
    const { data, error } = await this.supabase.client.auth.signInWithPassword({
      email,
      password,
    });
    if (error) throw new UnauthorizedException(error.message);

    const { data: profile } = await this.supabase.client
      .from('profiles')
      .select('id, email, username, role')
      .eq('id', data.user.id)
      .single();

    return {
      access_token: data.session.access_token,
      profile,
    };
  }

  async getProfile(userId: string) {
    const { data, error } = await this.supabase.client
      .from('profiles')
      .select('id, email, username, role')
      .eq('id', userId)
      .single();
    if (error) throw new UnauthorizedException();
    return data;
  }
}
