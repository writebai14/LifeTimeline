export const CATEGORY_PRESETS = ['工作', '摸鱼', '研究', '游戏', '通勤', '休息', '生活', '社交', 'MOO', '学习', '运动'] as const;
export const DEFAULT_BLOCK_MINUTES = 15;
export const SLOTS_PER_HOUR = 4; // 15 min

/** 分类对应颜色（时间块左侧色条/背景） */
export const CATEGORY_COLORS: Record<string, string> = {
  工作: '#1b4965',
  摸鱼: '#5c677d',
  研究: '#7d4e57',
  游戏: '#c9a227',
  通勤: '#2d6a4f',
  休息: '#95b8a3',
  生活: '#b5838d',
  社交: '#e07a5f',
  MOO: '#3d405b',
  学习: '#81b29a',
  运动: '#f2cc8f',
};
