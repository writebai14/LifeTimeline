import { useEffect, useState } from "react";
import type { User, ImportBatch, DayRecord } from "../shared/domain";
import {
  previewImport,
  getImport,
  executeImport,
  request,
  exportJson,
} from "./api";
import { formatDayExport } from "./exportDay";
export function Panel({
  title,
  close,
  children,
}: {
  title: string;
  close: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="server-overlay">
      <section className="server-panel wide">
        <header>
          <h2>{title}</h2>
          <button onClick={close}>关闭</button>
        </header>
        {children}
      </section>
    </div>
  );
}
const statusNames: Record<string, string> = {
  pending: "待导入",
  invalid: "无效",
  skipped: "已跳过",
  created: "已新增",
  overwritten: "已覆盖",
  conflict: "版本冲突",
  failed: "失败",
};
export function ImportPanel({
  user,
  close,
  onDone,
}: {
  user: User;
  close: () => void;
  onDone: () => void;
}) {
  const key = `lt-import:${user.id}`;
  const [batch, setBatch] = useState<ImportBatch | null>(null),
    [selected, setSelected] = useState<number[]>([]),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const update = (b: ImportBatch) => {
    setBatch(b);
    if (b.started) setSelected(b.selected);
    else
      setSelected(
        b.items
          .filter((i) => !i.error && !i.expectedRevision && !i.duplicate)
          .map((i) => i.index),
      );
  };
  useEffect(() => {
    const id = localStorage.getItem(key);
    if (id) {
      setBusy(true);
      getImport(id)
        .then(update)
        .catch((e) => setError(e.message))
        .finally(() => setBusy(false));
    }
  }, [key]);
  const act = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError("");
    try {
      await fn();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const duplicate =
    !!batch &&
    new Set(
      batch.items.filter((i) => selected.includes(i.index)).map((i) => i.date),
    ).size !== selected.length;
  return (
    <Panel title="批量导入 JSON" close={busy ? () => {} : close}>
      <p>
        选择旧版每日 JSON，每批最多 500 个、合计 20
        MB。图片字段会被移除。已有日期默认跳过；勾选即确认覆盖并保存旧版本。同日重复文件只能选一个。
      </p>
      <label>
        选择 JSON 文件
        <input
          type="file"
          accept=".json,application/json"
          multiple
          disabled={busy}
          onChange={(e) => {
            const files = Array.from(e.target.files ?? []);
            e.target.value = "";
            void act(async () => {
              if (!files.length) return;
              if (
                files.length > 500 ||
                files.reduce((n, f) => n + f.size, 0) > 20 * 1024 * 1024
              )
                throw new Error("超出每批 500 个文件或 20 MB 限制");
              if (files.some((f) => !f.name.toLowerCase().endsWith(".json")))
                throw new Error("仅支持 JSON 文件");
              const b = await previewImport(
                await Promise.all(
                  files.map(async (f) => ({
                    name: f.name,
                    content: await f.text(),
                  })),
                ),
              );
              localStorage.setItem(key, b.id);
              update(b);
            });
          }}
        />
      </label>
      {error && <p role="alert">{error}</p>}
      {batch && (
        <>
          <p>
            预览有效期至 {new Date(batch.expiresAt).toLocaleString()}
            。关闭页面后可重新进入查询结果。
          </p>
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>导入</th>
                  <th>文件 / 日期</th>
                  <th>处理方式</th>
                  <th>结果</th>
                </tr>
              </thead>
              <tbody>
                {batch.items.map((i) => (
                  <tr key={i.index}>
                    <td>
                      <input
                        aria-label={`导入 ${i.name}`}
                        type="checkbox"
                        disabled={busy || batch.started || !!i.error}
                        checked={selected.includes(i.index)}
                        onChange={(e) =>
                          setSelected((s) =>
                            e.target.checked
                              ? [...s, i.index]
                              : s.filter((n) => n !== i.index),
                          )
                        }
                      />
                    </td>
                    <td>
                      {i.name}
                      <br />
                      {i.date}
                    </td>
                    <td>
                      {i.expectedRevision ? "覆盖已有记录" : "新增"}
                      {i.duplicate ? " · 日期重复" : ""}
                    </td>
                    <td>
                      {statusNames[i.status]}
                      {i.error && <small>{i.error}</small>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {duplicate && (
            <p role="alert">同一日期选中了多个文件，请只保留一个。</p>
          )}
          <button
            disabled={busy || duplicate || (!batch.started && !selected.length)}
            onClick={() =>
              void act(async () => {
                const result = await executeImport(batch.id, selected);
                update(result);
                onDone();
              })
            }
          >
            {busy
              ? "处理中…"
              : batch.started
                ? "继续导入 / 查询结果"
                : `确认导入 ${selected.length} 项`}
          </button>
          <button
            disabled={busy}
            onClick={() =>
              void act(async () => update(await getImport(batch.id)))
            }
          >
            刷新结果
          </button>
          {batch.started && (
            <p role="status">
              {Object.entries(statusNames)
                .map(
                  ([s, label]) =>
                    `${label} ${batch.items.filter((i) => i.status === s).length}`,
                )
                .join(" · ")}
            </p>
          )}
        </>
      )}
      <hr />
      <button disabled={busy} onClick={() => void act(exportJson)}>
        导出我的全部日志 JSON（ZIP）
      </button>
      <p>导出包解压后可再次批量选择 JSON 导入；不包含历史快照。</p>
    </Panel>
  );
}
export function HistoryPanel({
  date,
  revision,
  close,
  onRestore,
}: {
  date: string;
  revision: number;
  close: () => void;
  onRestore: (r: DayRecord) => void;
}) {
  const [versions, setVersions] = useState<
      { revision: number; savedAt: string }[]
    >([]),
    [preview, setPreview] = useState<DayRecord | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  useEffect(() => {
    request<typeof versions>(`/days/${date}/history`)
      .then(setVersions)
      .catch((e) => setError(e.message));
  }, [date]);
  const act = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError("");
    try {
      await fn();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Panel title={`${date} 历史版本`} close={busy ? () => {} : close}>
      {error && <p role="alert">{error}</p>}
      {!versions.length && <p>暂无历史版本。</p>}
      <div className="history-list">
        {versions.map((v) => (
          <button
            key={v.revision}
            disabled={busy}
            onClick={() =>
              void act(async () =>
                setPreview(
                  await request(`/days/${date}/history/${v.revision}`),
                ),
              )
            }
          >
            版本 {v.revision} · {new Date(v.savedAt).toLocaleString()}
          </button>
        ))}
      </div>
      {preview?.day && (
        <>
          <pre>{formatDayExport(preview.day)}</pre>
          <button
            disabled={busy}
            onClick={() =>
              void act(async () => {
                if (!confirm("恢复此版本？当前内容会保留在历史中。")) return;
                const r = await request<DayRecord>(
                  `/days/${date}/history/${preview.revision}/restore`,
                  "POST",
                  { expectedRevision: revision },
                );
                onRestore(r);
                close();
              })
            }
          >
            恢复此版本
          </button>
        </>
      )}
    </Panel>
  );
}
export function AdminPanel({ user, close }: { user: User; close: () => void }) {
  const [users, setUsers] = useState<(User & { active: boolean })[]>([]),
    [username, setUsername] = useState(""),
    [password, setPassword] = useState(""),
    [role, setRole] = useState<"admin" | "user">("user"),
    [target, setTarget] = useState<string | null>(null),
    [reset, setReset] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const load = () => request<typeof users>("/admin/users").then(setUsers);
  useEffect(() => {
    load().catch((e) => setError(e.message));
  }, []);
  const act = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError("");
    try {
      await fn();
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Panel title="用户管理" close={busy ? () => {} : close}>
      <p>管理员仅管理账户，不能通过此界面查看其他用户的日志。</p>
      {error && <p role="alert">{error}</p>}
      <form
        className="inline-form"
        onSubmit={(e) => {
          e.preventDefault();
          void act(async () => {
            await request("/admin/users", "POST", { username, password, role });
            setUsername("");
            setPassword("");
          });
        }}
      >
        <label>
          新用户名
          <input
            required
            pattern="[a-zA-Z0-9][a-zA-Z0-9_.\-]{2,63}"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
          />
        </label>
        <label>
          临时密码
          <input
            type="password"
            minLength={12}
            maxLength={128}
            required
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </label>
        <label>
          角色
          <select
            value={role}
            onChange={(e) => setRole(e.target.value as typeof role)}
          >
            <option value="user">普通用户</option>
            <option value="admin">管理员</option>
          </select>
        </label>
        <button disabled={busy}>创建账户</button>
      </form>
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>用户名</th>
              <th>角色 / 状态</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id}>
                <td>{u.username}</td>
                <td>
                  {u.role === "admin" ? "管理员" : "用户"} ·{" "}
                  {u.active ? "启用" : "停用"}
                  {u.mustChangePassword ? " · 待改密" : ""}
                </td>
                <td>
                  <button
                    disabled={busy || u.id === user.id}
                    onClick={() =>
                      void act(async () => {
                        await request(`/admin/users/${u.id}`, "PATCH", {
                          active: !u.active,
                        });
                      })
                    }
                  >
                    {u.active ? "停用" : "启用"}
                  </button>
                  <button
                    disabled={busy || u.id === user.id}
                    onClick={() => {
                      setTarget(u.id);
                      setReset("");
                    }}
                  >
                    重置密码
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {target && (
        <form
          className="inline-form"
          onSubmit={(e) => {
            e.preventDefault();
            void act(async () => {
              await request(`/admin/users/${target}/reset-password`, "POST", {
                password: reset,
              });
              setTarget(null);
              setReset("");
            });
          }}
        >
          <label>
            新的临时密码
            <input
              type="password"
              required
              minLength={12}
              maxLength={128}
              autoComplete="new-password"
              value={reset}
              onChange={(e) => setReset(e.target.value)}
            />
          </label>
          <button disabled={busy}>确认重置并撤销旧会话</button>
          <button type="button" onClick={() => setTarget(null)}>
            取消
          </button>
        </form>
      )}
    </Panel>
  );
}
