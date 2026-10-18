#!/usr/bin/env bash
# One-time setup for a free Oracle Cloud Ubuntu server.
# Installs everything, then runs the game 24/7 as a service that restarts on reboot.
#   curl -fsSL https://raw.githubusercontent.com/nothing17777/surviv-io-clone/main/scripts/oracle-setup.sh | bash
set -euo pipefail

REPO="https://github.com/nothing17777/surviv-io-clone.git"
DIR="$HOME/surviv-io-clone"
ARCH="$(dpkg --print-architecture)" # arm64 or amd64

echo "==> Installing Node.js 22, git and pnpm"
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt-get install -y nodejs git
sudo npm install -g pnpm@11

echo "==> Installing cloudflared"
curl -fsSL -o /tmp/cloudflared.deb "https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-${ARCH}.deb"
sudo dpkg -i /tmp/cloudflared.deb

# small servers need swap or the install can run out of memory
if [ "$(free -m | awk '/Mem:/ {print $2}')" -lt 4000 ] && ! swapon --show | grep -q swapfile; then
    echo "==> Adding 2GB swap"
    sudo fallocate -l 2G /swapfile && sudo chmod 600 /swapfile
    sudo mkswap /swapfile && sudo swapon /swapfile
    echo "/swapfile none swap sw 0 0" | sudo tee -a /etc/fstab
fi

echo "==> Downloading the game"
if [ -d "$DIR" ]; then git -C "$DIR" pull; else git clone "$REPO" "$DIR"; fi
cd "$DIR"
pnpm install

echo "==> Creating the surviv service"
sudo tee /etc/systemd/system/surviv.service >/dev/null <<UNIT
[Unit]
Description=surviv.io clone (API, game server, tunnels)
After=network-online.target
Wants=network-online.target

[Service]
User=$USER
WorkingDirectory=$DIR
Environment=PATH=/usr/local/bin:/usr/bin:/bin
ExecStart=$DIR/scripts/host-free.sh
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
UNIT
sudo systemctl daemon-reload
sudo systemctl enable --now surviv

echo "==> Waiting for the tunnel addresses"
for _ in $(seq 1 90); do [ -s "$DIR/current-urls.txt" ] && break; sleep 2; done
echo
cat "$DIR/current-urls.txt" 2>/dev/null || echo "Not ready yet. Run: cat $DIR/current-urls.txt"
