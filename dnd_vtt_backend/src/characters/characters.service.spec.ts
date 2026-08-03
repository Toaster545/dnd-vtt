import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import { CharactersService } from './characters.service';
import { DatabaseService } from '../common/database.service';
import { createTestDb } from '../common/test-db.util';
import type { RequestUser } from '../common/current-user.decorator';
import { ContentService } from '../content/content.service';

interface SpellcastingCharacterState {
  spell_slot_uses?: Record<string, Record<string, number>>;
  spell_free_cast_uses?: Record<string, unknown>;
  active_concentration?: { spellIndex?: string } | null;
}

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
    service = new CharactersService(db, new ContentService());
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
        spell_slot_uses: {
          spellcasting: { '1': 1 },
          'pact:class:warlock': { '2': 2 },
        },
        notes: 'player tried to overwrite notes',
      });

      const blob = updated as unknown as Record<string, unknown>;
      // Whitelisted field (current_hp) goes through...
      expect(blob.current_hp).toBe(5);
      expect(blob.spell_slot_uses).toEqual({
        spellcasting: { '1': 1 },
        'pact:class:warlock': { '2': 2 },
      });
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

  describe('spell commands', () => {
    it('atomically consumes a slot and rejects casting when the pool is empty', async () => {
      const created = await service.create(ownerId, {
        name: 'Merla',
        race: 'Human',
        class: 'Wizard',
        level: 5,
        classes: [{ name: 'Wizard', level: 5, choices: {} }],
        spell_slots_used: {},
        spell_slot_uses: {},
      });
      const command = {
        spellIndex: 'fireball',
        sourceKey: 'wizard-spellcasting',
        method: 'slot',
        poolKey: 'spellcasting',
        slotLevel: 3,
      };

      await service.castSpell(created.id as string, owner, command);
      const second = await service.castSpell(
        created.id as string,
        owner,
        command,
      );
      const secondState = second.character as SpellcastingCharacterState;
      expect(secondState.spell_slot_uses?.spellcasting?.['3']).toBe(2);
      await expect(
        service.castSpell(created.id as string, owner, command),
      ).rejects.toThrow(ConflictException);
    });

    it('rejects benefitless normal upcasting', async () => {
      const created = await service.create(ownerId, {
        name: 'Merla',
        race: 'Human',
        class: 'Wizard',
        level: 3,
        classes: [{ name: 'Wizard', level: 3, choices: {} }],
        spell_slots_used: {},
        spell_slot_uses: {},
      });

      await expect(
        service.castSpell(created.id as string, owner, {
          spellIndex: 'detect-magic',
          sourceKey: 'class:wizard',
          method: 'slot',
          poolKey: 'spellcasting',
          slotLevel: 2,
        }),
      ).rejects.toThrow('has no higher-level benefit');
    });

    it('tracks concentration and requires explicit replacement', async () => {
      const created = await service.create(ownerId, {
        name: 'Merla',
        race: 'Human',
        class: 'Wizard',
        level: 5,
        classes: [{ name: 'Wizard', level: 5, choices: {} }],
        spell_slots_used: {},
        spell_slot_uses: {},
      });
      await service.castSpell(created.id as string, owner, {
        spellIndex: 'detect-magic',
        sourceKey: 'wizard-spellcasting',
        method: 'slot',
        poolKey: 'spellcasting',
        slotLevel: 1,
      });
      const replacement = {
        spellIndex: 'invisibility',
        sourceKey: 'wizard-spellcasting',
        method: 'slot',
        poolKey: 'spellcasting',
        slotLevel: 2,
      };
      await expect(
        service.castSpell(created.id as string, owner, replacement),
      ).rejects.toThrow(ConflictException);
      const result = await service.castSpell(created.id as string, owner, {
        ...replacement,
        replaceConcentration: true,
      });
      const resultState = result.character as SpellcastingCharacterState;
      expect(resultState.active_concentration?.spellIndex).toBe('invisibility');
    });

    it('restores Pact slots on a Short Rest and all spell resources on a Long Rest', async () => {
      const created = await service.create(ownerId, {
        name: 'Vell',
        race: 'Tiefling',
        class: 'Warlock',
        level: 3,
        classes: [{ name: 'Warlock', level: 3, choices: {} }],
        spell_slots_used: {},
        spell_slot_uses: {},
      });
      await service.castSpell(created.id as string, owner, {
        spellIndex: 'invisibility',
        sourceKey: 'warlock-spellcasting',
        method: 'pact',
        poolKey: 'pact:class:warlock',
        slotLevel: 2,
      });
      const shortRested = await service.restoreSpellcasting(
        created.id as string,
        owner,
        { type: 'short_rest' },
      );
      const shortRestState = shortRested as SpellcastingCharacterState;
      expect(
        shortRestState.spell_slot_uses?.['pact:class:warlock'],
      ).toBeUndefined();
      const longRested = await service.restoreSpellcasting(
        created.id as string,
        owner,
        { type: 'long_rest' },
      );
      const longRestState = longRested as SpellcastingCharacterState;
      expect(longRestState.spell_slot_uses).toEqual({});
      expect(longRestState.spell_free_cast_uses).toEqual({});
    });
  });

  it('rejects preparation changes while the character is in an active encounter', async () => {
    const created = await service.create(ownerId, {
      name: 'Merla',
      race: 'Human',
      class: 'Wizard',
      level: 3,
      spell_choices: { 'class:wizard:prepared': ['magic-missile'] },
    });
    const dmId = await insertProfile(db);
    const campaignId = randomUUID();
    const sessionId = randomUUID();
    await db.execute(
      `INSERT INTO campaigns (id, dm_id, name, join_code) VALUES (?, ?, 'Test Campaign', ?)`,
      [campaignId, dmId, randomUUID().slice(0, 6).toUpperCase()],
    );
    await db.execute('UPDATE characters SET campaign_id = ? WHERE id = ?', [
      campaignId,
      created.id,
    ]);
    await db.execute(
      `INSERT INTO sessions (id, name, dm_id, campaign_id) VALUES (?, 'Live Session', ?, ?)`,
      [sessionId, dmId, campaignId],
    );
    await db.execute(
      `INSERT INTO encounters (id, dm_id, session_id, name, character_ids, status)
       VALUES (?, ?, ?, 'Live Fight', ?, 'active')`,
      [randomUUID(), dmId, sessionId, JSON.stringify([created.id])],
    );

    await expect(
      service.update(created.id as string, owner, {
        spell_choices: { 'class:wizard:prepared': ['shield'] },
      }),
    ).rejects.toThrow(ConflictException);
  });

  describe('grantItem', () => {
    async function makeCampaignCopy() {
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
      return {
        created,
        dm: { id: dmId, role: 'player' } as RequestUser,
      };
    }

    it('lets the campaign DM grant an item onto the equipment list', async () => {
      const { created, dm } = await makeCampaignCopy();
      const updated = (await service.grantItem(created.id as string, dm, {
        itemIndex: 'spear',
        quantity: 2,
      })) as unknown as { equipment: Record<string, unknown>[] };
      expect(updated.equipment).toEqual([
        { itemIndex: 'spear', name: 'Spear', quantity: 2, equipped: false },
      ]);
    });

    it('stacks quantity onto an existing entry instead of duplicating it', async () => {
      const { created, dm } = await makeCampaignCopy();
      await service.grantItem(created.id as string, dm, {
        itemIndex: 'spear',
        quantity: 1,
      });
      const updated = (await service.grantItem(created.id as string, dm, {
        itemIndex: 'spear',
        quantity: 3,
      })) as unknown as { equipment: Record<string, unknown>[] };
      expect(updated.equipment).toEqual([
        { itemIndex: 'spear', name: 'Spear', quantity: 4, equipped: false },
      ]);
    });

    it('rejects a caller who does not DM the character campaign', async () => {
      const { created } = await makeCampaignCopy();
      await expect(
        service.grantItem(created.id as string, owner, { itemIndex: 'spear' }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('rejects granting an item to a template character with no campaign', async () => {
      const created = await service.create(ownerId, { name: 'Aria' });
      await expect(
        service.grantItem(created.id as string, owner, { itemIndex: 'spear' }),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('revokeItem', () => {
    async function makeCampaignCopyWithItem(quantity: number) {
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
      const dm = { id: dmId, role: 'player' } as RequestUser;
      await service.grantItem(created.id as string, dm, {
        itemIndex: 'spear',
        quantity,
      });
      return { created, dm };
    }

    it('removes the whole stack when no quantity is given', async () => {
      const { created, dm } = await makeCampaignCopyWithItem(3);
      const updated = (await service.revokeItem(created.id as string, dm, {
        itemIndex: 'spear',
      })) as unknown as { equipment: Record<string, unknown>[] };
      expect(updated.equipment).toEqual([]);
    });

    it('decrements the stack when a smaller quantity is given', async () => {
      const { created, dm } = await makeCampaignCopyWithItem(3);
      const updated = (await service.revokeItem(created.id as string, dm, {
        itemIndex: 'spear',
        quantity: 1,
      })) as unknown as { equipment: Record<string, unknown>[] };
      expect(updated.equipment).toEqual([
        { itemIndex: 'spear', name: 'Spear', quantity: 2, equipped: false },
      ]);
    });

    it('clamps an over-large quantity to removing the whole stack', async () => {
      const { created, dm } = await makeCampaignCopyWithItem(3);
      const updated = (await service.revokeItem(created.id as string, dm, {
        itemIndex: 'spear',
        quantity: 99,
      })) as unknown as { equipment: Record<string, unknown>[] };
      expect(updated.equipment).toEqual([]);
    });

    it('rejects removing an item the character does not have', async () => {
      const { created, dm } = await makeCampaignCopyWithItem(1);
      await expect(
        service.revokeItem(created.id as string, dm, {
          itemIndex: 'longsword',
        }),
      ).rejects.toThrow(NotFoundException);
    });

    it('rejects a caller who does not DM the character campaign', async () => {
      const { created } = await makeCampaignCopyWithItem(1);
      await expect(
        service.revokeItem(created.id as string, owner, { itemIndex: 'spear' }),
      ).rejects.toThrow(ForbiddenException);
    });
  });
});
