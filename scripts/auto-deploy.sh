#!/usr/bin/env bash
# Keep the VPS game server in step with origin/main.
#
# Vercel rebuilds the client on every push, but the game server is deployed by
# hand, so a push leaves the live client ahead of the server. Wire ids come from
# the order defs are registered, so a skewed pair disagrees about every item id.
# This polls origin/main and redeploys whenever it moves.
#
# Install as a systemd timer: see scripts/surviv-autodeploy.{service,timer}.

set -euo pipefail

REPO="${SURVIV_REPO:-$HOME/surviv-io-clone}"
BRANCH="${SURVIV_BRANCH:-main}"

cd "$REPO"

git fetch --quiet origin "$BRANCH"

local_rev=$(git rev-parse HEAD)
remote_rev=$(git rev-parse "origin/$BRANCH")

if [ "$local_rev" = "$remote_rev" ]; then
    exit 0
fi

echo "Deploying $local_rev -> $remote_rev"

# A dirty checkout would make --ff-only fail halfway; the VPS carries a local
# edit to scripts/gameProxy.mjs, so stash it and put it back after.
stashed=
if ! git diff --quiet || ! git diff --cached --quiet; then
    git stash push --quiet --message "auto-deploy $(date -Iseconds)"
    stashed=1
fi

restore_stash() {
    if [ -n "$stashed" ]; then
        git stash pop --quiet || echo "WARNING: could not restore local edits, see git stash list"
    fi
}
trap restore_stash EXIT

git merge --ff-only --quiet "origin/$BRANCH"
pnpm install --frozen-lockfile

restore_stash
stashed=
trap - EXIT

# host-free.sh rebuilds server/dist on start, so a restart is the whole deploy.
sudo systemctl restart surviv

echo "Deployed $(git rev-parse --short HEAD)"
