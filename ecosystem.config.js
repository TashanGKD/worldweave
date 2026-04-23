module.exports = {
  apps: [{
    name: 'xia-report-world',
    script: './scripts/start.sh',
    cwd: '/home/ubuntu/world',
    instances: 1,
    autorestart: true,
    restart_delay: 5000,
    watch: false,
    max_memory_restart: '1G',
    env_file: '/home/ubuntu/world/.env.local',
    env: {
      NODE_ENV: 'production',
      PORT: 5000,
    },
    error_file: '/home/ubuntu/world/logs/pm2-error.log',
    out_file: '/home/ubuntu/world/logs/pm2-out.log',
    log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
  }]
};
