# 小赌怡情

中文亲友纸牌网站，支持游客线上房间与实体牌记分。七种玩法：三人斗地主、四人斗地主（混战 / 对角 2v2）、跑得快、争上游、德州扑克、骗子酒馆、小猫钓鱼（仅线下）。不设充值、支付或现金兑换。

## 本地运行

需要 Node.js 22+ 和 pnpm 10.30.3。在仓库根目录执行：

```bash
corepack enable
pnpm install --frozen-lockfile
pnpm dev
```

网页：http://localhost:3000；房间服务：http://localhost:3001。

## 构建与检查

```bash
pnpm lint
pnpm type-check
pnpm test
pnpm build
PORT=3001 node apps/server/dist/index.js
```

生产服务器同时提供静态前端与 Socket.IO，直接访问 http://localhost:3001。移动端回归：构建后运行 `pnpm --filter @xiaoduyiqing/web test:e2e`；CI 包含 Chromium 的 320/375/390/430 宽度和 WebKit 的 iPhone 尺寸。浏览器模拟测试不能代替真实手机及弱网验收。

## 现有 Render 部署

仓库 `render.yaml` 使用单个 Node 服务托管前后端。构建命令为 `corepack enable && pnpm install --frozen-lockfile && pnpm build`，启动命令为 `node apps/server/dist/index.js`。无需额外部署前端。默认同源连接；如分开托管，才设置前端构建变量 `NEXT_PUBLIC_SERVER_URL` 和服务端 `CLIENT_ORIGIN`。

`/health` 返回运行版本、房间数量与实际存储健康状态。Render 自动提供的 `RENDER_GIT_COMMIT` 用于核对部署是否包含目标提交。

### 重启恢复：必须配置外部存储

服务器已支持 Upstash Redis REST 存档。需要在 Render 的环境变量中配置：

- `UPSTASH_REDIS_REST_URL`：REST endpoint。
- `UPSTASH_REDIS_REST_TOKEN`：写入 token，仅配置在服务器；不要提交到仓库、前端或聊天。

配置后重新部署，确认 `/health` 中 `durableRooms` 为 `true` 且 `storage.lastSavedAt` 在实际操作后更新。写入失败会报告异常并自动重试；启动时无法读取已配置存储则停止启动，避免覆盖已有存档。存档按实例合并写入，当前只支持单个服务实例。

**未配置时仍为内存房间，服务重启或部署会丢失牌局。** 前端会如实提醒；本机存档不能替代服务器保存。不要把 Render 免费实例的临时文件系统视为持久化。

## 操作与积分

- 邀请链接会预填六位房间号，朋友点击加入即可。房主可在等待大厅调整人数、局数及模式，移除玩家或机器人；被移出的真人不能重入原房间。
- 断线会尝试回座；重新加入不会重置当前回合期限。完成整轮后可保留座位再开一轮。
- 线下牌局保存在本机，返回首页后可继续；斗地主和争先玩法支持自动算分与本局一步撤销。线下德州管理实体牌下注、筹码、主池与边池，支持撤销及赢家选择恢复。
- 每份娱乐积分为 `min(倍率 × 0.1, 10)`。四人混战第一名收三份，其他三人各扣一份；8倍为 `+2.4 / -0.8 / -0.8 / -0.8`，256倍为 `+30 / -10 / -10 / -10`。封顶针对每份，非赢家收取的合计。
- 三人斗地主地主输赢两份、农民各一份；2v2 每名队员输赢一份。跑得快和争上游按名次计分，每人绝对值封顶10并保持零和。
- 德州使用娱乐筹码，小猫钓鱼使用牌堆分；二者不计入其他游戏的累计娱乐积分。战绩只保留本机最近50局，可导出CSV。
- 牌桌设置可关闭音效、震动或减少动画。

详细规则见 [七款游戏结算公式与计分规则](docs/七款游戏结算公式与计分规则.md)。
