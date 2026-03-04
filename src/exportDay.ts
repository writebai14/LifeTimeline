import type { Day, Block, TaskSection, DaySummary } from './types'
import { generateId, addMinutes } from './utils'
import { DEFAULT_BLOCK_MINUTES } from './constants'

const WEEKDAY = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']

function weekDay(day: Day): string {
  return day.dayOfWeek ?? WEEKDAY[new Date(day.date + 'T12:00:00').getDay()]
}

function dateTitle(date: string): string {
  const [, m, d] = date.split('-')
  const mon = parseInt(m, 10)
  const dayNum = parseInt(d, 10)
  return `${mon}月${dayNum}日`
}


/**
 * 将当日数据格式化为可粘贴到 Apple 备忘录的纯文本（与用户提供的 12 月 18 日格式一致）
 */
export function formatDayExport(day: Day): string {
  const lines: string[] = []
  const w = weekDay(day)
  lines.push(`${dateTitle(day.date)}（${w}）`)
  lines.push('')

  if (day.taskSection?.todayTasks || day.taskSection?.tomorrowGoals || day.taskSection?.weekTasks) {
    if (day.taskSection.todayTasks) lines.push(`今日任务：${day.taskSection.todayTasks}`)
    if (day.taskSection.tomorrowGoals) lines.push(`明日目标：${day.taskSection.tomorrowGoals}`)
    if (day.taskSection.weekTasks) lines.push(`本周任务：${day.taskSection.weekTasks}`)
    lines.push('')
  }

  const blocks = [...day.blocks].sort((a, b) => a.start.localeCompare(b.start))
  for (const b of blocks) {
    let line = `${b.start}-${b.end}`
    if (b.category) line += `【${b.category}】`
    line += ` ${b.summary}`
    if (b.location) line += `；📍${b.location}`
    if (b.moodOrWeather) line += ` ${b.moodOrWeather}`
    lines.push(line)
    if (b.note) lines.push(`  ${b.note}`)
  }

  if (day.summary?.completed || day.summary?.notCompleted || day.summary?.exceeded) {
    lines.push('')
    if (day.summary.completed) lines.push(`今日完成：${day.summary.completed}`)
    if (day.summary.notCompleted) lines.push(`未完成：${day.summary.notCompleted}`)
    if (day.summary.exceeded) lines.push(`超额完成：${day.summary.exceeded}`)
  }

  return lines.join('\n')
}

/** 复制到剪贴板用，与 formatDayExport 相同 */
export function formatDayForClipboard(day: Day): string {
  return formatDayExport(day)
}

/** 时间块行：9:00-10:00【工作】 开会；📍公司 或 09:00-10:00 开会 */
const BLOCK_LINE = /^(\d{1,2}):(\d{2})-(\d{1,2}):(\d{2})(?:【([^】]+)】)?\s*(.*)$/

/** 快捷指令时间戳行：2026-03-01 15:00 ｜聊天测试系统（支持全角｜与半角|） */
const SHORTCUT_TIMESTAMP_LINE = /^\s*(\d{4})-(\d{2})-(\d{2})\s+(\d{1,2}):(\d{2})\s*[｜|]\s*(.*)$/

/**
 * 解析「快捷指令速记」时间戳文本，按相邻时间戳间隔合成时间块。
 * 每条为「日期 时间 ｜ 描述」，表示「到该时刻为止」刚结束的那段时间的总结（过去式）。
 * 第一条的区间取「该时刻 - 15 分钟」到「该时刻」；后续每条为「上一时刻」到「该时刻」。
 * 仅处理与 dateStr 匹配的日期行。
 */
export function parseShortcutTimestampLines(text: string, dateStr: string): Block[] | null {
  const lines = text.split(/\r?\n/)
  const entries: { time: string; summary: string }[] = []
  for (const line of lines) {
    const m = line.match(SHORTCUT_TIMESTAMP_LINE)
    if (!m) continue
    const [, y, mo, d, hour, min, summary] = m
    const lineDate = `${y}-${mo}-${d}`
    if (lineDate !== dateStr) continue
    const time = `${hour.padStart(2, '0')}:${min}`
    entries.push({ time, summary: (summary || '').trim() })
  }
  if (entries.length === 0) return null
  entries.sort((a, b) => a.time.localeCompare(b.time))
  const blocks: Block[] = []
  for (let i = 0; i < entries.length; i++) {
    const end = entries[i].time
    const start =
      i === 0 ? addMinutes(end, -DEFAULT_BLOCK_MINUTES) : entries[i - 1].time
    blocks.push({
      id: generateId(),
      start,
      end,
      summary: entries[i].summary || end,
      linkedMediaIds: [],
      source: 'manual',
    })
  }
  return blocks
}

