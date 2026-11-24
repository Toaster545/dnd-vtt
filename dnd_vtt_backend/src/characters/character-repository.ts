import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { DatabaseService } from '../common/database.service';
import type { RequestUser } from '../common/current-user.decorator';
import { EncounterPresenceGateway } from '../encounters/encounter-presence.gateway';
import { parseAvatarRecipe } from '../common/avatar-recipe';
import { parsePortraitImage } from '../common/portrait-image';
import { parseTokenBorder } from '../common/token-border';
import {
  EBERRON_SOURCE_CODE,
  disallowedSources,
  normalizePlayerSources,
  sourceName,
} from '../content/content-sources';
import type { CharacterData } from './character-data';
import { InventoryService } from './inventory.service';

// Columns deserialize() layers onto the data blob — must be stripped back out before rewriting
// the blob, or they'd get persisted as (duplicate, stale) keys inside `data` itself.
export const CHARACTER_COLUMN_KEYS = new Set([
  'id',
  'user_id',
  'name',
  'race',
  'class',
  'level',
  'campaign_id',
  'creation_status',
  'draft_step',
  'created_at',
  'updated_at',
]);

/** Character row access and (de)serialization shared by the character services. */
@Injectable()
export class CharacterRepository {
  constructor(
    private db: DatabaseService,
    private presence: EncounterPresenceGateway,
    @Optional() private inventory?: InventoryService,
  ) {}

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

  async isCampaignOwner(campaignId: string, userId: string): Promise<boolean> {
    const result = await this.db.execute(
      'SELECT id FROM campaigns WHERE id = ? AND dm_id = ?',
      [campaignId, userId],
    );
    return result.rows.length > 0;
  }

  async hasEditAccess(campaignId: string, userId: string): Promise<boolean> {
    const result = await this.db.execute(
      `SELECT edit_unlocked FROM campaign_members WHERE campaign_id = ? AND user_id = ? AND status = 'active'`,
      [campaignId, userId],
    );
    return !!result.rows[0]?.edit_unlocked;
  }

  async deserialize(row: Record<string, unknown>): Promise<CharacterData> {
    const data = this.normalizeCharacterSources(
      this.db.parseJson<CharacterData>(row.data as string, {}),
      row.class,
    );
    return {
      ...data,
      ...(this.inventory
        ? await this.inventory.decorate(String(row.id), {})
        : {}),
      id: row.id as string,
      user_id: row.user_id as string,
      name: row.name as string,
      race: row.race as string,
      class: row.class as string,
      level: row.level as number,
      campaign_id: (row.campaign_id as string | null | undefined) ?? null,
      creation_status:
        (row.creation_status as 'draft' | 'complete' | null | undefined) ??
        'complete',
      draft_step: Number(row.draft_step ?? 0),
      created_at: row.created_at as string,
      updated_at: row.updated_at as string,
    };
  }

  normalizeCharacterSources(
    data: CharacterData,
    primaryClass: unknown,
  ): CharacterData {
    const required = new Set<string>();
    if (String(primaryClass).toLowerCase() === 'artificer') {
      required.add(EBERRON_SOURCE_CODE);
    }
    const classes = data.classes ?? [];
    if (
      classes.some((entry) => String(entry.name).toLowerCase() === 'artificer')
    ) {
      required.add(EBERRON_SOURCE_CODE);
    }
    const spellEntries = [
      ...(data.spells ?? []),
      ...(data.granted_spells ?? []),
    ];
    if (
      spellEntries.some((entry) => entry.spellIndex === 'homunculus-servant')
    ) {
      required.add(EBERRON_SOURCE_CODE);
    }
    return {
      ...data,
      enabled_sources: normalizePlayerSources([
        ...(data.enabled_sources ?? []),
        ...required,
      ]),
    };
  }

  normalizeCharacterAvatar(data: CharacterData): CharacterData {
    const normalized = { ...data };
    if (Object.prototype.hasOwnProperty.call(normalized, 'avatar_recipe')) {
      if (normalized.avatar_recipe == null) {
        delete normalized.avatar_recipe;
      } else {
        const recipe = parseAvatarRecipe(normalized.avatar_recipe);
        if (!recipe) throw new BadRequestException('Invalid avatar recipe');
        normalized.avatar_recipe = recipe;
      }
    }
    // An uploaded portrait takes precedence over the recipe when both are present; the recipe is
    // kept so switching back to the built avatar restores the player's last design.
    if (Object.prototype.hasOwnProperty.call(normalized, 'portrait_image')) {
      if (normalized.portrait_image == null) {
        delete normalized.portrait_image;
      } else {
        const image = parsePortraitImage(normalized.portrait_image);
        if (!image) throw new BadRequestException('Invalid portrait image');
        normalized.portrait_image = image;
      }
    }
    if (Object.prototype.hasOwnProperty.call(normalized, 'token_border')) {
      if (normalized.token_border == null) {
        delete normalized.token_border;
      } else {
        const border = parseTokenBorder(normalized.token_border);
        if (!border) throw new BadRequestException('Invalid token border');
        normalized.token_border = border;
      }
    }
    if (
      Object.prototype.hasOwnProperty.call(normalized, 'portrait_use_token')
    ) {
      normalized.portrait_use_token = !!normalized.portrait_use_token;
    }
    return normalized;
  }

  characterData(character: CharacterData): CharacterData {
    const data: CharacterData = {};
    for (const [key, value] of Object.entries(character)) {
      if (!CHARACTER_COLUMN_KEYS.has(key)) data[key] = value;
    }
    return data;
  }

  async writeCharacterData(id: string, data: CharacterData) {
    if (this.inventory)
      Object.assign(data, await this.inventory.decorate(id, {}));
    await this.db.execute(
      'UPDATE characters SET data=?, updated_at=? WHERE id=?',
      [JSON.stringify(data), new Date().toISOString(), id],
    );
    await this.notifyUpdated(id);
  }

  // Only campaign copies are ever on a battle map — a template character has no one to tell.
  async notifyUpdated(id: string) {
    const result = await this.db.execute(
      'SELECT campaign_id FROM characters WHERE id = ?',
      [id],
    );
    const campaignId = result.rows[0]?.campaign_id;
    if (typeof campaignId === 'string') {
      this.presence.notifyCharacterUpdated(campaignId, id);
    }
  }

  requiredString(value: unknown, field: string): string {
    if (typeof value !== 'string' || !value.trim())
      throw new BadRequestException(`${field} is required.`);
    return value;
  }

  async assertCampaignSources(campaignId: string, enabledSources: unknown) {
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

  async isCharacterInActiveEncounter(
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
}
