import { createClient } from '@libsql/client';
import { existsSync } from 'fs';
import { resolve } from 'path';

const email = process.argv[2];

if (!email) {
  console.error('Usage: node scripts/make-admin.mjs <email>');
  process.exit(1);
}

const dbPath = process.env.DB_PATH ?? './data/dnd.db';
const absPath = resolve(dbPath);

if (!existsSync(absPath)) {
  console.error(`Database not found at ${absPath}`);
  console.error('Make sure the backend has been started at least once.');
  process.exit(1);
}

const db = createClient({ url: `file:${absPath}` });

const check = await db.execute({
  sql: 'SELECT id, email, role FROM profiles WHERE email = ?',
  args: [email],
});

if (check.rows.length === 0) {
  console.error(`No account found for "${email}".`);
  console.error('Register through the app first, then run this script.');
  process.exit(1);
}

const user = check.rows[0];

if (user.role === 'admin') {
  console.log(`"${email}" is already an admin.`);
  process.exit(0);
}

await db.execute({
  sql: "UPDATE profiles SET role = 'admin' WHERE email = ?",
  args: [email],
});

console.log(`Done — "${email}" is now an admin (DM).`);
