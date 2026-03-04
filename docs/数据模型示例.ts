/**
 * LifeTimeline 数据模型示例（TypeScript）
 * 可用于前端类型约束与本地存储结构参考
 */

/** 分类标签 */
export type CategoryTag = string; // 如 "工作" | "摸鱼" | "研究" | "WOW" | "梦幻"

/** 时间块来源 */
export type BlockSource = "manual" | "from_media" | "from_quick_note";

/** 媒体类型 */
export type MediaType = "photo" | "screenshot";

/** 时间块（15 分钟为逻辑单位，可合并） */
export interface Block {
  id: string;
  start: string;   // "HH:mm" 或 ISO 时间，建议步长 15 分钟
  end: string;
  summary: string; // 简短描述，如 "驾车通勤"
  category?: CategoryTag;
  location?: string;  // 如 "公司"、"张江社区蔚来充电站"
  note?: string;      // 长备注
  moodOrWeather?: string; // 情绪或天气，如 "小雨🌧️"、"😴"
  linkedMediaIds: string[];
  source?: BlockSource;
}

/** 待补记素材（拍照/截图） */
export interface Media {
  id: string;
  capturedAt: string;  // ISO 8601
  filePath: string;    // 本地相对或绝对路径
  type: MediaType;
  optionalLocation?: string;
  linkedBlockId?: string; // 关联到某块；空则视为待补记
}

/** 任务区（今日任务/明日目标/本周任务） */
export interface TaskSection {
  todayTasks?: string;
  tomorrowGoals?: string;
  weekTasks?: string;
}

/** 日总结 */
export interface DaySummary {
  completed?: string;
  notCompleted?: string;
  exceeded?: string;
}

/** 单日数据 */
export interface Day {
  date: string;       // "YYYY-MM-DD"
  dayOfWeek?: string; // "周一"
  taskSection?: TaskSection;
  summary?: DaySummary;
  blocks: Block[];
  media: Media[];     // 当日相关媒体，含未关联的
}

/** 应用配置（如预设标签、数据目录） */
export interface AppConfig {
  dataDir: string;
  defaultBlockMinutes: number; // 新建块默认时长，如 15 或 30
  categoryPresets: CategoryTag[];
}

// 示例：与您提供的 12 月 18 日格式对应
export const exampleDay: Day = {
  date: "2024-12-18",
  dayOfWeek: "周一",
  taskSection: {
    todayTasks: "补周末日志；彩云协议处理；秦总体检确认",
    tomorrowGoals: "补近期工作日志；彩云协议未尽事宜推进",
    weekTasks: "月结和费用对账；离职事宜准备",
  },
  blocks: [
    {
      id: "b1",
      start: "07:45",
      end: "08:10",
      summary: "起床；洗漱；换衣出门",
      linkedMediaIds: [],
    },
    {
      id: "b2",
      start: "10:00",
      end: "10:30",
      summary: "帮陈楠测算两全险IRR",
      category: "研究",
      linkedMediaIds: [],
    },
    {
      id: "b3",
      start: "12:05",
      end: "13:00",
      summary: "充电；同步午餐水饺；驾车，返回【公司】",
      location: "张江社区蔚来充电站",
      moodOrWeather: "小雨🌧️",
      linkedMediaIds: [],
    },
  ],
  media: [],
  summary: {
    completed: "彩云协议处理（中银保险签约、人保寿再审）；秦总体检确认",
    notCompleted: "补周末日志；彩云协议处理",
    exceeded: "北大校友会一行接待工作",
  },
};
