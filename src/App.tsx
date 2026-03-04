import { useState, useEffect, useCallback } from 'react'
import { todayStr } from './utils'
import { fetchDay, saveDay } from './api'
import type { Day } from './types'
import { DayView } from './DayView'
import { DateSwitcher } from './DateSwitcher'
import { QuickNote } from './QuickNote'
import { MediaUpload } from './MediaUpload'
import './App.css'

function emptyDay(date: string): Day {
  return {
    date,
    blocks: [],
    media: [],
  }
}

function App() {
  const [currentDate, setCurrentDate] = useState(todayStr)
  const [day, setDay] = useState<Day | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

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

  useEffect(() => {
    loadDay(currentDate)
  }, [currentDate, loadDay])

  const persistDay = useCallback(async (next: Day) => {
    setDay(next)
    setSaving(true)
    try {
      await saveDay(next)
    } catch (e) {
      console.error(e)
    } finally {
      setSaving(false)
    }
  }, [])

  const isToday = currentDate === todayStr()

  return (
    <div className="app">
      <header className="app-header">
        <h1>LifeTimeline</h1>
        <DateSwitcher
          value={currentDate}
          onChange={setCurrentDate}
        />
        <div className="header-actions">
          <QuickNote
            currentDate={currentDate}
            day={day}
            onSave={persistDay}
            disabled={loading}
          />
          <MediaUpload
            currentDate={currentDate}
            day={day}
            onSave={persistDay}
            disabled={loading}
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
