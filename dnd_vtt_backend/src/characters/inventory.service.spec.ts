import { randomUUID } from 'crypto';
import { createTestDb } from '../common/test-db.util';
import { DatabaseService } from '../common/database.service';
import { ContentService } from '../content/content.service';
import { EncounterPresenceGateway } from '../encounters/encounter-presence.gateway';
import { RequestUser } from '../common/current-user.decorator';
import { InventoryService } from './inventory.service';
import { ItemInstance, migrateInventory } from './inventory-rules';
import { CharactersService } from './characters.service';

describe('authoritative inventory', () => {
  let db: DatabaseService;
  let cleanup: () => void;
  let service: InventoryService;
  let owner: RequestUser;
  let dm: RequestUser;
  let campaign: string;
  let characterId: string;
  const equipment = [
    {
      itemIndex: 'tinkers-tools',
      name: "Tinker's Tools",
      quantity: 1,
      equipped: false,
    },
  ];
  async function character(
    data: Record<string, unknown> = {},
    ownerId = owner.id,
  ) {
    const id = randomUUID();
    const state = {
      enabled_sources: ['EFA', 'XGE'],
      current_hp: 1,
      max_hp: 24,
      classes: [
        {
          name: 'Artificer',
          level: 3,
          subclass: 'Battle Smith',
          choices: {
            magic_item_plans: [
              'Returning Weapon',
              'Repeating Shot',
              'Bag of Holding',
              'Wand of the War Mage +1',
            ],
          },
        },
      ],
      equipment,
      ...data,
    };
    await db.execute(
      'INSERT INTO characters(id,user_id,name,race,class,level,data,campaign_id) VALUES(?,?,?,?,?,?,?,?)',
      [
        id,
        ownerId,
        'Alberto',
        'Gnome',
        'Artificer',
        3,
        JSON.stringify(state),
        campaign,
      ],
    );
    await service.initialize(id);
    return id;
  }
  async function state(id = characterId) {
    return (await service.decorate(id, {})) as {
      equipment: ItemInstance[];
      replicated_items: ItemInstance[];
      attuned_items: ItemInstance[];
    };
  }
  const rest = (
    creations: Record<string, unknown>[],
    extra: Record<string, unknown> = {},
  ) =>
    service.rest(characterId, owner, {
      requestId: randomUUID(),
      toolsConfirmed: true,
      creations,
      ...extra,
    });
  beforeEach(async () => {
    ({ db, cleanup } = await createTestDb());
    const profile = async () => {
      const id = randomUUID();
      await db.execute(
        'INSERT INTO profiles(id,email,username,password_hash,role) VALUES(?,?,?,?,?)',
        [id, id + '@test.com', id, 'hash', 'player'],
      );
      return { id, role: 'player' } as RequestUser;
    };
    owner = await profile();
    dm = await profile();
    campaign = randomUUID();
    await db.execute(
      'INSERT INTO campaigns(id,dm_id,name,join_code) VALUES(?,?,?,?)',
      [campaign, dm.id, 'Test', randomUUID().slice(0, 8)],
    );
    service = new InventoryService(db, new ContentService(db), {
      notifyCharacterUpdated: jest.fn(),
    } as unknown as EncounterPresenceGateway);
    characterId = await character();
    await db.execute(
      'INSERT INTO campaign_members(id,campaign_id,user_id,character_id,status) VALUES(?,?,?,?,?)',
      [randomUUID(), campaign, owner.id, characterId, 'active'],
    );
  });
  afterEach(() => cleanup());

  it('creates a concrete weapon, preserves base statistics, and retries without duplicating', async () => {
    const command = {
      requestId: randomUUID(),
      toolsConfirmed: true,
      creations: [{ planId: 'returning-weapon', baseItemIndex: 'dagger' }],
    };
    await service.rest(characterId, owner, command);
    await service.rest(characterId, owner, command);
    const result = await state();
    expect(result.replicated_items).toHaveLength(1);
    const weapon = result.replicated_items[0];
    expect(weapon.name).toBe('Returning Dagger +1');
    expect(weapon.resolvedItem).toMatchObject({
      type: 'weapon',
      damage: '1d4',
      enhancement_bonus: 1,
    });
    expect(weapon.resolvedItem?.properties).toContain('Thrown (range 20/60)');
    await service.operate(characterId, weapon.instanceId, owner, {
      action: 'equip',
      equipped: true,
    });
    expect((await state()).replicated_items[0].equipped).toBe(true);
    expect((await state()).attuned_items).toHaveLength(0);
  });

  it('rolls back the entire rest for an ineligible base or an unlearned plan', async () => {
    await expect(
      rest([{ planId: 'returning-weapon', baseItemIndex: 'longbow' }]),
    ).rejects.toThrow('eligible base');
    await expect(rest([{ planId: 'goggles-of-night' }])).rejects.toThrow(
      'learned',
    );
    expect((await state()).replicated_items).toHaveLength(0);
    const raw = (
      await db.execute('SELECT data FROM characters WHERE id=?', [characterId])
    ).rows[0];
    expect(
      (JSON.parse(raw.data as string) as { current_hp: number }).current_hp,
    ).toBe(1);
  });

  it('requires tools and respects source and multiclass Artificer level', async () => {
    await expect(
      rest([{ planId: 'returning-weapon', baseItemIndex: 'dagger' }], {
        toolsConfirmed: false,
      }),
    ).rejects.toThrow('Tools');
    const low = await character({
      classes: [
        {
          name: 'Artificer',
          level: 1,
          choices: { magic_item_plans: ['Returning Weapon'] },
        },
        { name: 'Fighter', level: 10 },
      ],
    });
    await expect(
      service.rest(low, owner, {
        requestId: randomUUID(),
        toolsConfirmed: true,
        creations: [{ planId: 'returning-weapon', baseItemIndex: 'dagger' }],
      }),
    ).rejects.toThrow('not available');
  });

  it('keeps creations across rests and replaces them wherever they were handed off', async () => {
    await rest([{ planId: 'returning-weapon', baseItemIndex: 'dagger' }]);
    const original = (await state()).replicated_items[0];
    const recipient = await character();
    await service.operate(characterId, original.instanceId, owner, {
      action: 'transfer',
      targetId: recipient,
    });
    expect((await state()).replicated_items).toHaveLength(1);
    expect(
      (await state(recipient)).equipment.find(
        (e) => e.instanceId === original.instanceId,
      )?.equipped,
    ).toBe(false);
    await rest([]);
    expect((await state()).replicated_items[0].instanceId).toBe(
      original.instanceId,
    );
    await rest([{ planId: 'returning-weapon', baseItemIndex: 'javelin' }]);
    expect(
      (await state(recipient)).equipment.some(
        (e) => e.instanceId === original.instanceId,
      ),
    ).toBe(false);
    expect((await state()).replicated_items[0].name).toBe(
      'Returning Javelin +1',
    );
  });

  it('ends the oldest creation on overflow without affecting mundane inventory', async () => {
    await rest([
      { planId: 'returning-weapon', baseItemIndex: 'dagger' },
      { planId: 'bag-of-holding' },
    ]);
    await rest([{ planId: 'repeating-shot', baseItemIndex: 'light-crossbow' }]);
    const result = await state();
    expect(result.replicated_items).toHaveLength(2);
    expect(result.equipment.some((e) => e.itemIndex === 'tinkers-tools')).toBe(
      true,
    );
  });

  it('does not auto-attune and preserves the previous bond during handoff until reattuned', async () => {
    await rest([
      {
        planId: 'repeating-shot',
        baseItemIndex: 'light-crossbow',
        attune: true,
      },
    ]);
    const item = (await state()).replicated_items[0];
    expect(
      item.resolvedItem?.properties?.some((p) => p.startsWith('Loading')),
    ).toBe(false);
    const recipient = await character();
    await service.operate(characterId, item.instanceId, owner, {
      action: 'transfer',
      targetId: recipient,
    });
    expect((await state()).attuned_items).toHaveLength(1);
    expect((await state(recipient)).attuned_items).toHaveLength(0);
    await service.operate(recipient, item.instanceId, owner, {
      action: 'attune',
    });
    expect((await state()).attuned_items).toHaveLength(0);
    expect((await state(recipient)).attuned_items).toHaveLength(1);
  });

  it('tracks duplicate item charges independently and does not recover dawn charges at rest', async () => {
    await service.grant(characterId, dm, 'wand-of-secrets', 2);
    const wands = (await state()).equipment.filter(
      (e) => e.itemIndex === 'wand-of-secrets',
    );
    expect(new Set(wands.map((w) => w.instanceId)).size).toBe(2);
    await service.operate(characterId, wands[0].instanceId, owner, {
      action: 'use',
    });
    await rest([]);
    const result = (await state()).equipment.filter(
      (e) => e.itemIndex === 'wand-of-secrets',
    );
    expect(result.map((e) => e.chargesUsed ?? 0)).toEqual([1, 0]);
    await service.operate(characterId, wands[0].instanceId, owner, {
      action: 'recover',
      event: 'dawn',
    });
    expect(
      (await state()).equipment.find(
        (e) => e.instanceId === wands[0].instanceId,
      )?.chargesUsed,
    ).toBe(0);
  });

  it('migrates ambiguous replicas without inventing a base and repairs in the same slot', async () => {
    const id = await character({
      replicated_items: [
        {
          itemIndex: 'returning-weapon',
          planName: 'Returning Weapon',
          equipped: true,
          createdAt: '2026-01-01',
        },
      ],
    });
    const legacy = (await state(id)).replicated_items[0];
    expect(legacy.needsBase).toBe(true);
    expect(legacy.attuned).toBe(false);
    await service.operate(id, legacy.instanceId, owner, {
      action: 'repair',
      baseItemIndex: 'dagger',
    });
    await service.initialize(id);
    expect((await state(id)).replicated_items).toHaveLength(1);
    expect((await state(id)).replicated_items[0].instanceId).toBe(
      legacy.instanceId,
    );
    const cloned = migrateInventory('clone', {
      equipment: (await state(id)).equipment,
      replicated_items: (await state(id)).replicated_items,
    });
    expect(cloned.filter((e) => e.origin)).toHaveLength(1);
    expect(cloned.find((e) => e.origin)?.origin?.creatorId).toBe('clone');
    expect(cloned.every((e) => e.instanceId !== legacy.instanceId)).toBe(true);
  });

  it('rejects unauthorized operations and exposes every learned plan', async () => {
    const opts = await service.options(characterId, owner);
    expect(opts.plans.map((p) => p.supported)).toEqual([
      true,
      true,
      true,
      true,
    ]);
    await expect(
      service.rest(characterId, owner, {
        requestId: randomUUID(),
        correction: true,
      }),
    ).rejects.toThrow('DM');
    const tool = (await state()).equipment[0];
    await expect(
      service.operate(
        characterId,
        tool.instanceId,
        { id: 'outsider' } as RequestUser,
        { action: 'equip' },
      ),
    ).rejects.toThrow();
    await expect(
      rest([{ planId: 'bag-of-holding' }, { planId: 'bag-of-holding' }]),
    ).rejects.toThrow('different plans');
  });

  it('does not allow stale full-sheet saves to recreate or overwrite item state', async () => {
    const content = new ContentService(db);
    const chars = new CharactersService(
      db,
      content,
      {
        notifyCharacterUpdated: jest.fn(),
      } as unknown as EncounterPresenceGateway,
      undefined,
      service,
    );
    const stale = await chars.findOneReadable(characterId, owner);
    await rest([{ planId: 'returning-weapon', baseItemIndex: 'dagger' }]);
    await chars.update(characterId, owner, {
      ...stale,
      replicated_items: [],
      equipment: [],
    });
    expect((await state()).replicated_items).toHaveLength(1);
    expect((await state()).equipment).toHaveLength(2);
  });

  it('enforces duplicate attunement, capacity, and atomic optional attunement', async () => {
    for (const index of [
      'manifold-tool',
      'wand-of-the-war-mage-plus-1',
      'charlatans-die',
    ]) {
      await service.grant(characterId, dm, index, 1);
      const entry = (await state()).equipment.find(
        (e) => e.itemIndex === index,
      )!;
      await service.operate(characterId, entry.instanceId, owner, {
        action: 'attune',
      });
    }
    await expect(
      rest([
        {
          planId: 'repeating-shot',
          baseItemIndex: 'light-crossbow',
          attune: true,
        },
      ]),
    ).rejects.toThrow('slots');
    expect((await state()).replicated_items).toHaveLength(0);
    await service.grant(characterId, dm, 'manifold-tool', 1);
    const tools = (await state()).equipment.filter(
      (e) => e.itemIndex === 'manifold-tool',
    );
    await service.operate(
      characterId,
      (await state()).equipment.find((e) => e.itemIndex === 'charlatans-die')!
        .instanceId,
      owner,
      { action: 'unattune' },
    );
    await expect(
      service.operate(characterId, tools[1].instanceId, owner, {
        action: 'attune',
      }),
    ).rejects.toThrow('another copy');
  });

  it('supports separately learned Common plans and rejects disabled sources', async () => {
    const id = await character({
      classes: [
        {
          name: 'Artificer',
          level: 3,
          choices: {
            magic_item_plans: [
              'Common Magic Item: wand-of-smiles',
              'Common Magic Item: cloak-of-billowing',
            ],
          },
        },
      ],
    });
    const options = await service.options(id, owner);
    expect(options.plans.every((p) => p.supported)).toBe(true);
    await service.rest(id, owner, {
      requestId: randomUUID(),
      toolsConfirmed: true,
      creations: [
        { planId: 'common:wand-of-smiles' },
        { planId: 'common:cloak-of-billowing' },
      ],
    });
    expect((await state(id)).replicated_items).toHaveLength(2);
    const disabled = await character({
      enabled_sources: ['EFA'],
      classes: [
        {
          name: 'Artificer',
          level: 3,
          choices: { magic_item_plans: ['Common Magic Item: wand-of-smiles'] },
        },
      ],
    });
    await expect(
      service.rest(disabled, owner, {
        requestId: randomUUID(),
        toolsConfirmed: true,
        creations: [{ planId: 'common:wand-of-smiles' }],
      }),
    ).rejects.toThrow('not eligible');
  });

  it('serializes simultaneous item uses and rejects cross-campaign transfers', async () => {
    await service.grant(characterId, dm, 'wand-of-secrets', 1);
    const wand = (await state()).equipment.find(
      (e) => e.itemIndex === 'wand-of-secrets',
    )!;
    await Promise.all(
      [1, 2].map(() =>
        service.operate(characterId, wand.instanceId, owner, { action: 'use' }),
      ),
    );
    expect(
      (await state()).equipment.find((e) => e.instanceId === wand.instanceId)
        ?.chargesUsed,
    ).toBe(2);
    const target = await character();
    await db.execute('UPDATE characters SET campaign_id=NULL WHERE id=?', [
      target,
    ]);
    await expect(
      service.operate(characterId, wand.instanceId, owner, {
        action: 'transfer',
        targetId: target,
      }),
    ).rejects.toThrow('campaign');
  });

  it('rolls back recovery, creations and the retry token if the transaction fails', async () => {
    await db.execute(`CREATE TRIGGER fail_inventory_insert BEFORE INSERT ON inventory_instances
      WHEN json_extract(NEW.data, '$.itemIndex')='returning-weapon'
      BEGIN SELECT RAISE(ABORT, 'test failure'); END`);
    const requestId = randomUUID();
    await expect(
      rest([{ planId: 'returning-weapon', baseItemIndex: 'dagger' }], {
        requestId,
      }),
    ).rejects.toThrow();
    expect((await state()).replicated_items).toHaveLength(0);
    expect(
      (
        await db.execute(
          'SELECT request_id FROM inventory_requests WHERE request_id=?',
          [requestId],
        )
      ).rows,
    ).toHaveLength(0);
    const raw = (
      await db.execute('SELECT data FROM characters WHERE id=?', [characterId])
    ).rows[0];
    expect(
      (JSON.parse(raw.data as string) as { current_hp: number }).current_hp,
    ).toBe(1);
  });

  it('tracks item spell Concentration atomically and requires confirmation before replacement', async () => {
    await service.grant(characterId, dm, 'wand-of-magic-detection', 1);
    const wand = (await state()).equipment.find(
      (e) => e.itemIndex === 'wand-of-magic-detection',
    )!;
    await service.operate(characterId, wand.instanceId, owner, {
      action: 'use',
    });
    const raw = (
      await db.execute('SELECT data FROM characters WHERE id=?', [characterId])
    ).rows[0];
    expect(
      (
        JSON.parse(raw.data as string) as {
          active_concentration: { spellIndex: string };
        }
      ).active_concentration.spellIndex,
    ).toBe('detect-magic');
    await expect(
      service.operate(characterId, wand.instanceId, owner, { action: 'use' }),
    ).rejects.toThrow('Concentration');
    expect(
      (await state()).equipment.find((e) => e.instanceId === wand.instanceId)
        ?.chargesUsed,
    ).toBe(1);
  });

  it('leaves draft equipment editable until character creation is complete', async () => {
    const chars = new CharactersService(
      db,
      new ContentService(db),
      {
        notifyCharacterUpdated: jest.fn(),
      } as unknown as EncounterPresenceGateway,
      undefined,
      service,
    );
    const draft = await chars.createDraft(owner.id, {
      name: 'Draft',
      equipment: [],
    });
    await chars.updateDraft(draft.id as string, owner, {
      ...draft,
      equipment,
      draft_step: 4,
    });
    await db.execute(
      "UPDATE characters SET creation_status='complete' WHERE id=?",
      [draft.id],
    );
    const completed = await chars.findOneReadable(draft.id as string, owner);
    expect(
      typeof (completed as unknown as { equipment: ItemInstance[] })
        .equipment[0].instanceId,
    ).toBe('string');
    expect(
      (completed as unknown as { equipment: ItemInstance[] }).equipment[0],
    ).toMatchObject({
      itemIndex: 'tinkers-tools',
    });
  });
});
