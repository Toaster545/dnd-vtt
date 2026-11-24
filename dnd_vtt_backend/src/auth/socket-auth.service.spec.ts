import { UnauthorizedException } from '@nestjs/common';
import type { JwtService } from '@nestjs/jwt';
import type { Socket } from 'socket.io';
import { createTestDb } from '../common/test-db.util';
import { insertUser } from '../common/test-fixtures.util';
import { DatabaseService } from '../common/database.service';
import { SocketAuthService } from './socket-auth.service';

describe('SocketAuthService', () => {
  let db: DatabaseService;
  let cleanup: () => void;
  let service: SocketAuthService;
  const verify = jest.fn();
  const previousBypass = process.env.DEV_BYPASS;

  const socket = (token?: unknown) =>
    ({ handshake: { auth: { token } }, data: {} }) as unknown as Socket;
  // authenticate() is private; the middleware from install() is the public entry point.
  const connect = (client: Socket) =>
    new Promise<Error | undefined>((resolve) => {
      service.install({
        use: (middleware) => middleware(client, (error) => resolve(error)),
      });
    });

  beforeEach(async () => {
    ({ db, cleanup } = await createTestDb());
    service = new SocketAuthService({ verify } as unknown as JwtService, db);
    verify.mockReset();
    delete process.env.DEV_BYPASS;
  });
  afterEach(() => {
    cleanup();
    if (previousBypass === undefined) delete process.env.DEV_BYPASS;
    else process.env.DEV_BYPASS = previousBypass;
  });

  it('attaches the profile behind a valid token', async () => {
    const id = await insertUser(db, 'admin');
    verify.mockReturnValue({ sub: id });
    const client = socket('good');
    expect(await connect(client)).toBeUndefined();
    expect(service.user(client)).toMatchObject({ id, role: 'admin' });
  });

  it('rejects a missing token, a bad signature and a deleted user', async () => {
    expect((await connect(socket()))?.message).toBe('unauthorized');

    verify.mockImplementation(() => {
      throw new Error('bad signature');
    });
    expect((await connect(socket('forged')))?.message).toBe('unauthorized');

    verify.mockReturnValue({ sub: 'ghost' });
    expect((await connect(socket('stale')))?.message).toBe('unauthorized');
  });

  it('accepts the literal dev token only under DEV_BYPASS', async () => {
    const admin = await insertUser(db, 'admin');
    verify.mockImplementation(() => {
      throw new Error('not a jwt');
    });
    expect((await connect(socket('dev')))?.message).toBe('unauthorized');

    process.env.DEV_BYPASS = 'true';
    const client = socket('dev');
    expect(await connect(client)).toBeUndefined();
    expect(service.user(client).id).toBe(admin);
  });

  it('refuses user() on a socket that never authenticated', () => {
    expect(() => service.user(socket())).toThrow(UnauthorizedException);
  });
});
