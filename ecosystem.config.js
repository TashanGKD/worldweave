const path = require('node:path');

const appRoot = process.env.WORLDWEAVE_DIR || __dirname;
const logsRoot = path.join(appRoot, 'logs');

module.exports = {
  apps: [
    {
      name: 'xia-report-world',
      script: './scripts/start.sh',
      cwd: appRoot,
      instances: 1,
      autorestart: true,
      restart_delay: 5000,
      watch: false,
      max_memory_restart: process.env.WORLDWEAVE_PM2_MAX_MEMORY || '4G',
      env_file: path.join(appRoot, '.env.local'),
      env: {
        NODE_ENV: 'production',
        PORT: Number(process.env.PORT || 5000),
        HOST: process.env.HOST || '0.0.0.0',
        WORLD_HOST: process.env.WORLD_HOST || '0.0.0.0',
        NODE_OPTIONS: process.env.WORLDWEAVE_NODE_OPTIONS || '--max-old-space-size=3072',
      },
      error_file: path.join(logsRoot, 'pm2-error.log'),
      out_file: path.join(logsRoot, 'pm2-out.log'),
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
    },
    {
      name: 'world-source-refresh',
      script: './scripts/world-source-refresh-daemon.mjs',
      cwd: appRoot,
      instances: 1,
      autorestart: true,
      restart_delay: 10000,
      watch: false,
      max_memory_restart: process.env.WORLDWEAVE_REFRESH_PM2_MAX_MEMORY || '6G',
      env_file: path.join(appRoot, '.env.local'),
      env: {
        NODE_ENV: 'production',
        NODE_OPTIONS:
          process.env.WORLDWEAVE_REFRESH_NODE_OPTIONS || '--max-old-space-size=5120',
        WORLD_SOURCE_REFRESH_MANAGE_WORKER: '1',
        WORLD_SOURCE_REFRESH_WORKER_PORT: '5020',
        WORLD_SOURCE_REFRESH_WORKER_HOST: '127.0.0.1',
      },
      error_file: path.join(logsRoot, 'source-refresh-error.log'),
      out_file: path.join(logsRoot, 'source-refresh-out.log'),
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
    },
  ],
};
