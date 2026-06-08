import { useEffect, useMemo, useRef, useState } from 'react'
import { Check, X } from 'lucide-react'
import { ACTIVE_DAY_TOTAL_MINUTES } from './utils'

interface Props {
  selectedDate: string
  scores: Record<string, number>
  wordCounts?: Record<string, number>
  doneDates?: Record<string, boolean>
  onSelectDate: (date: string) => void
  open?: boolean
  onOpenChange?: (open: boolean) => void
  showTrigger?: boolean
}

interface DayCell {
  dateKey: string
  day: number
  score: number
  words: number
  isDone: boolean
  hasRecord: boolean
}

interface MonthCardData {
  month: number
  days: DayCell[]
  leading: number
  trailing: number
  activeDays: number
  wordCount: number
}

const WEEKDAY_LABELS = ['一', '二', '三', '四', '五', '六', '日']
const MONTH_LABELS = ['01 月', '02 月', '03 月', '04 月', '05 月', '06 月', '07 月', '08 月', '09 月', '10 月', '11 月', '12 月']
const HEAT_LEVEL_CLASSES = [
  'bg-slate-200/75 border-slate-300/80',
  'bg-emerald-100 border-emerald-200',
  'bg-emerald-300 border-emerald-400',
  'bg-emerald-500 border-emerald-600',
]

function scoreToLevel(score: number): number {
  if (score <= 0) return 0
  const ratio = Math.min(score / ACTIVE_DAY_TOTAL_MINUTES, 1)
  if (ratio <= 0.25) return 1
  if (ratio <= 0.55) return 2
  return 3
}

function daysInMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate()
}

function getMondayFirstOffset(year: number, month: number): number {
  const jsWeekday = new Date(year, month, 1).getDay()
  return (jsWeekday + 6) % 7
}

