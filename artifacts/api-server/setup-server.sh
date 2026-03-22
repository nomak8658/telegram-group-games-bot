#!/bin/bash
set -e

echo "=== تثبيت البوت ==="

apt-get update -y
apt-get install -y curl git libcairo2 libpango-1.0-0 libpangocairo-1.0-0 libjpeg-turbo8 libgif7 librsvg2-2

curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt-get install -y nodejs

npm install -g pnpm

echo "=== تنزيل الكود ==="
cd /root
git clone https://github.com/YOUR_USERNAME/YOUR_REPO_NAME bot
cd bot

echo "=== تثبيت المكتبات والبناء ==="
pnpm install --frozen-lockfile --filter @workspace/api-server...
pnpm --filter @workspace/api-server run build

echo "=== إعداد متغيرات البيئة ==="
cat > /root/bot/.env << EOF
TELEGRAM_BOT_TOKEN=ضع_توكن_البوت_هنا
PORT=8080
NODE_ENV=production
EOF

echo "=== إعداد الخدمة (تشتغل تلقائي عند إعادة التشغيل) ==="
cat > /etc/systemd/system/telegram-bot.service << EOF
[Unit]
Description=Telegram Group Games Bot
After=network.target

[Service]
Type=simple
User=root
WorkingDirectory=/root/bot
EnvironmentFile=/root/bot/.env
ExecStart=/usr/bin/node --enable-source-maps artifacts/api-server/dist/index.mjs
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable telegram-bot
systemctl start telegram-bot

echo ""
echo "=== تم بنجاح ==="
echo "البوت يشتغل الآن!"
echo "لمشاهدة اللوق: journalctl -u telegram-bot -f"
