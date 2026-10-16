import test from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import { database, migrate } from "../server/db.js";
import { createApp } from "../server/app.js";
import { createUser, digest } from "../server/auth.js";
import { normalizeLegacy } from "../shared/domain.js";
import { unzipSync, strFromU8 } from "fflate";
const day = (date = "2026-10-16", summary = "test") => ({
  date,
  blocks: [{ id: "b1", start: "09:00", end: "10:00", summary }],
});
const password = "a-strong-test-password";
test("legacy normalization removes media without losing text and validates dates", () => {
  const value = normalizeLegacy({
    ...day(),
    media: [{ filePath: "old.jpg" }],
    blocks: [
      { ...day().blocks[0], linkedMediaIds: ["m1"], source: "from_media" },
    ],
  });
  assert.equal(value.blocks[0].summary, "test");
  assert.equal(value.blocks[0].source, "manual");
  assert.ok(!("media" in value));
  assert.ok(!("linkedMediaIds" in value.blocks[0]));
  assert.throws(() => normalizeLegacy(day("2026-02-30")));
  assert.throws(() => normalizeLegacy({ ...day(), unknown: true }));
  assert.throws(() =>
    normalizeLegacy({ ...day(), blocks: [day().blocks[0], day().blocks[0]] }),
  );
});
test("PostgreSQL API isolation, concurrency, history, imports and sessions", async (t) => {
  const url = process.env.TEST_DATABASE_URL;
  assert.ok(
    url,
    "Set TEST_DATABASE_URL to a dedicated database ending in _test",
  );
  assert.match(
    new URL(url).pathname,
    /_test$/,
    "Refusing to modify a non-test database",
  );
  const db = database(url);
  t.after(() => db.end());
  await migrate(db);
  await migrate(db);
  await db.query("TRUNCATE users,import_batches CASCADE");
  const app = await createApp({
    db,
    origin: "http://localhost:5173",
    secure: false,
    historyLimit: 3,
    loginLimit: 1000,
  });
  const server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  t.after(() => new Promise<void>((r) => server.close(() => r())));
  const address = server.address() as { port: number };
  const base = `http://127.0.0.1:${address.port}`;
  async function account(username: string, role: "admin" | "user" = "user") {
    const id = await createUser(db, username, password, role);
    await db.query("UPDATE users SET must_change_password=false WHERE id=$1", [
      id,
    ]);
    return { id, username };
  }
  async function client(username: string, pw = password) {
    const response = await fetch(base + "/api/auth/login", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Origin: "http://localhost:5173",
      },
      body: JSON.stringify({ username, password: pw }),
    });
    assert.equal(response.status, 200);
    const payload = (await response.json()) as any;
    const cookie = response.headers.get("set-cookie")!.split(";")[0];
    return {
      cookie,
      csrf: payload.csrf,
      call: async (
        path: string,
        method = "GET",
        body?: unknown,
        extra: Record<string, string> = {},
      ) =>
        fetch(base + "/api" + path, {
          method,
          headers: {
            Cookie: cookie,
            "Content-Type": "application/json",
            Origin: "http://localhost:5173",
            "X-CSRF-Token": payload.csrf,
            ...extra,
          },
          body: body === undefined ? undefined : JSON.stringify(body),
        }),
    };
  }
  const a = await account("alice"),
    b = await account("bob"),
    admin = await account("admin", "admin");
  const alice = await client(a.username),
    bob = await client(b.username),
    root = await client(admin.username);
  await t.test(
    "authentication, CSRF and per-account data isolation",
    async () => {
      assert.equal((await fetch(base + "/api/days")).status, 401);
      assert.equal(
        (
          await alice.call(
            "/days/2026-10-16",
            "PUT",
            { day: day(), expectedRevision: 0 },
            { "X-CSRF-Token": "wrong" },
          )
        ).status,
        403,
      );
      assert.equal(
        (
          await alice.call(
            "/days/2026-10-16",
            "PUT",
            { day: day(), expectedRevision: 0 },
            { Origin: "https://evil.example" },
          )
        ).status,
        403,
      );
      assert.equal(
        (
          await alice.call("/days/2026-10-16", "PUT", {
            day: day(),
            expectedRevision: 0,
          })
        ).status,
        200,
      );
      assert.deepEqual(await (await bob.call("/days")).json(), []);
      assert.deepEqual(await (await bob.call("/days/2026-10-16")).json(), {
        day: null,
        revision: 0,
      });
      assert.deepEqual(await (await root.call("/days")).json(), []);
      assert.equal((await bob.call("/days/2026-10-16/history/1")).status, 404);
      assert.equal(
        (
          await bob.call("/days/2026-10-16/history/1/restore", "POST", {
            expectedRevision: 0,
          })
        ).status,
        404,
      );
      assert.equal((await alice.call("/admin/users")).status, 403);
      assert.equal(
        (
          await alice.call("/days/2026-10-16", "PUT", {
            day: day(),
            expectedRevision: 1,
            userId: b.id,
          })
        ).status,
        400,
      );
      assert.equal((await fetch(base + "/media/old.jpg")).status, 404);
    },
  );
  await t.test(
    "revision conflicts, atomic snapshots, no-op saves and retention",
    async () => {
      const results = await Promise.all(
        ["one", "two"].map((summary) =>
          alice.call("/days/2026-10-16", "PUT", {
            day: day("2026-10-16", summary),
            expectedRevision: 1,
          }),
        ),
      );
      assert.deepEqual(results.map((r) => r.status).sort(), [200, 409]);
      let record = (await (await alice.call("/days/2026-10-16")).json()) as any;
      assert.equal(record.revision, 2);
      const same = (await (
        await alice.call("/days/2026-10-16", "PUT", {
          day: record.day,
          expectedRevision: 2,
        })
      ).json()) as any;
      assert.equal(same.revision, 2);
      const conflict = await alice.call(
        "/days/2026-10-16/history/1/restore",
        "POST",
        { expectedRevision: 1 },
      );
      assert.equal(conflict.status, 409);
      assert.equal(
        (
          await alice.call("/days/2026-10-16/history/1/restore", "POST", {
            expectedRevision: 2,
          })
        ).status,
        200,
      );
      assert.equal(
        (
          await alice.call("/days/2026-10-16", "PUT", {
            day: day("2026-10-16", "four"),
            expectedRevision: 3,
          })
        ).status,
        200,
      );
      const history = (await (
        await alice.call("/days/2026-10-16/history")
      ).json()) as any[];
      assert.deepEqual(
        history.map((v) => v.revision),
        [4, 3, 2],
      );
      assert.equal(
        (await alice.call("/days/2026-10-16/history/1")).status,
        404,
      );
      const stats = (await (await alice.call("/stats")).json()) as any[];
      assert.equal(stats[0].score, 60);
      assert.equal(stats[0].words, 4);
      const zip = unzipSync(
        new Uint8Array(await (await alice.call("/export")).arrayBuffer()),
      );
      assert.equal(
        JSON.parse(strFromU8(zip["2026-10-16.json"])).blocks[0].summary,
        "four",
      );
    },
  );
  await t.test(
    "batch validation, duplicates, isolation, per-day results and idempotent retry",
    async () => {
      const files = [
        {
          name: "new.json",
          content: JSON.stringify({ ...day("2026-10-17"), media: [] }),
        },
        {
          name: "duplicate.json",
          content: JSON.stringify(day("2026-10-17", "dup")),
        },
        { name: "broken.json", content: "{" },
        {
          name: "existing.json",
          content: JSON.stringify(day("2026-10-16", "import")),
        },
      ];
      const preview = await alice.call("/imports/preview", "POST", { files });
      assert.equal(preview.status, 201);
      const batch = (await preview.json()) as any;
      assert.equal(batch.items[0].duplicate, true);
      assert.equal(batch.items[2].status, "invalid");
      assert.equal(batch.items[3].expectedRevision, 4);
      assert.equal((await bob.call(`/imports/${batch.id}`)).status, 404);
      assert.equal(
        (
          await bob.call(`/imports/${batch.id}/execute`, "POST", {
            selected: [0],
          })
        ).status,
        404,
      );
      assert.equal(
        (
          await alice.call(`/imports/${batch.id}/execute`, "POST", {
            selected: [0, 1],
          })
        ).status,
        400,
      );
      assert.equal(
        (
          await alice.call(`/imports/${batch.id}/execute`, "POST", {
            selected: [2],
          })
        ).status,
        400,
      );
      const result = (await (
        await alice.call(`/imports/${batch.id}/execute`, "POST", {
          selected: [0, 3],
        })
      ).json()) as any;
      assert.deepEqual(
        result.items.map((i: any) => i.status),
        ["created", "skipped", "invalid", "overwritten"],
      );
      const again = await (
        await alice.call(`/imports/${batch.id}/execute`, "POST", {
          selected: [0, 3],
        })
      ).json();
      assert.deepEqual(again, result);
      assert.equal(
        (
          await alice.call(`/imports/${batch.id}/execute`, "POST", {
            selected: [1],
          })
        ).status,
        409,
      );
      assert.equal(
        ((await (await alice.call("/days/2026-10-16")).json()) as any).revision,
        5,
      );
    },
  );
  await t.test(
    "preview conflicts, expiry and resuming a partially committed batch",
    async () => {
      const preview = async (d: string) =>
        (await (
          await alice.call("/imports/preview", "POST", {
            files: [{ name: "one.json", content: JSON.stringify(day(d)) }],
          })
        ).json()) as any;
      const conflict = await preview("2026-10-16");
      await alice.call("/days/2026-10-16", "PUT", {
        day: day("2026-10-16", "edited-after-preview"),
        expectedRevision: 5,
      });
      assert.equal(
        (
          (await (
            await alice.call(`/imports/${conflict.id}/execute`, "POST", {
              selected: [0],
            })
          ).json()) as any
        ).items[0].status,
        "conflict",
      );
      const expired = await preview("2026-10-18");
      await db.query(
        "UPDATE import_batches SET expires_at=now()-interval '1 second' WHERE id=$1",
        [expired.id],
      );
      assert.equal(
        (
          await alice.call(`/imports/${expired.id}/execute`, "POST", {
            selected: [0],
          })
        ).status,
        410,
      );
      const partial = await preview("2026-10-19");
      await db.query(
        "UPDATE import_batches SET started=true,selected='[0]' WHERE id=$1",
        [partial.id],
      );
      assert.equal(
        (
          (await (
            await alice.call(`/imports/${partial.id}/execute`, "POST", {
              selected: [0],
            })
          ).json()) as any
        ).items[0].status,
        "created",
      );
    },
  );
  await t.test(
    "failed day transactions leave no partial current row or history",
    async () => {
      await db.query(
        "CREATE FUNCTION fail_test_history() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.date='2026-10-20' THEN RAISE EXCEPTION 'test failure'; END IF; RETURN NEW; END $$",
      );
      await db.query(
        "CREATE TRIGGER fail_history BEFORE INSERT ON day_history FOR EACH ROW EXECUTE FUNCTION fail_test_history()",
      );
      try {
        assert.equal(
          (
            await alice.call("/days/2026-10-20", "PUT", {
              day: day("2026-10-20"),
              expectedRevision: 0,
            })
          ).status,
          500,
        );
        assert.equal(
          ((await (await alice.call("/days/2026-10-20")).json()) as any)
            .revision,
          0,
        );
        assert.equal(
          (
            await db.query(
              "SELECT count(*)::int AS n FROM day_history WHERE date='2026-10-20'",
            )
          ).rows[0].n,
          0,
        );
        const preview = (await (
          await alice.call("/imports/preview", "POST", {
            files: [
              {
                name: "fails.json",
                content: JSON.stringify(day("2026-10-20")),
              },
              {
                name: "succeeds.json",
                content: JSON.stringify(day("2026-10-21")),
              },
            ],
          })
        ).json()) as any;
        const imported = (await (
          await alice.call(`/imports/${preview.id}/execute`, "POST", {
            selected: [0, 1],
          })
        ).json()) as any;
        assert.deepEqual(
          imported.items.map((i: any) => i.status),
          ["failed", "created"],
        );
        assert.equal(
          ((await (await alice.call("/days/2026-10-20")).json()) as any)
            .revision,
          0,
        );
      } finally {
        await db.query("DROP TRIGGER fail_history ON day_history");
        await db.query("DROP FUNCTION fail_test_history()");
      }
    },
  );
  await t.test(
    "password reset, forced change, logout and disabled account revoke sessions",
    async () => {
      const bob2 = await client("bob");
      assert.equal(
        (
          await root.call(`/admin/users/${b.id}/reset-password`, "POST", {
            password: "new-temporary-password",
          })
        ).status,
        200,
      );
      assert.equal((await bob.call("/auth/me")).status, 401);
      assert.equal((await bob2.call("/days")).status, 401);
      const temp = await client("bob", "new-temporary-password");
      assert.equal((await temp.call("/days")).status, 403);
      assert.equal(
        (
          await temp.call("/auth/password", "POST", {
            currentPassword: "new-temporary-password",
            newPassword: "new-permanent-password",
          })
        ).status,
        200,
      );
      assert.equal((await temp.call("/auth/me")).status, 401);
      const fresh = await client("bob", "new-permanent-password");
      assert.equal((await fresh.call("/days")).status, 200);
      await root.call(`/admin/users/${b.id}`, "PATCH", { active: false });
      assert.equal((await fresh.call("/days")).status, 401);
      assert.equal(
        (
          await root.call(`/admin/users/${admin.id}`, "PATCH", {
            active: false,
          })
        ).status,
        400,
      );
      const logoutClient = await client("alice");
      await logoutClient.call("/auth/logout", "POST");
      assert.equal((await logoutClient.call("/auth/me")).status, 401);
    },
  );
  await t.test(
    "file limits and unsupported input do not create journal records",
    async () => {
      assert.equal(
        (
          await alice.call("/imports/preview", "POST", {
            files: Array.from({ length: 501 }, () => ({
              name: "x.json",
              content: "{}",
            })),
          })
        ).status,
        400,
      );
      assert.equal(
        (
          await alice.call("/imports/preview", "POST", {
            files: [
              {
                name: "too-big.json",
                content: " ".repeat(20 * 1024 * 1024 + 1),
              },
            ],
          })
        ).status,
        413,
      );
      const bad = (await (
        await alice.call("/imports/preview", "POST", {
          files: [{ name: "archive.zip", content: JSON.stringify(day()) }],
        })
      ).json()) as any;
      assert.equal(bad.items[0].status, "invalid");
    },
  );
  await t.test(
    "production cookie attributes, login origin and throttling",
    async () => {
      const secureApp = await createApp({
        db,
        origin: "https://timeline.example.com",
        secure: true,
        loginLimit: 1,
      });
      const secureServer = secureApp.listen(0, "127.0.0.1");
      await once(secureServer, "listening");
      try {
        const endpoint = `http://127.0.0.1:${(secureServer.address() as { port: number }).port}/api/auth/login`;
        const data = JSON.stringify({ username: "alice", password });
        assert.equal(
          (
            await fetch(endpoint, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: data,
            })
          ).status,
          403,
        );
        const response = await fetch(endpoint, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Origin: "https://timeline.example.com",
          },
          body: data,
        });
        assert.equal(response.status, 200);
        const cookie = response.headers.get("set-cookie")!;
        assert.match(cookie, /HttpOnly/);
        assert.match(cookie, /Secure/);
        assert.match(cookie, /SameSite=Strict/);
        assert.equal(
          (
            await fetch(endpoint, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Origin: "https://timeline.example.com",
              },
              body: data,
            })
          ).status,
          429,
        );
      } finally {
        await new Promise<void>((r) => secureServer.close(() => r()));
      }
    },
  );
  await t.test("absolute and idle session expiry", async () => {
    for (const column of ["expires_at", "last_seen"]) {
      const c = await client("alice");
      const token = c.cookie.split("=")[1];
      await db.query(
        `UPDATE sessions SET ${column}=now()-interval '8 days' WHERE token_hash=$1`,
        [digest(token)],
      );
      assert.equal((await c.call("/auth/me")).status, 401);
    }
  });
});
