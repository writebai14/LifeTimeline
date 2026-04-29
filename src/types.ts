/**
 * 时间块来源。`from_quick_note` 对应已下线的「一句话」入口，类型仍保留，便于既有数据与
 * `PUT /api/days/:date` 扩展客户端继续合法写入（详见 `docs/一句话功能移除说明.md`）。
 */
export type BlockSource = 'manual' | 'from_media' | 'from_quick_note';
export type MediaType = 'photo' | 'screenshot';

export interface Block {
  id: string;
  start: string;
  end: string;
  summary: string;
  category?: string;
  location?: string;
  note?: string;
  moodOrWeather?: string;
  linkedMediaIds: string[];
  source?: BlockSource;
}

export interface Media {
  id: string;
  capturedAt: string;
  filePath: string;
  type: MediaType;
  optionalLocation?: string;
  linkedBlockId?: string;
}

export interface TaskSection {
  todayTasks?: string;
  tomorrowGoals?: string;
  weekTasks?: string;
}

export interface DaySummary {
  completed?: string;
  notCompleted?: string;
  exceeded?: string;
}

export interface Day {
  date: string;
  dayOfWeek?: string;
  taskSection?: TaskSection;
  summary?: DaySummary;
  /** 当天记录已完成：主要用于“查看为主/活跃度追踪” */
  done?: boolean;
  blocks: Block[];
  media: Media[];
}
