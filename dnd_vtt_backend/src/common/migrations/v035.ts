import { Migration } from './migration';
import {
  ItemDefinition,
  migrateInventory,
} from '../../characters/inventory-rules';
import { readdirSync, readFileSync } from 'fs';
import { resolve, join } from 'path';

export const migrateV35: Migration = {
  version: 35,
  async up(ctx) {
    const rows = (await ctx.execute('SELECT id,data FROM characters')).rows;
    const itemDirectory = join(process.cwd(), 'content/items');
    const definitions = new Map(
      readdirSync(itemDirectory)
        .filter((f) => f.endsWith('.json'))
        .map((f) => {
          const item = JSON.parse(
            readFileSync(join(itemDirectory, f), 'utf8'),
          ) as ItemDefinition;
          return [item.index, item] as const;
        }),
    );
    // SQLite makes a consistent backup, including committed WAL contents.
    if (rows.length) {
      const backup =
        resolve(process.env.DB_PATH ?? './data/dnd.db') +
        '.pre-inventory-' +
        Date.now() +
        '.bak';
      await ctx.execute(`VACUUM INTO '${backup.replace(/'/g, "''")}'`);
    }
    const statements: { sql: string; args?: any[] }[] = [
      {
        sql: `CREATE TABLE inventory_instances (
      id TEXT PRIMARY KEY, holder_id TEXT REFERENCES characters(id) ON DELETE SET NULL,
      creator_id TEXT REFERENCES characters(id) ON DELETE CASCADE,
      attuned_to TEXT REFERENCES characters(id) ON DELETE SET NULL, data TEXT NOT NULL)`,
      },
      {
        sql: 'CREATE INDEX inventory_holder ON inventory_instances(holder_id)',
      },
      {
        sql: 'CREATE INDEX inventory_creator ON inventory_instances(creator_id)',
      },
      {
        sql: 'CREATE TABLE inventory_requests (character_id TEXT REFERENCES characters(id) ON DELETE CASCADE, request_id TEXT, PRIMARY KEY(character_id,request_id))',
      },
    ];
    for (const row of rows) {
      const data = ctx.parseJson<Record<string, unknown>>(
        row.data as string,
        {},
      );
      const equipment = migrateInventory(row.id as string, data, definitions);
      for (const entry of equipment)
        statements.push({
          sql: 'INSERT INTO inventory_instances(id,holder_id,creator_id,attuned_to,data) VALUES(?,?,?,?,?)',
          args: [
            entry.instanceId,
            row.id,
            entry.origin?.creatorId ?? null,
            entry.attuned ? row.id : null,
            JSON.stringify(entry),
          ],
        });
      data.equipment = equipment;
      data.replicated_items = equipment.filter((e) => e.origin);
      data.inventory_version = 1;
      statements.push({
        sql: 'UPDATE characters SET data=? WHERE id=?',
        args: [JSON.stringify(data), row.id],
      });
    }
    statements.push({ sql: 'PRAGMA user_version = 35' });
    await ctx.executeMany(statements);
    ctx.logger.log('Applied schema migration v35 (individual inventory items)');
  },
};
