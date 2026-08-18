import type { Day } from './types'

export type ReminderType = 'today_empty' | 'yesterday_unfinished' | 'recent_empty' | 'recent_unfinished'

export interface Reminder {
  key: string
  type: ReminderType
  targetDate: string
  message: string
  actionLabel: string
}

const RECENT_DAYS = 7

function hasText(value?: string): boolean {
  return !!value?.trim()
}

export function hasMeaningfulRecord(day?: Day | null): boolean {
  if (!day) return false
  return (
    day.blocks.length > 0 ||
    hasText(day.taskSection?.todayTasks) ||
    hasText(day.taskSection?.tomorrowGoals) ||
    hasText(day.taskSection?.weekTasks) ||
    hasText(day.summary?.completed) ||
    hasText(day.summary?.notCompleted) ||
    hasText(day.summary?.exceeded) ||
    !!day.done
  )
}

function addDays(date: string, delta: number): string {
  const d = new Date(`${date}T12:00:00`)
  d.setDate(d.getDate() + delta)
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0')
}

function formatShortDate(date: string): string {
  const [, month, day] = date.split('-').map(Number)
  return `${month}月${day}日`
}

function recentDates(today: string): string[] {
  return Array.from({ length: RECENT_DAYS }, (_, i) => addDays(today, -(i + 1)))
}

function earliestMeaningfulDate(daysByDate: Record<string, Day | null>): string | null {
  return Object.values(daysByDate)
    .filter(hasMeaningfulRecord)
    .map((day) => day!.date)
    .sort()[0] ?? null
}

function makeReminder(type: ReminderType, targetDate: string, message: string, actionLabel: string): Reminder {
  return {
    key: `${type}:${targetDate}`,
    type,
    targetDate,
    message,
    actionLabel,
  }
}

export function getBestReminder(params: {
  currentDate: string
  today: string
  currentDay: Day | null
  daysByDate: Record<string, Day | null>
  ignoredKeys: Set<string>
}): Reminder | null {
  const { currentDate, today, currentDay, daysByDate, ignoredKeys } = params
  const dayMap = { ...daysByDate, [currentDate]: currentDay }
  const yesterday = addDays(today, -1)
  const yesterdayDay = dayMap[yesterday] ?? null

  const todayCandidate = makeReminder(
    'today_empty',
    today,
    '今天还没有留下记录，要从现在开始记一条吗？',
    '新建记录'
  )
  if (currentDate === today && !hasMeaningfulRecord(currentDay) && !ignoredKeys.has(todayCandidate.key)) {
    return todayCandidate
  }

  const yesterdayCandidate = makeReminder(
    'yesterday_unfinished',
    yesterday,
    '昨天的记录还没有收尾，要回去看一眼吗？',
    '查看昨天'
  )
  if (
    currentDate !== yesterday &&
    hasMeaningfulRecord(yesterdayDay) &&
    !yesterdayDay?.done &&
    !ignoredKeys.has(yesterdayCandidate.key)
  ) {
    return yesterdayCandidate
  }

  const earliest = earliestMeaningfulDate(dayMap)
  if (!earliest) return null

  const dates = recentDates(today).filter((date) => date >= earliest)
  const meaningfulDates = dates.filter((date) => hasMeaningfulRecord(dayMap[date] ?? null))
  const activeEnoughForGapReminder = meaningfulDates.length >= 2

  if (activeEnoughForGapReminder) {
    const emptyDates = dates.filter((date) => !hasMeaningfulRecord(dayMap[date] ?? null))
    const target = emptyDates[0]
    if (target) {
      const count = emptyDates.length
      const isCurrentTarget = target === currentDate
      const candidate = makeReminder(
        'recent_empty',
        target,
        isCurrentTarget
          ? '这一天还没有留下记录，可以从一个大概时间段开始。'
          : count === 1
          ? '最近有一天还没有留下记录，要补看一下吗？'
          : `最近有 ${count} 天还没有留下记录，可以从最近一天补起。`,
        isCurrentTarget ? '新建记录' : `查看 ${formatShortDate(target)}`
      )
      if (!ignoredKeys.has(candidate.key)) return candidate
    }
  }

  const unfinishedDates = dates.filter((date) => {
    if (date === yesterday) return false
    const item = dayMap[date] ?? null
    return hasMeaningfulRecord(item) && !item?.done
  })
  const unfinishedTarget = unfinishedDates[0]
  if (unfinishedTarget) {
    const count = unfinishedDates.length
    const isCurrentTarget = unfinishedTarget === currentDate
    const candidate = makeReminder(
      'recent_unfinished',
      unfinishedTarget,
      isCurrentTarget
        ? '这一天还没有标记完成，确认整理好了可以点“完成”。'
        : count === 1
        ? '最近有一天记录还没收尾，要回去整理一下吗？'
        : `最近有 ${count} 天记录还没收尾，可以挑最近一天看一眼。`,
      isCurrentTarget ? '知道了' : `查看 ${formatShortDate(unfinishedTarget)}`
    )
    if (!ignoredKeys.has(candidate.key)) return candidate
  }

  return null
}
