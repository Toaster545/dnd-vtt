import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { readdirSync, readFileSync } from 'fs';
import { join } from 'path';
import { randomUUID } from 'crypto';
import { DatabaseService } from '../common/database.service';
import type { RequestUser } from '../common/current-user.decorator';
import {
  CONTENT_SOURCES,
  HOMEBREW_SOURCE_CODE,
  MONSTER_MANUAL_SOURCE_CODE,
  PHB_SOURCE_CODE,
  sourceReference,
} from './content-sources';
import {
  buildSpellAccess,
  buildSpellLists,
  type SpellAccessReference,
} from './spell-access';

const CONTENT_PATH = join(process.cwd(), 'content');

export type CustomContentKind = 'monsters' | 'items' | 'spells';

const CUSTOM_TABLE: Record<CustomContentKind, string> = {
  monsters: 'custom_monsters',
  items: 'custom_items',
  spells: 'custom_spells',
};

const CUSTOM_PREFIX = 'custom:';

@Injectable()
export class ContentService {
  private cache = new Map<string, unknown>();

  constructor(private db: DatabaseService) {}

  private loadAll<T>(type: string): T[] {
    const key = `all:${type}`;
    if (this.cache.has(key)) return this.cache.get(key) as T[];
    const dir = join(CONTENT_PATH, type);
    const files = readdirSync(dir).filter((f) => f.endsWith('.json'));
    const items = files.map((f) =>
      this.withSource(
        JSON.parse(readFileSync(join(dir, f), 'utf-8')) as T,
        this.fallbackSource(type),
      ),
    );
    this.cache.set(key, items);
    return items;
  }

  private loadOne<T>(type: string, index: string): T {
    const key = `${type}:${index}`;
    if (this.cache.has(key)) return this.cache.get(key) as T;
    const file = join(CONTENT_PATH, type, `${index}.json`);
    try {
      const item = this.withSource(
        JSON.parse(readFileSync(file, 'utf-8')) as T,
        this.fallbackSource(type),
      );
      this.cache.set(key, item);
      return item;
    } catch {
      throw new NotFoundException(`${type}/${index} not found`);
    }
  }

  getSources() {
    return CONTENT_SOURCES;
  }

  private fallbackSource(type: string): string {
    return type === 'monsters' ? MONSTER_MANUAL_SOURCE_CODE : PHB_SOURCE_CODE;
  }

  private withSource<T>(value: T, fallbackCode: string): T {
    if (!value || typeof value !== 'object') return value;
    const record = value as Record<string, unknown>;
    const existing =
      record.source && typeof record.source === 'object'
        ? (record.source as Record<string, unknown>)
        : {};
    const code =
      typeof existing.code === 'string' && existing.code
        ? existing.code
        : fallbackCode;
    const normalized: Record<string, unknown> = {
      ...record,
      source: { ...sourceReference(code), ...existing, code },
    };
    if (Array.isArray(record.subclasses)) {
      normalized.subclasses = record.subclasses.map((subclass: unknown) =>
        this.withSource<unknown>(subclass, code),
      );
    }
    return normalized as T;
  }

  getClasses() {
    return this.loadAll('classes');
  }
  getClass(index: string) {
    return this.loadOne('classes', index);
  }
  getRaces() {
    return this.loadAll('races');
  }
  getRace(index: string) {
    return this.loadOne('races', index);
  }
  getBackgrounds() {
    return this.loadAll('backgrounds');
  }
  getBackground(index: string) {
    return this.loadOne('backgrounds', index);
  }
  getFeats() {
    return this.loadAll('feats');
  }
  getFeat(index: string) {
    return this.loadOne('feats', index);
  }

  getSpellLists() {
    return buildSpellLists(this.loadAll<Record<string, unknown>>('classes'));
  }

