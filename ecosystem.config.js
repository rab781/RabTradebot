module.exports = {
  apps: [
    {
      name: 'rabtradebot',
      script: 'dist/enhancedBot.js',
      cwd: process.cwd(),
      instances: 'max',
      exec_mode: 'cluster',
      autorestart: true,
      watch: false,
      max_memory_restart: '512M',
      kill_timeout: 5000,
      listen_timeout: 10000,
      out_file: 'logs/pm2-out.log',
      error_file: 'logs/pm2-error.log',
      log_file: 'logs/pm2-combined.log',
      merge_logs: true,
      time: true,
      env: {
        NODE_ENV: 'development',
        LOG_LEVEL: 'debug',
      },
      env_production: {
        NODE_ENV: 'production',
        LOG_LEVEL: 'info',
      },
      // PM2 itself cannot enforce "30 days" retention directly.
      // Use pm2-logrotate module:
      // pm2 install pm2-logrotate
      // pm2 set pm2-logrotate:max_size 100M
      // pm2 set pm2-logrotate:retain 30
      // pm2 set pm2-logrotate:compress true
    },
  ],
};
