import { dayOfWeek } from './utils'
import './DateSwitcher.css'

interface Props {
  value: string
  onChange: (date: string) => void
}

export function DateSwitcher({ value, onChange }: Props) {
  const prev = () => {
    const d = new Date(value + 'T12:00:00')
    d.setDate(d.getDate() - 1)
    onChange(d.toISOString().slice(0, 10))
  }
  const next = () => {
    const d = new Date(value + 'T12:00:00')
    d.setDate(d.getDate() + 1)
    onChange(d.toISOString().slice(0, 10))
  }
  return (
    <div className="date-switcher">
      <button type="button" onClick={prev} aria-label="上一天">←</button>
      <label className="date-label">
        <input
          type="date"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="date-input"
        />
        <span className="date-display">{value} {dayOfWeek(value)}</span>
      </label>
      <button type="button" onClick={next} aria-label="下一天">→</button>
    </div>
  )
}
