#!/usr/bin/env bash
# One-time VM setup for SynqAI on Debian 12 / Ubuntu 24.04
# Run as root: sudo bash vm-setup.sh
set -euo pipefail

REPO_URL="https://github.com/Shamiivan/synqai.git"
APP_USER="synqai"
APP_DIR="/home/$APP_USER/app"
LOG_DIR="/home/$APP_USER/logs"
NODE_VERSION="22"

echo "==> Creating app user"
if ! id "$APP_USER" &>/dev/null; then
  useradd -m -s /bin/bash "$APP_USER"
fi
mkdir -p "$LOG_DIR"
chown "$APP_USER:$APP_USER" "$LOG_DIR"

echo "==> Installing Node.js $NODE_VERSION"
curl -fsSL https://deb.nodesource.com/setup_${NODE_VERSION}.x | bash -
apt-get install -y nodejs git

echo "==> Installing pnpm + PM2"
npm install -g pnpm@10.26.1 pm2

echo "==> Cloning repo"
sudo -u "$APP_USER" git clone "$REPO_URL" "$APP_DIR"

echo "==> Installing dependencies"
cd "$APP_DIR"
sudo -u "$APP_USER" pnpm install --frozen-lockfile

echo "==> Setting up PM2 startup (auto-start on boot)"
pm2 startup systemd -u "$APP_USER" --hp "/home/$APP_USER"
# Start the app
sudo -u "$APP_USER" bash -c "cd $APP_DIR && pm2 start pm2.config.cjs && pm2 save"

echo "==> Installing pm2-logrotate"
sudo -u "$APP_USER" pm2 install pm2-logrotate
sudo -u "$APP_USER" pm2 set pm2-logrotate:max_size 10M
sudo -u "$APP_USER" pm2 set pm2-logrotate:retain 7

echo ""
echo "============================================"
echo "  Done! Next steps:"
echo "  1. Add .env.local to $APP_DIR/"
echo "  2. Run: sudo -u $APP_USER pm2 restart synqai"
echo "  3. Check logs: sudo -u $APP_USER pm2 logs synqai"
echo "============================================"
