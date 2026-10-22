// Films a match from the hacker's point of view, hands-free.
//   pnpm record --recipe hacker-vs-50-noobs   starts a bots-only match (see recipes.ts)
//   pnpm record                               waits for one you started from the menu
// It spectates the focus bot in a headless 1080p browser with the HUD hidden and writes
// raw.webm (video), game.webm (game sound) and events.json into out/<recipe>-<stamp>/.
//
// options: --name "austrian painter" --noobs 50 --max 900
//          --retries 5   re-roll the match when the star dies before taking out 30% of the other side
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { chromium } from "playwright";
import { getConfig } from "../config.ts";
import { GameConfig } from "../shared/gameConfig.ts";
import { BotLevels, defaultBotSettings } from "../shared/types/api.ts";
import { recipes } from "./recipes.ts";

const args = process.argv.slice(2);
const arg = (k: string, d: string) => {
    const i = args.indexOf(`--${k}`);
    return i >= 0 ? args[i + 1] : d;
};
const recipeId = arg("recipe", "");
const recipe = recipeId ? recipes[recipeId] : undefined;
if (recipeId && !recipe) throw new Error(`no recipe "${recipeId}", try: ${Object.keys(recipes).join(", ")}`);
const name = arg("name", recipe?.focus ?? "austrian painter");
const enemies = recipe ? Object.values(recipe.sides[1]).reduce((a, b) => a + b, 0) : 50;
const noobs = Number(arg("noobs", String(enemies)));
const maxSecs = Number(arg("max", "900"));

const config = getConfig(false, "");
const gameServer = `http://127.0.0.1:${config.gameServer.port}`;
const client = `http://${config.vite.host}:${config.vite.port}`;

async function findHacker() {
    const res = await fetch(`${gameServer}/api/spectate_game`, {
        method: "POST",
        headers: { "content-type": "application/json", "survev-api-key": config.secrets.SURVEV_API_KEY },
        body: JSON.stringify({ filter: { type: "player_name", value: name } }),
    });
    if (!res.ok) throw new Error(`spectate_game: ${res.status}`);
    const data = await res.json() as { players: { data: { joinToken: string; urls: string[] } }[] };
    return data.players[0]?.data;
}

if (recipe) {
    const bots = recipe.sides.flatMap((side, team) =>
        BotLevels.flatMap((level) => Array.from({ length: side[level] ?? 0 }, () => ({ level, team })))
    );
    const res = await fetch(`${gameServer}/api/film_match`, {
        method: "POST",
        headers: { "content-type": "application/json", "survev-api-key": config.secrets.SURVEV_API_KEY },
        body: JSON.stringify({
            region: config.gameServer.thisRegion,
            version: GameConfig.protocolVersion,
            autoFill: false,
            mapName: recipe.map ?? "faction",
            teamMode: 1,
            playerData: [],
            privateMatch: { godLoadout: false, leaderSide: 0, bots, botSettings: defaultBotSettings() },
        }),
    });
    const body = await res.json();
    if (!res.ok || body.error) throw new Error(`film_match: ${res.status} ${JSON.stringify(body)}`);
    console.log(`started "${recipe.title}" (${bots.length} bots)`);
}
console.log(`waiting for "${name}" on ${gameServer} ...${recipe ? "" : " (start the match now)"}`);
let target: Awaited<ReturnType<typeof findHacker>>;
while (!(target = await findHacker())) await new Promise((r) => setTimeout(r, 1000));
console.log("found it, rolling");

const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const outDir = path.join(import.meta.dirname, "out", recipeId ? `${recipeId}-${stamp}` : stamp);
fs.mkdirSync(outDir, { recursive: true });

const browser = await chromium.launch({ channel: "chromium", args: ["--autoplay-policy=no-user-gesture-required"] });
const context = await browser.newContext({
    viewport: { width: 1920, height: 1080 },
    recordVideo: { dir: outDir, size: { width: 1920, height: 1080 } },
});
const page = await context.newPage();
const t0 = Date.now();

type Event = { t: number; kind: "kill" | "hacker_dead" | "feed"; text: string };
const events: Event[] = [];
let kills = 0;
const victims = new Set<string>();
let done = false;
await page.exposeFunction("filmFeed", (text: string) => {
    const t = (Date.now() - t0) / 1000;
    const low = text.toLowerCase();
    const n = name.toLowerCase();
    let kind: Event["kind"] = "feed";
    // 50v50 knocks first and finishes later: one kill per victim, at the first hit
    const victim = low.startsWith(n + " ") && !low.endsWith("!")
        ? low.slice(n.length + 1).match(/^(?:knocked out|killed|finally killed) (.+?)(?: with .+)?$/)?.[1]
        : undefined;
    if (victim && victim !== "themselves" && !victims.has(victim)) {
        victims.add(victim);
        kind = "kill";
    }
    else if (
        low.endsWith(`killed ${n}`) || low.includes(`killed ${n} with`)
        || low.startsWith(`${n} died`) || low.startsWith(`${n} was`) || low.startsWith(`${n} killed themselves`)
    ) kind = "hacker_dead";
    events.push({ t, kind, text });
    if (kind === "kill") console.log(`${t.toFixed(1)}s  kill #${++kills}: ${text}`);
    if (kind === "hacker_dead") console.log(`${t.toFixed(1)}s  HACKER DOWN: ${text}`);
    if (kind === "hacker_dead" || kills >= noobs) done = true;
});

