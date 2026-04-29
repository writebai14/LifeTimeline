import { useState, useEffect, useCallback } from 'react'
import { todayStr } from './utils'
import { fetchDay, fetchDayList, saveDay } from './api'
import type { Day } from './types'
import { DayView } from './DayView'
import { DateSwitcher } from './DateSwitcher'
import { MediaUpload } from './MediaUpload'
import { ContributionCalendar } from './ContributionCalendar'
import { DiaryStatsModal } from './DiaryStatsModal'
import './App.css'

function emptyDay(date: string): Day {
  return {
    date,
    blocks: [],
    media: [],
    done: false,
  }
}

function dayRichnessScore(day: Day): number {
  const blockScore = day.blocks.length * 2
  const mediaScore = day.media.length * 1.5
  const taskScore = day.taskSection
    ? [day.taskSection.todayTasks, day.taskSection.tomorrowGoals, day.taskSection.weekTasks].filter(Boolean).length * 1.2
    : 0
  const summaryScore = day.summary
    ? [day.summary.completed, day.summary.notCompleted, day.summary.exceeded].filter(Boolean).length * 1.2
    : 0
  return blockScore + mediaScore + taskScore + summaryScore
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
  const [dayScores, setDayScores] = useState<Record<string, number>>({})
  const [dayWordCounts, setDayWordCounts] = useState<Record<string, number>>({})
  const [doneDates, setDoneDates] = useState<Record<string, boolean>>({})

  const loadDay = useCallback(async (date: string) => {
    setLoading(true)
    try {
      const data = await fetchDay(date)
      setDay(data ?? emptyDay(date))
    } catch (e) {
      console.error(e)
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
        return
      }
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
      for (const item of data) {
        if (!item) continue
        scores[item.date] = dayRichnessScore(item)
        words[item.date] = dayWordCount(item)
        if (item.done) dones[item.date] = true
      }
      setDayScores(scores)
      setDayWordCounts(words)
      setDoneDates(dones)
    } catch (e) {
      console.error('加载日记统计数据失败:', e)
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
      setDayScores((prev) => ({ ...prev, [next.date]: dayRichnessScore(next) }))
      setDayWordCounts((prev) => ({ ...prev, [next.date]: dayWordCount(next) }))
      setDoneDates((prev) => ({ ...prev, [next.date]: !!next.done }))
    } catch (e) {
      console.error(e)
    } finally {
      setSaving(false)
    }
  }, [])

  const isToday = currentDate === todayStr()
  const isLocked = !!day?.done

  return (
    <div className="app">
      <header className="app-header">
        <h1>LifeTimeline</h1>
        <DateSwitcher
          value={currentDate}
          onChange={setCurrentDate}
        />
        <div className="header-actions">
          <ContributionCalendar
            selectedDate={currentDate}
            scores={dayScores}
            doneDates={doneDates}
            onSelectDate={setCurrentDate}
            weeksToShow={52}
          />
          <DiaryStatsModal
            selectedDate={currentDate}
            scores={dayScores}
            wordCounts={dayWordCounts}
            doneDates={doneDates}
            onSelectDate={setCurrentDate}
          />
          <MediaUpload
            currentDate={currentDate}
            day={day}
            onSave={persistDay}
            disabled={loading || isLocked}
          />
          {saving && <span className="saving">保存中…</span>}
        </div>
      </header>

      <main className="app-main">
        {loading ? (
          <p className="loading">加载中…</p>
        ) : day ? (
          <DayView
            key={day.date}
            day={day}
            isToday={isToday}
            onUpdate={persistDay}
          />
        ) : null}
      </main>
    </div>
  )
}

export default App
