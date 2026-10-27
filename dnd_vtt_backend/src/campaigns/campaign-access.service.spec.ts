import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { createTestDb } from '../common/test-db.util';
import {
  addMember,
  insertCampaign,
  insertSession,
  insertUser,
} from '../common/test-fixtures.util';
import { DatabaseService } from '../common/database.service';
import { CampaignAccessService } from './campaign-access.service';

describe('CampaignAccessService', () => {
  let db: DatabaseService;
  let cleanup: () => void;
  let access: CampaignAccessService;
  let dm: string;
  let player: string;
  let campaign: string;
  let session: string;
  let map: string;
  let encounter: string;

  async function reveal(sessionVisible: boolean, encounterVisible: boolean) {
    await db.execute(
      'UPDATE sessions SET visible_to_players = ? WHERE id = ?',
      [sessionVisible ? 1 : 0, session],
    );
    await db.execute(
      'UPDATE encounters SET visible_to_players = ? WHERE id = ?',
      [encounterVisible ? 1 : 0, encounter],
    );
  }

  beforeEach(async () => {
    ({ db, cleanup } = await createTestDb());
    access = new CampaignAccessService(db);
    dm = await insertUser(db);
    player = await insertUser(db);
    campaign = await insertCampaign(db, dm);
    await addMember(db, campaign, player);
    session = await insertSession(db, campaign, dm);
    map = randomUUID();
    await db.execute(
      `INSERT INTO battle_maps (id, campaign_id, name, image_url) VALUES (?, ?, 'M', '/x.png')`,
      [map, campaign],
    );
    encounter = randomUUID();
    await db.execute(
      `INSERT INTO encounters (id, session_id, dm_id, name) VALUES (?, ?, ?, 'E')`,
      [encounter, session, dm],
    );
    await db.execute(
      `INSERT INTO encounter_levels (encounter_id, map_id, position) VALUES (?, ?, 0)`,
      [encounter, map],
    );
  });
  afterEach(() => cleanup());

  it('always lets the DM into a map room', async () => {
    await expect(access.socketMapRole(map, dm)).resolves.toBe('dm');
  });

  it('keeps a map hidden until both session and encounter are revealed', async () => {
    await expect(access.socketMapRole(map, player)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    await reveal(true, false);
    await expect(access.socketMapRole(map, player)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    await reveal(true, true);
    await expect(access.socketMapRole(map, player)).resolves.toBe('player');
  });

  it('turns away outsiders even when the map is revealed', async () => {
    await reveal(true, true);
    const stranger = await insertUser(db);
    await expect(access.socketMapRole(map, stranger)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it('distinguishes a missing map from a forbidden one', async () => {
    await expect(access.socketMapRole('nope', player)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('gates encounter access on visibility and, optionally, an active encounter', async () => {
    await expect(access.encounterFor(encounter, player)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    await expect(
      access.encounterFor(encounter, dm, true),
    ).resolves.toMatchObject({ id: encounter });
    await reveal(true, true);
    await expect(access.encounterFor(encounter, player)).resolves.toMatchObject(
      { id: encounter },
    );
    await db.execute(`UPDATE encounters SET status = 'draft' WHERE id = ?`, [
      encounter,
    ]);
    await expect(
      access.encounterFor(encounter, player, true),
    ).rejects.toBeInstanceOf(ForbiddenException);
    await expect(access.encounterFor('nope', player)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});
