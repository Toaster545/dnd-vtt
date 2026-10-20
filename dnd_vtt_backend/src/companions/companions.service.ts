import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomInt, randomUUID } from 'crypto';
import { DatabaseService } from '../common/database.service';
import { RequestUser } from '../common/current-user.decorator';
import { withCharacterLock } from '../common/character-lock';
import {
  CompanionOwner,
  CompanionState,
  CompanionTurn,
  companionOptions,
  isIncapacitated,
  resolveCompanion,
} from './companion-rules';
import { parsePortraitImage } from '../common/portrait-image';
import { CompanionsGateway } from './companions.gateway';

@Injectable()
export class CompanionsService {
  constructor(
    private db: DatabaseService,
    private events: CompanionsGateway,
  ) {}

  async owner(id: string, user?: RequestUser): Promise<CompanionOwner> {
    const result = await this.db.execute(
      'SELECT ch.*, c.dm_id FROM characters ch LEFT JOIN campaigns c ON c.id=ch.campaign_id WHERE ch.id=?',
      [id],
    );
    const row = result.rows[0];
    if (!row) throw new NotFoundException('Character not found');
    if (user && row.user_id !== user.id && row.dm_id !== user.id)
      throw new ForbiddenException();
    return {
      ...this.db.parseJson<Record<string, unknown>>(row.data as string, {}),
      ...row,
    } as unknown as CompanionOwner;
  }

  async context(owner: CompanionOwner) {
    if (!owner.campaign_id) return null;
    const result = await this.db.execute(
      `SELECT e.id, e.round_number, e.current_turn_token_id, t.character_id
      FROM encounters e JOIN sessions s ON s.id=e.session_id LEFT JOIN map_tokens t ON t.id=e.current_turn_token_id
      WHERE s.campaign_id=? AND e.status='active' LIMIT 1`,
      [owner.campaign_id],
    );
    const row = result.rows[0];
    return row
      ? {
          encounterId: row.id as string,
          turnKey: `${Number(row.round_number)}:${(row.current_turn_token_id as string | null) ?? ''}`,
          ownerTurn: row.character_id === owner.id,
          started: !!row.current_turn_token_id,
        }
      : null;
  }

  // Tokens are views of the saved companion, never a second HP store.
  async decorateTokens(tokens: Record<string, unknown>[]) {
    const result: Record<string, unknown>[] = [];
    for (const token of tokens) {
      if (!token.companion_id) {
        result.push(token);
        continue;
      }
      const rows = await this.db.execute(
        'SELECT character_id,data FROM companions WHERE id=?',
        [token.companion_id],
      );
      const row = rows.rows[0];
      if (!row) continue;
      const owner = await this.owner(row.character_id as string);
      const state = this.db.parseJson<CompanionState>(
        row.data as string,
        {} as CompanionState,
      );
      const stats = resolveCompanion(owner, state);
      if (state.status === 'dismissed' || !stats.eligible) continue;
      const ownerToken = tokens.find((t) => t.character_id === owner.id);
      result.push({
        ...token,
        label: state.name,
        hp: stats.current_hp,
        max_hp: stats.max_hp,
        companion_owner_id: owner.id,
        companion_owner_token_id: ownerToken?.id ?? null,
        companion_speed: Math.max(
          ...Object.values(stats.speed).filter(
            (n): n is number => typeof n === 'number',
          ),
        ),
        initiative: ownerToken?.initiative ?? null,
        image_url: state.portrait_image ?? null,
      });
    }
    return result;
  }

  async list(characterId: string, user: RequestUser) {
    const owner = await this.owner(characterId, user);
    const context = await this.context(owner);
    const result = await this.db.execute(
      'SELECT * FROM companions WHERE character_id=? ORDER BY created_at, id',
      [characterId],
    );
    const companions = await Promise.all(
      result.rows.map(async (row) => {
        const state = this.db.parseJson<CompanionState>(
          row.data as string,
          {} as CompanionState,
        );
        const turn = context
          ? await this.turn(row.id as string, context.encounterId)
          : {};
        return {
          id: row.id as string,
          character_id: characterId,
          ...state,
          stats: resolveCompanion(owner, state),
          turn: context ? { ...turn, ...context } : null,
        };
      }),
    );
    return {
      options: companionOptions(owner),
      companions,
      context,
      ownerIncapacitated: isIncapacitated(owner.conditions),
      arcaneJoltUsed: owner.resource_uses?.['battle-smith-arcane-jolt'] ?? 0,
    };
  }

