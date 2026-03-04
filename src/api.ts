import type { Day, Media } from './types';

const BASE = '';

export async function fetchDay(date: string): Promise<Day | null> {
  const res = await fetch(`${BASE}/api/days/${date}`);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

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

export async function uploadMedia(file: File, capturedAt?: string, type?: 'photo' | 'screenshot'): Promise<Media> {
  const form = new FormData();
  form.append('file', file);
  if (capturedAt) form.append('capturedAt', capturedAt);
  if (type) form.append('type', type);
  const res = await fetch(`${BASE}/api/media`, { method: 'POST', body: form });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export function mediaUrl(filePath: string): string {
  return `${BASE}/media/${filePath}`;
}

export async function deleteMedia(filePath: string): Promise<void> {
  const res = await fetch(`${BASE}/api/media/delete`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ filePath }),
  });
  if (!res.ok) throw new Error(await res.text());
}