/**
 * 解析导出的单日文本，得到可合并到当日的 taskSection、blocks、summary。
 * 与 formatDayExport 格式一致，支持粘贴后导入。
 * 若传入 dateStr 且文本为「快捷指令时间戳」格式（YYYY-MM-DD HH:MM ｜描述），会先按时间戳合成时间块。
 * 返回 fromShortcut 表示本次解析出的是快捷指令时间戳块，导入时应与当日已有块合并而非覆盖。
 */
export function parseDayImport(text: string, dateStr?: string): {
  taskSection?: TaskSection
  blocks: Block[]
  summary?: DaySummary
  fromShortcut?: boolean
} {
  const lines = text.split(/\r?\n/)
  const result: {
    taskSection?: TaskSection
    blocks: Block[]
    summary?: DaySummary
    fromShortcut?: boolean
  } = { blocks: [] }
  let taskSection: TaskSection = {}
  let summary: DaySummary = {}
  let i = 0

  // 若传入日期且文本为快捷指令时间戳格式，优先按时间戳合成时间块（与当日已有数据合并，不覆盖）
  if (dateStr) {
    const shortcutBlocks = parseShortcutTimestampLines(text, dateStr)
    if (shortcutBlocks && shortcutBlocks.length > 0) {
      result.blocks = shortcutBlocks
      result.fromShortcut = true
    }
  }
  const useShortcutBlocks = result.blocks.length > 0

  while (i < lines.length) {
    const line = lines[i]
    const trimmed = line.trim()

    if (trimmed.startsWith('今日任务：')) {
      taskSection.todayTasks = trimmed.slice(5).trim()
      i++
      continue
    }
    if (trimmed.startsWith('明日目标：')) {
      taskSection.tomorrowGoals = trimmed.slice(5).trim()
      i++
      continue
    }
    if (trimmed.startsWith('本周任务：')) {
      taskSection.weekTasks = trimmed.slice(5).trim()
      i++
      continue
    }
    if (trimmed.startsWith('今日完成：')) {
      summary.completed = trimmed.slice(5).trim()
      i++
      continue
    }
    if (trimmed.startsWith('未完成：')) {
      summary.notCompleted = trimmed.slice(4).trim()
      i++
      continue
    }
    if (trimmed.startsWith('超额完成：')) {
      summary.exceeded = trimmed.slice(5).trim()
      i++
      continue
    }

    const blockMatch = !useShortcutBlocks && trimmed.match(BLOCK_LINE)
    if (blockMatch) {
      const [, sh, sm, eh, em, category, rest] = blockMatch
      const start = `${sh!.padStart(2, '0')}:${sm}`
      const end = `${eh!.padStart(2, '0')}:${em}`
      let summaryText = (rest || '').trim()
      let location: string | undefined
      const locMatch = summaryText.match(/；📍(.+)$/)
      if (locMatch) {
        location = locMatch[1].trim()
        summaryText = summaryText.slice(0, summaryText.length - locMatch[0].length).replace(/；$/, '').trim()
      }
      const block: Block = {
        id: generateId(),
        start,
        end,
        summary: summaryText || start,
        category: category?.trim() || undefined,
        location: location || undefined,
        linkedMediaIds: [],
      }
      result.blocks.push(block)
      i++
      const nextLine = lines[i]
      if (nextLine?.startsWith('  ') && !nextLine.trim().startsWith('今日') && !nextLine.trim().startsWith('未完成') && !nextLine.trim().startsWith('超额')) {
        block.note = nextLine.trim()
        i++
      }
      continue
    }

    i++
  }

  if (Object.keys(taskSection).length > 0) result.taskSection = taskSection
  if (Object.keys(summary).length > 0) result.summary = summary
  return result
}
