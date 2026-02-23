// PM2 process config — https://pm2.keymetrics.io/docs/usage/application-declaration/
module.exports = {
  apps: [
    {
      name: "synqai",
      script: "npx",
      args: "tsx runtime/src/main.ts",
      cwd: "/home/synqai/app",
      // Restart on crash, but back off if it keeps failing
      autorestart: true,
      max_restarts: 10,
      min_uptime: "10s",
      restart_delay: 3000,
      // Reload gracefully on deploy
      kill_timeout: 5000,
      listen_timeout: 10000,
      // Logs
      error_file: "/home/synqai/logs/error.log",
      out_file: "/home/synqai/logs/out.log",
      merge_logs: true,
      // Env — loaded from .env.local by dotenv in main.ts
      // No env vars here; they live in .env.local on the VM
    },
  ],
};
