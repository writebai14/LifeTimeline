import { useState, useEffect } from 'react'
import { CATEGORY_PRESETS, DEFAULT_BLOCK_MINUTES } from './constants'
import { addMinutes } from './utils'
import type { Block } from './types'
import './BlockEditor.css'

interface Props {
  block: Block | null
  defaultStart?: string
  onSave: (b: Block) => void
  onCancel: () => void
}

export function BlockEditor({ block, defaultStart, onSave, onCancel }: Props) {
  const isNew = !block
  const [start, setStart] = useState(block?.start ?? defaultStart ?? '09:00')
  const [end, setEnd] = useState(block?.end ?? addMinutes(start, DEFAULT_BLOCK_MINUTES))
  const [summary, setSummary] = useState(block?.summary ?? '')
  const [category, setCategory] = useState(block?.category ?? '')
  const [location, setLocation] = useState(block?.location ?? '')

  useEffect(() => {
    if (isNew && defaultStart) {
      setStart(defaultStart)
      setEnd(addMinutes(defaultStart, DEFAULT_BLOCK_MINUTES))
    }
  }, [isNew, defaultStart])

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!summary.trim()) return
    onSave({
      id: block?.id ?? 'b' + Date.now(),
      start,
      end,
      summary: summary.trim(),
      category: category.trim() || undefined,
      location: location.trim() || undefined,
      linkedMediaIds: block?.linkedMediaIds ?? [],
      source: block?.source,
    })
  }

  return (
    <div className="block-editor-overlay" onClick={onCancel}>
      <form className="block-editor" onClick={e => e.stopPropagation()} onSubmit={submit}>
        <h3>{isNew ? '新建时间块' : '编辑时间块'}</h3>
        <div className="field">
          <label>开始</label>
          <input type="time" value={start} onChange={e => setStart(e.target.value)} step="900" />
        </div>
        <div className="field">
          <label>结束</label>
          <input type="time" value={end} onChange={e => setEnd(e.target.value)} step="900" />
        </div>
        <div className="field">
          <label>描述 *</label>
          <input
            type="text"
            placeholder="如：驾车通勤、开会；可写备注、情绪天气等"
            value={summary}
            onChange={e => setSummary(e.target.value)}
            required
          />
        </div>
        <div className="field">
          <label>分类</label>
          <div className="category-buttons">
            {CATEGORY_PRESETS.map(c => (
              <button
                key={c}
                type="button"
                className={`category-btn ${category === c ? 'active' : ''}`}
                onClick={() => setCategory(category === c ? '' : c)}
              >
                {c}
              </button>
            ))}
          </div>
        </div>
        <div className="field">
          <label>地点</label>
          <input
            type="text"
            placeholder="如：公司"
            value={location}
            onChange={e => setLocation(e.target.value)}
          />
        </div>
        <div className="actions">
          <button type="button" onClick={onCancel}>取消</button>
          <button type="submit">保存</button>
        </div>
      </form>
    </div>
  )
}
