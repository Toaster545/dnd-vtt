import { createTestDb } from './test-db.util';
import { MIGRATIONS } from './migrations';
import { DatabaseService } from './database.service';

describe('DatabaseService', () => {
  let db: DatabaseService;
  let cleanup: () => void;

  beforeEach(async () => {
    ({ db, cleanup } = await createTestDb());
  });
  afterEach(() => cleanup());

  it('stamps the schema with the newest migration version', async () => {
    const version = Number(
      (await db.execute('PRAGMA user_version')).rows[0].user_version,
    );
    expect(version).toBe(Math.max(...MIGRATIONS.map((m) => m.version)));
  });

  it('keeps migration versions unique and in ascending array order', () => {
    const versions = MIGRATIONS.map((m) => m.version);
    expect(new Set(versions).size).toBe(versions.length);
    expect(versions).toEqual([...versions].sort((a, b) => a - b));
  });

  it('enforces foreign keys', async () => {
    await expect(
      db.execute(
        `INSERT INTO battle_maps (id, campaign_id, name, image_url) VALUES ('m', 'c', 'n', 'u')`,
      ),
    ).resolves.toBeDefined();
    await expect(
      db.execute(
        `INSERT INTO map_tokens (id, map_id, label) VALUES ('t', 'missing', 'x')`,
      ),
    ).rejects.toThrow();
  });

  it('parseJson falls back on empty or malformed input', () => {
    expect(db.parseJson('{"a":1}', {})).toEqual({ a: 1 });
    expect(db.parseJson(null, ['x'])).toEqual(['x']);
    expect(db.parseJson('{nope', 5)).toBe(5);
  });
});
