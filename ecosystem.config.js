// PM2 Ecosystem Configuration for RabTradebot
// Docs: https://pm2.keymetrics.io/docs/usage/application-declaration/
//
// 🔴 IMPORTANT: Telegram bots use long-polling — they MUST run as a single
//    instance in fork mode. Cluster mode would cause every message to be
//    processed N times (once per worker).

module.exports = {
  apps: [
    {
      name: 'rabtradebot',
      script: 'dist/enhancedBot.js',
      cwd: __dirname,

      // ─── Single Instance (REQUIRED for Telegram) ─────────────────
      instances: 1,
      exec_mode: 'fork',

      // ─── Restart Policy ──────────────────────────────────────────
      autorestart: true,
      max_restarts: 10,
      min_uptime: '10s',
      max_memory_restart: '512M',
      restart_delay: 5000,

      // ─── Graceful Shutdown ───────────────────────────────────────
      kill_timeout: 10000,
      listen_timeout: 8000,
      watch: false,

      // ─── Logging ─────────────────────────────────────────────────
      out_file: 'logs/pm2-out.log',
      error_file: 'logs/pm2-error.log',
      log_file: 'logs/pm2-combined.log',
      merge_logs: true,
      time: true,

      // ─── Environment ─────────────────────────────────────────────
      env: {
        NODE_ENV: 'development',
        LOG_LEVEL: 'debug',
      },
      env_production: {
        NODE_ENV: 'production',
        LOG_LEVEL: 'info',
      },

      // ─── Source Maps ─────────────────────────────────────────────
      source_map_support: true,

      // PM2 itself cannot enforce "30 days" retention directly.
      // Use pm2-logrotate module:
      // pm2 install pm2-logrotate
      // pm2 set pm2-logrotate:max_size 100M
      // pm2 set pm2-logrotate:retain 30
      // pm2 set pm2-logrotate:compress true
    },
  ],
};
