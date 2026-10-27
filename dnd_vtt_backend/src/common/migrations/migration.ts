import { Logger } from '@nestjs/common';
import { Client, ResultSet } from '@libsql/client';

export interface MigrationContext {
  db: Client;
  logger: Logger;
  execute(sql: string, args?: any[]): Promise<ResultSet>;
  executeMany(
    statements: { sql: string; args?: any[] }[],
  ): Promise<ResultSet[]>;
  parseJson<T>(value: string | null, fallback: T): T;
}

/** Each migration stamps `PRAGMA user_version` itself as its last step. */
export interface Migration {
  version: number;
  up(ctx: MigrationContext): Promise<void>;
}

/**
 * Guards the registry in `index.ts`: versions must be strictly increasing in array order, so a
 * migration inserted out of order (or a duplicate) fails at boot instead of silently being
 * skipped or run in the wrong sequence. Gaps are allowed (there is deliberately no v22).
 */
export function assertMigrationsOrdered(migrations: Migration[]): void {
  for (let i = 1; i < migrations.length; i++) {
    if (migrations[i].version <= migrations[i - 1].version) {
      throw new Error(
        `Migrations out of order: v${migrations[i].version} listed after v${migrations[i - 1].version}`,
      );
    }
  }
}
