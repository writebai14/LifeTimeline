import { useState, useEffect, useCallback } from 'react'
import { activeCoverageMinutes, todayStr } from './utils'
import { fetchDay, fetchDayList, saveDay } from './api'
import type { Day } from './types'
import { getBestReminder, type Reminder } from './reminders'
import { DayView } from './DayView'
import { DateSwitcher } from './DateSwitcher'
import { MediaUpload } from './MediaUpload'
import { ContributionCalendar } from './ContributionCalendar'
import { DiaryStatsModal } from './DiaryStatsModal'
import { BookCopy, FileOutput, Inbox, Upload } from 'lucide-react'
import './App.css'

function emptyDay(date: string): Day {
  return {
    date,
    blocks: [],
    media: [],
    done: false,
  }
}

function countTextChars(input?: string): number {
  if (!input) return 0
  return input.replace(/\s+/g, '').length
}

function dayWordCount(day: Day): number {
  const blockText = day.blocks.reduce(
    (sum, b) => sum + countTextChars(b.summary) + countTextChars(b.note) + countTextChars(b.location) + countTextChars(b.moodOrWeather),
    0
  )
  const taskText = day.taskSection
    ? countTextChars(day.taskSection.todayTasks) + countTextChars(day.taskSection.tomorrowGoals) + countTextChars(day.taskSection.weekTasks)
    : 0
  const summaryText = day.summary
    ? countTextChars(day.summary.completed) + countTextChars(day.summary.notCompleted) + countTextChars(day.summary.exceeded)
    : 0
  return blockText + taskText + summaryText
}

