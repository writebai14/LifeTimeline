import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";
import { database, migrate } from "./db.js";
import { createUser } from "./auth.js";
const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL is required");
const db = database(url);
try {
  if (process.argv[2] === "migrate") {
    await migrate(db);
    console.log("Database migrations applied");
  } else if (process.argv[2] === "create-admin") {
    if (!stdin.isTTY)
      throw new Error("Use an interactive terminal to create an administrator");
    const rl = createInterface({ input: stdin, output: stdout });
    try {
      const username = await rl.question("Admin username: ");
      // Read password in raw mode without echoing it into terminal logs.
      rl.close();
      stdout.write("Temporary password (12+ characters, hidden): ");
      stdin.setRawMode(true);
      stdin.resume();
      const password = await new Promise<string>((resolve, reject) => {
        let value = "";
        const listener = (chunk: Buffer) => {
          for (const char of chunk.toString()) {
            if (char === "\u0003") {
              stdin.off("data", listener);
              reject(new Error("Cancelled"));
              return;
            }
            if (char === "\r" || char === "\n") {
              stdin.off("data", listener);
              resolve(value);
              return;
            }
            if (char === "\u007f") {
              value = value.slice(0, -1);
            } else if (char >= " ") {
              value += char;
            }
          }
        };
        stdin.on("data", listener);
      }).finally(() => {
        stdin.setRawMode(false);
        stdin.pause();
        stdout.write("\n");
      });
      await createUser(db, username, password, "admin");
      console.log(
        "Administrator created; password change required at first login",
      );
    } finally {
      rl.close();
    }
  } else throw new Error("Usage: cli migrate | create-admin");
} catch (e) {
  console.error(
    (e as { code?: string }).code === "23505"
      ? "Username already exists"
      : e instanceof Error
        ? e.message
        : "Command failed",
  );
  process.exitCode = 1;
} finally {
  await db.end();
}
