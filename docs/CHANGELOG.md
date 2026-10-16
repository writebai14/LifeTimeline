# Changelog

本文件记录项目的功能变更，帮助后续开发者快速理解“最近改了什么、为什么改、影响范围在哪”。

## 2026-10-16

### 服务器版本 0.2.0

- Express 服务端迁移到 TypeScript，日志、历史、账户、会话和导入批次改用 PostgreSQL。
- 新增管理员开户、登录、改密、停用与重置密码，所有业务数据按用户隔离。
- 保存加入版本冲突检测、事务历史及失败草稿保护；前端改为摘要统计接口。
- 新增批量 JSON 预览、逐日覆盖选择、可恢复导入、JSON 导出与历史查看恢复。
- 完整移除旧图片展示、读取和字段；导入时兼容过滤旧字段，保留文字记录。
- 新增同源生产构建、Docker Compose、HTTPS 代理、数据库迁移、备份恢复及部署文档。

### 移除：图片上传与删除

- 移除图片上传入口、服务端上传/删除接口、EXIF 上传时间识别及未使用的媒体自动生成时间块逻辑。
- 移除 `cors`、`multer`、`exifr` 依赖；取消宽松跨域设置。
- 保留已有媒体记录的查看与下载，以及 `Day.media` 数据结构兼容。
- 影响文件：`src/App.tsx`、`src/DayView.tsx`、`src/api.ts`、`server/app.js`、`package.json`。

## 2026-08-18

### 优化：单日 JSON 原子写入与自动历史版本

- `days` 正式文件改为同目录临时文件写入、文件同步、原子重命名和目录同步，避免异常中断产生半写文件。
- 每次有效变更先写入 `data/history/days/YYYY-MM-DD/` 快照；相同内容不重复备份，默认每个日期保留最近 30 个版本。
- 新增历史列表、读取和恢复 API；恢复同样会留下新快照。

### 新增：严格服务端数据校验

- 路径日期必须为真实存在的 `YYYY-MM-DD`，请求体日期必须与路径一致。
- 对 `Day / Block / Media` 的字段白名单、必填项、类型、时间格式、枚举、唯一 ID 和关联完整性进行校验。
- 写入前、读取当前数据及读取历史版本时均执行校验；非法请求以包含字段路径详情的 `400` JSON 响应返回。
- 新增 Node 内置测试套件，覆盖校验、原子替换、历史保留、恢复和 HTTP API。
- 影响文件：`server/index.js`、`server/app.js`、`server/day-store.js`、`server/day-validation.js`、`test/*`、`package.json`、`README.md`、`docs/开发者接手指南.md`。

## 2026-04-28

### 移除：「一句话」Web 入口（保留数据与 API 契约）
- 产品内下线「一句话」按钮与 `QuickNote` 组件；详见 `docs/一句话功能移除说明.md`。
- `BlockSource` 仍含 `from_quick_note`；`PUT /api/days/:date` 与 `saveDay` 可继续写入该来源，便于重做或脚本。
- 影响文件：`src/App.tsx`、`src/DayView.tsx`、`src/types.ts`、`src/api.ts`、`server/index.js`、`README.md`；删除 `src/QuickNote.tsx`、`src/QuickNote.css`。

## 2026-03-05

### 新增：记录活跃度日历（类似 GitHub Contribution Graph）
- 新增活跃度格子图能力，展示每日记录丰富度。
- 颜色分 5 档（空白到丰富），并带当前选中日期高亮。
- 丰富度算法（当前版本）：
  - `时间块数 * 2`
  - `媒体数 * 1.5`
  - `任务区非空项数 * 1.2`
  - `日总结非空项数 * 1.2`

### 交互调整：从“顶部常驻区”改为“标题栏弹出层”
- 为节省纵向空间，移除顶部常驻活跃度区。
- 改为标题栏中的「活跃度」入口按钮，默认仅占一行按钮宽度。
- 点击后弹出紧凑热力格，展示最近 14 周（非全年）并支持点击跳转日期。
- 影响文件：
  - `src/ContributionCalendar.tsx`
  - `src/ContributionCalendar.css`
  - `src/App.tsx`

### 优化：左侧时间轴视觉重构 + 分类块可辨识度增强
- 重做时间轴编辑区背景层级、刻度线和卡片阴影，提升编辑区信息密度可读性。
- 分类块从“弱边框差异”改为“明显分类底色 + 左侧色带 + 分类胶囊标签”。
- 目标：让不同 tag 的事件在滚动浏览时能够“扫一眼就分组”。
- 影响文件：
  - `src/DayView.css`
  - `src/DayView.tsx`

## 2026-03-04 之前（仓库既有）
- 项目已有本地优先日记核心能力：按日读取/保存、时间块 CRUD、媒体上传、导入导出文本。
- 以 `React + Vite + Express` 实现，数据落盘到 `data/days/*.json` 与 `data/media/*`。
