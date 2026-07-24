import {
  CanActivate, ExecutionContext, Injectable, UnauthorizedException,
} from '@nestjs/common';
import { verify } from 'jsonwebtoken';
import { SupabaseService } from '../common/supabase.service';

@Injectable()
export class JwtGuard implements CanActivate {
  constructor(private supabase: SupabaseService) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest();
    const auth = req.headers['authorization'] as string | undefined;

    if (!auth?.startsWith('Bearer ')) throw new UnauthorizedException();

    const token = auth.slice(7);

    let payload: any;
    try {
      payload = verify(token, process.env.SUPABASE_JWT_SECRET!);
    } catch {
      throw new UnauthorizedException('Invalid token');
    }

    const { data: profile, error } = await this.supabase.client
      .from('profiles')
      .select('id, email, username, role')
      .eq('id', payload.sub)
      .single();

    if (error || !profile) throw new UnauthorizedException('User not found');

    req.user = profile;
    return true;
  }
}
