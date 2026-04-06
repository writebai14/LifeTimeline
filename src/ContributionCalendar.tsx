import { useEffect, useMemo, useRef, useState } from 'react'
import { Check } from 'lucide-react'

interface Props {
  selectedDate: string
  scores: Record<string, number>
  doneDates?: Record<string, boolean>
  onSelectDate: (date: string) => void
  weeksToShow?: number
}

interface HoverCell {
  dateKey: string
  score: number
  isDone: boolean
}

const LEVEL_CLASSES = [
  'bg-slate-800/50',
  'bg-emerald-900/40',
  'bg-emerald-700/60',
  'bg-emerald-500',
  'bg-emerald-400',
]
const WEEKDAY_LABELS = ['日', '一', '二', '三', '四', '五', '六']
const MONTH_LABELS = ['1月', '2月', '3月', '4月', '5月', '6月', '7月', '8月', '9月', '10月', '11月', '12月']

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

export function ContributionCalendar({ selectedDate, scores, doneDates = {}, onSelectDate, weeksToShow = 52 }: Props) {
  const [open, setOpen] = useState(false)
  const [hoverCell, setHoverCell] = useState<HoverCell | null>(null)
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

  const { weeks, thresholds, rangeText, triggerDays, monthMarkers } = useMemo(() => {
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
    const monthAtCol: string[] = []
    for (let i = 0; i < cols.length; i++) {
      const firstDay = cols[i][0]
      if (i === 0 || firstDay.getMonth() !== cols[i - 1][0].getMonth()) {
        monthAtCol.push(MONTH_LABELS[firstDay.getMonth()])
      } else {
        monthAtCol.push('')
      }
    }

    return {
      weeks: cols,
      thresholds: scoreThresholds(scores),
      rangeText: range,
      triggerDays: trigger,
      monthMarkers: monthAtCol,
    }
  }, [scores, weeksToShow])

  return (
    <div className="relative" ref={wrapRef}>
      <button
        type="button"
        className={`inline-flex h-9 items-center gap-2 rounded-md border border-emerald-800/60 px-3 text-emerald-100 transition ${
          open ? 'bg-slate-900' : 'bg-slate-900/70 hover:bg-slate-900'
        }`}
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-label="查看最近活跃度格子图"
      >
        <span className="text-xs text-emerald-200">活跃度</span>
        <span className="inline-flex gap-[2px]" aria-hidden="true">
          {triggerDays.map((d) => {
            const dateKey = toDateString(d)
            const score = scores[dateKey] ?? 0
            const level = scoreToLevel(score, thresholds)
            return (
              <span
                key={dateKey}
                className={`h-2 w-2 rounded-sm border border-slate-700 ${LEVEL_CLASSES[level]}`}
              />
            )
          })}
        </span>
      </button>

      {open && (
        <section
          className="absolute right-0 top-11 z-30 w-[min(96vw,980px)] rounded-xl border border-emerald-800/40 bg-slate-950/95 p-4 text-slate-100 shadow-2xl backdrop-blur-sm"
          aria-label="最近活跃度格子图"
        >
          <div className="mb-3 flex items-end justify-between gap-3">
            <div>
              <h3 className="m-0 text-sm font-semibold text-emerald-200">最近 {weeksToShow} 周活跃度</h3>
              <p className="m-0 text-xs text-slate-400">{rangeText}</p>
            </div>
            <p className="m-0 text-xs text-slate-400">GitHub 风格热力图 · 完成态亮黄标记</p>
          </div>

          <div className="relative overflow-x-auto pb-2">
            {hoverCell && (
              <div className="pointer-events-none absolute -top-1 left-1/2 z-40 -translate-x-1/2 -translate-y-full rounded-md bg-black/75 px-3 py-1 text-xs text-slate-100 shadow-lg">
                {hoverCell.dateKey}：{hoverCell.isDone ? '已完成目标 ✅ ' : ''}{Math.max(0, Math.round(hoverCell.score))} Commits
              </div>
            )}
            <div className="mb-1 ml-7 grid gap-[3px]" style={{ gridTemplateColumns: `repeat(${weeks.length}, minmax(0, 1fr))` }}>
              {monthMarkers.map((label, idx) => (
                <span key={`${label}-${idx}`} className="text-[10px] text-slate-500">
                  {label}
                </span>
              ))}
            </div>
            <div className="flex min-w-[860px] gap-2 md:min-w-[940px]">
              <div className="grid grid-rows-7 gap-[3px] pt-[2px]">
                {WEEKDAY_LABELS.map((d, idx) => (
                  <span key={d} className={`h-3 text-[10px] leading-3 text-right ${idx % 2 === 1 ? 'text-slate-400' : 'text-transparent'}`}>
                    {idx % 2 === 1 ? d : '·'}
                  </span>
                ))}
              </div>

              <div className="grid gap-[3px]" style={{ gridTemplateColumns: `repeat(${weeks.length}, minmax(0, 1fr))` }}>
                {weeks.map((col, colIdx) => (
                  <div key={colIdx} className="grid grid-rows-7 gap-[3px]">
                    {col.map((d) => {
                      const dateKey = toDateString(d)
                      const score = scores[dateKey] ?? 0
                      const level = scoreToLevel(score, thresholds)
                      const isSelected = selectedDate === dateKey
                      const isDone = !!doneDates[dateKey]
                      return (
                        <button
                          key={dateKey}
                          type="button"
                          className={[
                            'relative flex h-3 w-3 items-center justify-center border border-slate-700/60 transition',
                            'md:h-[14px] md:w-[14px]',
                            isDone
                              ? 'rounded-full bg-[#fde047] shadow-[0_0_8px_rgba(253,224,71,0.6)] border-yellow-300/80'
                              : `rounded-sm ${LEVEL_CLASSES[level]}`,
                            isSelected ? 'outline outline-2 outline-emerald-300 outline-offset-1' : 'hover:scale-110',
                          ].join(' ')}
                          title={`${dateKey} · 丰富度 ${score.toFixed(1)}${isDone ? ' · 已完成✅' : ''}`}
                          onMouseEnter={() => setHoverCell({ dateKey, score, isDone })}
                          onMouseLeave={() => setHoverCell(null)}
                          onFocus={() => setHoverCell({ dateKey, score, isDone })}
                          onBlur={() => setHoverCell(null)}
                          onClick={() => {
                            onSelectDate(dateKey)
                            setOpen(false)
                          }}
                          aria-label={`${dateKey} 丰富度 ${score.toFixed(1)}${isDone ? ' 已完成目标' : ''}`}
                        >
                          {isDone && <Check size={8} strokeWidth={3} className="text-slate-900 md:h-[9px] md:w-[9px]" />}
                        </button>
                      )
                    })}
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="mt-2 flex items-center justify-end gap-2 text-[11px] text-slate-400">
            <span>Less</span>
            {LEVEL_CLASSES.map((cellClass, idx) => (
              <span
                key={idx}
                className={`inline-block h-3 w-3 rounded-sm border border-slate-700 ${cellClass}`}
              />
            ))}
            <span>More</span>
            <span className="mx-1 text-slate-600">|</span>
            <span className="inline-flex items-center gap-1">
              <span className="inline-flex h-3 w-3 items-center justify-center rounded-full bg-[#fde047] shadow-[0_0_8px_rgba(253,224,71,0.6)]">
                <Check size={8} strokeWidth={3} className="text-slate-900" />
              </span>
              已完成
            </span>
          </div>
        </section>
      )}
    </div>
  )
}
