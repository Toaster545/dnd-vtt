import { CampaignAccessService } from '../campaigns/campaign-access.service';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import { createTestDb } from '../common/test-db.util';
import { DatabaseService } from '../common/database.service';
import { CompanionsService } from './companions.service';
import { CompanionsGateway } from './companions.gateway';
import {
  CompanionOwner,
  CompanionState,
  companionOptions,
  resolveCompanion,
} from './companion-rules';
import { CharactersService } from '../characters/characters.service';
import { ContentService } from '../content/content.service';
import { EncounterPresenceGateway } from '../encounters/encounter-presence.gateway';
import { EncountersService } from '../encounters/encounters.service';
import { TokensGateway } from '../maps/tokens.gateway';
import { MapsService } from '../maps/maps.service';
import { RequestUser } from '../common/current-user.decorator';

const player = { id: 'player', role: 'player' } as RequestUser;
const dm = { id: 'dm', role: 'admin' } as RequestUser;
const other = { id: 'other', role: 'player' } as RequestUser;
const ranger: CompanionOwner = {
  id: 'hero',
  user_id: 'player',
  name: 'Ranger',
  class: 'Ranger',
  subclass: 'Beast Master',
  level: 5,
  ability_scores: { wisdom: 18, intelligence: 16 },
  conditions: [],
};
const beast: CompanionState = {
  kind: 'primal',
  form: 'land',
  name: 'Ash',
  status: 'active',
  damage: 7,
  temp_hp: 0,
  conditions: [],
  resource_uses: {},
  hit_dice_used: 0,
  revision: 1,
};

describe('companion rules', () => {
  it('includes the level 3 land beast’s bond-adjusted senses and Hit Dice', () => {
    const stats = resolveCompanion({ ...ranger, level: 3 }, beast);
    expect(stats).toMatchObject({
      alignment: 'Neutral',
      passive_perception: 14,
      darkvision: 60,
      hit_dice: 3,
      hit_die: 8,
    });
    expect(stats.traits.some((t) => t.name === 'Primal Markings')).toBe(true);
  });
  it('uses class levels for HP and total level for proficiency in multiclass characters', () => {
    const owner = {
      ...ranger,
      level: 10,
      classes: [
        { name: 'Ranger', subclass: 'Beast Master', level: 3 },
        { name: 'Wizard', level: 7 },
      ],
    };
    const stats = resolveCompanion(owner, beast);
    expect(stats).toMatchObject({
      armor_class: 17,
      max_hp: 20,
      current_hp: 13,
      check_bonus: 4,
    });
    expect(stats.actions[0]).toMatchObject({
      attack_bonus: 8,
      damage: '1d8+6',
    });
  });
  it('resolves distinct 2024 forms and level-dependent features', () => {
    const sky = resolveCompanion(
      { ...ranger, level: 11 },
      { ...beast, form: 'sky' },
    );
    expect(sky).toMatchObject({
      max_hp: 48,
      hit_die: 6,
      speed: { fly: 60 },
      source: 'XPHB',
    });
    expect(sky.actions[0]).toMatchObject({ attacks: 2, damage: '1d4+7' });
    expect(sky.command.exceptionalTraining).toBe(true);
    expect(
      resolveCompanion(ranger, { ...beast, form: 'sea' }).actions[0]
        .description,
    ).toContain('DC 15');
  });
  it('uses EFA defender scaling and preserves damage during level changes', () => {
    const owner = {
      ...ranger,
      class: 'Artificer',
      subclass: 'Battle Smith',
      level: 15,
    };
    const stats = resolveCompanion(owner, {
      ...beast,
      kind: 'steel',
      form: 'defender',
    });
    expect(stats).toMatchObject({
      armor_class: 15,
      max_hp: 80,
      current_hp: 73,
      source: 'EFA',
    });
    expect(
      stats.actions.find((a) => a.key === 'deflect')?.description,
    ).toContain('1d4 + 3');
    expect(
      stats.traits.find((t) => t.name === 'Arcane Jolt')?.description,
    ).toContain('4d6');
  });
  it('requires the subclass and unlock level', () => {
    expect(companionOptions({ ...ranger, level: 2 })).toEqual([]);
    expect(companionOptions({ ...ranger, subclass: 'Hunter' })).toEqual([]);
  });
});

