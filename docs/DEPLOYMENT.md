# 部署、备份与升级

## 运行模型

Node.js 24 应用同时提供前端构建产物和 `/api`。PostgreSQL 17 保存账户、会话、日志、历史和导入批次。当前个人验收部署使用 SSH 隧道：应用仅发布到服务器 `127.0.0.1:3001`，数据库不发布主机端口，持久化卷独立于应用容器。无需配置域名、HTTPS 证书或修改现有 Nginx；SSH 已加密电脑与服务器之间的连接。建议服务器至少 2 GB 内存。

此版本以一个应用实例为默认部署方式。数据库可处理并发写入，但登录限流计数位于应用内存，多实例部署前应改用共享限流存储。应用层的账户隔离不等同于抵御服务器或数据库管理员的数据加密。

## 首次部署

1. 安装 Docker Engine 和 Docker Compose。应用只绑定服务器回环地址，不需要新增公网入站端口。
2. 复制 `.env.example` 为 `.env`，使用 `openssl rand -hex 32` 生成 `POSTGRES_PASSWORD`。保持 `APP_ORIGIN=http://localhost:3001` 和 `ALLOW_HTTP_LOOPBACK=true`。不要把 `.env` 提交到 Git。
3. 执行 `docker compose up -d --build`。数据库健康后，一次性迁移服务执行版本迁移，随后应用启动。
4. 执行 `docker compose exec app node build/server/cli.js create-admin`。交互输入用户名和临时密码，密码不回显。此命令只能创建账户，不会覆盖已有账户。
5. 从你的电脑建立 SSH 隧道：`ssh -N -L 3001:127.0.0.1:3001 ubuntu@服务器IP`，保持该终端运行，再访问 `http://localhost:3001` 并用刚创建的账户登录。首次登录修改临时密码；当前只创建你自己的账户。
6. 由用户从“JSON 导入 / 导出”迁移旧日志，系统不自动扫描本机数据。

应用允许 HTTP 的唯一生产情形是显式设置 `ALLOW_HTTP_LOOPBACK=true` 并将 `APP_ORIGIN` 设为 `http://localhost:3001`；这用于本机浏览器经 SSH 隧道访问。不要把应用端口改为对外网卡绑定或将该 HTTP 地址公开。一般公开部署仍需 HTTPS 反向代理并关闭此选项。`DATABASE_URL` 为必填环境变量；`PORT` 默认 3001；`LIFETIMELINE_DAY_HISTORY_LIMIT` 默认为 30、最小 1。更改保留数量会在下次写入该日期时应用。

## 健康检查与故障排查

```sh
docker compose ps
docker compose logs --tail=100 app migrate
```

`/health/live` 检查进程，`/health/ready` 检查数据库及迁移表可用性，返回内容不含连接信息。迁移失败时应用不会正常上线，应先检查迁移服务日志。应用正常关闭时等待现有 HTTP 请求结束并关闭数据库连接，最多 15 秒。

账号或密码错误返回统一提示。登录尝试按账户和客户端地址限流，窗口为 15 分钟。修改密码、管理员重置密码及停用账户会撤销会话。CSRF 或来源校验失败时确认 `APP_ORIGIN` 与浏览器地址完全一致，不要通过关闭校验解决。

日志只记录错误代码，不记录密码、令牌或日记正文。

## 备份与恢复

历史快照不能代替数据库备份。备份包含账户、日志、历史及会话，保存在 `backups/`，默认文件权限仅限当前操作用户。

```sh
sh scripts/backup.sh
```

命令使用 `pg_dump -Fc` 生成一致性备份。建议在部署服务器的调度系统每日执行并将备份复制到另一台受控设备，同时设置保留周期。仓库不自动创建宿主机定时任务。

恢复会替换目标数据库内容。先备份当前库，再执行：

```sh
sh scripts/restore.sh backups/指定备份.dump --replace-database
```

恢复命令停止应用，以单事务恢复，失败会中止。恢复后清除备份内的旧会话，并保持应用停止；确认使用与备份 schema 匹配的应用版本后启动：

```sh
docker compose up -d --no-deps app
```

不要执行 `docker compose down -v`，它会删除持久化数据卷。可用 `docker compose down` 停止部署且保留数据。

## 升级与回退

1. 为当前镜像保留明确的 `APP_VERSION` 标签，记录 Git 提交号。
2. 执行数据库备份，并停止 `app`；不要停止数据库。
3. 获取新源码，设置新的 `APP_VERSION`，执行 `docker compose build`。
4. 执行 `docker compose run --rm migrate`，成功后执行 `docker compose up -d --no-deps app`。
5. 检查健康状态及登录、读取、保存和导入功能。

数据库迁移通过 `schema_migrations` 记录，已有迁移文件不得改写；后续新增 SQL 文件。迁移采用数据库事务和锁，不允许应用在普通请求中修改 schema。

若新版本失败，先停止应用，保存故障时数据库备份，再恢复升级前备份，并切换到之前的镜像标签。回退备份会丢弃升级后产生的数据，需要先导出或另行迁移这些增量；不要直接让旧应用连接不兼容的新 schema。

## 验收环境限制

本次开发环境具备 PostgreSQL 17 和 Chrome，可运行独立数据库、构建和浏览器验收。未安装 Docker 运行时，因此不能在此环境声明镜像构建、Compose 启动或容器重建验收已通过。首次服务器部署需补做这些检查。

### 本机验收记录（2026-10-16）

- `npm run build`：前端构建及前后端 TypeScript 编译通过。
- 独立 PostgreSQL 测试库：11 项测试通过，包括迁移重复执行、权限隔离、会话撤销、CSRF、限流、历史事务与保留数量、并发冲突、导入校验和中断重试。
- Chrome 浏览器：完整工作流通过，覆盖管理员开户、首次改密、账户隔离、批量导入、草稿下载、历史恢复、保存冲突、断网重试、停用及退出。
- 测试数据使用 `pg_dump -Fc` / `pg_restore --single-transaction` 备份恢复后，账户、日志、历史和导入批次的摘要一致；临时 PostgreSQL 集群重启后摘要仍一致。这不替代容器持久化验收。
- `git diff --check` 通过；依赖安装审计报告 0 个已知漏洞。
- 原有 502 个日志及历史 JSON 的清理前后 SHA-256 一致。`data/media` 当时为空，已删除目录；未导入任何个人日志到测试数据库。
- 尚未验证：Docker 镜像构建、Compose 实际启动及容器重建后数据保留。
