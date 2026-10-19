#!/usr/bin/env bash
# Pushes the current tunnel addresses to Vercel and redeploys the client.
#
# Quick tunnel addresses change every time host-free.sh starts, and the client
# bakes them in at build time (see config.ts), so a new address means Vercel
# needs both new env vars and a rebuild. This does that automatically.
#
# Needs a credentials file, by default ~/.surviv-vercel.env:
#
#   VERCEL_TOKEN=...        # vercel.com/account/tokens
#   VERCEL_PROJECT=...      # project name or prj_... id
#   VERCEL_DEPLOY_HOOK=...  # Project Settings -> Git -> Deploy Hooks
#   VERCEL_TEAM_ID=...      # only if the project lives in a team
#
# Without that file it just prints what to do by hand, so the repo still works
# for anyone who hasn't set this up.
set -uo pipefail

API_URL="${1:-}"
GAME_ADDRESS="${2:-}"
ENV_FILE="${SURVIV_VERCEL_ENV:-$HOME/.surviv-vercel.env}"

if [ -z "$API_URL" ] || [ -z "$GAME_ADDRESS" ]; then
    echo "usage: sync-vercel.sh <api url> <game address>" >&2
    exit 2
fi

if [ ! -f "$ENV_FILE" ]; then
    echo "No $ENV_FILE, skipping the Vercel update."
    echo "Set these by hand in Vercel, then redeploy:"
    echo "  SURVIV_API_URL=$API_URL"
    echo "  SURVIV_GAME_ADDRESS=$GAME_ADDRESS"
    exit 0
fi

# shellcheck source=/dev/null
set -a; . "$ENV_FILE"; set +a

if [ -z "${VERCEL_TOKEN:-}" ] || [ -z "${VERCEL_PROJECT:-}" ]; then
    echo "$ENV_FILE is missing VERCEL_TOKEN or VERCEL_PROJECT, skipping." >&2
    exit 1
fi

team_param=""
[ -n "${VERCEL_TEAM_ID:-}" ] && team_param="&teamId=$VERCEL_TEAM_ID"

# upsert=true updates the variable when it already exists instead of failing
put_env() {
    local key="$1" value="$2" code
    code=$(curl -sS -o /tmp/vercel-env-res.json -w '%{http_code}' \
        -X POST "https://api.vercel.com/v10/projects/$VERCEL_PROJECT/env?upsert=true$team_param" \
        -H "Authorization: Bearer $VERCEL_TOKEN" \
        -H "Content-Type: application/json" \
        -d "{\"key\":\"$key\",\"value\":\"$value\",\"type\":\"plain\",\"target\":[\"production\"]}")

    if [ "$code" = "200" ] || [ "$code" = "201" ]; then
        echo "  $key updated"
        return 0
    fi
    echo "  $key FAILED (HTTP $code): $(head -c 300 /tmp/vercel-env-res.json)" >&2
    return 1
}

echo "==> Updating Vercel env vars"
ok=0
put_env SURVIV_API_URL "$API_URL" || ok=1
put_env SURVIV_GAME_ADDRESS "$GAME_ADDRESS" || ok=1
[ "$ok" -ne 0 ] && { echo "Env update failed, not redeploying." >&2; exit 1; }

if [ -n "${VERCEL_DEPLOY_HOOK:-}" ]; then
    echo "==> Triggering a redeploy"
    # the hook URL carries its own secret, so no auth header
    curl -sS -X POST "$VERCEL_DEPLOY_HOOK" -o /tmp/vercel-hook-res.json -w '  deploy hook HTTP %{http_code}\n'
else
    echo "No VERCEL_DEPLOY_HOOK set: env vars are updated, but you must redeploy"
    echo "for the client to pick them up (they are baked in at build time)."
fi
