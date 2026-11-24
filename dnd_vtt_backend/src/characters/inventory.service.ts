import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomInt, randomUUID } from 'crypto';
import { DatabaseService } from '../common/database.service';
import { withCharacterLock } from '../common/character-lock';
import { RequestUser } from '../common/current-user.decorator';
import { ContentService } from '../content/content.service';
import { EncounterPresenceGateway } from '../encounters/encounter-presence.gateway';
import {
  eligibleBase,
  eligibleCommon,
  ItemDefinition,
  ItemInstance,
  MagicPlan,
  migrateInventory,
  records,
  resolveItem,
} from './inventory-rules';

interface Stored {
  id: string;
  holder: string | null;
  creator: string | null;
  attuned: string | null;
  entry: ItemInstance;
}
type CharacterRecord = Record<string, any>;
interface Creation {
  planId: string;
  baseItemIndex?: string;
  itemIndex?: string;
  attune?: boolean;
}

@Injectable()
export class InventoryService {
  constructor(
    private db: DatabaseService,
    private content: ContentService,
    private presence: EncounterPresenceGateway,
  ) {}

  plans(): MagicPlan[] {
    return this.content.getMagicItemPlans();
  }
  private async character(
    id: string,
    user?: RequestUser,
  ): Promise<CharacterRecord> {
    const row = (
      await this.db.execute(
        'SELECT ch.*, c.dm_id FROM characters ch LEFT JOIN campaigns c ON c.id=ch.campaign_id WHERE ch.id=?',
        [id],
      )
    ).rows[0];
    if (!row) throw new NotFoundException('Character not found');
    if (user && row.user_id !== user.id && row.dm_id !== user.id)
      throw new ForbiddenException();
    return {
      ...this.db.parseJson<Record<string, unknown>>(row.data as string, {}),
      ...row,
    };
  }
  // A campaign's DM manages its characters' inventories; a character outside any campaign
  // has no DM, so its owner manages it directly.
  private canManage(char: CharacterRecord, user: RequestUser) {
    return char.campaign_id ? char.dm_id === user.id : char.user_id === user.id;
  }
  private data(char: CharacterRecord): Record<string, any> {
    return this.db.parseJson<Record<string, any>>(char.data as string, {});
  }
  async initialize(id: string) {
    return withCharacterLock(`inventory-init:${id}`, () =>
      this.initializeUnlocked(id),
    );
  }
  private async initializeUnlocked(id: string) {
    const char = await this.character(id);
    if (char.inventory_version === 1) return;
    const data = this.data(char);
    const definitions = new Map<string, ItemDefinition>();
    for (const raw of records(data.equipment)) {
      try {
        const item = await this.definition(String(raw.itemIndex));
        definitions.set(item.index, item);
      } catch {
        /* Preserve unavailable content. */
      }
    }
    const entries = migrateInventory(id, data, definitions);
    data.equipment = entries;
    data.replicated_items = entries.filter((e) => e.origin);
    data.inventory_version = 1;
    await this.db.executeMany([
      ...entries.map((entry) => ({
        sql: 'INSERT INTO inventory_instances(id,holder_id,creator_id,attuned_to,data) VALUES(?,?,?,?,?)',
        args: [
          entry.instanceId,
          id,
          entry.origin?.creatorId ?? null,
          entry.attuned ? id : null,
          JSON.stringify(entry),
        ],
      })),
      {
        sql: 'UPDATE characters SET data=? WHERE id=?',
        args: [JSON.stringify(data), id],
      },
    ]);
  }
  private async stored(): Promise<Stored[]> {
    return (
      await this.db.execute('SELECT * FROM inventory_instances')
    ).rows.map((row) => ({
      id: row.id as string,
      holder: row.holder_id as string | null,
      creator: row.creator_id as string | null,
      attuned: row.attuned_to as string | null,
      entry: this.db.parseJson<ItemInstance>(
        row.data as string,
        {} as ItemInstance,
      ),
    }));
  }
  private async definition(index: string): Promise<ItemDefinition> {
    return (await this.content.getItem(index)) as unknown as ItemDefinition;
  }
  private async resolved(
    row: Stored,
    characterId: string,
  ): Promise<ItemInstance> {
    const entry = {
      ...row.entry,
      instanceId: row.id,
      attuned: row.attuned === characterId,
    };
    try {
      const template = await this.definition(entry.itemIndex);
      if (template.category.includes('Template') && !template.variant) {
        entry.unresolved = true;
        delete entry.resolvedItem;
        return entry;
      }
      const base = entry.baseItemIndex
        ? await this.definition(entry.baseItemIndex)
        : undefined;
      entry.resolvedItem = resolveItem(entry, template, base);
      entry.needsBase = !!template.variant && !entry.resolvedItem;
      entry.unresolved = false;
      if (entry.resolvedItem) entry.name = this.display(entry.resolvedItem);
    } catch {
      entry.unresolved = true;
      delete entry.resolvedItem;
    }
    return entry;
  }
  private display(item: ItemDefinition) {
    return (
      item.name + (item.enhancement_bonus ? ` +${item.enhancement_bonus}` : '')
    );
  }
  private async projection(id: string, all: Stored[]) {
    const names = new Map(
      (await this.db.execute('SELECT id,name FROM characters')).rows.map(
        (r) => [r.id as string, r.name as string],
      ),
    );
    return {
      inventory_version: 1,
      equipment: await Promise.all(
        all.filter((r) => r.holder === id).map((r) => this.resolved(r, id)),
      ),
      replicated_items: await Promise.all(
        all
          .filter((r) => r.creator === id)
          .map(async (r) => ({
            ...(await this.resolved(r, id)),
            holderId: r.holder,
            holderName: names.get(r.holder ?? '') ?? 'Unheld',
            planName: r.entry.origin?.planName,
          })),
      ),
      attuned_items: await Promise.all(
        all.filter((r) => r.attuned === id).map((r) => this.resolved(r, id)),
      ),
    };
  }
  async decorate<T extends Record<string, unknown>>(
    id: string,
    data: T,
  ): Promise<T> {
    if ((await this.character(id)).creation_status === 'draft') return data;
    await this.initialize(id);
    return { ...data, ...(await this.projection(id, await this.stored())) };
  }
  private async commit(
    before: Stored[],
    after: Stored[],
    changes: Map<string, Record<string, any>> = new Map(),
    extra: { sql: string; args?: any[] }[] = [],
  ) {
    const affected = new Set(changes.keys());
    const statements = [...extra];
    for (const old of before)
      if (!after.some((r) => r.id === old.id)) {
        statements.push({
          sql: 'DELETE FROM inventory_instances WHERE id=?',
          args: [old.id],
        });
        for (const id of [old.holder, old.creator, old.attuned])
          if (id) affected.add(id);
      }
    for (const row of after) {
      const old = before.find((r) => r.id === row.id);
      if (JSON.stringify(old) === JSON.stringify(row)) continue;
      for (const id of [
        row.holder,
        row.creator,
        row.attuned,
        old?.holder,
        old?.creator,
        old?.attuned,
      ])
        if (id) affected.add(id);
      statements.push({
        sql: 'INSERT INTO inventory_instances(id,holder_id,creator_id,attuned_to,data) VALUES(?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET holder_id=excluded.holder_id,creator_id=excluded.creator_id,attuned_to=excluded.attuned_to,data=excluded.data',
        args: [
          row.id,
          row.holder,
          row.creator,
          row.attuned,
          JSON.stringify(row.entry),
        ],
      });
    }
    for (const id of affected) {
      const char = await this.character(id);
      const data = {
        ...(changes.get(id) ?? this.data(char)),
        ...(await this.projection(id, after)),
      };
      statements.push({
        sql: 'UPDATE characters SET data=?,updated_at=? WHERE id=?',
        args: [JSON.stringify(data), new Date().toISOString(), id],
      });
    }
    if (statements.length) await this.db.executeMany(statements);
    for (const id of affected) {
      const char = await this.character(id);
      if (char.campaign_id)
        this.presence.notifyCharacterUpdated(char.campaign_id as string, id);
    }
  }
  // Deterministic ordering prevents transfer/rest deadlocks. Resource operations use the same character queues.
  private async locked<T>(
    id: string,
    target: string | undefined,
    work: (all: Stored[]) => Promise<T>,
  ): Promise<T> {
    return withCharacterLock('inventory', async () => {
      const all = await this.stored();
      const related = all.filter(
        (r) =>
          [r.holder, r.creator, r.attuned].includes(id) || r.holder === target,
      );
      const ids = [
        ...new Set(
          [
            id,
            target,
            ...related.flatMap((r) => [r.holder, r.creator, r.attuned]),
          ].filter((v): v is string => !!v),
        ),
      ].sort();
      const run = (i: number): Promise<T> =>
        i === ids.length
          ? work(all)
          : withCharacterLock(ids[i], () => run(i + 1));
      return run(0);
    });
  }
  private artificer(char: CharacterRecord) {
    const cls = records(char.classes).find(
      (c) => String(c.name).toLowerCase() === 'artificer',
    );
    const level = Number(cls?.level ?? 0);
    const choices = (cls?.choices ?? {}) as Record<string, string[]>;
    const classData = this.content.getClass('artificer') as {
      levels: {
        level: number;
        class_specific?: { replicated_items?: number; plans_known?: number };
      }[];
    };
    return {
      level,
      learned: choices.magic_item_plans ?? [],
      limit:
        classData.levels.find((l) => l.level === level)?.class_specific
          ?.replicated_items ?? 0,
    };
  }
  async options(id: string, user: RequestUser) {
    const char = await this.character(id, user);
    const art = this.artificer(char);
    const items = (await this.content.getItems(
      char.campaign_id as string | undefined,
      user,
    )) as unknown as ItemDefinition[];
    const plans = this.plans();
    const learned = art.learned.map((name) => {
      const commonIndex = name.startsWith('Common Magic Item: ')
        ? name.slice(19)
        : undefined;
      const plan = plans.find(
        (p) => p.name === (commonIndex ? 'Common Magic Item' : name),
      );
      return {
        ...plan,
        name: commonIndex
          ? `Common Magic Item: ${items.find((i) => i.index === commonIndex)?.name ?? commonIndex}`
          : name,
        id: commonIndex ? `common:${commonIndex}` : (plan?.id ?? name),
        itemIndex: commonIndex ?? plan?.itemIndex,
        supported:
          !!plan && plan.level <= art.level && (!plan.common || !!commonIndex),
        bases: plan?.baseFilter
          ? items
              .filter((i) => eligibleBase(i, plan.baseFilter!))
              .map((i) => ({ index: i.index, name: i.name }))
          : [],
      };
    });
    const targets = char.campaign_id
      ? (
          await this.db.execute(
            'SELECT id,name FROM characters WHERE campaign_id=? AND id<>?',
            [char.campaign_id, id],
          )
        ).rows
      : [];
    return {
      plans: learned,
      limit: art.limit,
      targets,
      commonItems: items.filter((i) =>
        eligibleCommon(i, (char.enabled_sources ?? []) as string[]),
      ),
    };
  }
  private async attune(
    row: Stored,
    id: string,
    all: Stored[],
    char: CharacterRecord,
  ) {
    const item = (await this.resolved(row, id)).resolvedItem;
    if (!item?.requires_attunement)
      throw new BadRequestException('This item does not require attunement.');
    const classes = records(char.classes);
    if (typeof item.requires_attunement === 'string') {
      const req = item.requires_attunement.toLowerCase();
      const spellcaster =
        classes.some((c) => {
          const definition = this.content.getClass(
            String(c.name).toLowerCase(),
          ) as { spellcasting_ability?: unknown };
          return !!definition.spellcasting_ability;
        }) || records(char.spells).length > 0;
      if (
        (req.includes('spellcaster') && !spellcaster) ||
        (!req.includes('spellcaster') &&
          !classes.some((c) => req.includes(String(c.name).toLowerCase())))
      )
        throw new BadRequestException('Attunement requirements are not met.');
    }
    const limits = [3];
    const visit = (
      grants: Record<string, unknown>[],
      choices: Record<string, string[]>,
    ) => {
      for (const grant of grants) {
        for (const effect of records(grant.effects))
          if (effect.type === 'attunement_slot_override')
            limits.push(Number(effect.value));
        if (grant.type === 'choice')
          for (const option of records(grant.options)) {
            if (
              (choices[String(grant.key)] ?? []).includes(String(option.name))
            )
              visit(records(option.grants), choices);
          }
      }
    };
    for (const cls of classes) {
      const definition = this.content.getClass(String(cls.name).toLowerCase());
      const subclass = records(definition.subclasses).find(
        (s) => s.name === cls.subclass,
      );
      for (const level of [
        ...records(definition.levels),
        ...records(subclass?.levels),
      ]) {
        if (Number(level.level) <= Number(cls.level))
          visit(
            records(level.grants),
            (cls.choices ?? {}) as Record<string, string[]>,
          );
      }
    }
    const limit = Math.max(...limits);
    const others = all.filter((r) => r.attuned === id && r.id !== row.id);
    if (others.length >= limit)
      throw new ConflictException('No free attunement slots.');
    if (others.some((r) => r.entry.itemIndex === row.entry.itemIndex))
      throw new ConflictException(
        'Already attuned to another copy of this item.',
      );
    row.attuned = id;
  }
  async operate(
    id: string,
    instanceId: string,
    user: RequestUser,
    body: Record<string, any>,
  ) {
    const char = await this.character(id, user);
    await this.initialize(id);
    if (body.action === 'transfer') {
      const target = await this.character(String(body.targetId));
      if (
        !char.campaign_id ||
        target.campaign_id !== char.campaign_id ||
        target.id === id
      )
        throw new BadRequestException(
          'Choose another character in this campaign.',
        );
      await this.initialize(String(target.id));
    }
    await this.locked(
      id,
      body.targetId as string | undefined,
      async (before) => {
        const all = structuredClone(before);
        const row = all.find(
          (r) => r.id === instanceId && (r.holder === id || r.attuned === id),
        );
        if (!row) throw new NotFoundException('Inventory item not found');
        const item = (await this.resolved(row, id)).resolvedItem;
        const changes = new Map<string, Record<string, any>>();
        if (body.action !== 'unattune' && row.holder !== id)
          throw new ForbiddenException('Only the holder can use this item.');
        switch (body.action) {
          case 'equip':
            if (!item)
              throw new BadRequestException(
                'Choose a base item or repair this item first.',
              );
            row.entry.equipped = body.equipped === true;
            break;
          case 'attune':
            await this.attune(row, id, all, await this.character(id));
            break;
          case 'unattune':
            if (row.attuned !== id) throw new ForbiddenException();
            row.attuned = null;
            break;
          case 'repair': {
            const template = await this.definition(row.entry.itemIndex);
            if (row.entry.baseItemIndex || !template.variant)
              throw new BadRequestException(
                'This item does not need a weapon selection.',
              );
            const base = await this.definition(String(body.baseItemIndex));
            if (!eligibleBase(base, template.variant.baseFilter))
              throw new BadRequestException('Ineligible base weapon.');
            row.entry.baseItemIndex = base.index;
            break;
          }
          case 'use': {
            if (!item?.charges)
              throw new BadRequestException(
                'This item has no tracked charges.',
              );
            if (item.requires_attunement && row.attuned !== id)
              throw new BadRequestException('Attune to this item first.');
            const amount = Number(body.amount ?? 1);
            if (
              !Number.isInteger(amount) ||
              amount < 1 ||
              (row.entry.chargesUsed ?? 0) + amount > item.charges.max
            )
              throw new ConflictException('Not enough charges.');
            if (item.spell?.concentration) {
              const current = this.data(await this.character(id));
              if (current.active_concentration && !body.replaceConcentration)
                throw new ConflictException(
                  'Confirm replacing your current Concentration spell.',
                );
              current.active_concentration = {
                spellIndex: item.spell.index,
                name: item.spell.name,
                sourceKey: `item:${row.id}`,
                startedAt: new Date().toISOString(),
              };
              changes.set(id, current);
            }
            row.entry.chargesUsed = (row.entry.chargesUsed ?? 0) + amount;
            break;
          }
          case 'recover': {
            if (!item?.charges || body.event !== item.charges.recovery)
              throw new BadRequestException(
                'Confirm the listed recharge event.',
              );
            const formula = item.charges.restore;
            const die = formula?.match(/^1d(\d+)$/);
            const amount =
              formula === 'all'
                ? item.charges.max
                : die
                  ? randomInt(1, Number(die[1]) + 1)
                  : Number(body.amount);
            if (
              !Number.isInteger(amount) ||
              amount < 0 ||
              amount > item.charges.max
            )
              throw new BadRequestException(
                'Enter the amount recovered under this item’s recharge rule.',
              );
            row.entry.chargesUsed = Math.max(
              0,
              (row.entry.chargesUsed ?? 0) - amount,
            );
            break;
          }
          case 'transfer': {
            const target = await this.character(String(body.targetId));
            if (
              !char.campaign_id ||
              target.campaign_id !== char.campaign_id ||
              target.id === id
            )
              throw new BadRequestException(
                'Choose another character in this campaign.',
              );
            row.holder = String(target.id);
            row.entry.equipped = false;
            break;
          }
          case 'remove':
            if (!this.canManage(char, user))
              throw new ForbiddenException(
                'Only the campaign DM can remove inventory.',
              );
            all.splice(all.indexOf(row), 1);
            break;
          default:
            throw new BadRequestException('Unknown inventory operation.');
        }
        await this.commit(before, all, changes);
      },
    );
  }
  async grant(
    id: string,
    user: RequestUser,
    itemIndex: string,
    quantity: number,
  ) {
    const char = await this.character(id, user);
    if (!this.canManage(char, user))
      throw new ForbiddenException('Only the campaign DM can give items.');
    const item = await this.definition(itemIndex);
    if (item.variant)
      throw new BadRequestException(
        'Choose a concrete item rather than a weapon template.',
      );
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > 1000)
      throw new BadRequestException('Invalid quantity.');
    await this.initialize(id);
    await this.locked(id, undefined, async (before) => {
      const all = structuredClone(before);
      const count = item.rarity ? quantity : 1;
      for (let i = 0; i < count; i++) {
        const instanceId = randomUUID();
        all.push({
          id: instanceId,
          holder: id,
          creator: null,
          attuned: null,
          entry: {
            instanceId,
            itemIndex,
            name: this.display(item),
            quantity: item.rarity ? 1 : quantity,
            equipped: false,
          },
        });
      }
      await this.commit(before, all);
    });
  }
  async rest(id: string, user: RequestUser, body: Record<string, any>) {
    await this.character(id, user);
    await this.initialize(id);
    if (
      typeof body.requestId !== 'string' ||
      !body.requestId.trim() ||
      body.requestId.length > 100
    )
      throw new BadRequestException('A retry identifier is required.');
    await this.locked(id, undefined, async (before) => {
      if (
        (
          await this.db.execute(
            'SELECT request_id FROM inventory_requests WHERE character_id=? AND request_id=?',
            [id, body.requestId],
          )
        ).rows.length
      )
        return;
      const char = await this.character(id, user);
      const data = this.data(char);
      const all = structuredClone(before);
      const art = this.artificer(char);
      const creations = (body.creations ?? []) as Creation[];
      if (!Array.isArray(creations))
        throw new BadRequestException('Invalid creation selections.');
      if (body.correction && (!char.campaign_id || char.dm_id !== user.id))
        throw new ForbiddenException(
          'Only the campaign DM can correct replicas.',
        );
      if (creations.length) {
        if (
          !((char.enabled_sources ?? []) as string[]).includes('EFA') ||
          art.level < 2
        )
          throw new BadRequestException(
            'Replicate Magic Item is not available.',
          );
        if (
          !body.toolsConfirmed ||
          !all.some(
            (r) => r.holder === id && r.entry.itemIndex === 'tinkers-tools',
          )
        )
          throw new BadRequestException(
            'Tinker’s Tools must be available and in hand.',
          );
      }
      const seen = new Set<string>();
      const toAttune: Stored[] = [];
      for (const choice of creations) {
        if (
          !choice ||
          typeof choice !== 'object' ||
          typeof choice.planId !== 'string'
        )
          throw new BadRequestException('Invalid creation selection.');
        const commonIndex = choice.planId?.startsWith('common:')
          ? choice.planId.slice(7)
          : undefined;
        const plan = this.plans().find(
          (p) => p.id === (commonIndex ? 'common-magic-item' : choice.planId),
        );
        const learnedName = commonIndex
          ? `Common Magic Item: ${commonIndex}`
          : plan?.name;
        if (
          !plan ||
          plan.level > art.level ||
          !learnedName ||
          !art.learned.includes(learnedName)
        )
          throw new BadRequestException('Choose a learned, eligible plan.');
        if (seen.has(choice.planId))
          throw new BadRequestException(
            'Choose different plans for this rest.',
          );
        seen.add(choice.planId);
        const item = await this.definition(commonIndex ?? plan.itemIndex!);
        if (
          commonIndex &&
          (!eligibleCommon(item, (char.enabled_sources ?? []) as string[]) ||
            !(
              await this.content.getItems(
                char.campaign_id as string | undefined,
                user,
              )
            ).some((i) => i.index === commonIndex))
        )
          throw new BadRequestException('This Common item is not eligible.');
        const instanceId = randomUUID();
        const entry: ItemInstance = {
          instanceId,
          itemIndex: item.index,
          name: item.name,
          quantity: 1,
          equipped: false,
          baseItemIndex: choice.baseItemIndex,
          origin: {
            creatorId: id,
            planId: choice.planId,
            planName: plan.name,
            createdAt: new Date().toISOString(),
          },
        };
        const base = choice.baseItemIndex
          ? await this.definition(choice.baseItemIndex)
          : undefined;
        if (!resolveItem(entry, item, base))
          throw new BadRequestException('Choose an eligible base weapon.');
        // A new creation of a plan replaces its prior creation, wherever it is held.
        for (let i = all.length - 1; i >= 0; i--)
          if (
            all[i].creator === id &&
            all[i].entry.origin?.planId === choice.planId
          )
            all.splice(i, 1);
        const row: Stored = {
          id: instanceId,
          holder: id,
          creator: id,
          attuned: null,
          entry,
        };
        all.push(row);
        if (choice.attune) toAttune.push(row);
      }
      if (creations.length > art.limit)
        throw new BadRequestException('Too many creations for one Long Rest.');
      // Exceeding capacity ends the oldest creations first; the UI previews this order.
      const replicas = all
        .filter((r) => r.creator === id)
        .sort((a, b) =>
          String(a.entry.origin?.createdAt).localeCompare(
            String(b.entry.origin?.createdAt),
          ),
        );
      while (replicas.length > art.limit && creations.length) {
        const oldest = replicas.shift()!;
        all.splice(all.indexOf(oldest), 1);
      }
      for (const row of toAttune) await this.attune(row, id, all, char);
      const extra: { sql: string; args?: any[] }[] = [
        {
          sql: 'INSERT INTO inventory_requests(character_id,request_id) VALUES(?,?)',
          args: [id, body.requestId],
        },
      ];
      if (!body.correction) {
        data.current_hp = Number(data.max_hp ?? 0);
        const totalLevel =
          records(char.classes).reduce((n, c) => n + Number(c.level), 0) ||
          Number(char.level);
        data.hit_dice_used = Math.max(
          0,
          Number(data.hit_dice_used ?? 0) - Math.trunc(totalLevel / 2),
        );
        data.spell_slot_uses = {};
        data.spell_slots_used = {};
        data.spell_free_cast_uses = {};
        data.active_concentration = null;
        data.resource_uses = {};
        for (const row of all.filter((r) => r.holder === id)) {
          const item = (await this.resolved(row, id)).resolvedItem;
          if (item?.charges?.recovery === 'long_rest')
            row.entry.chargesUsed = 0;
        }
        if (String(char.race).toLowerCase() === 'human')
          data.heroic_inspiration = true;
        for (const row of (
          await this.db.execute(
            'SELECT id,data FROM companions WHERE character_id=?',
            [id],
          )
        ).rows) {
          const state = this.db.parseJson<Record<string, any>>(
            row.data as string,
            {},
          );
          if (state.status === 'active')
            Object.assign(state, {
              damage: 0,
              temp_hp: 0,
              hit_dice_used: 0,
              resource_uses: {},
            });
          state.replacement_available = true;
          state.revision = Number(state.revision ?? 0) + 1;
          extra.push({
            sql: 'UPDATE companions SET data=? WHERE id=?',
            args: [JSON.stringify(state), row.id],
          });
        }
      }
      await this.commit(before, all, new Map([[id, data]]), extra);
    });
  }
}
