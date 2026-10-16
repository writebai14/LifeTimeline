import { useState, useEffect, useCallback, useRef } from "react";
import { todayStr } from "./utils";
import { fetchDay, fetchStats, saveDay, ApiError, download } from "./api";
import type { User, DayStats, DayRecord } from "../shared/domain";
import { ImportPanel, HistoryPanel, AdminPanel } from "./ServerPanels";
import type { Day } from "./types";
import { getBestReminder, type Reminder } from "./reminders";
import { DayView } from "./DayView";
import { DateSwitcher } from "./DateSwitcher";
import { ContributionCalendar } from "./ContributionCalendar";
import { DiaryStatsModal } from "./DiaryStatsModal";
import { BookCopy, FileOutput, Inbox } from "lucide-react";
import "./App.css";

function emptyDay(date: string): Day {
  return {
    date,
    blocks: [],
    done: false,
  };
}

function App({
  user,
  onLogout,
  onPassword,
}: {
  user: User;
  onLogout: () => Promise<void>;
  onPassword: () => void;
}) {
  const [currentDate, setCurrentDate] = useState(todayStr);
  const [day, setDay] = useState<Day | null>(null);
  const [loading, setLoading] = useState(true),
    [saving, setSaving] = useState(false);
  const [statsOpen, setStatsOpen] = useState(false);
  const [dataError, setDataError] = useState<string | null>(null),
    [statsError, setStatsError] = useState("");
  const [dirty, setDirty] = useState(false),
    [conflict, setConflict] = useState(false);
  const [panel, setPanel] = useState<"imports" | "history" | "admin" | null>(
    null,
  );
  const [copyStatus, setCopyStatus] = useState<"idle" | "ok" | "fail">("idle");
  const [copySignal, setCopySignal] = useState(0),
    [exportSignal, setExportSignal] = useState(0),
    [importSignal, setImportSignal] = useState(0);
  const [dayScores, setDayScores] = useState<Record<string, number>>({}),
    [dayWordCounts, setDayWordCounts] = useState<Record<string, number>>({});
  const [doneDates, setDoneDates] = useState<Record<string, boolean>>({}),
    [earliestDate, setEarliestDate] = useState<string | null>(null);
  const [daysByDate, setDaysByDate] = useState<Record<string, DayStats>>({});
  const [ignoredReminderKeys, setIgnoredReminderKeys] = useState<Set<string>>(
    () => new Set(),
  );
  const [addBlockRequest, setAddBlockRequest] = useState<{
    id: number;
    start: string;
  } | null>(null);
  const revision = useRef(0),
    requestId = useRef(0),
    savingRef = useRef(false),
    dirtyRef = useRef(false);
  const applyRecord = (r: DayRecord, date: string) => {
    revision.current = r.revision;
    setDay(r.day ?? emptyDay(date));
    setDirty(false);
    dirtyRef.current = false;
    setConflict(false);
    setDataError(null);
  };
  const loadDay = useCallback(async (date: string) => {
    const id = ++requestId.current;
    setLoading(true);
    setDay(null);
    try {
      const record = await fetchDay(date);
      if (id === requestId.current) applyRecord(record, date);
    } catch (e) {
      if (id === requestId.current) setDataError((e as Error).message);
    } finally {
      if (id === requestId.current) setLoading(false);
    }
  }, []);
  const loadContributionData = useCallback(async () => {
    try {
      const rows = await fetchStats();
      const scores: Record<string, number> = {},
        words: Record<string, number> = {},
        dones: Record<string, boolean> = {},
        days: Record<string, DayStats> = {};
      for (const row of rows) {
        scores[row.date] = row.score;
        words[row.date] = row.words;
        dones[row.date] = row.done;
        days[row.date] = row;
      }
      setDayScores(scores);
      setDayWordCounts(words);
      setDoneDates(dones);
      setDaysByDate(days);
      setEarliestDate(rows[0]?.date ?? null);
      setStatsError("");
    } catch (e) {
      setStatsError((e as Error).message);
    }
  }, []);
  useEffect(() => {
    void loadDay(currentDate);
    return () => {
      requestId.current++;
    };
  }, [currentDate, loadDay]);
  useEffect(() => {
    void loadContributionData();
  }, [loadContributionData]);
  useEffect(() => {
    const leave = (e: BeforeUnloadEvent) => {
      if (dirtyRef.current) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", leave);
    return () => window.removeEventListener("beforeunload", leave);
  }, []);
  const persistDay = async (next: Day) => {
    if (savingRef.current || conflict) return;
    savingRef.current = true;
    dirtyRef.current = true;
    setDirty(true);
    setDay(next);
    setSaving(true);
    setDataError(null);
    try {
      const r = await saveDay(next, revision.current);
      revision.current = r.revision;
      dirtyRef.current = false;
      setDirty(false);
      void loadContributionData();
    } catch (e) {
      setConflict(e instanceof ApiError && e.status === 409);
      setDataError((e as Error).message);
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  };
  const mayLeave = () =>
    !savingRef.current &&
    (!dirtyRef.current ||
      confirm(
        "当前内容尚未保存。离开将丢弃页面草稿，建议先下载草稿。是否继续？",
      ));
  const navigate = (date: string) => {
    if (
      !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
      date === currentDate ||
      !mayLeave()
    )
      return;
    dirtyRef.current = false;
    setDirty(false);
    setConflict(false);
    setCurrentDate(date);
  };
  const reload = () => {
    if (!mayLeave()) return;
    dirtyRef.current = false;
    void loadDay(currentDate);
    void loadContributionData();
  };
  const openPanel = (value: typeof panel) => {
    if (savingRef.current || dirtyRef.current) {
      setDataError("请先保存当前草稿，或下载草稿后重新加载，再使用此功能");
      return;
    }
    setPanel(value);
  };
  const isToday = currentDate === todayStr();
  const isLocked = !!day?.done || saving || dirty;
  const reminder =
    !loading && !dirty && day
      ? getBestReminder({
          currentDate,
          today: todayStr(),
          currentDay: day,
          daysByDate,
          ignoredKeys: ignoredReminderKeys,
        })
      : null;
  const totalActiveDays = Object.keys(dayScores).filter(
    (date) =>
      (dayScores[date] ?? 0) > 0 ||
      (dayWordCounts[date] ?? 0) > 0 ||
      !!doneDates[date],
  ).length;
  const totalWords = Object.values(dayWordCounts).reduce(
    (sum, n) => sum + n,
    0,
  );
  const totalYears = earliestDate
    ? new Date().getFullYear() - Number(earliestDate.slice(0, 4)) + 1
    : 0;

  const dismissReminder = (target: Reminder) => {
    setIgnoredReminderKeys((prev) => {
      const next = new Set(prev);
      next.add(target.key);
      return next;
    });
  };

  const currentSlotStart = () => {
    const now = new Date();
    const total = now.getHours() * 60 + now.getMinutes();
    const slot = Math.floor(total / 15) * 15;
    return `${String(Math.floor(slot / 60)).padStart(2, "0")}:${String(slot % 60).padStart(2, "0")}`;
  };

  const handleReminderAction = (target: Reminder) => {
    if (
      target.type === "today_empty" ||
      (target.type === "recent_empty" && target.targetDate === currentDate)
    ) {
      dismissReminder(target);
      setAddBlockRequest({ id: Date.now(), start: currentSlotStart() });
      return;
    }
    if (
      target.type === "recent_unfinished" &&
      target.targetDate === currentDate
    ) {
      dismissReminder(target);
      return;
    }
    navigate(target.targetDate);
  };

  return (
    <div className="app">
      <header className="app-header">
        <h1>LifeTimeline</h1>
        <div className="server-account">
          <span>{user.username}</span>
          <button
            onClick={() => {
              if (mayLeave()) onPassword();
            }}
          >
            修改密码
          </button>
          <button
            onClick={() => {
              if (mayLeave())
                void onLogout().catch((e) => setDataError(e.message));
            }}
          >
            退出
          </button>
        </div>
        <DateSwitcher value={currentDate} onChange={navigate} />
        <div className="header-actions">
          {saving && <span className="saving">保存中…</span>}
        </div>
      </header>

      <div className="app-content">
        <aside className="app-sidebar">
          <ContributionCalendar
            selectedDate={currentDate}
            scores={dayScores}
            doneDates={doneDates}
            totalActiveDays={totalActiveDays}
            totalWords={totalWords}
            totalYears={totalYears}
            onOpenStats={() => setStatsOpen(true)}
            onSelectDate={navigate}
            weeksToShow={12}
          />

          <div className="sidebar-actions">
            <button
              className="sidebar-action-btn"
              onClick={() => openPanel("imports")}
            >
              JSON 导入 / 导出
            </button>
            <button
              className="sidebar-action-btn"
              disabled={!day}
              onClick={() => openPanel("history")}
            >
              历史版本
            </button>
            {user.role === "admin" && (
              <button
                className="sidebar-action-btn"
                onClick={() => openPanel("admin")}
              >
                用户管理
              </button>
            )}
            <button
              type="button"
              className="sidebar-action-btn"
              onClick={() => setCopySignal((v) => v + 1)}
            >
              <BookCopy size={16} strokeWidth={2.2} />
              <span>
                {copyStatus === "ok"
                  ? "已复制"
                  : copyStatus === "fail"
                    ? "复制失败"
                    : "复制到备忘录"}
              </span>
            </button>
            <button
              type="button"
              className="sidebar-action-btn"
              onClick={() => setExportSignal((v) => v + 1)}
            >
              <FileOutput size={16} strokeWidth={2.2} />
              <span>导出为文件</span>
            </button>
            <button
              type="button"
              className="sidebar-action-btn"
              onClick={() => setImportSignal((v) => v + 1)}
              disabled={isLocked}
            >
              <Inbox size={16} strokeWidth={2.2} />
              <span>导入笔记</span>
            </button>
          </div>
        </aside>

        <main className="app-main">
          {dataError && (
            <div className="data-error-banner" role="alert">
              <span>
                {dataError}
                {dirty ? "；未保存内容仍保留在页面中。" : ""}
              </span>
              <div className="draft-actions">
                {dirty && day && (
                  <button
                    onClick={() =>
                      download(
                        new Blob([JSON.stringify(day, null, 2)], {
                          type: "application/json",
                        }),
                        `${day.date}.json`,
                      )
                    }
                  >
                    下载草稿
                  </button>
                )}
                {dirty && !conflict && day && (
                  <button
                    disabled={saving}
                    onClick={() => void persistDay(day)}
                  >
                    重试保存
                  </button>
                )}
                <button disabled={saving} onClick={reload}>
                  重新加载
                </button>
              </div>
            </div>
          )}
          {statsError && (
            <div role="alert">
              统计加载失败：{statsError}
              <button onClick={() => void loadContributionData()}>
                重试统计
              </button>
            </div>
          )}
          {loading ? (
            <p className="loading">加载中…</p>
          ) : day ? (
            <>
              {reminder && (
                <div className="reminder-banner" role="status">
                  <span>{reminder.message}</span>
                  <div className="reminder-actions">
                    <button
                      type="button"
                      className="reminder-primary"
                      onClick={() => handleReminderAction(reminder)}
                    >
                      {reminder.actionLabel}
                    </button>
                    <button
                      type="button"
                      className="reminder-secondary"
                      onClick={() => dismissReminder(reminder)}
                    >
                      忽略
                    </button>
                  </div>
                </div>
              )}
              <DayView
                key={day.date}
                day={day}
                isToday={isToday}
                readOnly={saving || dirty}
                onUpdate={persistDay}
                copySignal={copySignal}
                exportSignal={exportSignal}
                importSignal={importSignal}
                addBlockRequest={addBlockRequest}
                onCopyResult={(ok) => {
                  setCopyStatus(ok ? "ok" : "fail");
                  setTimeout(() => setCopyStatus("idle"), 1800);
                }}
              />
            </>
          ) : null}
        </main>
      </div>

      {panel === "imports" && (
        <ImportPanel
          user={user}
          close={() => setPanel(null)}
          onDone={() => {
            void loadDay(currentDate);
            void loadContributionData();
          }}
        />
      )}
      {panel === "admin" && (
        <AdminPanel user={user} close={() => setPanel(null)} />
      )}
      {panel === "history" && (
        <HistoryPanel
          date={currentDate}
          revision={revision.current}
          close={() => setPanel(null)}
          onRestore={(r) => {
            applyRecord(r, currentDate);
            void loadContributionData();
          }}
        />
      )}
      <DiaryStatsModal
        selectedDate={currentDate}
        scores={dayScores}
        wordCounts={dayWordCounts}
        doneDates={doneDates}
        onSelectDate={navigate}
        open={statsOpen}
        onOpenChange={setStatsOpen}
        showTrigger={false}
      />
    </div>
  );
}

export default App;