function App() {
  const [currentDate, setCurrentDate] = useState(todayStr)
  const [day, setDay] = useState<Day | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [statsOpen, setStatsOpen] = useState(false)
  const [dataError, setDataError] = useState<string | null>(null)
  const [copyStatus, setCopyStatus] = useState<'idle' | 'ok' | 'fail'>('idle')
  const [copySignal, setCopySignal] = useState(0)
  const [exportSignal, setExportSignal] = useState(0)
  const [importSignal, setImportSignal] = useState(0)
  const [dayScores, setDayScores] = useState<Record<string, number>>({})
  const [dayWordCounts, setDayWordCounts] = useState<Record<string, number>>({})
  const [doneDates, setDoneDates] = useState<Record<string, boolean>>({})
  const [earliestDate, setEarliestDate] = useState<string | null>(null)
  const [daysByDate, setDaysByDate] = useState<Record<string, Day | null>>({})
  const [ignoredReminderKeys, setIgnoredReminderKeys] = useState<Set<string>>(() => new Set())
  const [addBlockRequest, setAddBlockRequest] = useState<{ id: number; start: string } | null>(null)

  const loadDay = useCallback(async (date: string) => {
    setLoading(true)
    try {
      const data = await fetchDay(date)
      setDay(data ?? emptyDay(date))
      setDataError(null)
    } catch (e) {
      console.error(e)
      setDataError(e instanceof Error ? e.message : '本地数据服务连接失败')
      setDay(emptyDay(date))
    } finally {
      setLoading(false)
    }
  }, [])

  const loadContributionData = useCallback(async () => {
    try {
      const dates = await fetchDayList()
      if (!dates.length) {
        setDayScores({})
        setDayWordCounts({})
        setDoneDates({})
        setDaysByDate({})
        setEarliestDate(null)
        return
      }
      setEarliestDate(dates[0] ?? null)
      const data = await Promise.all(
        dates.map(async (date) => {
          try {
            return await fetchDay(date)
          } catch {
            return null
          }
        })
      )
      const scores: Record<string, number> = {}
      const words: Record<string, number> = {}
      const dones: Record<string, boolean> = {}
      const nextDaysByDate: Record<string, Day | null> = {}
      for (const item of data) {
        if (!item) continue
        nextDaysByDate[item.date] = item
        scores[item.date] = activeCoverageMinutes(item.blocks)
        words[item.date] = dayWordCount(item)
        if (item.done) dones[item.date] = true
      }
      setDayScores(scores)
      setDayWordCounts(words)
      setDoneDates(dones)
      setDaysByDate(nextDaysByDate)
      setDataError(null)
    } catch (e) {
      console.error('加载日记统计数据失败:', e)
      setDataError(e instanceof Error ? e.message : '本地数据服务连接失败')
    }
  }, [])

  useEffect(() => {
    loadDay(currentDate)
  }, [currentDate, loadDay])

  useEffect(() => {
    loadContributionData()
  }, [loadContributionData])

  const persistDay = useCallback(async (next: Day) => {
    setDay(next)
    setSaving(true)
    try {
      await saveDay(next)
      setDataError(null)
      setDayScores((prev) => ({ ...prev, [next.date]: activeCoverageMinutes(next.blocks) }))
      setDayWordCounts((prev) => ({ ...prev, [next.date]: dayWordCount(next) }))
      setDoneDates((prev) => ({ ...prev, [next.date]: !!next.done }))
      setDaysByDate((prev) => ({ ...prev, [next.date]: next }))
    } catch (e) {
      console.error(e)
      setDataError(e instanceof Error ? e.message : '保存失败，请检查本地数据服务')
    } finally {
      setSaving(false)
    }
  }, [])

  const isToday = currentDate === todayStr()
  const isLocked = !!day?.done
  const reminder = !loading && day
    ? getBestReminder({
        currentDate,
        today: todayStr(),
        currentDay: day,
        daysByDate,
        ignoredKeys: ignoredReminderKeys,
      })
    : null
  const totalActiveDays = Object.keys(dayScores).filter((date) => (dayScores[date] ?? 0) > 0 || (dayWordCounts[date] ?? 0) > 0 || !!doneDates[date]).length
  const totalWords = Object.values(dayWordCounts).reduce((sum, n) => sum + n, 0)
  const totalYears = earliestDate ? new Date().getFullYear() - Number(earliestDate.slice(0, 4)) + 1 : 0

  const dismissReminder = (target: Reminder) => {
    setIgnoredReminderKeys((prev) => {
      const next = new Set(prev)
      next.add(target.key)
      return next
    })
  }

  const currentSlotStart = () => {
    const now = new Date()
    const total = now.getHours() * 60 + now.getMinutes()
    const slot = Math.floor(total / 15) * 15
    return `${String(Math.floor(slot / 60)).padStart(2, '0')}:${String(slot % 60).padStart(2, '0')}`
  }

  const handleReminderAction = (target: Reminder) => {
    if (target.type === 'today_empty' || (target.type === 'recent_empty' && target.targetDate === currentDate)) {
      dismissReminder(target)
      setAddBlockRequest({ id: Date.now(), start: currentSlotStart() })
      return
    }
    if (target.type === 'recent_unfinished' && target.targetDate === currentDate) {
      dismissReminder(target)
      return
    }
    setCurrentDate(target.targetDate)
  }

  return (
    <div className="app">
      <header className="app-header">
        <h1>LifeTimeline</h1>
        <DateSwitcher
          value={currentDate}
          onChange={setCurrentDate}
        />
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
            onSelectDate={setCurrentDate}
            weeksToShow={12}
          />

          <div className="sidebar-actions">
            <button
              type="button"
              className="sidebar-action-btn"
              onClick={() => setCopySignal((v) => v + 1)}
            >
              <BookCopy size={16} strokeWidth={2.2} />
              <span>
                {copyStatus === 'ok' ? '已复制' : copyStatus === 'fail' ? '复制失败' : '复制到备忘录'}
              </span>
            </button>
            <button type="button" className="sidebar-action-btn" onClick={() => setExportSignal((v) => v + 1)}>
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
            <MediaUpload
              currentDate={currentDate}
              day={day}
              onSave={persistDay}
              disabled={loading || isLocked}
              compact
              icon={<Upload size={16} strokeWidth={2.2} />}
            />
          </div>
        </aside>

        <main className="app-main">
          {loading ? (
            <p className="loading">加载中…</p>
          ) : day ? (
            <>
              {dataError && (
                <div className="data-error-banner" role="alert">
                  <span>本地数据服务暂时连不上，当前页面可能显示为空。请确认 API 服务已启动后刷新页面。</span>
                  <button
                    type="button"
                    onClick={() => {
                      setDataError(null)
                      loadDay(currentDate)
                      loadContributionData()
                    }}
                  >
                    重试
                  </button>
                </div>
              )}
              {reminder && (
                <div className="reminder-banner" role="status">
                  <span>{reminder.message}</span>
                  <div className="reminder-actions">
                    <button type="button" className="reminder-primary" onClick={() => handleReminderAction(reminder)}>
                      {reminder.actionLabel}
                    </button>
                    <button type="button" className="reminder-secondary" onClick={() => dismissReminder(reminder)}>
                      忽略
                    </button>
                  </div>
                </div>
              )}
              <DayView
                key={day.date}
                day={day}
                isToday={isToday}
                onUpdate={persistDay}
                copySignal={copySignal}
                exportSignal={exportSignal}
                importSignal={importSignal}
                addBlockRequest={addBlockRequest}
                onCopyResult={(ok) => {
                  setCopyStatus(ok ? 'ok' : 'fail')
                  setTimeout(() => setCopyStatus('idle'), 1800)
                }}
              />
            </>
          ) : null}
        </main>
      </div>

      <DiaryStatsModal
        selectedDate={currentDate}
        scores={dayScores}
        wordCounts={dayWordCounts}
        doneDates={doneDates}
        onSelectDate={setCurrentDate}
        open={statsOpen}
        onOpenChange={setStatsOpen}
        showTrigger={false}
      />
    </div>
  )
}

export default App
