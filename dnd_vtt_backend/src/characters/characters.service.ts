import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import { DatabaseService } from '../common/database.service';
import type { RequestUser } from '../common/current-user.decorator';
import { ContentService } from '../content/content.service';
import { parseAvatarRecipe } from '../common/avatar-recipe';
import {
  EBERRON_SOURCE_CODE,
  disallowedSources,
  normalizePlayerSources,
  sourceDefinition,
  sourceName,
} from '../content/content-sources';

function stringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === 'string')
    : [];
}

function recordArray(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value)
    ? value.filter(
        (entry): entry is Record<string, unknown> =>
          !!entry && typeof entry === 'object' && !Array.isArray(entry),
      )
    : [];
}

type FreeCastState = {
  used: number;
  max: number;
  recovery: 'short_rest' | 'long_rest';
  spellIndex: string;
};

type SpellSlotMap = Record<string, number>;

type SpellcastingDefinition = {
  key: string;
  name?: string;
  progression: 'full' | 'half' | 'third' | 'pact';
};

type SpellcastingLevel = {
  level: number;
  spell_slots?: SpellSlotMap;
  pact_magic?: { slots: number; slot_level: number };
};

type SpellcastingSubclass = {
  name: string;
  spellcasting?: SpellcastingDefinition;
  levels?: SpellcastingLevel[];
};

type SpellcastingClass = {
  spellcasting?: SpellcastingDefinition;
  levels?: SpellcastingLevel[];
  subclasses?: SpellcastingSubclass[];
};

type SpellcastingSource = {
  definition: SpellcastingDefinition;
  levels: SpellcastingLevel[];
};

const MULTICLASS_SLOTS: Record<number, Record<string, number>> = {
  1: { '1': 2 },
  2: { '1': 3 },
  3: { '1': 4, '2': 2 },
  4: { '1': 4, '2': 3 },
  5: { '1': 4, '2': 3, '3': 2 },
  6: { '1': 4, '2': 3, '3': 3 },
  7: { '1': 4, '2': 3, '3': 3, '4': 1 },
  8: { '1': 4, '2': 3, '3': 3, '4': 2 },
  9: { '1': 4, '2': 3, '3': 3, '4': 3, '5': 1 },
  10: { '1': 4, '2': 3, '3': 3, '4': 3, '5': 2 },
  11: { '1': 4, '2': 3, '3': 3, '4': 3, '5': 2, '6': 1 },
  12: { '1': 4, '2': 3, '3': 3, '4': 3, '5': 2, '6': 1 },
  13: { '1': 4, '2': 3, '3': 3, '4': 3, '5': 2, '6': 1, '7': 1 },
  14: { '1': 4, '2': 3, '3': 3, '4': 3, '5': 2, '6': 1, '7': 1 },
  15: { '1': 4, '2': 3, '3': 3, '4': 3, '5': 2, '6': 1, '7': 1, '8': 1 },
  16: { '1': 4, '2': 3, '3': 3, '4': 3, '5': 2, '6': 1, '7': 1, '8': 1 },
  17: {
    '1': 4,
    '2': 3,
    '3': 3,
    '4': 3,
    '5': 2,
    '6': 1,
    '7': 1,
    '8': 1,
    '9': 1,
  },
  18: {
    '1': 4,
    '2': 3,
    '3': 3,
    '4': 3,
    '5': 3,
    '6': 1,
    '7': 1,
    '8': 1,
    '9': 1,
  },
  19: {
    '1': 4,
    '2': 3,
    '3': 3,
    '4': 3,
    '5': 3,
    '6': 2,
    '7': 1,
    '8': 1,
    '9': 1,
  },
  20: {
    '1': 4,
    '2': 3,
    '3': 3,
    '4': 3,
    '5': 3,
    '6': 2,
    '7': 2,
    '8': 1,
    '9': 1,
  },
};

// Fields a player may change on their own campaign copy without the DM granting full edit
// access — everything the character play sheet's in-encounter controls touch (HP, resource/spell
// slot uses from actions and rests, and equipment toggles). Anything else in the
// data blob (abilities, class, background, etc.) is left untouched even if present in the body.
const PLAYER_EDITABLE_FIELDS = [
  'current_hp',
  'resource_uses',
  'spell_slots_used',
  'spell_slot_uses',
  'spell_free_cast_uses',
  'active_concentration',
  'equipment',
  'spells',
  // Not itself an independent player choice — the frontend recomputes this from whatever's
  // equipped every time it persists (see CharacterPlaySheetComponent.persist), so it has to ride
  // along with the equipment toggle that changed it or campaign-hub/roster views relying on the
  // stored value would show a stale AC even though the equip toggle "worked".
  'armor_class',
] as const;

