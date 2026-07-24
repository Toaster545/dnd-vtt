import { Injectable, BadRequestException, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { randomUUID } from 'crypto';
import { DatabaseService } from '../common/database.service';

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

  async login(email: string, password: string) {
    const result = await this.db.execute(
      'SELECT * FROM profiles WHERE email = ?',
      [email],
    );
    const user = result.rows[0];
    if (!user) throw new UnauthorizedException('Invalid credentials');

    const valid = await bcrypt.compare(password, user.password_hash as string);
    if (!valid) throw new UnauthorizedException('Invalid credentials');

    const access_token = this.jwt.sign({ sub: user.id });
    return {
      access_token,
      profile: {
        id: user.id,
        email: user.email,
        username: user.username,
        role: user.role,
      },
    };
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
}
