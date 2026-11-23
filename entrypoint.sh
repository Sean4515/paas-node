#!/bin/sh
set -e
PORT="${PORT:-8080}"
UUID="${UUID:-}"
WS_PATH="${WS_PATH:-/ws}"
if [ -z "$UUID" ]; then
  echo "ERROR: UUID environment variable is required" >&2
  exit 1
fi
if [ ! -x /tmp/xray-bin/xray ]; then
  mkdir -p /tmp/xray-bin
  curl -L -o /tmp/xray.zip "https://github.com/XTLS/Xray-core/releases/latest/download/Xray-linux-64.zip"
  unzip -o /tmp/xray.zip -d /tmp/xray-bin
  chmod +x /tmp/xray-bin/xray
fi
cat > /tmp/config.json <<EOF
{
  "log": { "loglevel": "warning" },
  "inbounds": [
    {
      "listen": "0.0.0.0",
      "port": $PORT,
      "protocol": "vless",
      "settings": {
        "clients": [ { "id": "$UUID" } ],
        "decryption": "none"
      },
      "streamSettings": {
        "network": "ws",
        "security": "none",
        "wsSettings": { "path": "$WS_PATH" }
      }
    }
  ],
  "outbounds": [ { "protocol": "freedom" } ]
}
EOF
exec /tmp/xray-bin/xray run -c /tmp/config.json