// Columns deserialize() layers onto the data blob — must be stripped back out before rewriting
// the blob, or they'd get persisted as (duplicate, stale) keys inside `data` itself.
const CHARACTER_COLUMN_KEYS = new Set([
  'id',
  'user_id',
  'name',
  'race',
  'class',
  'level',
  'campaign_id',
  'created_at',
  'updated_at',
]);

@Injectable()
export class CharactersService {
  private readonly characterLocks = new Map<string, Promise<void>>();

  constructor(
    private db: DatabaseService,
    private content: ContentService,
  ) {}

  // Template characters only — campaign copies (campaign_id set) are DM-editable clones fetched
  // through the campaigns endpoints instead, so they don't clutter the list a player picks from
  // when joining a new campaign.
  async findAllForUser(userId: string) {
    const result = await this.db.execute(
      'SELECT * FROM characters WHERE user_id = ? AND campaign_id IS NULL ORDER BY created_at DESC',
      [userId],
    );
    return result.rows.map((r) => this.deserialize(r));
  }

  // Campaign copies only — the per-campaign clones created when a player joins (see
  // CampaignsService.join), the counterpart to findAllForUser's templates-only list. Powers the
  // player's "Characters" tab, which lists each campaign's local copy alongside which campaign
  // it belongs to (campaign_id is NOT NULL ... REFERENCES campaigns, so the inner join is safe).
  // Also joins campaign_members.edit_unlocked (same campaign_id + user_id, since a copy's owner
  // is always its own campaign_members row) so the list can show/hide the full-edit wizard entry
  // point without a second round trip — mirrors the same flag CharactersService.update() enforces.
  async findCampaignCopiesForUser(userId: string) {
    const result = await this.db.execute(
      `SELECT ch.*, c.name AS campaign_name, cm.edit_unlocked AS edit_unlocked
       FROM characters ch
       JOIN campaigns c ON c.id = ch.campaign_id
       LEFT JOIN campaign_members cm
         ON cm.campaign_id = ch.campaign_id AND cm.user_id = ch.user_id AND cm.status = 'active'
       WHERE ch.user_id = ? AND ch.campaign_id IS NOT NULL
       ORDER BY ch.updated_at DESC`,
      [userId],
    );
    return result.rows.map((r) => ({
      ...this.deserialize(r),
      campaign_name: r.campaign_name,
      edit_unlocked: !!r.edit_unlocked,
    }));
  }

  async findOne(id: string, userId: string) {
    const result = await this.db.execute(
      'SELECT * FROM characters WHERE id = ?',
      [id],
    );
    const row = result.rows[0];
    if (!row) throw new NotFoundException('Character not found');
    if (row.user_id !== userId) throw new ForbiddenException();
    return this.deserialize(row);
  }

  // Same lookup, but the DM owning a character's campaign can read/edit it too, not just their
  // own account's characters — a DM needs to see and manage whatever character copy a player
  // actually brings into their campaign, not just characters created under the DM's own login.
  async findOneReadable(id: string, user: RequestUser) {
    const result = await this.db.execute(
      'SELECT * FROM characters WHERE id = ?',
      [id],
    );
    const row = result.rows[0];
    if (!row) throw new NotFoundException('Character not found');
    if (row.user_id === user.id) return this.deserialize(row);
    if (
      row.campaign_id &&
      (await this.isCampaignOwner(row.campaign_id as string, user.id))
    ) {
      return this.deserialize(row);
    }
    throw new ForbiddenException();
  }

  private async isCampaignOwner(
    campaignId: string,
    userId: string,
  ): Promise<boolean> {
    const result = await this.db.execute(
      'SELECT id FROM campaigns WHERE id = ? AND dm_id = ?',
      [campaignId, userId],
    );
    return result.rows.length > 0;
  }

