import exifr from 'exifr'

/**
 * 从图片文件中读取拍摄时间（EXIF DateTimeOriginal / CreateDate），
 * 若读取失败则返回当前时间。
 */
export async function getPhotoCaptureTime(file: File): Promise<Date> {
  try {
    const result = await exifr.parse(file, { pick: ['DateTimeOriginal', 'CreateDate'] })
    if (!result) return new Date()
    const dt = result.DateTimeOriginal ?? result.CreateDate
    if (dt instanceof Date && !isNaN(dt.getTime())) return dt
    if (typeof dt === 'string') return new Date(dt)
  } catch (_) {
    // 无 EXIF 或解析失败
  }
  return new Date()
}
