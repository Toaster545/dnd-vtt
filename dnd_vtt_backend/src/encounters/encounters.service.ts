import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import { DatabaseService } from '../common/database.service';
import { CreateEncounterDto } from './dto/create-encounter.dto';
import { EncounterPresenceGateway } from './encounter-presence.gateway';
import type { RequestUser } from '../common/current-user.decorator';
import { serializePlayerTokens } from '../maps/player-tokens';
import { TokensGateway } from '../maps/tokens.gateway';

export interface EncounterLevel {
  map_id: string;
  name: string;
  position: number;
}

@Injectable()
export class EncountersService {
  constructor(
    private db: DatabaseService,
    private presence: EncounterPresenceGateway,
    private tokensGateway: TokensGateway,
  ) {}

  async findAllForUser(dmId: string) {
    const result = await this.db.execute(
      'SELECT * FROM encounters WHERE dm_id = ? ORDER BY created_at DESC',
      [dmId],
    );
    return this.withLevels(result.rows.map((r) => this.deserialize(r)));
  }

  // Encounters within a session, for whoever the caller is: the owning DM sees everything
  // (including hidden/draft encounters, for planning ahead); an active campaign member only sees
  // encounters the DM has revealed (`visible_to_players`).
  async findBySession(sessionId: string, user: RequestUser) {
    const session = await this.db.execute(
      'SELECT * FROM sessions WHERE id = ?',
      [sessionId],
    );
    const sessionRow = session.rows[0];
    if (!sessionRow) throw new NotFoundException('Session not found');

    const isOwner = sessionRow.dm_id === user.id;
    if (!isOwner) {
      await this.assertActiveMember(sessionRow.campaign_id as string, user.id);
      if (!sessionRow.visible_to_players) throw new ForbiddenException();
    }

    const result = await this.db.execute(
      isOwner
        ? 'SELECT * FROM encounters WHERE session_id = ? ORDER BY created_at DESC'
        : `SELECT * FROM encounters WHERE session_id = ? AND visible_to_players = 1 ORDER BY created_at DESC`,
      [sessionId],
    );
    const encounters = result.rows.map((r) => this.deserialize(r));
    // Players don't get the level list — which floors exist (and their names) is DM knowledge
    // until the party actually gets there.
    return isOwner ? this.withLevels(encounters) : encounters;
  }

  // The currently-active encounter anywhere in a campaign, regardless of which session it belongs
  // to — mirrors the one-active-encounter-per-campaign rule enforced in start() below, so the
  // session hub can grey out "Start" on every other encounter before the DM even tries.
  async findActiveForCampaign(campaignId: string, dmId: string) {
    const campaign = await this.db.execute(
      'SELECT dm_id FROM campaigns WHERE id = ?',
      [campaignId],
    );
    const campaignRow = campaign.rows[0];
    if (!campaignRow) throw new NotFoundException('Campaign not found');
    if (campaignRow.dm_id !== dmId) throw new ForbiddenException();

    const result = await this.db.execute(
      `SELECT e.* FROM encounters e
       JOIN sessions s ON s.id = e.session_id
       WHERE s.campaign_id = ? AND e.status = 'active' LIMIT 1`,
      [campaignId],
    );
    const row = result.rows[0];
    return row ? (await this.withLevels([this.deserialize(row)]))[0] : null;
  }

  private async assertActiveMember(campaignId: string, userId: string) {
    const membership = await this.db.execute(
      `SELECT id FROM campaign_members WHERE campaign_id = ? AND user_id = ? AND status = 'active'`,
      [campaignId, userId],
    );
    if (membership.rows.length === 0) throw new ForbiddenException();
  }

  async findOne(id: string, dmId: string) {
    const result = await this.db.execute(
      'SELECT * FROM encounters WHERE id = ?',
      [id],
    );
    const row = result.rows[0];
    if (!row) throw new NotFoundException('Encounter not found');
    if (row.dm_id !== dmId) throw new ForbiddenException();
    const [encounter] = await this.withLevels([this.deserialize(row)]);
    const turnMap = encounter.current_turn_token_id
      ? await this.db.execute('SELECT map_id FROM map_tokens WHERE id = ?', [
          encounter.current_turn_token_id,
        ])
      : null;
    return {
      ...encounter,
      // Which level the active turn is on, so the DM's view (and the popped-out table view) can
      // follow combat between floors.
      current_turn_map_id:
        (turnMap?.rows[0]?.map_id as string | undefined) ?? null,
      // character_id -> level the DM has switched that player to. Characters missing here see
      // the entry level.
      player_levels: await this.playerLevels(id),
    };
  }

