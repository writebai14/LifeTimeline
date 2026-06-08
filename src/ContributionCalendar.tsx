import { useMemo } from 'react'
import { Check } from 'lucide-react'
import { ACTIVE_DAY_TOTAL_MINUTES } from './utils'

interface Props {
  selectedDate: string
  scores: Record<string, number>
  doneDates?: Record<string, boolean>
  totalActiveDays: number
  totalWords: number
  totalYears: number
  onOpenStats: () => void
  onSelectDate: (date: string) => void
  weeksToShow?: number
}

const LEVEL_CLASSES = [
  'bg-[#F1F1F1] border-[#E8E8E8]',
  'bg-emerald-100 border-emerald-200',
  'bg-emerald-300 border-emerald-400',
  'bg-emerald-500 border-emerald-600',
]
const WEEKDAY_LABELS = ['一', '二', '三', '四', '五', '六', '日']
const MONTH_LABELS = ['1月', '2月', '3月', '4月', '5月', '6月', '7月', '8月', '9月', '10月', '11月', '12月']

function toDateString(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function scoreToLevel(score: number): number {
  if (score <= 0) return 0
  const ratio = Math.min(score / ACTIVE_DAY_TOTAL_MINUTES, 1)
  if (ratio <= 0.25) return 1
  if (ratio <= 0.55) return 2
  return 3
}

function addDays(input: Date, delta: number): Date {
  const d = new Date(input)
  d.setDate(d.getDate() + delta)
  return d
}

export function ContributionCalendar({
  selectedDate,
  scores,
  doneDates = {},
  totalActiveDays,
  totalWords,
  totalYears,
  onOpenStats,
  onSelectDate,
  weeksToShow = 12,
}: Props) {
  const formatWordCount = (value: number): string => {
    if (value < 1000) return String(value)
    return `${Math.round(value / 1000)}K`
  }
  const formatCoverage = (minutes: number): string => {
    const hours = minutes / 60
    return Number.isInteger(hours) ? `${hours}小时` : `${hours.toFixed(1)}小时`
  }

  const { weeks, monthMarkers, gentleHint } = useMemo(() => {
    const today = new Date()
    today.setHours(0, 0, 0, 0)

    // 周一到周日：先找到本周周一，再向前回溯指定周数
    const currentWeekdayMondayFirst = (today.getDay() + 6) % 7 // 周一=0 ... 周日=6
    const thisMonday = addDays(today, -currentWeekdayMondayFirst)
    const start = addDays(thisMonday, -((weeksToShow - 1) * 7))
    const allDays: Date[] = Array.from({ length: weeksToShow * 7 }, (_, i) => addDays(start, i))

    const cols: Date[][] = []
    for (let i = 0; i < allDays.length; i += 7) cols.push(allDays.slice(i, i + 7))

    const monthAtCol: string[] = cols.map((col, i) => {
      if (i === 0) return MONTH_LABELS[col[0].getMonth()]
      const firstOfMonth = col.find((d) => d.getDate() === 1)
      return firstOfMonth ? MONTH_LABELS[firstOfMonth.getMonth()] : ''
    })

    const recent14 = Array.from({ length: 14 }, (_, i) => addDays(today, -i))
    const recentActive = recent14.filter((d) => {
      const k = toDateString(d)
      return (scores[k] ?? 0) > 0 || !!doneDates[k]
    }).length
    const gentle =
      recentActive <= 3
        ? '最近记录有点稀疏，今天随手记一条就很好。'
        : recentActive <= 7
          ? '最近记录节奏不错，继续保持轻量更新。'
          : '近期记录很稳定，保持现在的节奏即可。'

    return {
      weeks: cols,
      monthMarkers: monthAtCol,
      gentleHint: gentle,
    }
  }, [scores, doneDates, weeksToShow])

  return (
    <section className="text-slate-100" aria-label="近期记录热力图">
      <div className="mb-4 flex gap-1.5">
        <div className="w-5 shrink-0" aria-hidden />
        <div className="min-w-0 flex-1 grid grid-cols-3 gap-14">
          {[
            { value: totalActiveDays, label: '天' },
            { value: formatWordCount(totalWords), label: '字数' },
            { value: totalYears, label: '年' },
          ].map((item, idx) => (
            <button
              key={item.label}
              type="button"
              onClick={onOpenStats}
              className={`group min-w-0 w-full px-1 ${
                idx === 0 ? 'text-left' : idx === 1 ? 'text-center' : 'text-right'
              }`}
              aria-label={`打开日记统计：${item.label}`}
            >
              <div className="truncate tabular-nums text-[38px] font-semibold leading-none tracking-tight text-[#AAABAB] transition-colors group-hover:text-[#2F3131]">
                {item.value}
              </div>
              <div className="mt-2 text-[14px] leading-none text-[#AAABAB] transition-colors group-hover:text-[#2F3131]">
                {item.label}
              </div>
            </button>
          ))}
        </div>
      </div>

      <div className="mb-5 flex gap-1.5" aria-hidden>
        <div className="w-5 shrink-0" />
        <div className="h-px flex-1 bg-[#EEF1F4]" />
      </div>

      <div className="relative">
        <div className="mb-2 flex gap-1.5">
          <div className="w-5 shrink-0" aria-hidden />
          <div className="min-w-0 flex-1 grid gap-[6px]" style={{ gridTemplateColumns: `repeat(${weeks.length}, minmax(0, 1fr))` }}>
            {monthMarkers.map((label, idx) => (
              <span key={`${label}-${idx}`} className="text-[10px] text-slate-500">
                {label}
              </span>
            ))}
          </div>
        </div>
        <div className="flex gap-1.5">
          <div className="grid w-5 shrink-0 grid-rows-7 gap-y-[9px] pt-[1px]">
            {WEEKDAY_LABELS.map((d, idx) => (
              <span key={d} className={`h-3 text-[10px] leading-3 text-right ${idx % 2 === 0 ? 'text-slate-400' : 'text-transparent'}`}>
                {idx % 2 === 0 ? d : '·'}
              </span>
            ))}
          </div>

          <div className="grid min-w-0 flex-1 gap-x-[6px] gap-y-[9px]" style={{ gridTemplateColumns: `repeat(${weeks.length}, minmax(0, 1fr))` }}>
            {weeks.map((col, colIdx) => (
              <div key={colIdx} className="grid grid-rows-7 gap-y-[9px]">
                {col.map((d) => {
                  const dateKey = toDateString(d)
                  const score = scores[dateKey] ?? 0
                  const level = scoreToLevel(score)
                  const isSelected = selectedDate === dateKey
                  const isDone = !!doneDates[dateKey]
                  const coveragePercent = Math.min(100, Math.round((score / ACTIVE_DAY_TOTAL_MINUTES) * 100))
                  return (
                    <button
                      key={dateKey}
                      type="button"
                      className={[
                        'relative mx-auto flex h-[23px] w-[23px] items-center justify-center border transition',
                        isDone
                          ? 'rounded-full bg-[#fde047] shadow-[0_0_6px_rgba(253,224,71,0.6)] border-yellow-300/80'
                          : `rounded-sm ${LEVEL_CLASSES[level]}`,
                        isSelected ? 'outline outline-1 outline-emerald-300 outline-offset-1' : 'hover:scale-110',
                      ].join(' ')}
                      onClick={() => onSelectDate(dateKey)}
                      aria-label={`${dateKey} 已记录 ${formatCoverage(score)} / 18小时，覆盖率 ${coveragePercent}%${isDone ? ' 已完成目标' : ''}`}
                    >
                      {isDone && <Check size={8} strokeWidth={3} className="text-slate-900" />}
                    </button>
                  )
                })}
              </div>
            ))}
          </div>
        </div>
      </div>

      <p className="mt-3 text-xs text-slate-400">{gentleHint}</p>

    </section>
  )
}