  async create(userId: string, body: Record<string, unknown>) {
    const id = randomUUID();
    const now = new Date().toISOString();
    const { name, race, class: cls, level, ...rest } = body;
    const data = this.normalizeCharacterAvatar(
      this.normalizeCharacterSources(rest, cls),
    );
    await this.db.execute(
      `INSERT INTO characters (id, user_id, name, race, class, level, data, created_at, updated_at)
       VALUES (?,?,?,?,?,?,?,?,?)`,
      [
        id,
        userId,
        name ?? 'Unnamed',
        race ?? '',
        cls ?? '',
        level ?? 1,
        JSON.stringify(data),
        now,
        now,
      ],
    );
    return this.findOne(id, userId);
  }

  async update(id: string, user: RequestUser, body: Record<string, unknown>) {
    const existing = (await this.findOneReadable(id, user)) as Record<
      string,
      unknown
    >;
    if (
      existing.campaign_id &&
      (this.changed(existing.spell_choices, body.spell_choices) ||
        this.changed(existing.spells, body.spells)) &&
      (await this.isCharacterInActiveEncounter(
        id,
        existing.campaign_id as string,
      ))
    ) {
      throw new ConflictException(
        'Spell preparation cannot be changed during an active encounter.',
      );
    }
    // A campaign copy is normally DM-only to edit (point 5 of the campaigns spec) — the player
    // still owns the row for read purposes, but can't rewrite the DM's live copy wholesale. Two
    // carve-outs: the DM can grant full edit access per-member (campaign_members.edit_unlocked),
    // and regardless of that grant, a small whitelist of play-sheet fields (HP, rest/resource
    // uses, equip/prepare toggles) is always player-writable — see PLAYER_EDITABLE_FIELDS.
    const isOwningDm =
      !!existing.campaign_id &&
      (await this.isCampaignOwner(existing.campaign_id as string, user.id));
    if (existing.campaign_id && !isOwningDm) {
      const unlocked = await this.hasEditAccess(
        existing.campaign_id as string,
        user.id,
      );
      if (!unlocked)
        return this.updatePlayerEditableFields(id, existing, body, user);
    }
    const { name, race, class: cls, level, ...rest } = body;
    const data = this.normalizeCharacterAvatar(
      this.normalizeCharacterSources(rest, cls),
    );
    if (existing.campaign_id) {
      await this.assertCampaignSources(
        existing.campaign_id as string,
        data.enabled_sources,
      );
    }
    await this.db.execute(
      `UPDATE characters SET name=?, race=?, class=?, level=?, data=?, updated_at=? WHERE id=?`,
      [
        name ?? 'Unnamed',
        race ?? '',
        cls ?? '',
        level ?? 1,
        JSON.stringify(data),
        new Date().toISOString(),
        id,
      ],
    );
    return this.findOneReadable(id, user);
  }

  private changed(current: unknown, next: unknown): boolean {
    return (
      next !== undefined &&
      JSON.stringify(current ?? null) !== JSON.stringify(next)
    );
  }

  private async isCharacterInActiveEncounter(
    characterId: string,
    campaignId: string,
  ): Promise<boolean> {
    const result = await this.db.execute(
      `SELECT e.id
       FROM encounters e
       JOIN sessions s ON s.id = e.session_id
       WHERE e.status = 'active' AND s.campaign_id = ?
         AND EXISTS (
           SELECT 1 FROM json_each(e.character_ids) roster
           WHERE roster.value = ?
         )
       LIMIT 1`,
      [campaignId, characterId],
    );
    return result.rows.length > 0;
  }

