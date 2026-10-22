---
name: surviv-video
description: Produce an edited surviv.io YouTube episode (1 hacker vs 50 noobs, hacker vs hacker, melee only, gun swaps, perks, armor...) from a local bot match, then upload it. Use when asked to make, record, edit, re-render, add an episode idea for, or upload a surviv video.
---

# Making a surviv.io video

Everything lives in `film/`. A video is: **record** a bots-only match → **edit** it → **review** → **upload**.

## 1. Prerequisites
- Dev server running: `preview_start {name: "surviv"}` (or `pnpm dev` in the repo root). Game server is :8001, client :3000.
  The game server hot-reloads `server/src/game`; it's needed for every recording.
- ffmpeg 8 + Impact/Arial Unicode fonts (macOS) are already installed; Playwright chromium too.

## 2. Pick an episode
`cd film && npx tsx record.ts --list` prints every idea in `film/recipes.ts`.
To add one, add an entry to `recipes`: `title`, `focus` (camera target), `sides` (bot counts per level),
optional `kits` (per-side loadout over the default), `label` (arrow text), `bots: tough("hacker")` for melee/pistol stars.
- Camera targets: hackers are named `austrian painter`, `austrian painter 2`, ...; a non-hacker star uses `focus: STAR`.
- Kit ids must exist (check `GameObjectDefs.typeToDefSafe(id)`); `primary: ""` = no gun. Up to 3 perks.
- Film matches lock kits: bots can't pick up weapons, so "pan only" stays pan only.

## 3. Record + edit
```bash
cd film
npx tsx record.ts --recipe <id> [--res 1440] [--max 600] [--retries 3]
npx tsx edit.ts out/<recipe>-<stamp>
```
Run both with `run_in_background` (edit at 1440p takes several minutes). Record re-rolls the match when the star
dies before 30% of the other side is down. Output in `out/<recipe>-<stamp>/`: `final.mp4`, `thumbnail.jpg`,
`description.txt` (written last = edit finished), `events.json`, `raw.webm`, `game.webm`.

Or use the app, which does both: `preview_start {name: "film-studio"}` → localhost:8501 → "Make an episode".

## 4. Verify before calling it done
- Contact sheet: `ffmpeg -i final.mp4 -vf "select='eq(n\,150)+eq(n\,300)+eq(n\,800)+eq(n\,3000)',scale=960:-1,tile=2x2" -frames:v 1 sheet.png`, then Read it.
  Check the title/counter numbers match `events.json` (a past bug scaled on-screen numbers with the resolution).
- Read `thumbnail.jpg`. Loudness: `ffmpeg -i final.mp4 -af ebur128 -f null - 2>&1 | grep " I:"` ≈ -14 LUFS.
- Send the user a 720p preview (SendUserFile caps at 30 MB):
  `ffmpeg -i final.mp4 -vf scale=1280:-2 -c:v libx264 -crf 26 -c:a aac -b:a 128k preview-720p.mp4`.

## 5. Upload
Studio app → Upload tab (private by default; public needs a tick; scheduling supported). Never upload publicly
without the user saying so. Token: `/Volumes/T7 Shield/league_clipped/youtube_token.pickle` — it is the surviv
channel. State in `film/out/uploads.json` stops double uploads. Custom thumbnails 403 until the channel is
phone-verified at youtube.com/verify; then set it in Studio.

## House style (from Gamerio / ihavelocity research)
NCS music (official NoCopyrightSounds channel only, credited in the description), keep the game kill feed,
"HACKER ➘" arrow callout, narrator captions, punch-in + flash + hit sound per kill, slow-mo every 10th kill,
3x fast-forward on dead time, "WHO WINS?" title, loadout screen with the game's icons, thumbnail = huge
red/white Impact matchup text + red ring on the star. Tracks live in `film/music/` (gitignored), meme SFX
optional in `film/sfx/{boom,airhorn,bruh}.mp3`. Ask before downloading any new music or SFX.

## Gotchas already solved (don't re-break)
- Playwright init scripts under tsx need `window.__name = (f) => f` first.
- ffmpeg 8: `-/filter_complex <file>` (not `-filter_complex_script`).
- `edit.ts` `px()` scales pixel numbers but must skip `text='...'`.
- Kill feed rows are reused; record diffs row text. Knock + finish = one kill per victim.
- `getConfig(false, "")` (path is relative to config.ts); spectate filter type is `player_name`.
- Picture quality: record.ts captures the game canvas with MediaRecorder (~20*h² bps, VP9) and sets the
  context `screen` size — without it headless reports 1280x720 and the client loads low-res sprites.
  Don't go back to Playwright's `recordVideo` (~6 Mbps, smeared). Event times count from the first frame.
- yt-dlp needs `--extractor-args "youtube:player_client=tv_simply"` to download reference videos.
