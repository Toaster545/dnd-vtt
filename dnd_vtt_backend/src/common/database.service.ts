import { dbPath as configuredDbPath } from '../config';
import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import { createClient, Client, ResultSet } from '@libsql/client';
import { MIGRATIONS } from './migrations';
import { MigrationContext } from './migrations/migration';
import { dirname } from 'path';
import { existsSync, mkdirSync } from 'fs';

@Injectable()
export class DatabaseService implements OnModuleInit {
  private readonly logger = new Logger(DatabaseService.name);
  private db: Client;

  async onModuleInit() {
    const dbPath = configuredDbPath();
    const dir = dirname(dbPath);
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });

    this.db = createClient({ url: `file:${dbPath}` });
    await this.runMigrations();
    this.logger.log(`SQLite database ready at ${dbPath}`);
  }

  async execute(sql: string, args: any[] = []): Promise<ResultSet> {
    return this.db.execute({ sql, args });
  }

  async executeMany(statements: { sql: string; args?: any[] }[]) {
    return this.db.batch(
      statements.map((s) => ({ sql: s.sql, args: s.args ?? [] })),
    );
  }

  close() {
    this.db?.close();
  }

  parseJson<T>(value: string | null, fallback: T): T {
    if (!value) return fallback;
    try {
      return JSON.parse(value) as T;
    } catch {
      return fallback;
    }
  }

  private async runMigrations() {
    await this.db.execute(`PRAGMA foreign_keys = ON`);

    // Determine current schema version
    let version = Number(
      (await this.db.execute(`PRAGMA user_version`)).rows[0]?.user_version ?? 0,
    );

    // Tables exist but predate versioning → treat as v1
    if (version === 0) {
      const info = await this.db.execute(`PRAGMA table_info(profiles)`);
      if (info.rows.length > 0) version = 1;
    }

    const ctx: MigrationContext = {
      db: this.db,
      logger: this.logger,
      execute: (sql, args) => this.execute(sql, args),
      executeMany: (statements) => this.executeMany(statements),
      parseJson: (value, fallback) => this.parseJson(value, fallback),
    };
    for (const migration of MIGRATIONS) {
      if (version < migration.version) await migration.up(ctx);
    }
  }
}
