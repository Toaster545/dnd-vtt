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

@Injectable()
export class EncountersService {
  constructor(
    private db: DatabaseService,
    private presence: EncounterPresenceGateway,
  ) {}

  async findAllForUser(dmId: string) {
    const result = await this.db.execute(
      'SELECT * FROM encounters WHERE dm_id = ? ORDER BY created_at DESC',
      [dmId],
    );
    return result.rows.map((r) => this.deserialize(r));
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
    return result.rows.map((r) => this.deserialize(r));
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
    return this.deserialize(row);
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
      `INSERT INTO encounters (id, dm_id, session_id, name, map_id, monsters, character_ids)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        dmId,
        dto.session_id,
        dto.name,
        dto.map_id ?? null,
        JSON.stringify(dto.monsters ?? []),
        JSON.stringify(dto.character_ids ?? []),
      ],
    );
    return this.findOne(id, dmId);
  }

  async update(id: string, dmId: string, body: Record<string, unknown>) {
    const current = await this.findOne(id, dmId);
    const name = (body.name as string | undefined) ?? current.name;
    const map_id =
      body.map_id !== undefined
        ? (body.map_id as string | null)
        : current.map_id;
    const monsters =
      body.monsters !== undefined ? body.monsters : current.monsters;
    const character_ids =
      body.character_ids !== undefined
        ? body.character_ids
        : current.character_ids;
    const summary = (body.summary as string | undefined) ?? current.summary;
    await this.db.execute(
      `UPDATE encounters SET name=?, map_id=?, monsters=?, character_ids=?, summary=?, updated_at=? WHERE id=?`,
      [
        name,
        map_id,
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

  // Tokens on the encounter's map, ordered the same way the frontend's own `turnOrder` computed
  // sorts them (battle-map.ts): highest initiative first, unrolled (null) tokens last.
  private async getTurnOrderIds(mapId: string): Promise<string[]> {
    const result = await this.db.execute(
      `SELECT id FROM map_tokens WHERE map_id = ? ORDER BY (initiative IS NULL) ASC, initiative DESC`,
      [mapId],
    );
    return result.rows.map((r) => r.id as string);
  }

  async nextTurn(id: string, dmId: string) {
    const encounter = await this.findOne(id, dmId);
    if (!encounter.map_id)
      throw new BadRequestException('Encounter has no map attached');
    const order = await this.getTurnOrderIds(encounter.map_id as string);
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
    if (!encounter.map_id)
      throw new BadRequestException('Encounter has no map attached');
    const order = await this.getTurnOrderIds(encounter.map_id as string);
    if (order.length === 0)
      throw new BadRequestException('No tokens on the map yet');

    const currentId = encounter.current_turn_token_id as string | null;
    const idx = currentId ? order.indexOf(currentId) : -1;
    let round = encounter.round_number;
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
    tokenId: string,
    round: number,
  ) {
    await this.db.execute(
      `UPDATE encounters SET current_turn_token_id=?, round_number=?, updated_at=? WHERE id=?`,
      [tokenId, round, new Date().toISOString(), id],
    );
    const updated = await this.findOne(id, dmId);
    this.presence.broadcastTurnState(id, {
      current_turn_token_id: updated.current_turn_token_id as string | null,
      round_number: updated.round_number,
    });
    return updated;
  }
}
