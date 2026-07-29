import {
  Injectable,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import { DatabaseService } from '../common/database.service';
import type { RequestUser } from '../common/current-user.decorator';

// Top-level columns kept for fast listing/filtering
const LIST_FIELDS = ['name', 'race', 'class', 'level'] as const;

// Fields a player may change on their own campaign copy without the DM granting full edit
// access — everything the character play sheet's in-encounter controls touch (HP, resource/spell
// slot uses from actions and rests, equip toggle, spell-prepared toggle). Anything else in the
// data blob (abilities, class, background, etc.) is left untouched even if present in the body.
const PLAYER_EDITABLE_FIELDS = [
  'current_hp',
  'resource_uses',
  'spell_slots_used',
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
  constructor(private db: DatabaseService) {}

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

  // Same lookup, but a DM (admin) can read/edit any character, not just ones their own account
  // happens to own. This app is single-campaign self-hosted (see CLAUDE.md) — "admin" means the
  // DM running the game, who needs to see and manage whatever character a player actually brings
  // into an encounter, not just characters created under the DM's own login.
  async findOneReadable(id: string, user: RequestUser) {
    if (user.role !== 'admin') return this.findOne(id, user.id);
    const result = await this.db.execute(
      'SELECT * FROM characters WHERE id = ?',
      [id],
    );
    const row = result.rows[0];
    if (!row) throw new NotFoundException('Character not found');
    return this.deserialize(row);
  }

  async create(userId: string, body: Record<string, unknown>) {
    const id = randomUUID();
    const now = new Date().toISOString();
    const { name, race, class: cls, level, ...rest } = body;
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
        JSON.stringify(rest),
        now,
        now,
      ],
    );
    return this.findOne(id, userId);
  }

  async update(id: string, user: RequestUser, body: Record<string, unknown>) {
    const existing = await this.findOneReadable(id, user);
    // A campaign copy is normally DM-only to edit (point 5 of the campaigns spec) — the player
    // still owns the row for read purposes, but can't rewrite the DM's live copy wholesale. Two
    // carve-outs: the DM can grant full edit access per-member (campaign_members.edit_unlocked),
    // and regardless of that grant, a small whitelist of play-sheet fields (HP, rest/resource
    // uses, equip/prepare toggles) is always player-writable — see PLAYER_EDITABLE_FIELDS.
    if (existing.campaign_id && user.role !== 'admin') {
      const unlocked = await this.hasEditAccess(
        existing.campaign_id as string,
        user.id,
      );
      if (!unlocked)
        return this.updatePlayerEditableFields(id, existing, body, user);
    }
    const { name, race, class: cls, level, ...rest } = body;
    await this.db.execute(
      `UPDATE characters SET name=?, race=?, class=?, level=?, data=?, updated_at=? WHERE id=?`,
      [
        name ?? 'Unnamed',
        race ?? '',
        cls ?? '',
        level ?? 1,
        JSON.stringify(rest),
        new Date().toISOString(),
        id,
      ],
    );
    return this.findOneReadable(id, user);
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
    const data = this.db.parseJson(row.data as string, {});
    return {
      ...(data as Record<string, unknown>),
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
}
