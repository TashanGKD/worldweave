# WorldWeave 独立部署

WorldWeave 由自己的仓库和 GitHub Actions 发布到 `worldweave.tashan.chat`，不再由 TopicLab 的 Docker Compose、子模块指针或主部署 workflow 启停。

## 自动部署链路

向 `main` 推送代码后，`.github/workflows/deploy.yml` 会：

1. SSH 到 WorldWeave 独立服务器。
2. 将 `TashanGKD/worldweave` 重置到 `origin/main`。
3. 把 GitHub Secret `DEPLOY_ENV` 写入服务器仓库的 `.env`。
4. 检查服务器能访问 npm 官方 registry 和模型 API。
5. 构建同一个 WorldWeave 镜像。
6. 启动并检查两个独立容器：
   - `worldweave`：缓存优先的 Web/API 进程。
   - `worldweave-refresh`：信源刷新 daemon 及其内部重任务 worker。
7. 从 GitHub Runner 验证 `https://worldweave.tashan.chat` 的公开 HTTPS 接口。

也可以在 GitHub Actions 页面手动运行 `Deploy` workflow。

## GitHub Actions Secrets

仓库 Settings → Secrets and variables → Actions 必须配置：

- `DEPLOY_HOST`：独立服务器地址。
- `DEPLOY_USER`：SSH 用户。
- `SSH_PRIVATE_KEY`：该用户对应的 SSH 私钥。
- `DEPLOY_ENV`：完整的 WorldWeave 生产环境变量，多行 dotenv 格式。

仓库是公开仓库，服务器使用公开 HTTPS URL 拉取代码，不需要 TopicLab 的 `SUBMODULE_TOKEN`。

## Docker 运行结构

`docker-compose.yml` 只属于 WorldWeave：

- Web 容器内部监听 `0.0.0.0:5000`，宿主机默认映射为 `127.0.0.1:5000`。
- 刷新容器不开放公网端口。
- 两个容器共享 `worldweave-cache` volume，刷新结果可被 Web 进程读取。
- Web 进程关闭重刷新，避免公开请求触发高内存任务。
- 刷新 daemon 管理自己的 worker，使重任务与公开 Web 进程隔离。

默认资源预算：

```dotenv
WORLDWEAVE_MEM_LIMIT=2g
WORLDWEAVE_REFRESH_MEM_LIMIT=5g
WORLDWEAVE_NODE_OPTIONS=--max-old-space-size=1536
WORLDWEAVE_REFRESH_NODE_OPTIONS=--max-old-space-size=4096
```

若服务器资源不同，只在 `DEPLOY_ENV` 中调整，不修改 Compose 文件。

## 服务器前置条件

- Docker Engine 与 Docker Compose v2 已安装。
- SSH 用户能在 `/var/www/github-actions/repos` 下创建目录并运行 Docker。
- 服务器能访问 GitHub、`registry.npmjs.org`、`api.scnet.cn` 及所配置的信源。
- `worldweave.tashan.chat` 的 HTTPS 反向代理指向 `127.0.0.1:5000`。

部署前可在服务器检查外网：

```bash
curl -I --max-time 20 https://registry.npmjs.org/
curl -I --max-time 20 https://api.scnet.cn/
```

HTTP 状态可以是鉴权失败或资源不存在，但不能连接超时或返回 `000`。

## 本地验证

```bash
ENV_FILE=.env.example docker compose --env-file .env.example config --quiet
ENV_FILE=.env.example docker compose --env-file .env.example build
ENV_FILE=.env.example docker compose --env-file .env.example up -d
docker compose ps
```

验证接口：

```bash
curl -fsS http://127.0.0.1:5000/api/v1/openclaw/skill.md >/dev/null
curl -fsS 'http://127.0.0.1:5000/api/v1/world/source-knowledge/status?scene=global' >/dev/null
```

停止本地容器：

```bash
docker compose down
```

## 手动回退

PM2 配置和 `pnpm deploy:remote` 保留为紧急回退工具，不是生产主发布路径。正常发布只通过 GitHub Actions 和 Docker Compose，避免服务器运行状态脱离 Git 提交记录。

## TopicLab 接入

WorldWeave 公网验收通过后，TopicLab 只需要连接独立服务：

```dotenv
WORLDWEAVE_BASE_URL=https://worldweave.tashan.chat
WORLDWEAVE_UPSTREAM=https://worldweave.tashan.chat
VITE_WORLDWEAVE_FRONTEND_URL=/worldweave/
```

TopicLab 的发布、回滚或容器重启不会停止 WorldWeave；WorldWeave 发布也不会重建 TopicLab。
