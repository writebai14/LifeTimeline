import {
  randomBytes,
  randomUUID,
  createHash,
  scrypt as scryptCallback,
  timingSafeEqual,
} from "node:crypto";
import type { RequestHandler, Request, Response } from "express";
import { z } from "zod";
import type { DB } from "./db.js";
import type { User } from "../shared/domain.js";
import { HttpError } from "./errors.js";
function derive(password: string, salt: string): Promise<Buffer> {
  return new Promise((resolve, reject) =>
    scryptCallback(
      password,
      salt,
      64,
      { N: 32768, r: 8, p: 3, maxmem: 64 * 1024 * 1024 },
      (error, key) => (error ? reject(error) : resolve(key)),
    ),
  );
}
export const usernameSchema = z
  .string()
  .trim()
  .toLowerCase()
  .regex(
    /^[a-z0-9][a-z0-9_.-]{2,63}$/,
    "用户名须为 3–64 位字母、数字、点、横线或下划线",
  );
export const passwordSchema = z.string().min(12, "密码至少 12 位").max(128);
export const digest = (s: string) =>
  createHash("sha256").update(s).digest("hex");
export async function hashPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  const key = await derive(password, salt);
  return `scrypt:32768:8:3:${salt}:${key.toString("hex")}`;
}
export async function verifyPassword(password: string, stored: string) {
  const [algorithm, n, r, p, salt, key] = stored.split(":");
  if (
    algorithm !== "scrypt" ||
    n !== "32768" ||
    r !== "8" ||
    p !== "3" ||
    !salt ||
    !key
  )
    return false;
  const actual = await derive(password, salt);
  const expected = Buffer.from(key, "hex");
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
export function publicUser(row: any): User {
  return {
    id: row.id,
    username: row.username,
    role: row.role,
    mustChangePassword: row.must_change_password,
  };
}
export interface Auth {
  user: User;
  csrf: string;
  tokenHash: string;
}
declare global {
  namespace Express {
    interface Request {
      auth?: Auth;
    }
  }
}
export const cookieName = "lt_session";
export function clearCookie(res: Response, secure: boolean) {
  res.clearCookie(cookieName, {
    httpOnly: true,
    secure,
    sameSite: "strict",
    path: "/",
  });
}
export async function issueSession(
  db: Pick<DB, "query">,
  res: Response,
  row: any,
  secure: boolean,
) {
  const token = randomBytes(32).toString("hex"),
    csrf = randomBytes(32).toString("hex");
  await db.query(
    "INSERT INTO sessions(token_hash,user_id,csrf,expires_at) VALUES($1,$2,$3,now()+interval '7 days')",
    [digest(token), row.id, csrf],
  );
  res.cookie(cookieName, token, {
    httpOnly: true,
    secure,
    sameSite: "strict",
    path: "/",
    maxAge: 7 * 86400000,
  });
  return { user: publicUser(row), csrf };
}
export function authenticated(db: DB): RequestHandler {
  return async (req, res, next) => {
    const token = req.cookies[cookieName];
    if (typeof token !== "string") throw new HttpError(401, "请登录");
    const hash = digest(token);
    const found = await db.query(
      `UPDATE sessions s SET last_seen=now() FROM users u WHERE s.token_hash=$1 AND u.id=s.user_id AND u.active AND s.expires_at>now() AND s.last_seen>now()-interval '24 hours' RETURNING u.*,s.csrf`,
      [hash],
    );
    if (!found.rowCount) throw new HttpError(401, "会话已过期，请重新登录");
    req.auth = {
      user: publicUser(found.rows[0]),
      csrf: found.rows[0].csrf,
      tokenHash: hash,
    };
    res.setHeader("Cache-Control", "no-store");
    next();
  };
}
export function csrf(origin: string): RequestHandler {
  return (req, _res, next) => {
    if (!["GET", "HEAD", "OPTIONS"].includes(req.method)) {
      if (req.headers.origin !== origin)
        throw new HttpError(403, "请求来源无效");
      if (req.auth && req.headers["x-csrf-token"] !== req.auth.csrf)
        throw new HttpError(403, "请求校验失败，请刷新页面");
    }
    next();
  };
}
export const requireChangedPassword: RequestHandler = (req, _res, next) => {
  if (req.auth!.user.mustChangePassword)
    throw new HttpError(403, "请先修改临时密码");
  next();
};
export const requireAdmin: RequestHandler = (req, _res, next) => {
  if (req.auth!.user.role !== "admin")
    throw new HttpError(403, "需要管理员权限");
  next();
};
export async function createUser(
  db: DB,
  username: string,
  password: string,
  role: "admin" | "user" = "user",
) {
  const id = randomUUID();
  await db.query(
    "INSERT INTO users(id,username,password_hash,role) VALUES($1,$2,$3,$4)",
    [
      id,
      usernameSchema.parse(username),
      await hashPassword(passwordSchema.parse(password)),
      role,
    ],
  );
  return id;
}
