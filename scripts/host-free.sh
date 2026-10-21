#!/usr/bin/env bash
# Free hosting: runs the API + game server on this computer and exposes them
# with Cloudflare quick tunnels. Prints the two values to put in Vercel.
# The tunnel addresses change every time this script starts.
set -euo pipefail
cd "$(dirname "$0")/.."
export PATH="$HOME/.local/bin:$PATH"
LOGS="$(mktemp -d)"

cleanup() { kill 0 2>/dev/null || true; }
trap cleanup EXIT INT TERM

# Fixed addresses (e.g. a reverse proxy with its own HTTPS, see HOSTING.md) skip the
# tunnels entirely: put SURVIV_FIXED_API_URL and SURVIV_FIXED_GAME_ADDRESS in this file.
FIXED_ENV="${SURVIV_HOST_ENV:-$HOME/.surviv-host.env}"
# shellcheck source=/dev/null
[ -f "$FIXED_ENV" ] && { set -a; . "$FIXED_ENV"; set +a; }

if [ -n "${SURVIV_FIXED_API_URL:-}" ] && [ -n "${SURVIV_FIXED_GAME_ADDRESS:-}" ]; then
    API="$SURVIV_FIXED_API_URL"
    GAME="https://$SURVIV_FIXED_GAME_ADDRESS"
else
    cloudflared tunnel --url http://127.0.0.1:8000 >"$LOGS/api.log" 2>&1 &
    cloudflared tunnel --url http://127.0.0.1:8002 >"$LOGS/game.log" 2>&1 &

    url_from() { grep -o 'https://[a-z0-9-]*\.trycloudflare\.com' "$1" | head -1 || true; }
    API=""; GAME=""
    for _ in $(seq 1 60); do
        API=$(url_from "$LOGS/api.log"); GAME=$(url_from "$LOGS/game.log")
        [ -n "$API" ] && [ -n "$GAME" ] && break
        sleep 1
    done
    if [ -z "$API" ] || [ -z "$GAME" ]; then echo "Tunnels failed to start, logs in $LOGS"; exit 1; fi
fi

export SURVIV_API_URL="$API"
export SURVIV_GAME_ADDRESS="${GAME#https://}"
export SURVIV_GAME_PATH_ROUTING=true

echo
echo "===== Put these in Vercel (Settings -> Environment Variables), then redeploy ====="
echo "SURVIV_API_URL=$SURVIV_API_URL"
echo "SURVIV_GAME_ADDRESS=$SURVIV_GAME_ADDRESS"
echo "==================================================================================="
echo
printf 'SURVIV_API_URL=%s\nSURVIV_GAME_ADDRESS=%s\n' "$SURVIV_API_URL" "$SURVIV_GAME_ADDRESS" > current-urls.txt

# push the new addresses to Vercel, if credentials for it are set up.
# never fatal: the game must keep running even if Vercel is unreachable.
scripts/sync-vercel.sh "$SURVIV_API_URL" "$SURVIV_GAME_ADDRESS" || echo "Vercel sync failed, continuing."

# keep the proxy alive even if it ever exits
(while true; do node scripts/gameProxy.mjs; sleep 1; done) &
(cd server && pnpm dev:api) &
(cd server && pnpm dev:game) &
wait
