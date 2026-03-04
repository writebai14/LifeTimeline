export function todayStr(): string {
  const d = new Date();
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}

export function timeStr(date: Date): string {
  return String(date.getHours()).padStart(2, '0') + ':' + String(date.getMinutes()).padStart(2, '0');
}

export function roundTo15(minutes: number): number {
  return Math.round(minutes / 15) * 15;
}

export function addMinutes(time: string, delta: number): string {
  const [h, m] = time.split(':').map(Number);
  let total = h * 60 + m + delta;
  if (total < 0) total += 24 * 60;
  if (total >= 24 * 60) total -= 24 * 60;
  const nh = Math.floor(total / 60);
  const nm = total % 60;
  return String(nh).padStart(2, '0') + ':' + String(nm).padStart(2, '0');
}

const WEEKDAY = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
export function dayOfWeek(dateStr: string): string {
  const d = new Date(dateStr + 'T12:00:00');
  return WEEKDAY[d.getDay()];
}

export function generateId(): string {
  return 'b' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

/** "HH:mm" 转为从 0:00 起的分钟数 */
export function timeToMinutes(time: string): number {
  const [h, m] = time.split(':').map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
}

/** 时间轴：每小时像素；每日为 5:00 至次日 5:00（5 点前置，凌晨后置） */
export const TIMELINE_PIXELS_PER_HOUR = 200;

/** 将 "HH:mm" 转为从当日 5:00 起的分钟数（0～1440）。5:00=0，次日 4:59=1439 */
export function minutesFrom5am(time: string): number {
  const [h, min] = time.split(':').map(Number);
  const total = (h ?? 0) * 60 + (min ?? 0);
  if (h >= 5) return total - 5 * 60; // 5:00~23:59 -> 0~1139
  return total + 19 * 60; // 0:00~4:59 -> 1140~1439
}

/** 时间轴总高度(px)，24 小时 */
export function timelineTotalHeight(): number {
  return 24 * TIMELINE_PIXELS_PER_HOUR;
}

/**
 * 按「5:00～次日 5:00」排布，将起止时间转为时间轴上的 top(%) 与 height(%)。
 * 高度严格按时长比例：15 分钟 = 1 小时的 1/4，30 分钟 = 1/2 小时，以此类推。
 */
export function blockPosition5to5(start: string, end: string): { top: number; height: number } {
  const total = 24 * 60;
  const s = minutesFrom5am(start);
  let e = minutesFrom5am(end);
  if (e <= s) e += total; // 跨日如 23:00-01:00
  const top = (s / total) * 100;
  const height = ((e - s) / total) * 100;
  return { top, height: Math.max(height, 0.3) };
}

/** 根据时间轴上的垂直比例(0~1)反推时间，分钟取整到 00/15/30/45（5:00 起算） */
export function ratioToTimeSlot(ratio: number): string {
  const total = 24 * 60;
  const minutesFrom5 = Math.max(0, Math.min(1, ratio)) * total;
  const h = Math.floor(minutesFrom5 / 60);
  const m = Math.round((minutesFrom5 % 60) / 15) * 15;
  const hour = (5 + h + (m === 60 ? 1 : 0)) % 24;
  const min = m === 60 ? 0 : m;
  return String(hour).padStart(2, '0') + ':' + String(min).padStart(2, '0');
}

/** 将 ISO 时间转为当日 HH:mm（按 15 分钟向下取整） */
export function toSlotStart(capturedAt: string, dateStr: string): string | null {
  const d = new Date(capturedAt);
  const y = d.getFullYear();
  const m = d.getMonth() + 1;
  const day = d.getDate();
  const [y2, m2, d2] = dateStr.split('-').map(Number);
  if (y !== y2 || m !== m2 || day !== d2) return null; // 非当日
  const totalM = d.getHours() * 60 + d.getMinutes();
  const slotM = Math.floor(totalM / 15) * 15;
  const h = Math.floor(slotM / 60);
  const min = slotM % 60;
  return String(h).padStart(2, '0') + ':' + String(min).padStart(2, '0');
}