  async castSpell(
    id: string,
    user: RequestUser,
    body: Record<string, unknown>,
  ) {
    return this.withCharacterLock(id, async () => {
      const character = (await this.findOneReadable(id, user)) as Record<
        string,
        unknown
      >;
      const spellIndex = this.requiredString(body.spellIndex, 'spellIndex');
      const sourceKey = this.requiredString(body.sourceKey, 'sourceKey');
      const method = this.requiredString(body.method, 'method');
      const spell = await this.content.getSpell(spellIndex);
      const spellLevel = Number(spell.level ?? 0);
      const concentration = !!spell.concentration;
      const replaceConcentration = body.replaceConcentration === true;
      const currentConcentration = character.active_concentration as
        Record<string, unknown> | null | undefined;

      if (
        concentration &&
        currentConcentration?.spellIndex &&
        currentConcentration.spellIndex !== spellIndex &&
        !replaceConcentration
      ) {
        throw new ConflictException(
          `Casting ${String(spell.name)} would end concentration on ${String(currentConcentration.name)}. Confirm replacement to continue.`,
        );
      }

      const data = this.characterData(character);
      let resourceLabel = 'No slot';
      let castLevel = spellLevel;

      if (method === 'cantrip') {
        if (spellLevel !== 0)
          throw new BadRequestException(
            'Only cantrips can use the cantrip casting method.',
          );
      } else if (method === 'slot' || method === 'pact') {
        if (spellLevel === 0)
          throw new BadRequestException('Cantrips do not expend spell slots.');
        const poolKey = this.requiredString(body.poolKey, 'poolKey');
        const slotLevel = Number(body.slotLevel);
        if (!Number.isInteger(slotLevel) || slotLevel < spellLevel)
          throw new BadRequestException(
            'The selected slot cannot cast this spell.',
          );
        const pools = this.resolveSlotPools(character);
        const pool = pools.find((candidate) => candidate.key === poolKey);
        if (!pool || pool.type !== method)
          throw new BadRequestException(
            'That spell-slot pool is not available.',
          );
        if (
          pool.type === 'slot' &&
          slotLevel > spellLevel &&
          (typeof spell.higher_levels !== 'string' ||
            !spell.higher_levels.trim())
        ) {
          throw new BadRequestException(
            `${String(spell.name)} has no higher-level benefit and must use a level ${spellLevel} slot.`,
          );
        }
        const maximum = pool.slots[String(slotLevel)] ?? 0;
        const uses = this.recordOfRecords(data.spell_slot_uses);
        const poolUses = { ...(uses[poolKey] ?? {}) };
        const used = Number(poolUses[String(slotLevel)] ?? 0);
        if (maximum <= 0 || used >= maximum)
          throw new ConflictException('No selected spell slot remains.');
        poolUses[String(slotLevel)] = used + 1;
        uses[poolKey] = poolUses;
        data.spell_slot_uses = uses;
        if (pool.type === 'slot') {
          data.spell_slots_used = {
            ...this.numberRecord(data.spell_slots_used),
            [String(slotLevel)]: used + 1,
          };
        }
        castLevel = slotLevel;
        resourceLabel = `${pool.name}, level ${slotLevel}`;
      } else if (method === 'free') {
        const freeCastKey = this.requiredString(
          body.freeCastKey,
          'freeCastKey',
        );
        const maxUses = Number(body.maxUses);
        const recovery = body.recovery;
        const atWill = body.atWill === true;
        if (
          !atWill &&
          (!Number.isInteger(maxUses) || maxUses < 1 || maxUses > 20)
        )
          throw new BadRequestException('Invalid free-cast allowance.');
        if (!atWill && recovery !== 'short_rest' && recovery !== 'long_rest')
          throw new BadRequestException('Invalid free-cast recovery rule.');
        const allUses = this.freeCastRecord(data.spell_free_cast_uses);
        const existing = allUses[freeCastKey];
        const used = existing?.used ?? 0;
        if (!atWill && used >= maxUses)
          throw new ConflictException(
            'No free casting remains for this spell.',
          );
        if (!atWill) {
          allUses[freeCastKey] = {
            used: used + 1,
            max: maxUses,
            recovery: recovery as 'short_rest' | 'long_rest',
            spellIndex,
          };
          data.spell_free_cast_uses = allUses;
        }
        castLevel = Number(body.slotLevel) || spellLevel;
        resourceLabel = atWill ? 'At will' : 'Free cast';
      } else {
        throw new BadRequestException('Unknown spell casting method.');
      }

      data.active_concentration = concentration
        ? {
            spellIndex,
            name: spell.name,
            sourceKey,
            startedAt: new Date().toISOString(),
          }
        : (currentConcentration ?? null);

      await this.writeCharacterData(id, data);
      return {
        character: await this.findOneReadable(id, user),
        cast: {
          spellIndex,
          spellName: spell.name,
          castLevel,
          method,
          resourceLabel,
          concentration,
        },
      };
    });
  }

