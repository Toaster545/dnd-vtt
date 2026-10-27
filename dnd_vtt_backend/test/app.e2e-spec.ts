import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';

// Boots the real module graph against an in-memory database with the same global setup as
// main.ts (prefix + ValidationPipe). Guards the cross-cutting rules the unit tests can't see:
// controllers are guarded by default, static content is explicitly public, bodies are validated.
describe('API (e2e)', () => {
  let app: INestApplication<App>;
  const previous = { ...process.env };

  beforeAll(async () => {
    process.env.DB_PATH = ':memory:';
    process.env.JWT_SECRET = 'e2e-secret-that-is-not-a-placeholder';
    delete process.env.DEV_BYPASS;
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api');
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, transform: true }),
    );
    await app.init();
  });

  afterAll(async () => {
    await app.close();
    process.env = previous;
  });

  it('serves static game content without a token', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/content/classes')
      .expect(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  it('requires a token for content that is not explicitly public', () =>
    request(app.getHttpServer()).get('/api/content/items/mine').expect(401));

  it('requires a token for character routes', () =>
    request(app.getHttpServer()).get('/api/characters').expect(401));

  it('does not accept the dev token unless DEV_BYPASS is set', () =>
    request(app.getHttpServer())
      .get('/api/characters')
      .set('Authorization', 'Bearer dev')
      .expect(401));
});
