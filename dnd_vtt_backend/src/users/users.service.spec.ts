import { BadRequestException, NotFoundException } from '@nestjs/common';
import { createTestDb } from '../common/test-db.util';
import { insertUser } from '../common/test-fixtures.util';
import { DatabaseService } from '../common/database.service';
import { UsersService } from './users.service';

describe('UsersService', () => {
  let db: DatabaseService;
  let cleanup: () => void;
  let users: UsersService;

  beforeEach(async () => {
    ({ db, cleanup } = await createTestDb());
    users = new UsersService(db);
  });
  afterEach(() => cleanup());

  it('refuses to demote the only admin, even by someone else', async () => {
    const admin = await insertUser(db, 'admin');
    const other = await insertUser(db, 'player');
    await expect(
      users.update(admin, other, { role: 'player' }),
    ).rejects.toThrow('At least one admin');
  });

  it('refuses to demote yourself', async () => {
    const admin = await insertUser(db, 'admin');
    await insertUser(db, 'admin');
    await expect(
      users.update(admin, admin, { role: 'player' }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('demotes an admin while another remains', async () => {
    const a = await insertUser(db, 'admin');
    const b = await insertUser(db, 'admin');
    const updated = await users.update(b, a, { role: 'player' });
    expect(updated.role).toBe('player');
  });

  it('rejects an email or username already taken', async () => {
    const a = await insertUser(db);
    const b = await insertUser(db);
    await expect(users.update(b, a, { username: a })).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('hashes a new password instead of storing it', async () => {
    const id = await insertUser(db);
    await users.update(id, id, { password: 'correct horse battery' });
    const row = (
      await db.execute('SELECT password_hash FROM profiles WHERE id = ?', [id])
    ).rows[0];
    expect(row.password_hash).not.toBe('correct horse battery');
    expect(row.password_hash as string).toMatch(/^\$2[aby]\$/);
  });

  it('cannot delete yourself or the last admin, and 404s on unknown ids', async () => {
    const admin = await insertUser(db, 'admin');
    const player = await insertUser(db);
    await expect(users.remove(admin, admin)).rejects.toBeInstanceOf(
      BadRequestException,
    );
    await expect(users.remove(admin, player)).rejects.toThrow(
      'At least one admin',
    );
    await expect(users.remove('nope', player)).rejects.toBeInstanceOf(
      NotFoundException,
    );
    await expect(users.remove(player, admin)).resolves.toEqual({
      message: 'Account deleted',
    });
  });
});
