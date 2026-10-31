# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A surviv.io clone built on [survev](https://github.com/survev/survev) (open-source surviv.io server). Adds every map selectable from the menu, Trio team mode, Duel / Duel Classic arenas, party-leader map selection, kits, bots, and custom weapons. pnpm workspace, Node >= 22.18.

## Commands

```sh
pnpm install
pnpm dev                 # api + game server + client (open http://127.0.0.1:3000)
pnpm dev:api | dev:game | dev:client   # run one piece
pnpm build               # server (rolldown) then client (vite)
pnpm lint                # oxlint --fix + dprint fmt
pnpm lint:ci             # what CI runs: oxlint (0 warnings) + dprint check
```

Per package (`cd server|client|bot`): `pnpm typecheck`. Server DB: `pnpm db:generate|db:migrate|db:seed|db:studio` (drizzle).

Tests (vitest, in `tests/`):

```sh
cd tests && pnpm test                    # all
cd tests && pnpm vitest run src/kits.test.ts       # one file
cd tests && pnpm vitest run -t "test name"         # one test
```

`tests/src/gameTestHelpers.ts` / `testHelpers.ts` spin up in-process games for server-logic tests.

## Architecture

- `shared/` — code used by both client and server: game object/map definitions (`defs/`: `gameObjectDefs`, `mapDefs`, `maps/`), `gameConfig.ts`, binary net protocol (`net/`), math/util. Most gameplay tuning (weapons, maps, modes) lives in `shared/defs`.
- `server/src/api/` — HTTP API (Hono): matchmaking, accounts/auth, DB (drizzle). Entry `api/index.ts`.
- `server/src/gameServer.ts` — game server; `game/gameProcessManager.ts` forks one child process per game (`game/gameProcess.ts`, IPC types in `ipcTypes.ts`). Game simulation: `game/game.ts`, `game/objects/` (player, bullet, …), `weaponManager.ts`, `inventoryManager.ts`, `bot.ts` + `botPath.ts` (AI bots), `gameModeManager.ts`.
- `client/` — Vite + pixi.js-legacy client. `client/src/game.ts` is the in-game loop; `ui/` holds menus/HUD; `objects/` mirrors server objects for rendering.
- `bot/` — Discord bot (admin commands against the API's private routes). Not the in-game AI bots.
- Config: root `survev-config.hjson` (enabled modes: `mapName` + `teamMode` 1–4) merged over defaults in `config.ts` / `configType.ts`; `pnpm survev-setup` runs `setup.ts` to generate it.
- `film/` — tooling for recording/editing YouTube videos from local bot matches (see the `surviv-video` skill). `frontend-prototype/` is an untracked UI prototype.
- `scripts/` — weapon codegen (`genCustomWeapons.py`, `genWeaponFx.py`), hosting/deploy helpers.

## Deploy

Website on Vercel (`vercel.json`); game servers need a long-running WebSocket host (VPS behind Caddy/nginx). See `DEPLOY.md`, `HOSTING.md`.

## Conventions

- Commit format (`COMMIT_FORMAT.md`): `<type> (<scope>): <subject>` — types chore/deploy/docs/enhance/feat/fix/perf/refactor/style; imperative, lowercase, no trailing period, lines ≤ 100 chars.
- Formatting is dprint (`dprint.json`); run `pnpm lint` before committing.
- Custom projectile sprites: `BulletDef.spriteSize` is **screen px at zoom 1**, not world units like a regular bullet's `tracerWidth`. Size against the Christmas Ultimatum tree (80): big projectiles 55-64, orbs/rockets 44-56, small shots 28-40. A single-digit `spriteSize` draws as a few pixels. Stretched `trailSprite`s are sized by `tracerWidth`/`tracerLength` instead.

## Known issues and their fixes

Recurring breakages on the live site, with how each was diagnosed. Check these
before investigating anything else.

### "Can't get into a game": blank green world, broken HUD images, stuck "Waiting for players"

**Cause: client/server version skew.** Vercel redeploys the client on every push
to `main`, but the Azure VPS game server is deployed by hand, so any push leaves
the live client ahead of the server. When the server sends an item type the new
client has no def for, `typeToDef()` throws every frame inside the render loop:
the world never draws (flat green), HUD `<img>`s fall back to broken-image
icons, and the lobby sits on "Waiting for players" forever. The game itself is
fine — matchmaking returns a join token and the websocket opens.

Hit on 2026-10-31 when a PR removed 31 Pixel Gun 3D weapons from
`shared/defs/gameObjects/customWeaponDefs.ts` (and bumped
`CustomWeaponsVersion`); the VPS still handed out `pg_dead_star` and friends.

**This is now automated** (see "Auto-deploy" below), so a skew should only
happen if the automation is broken. Deploy by hand with:

```sh
ssh -i ~/.ssh/surviv-key.pem azureuser@52.180.66.249
cd ~/surviv-io-clone && git pull --ff-only && pnpm install --frozen-lockfile
sudo systemctl restart surviv
```

`scripts/host-free.sh` rebuilds `server/dist` on restart, so confirm the
rebuild actually took before declaring it fixed:

```sh
ssh -i ~/.ssh/surviv-key.pem azureuser@52.180.66.249 'cd ~/surviv-io-clone && grep -c pg_dead_star server/dist/gameProcess.js'
```

A stale `server/dist` (build failed, host-free.sh fell back to the dev servers)
looks exactly like a missing deploy. Always check `git log --oneline -1` on the
VPS against `origin/main`, and check `origin/main` against your local `main` —
a collaborator's merged PR is the usual reason the two differ.

### Auto-deploy: keeping the server in step with the client

Two layers, both added 2026-10-31:

- **`scripts/auto-deploy.sh` on a systemd timer on the VPS.** Polls
  `origin/main` every minute and redeploys when it moves (stashing the box's
  local `scripts/gameProxy.mjs` edit around the pull). Units live in
  `scripts/surviv-autodeploy.{service,timer}`, installed to
  `/etc/systemd/system/`; `/etc/sudoers.d/surviv-autodeploy` grants the
  passwordless `systemctl restart surviv` it needs. Check it with
  `systemctl list-timers surviv-autodeploy` and
  `journalctl -u surviv-autodeploy`.
- **`.github/workflows/deploy-game-server.yml`.** On push to `main`, SSHes in
  and runs the same script for an immediate deploy, then polls `/api/site_info`
  until the server answers. It needs repo secrets `VPS_SSH_KEY`, `VPS_HOST` and
  `VPS_USER`; without them the job no-ops and the timer covers the push a
  minute later.

The other inherited `.github/workflows/*` all trigger on `master`, so they
never run on this fork.

### The protocol version covers the def set

`shared/net/protocol.ts` folds an FNV-1a hash of every registered type into the
number the client and server compare, because a def's wire id is its index in
the registry (`shared/defs/register.ts`) — adding or removing one renumbers
every def after it, so mismatched builds disagree about *every* item id, not
just the ones that changed. A skewed pair now fails `find_game` and the join
check with `invalid_protocol` and the player sees the "outdated" message,
instead of the silent green screen.

`GameConfig.protocolVersion` stays the hand-bumped base for wire-format
changes; the def hash rides on top of it automatically, so nobody has to
remember to bump it after editing `shared/defs`. Import `protocolVersion` from
`shared/net/protocol.ts` — never compare `GameConfig.protocolVersion` directly.

### Diagnosing the live site without a browser

The client's own `/api/*` paths 404 on Vercel, so probe the API host directly.
Two Caddy hosts: `api-52-180-66-249.sslip.io` → 127.0.0.1:8000 (API) and
`game-52-180-66-249.sslip.io` → 127.0.0.1:8002 (`scripts/gameProxy.mjs`, which
forwards to the game server on 8001).

```sh
curl -X POST https://api-52-180-66-249.sslip.io/api/find_game_v2 -H 'content-type: application/json' -d '{"version":1032,"region":"local","zones":["local"],"playerCount":1,"autoFill":true,"gameModeIdx":0}'
```

Use the current `protocolVersion` from `shared/gameConfig.ts`. A success +
`wss://…/play/<port>` URL means matchmaking and the game server are healthy, so
the bug is client-side rendering (almost always the skew above). A wrong version
gives `invalid_protocol`, which still proves the API is up.
`find_game_failed` plus "Region local returned status Bad Gateway" in
`journalctl -u surviv` means the game server on 8001 died (it has crashed
silently before; the box has only ~944 MB RAM) — `sudo systemctl restart surviv`.

Harmless log noise, not causes: `Failed to save lost games SyntaxError:
Unexpected end of JSON input` and `Failed to save game data, saving locally
instead` (the DB is disabled), `Failed to spawn <building>` map warnings, and
`surviv-proxy` showing `failed` while port 8002 is served by host-free.sh.

### `m_` in def ids breaks only the production client

The production client build (codefend) renames anything containing `m_`,
including inside id strings: `tr_s_d_m_g` shipped as `tr_s_d_ove`, so the client
stopped matching the server. Dev builds don't do it, so it only shows live.
Never put `m_` in a def id or any other string shared with the server;
`scripts/genCustomWeapons.py`'s `slug()` already strips it.
