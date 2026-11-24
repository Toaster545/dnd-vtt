import { randomUUID } from 'crypto';
import { DatabaseService } from './database.service';

// Minimal row builders for service specs that run against createTestDb().
export async function insertUser(
  db: DatabaseService,
  role: 'admin' | 'player' = 'player',
) {
  const id = randomUUID();
  await db.execute(
    `INSERT INTO profiles (id, email, username, password_hash, role) VALUES (?, ?, ?, 'hash', ?)`,
    [id, `${id}@test.com`, id, role],
  );
  return id;
}

export async function insertCampaign(db: DatabaseService, dmId: string) {
  const id = randomUUID();
  await db.execute(
    `INSERT INTO campaigns (id, dm_id, name, join_code) VALUES (?, ?, 'Test Campaign', ?)`,
    [id, dmId, id.slice(0, 8)],
  );
  return id;
}

export async function addMember(
  db: DatabaseService,
  campaignId: string,
  userId: string,
  status: 'active' | 'removed' = 'active',
) {
  const characterId = randomUUID();
  await db.execute(
    `INSERT INTO characters (id, user_id, name, campaign_id, data) VALUES (?, ?, 'Hero', ?, '{}')`,
    [characterId, userId, campaignId],
  );
  await db.execute(
    `INSERT INTO campaign_members (id, campaign_id, user_id, character_id, status) VALUES (?, ?, ?, ?, ?)`,
    [randomUUID(), campaignId, userId, characterId, status],
  );
}

export async function insertSession(
  db: DatabaseService,
  campaignId: string,
  dmId: string,
  visible = false,
) {
  const id = randomUUID();
  await db.execute(
    `INSERT INTO sessions (id, dm_id, campaign_id, name, visible_to_players) VALUES (?, ?, ?, 'Session', ?)`,
    [id, dmId, campaignId, visible ? 1 : 0],
  );
  return id;
}
