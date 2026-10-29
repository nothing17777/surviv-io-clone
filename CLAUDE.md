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
