import { useState, useRef } from 'react'
import { dayOfWeek, timeStr, blockPosition5to5, timelineTotalHeight, TIMELINE_PIXELS_PER_HOUR, ratioToTimeSlot } from './utils'
import { mediaUrl, deleteMedia } from './api'
import { formatDayExport, formatDayForClipboard, parseDayImport } from './exportDay'
import type { Day, Block, Media } from './types'
import { CATEGORY_COLORS } from './constants'
import { BlockEditor } from './BlockEditor'
import './DayView.css'

interface Props {
  day: Day
  isToday: boolean
  onUpdate: (day: Day) => void
}

export function DayView({ day, isToday, onUpdate }: Props) {
  const [editingBlock, setEditingBlock] = useState<Block | null>(null)
  const [addingAt, setAddingAt] = useState<string | undefined>(undefined)
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null)
  const [copyStatus, setCopyStatus] = useState<'idle' | 'ok' | 'fail'>('idle')
  const [importOpen, setImportOpen] = useState(false)
  const [importText, setImportText] = useState('')
  const [importError, setImportError] = useState<string | null>(null)
  const trackRef = useRef<HTMLDivElement>(null)
  const allMediaSorted = [...day.media].sort((a, b) => new Date(a.capturedAt).getTime() - new Date(b.capturedAt).getTime())
  const blocksSorted = [...day.blocks].sort((a, b) => a.start.localeCompare(b.start))
  const trackHeight = timelineTotalHeight()

  const handleTrackDoubleClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const t = e.target as HTMLElement
    if (t !== e.currentTarget && !t.classList?.contains('empty-hint')) return
    const el = trackRef.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    const ratio = (e.clientY - rect.top) / rect.height
    const start = ratioToTimeSlot(ratio)
    setAddingAt(start)
  }

  const handleSaveBlock = (b: Block) => {
    const exists = day.blocks.some((x) => x.id === b.id)
    const nextBlocks = exists
      ? day.blocks.map((x) => (x.id === b.id ? b : x))
      : [...day.blocks, b]
    nextBlocks.sort((a, c) => a.start.localeCompare(c.start))
    onUpdate({ ...day, blocks: nextBlocks })
    setEditingBlock(null)
    setAddingAt(undefined)
  }

  const handleDeleteBlock = (id: string) => {
    if (!confirm('确定删除这条记录？')) return
    onUpdate({
      ...day,
      blocks: day.blocks.filter((b) => b.id !== id),
    })
    setEditingBlock(null)
  }

  const handleCopyToMemo = async () => {
    try {
      await navigator.clipboard.writeText(formatDayForClipboard(day))
      setCopyStatus('ok')
      setTimeout(() => setCopyStatus('idle'), 2000)
    } catch {
      setCopyStatus('fail')
      setTimeout(() => setCopyStatus('idle'), 2000)
    }
  }

  const handleExportFile = () => {
    const text = formatDayExport(day)
    const blob = new Blob([text], { type: 'text/plain;charset=utf-8' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `LifeTimeline-${day.date}.txt`
    a.click()
    URL.revokeObjectURL(a.href)
  }

  const handleImport = () => {
    setImportError(null)
    try {
      const parsed = parseDayImport(importText, day.date)
      // 快捷指令时间戳导入：与当日已有块合并，不覆盖；其余格式仍为用解析结果覆盖 blocks
      const mergedBlocks =
        parsed.fromShortcut && parsed.blocks.length > 0
          ? [...day.blocks, ...parsed.blocks].sort((a, b) => a.start.localeCompare(b.start))
          : parsed.blocks.length > 0
            ? parsed.blocks
            : day.blocks
      const nextDay: Day = {
        ...day,
        taskSection: parsed.taskSection ?? day.taskSection,
        summary: parsed.summary ?? day.summary,
        blocks: mergedBlocks,
      }
      onUpdate(nextDay)
      setImportOpen(false)
      setImportText('')
    } catch (e) {
      setImportError(e instanceof Error ? e.message : '解析失败，请确认格式与导出一致')
    }
  }

  const handleDeleteMedia = async (m: Media) => {
    const nextDay: Day = {
      ...day,
      media: day.media.filter((x) => x.id !== m.id),
      blocks: day.blocks.map((b) => ({
        ...b,
        linkedMediaIds: (b.linkedMediaIds || []).filter((id) => id !== m.id),
      })),
    }
    onUpdate(nextDay)
    try {
      await deleteMedia(m.filePath)
    } catch (e) {
      console.error('删除文件失败，已从记录中移除：', e)
    }
  }

  /** 刻度顺序：5:00～24:00～4:00（每日 5 点起，凌晨后置） */
  const renderRulerHours = () =>
    Array.from({ length: 24 }, (_, i) => {
      const hour = (5 + i) % 24
      return (
        <div key={i} className="ruler-hour" style={{ height: TIMELINE_PIXELS_PER_HOUR }}>
          <span className="ruler-label">{String(hour).padStart(2, '0')}:00</span>
        </div>
      )
    })

  return (
    <div className="day-view">
      <div className="day-view-header">
        <span className="day-title">{day.date} {day.dayOfWeek ?? dayOfWeek(day.date)}</span>
        {isToday && <span className="today-badge">今天</span>}
        <div className="day-header-actions">
          <button type="button" className="btn-export" onClick={handleCopyToMemo} title="复制到剪贴板后粘贴到 Apple 备忘录">
            {copyStatus === 'ok' ? '已复制' : copyStatus === 'fail' ? '复制失败' : '复制到备忘录'}
          </button>
          <button type="button" className="btn-export" onClick={handleExportFile}>导出为文件</button>
          <button type="button" className="btn-export" onClick={() => { setImportOpen(true); setImportText(''); setImportError(null); }}>导入</button>
          <button
            type="button"
            className="btn-add-block"
            onClick={() => setAddingAt(isToday ? timeStr(new Date()) : '00:00')}
          >
            + 添加时间块
          </button>
        </div>
      </div>

      <div className="day-view-body">
        {/* 左侧：时间轴 */}
        <div className="day-view-left">
          <div className="timeline-section">
            <div className="timeline-ruler" style={{ height: trackHeight }}>
              {renderRulerHours()}
            </div>
            <div
              ref={trackRef}
              className="timeline-track"
              style={{ height: trackHeight }}
              onDoubleClick={handleTrackDoubleClick}
            >
              {blocksSorted.length === 0 && !addingAt && (
                <p className="empty-hint">暂无记录，点击「添加时间块」或使用「一句话」快速记录</p>
              )}
              {blocksSorted.map((b) => {
                const { top, height } = blockPosition5to5(b.start, b.end)
                const categoryColor = b.category ? CATEGORY_COLORS[b.category] : undefined
                return (
                  <div
                    key={b.id}
                    className={`block-card ${b.category ? 'has-category' : ''}`}
                    data-category={b.category}
                    style={{
                      top: `${top}%`,
                      height: `${height}%`,
                      ...(categoryColor
                        ? {
                            ['--cat-color' as string]: `${categoryColor}`,
                            ['--cat-border' as string]: `${categoryColor}bb`,
                            ['--cat-bg' as string]: `${categoryColor}2e`,
                          }
                        : {}),
                    }}
                    onClick={() => setEditingBlock(b)}
                  >
                    <div className="block-time">
                      {b.start} – {b.end}
                      {b.category && <span className="block-category">【{b.category}】</span>}
                    </div>
                    <div className="block-summary">{b.summary}</div>
                    {b.location && <div className="block-meta">📍 {b.location}</div>}
                    <button
                      type="button"
                      className="block-delete"
                      onClick={(e) => { e.stopPropagation(); handleDeleteBlock(b.id); }}
                      aria-label="删除"
                    >
                      删除
                    </button>
                  </div>
                )
              })}
            </div>
          </div>
        </div>

        {/* 右侧：照片纵向按拍摄时间排布 */}
        <div className="day-view-right">
          <h4 className="day-view-right-title">当日照片</h4>
          {allMediaSorted.length === 0 ? (
            <p className="day-view-right-empty">暂无附件</p>
          ) : (
            <div className="day-view-photos">
              {allMediaSorted.map((m) => (
                <div key={m.id} className="photo-row">
                  <img
                    src={mediaUrl(m.filePath)}
                    alt=""
                    className="photo-row-thumb"
                    onClick={() => setLightboxUrl(mediaUrl(m.filePath))}
                  />
                  <div className="photo-row-info">
                    <span className="photo-row-time">
                      {new Date(m.capturedAt).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                    </span>
                    <div className="photo-row-actions">
                      <a href={mediaUrl(m.filePath)} download={m.filePath} className="btn-attachment">下载</a>
                      <button type="button" className="btn-attachment btn-delete" onClick={() => handleDeleteMedia(m)}>删除</button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {lightboxUrl && (
        <div className="media-lightbox" onClick={() => setLightboxUrl(null)}>
          <img src={lightboxUrl} alt="" />
        </div>
      )}

      {importOpen && (
        <div className="import-overlay" onClick={() => setImportOpen(false)}>
          <div className="import-modal" onClick={e => e.stopPropagation()}>
            <h3>导入当日笔记</h3>
            <p className="import-hint">粘贴与导出格式一致的文本，或快捷指令时间戳（如 2026-03-01 15:00 ｜描述，将按时间间隔自动合成时间块）</p>
            <textarea
              className="import-textarea"
              value={importText}
              onChange={e => setImportText(e.target.value)}
              placeholder="12月18日（周一）&#10;&#10;今日任务：…&#10;9:00-10:00【工作】 开会&#10;…"
              rows={12}
            />
            {importError && <p className="import-error">{importError}</p>}
            <div className="import-actions">
              <button type="button" onClick={() => setImportOpen(false)}>取消</button>
              <button type="button" onClick={handleImport}>导入</button>
            </div>
          </div>
        </div>
      )}

      {(editingBlock || addingAt) && (
        <BlockEditor
          block={editingBlock ?? null}
          defaultStart={addingAt}
          onSave={handleSaveBlock}
          onCancel={() => {
            setEditingBlock(null)
            setAddingAt(undefined)
          }}
        />
      )}
    </div>
  )
}