  private async turn(
    id: string,
    encounterId: string,
  ): Promise<Partial<CompanionTurn> & { joltUsed?: boolean }> {
    const result = await this.db.execute(
      'SELECT data FROM companion_turns WHERE companion_id=? AND encounter_id=?',
      [id, encounterId],
    );
    return this.db.parseJson(result.rows[0]?.data as string, {});
  }

  async create(
    characterId: string,
    user: RequestUser,
    body: Record<string, unknown>,
  ) {
    return withCharacterLock(characterId, async () => {
      const owner = await this.owner(characterId, user);
      const option = companionOptions(owner).find((o) => o.kind === body.kind);
      if (!option || !option.forms.includes(String(body.form)))
        throw new BadRequestException(
          'This companion is not available to this character.',
        );
      const existing = await this.db.execute(
        'SELECT id FROM companions WHERE character_id=? AND kind=?',
        [characterId, option.kind],
      );
      if (existing.rows.length)
        throw new ConflictException(
          'Manage or replace your existing companion.',
        );
      const state: CompanionState = {
        kind: option.kind,
        form: body.form as CompanionState['form'],
        name: this.name(body.name, option.name),
        status: 'active',
        damage: 0,
        temp_hp: 0,
        conditions: [],
        resource_uses: {},
        hit_dice_used: 0,
        revision: 1,
      };
      await this.db.execute(
        'INSERT INTO companions(id,character_id,kind,data) VALUES(?,?,?,?)',
        [randomUUID(), characterId, option.kind, JSON.stringify(state)],
      );
      this.events.changed(owner.campaign_id, characterId);
      return this.list(characterId, user);
    });
  }

