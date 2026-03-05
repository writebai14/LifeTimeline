import { useEffect, useMemo, useRef, useState } from 'react'

interface Props {
  selectedDate: string
  scores: Record<string, number>
  onSelectDate: (date: string) => void
  weeksToShow?: number
}

const LEVEL_COLORS = ['#eef2f7', '#d4e7ff', '#94c2ff', '#4b93f2', '#1f6feb']
const WEEKDAY_LABELS = ['日', '一', '二', '三', '四', '五', '六']

function toDateString(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function addDays(input: Date, delta: number): Date {
  const d = new Date(input)
  d.setDate(d.getDate() + delta)
  return d
}

function scoreThresholds(scores: Record<string, number>): [number, number, number] {
  const values = Object.values(scores).filter((x) => x > 0).sort((a, b) => a - b)
  if (values.length === 0) return [1, 2, 3]
  const pick = (p: number) => values[Math.floor((values.length - 1) * p)]
  const t1 = pick(0.25)
  const t2 = Math.max(t1 + 0.001, pick(0.5))
  const t3 = Math.max(t2 + 0.001, pick(0.75))
  return [t1, t2, t3]
}

function scoreToLevel(score: number, thresholds: [number, number, number]): number {
  if (score <= 0) return 0
  if (score <= thresholds[0]) return 1
  if (score <= thresholds[1]) return 2
  if (score <= thresholds[2]) return 3
  return 4
}

export function ContributionCalendar({ selectedDate, scores, onSelectDate, weeksToShow = 14 }: Props) {
  const [open, setOpen] = useState(false)
  const wrapRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onPointerDown = (event: PointerEvent) => {
      if (!wrapRef.current?.contains(event.target as Node)) setOpen(false)
    }
    const onEsc = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }
    window.addEventListener('pointerdown', onPointerDown)
    window.addEventListener('keydown', onEsc)
    return () => {
      window.removeEventListener('pointerdown', onPointerDown)
      window.removeEventListener('keydown', onEsc)
    }
  }, [open])

  const { weeks, thresholds, rangeText, triggerDays } = useMemo(() => {
    const today = new Date()
    today.setHours(0, 0, 0, 0)

    const daysToShow = weeksToShow * 7
    const start = addDays(today, -(daysToShow - 1))
    start.setDate(start.getDate() - start.getDay())

    const end = new Date(today)
    end.setDate(end.getDate() + (6 - end.getDay()))

    const allDays: Date[] = []
    for (let d = new Date(start); d <= end; d = addDays(d, 1)) allDays.push(new Date(d))

    const cols: Date[][] = []
    for (let i = 0; i < allDays.length; i += 7) cols.push(allDays.slice(i, i + 7))

    const first = cols[0]?.[0]
    const last = cols[cols.length - 1]?.[6]
    const range = first && last ? `${first.getMonth() + 1}/${first.getDate()} - ${last.getMonth() + 1}/${last.getDate()}` : ''

    const trigger = Array.from({ length: 10 }, (_, i) => addDays(today, -(9 - i)))

    return { weeks: cols, thresholds: scoreThresholds(scores), rangeText: range, triggerDays: trigger }
  }, [scores, weeksToShow])

  return (
    <div className="contrib-inline" ref={wrapRef}>
      <button
        type="button"
        className={`contrib-trigger ${open ? 'open' : ''}`}
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-label="查看最近活跃度格子图"
      >
        <span className="contrib-trigger-label">活跃度</span>
        <span className="contrib-trigger-preview" aria-hidden="true">
          {triggerDays.map((d) => {
            const dateKey = toDateString(d)
            const score = scores[dateKey] ?? 0
            const level = scoreToLevel(score, thresholds)
            return <span key={dateKey} className="mini-cell" style={{ backgroundColor: LEVEL_COLORS[level] }} />
          })}
        </span>
      </button>

      {open && (
        <section className="contrib-popover" aria-label="最近活跃度格子图">
          <div className="contrib-head">
            <h3>最近 {weeksToShow} 周活跃度</h3>
            <p>{rangeText}</p>
          </div>

          <div className="contrib-main">
            <div className="contrib-weekdays">
              {WEEKDAY_LABELS.map((d, idx) => (
                <span key={d} className={idx % 2 === 1 ? 'show' : ''}>
                  {idx % 2 === 1 ? d : ''}
                </span>
              ))}
            </div>

            <div className="contrib-weeks">
              {weeks.map((col, colIdx) => (
                <div key={colIdx} className="contrib-week-col">
                  {col.map((d) => {
                    const dateKey = toDateString(d)
                    const score = scores[dateKey] ?? 0
                    const level = scoreToLevel(score, thresholds)
                    const isSelected = selectedDate === dateKey
                    return (
                      <button
                        key={dateKey}
                        type="button"
                        className={`contrib-cell level-${level} ${isSelected ? 'selected' : ''}`}
                        style={{ backgroundColor: LEVEL_COLORS[level] }}
                        title={`${dateKey} · 丰富度 ${score.toFixed(1)}`}
                        onClick={() => {
                          onSelectDate(dateKey)
                          setOpen(false)
                        }}
                        aria-label={`${dateKey} 丰富度 ${score.toFixed(1)}`}
                      />
                    )
                  })}
                </div>
              ))}
            </div>
          </div>

          <div className="contrib-legend">
            <span>空白</span>
            {LEVEL_COLORS.map((c, idx) => (
              <span key={idx} className="legend-box" style={{ backgroundColor: c }} />
            ))}
            <span>丰富</span>
          </div>
        </section>
      )}
    </div>
  )
}
