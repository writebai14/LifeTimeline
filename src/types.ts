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
  blocks: Block[];
  media: Media[];
}
