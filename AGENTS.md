# MindSync 持续开发规范

- 修改 HTML、CSS 或浏览器逻辑前，先用 GoogleChrome/modern-web-guidance 搜索对应场景并读取命中的指南。可用官方 Codex 插件，或执行 `DISABLE_TELEMETRY=1 npx -y modern-web-guidance@latest search "<query>"` 后按实际 ID 执行 `retrieve "<id>"`。优先 Baseline Widely available，其他特性需要检测及降级。遵循语义化 HTML、键盘和读屏可用性、清晰焦点、减少动态效果、响应式布局，避免布局跳动和多余的客户端脚本。
- TypeScript 保持 strict，使用明确的契约和 Zod 校验外部输入。React 只负责渲染与交互。服务端事务负责状态转换、截止时间、胜负及隐私。保留旧数据兼容性，用追加迁移修改 schema。对变更中的竞态、权限和失败路径进行验证。
- 项目以单个 Node.js 进程、Next.js App Router、Socket.IO 和 SQLite 在 macOS 原生运行。生产禁止云数据库、外部实时通信、外部认证、外部 CDN、字体和运行时 API，禁止引入 Docker、Redis 或不必要的微服务。保留本地在线备份能力。
- 开发使用 `feature/...` 分支。切换分支前检查工作区。提交遵循 Conventional Commits，只有用户明确要求才 commit 或 push。禁止擅自 merge、rebase、创建 PR 或远程仓库。
- 修改后执行相关单元和集成测试，交付前执行 `npm run lint`、`npm run typecheck`、`npm test`、`npm run build`。涉及 UI、权限或实时流程时还应运行 `npm run test:e2e`。使用独立测试数据库，报告实际结果和验证边界。
