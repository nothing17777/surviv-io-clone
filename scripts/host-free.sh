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

RUN="$(mktemp -d)"

# keep each piece alive even if it exits: the game server has died on its own
# before, which leaves the API answering but every find_game failing.
# The delay grows up to 30 s so a process that cannot start at all (a port still
# held by an older run, say) does not spin restarting once a second forever;
# a run that lasted a while is a crash rather than a failure to start, so the
# delay resets and the next restart is immediate.
supervise() {
    local name=$1 cmd=$2 pidfile=$3 delay=1 started pid
    while true; do
        started=$SECONDS
        bash -c "$cmd" &
        pid=$!
        echo "$pid" > "$pidfile"
        wait "$pid" || true
        if [ $((SECONDS - started)) -ge 60 ]; then delay=1; fi
        echo "$name exited, restarting in ${delay}s"
        sleep "$delay"
        delay=$((delay * 2 > 30 ? 30 : delay * 2))
    done
}

kill_tree() {
    local pid=$1 child
    for child in $(pgrep -P "$pid" 2>/dev/null || true); do kill_tree "$child"; done
    kill -9 "$pid" 2>/dev/null || true
}

# Exiting is not the only way a piece dies: the dev runners keep their watcher
# alive after the server under it is gone, so the supervisor above sees nothing
# while the port stays closed. Poll instead, and kill the whole tree when it
# stops answering so the supervisor starts a fresh one.
watchdog() {
    local name=$1 url=$2 pidfile=$3 fails=0
    sleep 60
    while true; do
        sleep 15
        if curl -fsS -m 5 -o /dev/null "$url" 2>/dev/null; then
            fails=0
            continue
        fi
        fails=$((fails + 1))
        if [ "$fails" -ge 4 ]; then
            echo "$name failed $fails health checks, restarting it"
            if [ -s "$pidfile" ]; then kill_tree "$(cat "$pidfile")"; fi
            fails=0
            sleep 45
        fi
    done
}

supervise "game proxy" "node scripts/gameProxy.mjs" "$RUN/proxy.pid" &
supervise "api server" "cd server && pnpm dev:api" "$RUN/api.pid" &
supervise "game server" "cd server && pnpm dev:game" "$RUN/game.pid" &
watchdog "api server" "http://127.0.0.1:8000/api/site_info" "$RUN/api.pid" &
watchdog "game server" "http://127.0.0.1:8001/health" "$RUN/game.pid" &
wait