  // The level each character's player is shown: the level their token is on (a character has
  // at most one token per encounter, see MapsService.upsertToken), unless the DM explicitly
  // switched them to another level they also have a token on — only possible for encounters
  // set up before that rule, which can still hold duplicates.
  private async playerLevels(
    encounterId: string,
    characterId?: string,
  ): Promise<Record<string, string>> {
    const tokens = await this.db.execute(
      `SELECT t.character_id, t.map_id FROM map_tokens t
       JOIN encounter_levels el ON el.map_id = t.map_id
       WHERE el.encounter_id = ? AND t.character_id IS NOT NULL
         AND (? IS NULL OR t.character_id = ?)
       ORDER BY el.position DESC`,
      [encounterId, characterId ?? null, characterId ?? null],
    );
    const explicit = await this.db.execute(
      `SELECT pl.character_id, pl.map_id FROM encounter_player_levels pl
       JOIN encounter_levels el
         ON el.encounter_id = pl.encounter_id AND el.map_id = pl.map_id
       WHERE pl.encounter_id = ?
         AND (? IS NULL OR pl.character_id = ?)
         AND EXISTS (SELECT 1 FROM map_tokens t
                     WHERE t.map_id = pl.map_id AND t.character_id = pl.character_id)`,
      [encounterId, characterId ?? null, characterId ?? null],
    );
    // Deepest level first, so with legacy duplicates the shallowest one wins.
    return Object.fromEntries(
      [...tokens.rows, ...explicit.rows].map((r) => [
        r.character_id as string,
        r.map_id as string,
      ]),
    );
  }

  // DM switches the level a character's player is shown. Only allowed onto a level where that
  // character already has a token — the DM places it there first, then sends the player over.
  async setPlayerLevel(
    id: string,
    dmId: string,
    characterId: string,
    mapId: string,
  ) {
    const encounter = await this.findOne(id, dmId);
    if (!encounter.levels.some((l) => l.map_id === mapId)) {
      throw new BadRequestException(
        'That map is not a level of this encounter',
      );
    }
    const token = await this.db.execute(
      'SELECT id FROM map_tokens WHERE map_id = ? AND character_id = ? LIMIT 1',
      [mapId, characterId],
    );
    if (!token.rows[0]) {
      throw new BadRequestException(
        'Place this character on that level before moving them there',
      );
    }
    await this.db.execute(
      `INSERT INTO encounter_player_levels (encounter_id, character_id, map_id)
       VALUES (?, ?, ?)
       ON CONFLICT(encounter_id, character_id) DO UPDATE SET map_id = excluded.map_id`,
      [id, characterId, mapId],
    );
    const campaign = await this.db.execute(
      'SELECT campaign_id FROM sessions WHERE id = ?',
      [encounter.session_id],
    );
    const campaignId = campaign.rows[0]?.campaign_id as string | undefined;
    if (campaignId)
      this.presence.notifyCharacterLevelChanged(campaignId, characterId);
    return this.findOne(id, dmId);
  }

  // Ordered levels for each encounter, in one query. `map_id` is normalised to the entry level
  // (position 0) — it can only drift when the entry map itself was deleted, in which case the
  // next level down takes over.
  private async withLevels<T extends { id: unknown; map_id: unknown }>(
    encounters: T[],
  ) {
    if (encounters.length === 0) return [];
    const ids = encounters.map((e) => e.id as string);
    const result = await this.db.execute(
      `SELECT el.encounter_id, el.map_id, el.position, bm.name
       FROM encounter_levels el JOIN battle_maps bm ON bm.id = el.map_id
       WHERE el.encounter_id IN (${ids.map(() => '?').join(',')})
       ORDER BY el.position`,
      ids,
    );
    const byEncounter = new Map<string, EncounterLevel[]>();
    for (const row of result.rows) {
      const list = byEncounter.get(row.encounter_id as string) ?? [];
      list.push({
        map_id: row.map_id as string,
        name: row.name as string,
        position: Number(row.position),
      });
      byEncounter.set(row.encounter_id as string, list);
    }
    return encounters.map((e) => {
      const levels = byEncounter.get(e.id as string) ?? [];
      return { ...e, map_id: levels[0]?.map_id ?? null, levels };
    });
  }

