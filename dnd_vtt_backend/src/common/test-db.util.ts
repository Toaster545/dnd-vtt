import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { DatabaseService } from './database.service';

// Backs a DatabaseService with a throwaway SQLite file so service specs run real SQL
// (migrations included) against real isolated storage instead of mocking the DB layer.
export async function createTestDb(): Promise<{
  db: DatabaseService;
  cleanup: () => void;
}> {
  const dir = mkdtempSync(join(tmpdir(), 'dnd-vtt-test-'));
  const previousDbPath = process.env.DB_PATH;
  process.env.DB_PATH = join(dir, 'test.db');

  const db = new DatabaseService();
  await db.onModuleInit();

  return {
    db,
    cleanup: () => {
      process.env.DB_PATH = previousDbPath;
      rmSync(dir, { recursive: true, force: true });
    },
  };
}
