import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'


test('standalone PM2 deployment keeps public and refresh workloads isolated', () => {
  const config = readFileSync(new URL('../ecosystem.config.js', import.meta.url), 'utf8')

  assert.match(config, /WORLDWEAVE_DIR \|\| __dirname/)
  assert.match(config, /WORLDWEAVE_PM2_MAX_MEMORY \|\| '4G'/)
  assert.match(config, /WORLDWEAVE_REFRESH_PM2_MAX_MEMORY \|\| '6G'/)
  assert.match(config, /world-source-refresh-daemon\.mjs/)
  assert.match(config, /WORLD_SOURCE_REFRESH_MANAGE_WORKER: '1'/)
  assert.match(config, /HOST: process\.env\.HOST \|\| '127\.0\.0\.1'/)
  assert.doesNotMatch(config, /\/home\/ubuntu\/world/)
})


test('remote deploy installs from the public npm registry before building', () => {
  const deploy = readFileSync(new URL('../scripts/deploy-remote.py', import.meta.url), 'utf8')

  assert.match(deploy, /pnpm install --frozen-lockfile --registry=https:\/\/registry\.npmjs\.org/)
  assert.match(deploy, /WORLD_DEPLOY_PORT/)
})


test('production start honors the configured host and port', () => {
  const start = readFileSync(new URL('../scripts/start.sh', import.meta.url), 'utf8')

  assert.match(start, /PORT="\$\{PORT:-5000\}"/)
  assert.match(start, /DEPLOY_RUN_HOST="\$\{DEPLOY_RUN_HOST:-\$\{HOST:-\$\{WORLD_HOST:-127\.0\.0\.1\}\}\}"/)
  assert.match(start, /next start --hostname "\$\{DEPLOY_RUN_HOST\}" --port "\$\{DEPLOY_RUN_PORT\}"/)
})


test('standalone Docker stack isolates web and refresh containers', () => {
  const dockerfile = readFileSync(new URL('../Dockerfile', import.meta.url), 'utf8')
  const compose = readFileSync(new URL('../docker-compose.yml', import.meta.url), 'utf8')

  assert.match(dockerfile, /ARG NODE_BASE_IMAGE=node:20-slim/)
  assert.match(dockerfile, /ARG NPM_REGISTRY=https:\/\/registry\.npmjs\.org/)
  assert.match(dockerfile, /EXPOSE 5000/)
  assert.match(dockerfile, /node scripts\/world-start\.mjs/)

  assert.match(compose, /\$\{WORLDWEAVE_BIND_HOST:-127\.0\.0\.1\}:\$\{WORLDWEAVE_HOST_PORT:-5000\}:5000/)
  assert.match(compose, /name: \$\{WORLDWEAVE_CACHE_VOLUME_NAME:-worldweave_worldweave-cache\}/)
  assert.match(compose, /external: \$\{WORLDWEAVE_CACHE_VOLUME_EXTERNAL:-false\}/)
  assert.match(compose, /WORLD_WEB_ENABLE_HEAVY_REFRESH: "0"/)
  assert.match(compose, /worldweave-refresh:/)
  assert.match(compose, /scripts\/world-web-health\.mjs/)
  assert.match(compose, /scripts\/world-source-refresh-daemon\.mjs/)
  assert.match(compose, /scripts\/world-source-refresh-health\.mjs/)
  assert.match(compose, /WORLD_SOURCE_REFRESH_MANAGE_WORKER: "1"/)
  assert.match(compose, /WORLD_SOURCE_REFRESH_TIMEOUT_MINUTES:-20/)
  assert.match(compose, /WORLD_SOURCE_REFRESH_HEAVY_BATCH_SIZE:-1/)
  assert.match(compose, /WORLD_SOURCE_REFRESH_WORKER_HEALTH_FAILURE_THRESHOLD:-2/)
  assert.match(compose, /host\.docker\.internal:host-gateway/)
  assert.match(compose, /NODE_USE_ENV_PROXY: \$\{WORLDWEAVE_REFRESH_NODE_USE_ENV_PROXY:-0\}/)
  assert.match(compose, /HTTP_PROXY: \$\{WORLDWEAVE_REFRESH_HTTP_PROXY:-\}/)
  assert.match(compose, /HTTPS_PROXY: \$\{WORLDWEAVE_REFRESH_HTTPS_PROXY:-\}/)
  assert.match(compose, /NO_PROXY: \$\{WORLDWEAVE_REFRESH_NO_PROXY:-127\.0\.0\.1,localhost\}/)
  assert.match(compose, /stop_signal: SIGTERM/)
  assert.match(compose, /stop_grace_period: \$\{WORLDWEAVE_REFRESH_STOP_GRACE_PERIOD:-45s\}/)
  assert.match(compose, /worldweave-cache:\/app\/\.cache/)
  assert.match(compose, /\$\{ENV_FILE:-\.env\}/)
  assert.doesNotMatch(compose, /depends_on:\s*\n\s*worldweave:/)
  assert.doesNotMatch(compose, /topiclab/i)
})


test('GitHub Actions deploys main with the configured server secrets', () => {
  const deploy = readFileSync(new URL('../.github/workflows/deploy.yml', import.meta.url), 'utf8')
  const ci = readFileSync(new URL('../.github/workflows/ci.yml', import.meta.url), 'utf8')

  assert.match(deploy, /branches:\s*\n\s*- main/)
  assert.match(deploy, /appleboy\/ssh-action@v1\.0\.3/)
  assert.match(deploy, /secrets\.DEPLOY_HOST/)
  assert.match(deploy, /secrets\.DEPLOY_USER/)
  assert.match(deploy, /secrets\.SSH_PRIVATE_KEY/)
  assert.match(deploy, /secrets\.DEPLOY_ENV/)
  assert.match(deploy, /http\.version=HTTP\/1\.1/)
  assert.match(deploy, /timeout 180 git[\s\S]*?clone/)
  assert.match(deploy, /--depth 1/)
  assert.match(deploy, /--single-branch/)
  assert.match(deploy, /CLONE_DIR="\$BASE_DIR\/\.\$\{REPO_NAME\}\.clone"/)
  assert.match(deploy, /cd "\$BASE_DIR"/)
  assert.match(deploy, /git reset --hard FETCH_HEAD/)
  assert.match(deploy, /replacing it with a clean shallow clone/)
  assert.doesNotMatch(deploy, /git clone "\$REPO_URL" "\$REPO_DIR"/)
  assert.match(deploy, /docker compose build --pull/)
  assert.match(deploy, /docker compose up -d --remove-orphans/)
  assert.match(deploy, /worldweave:rollback/)
  assert.match(deploy, /timeout --signal=TERM --kill-after=30s 60m/)
  assert.match(deploy, /retry 3 check_egress https:\/\/registry\.npmjs\.org\//)
  assert.match(deploy, /retry 3 check_egress https:\/\/api\.scnet\.cn\//)
  assert.match(deploy, /check_refresh_egress/)
  assert.match(deploy, /https:\/\/world-monitor\.com\//)
  assert.match(deploy, /\/api\/v1\/world\/asean\/refresh/)
  assert.match(deploy, /https:\/\/world\.tashan\.chat\/worldweave/)
  assert.doesNotMatch(deploy, /SUBMODULE_TOKEN|git submodule/)

  assert.match(ci, /Validate Docker deployment/)
  assert.match(ci, /docker compose --env-file \.env\.example config --quiet/)
  assert.match(ci, /docker compose --env-file \.env\.example build worldweave/)
})
