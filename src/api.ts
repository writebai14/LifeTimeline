import type { Day } from './types';

const BASE = '';

export async function fetchDay(date: string): Promise<Day | null> {
  const res = await fetch(`${BASE}/api/days/${date}`);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

/** 保存整日 JSON；时间块可含 `source: 'from_quick_note'`（一句话 UI 已移除，契约仍兼容）。 */
export async function saveDay(day: Day): Promise<void> {
  const res = await fetch(`${BASE}/api/days/${day.date}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(day),
  });
  if (!res.ok) throw new Error(await res.text());
}

export async function fetchDayList(): Promise<string[]> {
  const res = await fetch(`${BASE}/api/days`);
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export function mediaUrl(filePath: string): string {
  return `${BASE}/media/${filePath}`;
}
