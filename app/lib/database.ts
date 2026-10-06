import "server-only";

import { Pool } from "pg";

declare global {
  var authDatabasePool: Pool | undefined;
}

export function getDatabase() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL must be configured.");
  }

  globalThis.authDatabasePool ??= new Pool({
    connectionString,
    max: 10,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 5_000,
  });
  return globalThis.authDatabasePool;
}