  private async levelMapIds(encounterId: string): Promise<string[]> {
    const result = await this.db.execute(
      'SELECT map_id FROM encounter_levels WHERE encounter_id = ? ORDER BY position',
      [encounterId],
    );
    return result.rows.map((r) => r.map_id as string);
  }

  // Replaces an encounter's whole level list. Every map must belong to the encounter's campaign
  // (maps are campaign-scoped); `encounters.map_id` follows the new entry level.
  private async setLevels(encounterId: string, mapIds: string[]) {
    const unique = [...new Set(mapIds.filter((id) => typeof id === 'string'))];
    if (unique.length) {
      const owned = await this.db.execute(
        `SELECT bm.id FROM battle_maps bm
         JOIN sessions s ON s.campaign_id = bm.campaign_id
         JOIN encounters e ON e.session_id = s.id
         WHERE e.id = ? AND bm.id IN (${unique.map(() => '?').join(',')})`,
        [encounterId, ...unique],
      );
      if (owned.rows.length !== unique.length) {
        throw new BadRequestException(
          'Every level must be a map from this campaign',
        );
      }
    }
    await this.db.executeMany([
      {
        sql: 'DELETE FROM encounter_levels WHERE encounter_id = ?',
        args: [encounterId],
      },
      ...unique.map((mapId, position) => ({
        sql: 'INSERT INTO encounter_levels (encounter_id, map_id, position) VALUES (?, ?, ?)',
        args: [encounterId, mapId, position],
      })),
      {
        sql: 'UPDATE encounters SET map_id = ? WHERE id = ?',
        args: [unique[0] ?? null, encounterId],
      },
    ]);
    this.presence.notifyTokensChanged(encounterId);
  }

  // The level this player is shown: the one the DM switched their campaign character to (see
  // setPlayerLevel), else the entry level. The level count lets the client decide whether
  // naming the floor is worth showing.
  async findMyLevel(id: string, user: RequestUser) {
    await this.findPlayerState(id, user); // access check
    const levelIds = await this.levelMapIds(id);
    const member = await this.db.execute(
      `SELECT cm.character_id FROM campaign_members cm
       JOIN sessions s ON s.campaign_id = cm.campaign_id
       JOIN encounters e ON e.session_id = s.id
       WHERE e.id = ? AND cm.user_id = ? AND cm.status = 'active'`,
      [id, user.id],
    );
    const characterId = member.rows[0]?.character_id as string | undefined;
    let mapId = levelIds[0] ?? null;
    if (characterId) {
      mapId = (await this.playerLevels(id, characterId))[characterId] ?? mapId;
    }
    const name = mapId
      ? (
          await this.db.execute('SELECT name FROM battle_maps WHERE id = ?', [
            mapId,
          ])
        ).rows[0]?.name
      : null;
    return {
      map_id: mapId,
      name: (name as string | undefined) ?? null,
      level_count: levelIds.length,
    };
  }

  async findPlayerState(id: string, user: RequestUser) {
    const result = await this.db.execute(
      `SELECT e.*, s.campaign_id, s.visible_to_players AS session_visible,
              c.dm_id AS campaign_dm_id
       FROM encounters e
       JOIN sessions s ON s.id = e.session_id
       JOIN campaigns c ON c.id = s.campaign_id
       WHERE e.id = ?`,
      [id],
    );
    const row = result.rows[0];
    if (!row) throw new NotFoundException('Encounter not found');
    const isOwner = row.campaign_dm_id === user.id;
    if (!isOwner) {
      await this.assertActiveMember(row.campaign_id as string, user.id);
      if (!row.session_visible || !row.visible_to_players) {
        throw new ForbiddenException();
      }
    }
    if (isOwner) return this.deserialize(row);
    return {
      id: row.id,
      session_id: row.session_id,
      campaign_id: row.campaign_id,
      name: row.name,
      map_id: row.map_id ?? null,
      status: row.status,
      summary: row.summary ?? '',
      current_turn_token_id: row.current_turn_token_id ?? null,
      round_number: Number(row.round_number ?? 1),
      updated_at: row.updated_at,
    };
  }

