import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema.js";

export type Db = NodePgDatabase<typeof schema>;

// node-postgres pool over Neon's pooled endpoint: the API is a long-running
// server, so one pool is reused across requests.
export function createDb(connectionString: string) {
  const pool = new pg.Pool({
    connectionString,
    max: 10,
    // Neon scales to zero; the first connection after idle can take a few seconds.
    connectionTimeoutMillis: 15_000,
    idleTimeoutMillis: 30_000,
  });
  return { pool, db: drizzle(pool, { schema }) };
}