// tsx tags functions with a __name helper the page doesn't have
await page.addInitScript("window.__name = (f) => f");

// the video has no sound, so tap everything the game sends to the speakers and record it alongside
const audioChunks: Buffer[] = [];
let audioStart = -1;
await page.exposeFunction("filmAudioStart", () => {
    audioStart = (Date.now() - t0) / 1000;
});
await page.exposeFunction("filmAudio", (b64: string) => {
    audioChunks.push(Buffer.from(b64, "base64"));
});
await page.addInitScript(() => {
    const taps = new WeakMap<BaseAudioContext, MediaStreamAudioDestinationNode>();
    const connect = AudioNode.prototype.connect as (...a: any[]) => any;
    AudioNode.prototype.connect = function(this: AudioNode, dest: any, ...rest: any[]) {
        if (dest instanceof AudioDestinationNode && this.context instanceof AudioContext) {
            let tap = taps.get(this.context);
            if (!tap) {
                tap = this.context.createMediaStreamDestination();
                taps.set(this.context, tap);
                const rec = new MediaRecorder(tap.stream, { mimeType: "audio/webm;codecs=opus" });
                rec.ondataavailable = async (e) => {
                    const buf = new Uint8Array(await e.data.arrayBuffer());
                    let bin = "";
                    for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode(...buf.subarray(i, i + 0x8000));
                    (window as any).filmAudio(btoa(bin));
                };
                rec.start(1000);
                (window as any).filmAudioStart();
                (window as any).filmStopAudio = () => new Promise((r) => {
                    rec.onstop = () => setTimeout(r, 300);
                    rec.stop();
                });
            }
            connect.call(this, tap, ...rest);
        }
        return connect.call(this, dest, ...rest);
    } as typeof AudioNode.prototype.connect;
});

// hide the HUD so the edit owns the screen, keep the world clean
await page.addInitScript(() => {
    const css = `#ui-top-left, #ui-top-center, #ui-bottom-center-right, #ui-bottom-right, #ui-bottom-left,
        #ui-right-center, #ui-left-center, #ui-center, #ui-spectate-buttons, #ui-spectate-text,
        #ui-leaderboard-wrapper, #ui-spec-counter, #ui-map-container,
        #ui-equipped-ammo-wrapper, #ui-bottom-center-0, #ui-bottom-center-1, #ui-bottom-center-2,
        #ui-bottom-center-left, #ui-map-wrapper, #ui-kill-leader-container, #ui-top-center-scopes-wrapper,
        #ui-upper-center, #ui-lower-center, #ui-spectate-options-wrapper, #ui-team-indicators,
        .ui-spectate-mode { opacity: 0 !important; }`;
    addEventListener("DOMContentLoaded", () => {
        const s = document.createElement("style");
        s.textContent = css;
        document.head.append(s);
        const feed = document.getElementById("ui-killfeed-contents");
        if (!feed) return;
        // feed rows are reused and only get new text, so diff what's shown against what we've sent
        const seen = new Set<string>();
        new MutationObserver(() => {
            for (const row of feed.children) {
                const text = (row as HTMLElement).innerText?.trim();
                if (text && !seen.has(text)) {
                    seen.add(text);
                    (window as any).filmFeed(text);
                }
            }
        }).observe(feed, { childList: true, subtree: true, characterData: true });
    });
});

const u = Buffer.from(target.urls.join(",")).toString("base64");
await page.goto(`${client}/?u=${encodeURIComponent(u)}&jt=${encodeURIComponent(target.joinToken)}`);

const deadline = t0 + maxSecs * 1000;
const gameOver = () => page.evaluate(() => {
    const stats = document.getElementById("ui-stats");
    return !!stats && getComputedStyle(stats).display !== "none";
});
while (!done && Date.now() < deadline && !(await gameOver())) await page.waitForTimeout(500);
// a few seconds of aftermath for the outro
await page.waitForTimeout(4000);

await page.evaluate(() => (window as any).filmStopAudio?.());
const duration = (Date.now() - t0) / 1000;
const video = page.video()!;
await context.close();
await browser.close();
fs.renameSync(await video.path(), path.join(outDir, "raw.webm"));
if (audioChunks.length) fs.writeFileSync(path.join(outDir, "game.webm"), Buffer.concat(audioChunks));
fs.writeFileSync(path.join(outDir, "events.json"), JSON.stringify({ name, noobs, title: recipe?.title, focusLabel: recipe?.label, duration, audioStart, kills, events }, null, 2));
const retries = Number(arg("retries", "5"));
const dud = events.some((e) => e.kind === "hacker_dead") && kills < noobs * 0.3;
if (dud && recipe && retries > 0) {
    console.log(`\n"${name}" went down after ${kills} kills, re-rolling (${retries} left)`);
    fs.rmSync(outDir, { recursive: true });
    const rest = args.filter((_, i) => args[i] !== "--retries" && args[i - 1] !== "--retries");
    const r = spawnSync("npx", ["tsx", import.meta.filename, ...rest, "--retries", String(retries - 1)], { stdio: "inherit" });
    process.exit(r.status ?? 1);
}
console.log(`\n${kills} kills in ${duration.toFixed(0)}s -> ${outDir}\nnext: pnpm run edit "${outDir}"`);
