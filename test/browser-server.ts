import { database, migrate } from "../server/db.js";
import { createUser } from "../server/auth.js";
import { createApp } from "../server/app.js";
import path from "node:path";
const url = process.env.TEST_DATABASE_URL;
if (!url || !new URL(url).pathname.endsWith("_test"))
  throw new Error("Dedicated TEST_DATABASE_URL ending in _test required");
const db = database(url);
await migrate(db);
await db.query("TRUNCATE users,import_batches CASCADE");
await createUser(db, "browseradmin", "browser-admin-password", "admin");
await db.query("UPDATE users SET must_change_password=false");
const app = await createApp({
  db,
  origin: "http://localhost:5189",
  secure: true,
  staticRoot: path.resolve("dist"),
  loginLimit: 1000,
});
const server = app.listen(5189, "127.0.0.1");
for (const signal of ["SIGINT", "SIGTERM"])
  process.on(signal, () =>
    server.close(() => void db.end().then(() => process.exit(0))),
  );
