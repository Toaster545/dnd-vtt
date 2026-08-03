import { DatabaseService } from './database.service';

// Backs a DatabaseService with an isolated in-memory SQLite database so service specs run real SQL
// (migrations included) against real isolated storage instead of mocking the DB layer.
export async function createTestDb(): Promise<{
  db: DatabaseService;
  cleanup: () => void;
}> {
  const previousDbPath = process.env.DB_PATH;
  process.env.DB_PATH = ':memory:';

  const db = new DatabaseService();
  await db.onModuleInit();

  return {
    db,
    cleanup: () => {
      db.close();
      process.env.DB_PATH = previousDbPath;
    },
  };
}
