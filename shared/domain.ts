import { z } from "zod";
export const dateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((s) => {
    const d = new Date(`${s}T12:00:00Z`);
    return (
      s >= "0001-01-01" &&
      !Number.isNaN(+d) &&
      d.toISOString().slice(0, 10) === s
    );
  }, "日期无效");
const text = z.string().max(100_000);
const time = z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/);
export const blockSchema = z
  .object({
    id: z.string().min(1).max(200),
    start: time,
    end: time,
    summary: text.trim().min(1),
    category: text.optional(),
    location: text.optional(),
    note: text.optional(),
    moodOrWeather: text.optional(),
    source: z.enum(["manual", "from_quick_note"]).optional(),
  })
  .strict();
export const daySchema = z
  .object({
    date: dateSchema,
    dayOfWeek: z.string().max(20).optional(),
    done: z.boolean().optional(),
    blocks: z.array(blockSchema).max(10000),
    taskSection: z
      .object({
        todayTasks: text.optional(),
        tomorrowGoals: text.optional(),
        weekTasks: text.optional(),
      })
      .strict()
      .optional(),
    summary: z
      .object({
        completed: text.optional(),
        notCompleted: text.optional(),
        exceeded: text.optional(),
      })
      .strict()
      .optional(),
  })
  .strict()
  .refine(
    (d) => new Set(d.blocks.map((b) => b.id)).size === d.blocks.length,
    "时间块 ID 重复",
  )
  .refine(
    (d) =>
      new TextEncoder().encode(JSON.stringify(d)).byteLength <=
      20 * 1024 * 1024,
    "单日日志不能超过 20 MB",
  );
export type Day = z.infer<typeof daySchema>;
export type Block = z.infer<typeof blockSchema>;
export type TaskSection = NonNullable<Day["taskSection"]>;
export type DaySummary = NonNullable<Day["summary"]>;
export interface DayRecord {
  day: Day | null;
  revision: number;
}
export interface DayStats {
  date: string;
  revision: number;
  score: number;
  words: number;
  done: boolean;
  meaningful: boolean;
}
export interface User {
  id: string;
  username: string;
  role: "admin" | "user";
  mustChangePassword: boolean;
}
export interface ImportItem {
  index: number;
  name: string;
  date: string | null;
  expectedRevision: number;
  error?: string;
  duplicate: boolean;
  status: string;
}
export interface ImportBatch {
  id: string;
  expiresAt: string;
  started: boolean;
  selected: number[];
  items: ImportItem[];
}
export function normalizeLegacy(value: unknown): Day {
  if (!value || typeof value !== "object" || Array.isArray(value))
    return daySchema.parse(value);
  const { media: _media, ...day } = value as Record<string, unknown>;
  if (Array.isArray(day.blocks))
    day.blocks = day.blocks.map((b) => {
      if (!b || typeof b !== "object" || Array.isArray(b)) return b;
      const { linkedMediaIds: _ids, ...block } = b;
      if (block.source === "from_media") block.source = "manual";
      return block;
    });
  return daySchema.parse(day);
}
