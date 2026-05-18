# WorldWeave / TopicLab 上线密钥清单

上线时只把真实密钥写入服务器 `.env.local`、`.env.deploy` 或 GitHub Secrets，不提交到 Git。

## WorldWeave

必须填写：

- `MINIMAX_API_KEY`：MiniMax 主模型调用；同时承担 Qwen3 Embedding 的同余额调用。
- `METASO_API_KEY`：秘塔搜索，用于主持人补充背景检索；没有时相关搜索能力降级。
- `METACULUS_API_TOKEN`：Metaculus 直连题池；没有时 LiveBench 仍可运行，但题源覆盖会降级。

推荐填写：

- `WORLDWEAVE_DATABASE_URL`：WorldWeave 信源监控库。TopicLab 部署必须使用这个 scoped 名称，不要用通用 `DATABASE_URL`，避免撞到 TopicLab 自己的数据库。

无需手填：

- `MINIMAX_BASE_URL`、`MINIMAX_MODEL`、`MINIMAX_API_STYLE` 已有代码默认值。
- `WORLD_ARENA_EMBEDDING_MODEL` 默认使用 `Qwen3-Embedding-8B`。
- `OPENCLAW_BASE_URL` 默认跟随当前部署入口或反向代理入口。

推荐线上 `.env.local`：

```dotenv
MINIMAX_API_KEY=填真实密钥
METASO_API_KEY=填真实密钥
METACULUS_API_TOKEN=填真实 token
WORLDWEAVE_DATABASE_URL=填 WorldWeave 监控库连接串
```

## TopicLab 对接

TopicLab 需要把 WorldWeave 作为信息源和嵌入页接入。

WorldWeave 相关固定配置：

```dotenv
WORLDWEAVE_BASE_URL=http://127.0.0.1:5000
VITE_WORLDWEAVE_FRONTEND_URL=/worldweave/
```

TopicLab 自身生产环境仍需要它原有的密钥和数据库配置：

- `DATABASE_URL`
- `JWT_SECRET`
- `AI_GENERATION_API_KEY`
- `AI_GENERATION_BASE_URL`
- `AI_GENERATION_MODEL`
- 如启用 Anthropic 路径：`ANTHROPIC_API_KEY`、`ANTHROPIC_BASE_URL`、`ANTHROPIC_MODEL`
- 如启用短信：`SMSBAO_USERNAME`、`SMSBAO_PASSWORD`
- 如启用 Watcha 登录：`WATCHA_CLIENT_ID`、`WATCHA_CLIENT_SECRET`

这些属于 TopicLab 原有运行依赖，不属于 WorldWeave 新增密钥。

## 上线前确认

1. WorldWeave 进程监听 `127.0.0.1:5000`。
2. TopicLab nginx 代理 `/worldweave/`、`/_next/`、`/api/v1/world/`、`/api/v1/openclaw/` 到 WorldWeave。
3. `https://world.tashan.chat/worldweave/` 能打开世界脉络。
4. `https://world.tashan.chat/api/v1/openclaw/skill.md` 能返回当前 Skill。
5. `https://world.tashan.chat/api/v1/openclaw/ai.skill.md` 能返回 AI 日报 Skill。
6. `https://world.tashan.chat/api/v1/world/state?scene=tech-ai` 返回 200，且 `top_signals` 非空。
7. `https://world.tashan.chat/info/source` 能嵌入地球页。
8. `https://world.tashan.chat/info/source-list` 能看到 `worldweave-signal` 信源，并可进入话题。
9. `https://world.tashan.chat/api/v1/world/source-knowledge/status?scene=global` 返回 `source_health.freshness_status=fresh`，且配置监控库时 `source_monitor_db.connected=true`。

推荐直接跑上线后自检：

```bash
WORLD_HEALTH_BASE_URL=https://world.tashan.chat pnpm health:world
WORLD_SMOKE_BASE_URL=https://world.tashan.chat WORLD_SMOKE_SCENE=tech-ai pnpm smoke:world-runtime
WORLD_SMOKE_BASE_URL=https://world.tashan.chat WORLD_SMOKE_SCENE=geo-politics-daily pnpm smoke:world-runtime
WORLD_SKILL_SMOKE_BASE_URL=https://world.tashan.chat pnpm smoke:world-skill
```

这些检查会覆盖主站、地缘线、AI 线、主 Skill、AI 日报 Skill、信源状态、监控库连接和低信息信号泄漏。
