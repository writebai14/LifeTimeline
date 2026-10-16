import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { DB } from "./db.js";
import { transaction } from "./db.js";
import { normalizeLegacy, type ImportBatch } from "../shared/domain.js";
import { HttpError } from "./errors.js";
import { writeDay } from "./days.js";
const input = z
  .object({
    files: z
      .array(
        z
          .object({ name: z.string().min(1).max(255), content: z.string() })
          .strict(),
      )
      .min(1)
      .max(500),
  })
  .strict();
export async function previewImport(
  db: DB,
  user: string,
  value: unknown,
): Promise<ImportBatch> {
  const { files } = input.parse(value);
  if (
    files.reduce((n, f) => n + Buffer.byteLength(f.content, "utf8"), 0) >
    20 * 1024 * 1024
  )
    throw new HttpError(413, "每批 JSON 总大小不得超过 20 MB");
  const id = randomUUID();
  await transaction(db, async (c) => {
    // Prevent unbounded outstanding previews per account, including concurrent requests.
    await c.query("SELECT id FROM users WHERE id=$1 FOR UPDATE", [user]);
    await c.query(
      "DELETE FROM import_batches WHERE user_id=$1 AND expires_at<now()-interval '7 days'",
      [user],
    );
    const count = await c.query(
      "SELECT count(*)::int AS n FROM import_batches WHERE user_id=$1 AND expires_at>now()",
      [user],
    );
    if (count.rows[0].n >= 10)
      throw new HttpError(429, "最多保留 10 个未过期导入批次，请稍后重试");
    await c.query(
      "INSERT INTO import_batches(id,user_id,expires_at) VALUES($1,$2,now()+interval '1 hour')",
      [id, user],
    );
    for (const [index, file] of files.entries()) {
      let body = null,
        date = null,
        error = null,
        revision = 0;
      try {
        if (
          !file.name.toLowerCase().endsWith(".json") ||
          /[\\/]/.test(file.name)
        )
          throw new Error("仅支持单日日志 JSON 文件");
        body = normalizeLegacy(JSON.parse(file.content.replace(/^\uFEFF/, "")));
        date = body.date;
        revision =
          (
            await c.query(
              "SELECT revision FROM days WHERE user_id=$1 AND date=$2",
              [user, date],
            )
          ).rows[0]?.revision ?? 0;
      } catch (e) {
        error =
          e instanceof z.ZodError
            ? e.issues
                .map((i) => `${i.path.join(".")}: ${i.message}`)
                .join("; ")
                .slice(0, 2000)
            : "无法读取单日日志 JSON";
        body = null;
      }
      await c.query(
        "INSERT INTO import_items(batch_id,item_index,name,date,body,expected_revision,error,status) VALUES($1,$2,$3,$4,$5,$6,$7,$8)",
        [
          id,
          index,
          file.name,
          date,
          body ? JSON.stringify(body) : null,
          revision,
          error,
          error ? "invalid" : "pending",
        ],
      );
    }
  });
  return getImport(db, user, id);
}
export async function getImport(
  db: DB,
  user: string,
  id: string,
): Promise<ImportBatch> {
  const b = (
    await db.query("SELECT * FROM import_batches WHERE id=$1 AND user_id=$2", [
      id,
      user,
    ])
  ).rows[0];
  if (!b) throw new HttpError(404, "导入批次不存在");
  const rows = (
    await db.query(
      "SELECT item_index,name,date,expected_revision,error,status FROM import_items WHERE batch_id=$1 ORDER BY item_index",
      [id],
    )
  ).rows;
  const counts = new Map<string, number>();
  for (const r of rows)
    if (r.date && !r.error) counts.set(r.date, (counts.get(r.date) ?? 0) + 1);
  return {
    id,
    expiresAt: b.expires_at.toISOString(),
    started: b.started,
    selected: b.selected,
    items: rows.map((r) => ({
      index: r.item_index,
      name: r.name,
      date: r.date,
      expectedRevision: r.expected_revision,
      error: r.error ?? undefined,
      status: r.status,
      duplicate: (counts.get(r.date) ?? 0) > 1,
    })),
  };
}
export async function executeImport(
  db: DB,
  user: string,
  id: string,
  value: unknown,
  limit: number,
) {
  const { selected } = z
    .object({ selected: z.array(z.number().int().min(0)).max(500) })
    .strict()
    .parse(value);
  const choices = [...new Set(selected)].sort((a, b) => a - b);
  await transaction(db, async (c) => {
    const b = (
      await c.query(
        "SELECT * FROM import_batches WHERE id=$1 AND user_id=$2 FOR UPDATE",
        [id, user],
      )
    ).rows[0];
    if (!b) throw new HttpError(404, "导入批次不存在");
    if (b.started) {
      if (JSON.stringify(b.selected) !== JSON.stringify(choices))
        throw new HttpError(409, "已开始的批次不能修改选择");
      return;
    }
    if (+b.expires_at <= Date.now())
      throw new HttpError(410, "预览已过期，请重新选择文件");
    const items = (
      await c.query("SELECT * FROM import_items WHERE batch_id=$1", [id])
    ).rows;
    const chosen = items.filter((i) => choices.includes(i.item_index));
    if (chosen.length !== choices.length || chosen.some((i) => i.error))
      throw new HttpError(400, "选中了无效文件");
    if (new Set(chosen.map((i) => i.date)).size !== chosen.length)
      throw new HttpError(400, "同一日期只能保留一个文件");
    await c.query(
      "UPDATE import_batches SET started=true,selected=$2 WHERE id=$1",
      [id, JSON.stringify(choices)],
    );
    await c.query(
      "UPDATE import_items SET status='skipped' WHERE batch_id=$1 AND status='pending' AND NOT(item_index=ANY($2::int[]))",
      [id, choices],
    );
  });
  // Each item and its outcome commit together. A disconnected client may safely resume.
  for (const index of choices) {
    await transaction(db, async (c) => {
      const item = (
        await c.query(
          `SELECT i.*,b.expires_at FROM import_items i JOIN import_batches b ON b.id=i.batch_id WHERE i.batch_id=$1 AND i.item_index=$2 AND b.user_id=$3 FOR UPDATE OF i`,
          [id, index, user],
        )
      ).rows[0];
      if (!item || item.status !== "pending") return;
      if (+item.expires_at <= Date.now()) {
        await c.query(
          "UPDATE import_items SET status='failed',error='预览已过期，请重新导入' WHERE batch_id=$1 AND item_index=$2",
          [id, index],
        );
        return;
      }
      await c.query("SAVEPOINT import_day");
      let status = item.expected_revision ? "overwritten" : "created",
        error = null;
      try {
        await writeDay(c, user, item.body, item.expected_revision, limit);
      } catch (e) {
        await c.query("ROLLBACK TO SAVEPOINT import_day");
        status =
          e instanceof HttpError && e.status === 409 ? "conflict" : "failed";
        error =
          status === "conflict"
            ? "预览后记录已修改，请重新预览"
            : "写入失败，请重新导入";
      }
      await c.query(
        "UPDATE import_items SET status=$3,error=$4 WHERE batch_id=$1 AND item_index=$2",
        [id, index, status, error],
      );
    });
  }
  return getImport(db, user, id);
}
