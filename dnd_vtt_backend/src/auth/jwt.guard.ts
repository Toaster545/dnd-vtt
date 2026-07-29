import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import type { Request } from 'express';
import type { Row } from '@libsql/client';
import { DatabaseService } from '../common/database.service';
import type { RequestUser } from '../common/current-user.decorator';

function toRequestUser(row: Row): RequestUser {
  return {
    id: row.id as string,
    email: row.email as string,
    role: row.role as RequestUser['role'],
  };
}

@Injectable()
export class JwtGuard implements CanActivate {
  constructor(
    private jwt: JwtService,
    private db: DatabaseService,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest<Request>();
    const auth = req.headers['authorization'];
    if (!auth?.startsWith('Bearer ')) throw new UnauthorizedException();

    const token = auth.slice(7);

    // Dev bypass: accept the literal token "dev" outside of production
    if (token === 'dev' && process.env.DEV_BYPASS === 'true') {
      const result = await this.db.execute(
        "SELECT id, email, username, role FROM profiles WHERE role = 'admin' LIMIT 1",
      );
      const user = result.rows[0];
      if (!user)
        throw new UnauthorizedException(
          'No admin account found — register one first',
        );
      req.user = toRequestUser(user);
      return true;
    }

    let payload: { sub: string };
    try {
      payload = this.jwt.verify(token);
    } catch {
      throw new UnauthorizedException('Invalid or expired token');
    }

    const result = await this.db.execute(
      'SELECT id, email, username, role FROM profiles WHERE id = ?',
      [payload.sub],
    );
    const user = result.rows[0];
    if (!user) throw new UnauthorizedException('User not found');

    req.user = toRequestUser(user);
    return true;
  }
}