  // ── Monsters / items / spells: static SRD content merged with DM-authored custom content ──
  //
  // Custom entries live in DB tables (custom_monsters/custom_items/custom_spells), one library
  // per creating user (`created_by`), reusable across every campaign that user DMs. A campaign
  // only ever has one DM, so "what a campaign's players/DM see" is just "SRD + that campaign's
  // dm_id's library" — resolved via resolveCampaignDmId, never stored per-campaign.
  //
  // Custom entries are keyed by an opaque `custom:<uuid>` index, never derived from `name`, so
  // renaming is free and there's no collision risk with SRD indices (which never contain ':')
  // or another DM's content. Single-item lookups (getMonster/getItem/getSpell) dispatch purely
  // on that prefix — no campaign/user context needs to thread through callers like
  // characters.service.ts, which just need `await` added.

  async getMonsters(campaignId?: string, user?: RequestUser) {
    return this.getMerged<Record<string, unknown>>(
      'monsters',
      campaignId,
      user,
    );
  }
  async getMonster(index: string) {
    return this.getMergedOne<Record<string, unknown>>('monsters', index);
  }
  async getItems(campaignId?: string, user?: RequestUser) {
    return this.getMerged<Record<string, unknown>>('items', campaignId, user);
  }
  async getItem(index: string) {
    return this.getMergedOne<Record<string, unknown>>('items', index);
  }
  async getSpells(campaignId?: string, user?: RequestUser) {
    const spells = await this.getMerged<Record<string, unknown>>(
      'spells',
      campaignId,
      user,
    );
    return spells.map((spell) => this.withSpellAccess(spell));
  }
  async getSpell(index: string) {
    return this.withSpellAccess(
      await this.getMergedOne<Record<string, unknown>>('spells', index),
    );
  }

  private withSpellAccess<T extends Record<string, unknown>>(
    spell: T,
  ): T & {
    access: SpellAccessReference[];
  } {
    return {
      ...spell,
      access: this.getSpellAccessRegistry().get(String(spell.index)) ?? [],
    };
  }

  private getSpellAccessRegistry() {
    const key = 'derived:spell-access';
    if (this.cache.has(key)) {
      return this.cache.get(key) as Map<string, SpellAccessReference[]>;
    }
    const registry = buildSpellAccess(
      this.loadAll<Record<string, unknown>>('spells'),
      this.loadAll<Record<string, unknown>>('classes'),
      this.loadAll<Record<string, unknown>>('races'),
      this.loadAll<Record<string, unknown>>('backgrounds'),
      this.loadAll<Record<string, unknown>>('feats'),
    );
    this.cache.set(key, registry);
    return registry;
  }

  private async getMerged<T>(
    kind: CustomContentKind,
    campaignId?: string,
    user?: RequestUser,
  ): Promise<T[]> {
    const srd = this.loadAll<T>(kind);
    if (!campaignId || !user) return srd;
    const dmId = await this.resolveCampaignDmId(campaignId, user);
    return [...srd, ...(await this.loadCustomAll<T>(kind, dmId))];
  }

  private async getMergedOne<T>(
    kind: CustomContentKind,
    index: string,
  ): Promise<T> {
    if (index.startsWith(CUSTOM_PREFIX)) {
      const found = await this.loadCustomOne<T>(
        kind,
        index.slice(CUSTOM_PREFIX.length),
      );
      if (!found) throw new NotFoundException(`${kind}/${index} not found`);
      return found;
    }
    return this.loadOne<T>(kind, index);
  }

  private async resolveCampaignDmId(
    campaignId: string,
    user: RequestUser,
  ): Promise<string> {
    const result = await this.db.execute(
      `SELECT c.dm_id AS dm_id FROM campaigns c
       LEFT JOIN campaign_members cm
         ON cm.campaign_id = c.id AND cm.user_id = ? AND cm.status = 'active'
       WHERE c.id = ? AND (c.dm_id = ? OR cm.id IS NOT NULL)`,
      [user.id, campaignId, user.id],
    );
    const row = result.rows[0];
    if (!row) throw new ForbiddenException('Not a member of that campaign');
    return row.dm_id as string;
  }

