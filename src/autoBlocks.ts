import { addMinutes } from './utils'
import { generateId } from './utils'
import type { Block, Media } from './types'

/**
 * 按 15 分钟槽将「未关联」的媒体分组，为每个槽生成一个时间块并关联媒体。
 * 只处理当日媒体；若某槽已有块则合并媒体到该块。
 */
export function buildBlocksFromMedia(
  dateStr: string,
  media: Media[],
  existingBlocks: Block[]
): { blocks: Block[]; media: Media[] } {
  const pending = media.filter((m) => !m.linkedBlockId)
  if (pending.length === 0) return { blocks: existingBlocks, media }

  const slotToMedia = new Map<string, Media[]>()
  for (const m of pending) {
    const d = new Date(m.capturedAt)
    const [y2, m2, d2] = dateStr.split('-').map(Number)
    if (d.getFullYear() !== y2 || d.getMonth() + 1 !== m2 || d.getDate() !== d2) continue
    const totalM = d.getHours() * 60 + d.getMinutes()
    const slotM = Math.floor(totalM / 15) * 15
    const slotKey = String(slotM)
    if (!slotToMedia.has(slotKey)) slotToMedia.set(slotKey, [])
    slotToMedia.get(slotKey)!.push(m)
  }

  const processedStarts = new Set<string>()
  const newBlocks: Block[] = []

  for (const [slotM, arr] of slotToMedia) {
    const minutes = Number(slotM)
    const h = Math.floor(minutes / 60)
    const min = minutes % 60
    const start = String(h).padStart(2, '0') + ':' + String(min).padStart(2, '0')
    const end = addMinutes(start, 15)
    processedStarts.add(start)
    const existing = existingBlocks.find((b) => b.start === start && b.end === end)
    const mediaIds = arr.map((x) => x.id)
    if (existing) {
      newBlocks.push({
        ...existing,
        linkedMediaIds: [...new Set([...existing.linkedMediaIds, ...mediaIds])],
        summary: existing.summary || (arr.length > 1 ? `照片 × ${arr.length}` : '照片'),
      })
    } else {
      newBlocks.push({
        id: generateId(),
        start,
        end,
        summary: arr.length > 1 ? `照片 × ${arr.length}` : '照片',
        linkedMediaIds: mediaIds,
        source: 'from_media',
      })
    }
  }

  const otherBlocks = existingBlocks.filter((b) => !processedStarts.has(b.start))
  const resultBlocks = [...otherBlocks, ...newBlocks].sort((a, b) => a.start.localeCompare(b.start))

  const updatedMedia = media.map((m) => {
    for (const b of newBlocks) {
      if (b.linkedMediaIds.includes(m.id)) return { ...m, linkedBlockId: b.id }
    }
    return m
  })

  return { blocks: resultBlocks, media: updatedMedia }
}
