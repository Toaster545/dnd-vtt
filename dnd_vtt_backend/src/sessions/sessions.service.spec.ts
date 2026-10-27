import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { createTestDb } from '../common/test-db.util';
import {
  addMember,
  insertCampaign,
  insertSession,
  insertUser,
} from '../common/test-fixtures.util';
import { DatabaseService } from '../common/database.service';
import type { RequestUser } from '../common/current-user.decorator';
import { SessionsService } from './sessions.service';

const asUser = (id: string): RequestUser => ({
  id,
  email: `${id}@test.com`,
  role: 'player',
});

describe('SessionsService', () => {
  let db: DatabaseService;
  let cleanup: () => void;
  let sessions: SessionsService;
  let dm: string;
  let player: string;
  let campaign: string;

  beforeEach(async () => {
    ({ db, cleanup } = await createTestDb());
    sessions = new SessionsService(db);
    dm = await insertUser(db);
    player = await insertUser(db);
    campaign = await insertCampaign(db, dm);
  });
  afterEach(() => cleanup());

  it("only lets the campaign's DM create sessions", async () => {
    await expect(
      sessions.create(player, { campaign_id: campaign, name: 'x' }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    await expect(
      sessions.create(dm, { campaign_id: 'missing', name: 'x' }),
    ).rejects.toBeInstanceOf(NotFoundException);
    const created = await sessions.create(dm, {
      campaign_id: campaign,
      name: 'Arrival',
    });
    expect(created.name).toBe('Arrival');
    expect(created.visible_to_players).toBe(0);
  });

  it('shows members only the sessions the DM has revealed', async () => {
    await addMember(db, campaign, player);
    const hidden = await insertSession(db, campaign, dm, false);
    const shown = await insertSession(db, campaign, dm, true);

    const dmView = await sessions.findAllForCampaign(campaign, asUser(dm));
    expect(dmView.map((s) => s.id).sort()).toEqual([hidden, shown].sort());

    const playerView = await sessions.findAllForCampaign(
      campaign,
      asUser(player),
    );
    expect(playerView.map((s) => s.id)).toEqual([shown]);

    await expect(
      sessions.findOneForUser(hidden, asUser(player)),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('rejects non-members and removed members', async () => {
    const stranger = await insertUser(db);
    const removed = await insertUser(db);
    await addMember(db, campaign, removed, 'removed');
    for (const id of [stranger, removed]) {
      await expect(
        sessions.findAllForCampaign(campaign, asUser(id)),
      ).rejects.toBeInstanceOf(ForbiddenException);
    }
  });

  it('restricts update, visibility and delete to the session DM', async () => {
    const id = await insertSession(db, campaign, dm);
    await expect(
      sessions.update(id, player, { description: 'x' }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    await expect(
      sessions.setVisibility(id, player, true),
    ).rejects.toBeInstanceOf(ForbiddenException);
    await expect(sessions.remove(id, player)).rejects.toBeInstanceOf(
      ForbiddenException,
    );

    const updated = await sessions.update(id, dm, { description: 'Notes' });
    expect(updated.description).toBe('Notes');
    expect(
      (await sessions.setVisibility(id, dm, true)).visible_to_players,
    ).toBe(1);
    await expect(sessions.remove(id, dm)).resolves.toEqual({ deleted: true });
    await expect(sessions.findOne(id)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});
