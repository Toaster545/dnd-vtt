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
