import { useState } from 'react'
import { timeStr, addMinutes, generateId } from './utils'
import { DEFAULT_BLOCK_MINUTES } from './constants'
import type { Day, Block } from './types'
import './QuickNote.css'

interface Props {
  currentDate: string
  day: Day | null
  onSave: (day: Day) => void
  disabled?: boolean
}

export function QuickNote({ currentDate, day, onSave, disabled }: Props) {
  const [text, setText] = useState('')
  const [open, setOpen] = useState(false)

  const submit = () => {
    if (!text.trim() || !day) return
    const now = new Date()
    const start = timeStr(now)
    const end = addMinutes(start, DEFAULT_BLOCK_MINUTES)
    const block: Block = {
      id: generateId(),
      start,
      end,
      summary: text.trim(),
      linkedMediaIds: [],
      source: 'from_quick_note',
    }
    const next: Day = {
      ...day,
      date: currentDate,
      blocks: [...day.blocks, block].sort((a, b) => a.start.localeCompare(b.start)),
    }
    onSave(next)
    setText('')
    setOpen(false)
  }

  return (
    <div className="quick-note">
      <button
        type="button"
        className="btn-quick"
        onClick={() => setOpen(!open)}
        disabled={disabled}
      >
        一句话
      </button>
      {open && (
        <div className="quick-note-form">
          <input
            type="text"
            placeholder="当前在做的事…"
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && submit()}
            autoFocus
          />
          <button type="button" onClick={submit}>记录</button>
        </div>
      )}
    </div>
  )
}