  // Every token on every level of the encounter, in turn order (see getTurnOrderIds) — the side
  // panel's turn order shouldn't stop at whichever level the viewer happens to be looking at.
  async findTurnOrder(id: string, user: RequestUser) {
    const state = await this.findPlayerState(id, user); // access check
    const isDm = 'dm_id' in state && state.dm_id === user.id;
    const tokens = await this.turnOrderTokens(id);
    return isDm ? tokens : serializePlayerTokens(tokens);
  }

  async create(dmId: string, dto: CreateEncounterDto) {
    const session = await this.db.execute(
      'SELECT dm_id FROM sessions WHERE id = ?',
      [dto.session_id],
    );
    const sessionRow = session.rows[0];
    if (!sessionRow) throw new NotFoundException('Session not found');
    if (sessionRow.dm_id !== dmId) throw new ForbiddenException();

    const id = randomUUID();
    await this.db.execute(
      `INSERT INTO encounters (id, dm_id, session_id, name, monsters, character_ids)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        id,
        dmId,
        dto.session_id,
        dto.name,
        JSON.stringify(dto.monsters ?? []),
        JSON.stringify(dto.character_ids ?? []),
      ],
    );
    await this.setLevels(id, dto.map_ids ?? (dto.map_id ? [dto.map_id] : []));
    return this.findOne(id, dmId);
  }

  async update(id: string, dmId: string, body: Record<string, unknown>) {
    const current = await this.findOne(id, dmId);
    const name = (body.name as string | undefined) ?? current.name;
    if (Array.isArray(body.map_ids)) {
      await this.setLevels(id, body.map_ids as string[]);
    } else if (body.map_id !== undefined) {
      // Older single-map callers: swap the entry level, keep any levels below it.
      const below = current.levels
        .slice(1)
        .map((l) => l.map_id)
        .filter((m) => m !== body.map_id);
      const entry = body.map_id as string | null;
      await this.setLevels(id, entry ? [entry, ...below] : below);
    }
    const monsters =
      body.monsters !== undefined ? body.monsters : current.monsters;
    const character_ids =
      body.character_ids !== undefined
        ? body.character_ids
        : current.character_ids;
    const summary = (body.summary as string | undefined) ?? current.summary;
    await this.db.execute(
      `UPDATE encounters SET name=?, monsters=?, character_ids=?, summary=?, updated_at=? WHERE id=?`,
      [
        name,
        JSON.stringify(monsters),
        JSON.stringify(character_ids),
        summary,
        new Date().toISOString(),
        id,
      ],
    );
    return this.findOne(id, dmId);
  }

  async setVisibility(id: string, dmId: string, visible: boolean) {
    await this.findOne(id, dmId);
    await this.db.execute(
      `UPDATE encounters SET visible_to_players=?, updated_at=? WHERE id=?`,
      [visible ? 1 : 0, new Date().toISOString(), id],
    );
    return this.findOne(id, dmId);
  }

  async remove(id: string, dmId: string) {
    await this.findOne(id, dmId);
    await this.db.execute('DELETE FROM encounters WHERE id = ?', [id]);
    return { deleted: true };
  }

  async start(id: string, dmId: string) {
    const current = await this.findOne(id, dmId);
    if (!current.session_id) {
      throw new BadRequestException('Encounter is not attached to a session');
    }
    const sessionResult = await this.db.execute(
      `SELECT campaign_id FROM sessions WHERE id = ?`,
      [current.session_id],
    );
    const campaignId = sessionResult.rows[0]?.campaign_id as string | undefined;
    if (!campaignId)
      throw new BadRequestException('Encounter session is invalid');
    const active = await this.db.execute(
      `SELECT e.id FROM encounters e
       JOIN sessions s ON s.id = e.session_id
       WHERE s.campaign_id = ? AND e.status = 'active' AND e.id <> ? LIMIT 1`,
      [campaignId, id],
    );
    if (active.rows[0]) {
      throw new ConflictException(
        'Stop the active campaign encounter before starting another.',
      );
    }

    // Starting play necessarily reveals the encounter — players need to see it to join it. The DM
    // can still re-hide it afterward via setVisibility. Also resets any turn tracking left over
    // from a previous run of this encounter, so play always starts from "no active turn, round 1".
    await this.db.execute(
      `UPDATE encounters SET status='active', visible_to_players=1,
       current_turn_token_id=NULL, round_number=1, updated_at=? WHERE id=?`,
      [new Date().toISOString(), id],
    );
    const updated = await this.findOne(id, dmId);

    if (updated.session_id) {
      // The session itself gates whether a player even sees it in their campaign hub's session
      // list (see CampaignsService.findOne) — without this, a DM could start an encounter that's
      // now individually visible, but players would have no way to navigate to it because its
      // parent session was never separately revealed.
      await this.db.execute(
        `UPDATE sessions SET visible_to_players=1 WHERE id=?`,
        [updated.session_id],
      );

      await this.db.execute(
        `UPDATE campaigns SET current_session_id=?, updated_at=? WHERE id=?`,
        [updated.session_id, new Date().toISOString(), campaignId],
      );

      if (campaignId) {
        this.presence.notifyEncounterStarted({
          encounterId: updated.id as string,
          sessionId: updated.session_id as string,
          campaignId,
          name: updated.name as string,
        });
      }
    }

    return updated;
  }

  async stop(id: string, dmId: string) {
    await this.findOne(id, dmId);
    await this.db.execute(
      `UPDATE encounters SET status='ended', updated_at=? WHERE id=?`,
      [new Date().toISOString(), id],
    );
    return this.findOne(id, dmId);
  }

  private deserialize(row: Record<string, unknown>) {
    // Older rows may still carry the pre-simplification `{ monsterIndex, quantity }` shape;
    // normalize to plain indices so callers never have to care which shape a given row used.
    const monsters = this.db
      .parseJson<unknown[]>(row.monsters as string, [])
      .map((m) =>
        typeof m === 'string'
          ? m
          : (m as { monsterIndex: string }).monsterIndex,
      );

    return {
      id: row.id,
      dm_id: row.dm_id,
      session_id: row.session_id,
      name: row.name,
      map_id: row.map_id,
      monsters,
      character_ids: this.db.parseJson(row.character_ids as string, []),
      status: row.status,
      summary: row.summary ?? '',
      visible_to_players: !!row.visible_to_players,
      current_turn_token_id: row.current_turn_token_id ?? null,
      round_number: (row.round_number as number) ?? 1,
      created_at: row.created_at,
      updated_at: row.updated_at,
    };
  }

  // Tokens on every level of the encounter — combat doesn't stop at the stairs — ordered the
  // same way the frontend's own `turnOrder` computed sorts them (battle-map.ts): highest
  // initiative first, unrolled (null) tokens last. A character takes one turn no matter how many
  // tokens it has, so only the token on its player's level counts (see playerLevels).
  private async turnOrderTokens(encounterId: string) {
    const result = await this.db.execute(
      `SELECT t.* FROM map_tokens t
       JOIN encounter_levels el ON el.map_id = t.map_id
       WHERE el.encounter_id = ?
       ORDER BY (t.initiative IS NULL) ASC, t.initiative DESC`,
      [encounterId],
    );
    const levels = await this.playerLevels(encounterId);
    const seen = new Set<string>();
    return result.rows
      .filter((t) => {
        const characterId = t.character_id as string | null;
        if (!characterId) return true;
        if (t.map_id !== levels[characterId] || seen.has(characterId))
          return false;
        seen.add(characterId);
        return true;
      })
      .map((t) => ({
        ...(t as Record<string, unknown>),
        is_player: !!t.is_player,
      })) as (Record<string, unknown> & { is_player: boolean })[];
  }

  private async getTurnOrderIds(encounterId: string): Promise<string[]> {
    return (await this.turnOrderTokens(encounterId)).map((t) => t.id as string);
  }

  async nextTurn(id: string, dmId: string) {
    const encounter = await this.findOne(id, dmId);
    if (!encounter.levels.length)
      throw new BadRequestException('Encounter has no map attached');
    const order = await this.getTurnOrderIds(id);
    if (order.length === 0)
      throw new BadRequestException('No tokens on the map yet');

    const currentId = encounter.current_turn_token_id as string | null;
    const idx = currentId ? order.indexOf(currentId) : -1;
    let round = encounter.round_number;
    let nextIdx: number;
    if (idx === -1) {
      // Not started yet, or the previously-active token is no longer on the map.
      nextIdx = 0;
    } else {
      nextIdx = idx + 1;
      if (nextIdx >= order.length) {
        nextIdx = 0;
        round += 1;
      }
    }

    return this.applyTurn(id, dmId, order[nextIdx], round);
  }

  async previousTurn(id: string, dmId: string) {
    const encounter = await this.findOne(id, dmId);
    if (!encounter.levels.length)
      throw new BadRequestException('Encounter has no map attached');
    const order = await this.getTurnOrderIds(id);
    if (order.length === 0)
      throw new BadRequestException('No tokens on the map yet');

    const currentId = encounter.current_turn_token_id as string | null;
    const idx = currentId ? order.indexOf(currentId) : -1;
    let round = encounter.round_number;
    // Round 1 begins with the first turn, so stepping back from it un-starts the turn order
    // instead of wrapping to the last token of a round that never happened.
    if (idx <= 0 && round <= 1) return this.applyTurn(id, dmId, null, 1);
    let prevIdx: number;
    if (idx <= 0) {
      prevIdx = order.length - 1;
      round = Math.max(1, round - 1);
    } else {
      prevIdx = idx - 1;
    }

    return this.applyTurn(id, dmId, order[prevIdx], round);
  }

  private async applyTurn(
    id: string,
    dmId: string,
    tokenId: string | null,
    round: number,
  ) {
    await this.db.executeMany([
      // The token whose turn just ended is done with the destination it asked for.
      {
        sql: `UPDATE map_tokens SET planned_x = NULL, planned_y = NULL
              WHERE id = (SELECT current_turn_token_id FROM encounters WHERE id = ?)
                AND id IS NOT ?`,
        args: [id, tokenId],
      },
      {
        sql: `UPDATE encounters SET current_turn_token_id=?, round_number=?, updated_at=? WHERE id=?`,
        args: [tokenId, round, new Date().toISOString(), id],
      },
      // Movement is tracked per turn: only the token whose turn it now is gets a starting point
      // (which is also its first confirmed square), pinned where it stands right now, with
      // nothing traveled yet (see MapsService.confirmTokenMove).
      {
        sql: `UPDATE map_tokens SET
                turn_start_x = CASE WHEN id = ? THEN x END,
                turn_start_y = CASE WHEN id = ? THEN y END,
                turn_anchor_x = CASE WHEN id = ? THEN x END,
                turn_anchor_y = CASE WHEN id = ? THEN y END,
                turn_moved_ft = 0, turn_diagonals = 0
              WHERE map_id IN (SELECT map_id FROM encounter_levels WHERE encounter_id = ?)`,
        args: [tokenId, tokenId, tokenId, tokenId, id],
      },
    ]);
    const updated = await this.findOne(id, dmId);
    // Every level's tokens carry the reset turn_start/turn_moved_ft — push them out so each map
    // drops the previous token's trail and draws the new one's starting point.
    for (const level of updated.levels) {
      const tokens = await this.db.execute(
        'SELECT * FROM map_tokens WHERE map_id = ?',
        [level.map_id],
      );
      this.tokensGateway.broadcastTokens(
        level.map_id,
        tokens.rows.map((r) => ({ ...r, is_player: !!r.is_player })),
      );
    }
    this.presence.broadcastTurnState(id, {
      current_turn_token_id: updated.current_turn_token_id as string | null,
      current_turn_map_id: updated.current_turn_map_id,
      round_number: updated.round_number,
    });
    return updated;
  }
}
