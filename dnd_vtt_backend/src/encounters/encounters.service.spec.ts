import { randomUUID } from 'crypto';
import { EncountersService } from './encounters.service';
import { DatabaseService } from '../common/database.service';
import { createTestDb } from '../common/test-db.util';

describe('EncountersService levels', () => {
  let encounters: EncountersService;
  let db: DatabaseService;
  let cleanup: () => void;
  let dmId: string;
  let sessionId: string;
  let crypt: string;
  let tower: string;

  async function insertMap(campaignId: string, name: string) {
    const id = randomUUID();
    await db.execute(
      `INSERT INTO battle_maps (id, campaign_id, name, image_url) VALUES (?, ?, ?, '/uploads/maps/x.png')`,
      [id, campaignId, name],
    );
    return id;
  }

  beforeEach(async () => {
    const testDb = await createTestDb();
    db = testDb.db;
    cleanup = testDb.cleanup;
    encounters = new EncountersService(
      db,
      { notifyTokensChanged: jest.fn() } as unknown as ConstructorParameters<
        typeof EncountersService
      >[1],
      {} as unknown as ConstructorParameters<typeof EncountersService>[2],
    );
    dmId = randomUUID();
    await db.execute(
      `INSERT INTO profiles (id, email, username, password_hash, role) VALUES (?, ?, ?, 'hash', 'admin')`,
      [dmId, `${dmId}@test.com`, dmId],
    );
    const campaignId = randomUUID();
    await db.execute(
      `INSERT INTO campaigns (id, dm_id, name, join_code) VALUES (?, ?, 'Test Campaign', ?)`,
      [campaignId, dmId, randomUUID().slice(0, 8)],
    );
    sessionId = randomUUID();
    await db.execute(
      `INSERT INTO sessions (id, dm_id, campaign_id, name) VALUES (?, ?, ?, 'Session One')`,
      [sessionId, dmId, campaignId],
    );
    crypt = await insertMap(campaignId, 'Crypt Map');
    tower = await insertMap(campaignId, 'Tower Map');
  });

  afterEach(() => cleanup());

  it("shows each level's own name, falling back to the map's name", async () => {
    const created = await encounters.create(dmId, {
      name: 'Delve',
      session_id: sessionId,
      map_ids: [crypt, tower],
      level_names: { [crypt]: '  The Crypt  ', [tower]: '' },
    });
    expect(created.levels).toEqual([
      {
        map_id: crypt,
        name: 'The Crypt',
        custom_name: 'The Crypt',
        position: 0,
      },
      { map_id: tower, name: 'Tower Map', custom_name: null, position: 1 },
    ]);
  });

  it('keeps level names through a reorder that sends no names', async () => {
    const created = await encounters.create(dmId, {
      name: 'Delve',
      session_id: sessionId,
      map_ids: [crypt, tower],
      level_names: { [crypt]: 'The Crypt' },
    });
    const updated = await encounters.update(created.id as string, dmId, {
      map_ids: [tower, crypt],
    });
    expect(updated.levels.map((l) => [l.map_id, l.name])).toEqual([
      [tower, 'Tower Map'],
      [crypt, 'The Crypt'],
    ]);
  });

  it('renames and clears level names on update, capped at 60 characters', async () => {
    const created = await encounters.create(dmId, {
      name: 'Delve',
      session_id: sessionId,
      map_ids: [crypt, tower],
      level_names: { [crypt]: 'The Crypt' },
    });
    const updated = await encounters.update(created.id as string, dmId, {
      map_ids: [crypt, tower],
      level_names: { [crypt]: '', [tower]: 'x'.repeat(80) },
    });
    expect(updated.levels.map((l) => l.custom_name)).toEqual([
      null,
      'x'.repeat(60),
    ]);
    expect(updated.levels[0].name).toBe('Crypt Map');
  });
});
