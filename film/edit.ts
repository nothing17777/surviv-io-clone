// Turns a recording from record.ts into a YouTube-ready edit, in the style of the old
// surviv.io channels (Gamerio & co): title card, dead time fast-forwarded, every kill
// punched in with a zoom + flash + hit sound, slow-mo on milestone kills, a running
// kill counter, a music bed under the real game sound, a "who won?" outro, plus a
// thumbnail and a description with music credits.
//
//   pnpm run edit out/<recording> [--title "1 HACKER vs 50 NOOBS"]
//
// Music: drop .mp3/.m4a/.wav files in film/music/ (NCS tracks are free to use on
// YouTube with credit in the description). They play in name order, looping.
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const args = process.argv.slice(2);
const arg = (k: string, d: string) => {
    const i = args.indexOf(`--${k}`);
    return i >= 0 ? args[i + 1] : d;
};
const dir = path.resolve(args.find((a, i) => !a.startsWith("--") && !args[i - 1]?.startsWith("--")) ?? "");
const raw = path.join(dir, "raw.webm");
if (!fs.existsSync(raw)) throw new Error(`no raw.webm in ${dir}`);
const info = JSON.parse(fs.readFileSync(path.join(dir, "events.json"), "utf8")) as {
    title?: string;
    name?: string;
    focusLabel?: string;
    noobs: number;
    duration: number;
    audioStart?: number;
    events: { t: number; kind: string; text: string }[];
};
const title = arg("title", info.title ?? `1 HACKER vs ${info.noobs} NOOBS`);
const gameAudio = path.join(dir, "game.webm");
const hasGameAudio = fs.existsSync(gameAudio) && info.audioStart !== undefined && info.audioStart >= 0;
const FONT = "/System/Library/Fonts/Supplemental/Impact.ttf";
const ARROWS = "/System/Library/Fonts/Supplemental/Arial Unicode.ttf";
const SFX = path.join(import.meta.dirname, "..", "client", "public", "audio");
const INTRO = 3;
const OUTRO = 4;
const work = path.join(dir, "work");
fs.rmSync(work, { recursive: true, force: true });
fs.mkdirSync(work, { recursive: true });