  // DM-only: appends (or stacks onto an existing stack of) an item from the SRD/custom item
  // catalog onto a party member's campaign-copy equipment. Only the campaign's DM may call this
  // — a character's own player already has equipment in PLAYER_EDITABLE_FIELDS and goes through
  // the normal PUT, so this exists purely for the "DM hands a player an item" direction.
  async grantItem(
    id: string,
    user: RequestUser,
    body: Record<string, unknown>,
  ) {
    return this.withCharacterLock(id, async () => {
      const character = (await this.findOneReadable(id, user)) as Record<
        string,
        unknown
      >;
      if (
        !character.campaign_id ||
        !(await this.isCampaignOwner(character.campaign_id as string, user.id))
      ) {
        throw new ForbiddenException('Only the campaign DM can grant items.');
      }
      const itemIndex = this.requiredString(body.itemIndex, 'itemIndex');
      const quantity = Number(body.quantity ?? 1);
      if (!Number.isInteger(quantity) || quantity < 1) {
        throw new BadRequestException('quantity must be a positive integer.');
      }
      const item = await this.content.getItem(itemIndex);

      const data = this.characterData(character);
      const equipment = Array.isArray(data.equipment)
        ? [...(data.equipment as Record<string, unknown>[])]
        : [];
      const existingIndex = equipment.findIndex(
        (entry) => entry.itemIndex === itemIndex,
      );
      if (existingIndex >= 0) {
        const existing = equipment[existingIndex];
        equipment[existingIndex] = {
          ...existing,
          quantity: Number(existing.quantity ?? 0) + quantity,
        };
      } else {
        equipment.push({
          itemIndex,
          name: item.name,
          quantity,
          equipped: false,
        });
      }
      data.equipment = equipment;
      await this.writeCharacterData(id, data);
      return this.findOneReadable(id, user);
    });
  }

  // DM-only counterpart to grantItem — removes an item (or, with `quantity`, part of a stack)
  // from a party member's campaign-copy equipment. `quantity` omitted (or >= what's on hand)
  // removes the whole stack; anything less just decrements it.
  async revokeItem(
    id: string,
    user: RequestUser,
    body: Record<string, unknown>,
  ) {
    return this.withCharacterLock(id, async () => {
      const character = (await this.findOneReadable(id, user)) as Record<
        string,
        unknown
      >;
      if (
        !character.campaign_id ||
        !(await this.isCampaignOwner(character.campaign_id as string, user.id))
      ) {
        throw new ForbiddenException('Only the campaign DM can remove items.');
      }
      const itemIndex = this.requiredString(body.itemIndex, 'itemIndex');
      let requestedQuantity: number | undefined;
      if (body.quantity !== undefined) {
        requestedQuantity = Number(body.quantity);
        if (!Number.isInteger(requestedQuantity) || requestedQuantity < 1) {
          throw new BadRequestException('quantity must be a positive integer.');
        }
      }

      const data = this.characterData(character);
      const equipment = Array.isArray(data.equipment)
        ? [...(data.equipment as Record<string, unknown>[])]
        : [];
      const index = equipment.findIndex(
        (entry) => entry.itemIndex === itemIndex,
      );
      if (index < 0) {
        throw new NotFoundException(
          'That item is not in this character’s inventory.',
        );
      }
      const existing = equipment[index];
      const currentQuantity = Number(existing.quantity ?? 1);
      const removeQuantity = requestedQuantity ?? currentQuantity;
      if (removeQuantity >= currentQuantity) {
        equipment.splice(index, 1);
      } else {
        equipment[index] = {
          ...existing,
          quantity: currentQuantity - removeQuantity,
        };
      }
      data.equipment = equipment;
      await this.writeCharacterData(id, data);
      return this.findOneReadable(id, user);
    });
  }

