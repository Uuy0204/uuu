# 小赌怡情

面向亲友聚会的在线扑克房间。项目保留了 Parlour 的开源起点，活动应用已替换为中文游客模式和服务器权威的 Socket.io 房间。

## 已有玩法

- 三人斗地主（地主对农民）
- 四人斗地主（双副牌、各自为战）
- 小猫钓鱼
- 跑得快
- 争上游
- 德州扑克（娱乐筹码）
- 骗子酒馆（暗牌声明、质疑与左轮淘汰）

不包含原 Parlour 游戏，也不加载背景音乐。

## 本地启动

在仓库根目录执行：

```bash
npm install
npm start
```

前端地址为 `http://localhost:3000`，房间服务地址为 `http://localhost:3001`。

## 免费部署

后端可使用仓库中的 `render.yaml` 部署到 Render。将 `CLIENT_ORIGIN` 配置为 Cloudflare Pages 的正式域名。

前端在构建时设置 `NEXT_PUBLIC_SERVER_URL` 为 Render 后端地址，然后执行：

```bash
pnpm --filter @xiaoduyiqing/web build
```

把 `apps/web/out` 设置为 Cloudflare Pages 的输出目录。

## 数据范围

房间和进行中的牌局保存在服务器内存中；服务重启后自动清空。玩家身份和最近 50 条个人战绩保存在浏览器本地，不包含账号、支付或现金兑换。
