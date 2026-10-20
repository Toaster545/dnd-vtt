import { randomUUID } from 'crypto';
import { NotFoundException } from '@nestjs/common';
import { WikiService } from './wiki.service';
import { DatabaseService } from '../common/database.service';
import { createTestDb } from '../common/test-db.util';
import type { RequestUser } from '../common/current-user.decorator';

async function insertProfile(db: DatabaseService, role: 'admin' | 'player') {
  const id = randomUUID();
  await db.execute(
    'INSERT INTO profiles (id, email, username, password_hash, role) VALUES (?, ?, ?, ?, ?)',
    [id, `${id}@test.com`, id, 'hash', role],
  );
  return { id, role } as RequestUser;
}

describe('WikiService character notes', () => {
  let wiki: WikiService;
  let db: DatabaseService;
  let cleanup: () => void;
  let dm: RequestUser;
  let alice: RequestUser;
  let bob: RequestUser;
  let campaignId: string;
  let aliceCharacterId: string;

  async function addMember(user: RequestUser, name: string) {
    const characterId = randomUUID();
    await db.execute(
      'INSERT INTO characters (id, user_id, name, campaign_id) VALUES (?, ?, ?, ?)',
      [characterId, user.id, name, campaignId],
    );
    await db.execute(
      'INSERT INTO campaign_members (id, campaign_id, user_id, character_id) VALUES (?, ?, ?, ?)',
      [randomUUID(), campaignId, user.id, characterId],
    );
    return characterId;
  }

  beforeEach(async () => {
    const testDb = await createTestDb();
    db = testDb.db;
    cleanup = testDb.cleanup;
    wiki = new WikiService(db);

    dm = await insertProfile(db, 'admin');
    alice = await insertProfile(db, 'player');
    bob = await insertProfile(db, 'player');
    campaignId = randomUUID();
    await db.execute(
      'INSERT INTO campaigns (id, dm_id, name, join_code) VALUES (?, ?, ?, ?)',
      [campaignId, dm.id, 'Camp', 'JOIN01'],
    );
    aliceCharacterId = await addMember(alice, 'Thorin');
    await addMember(bob, 'Elara');
  });

  afterEach(() => cleanup());

  const titles = async (user: RequestUser) =>
    (await wiki.tree(campaignId, user)).map((p) => p.title);

  const noteOf = async (user: RequestUser) =>
    (await wiki.tree(campaignId, user)).find((p) => p.character_id)!;

  it('creates a notes page per character, visible only to its owner', async () => {
    expect(await titles(alice)).toEqual(['Thorin – Notes']);
    expect(await titles(bob)).toEqual(['Elara – Notes']);
    expect(await titles(dm)).toEqual([]);
  });

  it('does not create duplicates on repeated or concurrent loads', async () => {
    await Promise.all([
      wiki.tree(campaignId, alice),
      wiki.tree(campaignId, alice),
    ]);
    await wiki.tree(campaignId, alice);
    expect(await titles(alice)).toHaveLength(1);
  });

  it('hides the page from everyone else, including by direct slug, search and graph', async () => {
    const note = await noteOf(alice);
    await wiki.update(note.id as string, alice, {
      body: 'secret dragonfire plans',
    });

    for (const other of [bob, dm]) {
      await expect(
        wiki.getPage(campaignId, note.slug as string, other),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(await wiki.search(campaignId, other, 'dragonfire')).toEqual([]);
      expect((await wiki.graph(campaignId, other)).nodes).toEqual([]);
    }
    expect(await wiki.search(campaignId, alice, 'dragonfire')).toHaveLength(1);
  });

  it('refuses edits and deletes from anyone but the owner', async () => {
    const note = await noteOf(alice);
    for (const other of [bob, dm]) {
      await expect(
        wiki.update(note.id as string, other, { body: 'x' }),
      ).rejects.toBeInstanceOf(NotFoundException);
      await expect(
        wiki.remove(note.id as string, other),
      ).rejects.toBeInstanceOf(NotFoundException);
    }
  });

  it('lets the owner edit and rename but not delete or change visibility', async () => {
    const note = await noteOf(alice);
    const res = await wiki.update(note.id as string, alice, {
      title: 'Thorin Journal',
      visibility: 'dm_only',
    });
    expect(res.page.title).toBe('Thorin Journal');
    expect(res.page.visibility).toBe('shared');
    await expect(wiki.remove(note.id as string, alice)).rejects.toThrow();
  });

  it("keeps private pages out of other people's backlinks", async () => {
    const shared = await wiki.create(dm, { campaignId, title: 'Waterdeep' });
    const note = await noteOf(alice);
    await wiki.update(note.id as string, alice, {
      body: 'went to [[Waterdeep]]',
    });

    const asAlice = await wiki.getPage(
      campaignId,
      shared.page.slug as string,
      alice,
    );
    const asDm = await wiki.getPage(campaignId, shared.page.slug as string, dm);
    expect(asAlice.backlinks).toHaveLength(1);
    expect(asDm.backlinks).toEqual([]);
  });

  it('keeps links in a private page working when a shared page is renamed', async () => {
    const shared = await wiki.create(dm, { campaignId, title: 'Waterdeep' });
    const note = await noteOf(alice);
    await wiki.update(note.id as string, alice, { body: '[[Waterdeep]]' });
    await wiki.update(shared.page.id as string, dm, { title: 'Baldur' });

    const res = await wiki.getPage(campaignId, note.slug as string, alice);
    expect(res.page.body).toBe('[[Baldur]]');
  });

  it('looks up the notes page for the character owner only', async () => {
    const note = await wiki.characterNotes(aliceCharacterId, alice);
    expect(note).toEqual({
      campaignId,
      slug: (await noteOf(alice)).slug,
    });
    for (const other of [bob, dm]) {
      await expect(
        wiki.characterNotes(aliceCharacterId, other),
      ).rejects.toBeInstanceOf(NotFoundException);
    }
  });

  it('removes the notes page with its character', async () => {
    await wiki.tree(campaignId, alice);
    await db.execute('DELETE FROM characters WHERE id = ?', [aliceCharacterId]);
    const rows = await db.execute(
      'SELECT 1 FROM wiki_pages WHERE character_id = ?',
      [aliceCharacterId],
    );
    expect(rows.rows).toHaveLength(0);
  });
});
