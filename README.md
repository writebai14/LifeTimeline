# LifeTimeline · 个人时间轴日志

LifeTimeline 是按天记录生活、回顾时间轨迹的多用户网页应用。保留时间块编辑、日期切换、活跃度日历、统计、补记提醒和文本导入导出。

服务器版本使用 React/Vite、Express/TypeScript 与 PostgreSQL。管理员创建账户，用户只能访问自己的日志、历史和导入批次；当前版本不再支持图片。

## 服务器部署

个人服务器部署使用 SSH 隧道，不需要配置域名或修改现有 Nginx。

### 部署记录

- 2026-10-16：`codex/server-deployment` 分支首次成功推送至远端，并在个人云服务器完成部署和验收。应用仅通过 SSH 隧道访问，数据库继续使用持久化卷。

```sh
cp .env.example .env
# 用 openssl rand -hex 32 生成并填写 POSTGRES_PASSWORD
docker compose up -d --build
docker compose exec app node build/server/cli.js create-admin
```

管理员通过交互式命令创建，不设默认账户或密码；当前仅创建你自己的账户。通过 `ssh -N -L 3001:127.0.0.1:3001 ubuntu@服务器IP` 建立隧道后访问 `http://localhost:3001`。首次登录必须修改临时密码。详见 [部署、备份与升级指南](docs/DEPLOYMENT.md)。

## 本地开发

需要 Node.js 24 和 PostgreSQL 17。先创建独立开发数据库，再设置环境变量：

```sh
export DATABASE_URL=postgres://localhost/lifetimeline_dev
export APP_ORIGIN=http://localhost:5173
npm ci
npm run db:migrate
npm run admin:create
npm run dev
```

访问 `http://localhost:5173`。生产构建通过 `npm run build` 生成前端 `dist/` 和服务端 `build/`；正式运行使用 `npm start`。生产环境默认要求 HTTPS；仅在显式启用 `ALLOW_HTTP_LOOPBACK` 且使用 SSH 隧道的 `http://localhost` 时允许 HTTP。开发环境的 Vite 代理仅用于 `/api`。

## 账户与数据

- 管理员可以创建、停用账户和重置密码，管理界面不提供其他用户的日志查看。
- 用户可以修改密码；修改、重置密码或停用账户会撤销原会话。会话最多 7 天、闲置最多 24 小时。
- 日志按用户和日期隔离，正文与历史快照存入 PostgreSQL JSONB。每天默认保留最近 30 个版本，可通过 `LIFETIMELINE_DAY_HISTORY_LIMIT` 调整。
- 保存采用版本号检查；其他页面已修改同日记录时返回冲突，页面保留草稿，可下载后重新加载。写入失败可重试，切换日期或离开时会提示未保存内容。
- 历史版本可以查看和恢复；恢复会生成新版本。

## 迁移旧数据

登录后打开“JSON 导入 / 导出”，选择原 `data/days/` 中的每日 JSON 文件。每批最多 500 个、合计 20 MB。

服务器先校验并展示预览。已有日期默认跳过，勾选后会覆盖并保留服务器旧版本；同一日期的重复文件只能选择一个。非法文件可以跳过，不阻止其他有效文件。预览保留 1 小时，已开始批次的结果保留至过期后 7 天。

关闭或断开后重新打开导入页面，可查询并继续最近一批导入。服务器会跳过已经处理的项目；预览后同日数据发生变化时，该项报告冲突。不要通过修改文件名规避错误，日期取自 JSON 内容。

仅迁移当前记录，不导入旧历史目录。旧图片字段会被过滤，图片生成的时间块文字保留。部署不会自动读取本机 `data/`，原日志与历史 JSON 仍可自行保存。

“导出我的全部日志 JSON”会下载 ZIP，包含当前账户各日期的 JSON，不含历史快照。解压后可以再次批量导入；导入入口不直接接受 ZIP。

## 验证

使用名称以 `_test` 结尾的专用数据库；测试会清空其中的数据，禁止指向实际业务库。

```sh
export TEST_DATABASE_URL=postgres://localhost/lifetimeline_test
npm test
npm run build
npx playwright install chromium
npm run test:e2e
```

已有 Google Chrome 时，可用 `PLAYWRIGHT_CHANNEL=chrome npm run test:e2e`。集成测试和浏览器测试不要并行使用同一测试库。

[变更记录](docs/CHANGELOG.md) · [开发者接手指南](docs/开发者接手指南.md)

MIT License