export function DiaryStatsModal({
  selectedDate,
  scores,
  wordCounts = {},
  doneDates = {},
  onSelectDate,
  open,
  onOpenChange,
  showTrigger = true,
}: Props) {
  const [innerOpen, setInnerOpen] = useState(false)
  const [hoverText, setHoverText] = useState<string>('')
  const wrapRef = useRef<HTMLDivElement>(null)
  const visible = open ?? innerOpen
  const setVisible = (next: boolean) => {
    if (onOpenChange) onOpenChange(next)
    else setInnerOpen(next)
  }

  useEffect(() => {
    if (!visible) return
    const onEsc = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setVisible(false)
    }
    window.addEventListener('keydown', onEsc)
    return () => window.removeEventListener('keydown', onEsc)
  }, [visible])

  const selectedYear = Number(selectedDate.slice(0, 4))
  const current = new Date()
  const currentYear = current.getFullYear()
  const currentMonth = current.getMonth()
  const maxMonth = selectedYear === currentYear ? currentMonth : 11
  const formatCoverage = (minutes: number): string => {
    const hours = minutes / 60
    return Number.isInteger(hours) ? `${hours}小时` : `${hours.toFixed(1)}小时`
  }

  const monthCards = useMemo(() => {
    const cards: MonthCardData[] = []
    for (let month = maxMonth; month >= 0; month--) {
      const totalDays = daysInMonth(selectedYear, month)
      const leading = getMondayFirstOffset(selectedYear, month)
      const days: DayCell[] = []
      let activeDays = 0
      let monthWordCount = 0

      for (let day = 1; day <= totalDays; day++) {
        const dateKey = `${selectedYear}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
        const words = wordCounts[dateKey] ?? 0
        const score = scores[dateKey] ?? 0
        const isDone = !!doneDates[dateKey]
        const hasRecord = score > 0 || words > 0 || isDone
        if (hasRecord) activeDays += 1
        monthWordCount += words
        days.push({ dateKey, day, score, words, isDone, hasRecord })
      }

      const gridCount = leading + totalDays
      const trailing = (7 - (gridCount % 7)) % 7
      cards.push({ month, days, leading, trailing, activeDays, wordCount: monthWordCount })
    }
    return cards
  }, [selectedYear, maxMonth, scores, wordCounts, doneDates])

  const totalActiveDays = useMemo(() => monthCards.reduce((sum, m) => sum + m.activeDays, 0), [monthCards])
  const totalWords = useMemo(() => monthCards.reduce((sum, m) => sum + m.wordCount, 0), [monthCards])

  return (
    <div className="relative" ref={wrapRef}>
      {showTrigger && (
        <button
          type="button"
          className={`inline-flex h-9 items-center gap-2 rounded-md border border-emerald-800/60 px-3 text-emerald-100 transition ${
            visible ? 'bg-slate-900' : 'bg-slate-900/70 hover:bg-slate-900'
          }`}
          onClick={() => setVisible(true)}
          aria-expanded={visible}
          aria-label="打开日记统计"
        >
          <span className="text-xs text-emerald-200">日记统计</span>
        </button>
      )}

      {visible && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 px-4 py-6"
          onClick={(e) => {
            if (e.target === e.currentTarget) setVisible(false)
          }}
        >
          <section className="flex h-[min(90vh,860px)] w-[min(96vw,1280px)] flex-col rounded-xl border border-emerald-800/40 bg-slate-950/95 p-5 text-slate-100 shadow-2xl backdrop-blur-sm">
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <h3 className="m-0 text-base font-semibold text-emerald-200">日记统计</h3>
                <p className="m-0 text-xs text-slate-400">{selectedYear} 年 · {totalActiveDays} 记录天数 · {totalWords} 字数</p>
              </div>
              <button
                type="button"
                onClick={() => setVisible(false)}
                className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-slate-700 text-slate-300 hover:bg-slate-900"
                aria-label="关闭日记统计"
              >
                <X size={16} />
              </button>
            </div>

            <div className="mb-2 min-h-6 rounded-md bg-black/30 px-3 py-1 text-xs text-slate-300">
              {hoverText || '将鼠标悬停到日期方块查看详情'}
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto pr-1">
              <div className="grid grid-cols-1 gap-4 pb-1 md:grid-cols-2 xl:grid-cols-3">
                {monthCards.map((month) => (
                  <article key={month.month} className="rounded-lg border border-slate-800 bg-slate-900/60 p-3">
                    <div className="mb-2 flex items-center justify-between">
                      <h4 className="m-0 text-2xl font-bold tracking-wide text-slate-100">{MONTH_LABELS[month.month]}</h4>
                      <div className="text-right text-[11px] text-slate-400">
                        <div>{month.wordCount} 字数</div>
                        <div>{month.activeDays} 记录天数</div>
                      </div>
                    </div>

                    <div className="mb-1 grid grid-cols-7 gap-1">
                      {WEEKDAY_LABELS.map((w) => (
                        <span key={w} className="text-center text-[10px] text-slate-500">{w}</span>
                      ))}
                    </div>

                    <div className="grid grid-cols-7 gap-1">
                      {Array.from({ length: month.leading }).map((_, idx) => (
                        <span key={`lead-${idx}`} className="h-8 rounded-md bg-transparent" aria-hidden />
                      ))}

                      {month.days.map((cell) => {
                        const isSelected = selectedDate === cell.dateKey
                        const level = scoreToLevel(cell.score)
                        const coveragePercent = Math.min(100, Math.round((cell.score / ACTIVE_DAY_TOTAL_MINUTES) * 100))
                        return (
                          <button
                            key={cell.dateKey}
                            type="button"
                            className={[
                              'relative h-8 rounded-md border text-xs font-medium transition',
                              cell.isDone
                                ? 'bg-[#fde047] border-yellow-300 text-slate-900 shadow-[0_0_8px_rgba(253,224,71,0.45)]'
                                : cell.hasRecord
                                  ? `${HEAT_LEVEL_CLASSES[level]} text-slate-900`
                                  : 'bg-slate-200/35 border-slate-300/50 text-slate-500',
                              isSelected ? 'outline outline-2 outline-emerald-300 outline-offset-1' : 'hover:scale-[1.04]',
                            ].join(' ')}
                            title={`${cell.dateKey} · ${cell.words} 字 · 已记录 ${formatCoverage(cell.score)} / 18小时 · ${coveragePercent}%${cell.isDone ? ' · 已完成' : ''}`}
                            onMouseEnter={() => {
                              setHoverText(`${cell.dateKey}：${cell.words} 字 · 已记录 ${formatCoverage(cell.score)} / 18小时 · 覆盖率 ${coveragePercent}%${cell.isDone ? ' · 已完成 ✅' : ''}`)
                            }}
                            onMouseLeave={() => setHoverText('')}
                            onFocus={() => {
                              setHoverText(`${cell.dateKey}：${cell.words} 字 · 已记录 ${formatCoverage(cell.score)} / 18小时 · 覆盖率 ${coveragePercent}%${cell.isDone ? ' · 已完成 ✅' : ''}`)
                            }}
                            onBlur={() => setHoverText('')}
                            onClick={() => {
                              onSelectDate(cell.dateKey)
                              setVisible(false)
                            }}
                            aria-label={`${cell.dateKey} ${cell.words}字${cell.isDone ? ' 已完成' : ''}`}
                          >
                            {cell.day}
                            {cell.isDone && (
                              <span className="absolute -right-1 -top-1 inline-flex h-4 w-4 items-center justify-center rounded-full bg-yellow-200 text-slate-900">
                                <Check size={10} strokeWidth={3} />
                              </span>
                            )}
                          </button>
                        )
                      })}

                      {Array.from({ length: month.trailing }).map((_, idx) => (
                        <span key={`tail-${idx}`} className="h-8 rounded-md bg-transparent" aria-hidden />
                      ))}
                    </div>
                  </article>
                ))}
              </div>
            </div>
          </section>
        </div>
      )}
    </div>
  )
}
