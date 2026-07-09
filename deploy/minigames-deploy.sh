#!/bin/bash
# Auto-deploy with a manner: waits until nobody is playing before restarting
# (gives up waiting after 60 minutes and restarts anyway).
cd /opt/minigames || exit 0
git fetch -q origin main
[ "$(git rev-parse HEAD)" = "$(git rev-parse origin/main)" ] && { rm -f /tmp/minigames-pending-deploy; exit 0; }
AGE_FILE=/tmp/minigames-pending-deploy
[ -f "$AGE_FILE" ] || date +%s > "$AGE_FILE"
PENDING=$(( $(date +%s) - $(cat "$AGE_FILE") ))
BUSY=$(curl -s --max-time 3 http://localhost:3000/busy || echo '')
if echo "$BUSY" | grep -q '"busy":true' && [ "$PENDING" -lt 3600 ]; then exit 0; fi
rm -f "$AGE_FILE"
git reset --hard origin/main -q
npm install --omit=dev --silent
systemctl restart minigames