  // DM-only: adds a spell the character didn't earn through class/race/feat progression (a
  // scroll's contents, a boon, an innate grant from a magic item) into `data.granted_spells`.
  // Unlike grantItem's `equipment`, this is a dedicated array rather than piggybacking on
  // `data.spells` — that field is a wizard-computed snapshot of grant-derived spells the play
  // sheet never actually reads back (see resolveSpellcasting), so it wouldn't show up in play.
  // resolveSpellcasting (frontend) turns each entry into an always-available, at-will "known"
  // spell using the character's primary caster ability when they have one.
  async grantSpell(
    id: string,
    user: RequestUser,
    body: Record<string, unknown>,
  ) {
    return this.withCharacterLock(id, async () => {
      const character = (await this.findOneReadable(id, user)) as Record<
        string,
        unknown
      >;
      if (
        !character.campaign_id ||
        !(await this.isCampaignOwner(character.campaign_id as string, user.id))
      ) {
        throw new ForbiddenException('Only the campaign DM can grant spells.');
      }
      const spellIndex = this.requiredString(body.spellIndex, 'spellIndex');
      const sourceName =
        typeof body.sourceName === 'string' && body.sourceName.trim()
          ? body.sourceName.trim()
          : 'DM Gift';
      const spell = await this.content.getSpell(spellIndex);

      const data = this.characterData(character);
      const spellSourceCode = (spell as Record<string, unknown>).source;
      const sourceCode =
        spellSourceCode && typeof spellSourceCode === 'object'
          ? (spellSourceCode as Record<string, unknown>).code
          : undefined;
      if (
        typeof sourceCode === 'string' &&
        sourceDefinition(sourceCode)?.player_options
      ) {
        data.enabled_sources = normalizePlayerSources([
          ...stringArray(data.enabled_sources),
          sourceCode,
        ]);
        await this.assertCampaignSources(
          character.campaign_id as string,
          data.enabled_sources,
        );
      }
      const grantedSpells = Array.isArray(data.granted_spells)
        ? [...(data.granted_spells as Record<string, unknown>[])]
        : [];
      if (grantedSpells.some((entry) => entry.spellIndex === spellIndex)) {
        throw new ConflictException(
          `${String(spell.name)} has already been granted to this character.`,
        );
      }
      grantedSpells.push({ spellIndex, name: spell.name, sourceName });
      data.granted_spells = grantedSpells;
      await this.writeCharacterData(id, data);
      return this.findOneReadable(id, user);
    });
  }

  // DM-only counterpart to grantSpell.
  async revokeSpell(
    id: string,
    user: RequestUser,
    body: Record<string, unknown>,
  ) {
    return this.withCharacterLock(id, async () => {
      const character = (await this.findOneReadable(id, user)) as Record<
        string,
        unknown
      >;
      if (
        !character.campaign_id ||
        !(await this.isCampaignOwner(character.campaign_id as string, user.id))
      ) {
        throw new ForbiddenException('Only the campaign DM can remove spells.');
      }
      const spellIndex = this.requiredString(body.spellIndex, 'spellIndex');

      const data = this.characterData(character);
      const grantedSpells = Array.isArray(data.granted_spells)
        ? [...(data.granted_spells as Record<string, unknown>[])]
        : [];
      const index = grantedSpells.findIndex(
        (entry) => entry.spellIndex === spellIndex,
      );
      if (index < 0) {
        throw new NotFoundException(
          'That spell was not granted to this character.',
        );
      }
      grantedSpells.splice(index, 1);
      data.granted_spells = grantedSpells;
      await this.writeCharacterData(id, data);
      return this.findOneReadable(id, user);
    });
  }

  async restoreSpellcasting(
    id: string,
    user: RequestUser,
    body: Record<string, unknown>,
  ) {
    const type = body.type;
    if (type !== 'short_rest' && type !== 'long_rest')
      throw new BadRequestException(
        'Rest type must be short_rest or long_rest.',
      );
    return this.withCharacterLock(id, async () => {
      const character = (await this.findOneReadable(id, user)) as Record<
        string,
        unknown
      >;
      const data = this.characterData(character);
      const slotUses = this.recordOfRecords(data.spell_slot_uses);
      if (type === 'long_rest') {
        data.spell_slot_uses = {};
        data.spell_slots_used = {};
        data.spell_free_cast_uses = {};
        data.active_concentration = null;
      } else {
        for (const pool of this.resolveSlotPools(character)) {
          if (pool.type === 'pact') delete slotUses[pool.key];
        }
        data.spell_slot_uses = slotUses;
        const freeCasts = this.freeCastRecord(data.spell_free_cast_uses);
        for (const [key, state] of Object.entries(freeCasts)) {
          if (state.recovery === 'short_rest') delete freeCasts[key];
        }
        data.spell_free_cast_uses = freeCasts;
      }
      await this.writeCharacterData(id, data);
      return this.findOneReadable(id, user);
    });
  }

  async endConcentration(id: string, user: RequestUser) {
    return this.withCharacterLock(id, async () => {
      const character = (await this.findOneReadable(id, user)) as Record<
        string,
        unknown
      >;
      const data = this.characterData(character);
      data.active_concentration = null;
      await this.writeCharacterData(id, data);
      return this.findOneReadable(id, user);
    });
  }

