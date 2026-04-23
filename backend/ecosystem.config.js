/**
 * PM2 Ecosystem Configuration for BizChat Backend
 * 
 * Usage:
 *   pnpm run build
 *   pnpm run start:pm2        # Start with PM2
 *   pnpm run pm2:logs         # View logs
 *   pnpm run pm2:restart      # Restart all processes
 *   pnpm run pm2:stop         # Stop all processes
 */

module.exports = {
  apps: [
    {
      name: "bizchat-backend",
      script: "./dist/index.js",
      instances: 1,
      exec_mode: "fork",  // Changed from "cluster" to "fork" for better stability
      
      // Auto-restart on crash
      autorestart: true,
      watch: false,
      
      // Restart strategy
      max_memory_restart: "512M",  // Restart if memory exceeds 512MB
      
      // Error/log files
      error_file: "./logs/pm2-error.log",
      out_file: "./logs/pm2-out.log",
      log_date_format: "YYYY-MM-DD HH:mm:ss Z",
      
      // Graceful shutdown
      kill_timeout: 10000,       // 10s to gracefully shutdown
      listen_timeout: 3000,      // 3s listen timeout
      
      // Environment
      env: {
        NODE_ENV: "production",
        PORT: "3000",
      },
      
      // Monitoring & Health
      cron_restart: "0 2 * * *",  // Daily restart at 2 AM UTC (helps with memory)
      max_restarts: 10,           // Max restarts in 1 minute
      min_uptime: "10s",          // Must run 10s before counting as a restart
    },
  ],

  deploy: {
    production: {
      user: "ubuntu",
      host: "52.66.154.194",
      ref: "origin/main",
      repo: "https://github.com/rajeet-04/BizzChat.git",
      path: "/home/ubuntu/bizchat-backend",
      "post-deploy": "cd backend && pnpm install && pnpm run build && pnpm run pm2:restart",
    },
  },
};
