# MindSync — 心有灵犀

**Two minds. One word.**

MindSync 是无需注册的双人在线词语联想游戏。创建房间，把链接或四位数字房间码发给一位朋友，等两人入场后由房主开始。

## 游戏规则

第一轮自由联想。两人独立提交，双方交卷后同时揭晓。答案一致即获胜，否则根据最近一组双方都提交的词语继续联想。超时的席位显示「未提交」，这一轮照常计入回合数。没有完整词语对时继续自由联想。默认每轮 30 秒、最多 15 轮，可在开始前设为 10–120 秒和 1–50 轮。

答案支持中文、英文和短词组，最多 20 个可见字符。服务端比较时统一 Unicode、全半角、英文大小写、简繁体和汉字之间的空格。页面显示双方提交的原始文本。少量常见错别字进入 15 秒的双人确认阶段，双方认可后才获胜。一方拒绝或确认超时会继续游戏，最后一轮则结束。

任一玩家确认「结束本局」后，双方立即结算。结算会展示本轮已提交的词语，空缺席位显示「未提交」。结算后房主可以在同一房间「新开一局」。「历史记录」按时间列出你参加过的已结算对局，可用「正序／倒序」按钮切换，每条记录都可点开查看详情。

匿名访客由浏览器 Cookie 识别。刷新和短暂掉线会恢复席位。游戏中有玩家离开房间或连接中断时，服务端冻结当前阶段的剩余时间，原来的回合倒计时位置显示 60 秒等待进度，离开/返回提示独立显示。双方在期限内重新在线便继续，超时则提前结算并公开本轮已提交的词语。双方都离开时沿用最早一次离开的等待期限，同一身份仍有另一个房间标签页在线时继续游戏。暂停信息保存在 SQLite，刷新和服务重启后沿用原来的等待期限。整局结算（成功、回合耗尽、手动结束或离线超时）后移除离线玩家，在线玩家成为房主并可重新邀请搭档；房间里没有在线玩家时，等待房和结算页在 5 秒后自动关闭。进行中的对局仍等待原来的 60 秒期限，超时结算后自动关闭。关闭会释放四位房间码，已结算的对局仍可在历史记录查看。旧八位房间码已停用。新搭档入场前不能开新局，原对局历史及当时的玩家顺序保持不变，新加入者不能读取未参与的旧对局。

## 本地运行

使用 **Node.js 24 LTS** 和自带的 npm。macOS 的 Apple Silicon 与 Intel 均可使用对应架构的 Node 安装包，或使用已有的版本管理器。SQLite 驱动优先使用预编译包，若本机需要从源码构建，安装 Xcode Command Line Tools 和 Python 3。

如果已安装 nvm，先在项目根目录切换版本。新终端里若找不到 `nvm`，先执行 `. "$HOME/.nvm/nvm.sh"`。

```sh
nvm install 24
nvm use 24
node --version
npm ci
npm run dev
```

如果系统的 `node --version` 已经是 v24，也可以直接执行 `npm install` 和 `npm run dev`。

