import path from "node:path";
import { database } from "./db.js";
import { createApp } from "./app.js";
const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL is required");
const production = process.env.NODE_ENV === "production";
const originUrl = new URL(process.env.APP_ORIGIN ?? "http://localhost:5173");
const origin = originUrl.origin;
const privateTunnelOrigin =
  originUrl.protocol === "http:" &&
  originUrl.hostname === "localhost" &&
  process.env.ALLOW_HTTP_LOOPBACK === "true";
if (production && originUrl.protocol !== "https:" && !privateTunnelOrigin)
  throw new Error(
    "Production APP_ORIGIN must use HTTPS (HTTP is allowed only for an explicitly enabled localhost SSH tunnel)",
  );
const limit = Number(process.env.LIFETIMELINE_DAY_HISTORY_LIMIT ?? 30);
if (!Number.isInteger(limit) || limit < 1)
  throw new Error("Invalid history limit");
const db = database(url);
const app = await createApp({
  db,
  origin,
  // The private SSH-tunnel exception is plain HTTP in the browser. Do not
  // mark its session cookie Secure or ask Helmet to upgrade app assets to
  // HTTPS, since the tunnel intentionally terminates at an HTTP-only port.
  secure: production && !privateTunnelOrigin,
  staticRoot: production ? path.resolve("dist") : undefined,
  historyLimit: limit,
});
const server = app.listen(Number(process.env.PORT ?? 3001), "0.0.0.0", () =>
  console.log("LifeTimeline server ready"),
);
server.requestTimeout = 60_000;
server.headersTimeout = 15_000;
const maintenance = setInterval(() => {
  void db
    .query(
      "DELETE FROM sessions WHERE expires_at<now() OR last_seen<now()-interval '24 hours'",
    )
    .catch(() => console.error("session_cleanup_failed"));
  void db
    .query(
      "DELETE FROM import_batches WHERE expires_at<now()-interval '7 days'",
    )
    .catch(() => console.error("import_cleanup_failed"));
}, 3600000);
maintenance.unref();
let closing = false;
for (const signal of ["SIGTERM", "SIGINT"])
  process.on(signal, () => {
    if (closing) return;
    closing = true;
    clearInterval(maintenance);
    server.close(() => void db.end().then(() => process.exit(0)));
    setTimeout(() => process.exit(1), 15000).unref();
  });
