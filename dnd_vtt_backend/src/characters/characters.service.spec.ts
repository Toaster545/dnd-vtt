import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { CharactersService } from './characters.service';
import { DatabaseService } from '../common/database.service';
import { createTestDb } from '../common/test-db.util';
import type { RequestUser } from '../common/current-user.decorator';

async function insertProfile(
  db: DatabaseService,
  role: 'admin' | 'player' = 'player',
) {
  const id = randomUUID();
  await db.execute(
    'INSERT INTO profiles (id, email, username, password_hash, role) VALUES (?, ?, ?, ?, ?)',
    [id, `${id}@test.com`, id, 'hash', role],
  );
  return id;
}

describe('CharactersService', () => {
  let service: CharactersService;
  let db: DatabaseService;
  let cleanup: () => void;
  let ownerId: string;
  let owner: RequestUser;

  beforeEach(async () => {
    const testDb = await createTestDb();
    db = testDb.db;
    cleanup = testDb.cleanup;
    service = new CharactersService(db);
    ownerId = await insertProfile(db);
    owner = { id: ownerId, role: 'player' } as RequestUser;
  });

  afterEach(() => cleanup());

  it('creates and reads back a character owned by the caller', async () => {
    const created = await service.create(ownerId, {
      name: 'Aria',
      race: 'Elf',
      class: 'Wizard',
      level: 3,
    });
    expect(created.name).toBe('Aria');

    const found = await service.findOne(created.id as string, ownerId);
    expect(found).toMatchObject({
      name: 'Aria',
      race: 'Elf',
      class: 'Wizard',
      level: 3,
    });
  });

  it('rejects reading a character owned by someone else', async () => {
    const created = await service.create(ownerId, { name: 'Aria' });
    const otherId = await insertProfile(db);
    await expect(
      service.findOne(created.id as string, otherId),
    ).rejects.toThrow(ForbiddenException);
  });

  it('throws NotFoundException for a nonexistent character', async () => {
    await expect(service.findOne(randomUUID(), ownerId)).rejects.toThrow(
      NotFoundException,
    );
  });

  it('lets the owning DM read a campaign copy via findOneReadable', async () => {
    const created = await service.create(ownerId, { name: 'Aria' });
    const campaignId = randomUUID();
    const dmId = await insertProfile(db);
    await db.execute(
      `INSERT INTO campaigns (id, dm_id, name, join_code) VALUES (?, ?, 'Test Campaign', ?)`,
      [campaignId, dmId, randomUUID().slice(0, 6).toUpperCase()],
    );
    await db.execute('UPDATE characters SET campaign_id = ? WHERE id = ?', [
      campaignId,
      created.id,
    ]);

    const found = await service.findOneReadable(
      created.id as string,
      {
        id: dmId,
        role: 'player',
      } as RequestUser,
    );
    expect(found.name).toBe('Aria');
  });

  it('blocks a non-owner who does not own the character or its campaign from reading via findOneReadable', async () => {
    const created = await service.create(ownerId, { name: 'Aria' });
    const otherId = await insertProfile(db);
    await expect(
      service.findOneReadable(
        created.id as string,
        {
          id: otherId,
          role: 'player',
        } as RequestUser,
      ),
    ).rejects.toThrow(ForbiddenException);
  });

  it('removes a character the caller owns', async () => {
    const created = await service.create(ownerId, { name: 'Aria' });
    await service.remove(created.id as string, ownerId);
    await expect(
      service.findOne(created.id as string, ownerId),
    ).rejects.toThrow(NotFoundException);
  });

  describe('update on a locked campaign copy', () => {
    async function makeLockedCampaignCopy(editUnlocked: boolean) {
      const created = await service.create(ownerId, {
        name: 'Aria',
        race: 'Elf',
        class: 'Wizard',
        level: 3,
        current_hp: 20,
        notes: 'secret DM notes',
      });
      const campaignId = randomUUID();
      const dmId = await insertProfile(db);
      await db.execute(
        `INSERT INTO campaigns (id, dm_id, name, join_code) VALUES (?, ?, 'Test Campaign', ?)`,
        [campaignId, dmId, randomUUID().slice(0, 6).toUpperCase()],
      );
      await db.execute('UPDATE characters SET campaign_id = ? WHERE id = ?', [
        campaignId,
        created.id,
      ]);
      await db.execute(
        `INSERT INTO campaign_members (id, campaign_id, user_id, character_id, edit_unlocked)
         VALUES (?, ?, ?, ?, ?)`,
        [randomUUID(), campaignId, ownerId, created.id, editUnlocked ? 1 : 0],
      );
      return { created, dmId };
    }

    it('only lets the player write the whitelisted play-sheet fields when locked', async () => {
      const { created } = await makeLockedCampaignCopy(false);

      const updated = await service.update(created.id as string, owner, {
        name: 'Renamed',
        current_hp: 5,
        notes: 'player tried to overwrite notes',
      });

      const blob = updated as unknown as Record<string, unknown>;
      // Whitelisted field (current_hp) goes through...
      expect(blob.current_hp).toBe(5);
      // ...but name/notes are outside PLAYER_EDITABLE_FIELDS and are left untouched.
      expect(updated.name).toBe('Aria');
      expect(blob.notes).toBe('secret DM notes');
    });

    it('lets the player fully rewrite the copy once the DM unlocks edit access', async () => {
      const { created } = await makeLockedCampaignCopy(true);

      const updated = await service.update(created.id as string, owner, {
        name: 'Fully Renamed',
      });

      expect(updated.name).toBe('Fully Renamed');
    });

    it('lets the owning DM write the copy regardless of edit_unlocked', async () => {
      const { created, dmId } = await makeLockedCampaignCopy(false);
      const dm = { id: dmId, role: 'player' } as RequestUser;

      const updated = await service.update(created.id as string, dm, {
        name: 'DM Renamed',
      });

      expect(updated.name).toBe('DM Renamed');
    });
  });
});
