import type { Block } from './types';

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

/**
 * 起止间隔（分钟）。end 早于 start 时：若钟面倒序差距很小（≤2h）视为未完成输入/误排，返回 0；
 * 否则按跨午夜计（如 23:00–次日 01:00）。
 */
export function durationBetween(start: string, end: string): number {
  const s = timeToMinutes(start);
  const e0 = timeToMinutes(end);
  if (e0 === s) return 0;
  if (e0 > s) return e0 - s;
  const backward = s - e0;
  if (backward <= 2 * 60) return 0;
  return e0 + 24 * 60 - s;
}

/** 中文时长文案，如 45分钟、1小时、1小时30分钟 */
export function formatDurationZh(totalMinutes: number): string {
  const m = Math.max(0, Math.round(totalMinutes));
  if (m === 0) return '0分钟';
  if (m < 60) return `${m}分钟`;
  const h = Math.floor(m / 60);
  const r = m % 60;
  if (r === 0) return `${h}小时`;
  return `${h}小时${r}分钟`;
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

/**
 * 根据时间轴上的垂直比例(0~1)反推该横格对应的 15 分钟槽起点（5:00 起算）。
 * 必须用向下取整到槽边界：若对「当前小时内分钟」做四舍五入，7:45～8:00 一格会误成 8:00。
 */
export function ratioToTimeSlot(ratio: number): string {
  const safe = Math.max(0, Math.min(1, ratio));
  const slotsPerDay = 24 * 4;
  const slotIndex = Math.min(slotsPerDay - 1, Math.floor(safe * slotsPerDay));
  const minutesFrom5 = slotIndex * 15;
  const hoursSince5 = Math.floor(minutesFrom5 / 60);
  const minOfHour = minutesFrom5 % 60;
  const clockHour = (5 + hoursSince5) % 24;
  return String(clockHour).padStart(2, '0') + ':' + String(minOfHour).padStart(2, '0');
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

export const ACTIVE_DAY_START_MINUTES = 6 * 60;
export const ACTIVE_DAY_END_MINUTES = 24 * 60;
export const ACTIVE_DAY_TOTAL_MINUTES = ACTIVE_DAY_END_MINUTES - ACTIVE_DAY_START_MINUTES;

/** 计算 06:00-24:00 范围内被时间块覆盖的去重分钟数。 */
export function activeCoverageMinutes(blocks: Block[]): number {
  const clipped = blocks
    .map((block) => {
      const start = timeToMinutes(block.start);
      let end = timeToMinutes(block.end);
      if (end <= start) end += 24 * 60;
      return {
        start: Math.max(start, ACTIVE_DAY_START_MINUTES),
        end: Math.min(end, ACTIVE_DAY_END_MINUTES),
      };
    })
    .filter((range) => range.end > range.start)
    .sort((a, b) => a.start - b.start);

  let covered = 0;
  let currentStart: number | null = null;
  let currentEnd = 0;

  for (const range of clipped) {
    if (currentStart === null) {
      currentStart = range.start;
      currentEnd = range.end;
      continue;
    }
    if (range.start <= currentEnd) {
      currentEnd = Math.max(currentEnd, range.end);
      continue;
    }
    covered += currentEnd - currentStart;
    currentStart = range.start;
    currentEnd = range.end;
  }

  if (currentStart !== null) covered += currentEnd - currentStart;
  return Math.min(covered, ACTIVE_DAY_TOTAL_MINUTES);
}
