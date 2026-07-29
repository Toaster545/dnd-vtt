import { Test } from '@nestjs/testing';
import { JwtModule } from '@nestjs/jwt';
import { BadRequestException, UnauthorizedException } from '@nestjs/common';
import { AuthService } from './auth.service';
import { DatabaseService } from '../common/database.service';
import { createTestDb } from '../common/test-db.util';

describe('AuthService', () => {
  let service: AuthService;
  let cleanup: () => void;

  beforeEach(async () => {
    const testDb = await createTestDb();
    cleanup = testDb.cleanup;

    const moduleRef = await Test.createTestingModule({
      imports: [
        JwtModule.register({
          secret: 'test-secret',
          signOptions: { expiresIn: '7d' },
        }),
      ],
      providers: [
        AuthService,
        { provide: DatabaseService, useValue: testDb.db },
      ],
    }).compile();

    service = moduleRef.get(AuthService);
  });

  afterEach(() => cleanup());

  describe('register', () => {
    it('creates a new account', async () => {
      const result = await service.register(
        'a@test.com',
        'password123',
        'alice',
      );
      expect(result.message).toMatch(/created/i);
    });

    it('rejects a duplicate email', async () => {
      await service.register('a@test.com', 'password123', 'alice');
      await expect(
        service.register('a@test.com', 'password123', 'someoneelse'),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects a duplicate username', async () => {
      await service.register('a@test.com', 'password123', 'alice');
      await expect(
        service.register('b@test.com', 'password123', 'alice'),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('login', () => {
    beforeEach(async () => {
      await service.register('a@test.com', 'password123', 'alice');
    });

    it('returns a token and profile for valid credentials', async () => {
      const result = await service.login('a@test.com', 'password123');
      expect(result.access_token).toEqual(expect.any(String));
      expect(result.profile).toMatchObject({
        email: 'a@test.com',
        username: 'alice',
        role: 'player',
      });
    });

    it('rejects an unknown email', async () => {
      await expect(
        service.login('nope@test.com', 'password123'),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('rejects a wrong password', async () => {
      await expect(service.login('a@test.com', 'wrong')).rejects.toThrow(
        UnauthorizedException,
      );
    });
  });

  describe('getProfile', () => {
    it('returns the profile for a valid id', async () => {
      await service.register('a@test.com', 'password123', 'alice');
      const { profile } = await service.login('a@test.com', 'password123');
      const result = await service.getProfile(profile.id);
      expect(result.username).toBe('alice');
    });

    it('throws for an unknown id', async () => {
      await expect(service.getProfile('nonexistent')).rejects.toThrow(
        UnauthorizedException,
      );
    });
  });
});
