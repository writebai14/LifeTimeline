import { useRef, useState } from 'react'
import { uploadMedia } from './api'
import { getPhotoCaptureTime } from './exif'
import type { Day, Media } from './types'
import './MediaUpload.css'

interface Props {
  currentDate: string
  day: Day | null
  onSave: (day: Day) => void | Promise<void>
  disabled?: boolean
}

export function MediaUpload({ currentDate, day, onSave, disabled }: Props) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)
  const [progress, setProgress] = useState({ current: 0, total: 0 })
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  const showMessage = (type: 'success' | 'error', text: string) => {
    setMessage({ type, text })
    setTimeout(() => setMessage(null), 4000)
  }

  const handleFiles = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.files
    const files = raw ? Array.from(raw) : []
    e.target.value = ''

    if (!files.length) {
      showMessage('error', '未选择文件')
      return
    }
    if (!day) {
      showMessage('error', '当日数据未加载，请稍候再试')
      return
    }

    setUploading(true)
    setProgress({ current: 0, total: files.length })
    setMessage({ type: 'success', text: `开始上传 ${files.length} 张…` })
    await new Promise((r) => setTimeout(r, 0))

    const newMediaList: Media[] = []

    try {
      for (let i = 0; i < files.length; i++) {
        setProgress({ current: i + 1, total: files.length })
        setMessage({ type: 'success', text: `上传中 (${i + 1}/${files.length})…` })
        await new Promise((r) => setTimeout(r, 0))

        const file = files[i]
        const capturedAt = await getPhotoCaptureTime(file)
        const type = file.type.startsWith('image/') ? 'photo' as const : 'screenshot' as const
        const media = await uploadMedia(file, capturedAt.toISOString(), type)
        newMediaList.push({ ...media })
      }

      setProgress({ current: files.length, total: files.length })
      setMessage({ type: 'success', text: '正在保存…' })

      const nextMedia = [...day.media, ...newMediaList]
      await onSave({
        ...day,
        date: currentDate,
        media: nextMedia,
      })

      showMessage('success', `已上传 ${files.length} 张`)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      console.error('上传或保存失败:', err)
      showMessage('error', `失败：${msg}`)
    } finally {
      setUploading(false)
      setProgress({ current: 0, total: 0 })
    }
  }

  return (
    <div className="media-upload-wrap">
      <button
        type="button"
        className="btn-media"
        onClick={() => inputRef.current?.click()}
        disabled={disabled || uploading}
      >
        {uploading ? `上传中 (${progress.current}/${progress.total})…` : '批量上传照片'}
      </button>
      {message && (
        <span className={`media-upload-msg media-upload-msg--${message.type}`} role="status">
          {message.text}
        </span>
      )}
      {(uploading || message) && (
        <div className={`media-upload-toast ${message?.type === 'error' ? 'media-upload-toast--error' : ''}`}>
          {uploading ? `上传中 (${progress.current}/${progress.total})…` : message?.text}
        </div>
      )}
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        multiple
        onChange={handleFiles}
        style={{ display: 'none' }}
      />
    </div>
  )
}