  private async loadCustomAll<T>(
    kind: CustomContentKind,
    dmId: string,
  ): Promise<T[]> {
    const result = await this.db.execute(
      `SELECT data FROM ${CUSTOM_TABLE[kind]} WHERE created_by = ? ORDER BY name ASC`,
      [dmId],
    );
    return result.rows.map((row) =>
      this.withSource(
        JSON.parse(row.data as string) as T,
        HOMEBREW_SOURCE_CODE,
      ),
    );
  }

  private async loadCustomOne<T>(
    kind: CustomContentKind,
    id: string,
  ): Promise<T | null> {
    const result = await this.db.execute(
      `SELECT data FROM ${CUSTOM_TABLE[kind]} WHERE id = ?`,
      [id],
    );
    const row = result.rows[0];
    return row
      ? this.withSource(
          JSON.parse(row.data as string) as T,
          HOMEBREW_SOURCE_CODE,
        )
      : null;
  }

  private async findCustomRow(kind: CustomContentKind, id: string) {
    const result = await this.db.execute(
      `SELECT id, created_by, data FROM ${CUSTOM_TABLE[kind]} WHERE id = ?`,
      [id],
    );
    const row = result.rows[0];
    if (!row) throw new NotFoundException(`${kind} entry not found`);
    return row;
  }

  private requireCustomId(index: string): string {
    if (!index.startsWith(CUSTOM_PREFIX)) {
      throw new NotFoundException(`Not a custom content index: ${index}`);
    }
    return index.slice(CUSTOM_PREFIX.length);
  }

  // ── Authoring: always "my library", keyed off the requesting user — never campaign-scoped ──

  async listMine(kind: CustomContentKind, user: RequestUser) {
    const result = await this.db.execute(
      `SELECT data FROM ${CUSTOM_TABLE[kind]} WHERE created_by = ? ORDER BY name ASC`,
      [user.id],
    );
    return result.rows.map((row) =>
      this.withSource(
        JSON.parse(row.data as string) as unknown,
        HOMEBREW_SOURCE_CODE,
      ),
    );
  }

  async createCustom(
    kind: CustomContentKind,
    user: RequestUser,
    dto: Record<string, unknown>,
  ) {
    const id = randomUUID();
    const index = `${CUSTOM_PREFIX}${id}`;
    const data = this.withSource({ ...dto, index }, HOMEBREW_SOURCE_CODE);
    await this.db.execute(
      `INSERT INTO ${CUSTOM_TABLE[kind]} (id, created_by, name, data) VALUES (?, ?, ?, ?)`,
      [
        id,
        user.id,
        typeof dto.name === 'string' ? dto.name : '',
        JSON.stringify(data),
      ],
    );
    return data;
  }

  async updateCustom(
    kind: CustomContentKind,
    index: string,
    user: RequestUser,
    dto: Record<string, unknown>,
  ) {
    const id = this.requireCustomId(index);
    const row = await this.findCustomRow(kind, id);
    if (row.created_by !== user.id) throw new ForbiddenException();
    const data = this.withSource({ ...dto, index }, HOMEBREW_SOURCE_CODE);
    await this.db.execute(
      `UPDATE ${CUSTOM_TABLE[kind]} SET name = ?, data = ?, updated_at = datetime('now') WHERE id = ?`,
      [typeof dto.name === 'string' ? dto.name : '', JSON.stringify(data), id],
    );
    return data;
  }

  async deleteCustom(
    kind: CustomContentKind,
    index: string,
    user: RequestUser,
  ) {
    const id = this.requireCustomId(index);
    const row = await this.findCustomRow(kind, id);
    if (row.created_by !== user.id) throw new ForbiddenException();
    await this.db.execute(`DELETE FROM ${CUSTOM_TABLE[kind]} WHERE id = ?`, [
      id,
    ]);
    return { deleted: true };
  }
}
