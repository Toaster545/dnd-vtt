import { InventoryService } from './inventory.service';
import {
  CHARACTER_COLUMN_KEYS,
  CharacterRepository,
} from './character-repository';
import { CharacterRestService } from './character-rest.service';
import { Optional } from '@nestjs/common';
import { CompanionsService } from '../companions/companions.service';
import { withCharacterLock } from '../common/character-lock';
import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import { mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import { DatabaseService } from '../common/database.service';
import type { RequestUser } from '../common/current-user.decorator';
import { ContentService } from '../content/content.service';
import { EncounterPresenceGateway } from '../encounters/encounter-presence.gateway';
import {
  normalizePlayerSources,
  sourceDefinition,
} from '../content/content-sources';
import type { CharacterData } from './character-data';
import { stringArray, recordArray } from '../common/arrays';
import { abilityModifier } from '../common/ability';
import { itemDisplayName } from '../common/item-display-name';
import { averageHp } from './average-hp';

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

type FeatGrant = {
  type: string;
  key?: string;
  name?: string;
  spells?: string[];
  maxLevel?: number;
  recovery?: 'short_rest' | 'long_rest';
};

type ContentFeat = {
  index: string;
  name: string;
  tags?: string[];
  grants?: FeatGrant[];
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
// slot uses from actions and rests, equipment toggles, and their coin purse). Anything else in
// the data blob (abilities, class, background, etc.) is left untouched even if present in the body.
const PORTRAIT_UPLOAD_TYPES: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
};

const PLAYER_EDITABLE_FIELDS = [
  'current_hp',
  'resource_uses',
  'spell_slots_used',
  'spell_slot_uses',
  'spell_free_cast_uses',
  'active_concentration',
  'heroic_inspiration',
  'equipment',
  'spells',
  // Tracking loot/spending is table-side player agency we keep regardless of the wizard lock —
  // the play sheet's Inventory tab +/- coin adjusters (CharacterPlaySheetComponent.applyCurrencyDelta)
  // stay live for a locked campaign copy.
  'currency',
  // Same reasoning for the character's portrait: the play sheet's portrait picker
  // (CharacterPlaySheetComponent.changePortrait) stays live even when the wizard is locked. The
  // recipe is re-validated below via normalizeCharacterAvatar before it's written.
  'portrait_seed',
  'avatar_recipe',
  'portrait_image',
  'token_border',
  'portrait_use_token',
  // Not itself an independent player choice — the frontend recomputes this from whatever's
  // equipped every time it persists (see CharacterPlaySheetComponent.persist), so it has to ride
  // along with the equipment toggle that changed it or campaign-hub/roster views relying on the
  // stored value would show a stale AC even though the equip toggle "worked".
  'armor_class',
] as const;

// Blob fields the self-serve Level-Up flow (applyLevelUp) may rewrite even on a DM-locked
// campaign copy. A superset of PLAYER_EDITABLE_FIELDS: it also lets the player record the
// mechanical choices for the level the DM granted them — class/subclass progression and its
// feat/ASI picks (which live inside `classes[].choices`), rolled/averaged HP, new spells, and
// the proficiencies those grants can add. Still nothing that isn't a consequence of the new
// level: race, background, ability_scores, alignment, and the `name`/`level` columns stay out.
const LEVEL_UP_EDITABLE_FIELDS = [
  ...PLAYER_EDITABLE_FIELDS,
  'classes',
  'subclass',
  'max_hp',
  'max_hp_overridden',
  'spell_choices',
  'skills',
  'expertise',
  'languages',
] as const;

@Injectable()
export class CharactersService {
  constructor(
    private db: DatabaseService,
    private content: ContentService,
    private presence: EncounterPresenceGateway,
    @Optional() private companions?: CompanionsService,
    @Optional() private inventory?: InventoryService,
    @Optional() repository?: CharacterRepository,
    @Optional() rest?: CharacterRestService,
  ) {
    this.repository =
      repository ?? new CharacterRepository(db, presence, inventory);
    this.rest =
      rest ?? new CharacterRestService(this.repository, companions, inventory);
  }

  private readonly repository: CharacterRepository;
  private readonly rest: CharacterRestService;

  findOne(id: string, userId: string) {
    return this.repository.findOne(id, userId);
  }

  findOneReadable(id: string, user: RequestUser) {
    return this.repository.findOneReadable(id, user);
  }

  completeRest(id: string, user: RequestUser, body: Record<string, unknown>) {
    return this.rest.completeRest(id, user, body);
  }

  restoreLife(id: string, user: RequestUser, body: Record<string, unknown>) {
    return this.rest.restoreLife(id, user, body);
  }

  // Template characters only — campaign copies (campaign_id set) are DM-editable clones fetched
  // through the campaigns endpoints instead, so they don't clutter the list a player picks from
  // when joining a new campaign.
  async findAllForUser(userId: string) {
    const result = await this.db.execute(
      'SELECT * FROM characters WHERE user_id = ? AND campaign_id IS NULL ORDER BY created_at DESC',
      [userId],
    );
    return Promise.all(result.rows.map((r) => this.repository.deserialize(r)));
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
    return Promise.all(
      result.rows.map(async (r) => ({
        ...(await this.repository.deserialize(r)),
        campaign_name: r.campaign_name,
        edit_unlocked: !!r.edit_unlocked,
      })),
    );
  }

  async create(
    userId: string,
    body: Record<string, unknown>,
    creationStatus: 'draft' | 'complete' = 'complete',
    draftStep = 0,
  ) {
    const id = randomUUID();
    const now = new Date().toISOString();
    const { name, race, class: cls, level, ...rest } = body;
    const data = this.repository.normalizeCharacterAvatar(
      this.repository.normalizeCharacterSources(rest, cls),
    );
    await this.db.execute(
      `INSERT INTO characters
       (id, user_id, name, race, class, level, data, creation_status, draft_step, created_at, updated_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
      [
        id,
        userId,
        name ?? 'Unnamed',
        race ?? '',
        cls ?? '',
        level ?? 1,
        JSON.stringify(data),
        creationStatus,
        draftStep,
        now,
        now,
      ],
    );
    return this.findOne(id, userId);
  }

  createDraft(userId: string, body: Record<string, unknown>) {
    return this.create(userId, body, 'draft', Number(body.draft_step ?? 0));
  }

  async updateDraft(
    id: string,
    user: RequestUser,
    body: Record<string, unknown>,
  ) {
    const existing = await this.findOne(id, user.id);
    if (existing.campaign_id) {
      throw new ForbiddenException('Campaign characters cannot be drafts.');
    }
    const draftStep = Math.max(0, Math.min(6, Number(body.draft_step ?? 0)));
    const character = { ...body };
    delete character.draft_step;
    delete character.creation_status;
    await this.update(id, user, character);
    await this.db.execute(
      `UPDATE characters SET creation_status='draft', draft_step=?, updated_at=? WHERE id=?`,
      [draftStep, new Date().toISOString(), id],
    );
    return this.findOne(id, user.id);
  }

  async completeDraft(id: string, user: RequestUser) {
    const character = await this.findOne(id, user.id);
    if (character.campaign_id) {
      throw new ForbiddenException('Campaign characters cannot be drafts.');
    }
    const scores = character.ability_scores as
      Record<string, unknown> | undefined;
    const requiredScores = [
      'strength',
      'dexterity',
      'constitution',
      'intelligence',
      'wisdom',
      'charisma',
    ];
    if (
      typeof character.name !== 'string' ||
      !character.name.trim() ||
      typeof character.race !== 'string' ||
      !character.race.trim() ||
      typeof character.class !== 'string' ||
      !character.class.trim() ||
      typeof character.background !== 'string' ||
      !character.background.trim() ||
      !scores ||
      requiredScores.some(
        (ability) => !Number.isFinite(Number(scores[ability])),
      )
    ) {
      throw new BadRequestException(
        'Complete the class, race, background, ability scores, and details before finishing.',
      );
    }
    await this.db.execute(
      `UPDATE characters SET creation_status='complete', updated_at=? WHERE id=?`,
      [new Date().toISOString(), id],
    );
    return this.findOne(id, user.id);
  }

  async update(id: string, user: RequestUser, body: Record<string, unknown>) {
    return this.withCharacterLock(id, () =>
      this.updateUnlocked(id, user, body),
    );
  }

  private async updateUnlocked(
    id: string,
    user: RequestUser,
    body: Record<string, unknown>,
  ) {
    const existing = await this.findOneReadable(id, user);
    if (
      existing.campaign_id &&
      (this.changed(existing.spell_choices, body.spell_choices) ||
        this.changed(existing.spells, body.spells)) &&
      (await this.repository.isCharacterInActiveEncounter(
        id,
        existing.campaign_id,
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
      (await this.repository.isCampaignOwner(existing.campaign_id, user.id));
    if (existing.campaign_id && !isOwningDm) {
      const unlocked = await this.repository.hasEditAccess(
        existing.campaign_id,
        user.id,
      );
      if (!unlocked)
        return this.updatePlayerEditableFields(id, existing, body, user);
    }
    const { name, race, class: cls, level, ...rest } = body;
    const data = this.repository.normalizeCharacterAvatar(
      // `rest` is unvalidated request input; the blob is replaced wholesale, as before.
      this.repository.normalizeCharacterSources(rest, cls),
    );
    if (this.inventory)
      Object.assign(data, await this.inventory.decorate(id, {}));
    // Pact weapons are runtime state managed by updatePactWeapon. Preserve the authoritative
    // value instead of accepting one from a broad character PUT.
    if (existing.pact_weapon !== undefined)
      data.pact_weapon = existing.pact_weapon;
    else delete data.pact_weapon;
    const pactWeapon = data.pact_weapon ?? undefined;
    if (
      pactWeapon?.mode === 'bonded' &&
      !recordArray(data.equipment).some((entry) =>
        pactWeapon.instanceId
          ? entry.instanceId === pactWeapon.instanceId
          : entry.itemIndex === pactWeapon.itemIndex,
      )
    ) {
      delete data.pact_weapon;
    }
    if (existing.campaign_id) {
      await this.repository.assertCampaignSources(
        existing.campaign_id,
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
    await this.repository.notifyUpdated(id);
    return this.findOneReadable(id, user);
  }

  // The self-serve Level-Up flow: apply the choices for a level the DM granted (HP, class/
  // subclass features, ASI/feat, spells) to a campaign copy the player otherwise can't edit.
  // One-shot per level bump — once `applied_level` reaches `level` this 409s and the frontend
  // route redirects away.
  async applyLevelUp(
    id: string,
    user: RequestUser,
    body: Record<string, unknown>,
  ) {
    return this.withCharacterLock(id, async () => {
      const existing = await this.findOneReadable(id, user);
      // Owning player only — the owning DM keeps the full update() path.
      if (existing.user_id !== user.id) throw new ForbiddenException();
      if (!existing.campaign_id)
        throw new BadRequestException(
          'Level-Up only applies to a campaign character; use the wizard for a standalone one.',
        );

      const level = Number(existing.level ?? 1);
      if (this.levelUpBaseline(existing, level) >= level)
        throw new ConflictException(
          'No level-up is pending for this character.',
        );

      const data: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(existing)) {
        if (!CHARACTER_COLUMN_KEYS.has(key)) data[key] = value;
      }
      for (const key of LEVEL_UP_EDITABLE_FIELDS) {
        if (key in body) data[key] = body[key];
      }

      // Class levels must still add up to the level the DM set — never trust a `level` from the
      // body, and don't let the multiclass split drift.
      const classes = recordArray(data.classes);
      if (classes.length) {
        const total = classes.reduce(
          (sum, entry) => sum + Number(entry.level ?? 0),
          0,
        );
        if (total !== level)
          throw new BadRequestException(
            `Class levels add up to ${total}, but this character is level ${level}.`,
          );
      }

      await this.repository.assertCampaignSources(
        existing.campaign_id,
        data.enabled_sources,
      );
      if (
        this.changed(existing.spell_choices, body.spell_choices) &&
        (await this.repository.isCharacterInActiveEncounter(
          id,
          existing.campaign_id,
        ))
      ) {
        throw new ConflictException(
          'Spell selection cannot be changed during an active encounter.',
        );
      }

      const normalized =
        'avatar_recipe' in body ||
        'portrait_image' in body ||
        'token_border' in body ||
        'portrait_use_token' in body
          ? this.repository.normalizeCharacterAvatar(data)
          : data;
      normalized.applied_level = level;

      await this.repository.writeCharacterData(id, normalized);
      return this.findOneReadable(id, user);
    });
  }

  // Highest level the player has already resolved. Explicit `applied_level` wins; otherwise fall
  // back to the same average-HP staleness signal the dashboard uses — a stored max_hp that still
  // matches the average for the current level (or an explicit override) means nothing's pending.
  private levelUpBaseline(data: CharacterData, level: number): number {
    if (data.applied_level != null) return Number(data.applied_level);
    if (data.max_hp_overridden) return level;
    const suggested = this.estimateAverageMaxHp(data, level);
    if (suggested != null && suggested === Number(data.max_hp)) return level;
    return Math.max(1, level - 1);
  }

  // Mirrors averageHpFormula in the frontend's character-effects.ts (primary-class hit die, no
  // feat per-level bonuses) — only used to decide "did the level change since the last save".
  private estimateAverageMaxHp(
    data: CharacterData,
    level: number,
  ): number | null {
    const classes = data.classes ?? [];
    const raw = classes[0]?.name ?? data.class;
    if (typeof raw !== 'string' || !raw.trim()) return null;
    const primaryName = raw.toLowerCase().replace(/\s+/g, '-');
    let hitDie: number;
    try {
      hitDie = Number(this.content.getClass(primaryName).hit_die ?? 8);
    } catch {
      return null;
    }
    const scores = data.ability_scores ?? {};
    const conMod = abilityModifier(Number(scores.constitution ?? 10));
    return averageHp(level, hitDie, conMod);
  }

  private changed(current: unknown, next: unknown): boolean {
    return (
      next !== undefined &&
      JSON.stringify(current ?? null) !== JSON.stringify(next)
    );
  }

  async castSpell(
    id: string,
    user: RequestUser,
    body: Record<string, unknown>,
  ) {
    return this.withCharacterLock(id, async () => {
      const character = await this.findOneReadable(id, user);
      const spellIndex = this.repository.requiredString(
        body.spellIndex,
        'spellIndex',
      );
      const sourceKey = this.repository.requiredString(
        body.sourceKey,
        'sourceKey',
      );
      const method = this.repository.requiredString(body.method, 'method');
      const spell = await this.content.getSpell(spellIndex);
      const spellLevel = Number(spell.level ?? 0);
      const concentration = !!spell.concentration;
      const replaceConcentration = body.replaceConcentration === true;
      const currentConcentration = character.active_concentration;

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

      const data = this.repository.characterData(character);
      let resourceLabel = 'No slot';
      let castLevel = spellLevel;

      if (method === 'cantrip') {
        if (spellLevel !== 0)
          throw new BadRequestException(
            'Only cantrips can use the cantrip casting method.',
          );
      } else if (
        method === 'slot' ||
        method === 'pact' ||
        method === 'restricted'
      ) {
        if (spellLevel === 0)
          throw new BadRequestException('Cantrips do not expend spell slots.');
        const poolKey = this.repository.requiredString(body.poolKey, 'poolKey');
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
          pool.type === 'restricted' &&
          !pool.allowedSpellIndices?.includes(spellIndex)
        ) {
          throw new BadRequestException(
            'That restricted slot cannot cast this spell.',
          );
        }
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
        const freeCastKey = this.repository.requiredString(
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
            name: String(spell.name),
            sourceKey,
            startedAt: new Date().toISOString(),
          }
        : (currentConcentration ?? null);

      await this.repository.writeCharacterData(id, data);
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
    if (this.inventory) {
      await this.inventory.grant(
        id,
        user,
        this.repository.requiredString(body.itemIndex, 'itemIndex'),
        Number(body.quantity ?? 1),
      );
      return this.findOneReadable(id, user);
    }
    return this.withCharacterLock(id, async () => {
      const character = await this.findOneReadable(id, user);
      if (
        !character.campaign_id ||
        !(await this.repository.isCampaignOwner(character.campaign_id, user.id))
      ) {
        throw new ForbiddenException('Only the campaign DM can grant items.');
      }
      const itemIndex = this.repository.requiredString(
        body.itemIndex,
        'itemIndex',
      );
      const quantity = Number(body.quantity ?? 1);
      if (!Number.isInteger(quantity) || quantity < 1) {
        throw new BadRequestException('quantity must be a positive integer.');
      }
      const item = await this.content.getItem(itemIndex);

      const data = this.repository.characterData(character);
      const equipment = Array.isArray(data.equipment)
        ? [...data.equipment]
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
          name: itemDisplayName(item),
          quantity,
          equipped: false,
        });
      }
      data.equipment = equipment;
      await this.repository.writeCharacterData(id, data);
      return this.findOneReadable(id, user);
    });
  }

  replicateItem(id: string, user: RequestUser, body: Record<string, unknown>) {
    void id;
    void user;
    void body;
    return Promise.reject(
      new ConflictException(
        'Replication now happens during Long Rest. Refresh the character sheet.',
      ),
    );
  }

  async inventoryOptions(id: string, user: RequestUser) {
    return this.inventory!.options(id, user);
  }
  async inventoryOperation(
    id: string,
    instanceId: string,
    user: RequestUser,
    body: Record<string, unknown>,
  ) {
    await this.inventory!.operate(id, instanceId, user, body);
    return this.findOneReadable(id, user);
  }
  async updatePactWeapon(
    id: string,
    user: RequestUser,
    body: Record<string, unknown>,
  ) {
    return this.withCharacterLock(id, async () => {
      const character = await this.findOneReadable(id, user);
      const data = this.repository.characterData(character);
      const action = this.repository.requiredString(body.action, 'action');
      if (!['conjure', 'bond', 'dismiss'].includes(action)) {
        throw new BadRequestException(
          'action must be conjure, bond, or dismiss.',
        );
      }
      if (action === 'dismiss') {
        delete data.pact_weapon;
        await this.repository.writeCharacterData(id, data);
        return this.findOneReadable(id, user);
      }
      if (!this.hasPactOfTheBlade(character)) {
        throw new ForbiddenException(
          'This character does not have Pact of the Blade.',
        );
      }

      const itemIndex = this.repository.requiredString(
        body.itemIndex,
        'itemIndex',
      );
      const carried =
        action === 'bond'
          ? recordArray(data.equipment).find((entry) =>
              typeof body.instanceId === 'string'
                ? entry.instanceId === body.instanceId &&
                  entry.itemIndex === itemIndex
                : entry.itemIndex === itemIndex,
            )
          : undefined;
      if (action === 'bond' && !carried)
        throw new BadRequestException(
          "The weapon must be in this character's inventory before it can be bonded.",
        );
      const item =
        (carried?.resolvedItem as Record<string, unknown> | undefined) ??
        (await this.content.getItem(itemIndex));
      const type = typeof item.type === 'string' ? item.type.toLowerCase() : '';
      const category =
        typeof item.category === 'string' ? item.category.toLowerCase() : '';
      if (
        type !== 'weapon' ||
        !category.includes('melee') ||
        (!category.startsWith('simple') && !category.startsWith('martial'))
      ) {
        throw new BadRequestException(
          'A pact weapon must be a Simple or Martial melee weapon.',
        );
      }
      if (action === 'bond') {
        const equipment = recordArray(data.equipment);
        if (!equipment.some((entry) => entry.itemIndex === itemIndex)) {
          throw new BadRequestException(
            "The weapon must be in this character's inventory before it can be bonded.",
          );
        }
      }

      data.pact_weapon = {
        itemIndex,
        ...(typeof carried?.instanceId === 'string'
          ? { instanceId: carried.instanceId }
          : {}),
        name: typeof item.name === 'string' ? item.name : itemIndex,
        mode: action === 'bond' ? 'bonded' : 'conjured',
        createdAt: new Date().toISOString(),
      };
      await this.repository.writeCharacterData(id, data);
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
    if (this.inventory)
      throw new ConflictException(
        'Item removal now uses an individual item. Refresh the character sheet.',
      );
    return this.withCharacterLock(id, async () => {
      const character = await this.findOneReadable(id, user);
      if (
        !character.campaign_id ||
        !(await this.repository.isCampaignOwner(character.campaign_id, user.id))
      ) {
        throw new ForbiddenException('Only the campaign DM can remove items.');
      }
      const itemIndex = this.repository.requiredString(
        body.itemIndex,
        'itemIndex',
      );
      let requestedQuantity: number | undefined;
      if (body.quantity !== undefined) {
        requestedQuantity = Number(body.quantity);
        if (!Number.isInteger(requestedQuantity) || requestedQuantity < 1) {
          throw new BadRequestException('quantity must be a positive integer.');
        }
      }

      const data = this.repository.characterData(character);
      const equipment = Array.isArray(data.equipment)
        ? [...data.equipment]
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
      const pactWeapon = data.pact_weapon ?? undefined;
      if (
        pactWeapon?.mode === 'bonded' &&
        pactWeapon.itemIndex === itemIndex &&
        !equipment.some((entry) => entry.itemIndex === itemIndex)
      ) {
        delete data.pact_weapon;
      }
      await this.repository.writeCharacterData(id, data);
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
      const character = await this.findOneReadable(id, user);
      if (
        !character.campaign_id ||
        !(await this.repository.isCampaignOwner(character.campaign_id, user.id))
      ) {
        throw new ForbiddenException('Only the campaign DM can grant spells.');
      }
      const spellIndex = this.repository.requiredString(
        body.spellIndex,
        'spellIndex',
      );
      const sourceName =
        typeof body.sourceName === 'string' && body.sourceName.trim()
          ? body.sourceName.trim()
          : 'DM Gift';
      const spell = await this.content.getSpell(spellIndex);

      const data = this.repository.characterData(character);
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
          ...(data.enabled_sources ?? []),
          sourceCode,
        ]);
        await this.repository.assertCampaignSources(
          character.campaign_id,
          data.enabled_sources,
        );
      }
      const grantedSpells = Array.isArray(data.granted_spells)
        ? [...data.granted_spells]
        : [];
      if (grantedSpells.some((entry) => entry.spellIndex === spellIndex)) {
        throw new ConflictException(
          `${String(spell.name)} has already been granted to this character.`,
        );
      }
      grantedSpells.push({
        spellIndex,
        name: String(spell.name),
        sourceName,
      });
      data.granted_spells = grantedSpells;
      await this.repository.writeCharacterData(id, data);
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
      const character = await this.findOneReadable(id, user);
      if (
        !character.campaign_id ||
        !(await this.repository.isCampaignOwner(character.campaign_id, user.id))
      ) {
        throw new ForbiddenException('Only the campaign DM can remove spells.');
      }
      const spellIndex = this.repository.requiredString(
        body.spellIndex,
        'spellIndex',
      );

      const data = this.repository.characterData(character);
      const grantedSpells = Array.isArray(data.granted_spells)
        ? [...data.granted_spells]
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
      await this.repository.writeCharacterData(id, data);
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
      const character = await this.findOneReadable(id, user);
      const data = this.repository.characterData(character);
      const slotUses = this.recordOfRecords(data.spell_slot_uses);
      if (type === 'long_rest') {
        data.spell_slot_uses = {};
        data.spell_slots_used = {};
        data.spell_free_cast_uses = {};
        data.active_concentration = null;
      } else {
        for (const pool of this.resolveSlotPools(character)) {
          if (
            pool.type === 'pact' ||
            (pool.type === 'restricted' && pool.recovery === 'short_rest')
          ) {
            delete slotUses[pool.key];
          }
        }
        data.spell_slot_uses = slotUses;
        const freeCasts = this.freeCastRecord(data.spell_free_cast_uses);
        for (const [key, state] of Object.entries(freeCasts)) {
          if (state.recovery === 'short_rest') delete freeCasts[key];
        }
        data.spell_free_cast_uses = freeCasts;
      }
      await this.repository.writeCharacterData(id, data);
      return this.findOneReadable(id, user);
    });
  }

  async endConcentration(id: string, user: RequestUser) {
    return this.withCharacterLock(id, async () => {
      const character = await this.findOneReadable(id, user);
      const data = this.repository.characterData(character);
      data.active_concentration = null;
      await this.repository.writeCharacterData(id, data);
      return this.findOneReadable(id, user);
    });
  }

  private async withCharacterLock<T>(
    id: string,
    work: () => Promise<T>,
  ): Promise<T> {
    return withCharacterLock(id, work);
  }

  private hasPactOfTheBlade(character: CharacterData): boolean {
    const classes = character.classes ?? [];
    return classes.some((entry) => {
      if (String(entry.name).toLowerCase() !== 'warlock') return false;
      const choices =
        entry.choices &&
        typeof entry.choices === 'object' &&
        !Array.isArray(entry.choices)
          ? entry.choices
          : {};
      return Object.values(choices).some((selection) =>
        stringArray(selection).includes('Pact of the Blade'),
      );
    });
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

  resolveSlotPools(character: CharacterData): {
    key: string;
    name: string;
    type: 'slot' | 'pact' | 'restricted';
    slots: Record<string, number>;
    allowedSpellIndices?: string[];
    recovery?: 'short_rest' | 'long_rest';
  }[] {
    const entries =
      Array.isArray(character.classes) && character.classes.length
        ? character.classes
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
      type: 'slot' | 'pact' | 'restricted';
      slots: Record<string, number>;
      allowedSpellIndices?: string[];
      recovery?: 'short_rest' | 'long_rest';
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
    const dragonmarkPool = this.resolveDragonmarkSlotPool(character);
    if (dragonmarkPool) pools.push(dragonmarkPool);
    return pools;
  }

  private resolveDragonmarkSlotPool(character: CharacterData): {
    key: string;
    name: string;
    type: 'restricted';
    slots: Record<string, number>;
    allowedSpellIndices: string[];
    recovery: 'short_rest' | 'long_rest';
  } | null {
    const feats = this.content.getFeats() as ContentFeat[];
    const byIndex = new Map(feats.map((feat) => [feat.index, feat]));
    const selected = new Set<string>();
    const collectChoiceValues = (value: unknown): void => {
      if (!value || typeof value !== 'object') return;
      if (Array.isArray(value)) {
        for (const entry of value) {
          if (typeof entry === 'string' && byIndex.has(entry))
            selected.add(entry);
          else collectChoiceValues(entry);
        }
        return;
      }
      for (const entry of Object.values(value as Record<string, unknown>)) {
        collectChoiceValues(entry);
      }
    };
    collectChoiceValues(character.classes);
    collectChoiceValues(character.race_choices);
    collectChoiceValues(character.background_choices);

    const backgrounds = this.content.getBackgrounds() as {
      name?: string;
      index?: string;
      feature?: string;
    }[];
    const backgroundName =
      typeof character.background === 'string'
        ? character.background.toLowerCase()
        : '';
    const background = backgrounds.find(
      (entry) =>
        entry.name?.toLowerCase() === backgroundName ||
        entry.index?.toLowerCase() === backgroundName,
    );
    const originFeatName = background?.feature?.match(
      /^Origin Feat:\s*(.+)$/i,
    )?.[1];
    if (originFeatName) {
      const originFeat = feats.find(
        (feat) => feat.name.toLowerCase() === originFeatName.toLowerCase(),
      );
      if (originFeat) selected.add(originFeat.index);
    }

    const potent = byIndex.get('potent-dragonmark');
    if (!potent || !selected.has(potent.index)) return null;
    const definition = potent.grants?.find(
      (grant) => grant.type === 'dragonmark_slot',
    );
    if (
      !definition?.key ||
      !definition.name ||
      !definition.maxLevel ||
      !definition.recovery
    ) {
      return null;
    }
    const allowedSpellIndices = new Set<string>();
    for (const featIndex of selected) {
      const feat = byIndex.get(featIndex);
      if (!feat?.tags?.includes('dragonmark')) continue;
      for (const grant of feat.grants ?? []) {
        if (
          grant.type === 'spell_grant' ||
          grant.type === 'spell_list_expansion'
        ) {
          for (const spell of grant.spells ?? [])
            allowedSpellIndices.add(spell);
        }
      }
    }
    if (!allowedSpellIndices.size) return null;
    const slotLevel = Math.min(
      definition.maxLevel,
      Math.ceil(Number(character.level ?? 1) / 2),
    );
    return {
      key: `restricted:${definition.key}`,
      name: definition.name,
      type: 'restricted',
      slots: { [String(slotLevel)]: 1 },
      allowedSpellIndices: [...allowedSpellIndices],
      recovery: definition.recovery,
    };
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
    // Only when the player actually sent a new portrait — re-run the same validation the full
    // update path does, without risking a throw on a pre-existing recipe during an unrelated
    // (HP, rest, ...) locked save.
    const normalized =
      'avatar_recipe' in body ||
      'portrait_image' in body ||
      'token_border' in body ||
      'portrait_use_token' in body
        ? this.repository.normalizeCharacterAvatar(data)
        : data;

    // `name` is a characters-table column, not a data-blob key, so it can't ride through
    // PLAYER_EDITABLE_FIELDS like the rest of this whitelist — handled separately here. It's the
    // one column-backed field a locked player may still change: flavor only, like the portrait,
    // unlike race/class/level (also columns) which carry mechanical weight and stay wizard-only.
    const name =
      typeof body.name === 'string' && body.name.trim()
        ? body.name.trim()
        : (existing.name as string);

    if (this.inventory)
      Object.assign(normalized, await this.inventory.decorate(id, {}));
    await this.db.execute(
      `UPDATE characters SET name=?, data=?, updated_at=? WHERE id=?`,
      [name, JSON.stringify(normalized), new Date().toISOString(), id],
    );
    await this.repository.notifyUpdated(id);
    return this.findOneReadable(id, user);
  }

  async remove(id: string, userId: string) {
    await this.findOne(id, userId);
    await this.db.execute('DELETE FROM characters WHERE id = ?', [id]);
    return { deleted: true };
  }

  uploadPortrait(userId: string, file: Express.Multer.File | undefined) {
    const extension = file && PORTRAIT_UPLOAD_TYPES[file.mimetype];
    if (!file?.buffer?.length || !extension) {
      throw new BadRequestException(
        'Portrait must be a PNG, JPEG, or WebP image',
      );
    }
    const owner = userId.replace(/[^A-Za-z0-9-]/g, '').slice(0, 64);
    const dir = join(process.cwd(), 'uploads', 'portraits', owner);
    mkdirSync(dir, { recursive: true });
    const filename = `${randomUUID()}.${extension}`;
    writeFileSync(join(dir, filename), file.buffer);
    return { url: `/uploads/portraits/${owner}/${filename}` };
  }
}
