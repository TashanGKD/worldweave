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
  assert.doesNotMatch(config, /\/home\/ubuntu\/world/)
})


test('remote deploy installs from the public npm registry before building', () => {
  const deploy = readFileSync(new URL('../scripts/deploy-remote.py', import.meta.url), 'utf8')

  assert.match(deploy, /pnpm install --frozen-lockfile --registry=https:\/\/registry\.npmjs\.org/)
  assert.match(deploy, /WORLD_DEPLOY_PORT/)
})