  async update(
    characterId: string,
    id: string,
    user: RequestUser,
    body: Record<string, unknown>,
    slots: (
      owner: CompanionOwner,
    ) => { key: string; slots: Record<string, number> }[] = () => [],
  ) {
    return withCharacterLock(characterId, async () => {
      const owner = await this.owner(characterId, user);
      const rows = await this.db.execute(
        'SELECT * FROM companions WHERE id=? AND character_id=?',
        [id, characterId],
      );
      owner.__slotPools = slots(owner);
      if (!rows.rows[0]) throw new NotFoundException('Companion not found');
      const state = this.db.parseJson<
        CompanionState & { replacement_available?: boolean }
      >(rows.rows[0].data as string, {} as CompanionState);
      if (body.revision !== state.revision)
        throw new ConflictException(
          'Companion changed. Refresh and try again.',
        );
      const stats = resolveCompanion(owner, state);
      const context = await this.context(owner);
      const turn = context ? await this.turn(id, context.encounterId) : {};
      const statements: { sql: string; args: any[] }[] = [];
      let notice: string | undefined;
      const action = String(body.action);
      const active = () => {
        if (
          !stats.eligible ||
          state.status !== 'active' ||
          stats.current_hp <= 0 ||
          isIncapacitated(state.conditions)
        )
          throw new ConflictException('This companion cannot act.');
      };
      const ownTurn = () => {
        if (context?.started && !context.ownerTurn)
          throw new ConflictException('It is not the owner’s turn.');
      };
      const incapacitated = isIncapacitated(owner.conditions);
      if (action === 'rename') state.name = this.name(body.name, state.name);
      else if (action === 'portrait') {
        const portrait =
          typeof body.portrait_image === 'string' ? body.portrait_image : '';
        if (
          body.portrait_image != null &&
          typeof body.portrait_image !== 'string'
        )
          throw new BadRequestException('Invalid portrait');
        if (portrait && !parsePortraitImage(portrait))
          throw new BadRequestException('Invalid uploaded portrait');
        state.portrait_image = portrait || undefined;
      } else if (action === 'hp') {
        const amount = this.integer(body.amount, -10000, 10000);
        if (state.status !== 'active')
          throw new ConflictException('Restore or summon the companion first.');
        if (amount < 0) {
          const absorbed = Math.min(state.temp_hp, -amount);
          state.temp_hp -= absorbed;
          state.damage = Math.min(
            stats.max_hp,
            state.damage - amount - absorbed,
          );
        } else state.damage = Math.max(0, state.damage - amount);
        if (state.damage >= stats.max_hp) {
          state.status = 'dead';
          state.died_at = new Date().toISOString();
        }
      } else if (action === 'correct_hp') {
        const hp = this.integer(body.amount, 0, stats.max_hp);
        state.damage = stats.max_hp - hp;
        state.status = hp ? 'active' : 'dead';
        if (hp) delete state.died_at;
        else state.died_at = new Date().toISOString();
      } else if (action === 'temp_hp')
        state.temp_hp = this.integer(body.amount, 0, 10000);
      else if (action === 'conditions') {
        if (
          !Array.isArray(body.conditions) ||
          body.conditions.length > 20 ||
          body.conditions.some((c) => typeof c !== 'string' || c.length > 60)
        )
          throw new BadRequestException('Invalid conditions');
        state.conditions = [...new Set(body.conditions as string[])];
      } else if (action === 'dismiss') state.status = 'dismissed';
      else if (action === 'replace' || action === 'revive') {
        if (!stats.eligible)
          throw new ConflictException(
            'The companion feature is no longer available.',
          );
        if (action === 'revive') {
          if (
            state.status !== 'dead' ||
            !state.died_at ||
            Date.now() - Date.parse(state.died_at) > 3600000
          )
            throw new ConflictException(
              'Revival requires a companion that died within the last hour.',
            );
          statements.push(this.spendSlot(owner, body));
          notice = 'Revival completed after 1 minute; one spell slot spent.';
        } else {
          const option = companionOptions(owner).find(
            (o) => o.kind === state.kind,
          )!;
          if (!option.forms.includes(String(body.form)))
            throw new BadRequestException('Invalid companion form');
          if (!state.replacement_available) {
            if (state.kind === 'primal')
              throw new ConflictException(
                'Replacing a primal beast requires finishing a Long Rest.',
              );
            statements.push(this.spendSlot(owner, body));
          }
          state.form = body.form as CompanionState['form'];
          state.resource_uses = {};
          state.hit_dice_used = 0;
          state.replacement_available = false;
          statements.push({
            sql: 'DELETE FROM companion_turns WHERE companion_id=?',
            args: [id],
          });
        }
        state.status = 'active';
        state.damage = 0;
        state.temp_hp = 0;
        state.conditions = [];
        delete state.died_at;
      } else if (action === 'command') {
        active();
        ownTurn();
        if (incapacitated)
          throw new ConflictException(
            'The owner is incapacitated; the companion may act independently.',
          );
        if (!['bonus_action', 'replace_attack'].includes(String(body.cost)))
          throw new BadRequestException('Invalid command cost');
        if (
          body.cost === 'replace_attack' &&
          (!stats.command.replaceAttack || body.command !== 'strike')
        )
          throw new BadRequestException(
            'Replacing an attack only permits the companion’s strike.',
          );
        if (context?.started && turn.command)
          throw new ConflictException(
            'A command is already recorded. Reset it before correcting the command.',
          );
        if (
          !stats.actions.some(
            (a) => a.key === body.command && a.activation === 'action',
          )
        )
          throw new BadRequestException('Invalid command');
        turn.command = String(body.command);
        turn.commandCost = body.cost as CompanionTurn['commandCost'];
      } else if (action === 'use') {
        active();
        const entry = stats.actions.find((a) => a.key === body.key);
        if (!entry) throw new BadRequestException('Unknown companion action');
        const bonus = body.bonus === true;
        if (entry.activation !== 'reaction') ownTurn();
        if (
          bonus &&
          (!stats.command.exceptionalTraining ||
            turn.commandCost !== 'bonus_action' ||
            !['dash', 'disengage', 'dodge', 'help'].includes(entry.key))
        )
          throw new ConflictException('This bonus action is not available.');
        if (
          context?.started &&
          entry.activation === 'action' &&
          !bonus &&
          !incapacitated &&
          entry.key !== 'dodge' &&
          turn.command !== entry.key
        )
          throw new ConflictException('Issue a command for this action first.');
        const field =
          entry.activation === 'reaction'
            ? 'reactionUsed'
            : bonus
              ? 'bonusUsed'
              : 'actionUsed';
        if (context?.started && turn[field])
          throw new ConflictException(
            'Already used. Use the correction control if needed.',
          );
        turn[field] = true;
        if (entry.uses) {
          if ((state.resource_uses[entry.key] ?? 0) >= entry.uses)
            throw new ConflictException('No uses remaining.');
          state.resource_uses[entry.key] =
            (state.resource_uses[entry.key] ?? 0) + 1;
        }
        if (entry.key === 'repair') {
          const healed = Math.max(
            0,
            randomInt(1, 9) +
              randomInt(1, 9) +
              Math.floor(((owner.ability_scores?.intelligence ?? 10) - 10) / 2),
          );
          if (body.target !== 'other')
            state.damage = Math.max(0, state.damage - healed);
          notice = `Repair restores ${healed} HP${body.target === 'other' ? ' to the chosen Construct or object; apply this healing to its sheet' : ''}.`;
        } else if (entry.attack_bonus !== undefined) {
          const count =
            entry.activation === 'reaction' ? 1 : (entry.attacks ?? 1);
          notice = `${entry.name}: ${Array.from({ length: count }, () => {
            const die = randomInt(1, 21);
            const match = /^(\d+)d(\d+)([+-]\d+)$/.exec(entry.damage ?? '');
            const damage = match
              ? Math.max(
                  0,
                  randomInt(1, Number(match[2]) + 1) + Number(match[3]),
                )
              : 0;
            return `d20 ${die} ${entry.attack_bonus! >= 0 ? '+' : ''}${entry.attack_bonus} = ${die + entry.attack_bonus!}; damage ${damage} ${entry.damage_type}`;
          }).join(' | ')}. Apply damage only on a hit.`;
        }
      } else if (action === 'correct_turn') {
        if (
          ![
            'actionUsed',
            'bonusUsed',
            'reactionUsed',
            'command',
            'joltUsed',
          ].includes(String(body.field))
        )
          throw new BadRequestException('Invalid correction');
        delete (turn as Record<string, unknown>)[String(body.field)];
        if (body.field === 'command') delete turn.commandCost;
      } else if (action === 'restore_resource') {
        if (body.key !== 'repair')
          throw new BadRequestException('Unknown resource');
        state.resource_uses.repair = Math.max(
          0,
          (state.resource_uses.repair ?? 0) - 1,
        );
      } else if (action === 'short_rest') {
        active();
        const count = this.integer(
          body.hitDice,
          1,
          Math.max(0, stats.hit_dice - state.hit_dice_used),
        );
        const con = Math.floor((stats.ability_scores.constitution - 10) / 2);
        const healed = Array.from({ length: count }, () =>
          Math.max(0, randomInt(1, stats.hit_die + 1) + con),
        ).reduce((a, b) => a + b, 0);
        state.hit_dice_used += count;
        state.damage = Math.max(0, state.damage - healed);
        notice = `Short Rest: ${healed} HP restored using ${count} Hit Dice.`;
      } else if (action === 'jolt') {
        active();
        if (state.kind !== 'steel' || stats.class_level < 9)
          throw new BadRequestException('Arcane Jolt is not available.');
        if (context?.started && turn.joltUsed)
          throw new ConflictException(
            'Arcane Jolt was already used this turn.',
          );
        const uses = { ...(owner.resource_uses ?? {}) };
        const max = Math.max(
          1,
          Math.floor(((owner.ability_scores?.intelligence ?? 10) - 10) / 2),
        );
        if ((uses['battle-smith-arcane-jolt'] ?? 0) >= max)
          throw new ConflictException('No Arcane Jolt uses remaining.');
        uses['battle-smith-arcane-jolt'] =
          (uses['battle-smith-arcane-jolt'] ?? 0) + 1;
        statements.push({
          sql: "UPDATE characters SET data=json_set(data,'$.resource_uses',json(?)), updated_at=? WHERE id=?",
          args: [JSON.stringify(uses), new Date().toISOString(), characterId],
        });
        turn.joltUsed = true;
        notice = `Arcane Jolt: ${Array.from({ length: stats.class_level >= 15 ? 4 : 2 }, () => randomInt(1, 7)).reduce((a, b) => a + b, 0)} Force damage or healing. Apply to the chosen target.`;
      } else throw new BadRequestException('Unknown companion operation');
      state.revision++;
      statements.push({
        sql: 'UPDATE companions SET data=?, updated_at=? WHERE id=?',
        args: [JSON.stringify(state), new Date().toISOString(), id],
      });
      if (
        context &&
        ['command', 'use', 'correct_turn', 'jolt'].includes(action)
      )
        statements.push({
          sql: 'INSERT INTO companion_turns(encounter_id,companion_id,data) VALUES(?,?,?) ON CONFLICT(encounter_id,companion_id) DO UPDATE SET data=excluded.data',
          args: [context.encounterId, id, JSON.stringify(turn)],
        });
      await this.db.executeMany(statements);
      this.events.changed(
        owner.campaign_id,
        characterId,
        ['revive', 'replace', 'jolt'].includes(action),
      );
      return { ...(await this.list(characterId, user)), notice };
    });
  }

