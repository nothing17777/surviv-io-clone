# Adding a kit: working notes

Written from adding War Machine (`908f87f`). Reference kits: Iron Man (energy, flight, kit guns), Spider-Man
(passive auto-fire + a melee-slot skill), Wizard (aura, enhance timer). Read `shared/defs/gameObjects/kitDefs.ts` first.

## 0. Settle the spec before coding

Ask (or decide and flag) these, since users rarely give all of them:

- Health, shield ("armor" = the shield bar, like Ultron), helmet/chest (existing kits use `helmet04`/`chest04`)
- Regen: flat `regen`, `calmRegen` (hp/s after N s unhurt), shield regen, energy
- Each weapon slot: primary / secondary / melee. **Which slot is each skill in?** (Left click on the melee slot
  triggers it, like Spider-Man's dodge.) Passives need no slot.
- Damage numbers (often missing: pick a sane default and flag it), fire rate, range, cooldowns, durations
- Sprites: gray circle, outfit colour, projectile look. Generate placeholders yourself if none are given.

## 1. Files to edit, in order

| # | File | What |
|---|------|------|
| 1 | `shared/defs/gameObjects/kitDefs.ts` | `KitDef` interface field(s) if the mechanic is new, plus the `KitDefs` entry. Id **<= 16 chars** (join message and API validation cap it). Update `kitAura()` if the client must draw something. |
| 2 | `shared/defs/gameObjects/gunDefs.ts` | Guns: `kitGun(id, baseGun, bulletOverrides, gunOverrides)` (needs `loot/` and `world/` PNGs). For a gun that is only a shot source, use `defineGunSkin` and register the bullet in `BulletDefs` by hand (see `WarMachineGunDefs`). Spread the block into the exported defs next to `...IronManGunDefs`. New `GunDef` fields go on the interface at the top. |
| 3 | `shared/defs/gameObjects/meleeDefs.ts` | `KitMeleeDefs`. Skills in the melee slot: `defineMeleeSkin("fists", { damage: 0, attack: { offset:{x:0,y:0}, rad:0.1, cooldownTime: N } })`. |
| 4 | `shared/defs/gameObjects/outfitDefs.ts` | `outfitKit<Name>`: copy an existing one, change the tints. |
| 5 | `server/src/game/weaponManager.ts` | In `meleeUpdate`, the block of `if (this.activeWeapon === "kit_...")` handles skill activation. Shots go through `fireWeapon`. |
| 6 | `server/src/game/objects/player.ts` | `applyKit` sets stats. `updateKit(dt)` is the per-tick hook: add regen and passive logic there, as a method called from it. Status effects on hit are hardcoded by weapon id near the `applyBurn`/`applyBleed` lines. |
| 7 | `client/src/objects/player.ts` | `updateKitVisuals` draws kit visuals from the `kitAura` id. Wizard's circle checks `aura === 2 \|\| aura === 3`, so new ids must not fall into it. |
| 8 | `client/src/objects/shot.ts` | Only if the shot sound or recoil needs special handling. |
| 9 | `tests/src/kits.test.ts` | Tests (see section 4). |

The kit picker (`client/src/ui/modePicker.ts`) lists everything in `KitDefs` automatically. Bots (`server/src/game/bot.ts`)
treat locked kits generically. Neither needs edits for a normal kit.

## 2. Gotchas learned the hard way

- **Weapon ids must start with `kit_`**: that prefix locks them to kits (`isKitItem`) and hides them from loot and pickers.
- **Coordinates are y-up.** A player's right hand is `(dir.y, -dir.x)`; his back is `-dir`. On the client, inside
  `bodyContainer`, +x is the aim direction and +y is his right hand.
- **`kitAura` is a 3-bit field** (`shared/net/objectSerializeFns.ts`): 0 none, 1 summoner, 2 wizard, 3 enhanced wizard,
  4 war machine, 5 war machine second mount. Needing more states means widening it again (client and server together).
- **`kitEnhanceTime`** is a free-to-reuse "temporary buff seconds left" timer (Wizard enhance, War Machine second
  mount). `clearKit` resets it. It is only decremented by the kit's own update code.
- **`shotFx: true`** on a bullet makes the client play the gun def's shot sound, muzzle effects **and hand recoil**.
  `shotFx: false` is silent (Spider-Man's auto web). `GunDef.shotVolume` scales the volume, `GunDef.mounted` skips
  hand recoil. The client looks the sound up from `gameSourceType`, so that must be a real gun def id.
- **Ability cooldowns show in the HUD** only for energy kits or abilities with a cooldown of 2 s or more
  (`abilityCooldowns` in player.ts), taken from the weapon's `fireDelay` / `attack.cooldownTime`.
- **Projectile sprite sizes**: `BulletDef.spriteSize` is screen px at zoom 1 (see CLAUDE.md for the scale).
- **Type ids are 11 bits** (`GameTypeBits` in `shared/defs/register.ts`), so about 2048 defs in total. Every new gun,
  melee, outfit and bullet def uses one.
- **Placeholder art**: loot icons are 128x128 RGBA PNGs in `client/public/img/custom-weapons/loot/`. Pillow works
  (`python3 -I`). Reference them with `?v=${CustomWeaponsVersion}`.
- **Tests: `game.step(dt)` runs whole 0.1 s ticks** regardless of `dt`, so 10 steps is 1 s. `setup(kit, enemyOffset)` and
  `use(game, me, slot, ticks)` in `tests/src/kits.test.ts` do the boilerplate.

## 3. Environment (cloud session)

1. Attach the repo with `add_repo` (push access), then one shallow `git clone`, then `register_repo_root`.
2. `pnpm install` fails in a sandbox that blocks GitHub tarballs (`uWebSockets.js` is `github:`). It is imported only by
   `gameServer.ts` and `gameProcess.ts`. Workaround: delete that line from `server/package.json`, `pnpm install
   --no-frozen-lockfile`, then `git checkout -- server/package.json pnpm-lock.yaml`. Never commit those two files changed.
3. After that, `pnpm <script>` tries to reinstall and fails, so run binaries directly:
   `cd tests && ./node_modules/.bin/vitest run src/kits.test.ts`, `./node_modules/.bin/tsc --noEmit` in `server/`
   (ignore uWebSockets errors) and `client/`, and the root `node_modules/.bin/oxlint` / `dprint`.
4. Three kit tests failed before any changes (Spider-Man regen, Ultron shield, "kit regen" table). They assume 0.05 s
   steps. Don't chase them, but check the failure list matches before blaming your change.

## 4. Test checklist

- Stats applied by `applyKit` (hp, shield, empty slots, outfit)
- Each passive: damage over a few seconds inside a window, nothing out of range
- Each skill: effect starts, effect ends on time, cooldown shows and clears
- Regen rates (set `calmTime` to 0 or 5 and step 10 times for 1 s)
- Geometry helpers (for example `mountPos` facing +x and +y)
- Def properties for anything the client depends on

## 5. Finishing

- Commit format (`COMMIT_FORMAT.md`): `feat (kits): add <name> kit`, lowercase, imperative, no trailing period, lines
  <= 100 chars. Add any attribution trailers the session asks for.
- Run `pnpm lint` (oxlint + dprint) where the toolchain works.
- `git fetch origin main` before pushing from a shallow clone so the push is a thin pack.
- In the hand-off, list every number you chose that the user did not specify.