打开 [http://localhost:3000](http://localhost:3000)。使用无痕窗口或另一浏览器模拟第二位玩家。同一浏览器身份重复加入时会恢复原席位。页面和样式支持 Next.js Fast Refresh，修改 `server.ts` 或 `server/` 后重新运行 `npm run dev`。首次启动自动创建 SQLite 数据库，并按序执行 `drizzle/` 中的事务迁移。

### 局域网访问

在 `.env.local` 中填写 Mac 的局域网地址，然后重新启动服务。

```env
HOST=0.0.0.0
PORT=3000
PUBLIC_BASE_URL=http://10.20.50.50:3000
ALLOWED_ORIGINS=http://localhost:3000,http://127.0.0.1:3000
```

运行 `npm run dev`，同一局域网设备打开 `http://10.20.50.50:3000/`。页面中的邀请链接会使用浏览器当前访问的协议、域名和端口。使用生产构建时也支持 RFC1918 私网 IP 的 HTTP 地址。HTTP 连接使用 HttpOnly、SameSite Cookie，公网部署使用 HTTPS。局域网 HTTP 下复制按钮会选中文本供手动复制。

### 环境变量

可把 [示例](.env.example) 复制成 `.env.local`。应用优先使用已导出的环境变量。

| 变量 | 默认 | 用途 |
| --- | --- | --- |
| `HOST` | `127.0.0.1` | HTTP 监听地址 |
| `PORT` | `3000` | Next.js 和 Socket.IO 共用端口 |
| `DATABASE_PATH` | `./mindsync.db` | SQLite 文件路径，相对路径从服务工作目录解析。若部署时会替换整个项目目录，使用独立的绝对持久化路径 |
| `PUBLIC_BASE_URL` | `http://localhost:<PORT>` | 主要访问来源，同时用于设置 Cookie 的 Secure 属性及 API 返回的默认邀请地址。公网填写 HTTPS Origin |
| `ALLOWED_ORIGINS` | 空 | 逗号分隔的额外 Origin，例如 `https://other.example.com` |
| `TRUST_PROXY` | `false` | 仅当回环代理覆盖 `X-Forwarded-For` 为可信客户端 IP 时设为 `true` |
| `BACKUP_DIR` | `./backups` | 一致性备份目录 |
| `BACKUP_KEEP` | `14` | 保留最近备份份数，范围 1–365 |

公网 HTTPS 模式使用 `Secure`、`HttpOnly`、`SameSite=Lax` 的 host-only Cookie。有效期 180 天。清除 Cookie、切换浏览器或切换域名会生成独立访客身份。数据库保存随机凭证的 SHA-256 摘要。

### 构建与测试

```sh
npm run lint
npm run typecheck
npm test
npx playwright install chromium webkit
npm run test:e2e
npm run build
MINDSYNC_E2E_PRODUCTION=1 npm run test:e2e
npm run start
```

Playwright 使用回环地址、独立端口、临时数据库及两个浏览器上下文。Vitest 使用独立数据库和可控时钟验证截止时间与重启。生产由 `dist/server.js` 运行，构建输出同时包含 `.next/`，工作目录为项目根目录。生产构建使用 Next.js 的 Webpack 模式，使构建不需要绑定 Turbopack 的内部 PostCSS 端口。

## Mac mini 部署

1. 用运行服务的 macOS 用户安装 Node.js 24 LTS。在项目目录执行 `npm ci` 和 `npm run build`。
2. 建立持久化和日志目录。

   ```sh
   mkdir -p "$HOME/Library/LaunchAgents" "$HOME/Library/Logs/MindSync"
   mkdir -p "$HOME/Library/Application Support/MindSync/"{data,backups}
   chmod 700 "$HOME/Library/Application Support/MindSync/"{data,backups}
   ```

3. 复制配置并编辑副本。用 `command -v node` 确认可执行文件绝对路径。替换模板中的用户、项目路径和公网域名，两个模板使用同一数据库路径。

   ```sh
   cp docs/com.mindsync.server.plist "$HOME/Library/LaunchAgents/"
   cp docs/com.mindsync.backup.plist "$HOME/Library/LaunchAgents/"
   plutil -lint "$HOME/Library/LaunchAgents/com.mindsync.server.plist" "$HOME/Library/LaunchAgents/com.mindsync.backup.plist"
   launchctl bootstrap "gui/$(id -u)" "$HOME/Library/LaunchAgents/com.mindsync.server.plist"
   launchctl bootstrap "gui/$(id -u)" "$HOME/Library/LaunchAgents/com.mindsync.backup.plist"
   curl -fsS http://127.0.0.1:3000/api/health
   ```

4. 将现有 HTTPS 代理或网络映射指向 `127.0.0.1:3000`。用公网域名打开页面，并让第二台设备加入测试房间。

模板使用登录后运行的 LaunchAgent，进程异常退出后会重启，连续启动失败至少间隔 30 秒。若需要在登录前启动，可由管理员在 `/Library/LaunchDaemons` 安装配置，设置明确的 `UserName` 和该用户可写的数据、日志目录，并将管理命令中的 `gui/UID` 改为 `system`。以下命令用于管理登录用户的服务。

```sh
launchctl print "gui/$(id -u)/com.mindsync.server"
tail -f "$HOME/Library/Logs/MindSync/server.log" "$HOME/Library/Logs/MindSync/server-error.log"
launchctl kickstart -k "gui/$(id -u)/com.mindsync.server"
launchctl bootout "gui/$(id -u)/com.mindsync.server"
launchctl bootstrap "gui/$(id -u)" "$HOME/Library/LaunchAgents/com.mindsync.server.plist"
```

更新版本时先备份，停止服务，再安装锁定依赖、构建和启动。配置变化使用 `bootout` 后重新 `bootstrap`。

### HTTPS 和 WebSocket

公网 `PUBLIC_BASE_URL` 应与地址栏的 HTTPS Origin 一致。代理将站点路径和 `/socket.io/` 转发到同一上游，保留请求路径、查询、Cookie、Origin 和公网 Host。必须允许 HTTP/1.1 的 `Upgrade: websocket` 和相应的 `Connection: upgrade`，也要允许 Socket.IO 的 GET/POST 长轮询。代理空闲超时应大于本服务 35 秒心跳窗口，建议 60 秒以上。按原样转发 Origin，避免缓存 `/api/`、`/socket.io/` 和带 Cookie 的响应。

仅在同机可信代理已**覆盖** `X-Forwarded-For` 且应用入口无法绕过该代理时启用 `TRUST_PROXY=true`。服务只接受来自回环连接、且值为单个有效 IP 的转发头。HTTPS Cookie 依据配置的公网 URL 开启。TLS 证书、域名及端口映射沿用现有方案。更多代理配置示例见 [Socket.IO 反向代理文档](https://socket.io/docs/v4/reverse-proxy/)。

### SQLite 备份与恢复

启动状态下也可备份。脚本调用 SQLite Online Backup API，校验副本后原子发布，并按时间保留最近若干份。LaunchAgent 模板每天当地时间 03:15 执行。也可以手动运行。

```sh
DATABASE_PATH="$HOME/Library/Application Support/MindSync/data/mindsync.db" \
BACKUP_DIR="$HOME/Library/Application Support/MindSync/backups" npm run db:backup

launchctl print "gui/$(id -u)/com.mindsync.backup"
launchctl kickstart "gui/$(id -u)/com.mindsync.backup"
```

恢复前先停止应用及定期备份。将旧库和 WAL/SHM 文件作为一组移到保护目录，避免旧 WAL 被新主文件打开。把已核实的备份复制为数据库主文件，再重新加载服务。示例按实际文件名设置 `backup`。

```sh
db="$HOME/Library/Application Support/MindSync/data/mindsync.db"
backup="/absolute/path/to/mindsync-backup.db"
sqlite3 -readonly "$backup" 'PRAGMA quick_check;'
launchctl bootout "gui/$(id -u)/com.mindsync.backup"
launchctl bootout "gui/$(id -u)/com.mindsync.server"
old="$(mktemp -d "$(dirname "$db")/pre-restore.XXXXXX")"
for file in "$db" "$db-wal" "$db-shm"; do
  if [ -e "$file" ]; then mv "$file" "$old/"; fi
done
install -m 600 "$backup" "$db"
launchctl bootstrap "gui/$(id -u)" "$HOME/Library/LaunchAgents/com.mindsync.server.plist"
launchctl bootstrap "gui/$(id -u)" "$HOME/Library/LaunchAgents/com.mindsync.backup.plist"
```

备份含对局和会话数据，放在私有本机目录。WAL 模式运行中请通过备份脚本生成副本。

## 代码结构

| 路径 | 内容 |
| --- | --- |
| `app/` | Next.js App Router 页面、元数据、全局样式 |
| `components/` | shadcn/ui 本地组件、Lucide 图标、大厅、对局和历史 |
| `lib/` | TypeScript 实时契约、浏览器请求和通用工具 |
| `server.ts` | 同端口 Node HTTP 服务入口 |
| `server/` | Socket.IO、HTTP API、访客会话、限流、独立匹配器及游戏引擎 |
| `drizzle/` | SQLite 初始化和后续编号迁移 |
| `tests/` | Vitest 单元与 SQLite 集成测试，Playwright 双浏览器流程 |
| `scripts/`、`docs/` | 在线备份与 macOS 配置模板 |

游戏逻辑以单进程为运行前提。SQLite 使用 WAL、外键、busy timeout、唯一索引和即时事务。大厅状态由席位数决定。每轮有持久化起止时间和揭晓记录，公开阶段依次为 `PLAYING`、`REVEALING` 或 `MATCH_REVIEW`，并按结果推进到下一轮或 `FINISHED`。服务端扫到期记录，处理命令时也检查截止时间。单方提交只同步状态，详情 API 只返回访客参加过且已结束的对局。

## 常见问题

- **同一浏览器坐不了两个位置。** 用无痕窗口、独立浏览器配置或第二台设备。
- **有页面但一直「正在连接」。** 确认代理支持 Upgrade 与长轮询，检查公网 Origin、Cookie 与 `PUBLIC_BASE_URL`，查看应用日志。换域名会开启新的匿名身份。
- **另一台设备打开了 localhost。** 先通过对方也能访问的局域网地址或公网域名打开网站，再复制邀请链接。额外的访问来源需要加入 `ALLOWED_ORIGINS`。
- **`ERR_UNKNOWN_FILE_EXTENSION`，或提示需要 Node.js 24。** 当前终端可能仍使用旧版 Node。执行 `nvm use 24` 并用 `node --version` 确认，再执行 `npm ci`、`npm run dev`。
- **生产构建缺失。** 先在项目目录执行 `npm run build`，再执行 `npm run start`。
- **SQLite 原生模块加载失败。** 核对 `node --version` 和 `node -p process.arch`，切换到正确的 Node 24 后重新执行 `npm ci`。
- **房主掉线。** 原席位保留，房主重新连接后可从大厅开始游戏。已开始的对局由服务端继续计时。
- **有 429 响应。** 稍后重试。如果反向代理让所有玩家共享同一个来源 IP，可按上面的代理条件启用可信客户端地址。

## 开发规范

从 `feature/...` 分支开发，遵循 Conventional Commits。仅在明确要求时提交或推送。前端改动前用 [GoogleChrome/modern-web-guidance](https://github.com/GoogleChrome/modern-web-guidance) 查询并读取相关指南，详见 [AGENTS.md](AGENTS.md) 和 [应用记录](docs/modern-web-guidance.md)。
