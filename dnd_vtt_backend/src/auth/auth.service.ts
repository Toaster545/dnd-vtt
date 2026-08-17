import {
  Injectable,
  BadRequestException,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { createHash, randomBytes, randomUUID } from 'crypto';
import { DatabaseService } from '../common/database.service';

export type AuthClientType = 'web' | 'native';

const REFRESH_LIFETIME_MS = 30 * 24 * 60 * 60 * 1000;

@Injectable()
export class AuthService {
  constructor(
    private db: DatabaseService,
    private jwt: JwtService,
  ) {}

  async register(email: string, password: string, username: string) {
    const existing = await this.db.execute(
      'SELECT id FROM profiles WHERE email = ? OR username = ?',
      [email, username],
    );
    if (existing.rows.length) {
      throw new BadRequestException('Email or username already in use');
    }

    const hash = await bcrypt.hash(password, 10);
    const id = randomUUID();
    await this.db.execute(
      'INSERT INTO profiles (id, email, username, password_hash) VALUES (?, ?, ?, ?)',
      [id, email, username, hash],
    );
    return { message: 'Account created. You can now sign in.' };
  }

  async login(
    email: string,
    password: string,
    clientType: AuthClientType = 'web',
  ) {
    const result = await this.db.execute(
      'SELECT * FROM profiles WHERE email = ?',
      [email],
    );
    const user = result.rows[0];
    if (!user) throw new UnauthorizedException('Invalid credentials');

    const valid = await bcrypt.compare(password, user.password_hash as string);
    if (!valid) throw new UnauthorizedException('Invalid credentials');

    const session = await this.createRefreshSession(
      user.id as string,
      clientType,
    );
    return {
      access_token: this.signAccessToken(user.id as string),
      refresh_token: session.token,
      refresh_expires_at: session.expiresAt,
      client_type: clientType,
      profile: {
        id: user.id,
        email: user.email,
        username: user.username,
        role: user.role,
      },
    };
  }

  async refresh(rawToken: string) {
    const { id, hash } = this.parseRefreshToken(rawToken);
    const result = await this.db.execute(
      `SELECT * FROM auth_sessions
       WHERE id = ? AND revoked_at IS NULL AND expires_at > ?`,
      [id, new Date().toISOString()],
    );
    const session = result.rows[0];
    if (!session || session.token_hash !== hash) {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }

    const now = new Date().toISOString();
    const revoked = await this.db.execute(
      `UPDATE auth_sessions SET revoked_at = ?, last_used_at = ?
       WHERE id = ? AND token_hash = ? AND revoked_at IS NULL`,
      [now, now, id, hash],
    );
    if (revoked.rowsAffected !== 1) {
      throw new UnauthorizedException('Refresh token was already rotated');
    }
    const replacement = await this.createRefreshSession(
      session.user_id as string,
      session.client_type as AuthClientType,
    );

    return {
      access_token: this.signAccessToken(session.user_id as string),
      refresh_token: replacement.token,
      refresh_expires_at: replacement.expiresAt,
      client_type: session.client_type as AuthClientType,
      profile: await this.getProfile(session.user_id as string),
    };
  }

  async logout(rawToken?: string) {
    if (!rawToken) return { logged_out: true };
    try {
      const { id } = this.parseRefreshToken(rawToken);
      await this.db.execute(
        `UPDATE auth_sessions SET revoked_at = COALESCE(revoked_at, ?) WHERE id = ?`,
        [new Date().toISOString(), id],
      );
    } catch {
      // Logout is intentionally idempotent, including for an already-invalid token.
    }
    return { logged_out: true };
  }

  async getProfile(userId: string) {
    const result = await this.db.execute(
      'SELECT id, email, username, role FROM profiles WHERE id = ?',
      [userId],
    );
    const user = result.rows[0];
    if (!user) throw new UnauthorizedException();
    return user;
  }

  private signAccessToken(userId: string): string {
    return this.jwt.sign({ sub: userId });
  }

  private async createRefreshSession(
    userId: string,
    clientType: AuthClientType,
  ) {
    const id = randomUUID();
    const secret = randomBytes(32).toString('base64url');
    const token = `${id}.${secret}`;
    const expiresAt = new Date(Date.now() + REFRESH_LIFETIME_MS).toISOString();
    await this.db.execute(
      `INSERT INTO auth_sessions (id, user_id, token_hash, client_type, expires_at)
       VALUES (?, ?, ?, ?, ?)`,
      [id, userId, this.hashToken(token), clientType, expiresAt],
    );
    return { token, expiresAt };
  }

  private parseRefreshToken(rawToken: string) {
    if (typeof rawToken !== 'string' || !rawToken.includes('.')) {
      throw new UnauthorizedException('Refresh token required');
    }
    const id = rawToken.slice(0, rawToken.indexOf('.'));
    if (!id) throw new UnauthorizedException('Refresh token required');
    return { id, hash: this.hashToken(rawToken) };
  }

  private hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }
}
