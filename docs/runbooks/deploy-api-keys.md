# WorldWeave 独立上线密钥清单

上线时只把真实密钥写入 WorldWeave 仓库的 GitHub Actions Secret `DEPLOY_ENV`，workflow 会以仅当前 SSH 用户可读的权限写入服务器 `.env`。真实密钥不提交到 Git。

## WorldWeave

必须填写：

- `MINIMAX_API_KEY`：MiniMax 主模型调用；同时承担 Qwen3 Embedding 的同余额调用。
- `METASO_API_KEY`：秘塔搜索，用于主持人补充背景检索；没有时相关搜索能力降级。
- `METACULUS_API_TOKEN`：Metaculus 直连题池；没有时 LiveBench 仍可运行，但题源覆盖会降级。

推荐填写：

- `WORLDWEAVE_DATABASE_URL`：WorldWeave 信源监控库。保持 scoped 名称，不使用通用 `DATABASE_URL`。

无需手填：

- `MINIMAX_BASE_URL`、`MINIMAX_MODEL`、`MINIMAX_API_STYLE` 已有代码默认值。
- `WORLD_ARENA_EMBEDDING_MODEL` 默认使用 `Qwen3-Embedding-8B`。
- `OPENCLAW_BASE_URL` 默认跟随当前部署入口或反向代理入口。

推荐的 `DEPLOY_ENV` 至少包含：

```dotenv
MINIMAX_API_KEY=填真实密钥
METASO_API_KEY=填真实密钥
METACULUS_API_TOKEN=填真实 token
WORLDWEAVE_DATABASE_URL=填 WorldWeave 监控库连接串
OPENCLAW_BASE_URL=https://worldweave.tashan.chat
WORLDWEAVE_HOST_PORT=5000
WORLDWEAVE_MEM_LIMIT=2g
WORLDWEAVE_REFRESH_MEM_LIMIT=5g
WORLDWEAVE_NODE_OPTIONS=--max-old-space-size=1536
WORLDWEAVE_REFRESH_NODE_OPTIONS=--max-old-space-size=4096
NODE_BASE_IMAGE=node:20-slim
NPM_REGISTRY=https://registry.npmjs.org
```

## GitHub Actions SSH 密钥

除 `DEPLOY_ENV` 外，仓库还必须配置：

- `DEPLOY_HOST`
- `DEPLOY_USER`
- `SSH_PRIVATE_KEY`

## TopicLab 对接

TopicLab 需要把 WorldWeave 作为信息源和嵌入页接入。

WorldWeave 相关固定配置：

```dotenv
WORLDWEAVE_BASE_URL=https://worldweave.tashan.chat
WORLDWEAVE_UPSTREAM=https://worldweave.tashan.chat
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

1. `docker compose ps` 显示 `worldweave` 与 `worldweave-refresh` 都为 healthy。
2. WorldWeave 宿主机只在 `127.0.0.1:5000` 监听应用端口。
3. `https://worldweave.tashan.chat/` 能打开世界脉络。
4. `https://worldweave.tashan.chat/api/v1/openclaw/skill.md` 能返回当前 Skill。
5. `https://worldweave.tashan.chat/api/v1/openclaw/ai.skill.md` 能返回 AI 日报 Skill。
6. `https://worldweave.tashan.chat/api/v1/world/state?scene=tech-ai` 返回 200，且 `top_signals` 非空。
7. `https://worldweave.tashan.chat/api/v1/world/source-knowledge/status?scene=global` 返回信源状态；配置监控库时 `source_monitor_db.connected=true`。
8. TopicLab 的 `WORLDWEAVE_BASE_URL` 与 `WORLDWEAVE_UPSTREAM` 指向新域名。

推荐直接跑上线后自检：

```bash
WORLD_HEALTH_BASE_URL=https://worldweave.tashan.chat pnpm health:world
WORLD_SMOKE_BASE_URL=https://worldweave.tashan.chat WORLD_SMOKE_SCENE=tech-ai pnpm smoke:world-runtime
WORLD_SMOKE_BASE_URL=https://worldweave.tashan.chat WORLD_SMOKE_SCENE=geo-politics-daily pnpm smoke:world-runtime
WORLD_SKILL_SMOKE_BASE_URL=https://worldweave.tashan.chat pnpm smoke:world-skill
```

这些检查会覆盖主站、地缘线、AI 线、主 Skill、AI 日报 Skill、信源状态、监控库连接和低信息信号泄漏。GitHub `Deploy` workflow 还会自动检查基础公开接口；DNS、TLS 或反向代理未就绪时，`public-smoke` 会单独报错。
