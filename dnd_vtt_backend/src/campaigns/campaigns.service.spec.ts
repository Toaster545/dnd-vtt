import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import { CampaignsService } from './campaigns.service';
import { CharactersService } from '../characters/characters.service';
import { DatabaseService } from '../common/database.service';
import { createTestDb } from '../common/test-db.util';
import type { RequestUser } from '../common/current-user.decorator';
import type { JoinCampaignDto } from './dto/join-campaign.dto';

async function insertProfile(
  db: DatabaseService,
  role: 'admin' | 'player' = 'player',
) {
  const id = randomUUID();
  await db.execute(
    'INSERT INTO profiles (id, email, username, password_hash, role) VALUES (?, ?, ?, ?, ?)',
    [id, `${id}@test.com`, id, 'hash', role],
  );
  return id;
}

describe('CampaignsService', () => {
  let campaigns: CampaignsService;
  let characters: CharactersService;
  let db: DatabaseService;
  let cleanup: () => void;
  let dmId: string;
  let dm: RequestUser;

  beforeEach(async () => {
    const testDb = await createTestDb();
    db = testDb.db;
    cleanup = testDb.cleanup;
    campaigns = new CampaignsService(db);
    characters = new CharactersService(db);
    dmId = await insertProfile(db, 'admin');
    dm = { id: dmId, role: 'admin' } as RequestUser;
  });

  afterEach(() => cleanup());

  function asPlayer(id: string): RequestUser {
    return { id, role: 'player' } as RequestUser;
  }

  it('creates a campaign with a join code and an empty roster', async () => {
    const campaign = await campaigns.create(dmId, {
      name: 'Curse of Strahd',
    });

    expect(campaign.name).toBe('Curse of Strahd');
    expect(campaign.join_code).toMatch(/^[A-Z0-9]{6}$/);
    expect(campaign.sessions).toEqual([]);
    expect(campaign.members).toEqual([]);
    expect(campaign.allowed_sources).toEqual(['XPHB']);
  });

  it('throws NotFoundException for a nonexistent campaign', async () => {
    await expect(campaigns.findOne(randomUUID(), dm)).rejects.toThrow(
      NotFoundException,
    );
  });

  it('rejects mutating a campaign owned by a different DM', async () => {
    const campaign = await campaigns.create(dmId, {
      name: 'Test',
    });
    const otherDm = await insertProfile(db, 'admin');

    await expect(
      campaigns.update(campaign.id as string, otherDm, {}),
    ).rejects.toThrow(ForbiddenException);
    await expect(
      campaigns.remove(campaign.id as string, otherDm),
    ).rejects.toThrow(ForbiddenException);
    await expect(
      campaigns.getMembers(campaign.id as string, otherDm),
    ).rejects.toThrow(ForbiddenException);
    await expect(
      campaigns.setPartyLevel(campaign.id as string, otherDm, 5),
    ).rejects.toThrow(ForbiddenException);
  });

  it('sets an explicit current session and rejects a session from another campaign', async () => {
    const campaign = await campaigns.create(dmId, { name: 'Current Test' });
    const sessionId = randomUUID();
    await db.execute(
      `INSERT INTO sessions (id, dm_id, campaign_id, name, visible_to_players) VALUES (?, ?, ?, 'Session One', 1)`,
      [sessionId, dmId, campaign.id],
    );
    const context = await campaigns.setCurrentSession(
      campaign.id as string,
      dmId,
      sessionId,
    );
    expect(context.current_session).toMatchObject({
      id: sessionId,
      name: 'Session One',
    });

    const other = await campaigns.create(dmId, { name: 'Other' });
    await expect(
      campaigns.setCurrentSession(other.id as string, dmId, sessionId),
    ).rejects.toThrow(BadRequestException);
  });

  describe('join', () => {
    it('creates a campaign copy at the source level when the party is empty', async () => {
      const campaign = await campaigns.create(dmId, {
        name: 'Test',
      });
      const playerId = await insertProfile(db);
      const source = await characters.create(playerId, {
        name: 'Aria',
        level: 3,
      });

      const joined = await campaigns.join(asPlayer(playerId), {
        joinCode: campaign.join_code as string,
        characterId: source.id,
      } as JoinCampaignDto);

      expect(joined.members).toHaveLength(1);
      expect(joined.members[0].character_level).toBe(3);
    });

    it('levels a newly joined character to match the existing party, not its own source level', async () => {
      const campaign = await campaigns.create(dmId, {
        name: 'Test',
      });

      const firstPlayerId = await insertProfile(db);
      const firstSource = await characters.create(firstPlayerId, {
        name: 'Bram',
        level: 5,
      });
      await campaigns.join(asPlayer(firstPlayerId), {
        joinCode: campaign.join_code as string,
        characterId: firstSource.id,
      } as JoinCampaignDto);

      const secondPlayerId = await insertProfile(db);
      const secondSource = await characters.create(secondPlayerId, {
        name: 'Aria',
        level: 1,
      });
      const joined = await campaigns.join(asPlayer(secondPlayerId), {
        joinCode: campaign.join_code as string,
        characterId: secondSource.id,
      } as JoinCampaignDto);

      expect(joined.members[0].character_level).toBe(5);

      // The player's own original template character is untouched.
      const untouched = await characters.findOne(
        secondSource.id as string,
        secondPlayerId,
      );
      expect(untouched.level).toBe(1);
    });

    it('is idempotent: joining twice does not create a second membership', async () => {
      const campaign = await campaigns.create(dmId, {
        name: 'Test',
      });
      const playerId = await insertProfile(db);
      const source = await characters.create(playerId, { name: 'Aria' });
      const dto = {
        joinCode: campaign.join_code as string,
        characterId: source.id,
      } as JoinCampaignDto;

      await campaigns.join(asPlayer(playerId), dto);
      const second = await campaigns.join(asPlayer(playerId), dto);

      expect(second.members).toHaveLength(1);
    });

    it('rejects joining with a character owned by someone else', async () => {
      const campaign = await campaigns.create(dmId, {
        name: 'Test',
      });
      const ownerId = await insertProfile(db);
      const impostorId = await insertProfile(db);
      const source = await characters.create(ownerId, { name: 'Aria' });

      await expect(
        campaigns.join(asPlayer(impostorId), {
          joinCode: campaign.join_code as string,
          characterId: source.id,
        } as JoinCampaignDto),
      ).rejects.toThrow(ForbiddenException);
    });

    it('rejects an unknown join code', async () => {
      const playerId = await insertProfile(db);
      const source = await characters.create(playerId, { name: 'Aria' });

      await expect(
        campaigns.join(asPlayer(playerId), {
          joinCode: 'ZZZZZZ',
          characterId: source.id,
        } as JoinCampaignDto),
      ).rejects.toThrow(NotFoundException);
    });

    it('previews and rejects a character that uses a source the campaign does not allow', async () => {
      const campaign = await campaigns.create(dmId, { name: 'PHB only' });
      const playerId = await insertProfile(db);
      const artificer = await characters.create(playerId, {
        name: 'Tink',
        class: 'Artificer',
      });

      const preview = await campaigns.previewJoin(
        playerId,
        campaign.join_code as string,
      );
      expect(preview.characters).toEqual([
        expect.objectContaining({
          character_id: artificer.id,
          compatible: false,
          disallowed_sources: ['EFA'],
        }),
      ]);
      await expect(
        campaigns.join(asPlayer(playerId), {
          joinCode: campaign.join_code as string,
          characterId: artificer.id,
        } as JoinCampaignDto),
      ).rejects.toThrow(BadRequestException);
    });

    it('allows an Eberron character after the DM enables Eberron', async () => {
      let campaign = await campaigns.create(dmId, { name: 'Eberron' });
      campaign = await campaigns.update(campaign.id as string, dmId, {
        allowed_sources: ['XPHB', 'EFA'],
      });
      const playerId = await insertProfile(db);
      const artificer = await characters.create(playerId, {
        name: 'Tink',
        class: 'Artificer',
      });

      const joined = await campaigns.join(asPlayer(playerId), {
        joinCode: campaign.join_code as string,
        characterId: artificer.id,
      } as JoinCampaignDto);

      expect(joined.members[0].source_compatible).toBe(true);
      const phbOnly = await campaigns.update(campaign.id as string, dmId, {
        allowed_sources: ['XPHB'],
      });
      expect(phbOnly.allowed_sources).toEqual(['XPHB']);
      expect(phbOnly.members[0].source_compatible).toBe(false);
      expect(phbOnly.members[0].source_incompatibility_reason).toContain(
        'Eberron: Forge of the Artificer',
      );
    });
  });

  describe('roster visibility', () => {
    it('hides a member from the rest of the party by default, but the DM and the member always see it', async () => {
      const campaign = await campaigns.create(dmId, {
        name: 'Test',
      });
      const playerAId = await insertProfile(db);
      const playerBId = await insertProfile(db);
      const sourceA = await characters.create(playerAId, { name: 'Aria' });
      const sourceB = await characters.create(playerBId, { name: 'Bram' });

      await campaigns.join(asPlayer(playerAId), {
        joinCode: campaign.join_code as string,
        characterId: sourceA.id,
      } as JoinCampaignDto);
      await campaigns.join(asPlayer(playerBId), {
        joinCode: campaign.join_code as string,
        characterId: sourceB.id,
      } as JoinCampaignDto);

      const asDm = await campaigns.findOne(campaign.id as string, dm);
      expect(asDm.members).toHaveLength(2);

      const asPlayerA = await campaigns.findOne(
        campaign.id as string,
        asPlayer(playerAId),
      );
      expect(asPlayerA.members.map((m) => m.character_name)).toEqual(['Aria']);

      await campaigns.setMemberPartyVisibility(
        campaign.id as string,
        dmId,
        playerBId,
        true,
      );

      const asPlayerAAfter = await campaigns.findOne(
        campaign.id as string,
        asPlayer(playerAId),
      );
      expect(
        asPlayerAAfter.members.map((m) => m.character_name).sort(),
      ).toEqual(['Aria', 'Bram']);
    });
  });
});
