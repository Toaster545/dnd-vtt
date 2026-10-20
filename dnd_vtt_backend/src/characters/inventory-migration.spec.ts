import { execFileSync } from 'child_process';
import { mkdtempSync, readdirSync, unlinkSync, rmdirSync } from 'fs';
import { join, resolve, sep } from 'path';

it('backs up v34 data, splits magic stacks, and migrates only once', () => {
  const directory = mkdtempSync(join(process.cwd(), '.inventory-migration-'));
  // Run the physical-file test in its own process: libsql keeps native file handles
  // alive until process exit on Windows, even after Client.close().
  const script = `
    require('ts-node/register/transpile-only');
    const assert = require('node:assert/strict');
    const { DatabaseService } = require('./src/common/database.service');
    (async () => {
      let db = new DatabaseService();
      await db.onModuleInit();
      await db.execute("INSERT INTO profiles(id,email,username,password_hash,role) VALUES('owner','owner@test','owner','hash','player')");
      const original = {
        equipment: [{ itemIndex: 'wand-of-secrets', name: 'Wand of Secrets', quantity: 2, equipped: false }],
        replicated_items: [{ itemIndex: 'returning-weapon', planName: 'Returning Weapon', equipped: true }],
      };
      await db.execute('INSERT INTO characters(id,user_id,name,race,class,level,data) VALUES(?,?,?,?,?,?,?)', ['hero', 'owner', 'Alberto', 'Gnome', 'Artificer', 3, JSON.stringify(original)]);
      await db.executeMany([{ sql: 'DROP TABLE inventory_instances' }, { sql: 'DROP TABLE inventory_requests' }, { sql: 'PRAGMA user_version=34' }]);
      db.close(); db = new DatabaseService(); await db.onModuleInit();
      const migrated = (await db.execute('SELECT * FROM inventory_instances')).rows;
      assert.equal(migrated.length, 3);
      assert.equal(new Set(migrated.map(row => row.id)).size, 3);
      const legacy = migrated.find(row => row.creator_id === 'hero');
      assert.equal(legacy.attuned_to, null);
      assert.equal(JSON.parse(legacy.data).baseItemIndex, undefined);
      db.close(); db = new DatabaseService(); await db.onModuleInit();
      assert.deepEqual((await db.execute('SELECT id FROM inventory_instances')).rows.map(r => r.id).sort(), migrated.map(r => r.id).sort());
      db.close(); process.exit(0);
    })().catch(error => { console.error(error); process.exit(1); });
  `;
  try {
    execFileSync(process.execPath, ['-e', script], {
      cwd: process.cwd(),
      env: { ...process.env, DB_PATH: join(directory, 'test.db') },
      timeout: 30000,
    });
    expect(
      readdirSync(directory).filter((f) => f.includes('.pre-inventory-')),
    ).toHaveLength(1);
  } finally {
    if (resolve(directory).startsWith(resolve(process.cwd()) + sep)) {
      for (const file of readdirSync(directory))
        unlinkSync(join(directory, file));
      rmdirSync(directory);
    }
  }
}, 35000);
