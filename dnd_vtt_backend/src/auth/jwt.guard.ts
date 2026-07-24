import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { DatabaseService } from '../common/database.service';

@Injectable()
export class JwtGuard implements CanActivate {
  constructor(
    private jwt: JwtService,
    private db: DatabaseService,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest();
    const auth = req.headers['authorization'] as string | undefined;
    if (!auth?.startsWith('Bearer ')) throw new UnauthorizedException();

    let payload: { sub: string };
    try {
      payload = this.jwt.verify(auth.slice(7));
    } catch {
      throw new UnauthorizedException('Invalid or expired token');
    }

    const result = await this.db.execute(
      'SELECT id, email, username, role FROM profiles WHERE id = ?',
      [payload.sub],
    );
    const user = result.rows[0];
    if (!user) throw new UnauthorizedException('User not found');

    req.user = user;
    return true;
  }
}