function ff(...a: string[]) {
    const r = spawnSync("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", ...a], { stdio: "inherit" });
    if (r.status !== 0) throw new Error(`ffmpeg failed: ${a.join(" ")}`);
}
const esc = (s: string) => s.replace(/\\/g, "\\\\").replace(/:/g, "\\:").replace(/'/g, "\u2019").replace(/%/g, "\\%");
const text = (t: string, opts: string) => `drawtext=fontfile=${FONT}:text='${esc(t)}':borderw=8:bordercolor=black:${opts}`;
const f3 = (n: number) => n.toFixed(3);

const kills = info.events.filter((e) => e.kind === "kill").map((e) => e.t);
const hackerDead = info.events.find((e) => e.kind === "hacker_dead")?.t;
const end = Math.min(info.duration - 0.5, Math.max(...kills, hackerDead ?? 0) + 3);
const start = Math.max(1.5, (kills[0] ?? 10) - 8);

// ---- timeline: normal speed around kills, slow-mo on milestones, fast-forward the rest
type Seg = { s: number; e: number; speed: number; zoom: boolean };
const segs: Seg[] = [];
const milestone = (i: number) => (i + 1) % 10 === 0 || i === kills.length - 1;
let cur = start;
const push = (s: number, e: number, speed: number, zoom: boolean) => {
    if (e - s > 0.05) segs.push({ s, e, speed, zoom });
};
kills.forEach((k, i) => {
    const a = Math.max(cur, k - 1.5);
    const b = Math.min(end, k + 1);
    push(cur, a, a - cur > 3 ? 3 : 1, false); // a boring stretch goes by at 3x
    if (milestone(i)) {
        push(a, k - 0.6, 1, true);
        push(Math.max(a, k - 0.6), Math.min(b, k + 0.6), 0.5, true);
        push(Math.min(b, k + 0.6), b, 1, true);
    } else {
        push(a, b, 1, true);
    }
    cur = Math.max(cur, b);
});
push(cur, end, hackerDead ? 0.5 : 1, !!hackerDead);

// where a moment of the recording lands in the finished video
const outTime = (t: number) => {
    let o = INTRO;
    for (const g of segs) {
        if (t <= g.s) break;
        o += (Math.min(t, g.e) - g.s) / g.speed;
    }
    return o;
};
const killOut = kills.map(outTime);

// ---- 1. cut every segment (picture + game sound), then join
const atempo = (speed: number) => speed === 3 ? "atempo=2,atempo=1.5,volume=0.35" : `atempo=${speed}`;
const list: string[] = [];
segs.forEach((g, i) => {
    const f = path.join(work, `seg${String(i).padStart(4, "0")}.mp4`);
    // the camera follows the hacker, so a centre crop is a punch-in on them
    // (always a little closer than the game's view, harder on kills)
    const zoom = `crop=iw*${g.zoom ? 0.62 : 0.8}:ih*${g.zoom ? 0.62 : 0.8},scale=1920:1080,`;
    const dur = f3(g.e - g.s);
    const audioIn = hasGameAudio
        ? ["-ss", f3(Math.max(0, g.s - info.audioStart!)), "-t", dur, "-i", gameAudio]
        : ["-f", "lavfi", "-t", dur, "-i", "anullsrc=r=48000:cl=stereo"];
    ff(
        "-ss", f3(g.s), "-t", dur, "-i", raw, ...audioIn,
        "-filter_complex", `[0:v]${zoom}setpts=PTS/${g.speed},fps=60,format=yuv420p[v];[1:a]aresample=48000,${atempo(g.speed)},apad[a]`,
        "-map", "[v]", "-map", "[a]", "-t", f3((g.e - g.s) / g.speed),
        "-c:v", "libx264", "-preset", "veryfast", "-crf", "17", "-c:a", "aac", "-ar", "48000", "-ac", "2", f,
    );
    list.push(`file '${f}'`);
});
const intro = path.join(work, "intro.mp4");
ff(
    "-f", "lavfi", "-i", `color=c=0x111111:s=1920x1080:r=60:d=${INTRO}`,
    "-f", "lavfi", "-t", String(INTRO), "-i", "anullsrc=r=48000:cl=stereo",
    "-vf", [
        text(title, `fontsize=150:fontcolor=white:x=(w-tw)/2:y=(h-th)/2-60:alpha='min(1,t*3)'`),
        text("WHO WINS?", `fontsize=90:fontcolor=0xffd400:x=(w-tw)/2:y=(h/2)+90:enable='gt(t,1)'`),
    ].join(","),
    "-c:v", "libx264", "-preset", "veryfast", "-crf", "17", "-pix_fmt", "yuv420p", "-c:a", "aac", "-ar", "48000", "-ac", "2", intro,
);
const listFile = path.join(work, "list.txt");
fs.writeFileSync(listFile, [`file '${intro}'`, ...list].join("\n"));
const joined = path.join(work, "joined.mp4");
ff("-f", "concat", "-safe", "0", "-i", listFile, "-c", "copy", joined);
const body = INTRO + segs.reduce((a, g) => a + (g.e - g.s) / g.speed, 0);
const total = body + OUTRO;

// ---- 2. overlays: kill counter, alive counter, +1 pops, flashes, speed tags, outro card
const won = !hackerDead;
const outroText = won ? `${kills.length} KILLS. FLAWLESS.` : "THE HACKER FELL";
const draw: string[] = [`tpad=stop_mode=clone:stop_duration=${OUTRO}`];
segs.forEach((g) => {
    if (g.speed === 1) return;
    const a = outTime(g.s);
    const b = outTime(g.e);
    const tag = g.speed > 1 ? ">> 3X" : "SLOW-MO";
    draw.push(text(tag, `fontsize=54:fontcolor=white@0.85:borderw=5:x=(w-tw)/2:y=40:enable='between(t,${f3(a)},${f3(b)})'`));
});
killOut.forEach((t, i) => {
    const next = killOut[i + 1] ?? total;
    draw.push(
        text(`KILLS ${i + 1}`, `fontsize=72:fontcolor=white:x=50:y=40:enable='between(t,${f3(t)},${f3(next)})'`),
        text(`ALIVE ${Math.max(0, info.noobs - i - 1)}`, `fontsize=56:fontcolor=0x9be7ff:borderw=5:x=w-tw-50:y=46:enable='between(t,${f3(t)},${f3(Math.min(next, body))})'`),
        text("+1", `fontsize='110+160*max(0,0.12-(t-${f3(t)}))':fontcolor=0xff3030:x=(w-tw)/2+260:y=(h/2)-200-(t-${f3(t)})*80:enable='between(t,${f3(t)},${f3(t + 0.7)})'`),
        `drawbox=x=0:y=0:w=iw:h=ih:color=white@0.35:t=fill:enable='between(t,${f3(t)},${f3(t + 0.06)})'`,
    );
    if (milestone(i) && i !== kills.length - 1) {
        draw.push(text(`${i + 1} KILLS!`, `fontsize=140:fontcolor=0xffd400:x=(w-tw)/2:y=h*0.18:enable='between(t,${f3(t)},${f3(t + 1.6)})'`));
    }
});
// Gamerio-style callout pointing at the star, then narrator captions on the big moments
// (the camera keeps the star in the middle of the frame)
draw.push(
    text(info.focusLabel ?? "HACKER", `fontsize=110:fontcolor=white:x=(w/2)-tw-170:y=(h/2)-250:enable='between(t,${INTRO},${INTRO + 3})'`),
    `drawtext=fontfile='${ARROWS}':text='➘':fontsize=200:fontcolor=white:borderw=8:bordercolor=black:x=(w/2)-200:y=(h/2)-200:enable='between(t,${INTRO},${INTRO + 3})'`,
);
const lines = (n: number) => [`${n} down. He's just warming up.`, "This is not fair anymore", "The noobs are panicking", "Nobody can stop him", "Is this even legal?"][Math.floor(n / 10) - 1] ?? "He's still going...";
const captions: [number, string][] = [];
if (killOut[0] !== undefined) captions.push([killOut[0], "First blood."]);
killOut.forEach((t, i) => milestone(i) && i !== kills.length - 1 && captions.push([t + 1.6, lines(i + 1)]));
const knocked = info.events.find((e) => e.kind === "feed" && /knocked out/i.test(e.text) && e.text.toLowerCase().endsWith(`out ${info.name?.toLowerCase()}`));
if (knocked) captions.push([outTime(knocked.t), "WAIT WHAT"]);
if (hackerDead) captions.push([outTime(hackerDead), "NO WAY."]);
for (const [t, line] of captions) {
    draw.push(text(line, `fontsize=64:fontcolor=white:borderw=6:box=1:boxcolor=black@0.45:boxborderw=18:x=(w-tw)/2:y=h-200:enable='between(t,${f3(t)},${f3(t + 2.2)})'`));
}
draw.push(
    text(`ALIVE ${info.noobs}`, `fontsize=56:fontcolor=0x9be7ff:borderw=5:x=w-tw-50:y=46:enable='between(t,${INTRO},${f3(killOut[0] ?? body)})'`),
    `drawbox=x=0:y=0:w=iw:h=ih:color=black@0.55:t=fill:enable='gt(t,${f3(body)})'`,
    text(outroText, `fontsize=150:fontcolor=${won ? "0xff3030" : "0xffd400"}:x=(w-tw)/2:y=(h-th)/2-50:enable='gt(t,${f3(body)})'`),
    text("SUBSCRIBE FOR PART 2", `fontsize=70:fontcolor=white:borderw=5:x=(w-tw)/2:y=(h/2)+110:enable='gt(t,${f3(body + 1)})'`),
    `fade=t=out:st=${f3(total - 0.8)}:d=0.8`,
);

// ---- 3. sound: the game itself, a music bed, and the game's own sounds as hit effects
const sfx: { file: string; t: number; vol: number }[] = [
    { file: "ui/notification_start_01.mp3", t: 0.2, vol: 1 },
    { file: "sfx/bullet_whiz_01.mp3", t: INTRO - 0.3, vol: 1 },
    { file: won ? "ui/leader_assigned_01.mp3" : "ui/kill_leader_dead_01.mp3", t: body, vol: 1.2 },
];
killOut.forEach((t, i) => {
    sfx.push({ file: "hits/player_bullet_hit_01.mp3", t, vol: 1.3 });
    if (milestone(i)) {
        sfx.push({ file: "ui/kill_leader_assigned_01.mp3", t, vol: 1.1 }, { file: "sfx/explosion_02.mp3", t, vol: 0.7 });
    }
});
segs.forEach((g, i) => {
    // whoosh back to real time after a fast-forward
    if (g.speed > 1 && segs[i + 1]) sfx.push({ file: "sfx/bullet_whiz_02.mp3", t: outTime(g.e) - 0.25, vol: 0.8 });
});
// meme sounds you supply yourself (vine boom, airhorn, bruh...): film/sfx/boom.mp3, airhorn.mp3, bruh.mp3
const meme = (n: string) => ["mp3", "wav", "m4a"].map((x) => path.join(import.meta.dirname, "sfx", `${n}.${x}`)).find((f) => fs.existsSync(f));
const boom = meme("boom");
const airhorn = meme("airhorn");
const bruh = meme("bruh");
killOut.forEach((t, i) => {
    if (boom && milestone(i)) sfx.push({ file: boom, t, vol: 1 });
});
if (airhorn && won) sfx.push({ file: airhorn, t: body, vol: 0.8 });
if (bruh && hackerDead) sfx.push({ file: bruh, t: outTime(hackerDead), vol: 1 });
const thump = path.join(work, "thump.wav");
ff("-f", "lavfi", "-i", "sine=f=70:d=0.3", "-af", "afade=t=out:st=0:d=0.3,volume=2", thump);
killOut.forEach((t) => sfx.push({ file: thump, t, vol: 1 }));

const musicDir = path.join(import.meta.dirname, "music");
const music = fs.existsSync(musicDir) ? fs.readdirSync(musicDir).filter((f) => /\.(mp3|m4a|wav|ogg)$/i.test(f)).sort() : [];
const inputs = ["-i", joined];
const mixes = ["[0:a]volume=1.0[game]"];
const labels = ["[game]"];
if (music.length) {
    const ml = path.join(work, "music.txt");
    // repeat the playlist until it covers the video
    fs.writeFileSync(ml, Array.from({ length: 20 }, () => music.map((m) => `file '${path.join(musicDir, m)}'`)).flat().join("\n"));
    inputs.push("-f", "concat", "-safe", "0", "-i", ml);
    mixes.push(`[1:a]atrim=0:${f3(total)},volume=0.45,afade=t=in:st=0:d=0.5,afade=t=out:st=${f3(total - 2)}:d=2[music]`);
    labels.push("[music]");
}
sfx.forEach((s, i) => {
    const idx = inputs.filter((x) => x === "-i").length;
    inputs.push("-i", path.isAbsolute(s.file) ? s.file : path.join(SFX, s.file));
    mixes.push(`[${idx}:a]aresample=48000,volume=${s.vol},adelay=${Math.round(s.t * 1000)}:all=1[s${i}]`);
    labels.push(`[s${i}]`);
});
const graph = [
    `[0:v]${draw.join(",\n")}[vout]`,
    ...mixes,
    `${labels.join("")}amix=inputs=${labels.length}:normalize=0:duration=first,apad=whole_dur=${f3(total)},atrim=0:${f3(total)},`
    + "alimiter=limit=0.95,loudnorm=I=-14:TP=-1.5:LRA=11[aout]",
].join(";\n");
const graphFile = path.join(work, "graph.txt");
fs.writeFileSync(graphFile, graph);

const out = path.join(dir, "final.mp4");
ff(
    ...inputs,
    "-/filter_complex", graphFile,
    "-map", "[vout]", "-map", "[aout]",
    "-c:v", "libx264", "-preset", "medium", "-crf", "18", "-pix_fmt", "yuv420p",
    "-c:a", "aac", "-b:a", "192k", "-ar", "48000", "-movflags", "+faststart", "-t", f3(total), out,
);

// ---- 4. thumbnail: the busiest moment, punched in and saturated, with the matchup in huge type
const busiest = kills.reduce((best, k) => {
    const n = kills.filter((x) => Math.abs(x - k) < 5).length;
    return n > best.n ? { k, n } : best;
}, { k: kills[0] ?? info.duration / 2, n: 0 }).k;
const [left, right] = title.includes(" vs ") ? title.split(" vs ") : [title, ""];
ff(
    "-ss", f3(busiest), "-i", raw, "-frames:v", "1",
    "-vf", [
        "crop=iw*0.45:ih*0.45,scale=1280:720",
        "eq=saturation=1.7:contrast=1.2:brightness=0.03",
        "vignette=PI/4",
        // red ring + arrow on the star, who sits in the middle of the frame
        `drawtext=fontfile='${ARROWS}':text='◯':fontsize=260:fontcolor=0xff2a2a:borderw=6:bordercolor=black:x=(w-tw)/2:y=(h-th)/2-20`,
        `drawtext=fontfile='${ARROWS}':text='➘':fontsize=200:fontcolor=0xff2a2a:borderw=8:bordercolor=black:x=(w/2)-300:y=(h/2)-230`,
        text(left, "fontsize=150:fontcolor=0xff2a2a:borderw=12:x=40:y=30"),
        ...(right
            ? [
                text("VS", "fontsize=110:fontcolor=0xffd400:borderw=10:x=w-tw-60:y=(h-th)/2-40"),
                text(right, "fontsize=150:fontcolor=white:borderw=12:x=w-tw-40:y=h-th-40"),
            ]
            : []),
        text(`${kills.length} KILLS`, "fontsize=90:fontcolor=0xffd400:borderw=10:x=40:y=h-th-50"),
    ].join(","),
    path.join(dir, "thumbnail.jpg"),
);

// ---- 5. description, with the credits NCS asks for
// only credit the tracks that actually play before the video ends
const played: string[] = [];
for (let t = 0, i = 0; music.length && t < total; i++) {
    const m = music[i % music.length];
    if (!played.includes(m)) played.push(m);
    const probe = spawnSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", path.join(musicDir, m)]);
    t += Number(probe.stdout.toString()) || total;
}
const credits = played.length
    ? played.map((m) => `${path.parse(m).name.replace(/^\d+ /, "")}\nMusic provided by NoCopyrightSounds.`).join("\n\n")
    : "(no music used)";
fs.writeFileSync(
    path.join(dir, "description.txt"),
    `${title} | Surviv.io\n\n${won ? `The hacker took out ${kills.length} players. Who's next?` : `${kills.length} kills... and then the hacker fell.`}\n`
        + `\n➖➖➖➖➖➖➖➖➖➖\n🎵 Music in this video:\n\n${credits}\n➖➖➖➖➖➖➖➖➖➖\n\n#survivio #iogames #hacker\n`,
);

console.log(`\n${kills.length} kills, ${total.toFixed(0)}s\n  ${out}\n  ${path.join(dir, "thumbnail.jpg")}\n  ${path.join(dir, "description.txt")}`);
if (!music.length) console.log("(no music: put NCS tracks in film/music/ and re-run)");
