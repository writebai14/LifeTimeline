import express, { type ErrorRequestHandler } from "express";
import cookieParser from "cookie-parser";
import helmet from "helmet";
import { rateLimit } from "express-rate-limit";
import { z } from "zod";
import path from "node:path";
import { Zip, ZipPassThrough, strToU8 } from "fflate";
import type { DB } from "./db.js";
import { transaction } from "./db.js";
import {
  authenticated,
  csrf,
  requireAdmin,
  requireChangedPassword,
  usernameSchema,
  passwordSchema,
  verifyPassword,
  hashPassword,
  issueSession,
  clearCookie,
  publicUser,
  createUser,
  digest,
  cookieName,
} from "./auth.js";
import { HttpError } from "./errors.js";
import { daySchema, dateSchema } from "../shared/domain.js";
import { readDay, saveDay, writeDay, summarize } from "./days.js";
import { previewImport, getImport, executeImport } from "./imports.js";
export interface Options {
  db: DB;
  origin: string;
  secure: boolean;
  staticRoot?: string;
  historyLimit?: number;
  loginLimit?: number;
}
const revision = z.number().int().min(0).max(2147483646);
const uuid = z.string().uuid();
export async function createApp({
  db,
  origin,
  secure,
  staticRoot,
  historyLimit = 30,
  loginLimit = 20,
}: Options) {
  const app = express();
  app.disable("x-powered-by");
  // This deployment binds directly to loopback and does not trust forwarded headers.
  app.set("trust proxy", false);
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: { "upgrade-insecure-requests": secure ? [] : null },
      },
    }),
  );
  app.use(cookieParser());
  app.use("/api", (_req, res, next) => {
    res.setHeader("Cache-Control", "no-store");
    next();
  });
  app.get("/health/live", (_req, res) => res.json({ ok: true }));
  app.get("/health/ready", async (_req, res) => {
    try {
      await db.query("SELECT 1 FROM schema_migrations LIMIT 1");
      res.json({ ok: true });
    } catch {
      res.status(503).json({ ok: false });
    }
  });
  // Limit auth bodies before the larger batch JSON parser.
  app.use("/api/auth", express.json({ limit: "16kb" }));
  const dummy = await hashPassword("dummy-password-not-an-account");
  const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: loginLimit,
    standardHeaders: "draft-7",
    legacyHeaders: false,
    message: { error: "登录尝试过多，请 15 分钟后重试" },
  });
  const accountLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 10,
    keyGenerator: (req) =>
      String(req.body?.username ?? "")
        .trim()
        .toLowerCase()
        .slice(0, 64),
    standardHeaders: false,
    legacyHeaders: false,
    message: { error: "此账户登录尝试过多，请稍后重试" },
  });
  app.post(
    "/api/auth/login",
    csrf(origin),
    loginLimiter,
    accountLimiter,
    async (req, res) => {
      const { username, password } = z
        .object({
          username: usernameSchema,
          password: z.string().min(1).max(128),
        })
        .strict()
        .parse(req.body);
      // Lock through verification/session creation so a concurrent reset cannot issue a stale session.
      const result = await transaction(db, async (c) => {
        const row = (
          await c.query("SELECT * FROM users WHERE username=$1 FOR UPDATE", [
            username,
          ])
        ).rows[0];
        const valid = await verifyPassword(
          password,
          row?.password_hash ?? dummy,
        );
        if (!valid || !row?.active)
          throw new HttpError(401, "用户名或密码错误");
        const old = req.cookies[cookieName];
        if (typeof old === "string")
          await c.query("DELETE FROM sessions WHERE token_hash=$1", [
            digest(old),
          ]);
        // The client remains reserved for this transaction, but exposes the same query interface.
        return issueSession(c, res, row, secure);
      });
      res.json(result);
    },
  );
  app.use("/api", authenticated(db), csrf(origin));
  app.get("/api/auth/me", (req, res) =>
    res.json({ user: req.auth!.user, csrf: req.auth!.csrf }),
  );
  app.post("/api/auth/logout", async (req, res) => {
    await db.query("DELETE FROM sessions WHERE token_hash=$1", [
      req.auth!.tokenHash,
    ]);
    clearCookie(res, secure);
    res.json({ ok: true });
  });
  app.post("/api/auth/password", async (req, res) => {
    const body = z
      .object({
        currentPassword: z.string().max(128),
        newPassword: passwordSchema,
      })
      .strict()
      .parse(req.body);
    if (body.currentPassword === body.newPassword)
      throw new HttpError(400, "新密码不能与原密码相同");
    await transaction(db, async (c) => {
      const u = (
        await c.query("SELECT * FROM users WHERE id=$1 FOR UPDATE", [
          req.auth!.user.id,
        ])
      ).rows[0];
      if (!(await verifyPassword(body.currentPassword, u.password_hash)))
        throw new HttpError(400, "原密码不正确");
      await c.query(
        "UPDATE users SET password_hash=$2,must_change_password=false WHERE id=$1",
        [u.id, await hashPassword(body.newPassword)],
      );
      await c.query("DELETE FROM sessions WHERE user_id=$1", [u.id]);
    });
    clearCookie(res, secure);
    res.json({ ok: true });
  });
  app.use("/api", requireChangedPassword);
  app.use("/api/admin", requireAdmin, express.json({ limit: "16kb" }));
  app.get("/api/admin/users", async (_req, res) =>
    res.json(
      (
        await db.query(
          "SELECT id,username,role,active,must_change_password FROM users ORDER BY created_at",
        )
      ).rows.map((r) => ({ ...publicUser(r), active: r.active })),
    ),
  );
  app.post("/api/admin/users", async (req, res) => {
    const b = z
      .object({
        username: usernameSchema,
        password: passwordSchema,
        role: z.enum(["admin", "user"]).default("user"),
      })
      .strict()
      .parse(req.body);
    const id = await createUser(db, b.username, b.password, b.role);
    res.status(201).json({ id });
  });
  app.patch("/api/admin/users/:id", async (req, res) => {
    const id = uuid.parse(req.params.id);
    const { active } = z
      .object({ active: z.boolean() })
      .strict()
      .parse(req.body);
    if (id === req.auth!.user.id && !active)
      throw new HttpError(400, "不能停用当前账户");
    await transaction(db, async (c) => {
      await c.query("SELECT pg_advisory_xact_lock(519923002)");
      const row = (
        await c.query("SELECT * FROM users WHERE id=$1 FOR UPDATE", [id])
      ).rows[0];
      if (!row) throw new HttpError(404, "用户不存在");
      if (
        row.role === "admin" &&
        !active &&
        (
          await c.query(
            "SELECT count(*)::int AS n FROM users WHERE role='admin' AND active",
          )
        ).rows[0].n <= 1
      )
        throw new HttpError(400, "至少保留一个启用的管理员");
      await c.query("UPDATE users SET active=$2 WHERE id=$1", [id, active]);
      if (!active) await c.query("DELETE FROM sessions WHERE user_id=$1", [id]);
    });
    res.json({ ok: true });
  });
  app.post("/api/admin/users/:id/reset-password", async (req, res) => {
    const id = uuid.parse(req.params.id);
    const { password } = z
      .object({ password: passwordSchema })
      .strict()
      .parse(req.body);
    if (id === req.auth!.user.id)
      throw new HttpError(400, "请使用修改密码功能");
    await transaction(db, async (c) => {
      const r = await c.query(
        "UPDATE users SET password_hash=$2,must_change_password=true WHERE id=$1 RETURNING id",
        [id, await hashPassword(password)],
      );
      if (!r.rowCount) throw new HttpError(404, "用户不存在");
      await c.query("DELETE FROM sessions WHERE user_id=$1", [id]);
    });
    res.json({ ok: true });
  });
  app.get("/api/days", async (req, res) =>
    res.json(
      (
        await db.query("SELECT date FROM days WHERE user_id=$1 ORDER BY date", [
          req.auth!.user.id,
        ])
      ).rows.map((r) => r.date),
    ),
  );
  app.get("/api/stats", async (req, res) =>
    res.json(
      (
        await db.query(
          "SELECT body,revision FROM days WHERE user_id=$1 ORDER BY date",
          [req.auth!.user.id],
        )
      ).rows.map((r) => summarize(r.body, r.revision)),
    ),
  );
  app.get("/api/export", async (req, res) => {
    // Stream one day at a time from a repeatable-read snapshot, with output backpressure.
    const c = await db.connect();
    try {
      await c.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
      res.type("application/zip").attachment("LifeTimeline-json.zip");
      const zip = new Zip((err, chunk, final) => {
        if (err) {
          res.destroy(err);
          return;
        }
        res.write(chunk);
        if (final) res.end();
      });
      let after = "";
      while (!res.destroyed) {
        const rows = (
          await c.query(
            "SELECT date,body FROM days WHERE user_id=$1 AND date>$2 ORDER BY date LIMIT 100",
            [req.auth!.user.id, after],
          )
        ).rows;
        if (!rows.length) break;
        for (const row of rows) {
          if (res.destroyed) break;
          const file = new ZipPassThrough(`${row.date}.json`);
          zip.add(file);
          file.push(strToU8(JSON.stringify(row.body, null, 2)), true);
          if (res.writableNeedDrain)
            await new Promise<void>((resolve) => {
              const done = () => {
                res.off("drain", done);
                res.off("close", done);
                resolve();
              };
              res.once("drain", done);
              res.once("close", done);
            });
          after = row.date;
        }
      }
      if (!res.destroyed) zip.end();
      await c.query("COMMIT");
    } catch (e) {
      await c.query("ROLLBACK");
      throw e;
    } finally {
      c.release();
    }
  });
  app.use("/api/imports", express.json({ limit: "45mb" }));
  app.post("/api/imports/preview", async (req, res) =>
    res.status(201).json(await previewImport(db, req.auth!.user.id, req.body)),
  );
  app.get("/api/imports/:id", async (req, res) =>
    res.json(await getImport(db, req.auth!.user.id, uuid.parse(req.params.id))),
  );
  app.post("/api/imports/:id/execute", async (req, res) =>
    res.json(
      await executeImport(
        db,
        req.auth!.user.id,
        uuid.parse(req.params.id),
        req.body,
        historyLimit,
      ),
    ),
  );
  app.use("/api/days", express.json({ limit: "25mb" }));
  app.get("/api/days/:date", async (req, res) =>
    res.json(
      await readDay(db, req.auth!.user.id, dateSchema.parse(req.params.date)),
    ),
  );
  app.put("/api/days/:date", async (req, res) => {
    const date = dateSchema.parse(req.params.date);
    const { day, expectedRevision } = z
      .object({ day: daySchema, expectedRevision: revision })
      .strict()
      .parse(req.body);
    if (day.date !== date) throw new HttpError(400, "路径日期与日志日期不一致");
    res.json(
      await saveDay(db, req.auth!.user.id, day, expectedRevision, historyLimit),
    );
  });
  app.get("/api/days/:date/history", async (req, res) => {
    const rows = (
      await db.query(
        'SELECT revision,created_at AS "savedAt" FROM day_history WHERE user_id=$1 AND date=$2 ORDER BY revision DESC',
        [req.auth!.user.id, dateSchema.parse(req.params.date)],
      )
    ).rows;
    res.json(rows);
  });
  app.get("/api/days/:date/history/:version", async (req, res) => {
    const row = (
      await db.query(
        "SELECT body AS day,revision FROM day_history WHERE user_id=$1 AND date=$2 AND revision=$3",
        [
          req.auth!.user.id,
          dateSchema.parse(req.params.date),
          z.coerce.number().int().positive().parse(req.params.version),
        ],
      )
    ).rows[0];
    if (!row) throw new HttpError(404, "历史版本不存在");
    res.json(row);
  });
  app.post("/api/days/:date/history/:version/restore", async (req, res) => {
    const user = req.auth!.user.id,
      date = dateSchema.parse(req.params.date),
      version = z.coerce.number().int().positive().parse(req.params.version);
    const { expectedRevision } = z
      .object({ expectedRevision: revision })
      .strict()
      .parse(req.body);
    const result = await transaction(db, async (c) => {
      const old = (
        await c.query(
          "SELECT body FROM day_history WHERE user_id=$1 AND date=$2 AND revision=$3",
          [user, date, version],
        )
      ).rows[0];
      if (!old) throw new HttpError(404, "历史版本不存在");
      return writeDay(c, user, old.body, expectedRevision, historyLimit, true);
    });
    res.json(result);
  });
  app.use("/api", (_req, res) => res.status(404).json({ error: "接口不存在" }));
  app.use("/media", (_req, res) => res.status(404).end());
  if (staticRoot) {
    app.use(express.static(staticRoot));
    app.get("/{*path}", (_req, res) =>
      res.sendFile(path.join(staticRoot, "index.html")),
    );
  }
  const errors: ErrorRequestHandler = (err, _req, res, _next) => {
    if (res.headersSent) {
      res.destroy();
      return;
    }
    if (err instanceof HttpError) {
      res.status(err.status).json({ error: err.message });
      return;
    }
    if (err instanceof z.ZodError) {
      res
        .status(400)
        .json({
          error: "输入格式不正确",
          details: err.issues.map((i) => ({
            path: i.path.join("."),
            message: i.message,
          })),
        });
      return;
    }
    if (err?.code === "23505") {
      res.status(409).json({ error: "记录已存在" });
      return;
    }
    if (err?.type === "entity.too.large") {
      res.status(413).json({ error: "请求数据过大" });
      return;
    }
    if (err?.type === "entity.parse.failed") {
      res.status(400).json({ error: "JSON 格式不正确" });
      return;
    }
    console.error("request_failed", { code: err?.code ?? "internal" });
    res.status(500).json({ error: "服务暂时不可用，请稍后重试" });
  };
  app.use(errors);
  return app;
}
