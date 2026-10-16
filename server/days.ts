import type pg from "pg";
import type { DB } from "./db.js";
import { transaction } from "./db.js";
import { HttpError } from "./errors.js";
import type { Day, DayRecord, DayStats } from "../shared/domain.js";
import { activeCoverageMinutes } from "../src/utils.js";
export async function readDay(
  db: DB,
  user: string,
  date: string,
): Promise<DayRecord> {
  const r = await db.query(
    "SELECT body,revision FROM days WHERE user_id=$1 AND date=$2",
    [user, date],
  );
  return { day: r.rows[0]?.body ?? null, revision: r.rows[0]?.revision ?? 0 };
}
export async function writeDay(
  c: pg.PoolClient,
  user: string,
  day: Day,
  expected: number,
  limit: number,
  force = false,
): Promise<DayRecord> {
  await c.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [
    `${user}:${day.date}`,
  ]);
  const current = await c.query(
    "SELECT revision,body=$3::jsonb AS same FROM days WHERE user_id=$1 AND date=$2 FOR UPDATE",
    [user, day.date, JSON.stringify(day)],
  );
  const revision = current.rows[0]?.revision ?? 0;
  if (revision !== expected)
    throw new HttpError(409, "此日期已在其他页面修改，请保留草稿后重新加载");
  if (current.rows[0]?.same && !force) return { day, revision };
  const next = revision + 1;
  await c.query(
    `INSERT INTO days(user_id,date,body,revision) VALUES($1,$2,$3,$4) ON CONFLICT(user_id,date) DO UPDATE SET body=excluded.body,revision=excluded.revision,updated_at=now()`,
    [user, day.date, JSON.stringify(day), next],
  );
  await c.query(
    "INSERT INTO day_history(user_id,date,revision,body) VALUES($1,$2,$3,$4)",
    [user, day.date, next, JSON.stringify(day)],
  );
  await c.query(
    "DELETE FROM day_history WHERE user_id=$1 AND date=$2 AND revision<=$3",
    [user, day.date, next - limit],
  );
  return { day, revision: next };
}
export const saveDay = (
  db: DB,
  user: string,
  day: Day,
  expected: number,
  limit: number,
) => transaction(db, (c) => writeDay(c, user, day, expected, limit));
export function summarize(day: Day, revision: number): DayStats {
  const count = (s?: string) => s?.replace(/\s+/g, "").length ?? 0;
  const words =
    day.blocks.reduce(
      (n, b) =>
        n +
        count(b.summary) +
        count(b.note) +
        count(b.location) +
        count(b.moodOrWeather),
      0,
    ) +
    Object.values(day.taskSection ?? {}).reduce((n, s) => n + count(s), 0) +
    Object.values(day.summary ?? {}).reduce((n, s) => n + count(s), 0);
  return {
    date: day.date,
    revision,
    score: activeCoverageMinutes(day.blocks),
    words,
    done: !!day.done,
    meaningful: day.blocks.length > 0 || words > 0 || !!day.done,
  };
}
