import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import type { Socket } from 'socket.io';
import { DatabaseService } from '../common/database.service';
import type { RequestUser } from '../common/current-user.decorator';

export type AuthenticatedSocketData = { user: RequestUser } & Record<
  string,
  unknown
>;

@Injectable()
export class SocketAuthService {
  constructor(
    private jwt: JwtService,
    private db: DatabaseService,
  ) {}

  install(server: {
    use: (
      middleware: (socket: Socket, next: (error?: Error) => void) => void,
    ) => void;
  }) {
    server.use((socket, next) => {
      void this.authenticate(socket).then(
        () => next(),
        () => next(new Error('unauthorized')),
      );
    });
  }

  private async authenticate(socket: Socket): Promise<void> {
    try {
      const handshakeAuth = socket.handshake.auth as Record<string, unknown>;
      const token = handshakeAuth['token'];
      if (typeof token !== 'string' || !token) {
        throw new UnauthorizedException();
      }
      let userId: string;
      if (token === 'dev' && process.env.DEV_BYPASS === 'true') {
        const admin = await this.db.execute(
          `SELECT id FROM profiles WHERE role = 'admin' LIMIT 1`,
        );
        if (!admin.rows[0]) throw new UnauthorizedException();
        userId = admin.rows[0].id as string;
      } else {
        const payload = this.jwt.verify<{ sub: string }>(token);
        userId = payload.sub;
      }
      const result = await this.db.execute(
        `SELECT id, email, role FROM profiles WHERE id = ?`,
        [userId],
      );
      const row = result.rows[0];
      if (!row) throw new UnauthorizedException();
      (socket.data as AuthenticatedSocketData).user = {
        id: row.id as string,
        email: row.email as string,
        role: row.role as RequestUser['role'],
      };
    } catch {
      throw new UnauthorizedException();
    }
  }

  user(socket: Socket): RequestUser {
    const user = (socket.data as Partial<AuthenticatedSocketData>).user;
    if (!user) throw new UnauthorizedException();
    return user;
  }
}