describe('persistent companions', () => {
  let db: DatabaseService;
  let cleanup: () => void;
  let service: CompanionsService;
  let characters: CharactersService;
  let encounters: EncountersService;
  let maps: MapsService;
  const pools = () => [{ key: 'spellcasting', slots: { '1': 4, '2': 2 } }];
  beforeEach(async () => {
    ({ db, cleanup } = await createTestDb());
    for (const id of ['player', 'dm', 'other'])
      await db.execute(
        "INSERT INTO profiles(id,email,username,password_hash,role) VALUES(?,?,?,'x',?)",
        [id, `${id}@test.test`, id, id === 'dm' ? 'admin' : 'player'],
      );
    await db.execute(
      "INSERT INTO characters(id,user_id,name,race,class,level,data) VALUES('hero','player','Ranger','Human','Ranger',5,?)",
      [JSON.stringify(ranger)],
    );
    service = new CompanionsService(db, {
      changed: jest.fn(),
    } as unknown as CompanionsGateway);
    const presence = {
      notifyCharacterUpdated: jest.fn(),
      broadcastTurnState: jest.fn(),
    } as unknown as EncounterPresenceGateway;
    const gateway = { broadcastTokens: jest.fn() } as unknown as TokensGateway;
    characters = new CharactersService(
      db,
      new ContentService(),
      presence,
      service,
    );
    encounters = new EncountersService(
      db,
      presence,
      gateway,
      new CampaignAccessService(db),
      service,
    );
    maps = new MapsService(
      db,
      gateway,
      new ContentService(),
      service,
      new CampaignAccessService(db),
    );
  });
  afterEach(() => cleanup());
  const setupEncounter = async () => {
    await db.execute(
      "INSERT INTO campaigns(id,dm_id,name,join_code) VALUES('campaign','dm','Campaign','ABCD')",
    );
    await db.execute(
      "UPDATE characters SET campaign_id='campaign' WHERE id='hero'",
    );
    await db.execute(
      "INSERT INTO campaign_members(id,campaign_id,user_id,character_id,status) VALUES('member','campaign','player','hero','active')",
    );
    await db.execute(
      "INSERT INTO sessions(id,dm_id,campaign_id,name) VALUES('session','dm','campaign','Session')",
    );
    await db.execute(
      "INSERT INTO battle_maps(id,campaign_id,name,image_url) VALUES('map','campaign','Map','/x.png')",
    );
    await db.execute(
      "INSERT INTO encounters(id,dm_id,session_id,name,map_id,status) VALUES('enc','dm','session','Fight','map','active')",
    );
    await db.execute(
      "INSERT INTO encounter_levels(encounter_id,map_id,position) VALUES('enc','map',0)",
    );
    await db.execute(
      "INSERT INTO map_tokens(id,map_id,label,color,x,y,size,is_player,character_id,initiative) VALUES('owner-token','map','Ranger','#fff',0,0,1,1,'hero',20)",
    );
    await db.execute(
      "INSERT INTO map_tokens(id,map_id,label,color,x,y,size,is_player,initiative) VALUES('enemy','map','Enemy','#fff',3,3,1,0,10)",
    );
    await db.execute(
      "UPDATE encounters SET current_turn_token_id='owner-token' WHERE id='enc'",
    );
  };
  const create = async (kind = 'primal', form = 'land') =>
    (await service.create('hero', player, { kind, form })).companions[0];
  const update = async (
    action: string,
    body: Record<string, unknown> = {},
    user = player,
  ) => {
    const c = (await service.list('hero', user)).companions[0];
    return service.update(
      'hero',
      c.id,
      user,
      { action, revision: c.revision, ...body },
      pools,
    );
  };
  const makeArtificer = async (level = 15) => {
    await db.execute(
      "UPDATE characters SET class='Artificer',level=?,data=? WHERE id='hero'",
      [
        level,
        JSON.stringify({
          ...ranger,
          class: 'Artificer',
          subclass: 'Battle Smith',
          level,
        }),
      ],
    );
  };

  it('keeps state through ordinary character saves and rejects duplicate companions', async () => {
    await create();
    await update('hp', { amount: -8 });
    const hero = await characters.findOne('hero', player.id);
    await characters.update('hero', player, { ...hero, notes: 'Changed' });
    expect(
      (await service.list('hero', player)).companions[0].stats.current_hp,
    ).toBe(22);
    await expect(create()).rejects.toThrow(ConflictException);
  });
  it('enforces owner/DM access independently of character edit locks', async () => {
    await setupEncounter();
    await create();
    await expect(service.list('hero', other)).rejects.toThrow(
      ForbiddenException,
    );
    await update('hp', { amount: -3 }, dm);
    await update('hp', { amount: -2 });
    expect(
      (await service.list('hero', player)).companions[0].stats.current_hp,
    ).toBe(25);
  });
  it('absorbs damage with temporary HP and does not heal dead companions normally', async () => {
    await create();
    await update('temp_hp', { amount: 4 });
    let response = await update('hp', { amount: -7 });
    expect(response.companions[0]).toMatchObject({ damage: 3, temp_hp: 0 });
    response = await update('hp', { amount: -100 });
    expect(response.companions[0].status).toBe('dead');
    await expect(update('hp', { amount: 30 })).rejects.toThrow(
      ConflictException,
    );
  });
  it('consumes a real slot atomically on revival and rejects stale duplicate requests', async () => {
    await create();
    const killed = (await update('hp', { amount: -100 })).companions[0];
    const request = {
      action: 'revive',
      revision: killed.revision,
      poolKey: 'spellcasting',
      slotLevel: 1,
    };
    const results = await Promise.allSettled([
      service.update('hero', killed.id, player, request, pools),
      service.update('hero', killed.id, player, request, pools),
    ]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(
      (await characters.findOne('hero', player.id)).spell_slot_uses,
    ).toEqual({ spellcasting: { '1': 1 } });
    expect(
      (await service.list('hero', player)).companions[0].stats.current_hp,
    ).toBe(30);
  });
  it('rejects exhausted or restricted revival slots without changing companion state', async () => {
    await create();
    await update('hp', { amount: -100 });
    await expect(
      update('revive', { slotLevel: 9, poolKey: 'spellcasting' }),
    ).rejects.toThrow(ConflictException);
    expect((await service.list('hero', player)).companions[0].status).toBe(
      'dead',
    );
  });
  it('permits one replacement after a Long Rest and retains companion identity', async () => {
    const original = await create();
    await expect(update('replace', { form: 'sky' })).rejects.toThrow(
      ConflictException,
    );
    await service.longRest('hero');
    const response = await update('replace', { form: 'sky' });
    expect(response.companions[0]).toMatchObject({
      id: original.id,
      form: 'sky',
      damage: 0,
      replacement_available: false,
    });
    await expect(update('replace', { form: 'sea' })).rejects.toThrow(
      ConflictException,
    );
  });
  it('restores living companions through the owner’s Long Rest but does not resurrect dead ones', async () => {
    await create();
    await update('hp', { amount: -8 });
    await characters.restoreLife('hero', player, { type: 'long_rest' });
    expect((await service.list('hero', player)).companions[0]).toMatchObject({
      damage: 0,
      replacement_available: true,
    });
    await update('hp', { amount: -100 });
    await service.longRest('hero');
    expect((await service.list('hero', player)).companions[0].status).toBe(
      'dead',
    );
  });
  it('requires a command for attacks but lets reactions work independently', async () => {
    await setupEncounter();
    await create();
    await expect(update('use', { key: 'strike' })).rejects.toThrow(
      ConflictException,
    );
    await update('command', { command: 'strike', cost: 'bonus_action' });
    const attack = await update('use', { key: 'strike' });
    expect(attack.notice).toContain('damage');
    await expect(update('use', { key: 'strike' })).rejects.toThrow(
      ConflictException,
    );
    await update('use', { key: 'opportunity' });
    await expect(update('use', { key: 'opportunity' })).rejects.toThrow(
      ConflictException,
    );
    await update('correct_turn', { field: 'reactionUsed' });
    await update('use', { key: 'opportunity' });
  });
  it('allows autonomous actions when the owner is unconscious and rejects wrong-turn commands', async () => {
    await setupEncounter();
    await create();
    await db.execute(
      "UPDATE characters SET data=json_set(data,'$.conditions',json('[\"Unconscious\"]')) WHERE id='hero'",
    );
    await update('use', { key: 'strike' });
    await expect(
      update('command', { command: 'strike', cost: 'replace_attack' }),
    ).rejects.toThrow('incapacitated');
    await db.execute(
      "UPDATE encounters SET current_turn_token_id='enemy' WHERE id='enc'",
    );
    await expect(
      update('command', { command: 'strike', cost: 'bonus_action' }),
    ).rejects.toThrow(ConflictException);
  });
  it('only allows Beast’s Strike when replacing an owner attack', async () => {
    await setupEncounter();
    await create();
    await expect(
      update('command', { command: 'help', cost: 'replace_attack' }),
    ).rejects.toThrow(BadRequestException);
    const response = await update('command', {
      command: 'strike',
      cost: 'replace_attack',
    });
    expect(response.companions[0].turn).toMatchObject({
      command: 'strike',
      commandCost: 'replace_attack',
    });
    await update('use', { key: 'strike' });
  });
  it('tracks defender repair separately and shares Arcane Jolt with the owner', async () => {
    await makeArtificer();
    await create('steel', 'defender');
    await update('hp', { amount: -30 });
    await update('use', { key: 'repair' });
    expect(
      (await service.list('hero', player)).companions[0].resource_uses.repair,
    ).toBe(1);
    await update('jolt');
    expect((await characters.findOne('hero', player.id)).resource_uses).toEqual(
      { 'battle-smith-arcane-jolt': 1 },
    );
    await service.longRest('hero');
    expect(
      (await service.list('hero', player)).companions[0].resource_uses,
    ).toEqual({});
  });
  it('links tokens without duplicating HP or creating extra initiative turns', async () => {
    await setupEncounter();
    const c = await create();
    const token = await maps.upsertToken(
      'map',
      { companion_id: c.id, x: 1, y: 1 },
      dm,
    );
    expect(token).toMatchObject({
      companion_owner_id: 'hero',
      initiative: 20,
      hp: 30,
    });
    expect(token?.character_id).toBeNull();
    const again = await maps.upsertToken(
      'map',
      { companion_id: c.id, x: 2, y: 1 },
      dm,
    );
    expect(again?.id).toBe(token?.id);
    await update('hp', { amount: -5 });
    expect(
      (await maps.getTokens('map', dm)).find((t) => t.companion_id === c.id)
        ?.hp,
    ).toBe(25);
    await maps.setTokenPlan('map', String(token?.id), { x: 4, y: 4 }, player);
    await expect(
      maps.setTokenPlan('map', String(token?.id), { x: 4, y: 4 }, other),
    ).rejects.toThrow(ForbiddenException);
    expect((await encounters.nextTurn('enc', 'dm')).current_turn_token_id).toBe(
      'enemy',
    );
    await update('use', { key: 'opportunity' });
    expect((await encounters.nextTurn('enc', 'dm')).current_turn_token_id).toBe(
      'owner-token',
    );
    const tokens = await maps.getTokens('map', dm);
    expect(tokens.find((t) => t.companion_id === c.id)?.turn_start_x).toBe(2);
    expect(
      (await service.list('hero', player)).companions[0].turn?.reactionUsed,
    ).toBeUndefined();
  });
  it('validates malformed inputs and preserves records on failure', async () => {
    await create();
    await expect(update('hp', { amount: NaN })).rejects.toThrow(
      BadRequestException,
    );
    await expect(
      update('conditions', { conditions: ['x'.repeat(61)] }),
    ).rejects.toThrow(BadRequestException);
    await expect(update('rename', { name: '' })).rejects.toThrow(
      BadRequestException,
    );
    expect((await service.list('hero', player)).companions[0].revision).toBe(1);
  });
});
