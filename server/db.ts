import pg from "pg";
import { readFile, readdir } from "node:fs/promises";
export type DB = pg.Pool;
export function isMigrationFile(name: string) {
  return /^\d+_[a-z0-9_-]+\.sql$/i.test(name);
}
export function database(url: string) {
  return new pg.Pool({
    connectionString: url,
    max: 10,
    connectionTimeoutMillis: 5000,
  });
}
export async function transaction<T>(
  pool: DB,
  fn: (c: pg.PoolClient) => Promise<T>,
): Promise<T> {
  const c = await pool.connect();
  try {
    await c.query("BEGIN");
    const out = await fn(c);
    await c.query("COMMIT");
    return out;
  } catch (e) {
    await c.query("ROLLBACK");
    throw e;
  } finally {
    c.release();
  }
}
export async function migrate(pool: DB) {
  await transaction(pool, async (c) => {
    await c.query("SELECT pg_advisory_xact_lock(519923001)");
    await c.query(
      "CREATE TABLE IF NOT EXISTS schema_migrations (name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())",
    );
    const directory = new URL("./migrations/", import.meta.url);
    for (const name of (await readdir(directory))
      .filter(isMigrationFile)
      .sort()) {
      if (
        (await c.query("SELECT 1 FROM schema_migrations WHERE name=$1", [name]))
          .rowCount
      )
        continue;
      await c.query(await readFile(new URL(name, directory), "utf8"));
      await c.query("INSERT INTO schema_migrations(name) VALUES($1)", [name]);
    }
  });
}
