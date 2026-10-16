import { useEffect, useState } from "react";
import type { User } from "../shared/domain";
import { session, login, logout, changePassword, ApiError } from "./api";
import App from "./App";
import "./ServerUI.css";
export default function SessionGate() {
  const [user, setUser] = useState<User | null>(null),
    [loading, setLoading] = useState(true),
    [expired, setExpired] = useState(false),
    [passwordOpen, setPasswordOpen] = useState(false),
    [error, setError] = useState("");
  const bootstrap = () => {
    setLoading(true);
    setError("");
    session()
      .then(setUser)
      .catch((e) => {
        if (!(e instanceof ApiError && e.status === 401)) setError(e.message);
      })
      .finally(() => setLoading(false));
  };
  useEffect(() => {
    bootstrap();
    const expire = () => setExpired(true);
    window.addEventListener("session-expired", expire);
    return () => window.removeEventListener("session-expired", expire);
  }, []);
  const exit = async () => {
    await logout();
    setUser(null);
    setExpired(false);
    setPasswordOpen(false);
  };
  if (loading) return <div className="auth-page">正在连接服务器…</div>;
  if (!user)
    return (
      <div className="auth-page">
        {error ? (
          <>
            <p role="alert">{error}</p>
            <button onClick={bootstrap}>重试连接</button>
          </>
        ) : (
          <LoginForm
            onLogin={(u) => {
              setUser(u);
              setExpired(false);
            }}
          />
        )}
      </div>
    );
  return (
    <>
      {!user.mustChangePassword && (
        <App
          key={user.id}
          user={user}
          onLogout={exit}
          onPassword={() => setPasswordOpen(true)}
        />
      )}
      {expired && (
        <div className="server-overlay">
          <section className="server-panel">
            <p>
              登录已过期。重新登录同一账户可继续处理当前草稿；切换账户会清空当前页面。
            </p>
            <LoginForm
              onLogin={(u) => {
                setUser(u);
                setExpired(false);
              }}
            />
          </section>
        </div>
      )}
      {(user.mustChangePassword || passwordOpen) && !expired && (
        <div className="server-overlay">
          <PasswordForm
            required={user.mustChangePassword}
            onCancel={() => setPasswordOpen(false)}
            onLogout={exit}
            onChanged={() => {
              setUser(null);
              setPasswordOpen(false);
            }}
          />
        </div>
      )}
    </>
  );
}
function LoginForm({ onLogin }: { onLogin: (u: User) => void }) {
  const [username, setUsername] = useState(""),
    [password, setPassword] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  return (
    <form
      className="server-panel auth-form"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setError("");
        try {
          onLogin(await login(username, password));
        } catch (e) {
          setError((e as Error).message);
        } finally {
          setBusy(false);
        }
      }}
    >
      <h1>LifeTimeline</h1>
      <p>登录，继续记录你的生活。</p>
      <label>
        用户名
        <input
          autoComplete="username"
          required
          value={username}
          onChange={(e) => setUsername(e.target.value)}
        />
      </label>
      <label>
        密码
        <input
          type="password"
          autoComplete="current-password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
      </label>
      {error && <p role="alert">{error}</p>}
      <button disabled={busy}>{busy ? "登录中…" : "登录"}</button>
      <small>账户由管理员创建；忘记密码请联系管理员。</small>
    </form>
  );
}
function PasswordForm({
  required,
  onCancel,
  onChanged,
  onLogout,
}: {
  required: boolean;
  onCancel: () => void;
  onChanged: () => void;
  onLogout: () => Promise<void>;
}) {
  const [old, setOld] = useState(""),
    [next, setNext] = useState(""),
    [confirm, setConfirm] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  return (
    <form
      className="server-panel auth-form"
      onSubmit={async (e) => {
        e.preventDefault();
        if (next !== confirm) {
          setError("两次新密码不一致");
          return;
        }
        setBusy(true);
        try {
          await changePassword(old, next);
          onChanged();
        } catch (e) {
          setError((e as Error).message);
        } finally {
          setBusy(false);
        }
      }}
    >
      <h2>{required ? "请修改临时密码" : "修改密码"}</h2>
      <p>修改后所有设备需要重新登录。</p>
      <label>
        原密码
        <input
          type="password"
          autoComplete="current-password"
          required
          value={old}
          onChange={(e) => setOld(e.target.value)}
        />
      </label>
      <label>
        新密码
        <input
          type="password"
          autoComplete="new-password"
          minLength={12}
          maxLength={128}
          required
          value={next}
          onChange={(e) => setNext(e.target.value)}
        />
      </label>
      <label>
        确认新密码
        <input
          type="password"
          autoComplete="new-password"
          required
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
        />
      </label>
      {error && <p role="alert">{error}</p>}
      <button disabled={busy}>保存并重新登录</button>
      {!required ? (
        <button type="button" onClick={onCancel}>
          取消
        </button>
      ) : (
        <button
          type="button"
          onClick={() => void onLogout().catch((e) => setError(e.message))}
        >
          退出登录
        </button>
      )}
    </form>
  );
}
