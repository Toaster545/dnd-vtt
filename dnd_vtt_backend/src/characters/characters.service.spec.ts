import {
  BadRequestException,
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

  it('autosaves and resumes a draft, then validates completion', async () => {
    const draft = await service.createDraft(ownerId, {
      name: 'Aria',
      draft_step: 2,
    });
    expect(draft).toMatchObject({ creation_status: 'draft', draft_step: 2 });
    const updated = await service.updateDraft(draft.id as string, owner, {
      ...draft,
      race: 'Elf',
      class: 'Wizard',
      draft_step: 4,
    });
    expect(updated).toMatchObject({ creation_status: 'draft', draft_step: 4 });
    await expect(
      service.completeDraft(draft.id as string, owner),
    ).rejects.toThrow(BadRequestException);
  });

  it('persists a validated avatar recipe and rejects malformed recipes', async () => {
    const avatarRecipe = {
      schemaVersion: 1,
      styleId: 'lorelei',
      styleVersion: 1,
      seed: 'aria-avatar',
      parts: {
        face: ['variant01'],
        ears: [],
        eyes: ['variant02'],
        eyebrows: ['variant03'],
        nose: ['variant04'],
        mouth: ['happy05'],
        hair: ['variant06'],
        horns: [],
        facialHair: [],
        faceDetails: ['freckles'],
        scars: [],
        tattoos: [],
        piercings: [],
        accessories: ['glasses:variant01'],
      },
      colors: {
        skin: '#f7d7c4',
        hair: '#38251c',
        eyes: '#39704e',
        eyebrows: '#38251c',
        mouth: '#7d2731',
        details: '#68432c',
        piercings: '#c9a227',
        accessories: '#c9a227',
      },
    };
    const created = await service.create(ownerId, {
      name: 'Aria',
      avatar_recipe: avatarRecipe,
    });
    expect(created.avatar_recipe).toEqual(avatarRecipe);

    await expect(
      service.update(created.id as string, owner, {
        ...created,
        avatar_recipe: {
          ...avatarRecipe,
          colors: { ...avatarRecipe.colors, skin: 'javascript:x' },
        },
      }),
    ).rejects.toThrow(BadRequestException);
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
        heroic_inspiration: true,
        currency: { cp: 0, sp: 0, ep: 0, gp: 42, pp: 1 },
        portrait_seed: 'chosen-by-player',
        spell_slot_uses: {
          spellcasting: { '1': 1 },
          'pact:class:warlock': { '2': 2 },
        },
        notes: 'player tried to overwrite notes',
      });

      const blob = updated as unknown as Record<string, unknown>;
      // Whitelisted field (current_hp) goes through...
      expect(blob.current_hp).toBe(5);
      expect(blob.heroic_inspiration).toBe(true);
      // Coin purse and portrait stay player-writable even with the wizard locked.
      expect(blob.currency).toEqual({ cp: 0, sp: 0, ep: 0, gp: 42, pp: 1 });
      expect(blob.portrait_seed).toBe('chosen-by-player');
      expect(blob.spell_slot_uses).toEqual({
        spellcasting: { '1': 1 },
        'pact:class:warlock': { '2': 2 },
      });
      // The character's name is a column, not a data-blob key, but is still player-writable
      // (flavor only, handled separately from PLAYER_EDITABLE_FIELDS — see updatePlayerEditableFields).
      expect(updated.name).toBe('Renamed');
      // ...but notes is outside both whitelists and is left untouched.
      expect(blob.notes).toBe('secret DM notes');
    });

    it('keeps the existing name when a locked player sends a blank one', async () => {
      const { created } = await makeLockedCampaignCopy(false);

      const updated = await service.update(created.id as string, owner, {
        name: '   ',
      });

      expect(updated.name).toBe('Aria');
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

  describe('rest resources', () => {
    it('restores Heroic Inspiration to Humans on a long rest', async () => {
      const created = await service.create(ownerId, {
        name: 'Resourceful Hero',
        race: 'Human',
        class: 'Fighter',
        level: 2,
        classes: [{ name: 'Fighter', level: 2, choices: {} }],
        max_hp: 20,
        current_hp: 4,
        hit_dice_used: 2,
        heroic_inspiration: false,
      });

      const rested = await service.restoreLife(created.id as string, owner, {
        type: 'long_rest',
      });
      expect(rested).toMatchObject({
        current_hp: 20,
        hit_dice_used: 1,
        heroic_inspiration: true,
      });
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

    it('enforces and restores the Potent Dragonmark restricted slot', async () => {
      const created = await service.create(ownerId, {
        name: 'Mira',
        race: 'Human',
        class: 'Wizard',
        level: 8,
        background: 'House Cannith Heir',
        enabled_sources: ['EFA'],
        classes: [
          {
            name: 'Wizard',
            level: 8,
            choices: { 'asi_8:feat': ['potent-dragonmark'] },
          },
        ],
        spell_slot_uses: {},
      });
      const command = {
        spellIndex: 'magic-weapon',
        sourceKey: 'mark-of-making',
        method: 'restricted',
        poolKey: 'restricted:potent_dragonmark_slot',
        slotLevel: 4,
      };

      await service.castSpell(created.id as string, owner, command);
      await expect(
        service.castSpell(created.id as string, owner, command),
      ).rejects.toThrow(ConflictException);
      await expect(
        service.castSpell(created.id as string, owner, {
          ...command,
          spellIndex: 'cure-wounds',
        }),
      ).rejects.toThrow(BadRequestException);

      const rested = await service.restoreSpellcasting(
        created.id as string,
        owner,
        { type: 'short_rest' },
      );
      const state = rested as SpellcastingCharacterState;
      expect(
        state.spell_slot_uses?.['restricted:potent_dragonmark_slot'],
      ).toBeUndefined();
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

  describe('replicateItem', () => {
    async function makeArtificer(
      plans: string[] = ['Returning Weapon', 'Repeating Shot'],
    ) {
      return service.create(ownerId, {
        name: 'Forge',
        class: 'Artificer',
        level: 2,
        classes: [
          {
            name: 'Artificer',
            level: 2,
            choices: { magic_item_plans: plans },
          },
        ],
      });
    }

    it('creates, equips, and dismisses a learned replicated item', async () => {
      const created = await makeArtificer();
      const createdItem = (await service.replicateItem(
        created.id as string,
        owner,
        {
          itemIndex: 'returning-weapon',
          action: 'create',
        },
      )) as unknown as { replicated_items: Record<string, unknown>[] };
      expect(createdItem.replicated_items).toEqual([
        expect.objectContaining({
          itemIndex: 'returning-weapon',
          planName: 'Returning Weapon',
          equipped: false,
        }),
      ]);

      const equipped = (await service.replicateItem(
        created.id as string,
        owner,
        {
          itemIndex: 'returning-weapon',
          action: 'toggle',
        },
      )) as unknown as { replicated_items: Record<string, unknown>[] };
      expect(equipped.replicated_items[0].equipped).toBe(true);

      const dismissed = (await service.replicateItem(
        created.id as string,
        owner,
        {
          itemIndex: 'returning-weapon',
          action: 'dismiss',
        },
      )) as unknown as { replicated_items: Record<string, unknown>[] };
      expect(dismissed.replicated_items).toEqual([]);
    });

    it('rejects items whose plan the Artificer has not learned', async () => {
      const created = await makeArtificer(['Returning Weapon']);
      await expect(
        service.replicateItem(created.id as string, owner, {
          itemIndex: 'repeating-shot',
          action: 'create',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('enforces the replicated-item limit from the Artificer table', async () => {
      const created = await makeArtificer([
        'Returning Weapon',
        'Repeating Shot',
        'Manifold Tool',
      ]);
      for (const itemIndex of ['returning-weapon', 'repeating-shot']) {
        await service.replicateItem(created.id as string, owner, {
          itemIndex,
          action: 'create',
        });
      }
      await expect(
        service.replicateItem(created.id as string, owner, {
          itemIndex: 'manifold-tool',
          action: 'create',
        }),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('updatePactWeapon', () => {
    function makeWarlock(withPact = true) {
      return service.create(ownerId, {
        name: 'Bladebound',
        class: 'Warlock',
        level: 3,
        classes: [
          {
            name: 'Warlock',
            level: 3,
            choices: {
              eldritch_invocations: withPact
                ? ['Pact of the Blade']
                : ['Pact of the Chain'],
            },
          },
        ],
        equipment: [
          { itemIndex: 'dagger', name: 'Dagger', quantity: 1, equipped: false },
        ],
      });
    }

    it('conjures, replaces, bonds, and dismisses one pact weapon', async () => {
      const created = await makeWarlock();
      const conjured = (await service.updatePactWeapon(
        created.id as string,
        owner,
        {
          action: 'conjure',
          itemIndex: 'longsword',
        },
      )) as unknown as { pact_weapon: Record<string, unknown> };
      expect(conjured.pact_weapon).toMatchObject({
        itemIndex: 'longsword',
        name: 'Longsword',
        mode: 'conjured',
      });

      const afterBroadUpdate = (await service.update(
        created.id as string,
        owner,
        {
          name: 'Bladebound',
          class: 'Warlock',
          level: 3,
          classes: created.classes,
          equipment: created.equipment,
          pact_weapon: {
            itemIndex: 'greataxe',
            name: 'Forged Client State',
            mode: 'conjured',
          },
        },
      )) as unknown as { pact_weapon: Record<string, unknown> };
      expect(afterBroadUpdate.pact_weapon).toMatchObject({
        itemIndex: 'longsword',
        name: 'Longsword',
      });

      const bonded = (await service.updatePactWeapon(
        created.id as string,
        owner,
        {
          action: 'bond',
          itemIndex: 'dagger',
        },
      )) as unknown as { pact_weapon: Record<string, unknown> };
      expect(bonded.pact_weapon).toMatchObject({
        itemIndex: 'dagger',
        mode: 'bonded',
      });

      const dismissed = (await service.updatePactWeapon(
        created.id as string,
        owner,
        {
          action: 'dismiss',
        },
      )) as unknown as { pact_weapon?: unknown };
      expect(dismissed.pact_weapon).toBeUndefined();
    });

    it('rejects characters without the invocation and ineligible weapons', async () => {
      const withoutPact = await makeWarlock(false);
      await expect(
        service.updatePactWeapon(withoutPact.id as string, owner, {
          action: 'conjure',
          itemIndex: 'longsword',
        }),
      ).rejects.toThrow(ForbiddenException);

      const withPact = await makeWarlock();
      await expect(
        service.updatePactWeapon(withPact.id as string, owner, {
          action: 'conjure',
          itemIndex: 'longbow',
        }),
      ).rejects.toThrow(BadRequestException);
      await expect(
        service.updatePactWeapon(withPact.id as string, owner, {
          action: 'bond',
          itemIndex: 'longsword',
        }),
      ).rejects.toThrow(BadRequestException);
    });
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