  // Called inside the character's resource-operation lock, after a completed Long Rest.
  async longRest(characterId: string) {
    const rows = await this.db.execute(
      'SELECT id,data FROM companions WHERE character_id=?',
      [characterId],
    );
    for (const row of rows.rows) {
      const state = this.db.parseJson<
        CompanionState & { replacement_available: boolean }
      >(
        row.data as string,
        {} as CompanionState & { replacement_available: boolean },
      );
      if (state.status === 'active') {
        state.damage = 0;
        state.temp_hp = 0;
        state.hit_dice_used = 0;
        state.resource_uses = {};
      }
      state.replacement_available = true;
      state.revision++;
      await this.db.execute('UPDATE companions SET data=? WHERE id=?', [
        JSON.stringify(state),
        row.id,
      ]);
    }
    const owner = await this.owner(characterId);
    this.events.changed(owner.campaign_id, characterId);
  }

  private spendSlot(owner: CompanionOwner, body: Record<string, unknown>) {
    const level = this.integer(body.slotLevel, 1, 9);
    const key =
      typeof body.poolKey === 'string' ? body.poolKey : 'spellcasting';
    // Slot capacities are resolved by the same character spellcasting resolver used for casts.
    const pools = owner.spell_slot_uses as
      Record<string, Record<string, number>> | undefined;
    const used = { ...(pools ?? {}) };
    const pool = {
      ...(used[key] ??
        (key === 'spellcasting'
          ? ((owner.spell_slots_used as Record<string, number>) ?? {})
          : {})),
    };
    // Capacities are supplied by the server resolver attached by the controller, never the client.
    const capacity =
      (
        owner.__slotPools as
          { key: string; slots: Record<string, number> }[] | undefined
      )?.find((p) => p.key === key)?.slots[String(level)] ?? 0;
    if ((pool[String(level)] ?? 0) >= capacity)
      throw new ConflictException('No spell slot available in that pool.');
    pool[String(level)] = (pool[String(level)] ?? 0) + 1;
    used[key] = pool;
    return {
      sql: "UPDATE characters SET data=json_set(data,'$.spell_slot_uses',json(?),'$.spell_slots_used',json(?)), updated_at=? WHERE id=?",
      args: [
        JSON.stringify(used),
        JSON.stringify(
          key === 'spellcasting' ? pool : (owner.spell_slots_used ?? {}),
        ),
        new Date().toISOString(),
        owner.id,
      ],
    };
  }
  private integer(value: unknown, min: number, max: number) {
    if (
      typeof value !== 'number' ||
      !Number.isInteger(value) ||
      value < min ||
      value > max
    )
      throw new BadRequestException(
        `Expected an integer between ${min} and ${max}`,
      );
    return value;
  }
  private name(value: unknown, fallback: string) {
    if (value === undefined) return fallback;
    if (typeof value !== 'string' || !value.trim() || value.trim().length > 80)
      throw new BadRequestException('Name must be 1–80 characters');
    return value.trim();
  }
}
