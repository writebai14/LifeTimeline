import type {
  Day,
  DayRecord,
  DayStats,
  User,
  ImportBatch,
} from "../shared/domain";
let csrf = "";
export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
export async function request<T>(
  path: string,
  method = "GET",
  body?: unknown,
): Promise<T> {
  const res = await fetch(`/api${path}`, {
    method,
    credentials: "same-origin",
    headers: {
      ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
      ...(method !== "GET" ? { "X-CSRF-Token": csrf } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await res
    .json()
    .catch(() => ({ error: "服务器返回了无法读取的响应" }));
  if (!res.ok) {
    if (res.status === 401 && path !== "/auth/login" && path !== "/auth/me")
      window.dispatchEvent(new Event("session-expired"));
    throw new ApiError(res.status, data.error ?? "请求失败");
  }
  return data as T;
}
export async function session() {
  const r = await request<{ user: User; csrf: string }>("/auth/me");
  csrf = r.csrf;
  return r.user;
}
export async function login(username: string, password: string) {
  const r = await request<{ user: User; csrf: string }>("/auth/login", "POST", {
    username,
    password,
  });
  csrf = r.csrf;
  return r.user;
}
export async function logout() {
  await request("/auth/logout", "POST");
  csrf = "";
}
export async function changePassword(
  currentPassword: string,
  newPassword: string,
) {
  await request("/auth/password", "POST", { currentPassword, newPassword });
  csrf = "";
}
export const fetchDay = (date: string) => request<DayRecord>(`/days/${date}`);
export const saveDay = (day: Day, expectedRevision: number) =>
  request<DayRecord>(`/days/${day.date}`, "PUT", { day, expectedRevision });
export const fetchStats = () => request<DayStats[]>("/stats");
export const previewImport = (files: { name: string; content: string }[]) =>
  request<ImportBatch>("/imports/preview", "POST", { files });
export const getImport = (id: string) => request<ImportBatch>(`/imports/${id}`);
export const executeImport = (id: string, selected: number[]) =>
  request<ImportBatch>(`/imports/${id}/execute`, "POST", { selected });
export async function exportJson() {
  const res = await fetch("/api/export");
  if (!res.ok) {
    if (res.status === 401) window.dispatchEvent(new Event("session-expired"));
    throw new Error("导出失败，请重新登录后重试");
  }
  download(await res.blob(), "LifeTimeline-json.zip");
}
export function download(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