  private async withCharacterLock<T>(
    id: string,
    work: () => Promise<T>,
  ): Promise<T> {
    const previous = this.characterLocks.get(id) ?? Promise.resolve();
    let release!: () => void;
    const current = new Promise<void>((resolve) => (release = resolve));
    this.characterLocks.set(
      id,
      previous.then(() => current),
    );
    await previous;
    try {
      return await work();
    } finally {
      release();
      // Keep the resolved tail as the next caller's predecessor. The map is bounded by the
      // number of characters touched by this process and avoids a deletion race between waiters.
    }
  }

  private characterData(
    character: Record<string, unknown>,
  ): Record<string, unknown> {
    const data: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(character)) {
      if (!CHARACTER_COLUMN_KEYS.has(key)) data[key] = value;
    }
    return data;
  }

  private async writeCharacterData(id: string, data: Record<string, unknown>) {
    await this.db.execute(
      'UPDATE characters SET data=?, updated_at=? WHERE id=?',
      [JSON.stringify(data), new Date().toISOString(), id],
    );
  }

  private requiredString(value: unknown, field: string): string {
    if (typeof value !== 'string' || !value.trim())
      throw new BadRequestException(`${field} is required.`);
    return value;
  }

  private numberRecord(value: unknown): Record<string, number> {
    return value && typeof value === 'object' && !Array.isArray(value)
      ? { ...(value as Record<string, number>) }
      : {};
  }

  private recordOfRecords(
    value: unknown,
  ): Record<string, Record<string, number>> {
    return value && typeof value === 'object' && !Array.isArray(value)
      ? { ...(value as Record<string, Record<string, number>>) }
      : {};
  }

  private freeCastRecord(value: unknown): Record<string, FreeCastState> {
    return value && typeof value === 'object' && !Array.isArray(value)
      ? { ...(value as Record<string, FreeCastState>) }
      : {};
  }

  private resolveSlotPools(character: Record<string, unknown>): {
    key: string;
    name: string;
    type: 'slot' | 'pact';
    slots: Record<string, number>;
  }[] {
    const entries =
      Array.isArray(character.classes) && character.classes.length
        ? (character.classes as Record<string, unknown>[])
        : [
            {
              name: character.class,
              level: character.level,
              subclass: character.subclass,
            },
          ];
    const normal: {
      level: number;
      progression: string;
      slots: Record<string, number>;
    }[] = [];
    const pools: {
      key: string;
      name: string;
      type: 'slot' | 'pact';
      slots: Record<string, number>;
    }[] = [];
    for (const entry of entries) {
      const name = typeof entry.name === 'string' ? entry.name : '';
      if (!name) continue;
      const cls = this.content.getClass(
        name.toLowerCase().replace(/\s+/g, '-'),
      ) as SpellcastingClass;
      const level = Number(entry.level ?? 0);
      const sources: SpellcastingSource[] = [];
      if (cls.spellcasting) {
        sources.push({
          definition: cls.spellcasting,
          levels: cls.levels ?? [],
        });
      }
      const subclass = (cls.subclasses ?? []).find(
        (candidate) =>
          candidate.name === entry.subclass && !!candidate.spellcasting,
      );
      if (subclass?.spellcasting) {
        sources.push({
          definition: subclass.spellcasting,
          levels: subclass.levels ?? [],
        });
      }
      for (const source of sources) {
        const levelData = source.levels.find(
          (candidate) => Number(candidate.level) === level,
        );
        if (!levelData) continue;
        const spellSlots = levelData.spell_slots;
        if (source.definition.progression === 'pact' && levelData.pact_magic) {
          pools.push({
            key: `pact:${source.definition.key}`,
            name: `${source.definition.name ?? name} Pact Magic`,
            type: 'pact',
            slots: {
              [String(levelData.pact_magic.slot_level)]: Number(
                levelData.pact_magic.slots,
              ),
            },
          });
        } else if (spellSlots && Object.keys(spellSlots).length) {
          normal.push({
            level,
            progression: source.definition.progression,
            slots: spellSlots,
          });
        }
      }
    }
    if (normal.length === 1) {
      pools.unshift({
        key: 'spellcasting',
        name: 'Spell Slots',
        type: 'slot',
        slots: normal[0].slots,
      });
    } else if (normal.length > 1) {
      const casterLevel = Math.min(
        20,
        normal.reduce((sum, source) => {
          if (source.progression === 'full') return sum + source.level;
          if (source.progression === 'half')
            return sum + Math.ceil(source.level / 2);
          if (source.progression === 'third')
            return sum + Math.floor(source.level / 3);
          return sum;
        }, 0),
      );
      pools.unshift({
        key: 'spellcasting',
        name: 'Spell Slots',
        type: 'slot',
        slots: MULTICLASS_SLOTS[casterLevel] ?? {},
      });
    }
    return pools;
  }

  private async hasEditAccess(
    campaignId: string,
    userId: string,
  ): Promise<boolean> {
    const result = await this.db.execute(
      `SELECT edit_unlocked FROM campaign_members WHERE campaign_id = ? AND user_id = ? AND status = 'active'`,
      [campaignId, userId],
    );
    return !!result.rows[0]?.edit_unlocked;
  }

  private async updatePlayerEditableFields(
    id: string,
    existing: Record<string, unknown>,
    body: Record<string, unknown>,
    user: RequestUser,
  ) {
    const data: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(existing)) {
      if (!CHARACTER_COLUMN_KEYS.has(key)) data[key] = value;
    }
    for (const key of PLAYER_EDITABLE_FIELDS) {
      if (key in body) data[key] = body[key];
    }
    await this.db.execute(
      `UPDATE characters SET data=?, updated_at=? WHERE id=?`,
      [JSON.stringify(data), new Date().toISOString(), id],
    );
    return this.findOneReadable(id, user);
  }

  async remove(id: string, userId: string) {
    await this.findOne(id, userId);
    await this.db.execute('DELETE FROM characters WHERE id = ?', [id]);
    return { deleted: true };
  }

  private deserialize(row: Record<string, unknown>) {
    const data = this.normalizeCharacterSources(
      this.db.parseJson<Record<string, unknown>>(row.data as string, {}),
      row.class,
    );
    return {
      ...data,
      id: row.id,
      user_id: row.user_id,
      name: row.name,
      race: row.race,
      class: row.class,
      level: row.level,
      campaign_id: row.campaign_id ?? null,
      created_at: row.created_at,
      updated_at: row.updated_at,
    };
  }

  private normalizeCharacterSources(
    data: Record<string, unknown>,
    primaryClass: unknown,
  ): Record<string, unknown> {
    const required = new Set<string>();
    if (String(primaryClass).toLowerCase() === 'artificer') {
      required.add(EBERRON_SOURCE_CODE);
    }
    const classes = recordArray(data.classes);
    if (
      classes.some((entry) => String(entry.name).toLowerCase() === 'artificer')
    ) {
      required.add(EBERRON_SOURCE_CODE);
    }
    const spellEntries = [
      ...recordArray(data.spells),
      ...recordArray(data.granted_spells),
    ];
    if (
      spellEntries.some((entry) => entry.spellIndex === 'homunculus-servant')
    ) {
      required.add(EBERRON_SOURCE_CODE);
    }
    return {
      ...data,
      enabled_sources: normalizePlayerSources([
        ...stringArray(data.enabled_sources),
        ...required,
      ]),
    };
  }

  private normalizeCharacterAvatar(
    data: Record<string, unknown>,
  ): Record<string, unknown> {
    if (!Object.prototype.hasOwnProperty.call(data, 'avatar_recipe'))
      return data;
    if (data.avatar_recipe == null) {
      const withoutRecipe = { ...data };
      delete withoutRecipe.avatar_recipe;
      return withoutRecipe;
    }
    const recipe = parseAvatarRecipe(data.avatar_recipe);
    if (!recipe) throw new BadRequestException('Invalid avatar recipe');
    return { ...data, avatar_recipe: recipe };
  }

  private async assertCampaignSources(
    campaignId: string,
    enabledSources: unknown,
  ) {
    const result = await this.db.execute(
      'SELECT data FROM campaigns WHERE id = ?',
      [campaignId],
    );
    const campaignData = this.db.parseJson<Record<string, unknown>>(
      result.rows[0]?.data as string,
      {},
    );
    const disallowed = disallowedSources(
      enabledSources,
      campaignData.allowed_sources,
    );
    if (disallowed.length) {
      throw new BadRequestException(
        `This campaign doesn't allow ${disallowed.map(sourceName).join(', ')}.`,
      );
    }
  }
}
