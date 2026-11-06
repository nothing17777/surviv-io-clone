import type { AbilityKey } from "../../../../shared/defs/gameObjects/championDefs.ts";
import { math } from "../../../../shared/utils/math.ts";
import { v2, type Vec2 } from "../../../../shared/utils/v2.ts";
import type { Champion } from "../champion.ts";
import type { Player } from "../objects/player.ts";
import type { ChampionKitMap } from "./types.ts";

/** hand-written kits, batch 4 (see types.ts: do not read anything off `c` outside a callback) */

// ---- helpers shared by this batch's kits. Each takes the champion and is only called from inside a
// cast, so none of them touches `c.def` / `c.stats` while the Champion is still being built.

const dirOf = (from: Vec2, to: Vec2) => v2.normalizeSafe(v2.sub(to, from), v2.create(1, 0));
/** the game's clock in seconds: it only moves with the simulation, unlike performance.now() */
const clock = (c: Champion) => c.player.game.timeRunning;

/** distance from a point to the segment a-b */
function segDist(p: Vec2, a: Vec2, b: Vec2) {
    const ab = v2.sub(b, a);
    const len2 = v2.dot(ab, ab);
    const t = len2 > 0 ? math.clamp(v2.dot(v2.sub(p, a), ab) / len2, 0, 1) : 0;
    return v2.distance(p, v2.add(a, v2.mul(ab, t)));
}

/** enemies inside a rectangle that starts at `from` and runs `len` along `dir` */
function inLine(c: Champion, from: Vec2, dir: Vec2, len: number, width: number) {
    const side = v2.perp(dir);
    return c.enemies(len + width + 2, from).filter((e) => {
        const to = v2.sub(e.pos, from);
        const along = v2.dot(to, dir);
        return along > 0 && along < len + e.rad && Math.abs(v2.dot(to, side)) < width + e.rad;
    });
}

/** enemies within `range` of the champion, in a cone of `half` degrees either side of where they aim */
function inCone(c: Champion, range: number, half: number) {
    const cos = Math.cos((half * Math.PI) / 180);
    return c.enemies(range).filter((e) => v2.dot(dirOf(c.player.pos, e.pos), c.aim) >= cos);
}

interface Flight {
    /** the projectile's id in the bullets file; its speed there has to match `speed` */
    id: string;
    key: AbilityKey;
    speed: number;
    range: number;
    width: number;
    dir?: Vec2;
    from?: Vec2;
    pierce?: boolean;
    hit?: (e: Player, travelled: number, at: Vec2) => void;
    end?: (at: Vec2) => void;
}

/**
 * A skillshot that can do more than damage. The bullet in the bullets file is only what the player
 * sees; its path is swept here every tick so a hit can root, pull, mark or heal.
 */
function fly(c: Champion, f: Flight) {
    const from = v2.copy(f.from ?? c.player.pos);
    const dir = v2.normalizeSafe(f.dir ?? c.aim);
    c.shoot(f.id, f.key, dir, { from, distance: f.range });
    const t0 = clock(c);
    const struck = new Set<Player>();
    let last = from;
    const step = () => {
        const travelled = Math.min(f.range, (clock(c) - t0) * f.speed);
        const at = v2.add(from, v2.mul(dir, travelled));
        for (const e of c.enemies(f.width + 2 + f.speed * 0.1, at)) {
            if (struck.has(e) || segDist(e.pos, last, at) > f.width + e.rad) continue;
            struck.add(e);
            f.hit?.(e, travelled, at);
            if (!f.pierce) return;
        }
        last = at;
        if (travelled >= f.range) f.end?.(at);
        else c.later(0.02, step);
    };
    c.later(0.02, step);
}

const repeat = (c: Champion, times: number, every: number, run: (i: number) => void) => {
    for (let i = 1; i <= times; i++) c.later(every * i, () => run(i));
};

const stun = (e: Player, t: number) => {
    e.debuffs.root = Math.max(e.debuffs.root, t);
    e.debuffs.silence = Math.max(e.debuffs.silence, t);
};
const knockUp = (e: Player, t: number) => {
    e.debuffs.airborne = Math.max(e.debuffs.airborne, t);
};
const charm = (e: Player, t: number) => {
    if (e.charmDuration <= 0) e.setDirty();
    e.charmDuration = Math.max(e.charmDuration, t);
};
const shove = (e: Player, dir: Vec2, dist: number, speed = 40) => {
    e.webPull = { target: v2.add(e.pos, v2.mul(dir, dist)), speed, time: dist / speed + 0.2 };
};
const pullTo = (e: Player, pos: Vec2, speed = 40) => {
    e.webPull = { target: v2.copy(pos), speed, time: v2.distance(e.pos, pos) / speed + 0.2 };
};
const cleanse = (c: Champion) => {
    const d = c.player.debuffs;
    d.root =
        d.slow =
        d.silence =
        d.airborne =
            0;
    c.player.charmDuration = 0;
};

type Stat = "moveSpeed" | "attackSpeed" | "damage" | "damageReduction";
/** a timed self buff: raises the stats now and takes them off again, and flags `name` in c.buffs */
function temp(c: Champion, name: string, secs: number, stats: Partial<Record<Stat, number>>) {
    c.buffs[name] = secs;
    const list = Object.entries(stats) as Array<[Stat, number]>;
    for (const [k, v] of list) c.stats[k] += v;
    c.later(secs, () => {
        for (const [k, v] of list) c.stats[k] -= v;
    });
}

/** a marker the clients play a hit effect on, where no projectile flies (a trap, a landing, a clone) */
const spot = (c: Champion, key: AbilityKey, pos: Vec2) => c.shoot("mark", key, c.aim, { from: pos, distance: 0.1 });

const capTraps = (c: Champion, max: number) => {
    const snaps = c.traps.filter((t) => t.kind === "snap");
    if (snaps.length > max) c.traps.splice(c.traps.indexOf(snaps[0]), 1);
};

export const kits: ChampionKitMap = {
    nidalee: (c) => {
        let cougar = false;
        return {
            // Javelin Toss: grows stronger the further it flies. Takedown (cougar): a lunge that bites
            // harder the less health the target has left
            q: () => {
                if (cougar) {
                    const t = c.nearest(7);
                    if (!t) return false;
                    c.dash(v2.add(t.pos, v2.mul(dirOf(t.pos, c.player.pos), 1.5)), 70);
                    c.later(0.15, () => {
                        if (!t.dead) c.hit(t, 35 + (1 - t.health / t.maxHealth) * 55, "q");
                    });
                    return;
                }
                const range = c.reach("q");
                fly(c, {
                    id: "nidalee_q",
                    key: "q",
                    speed: 110,
                    range,
                    width: 1.2,
                    hit: (e, d) => c.hit(e, 30 + (50 * d) / range, "q"),
                });
            },
            // Bushwhack: a trap that roots whoever steps on it. Pounce (cougar): a leap that lands hard
            w: () => {
                if (cougar) {
                    const to = c.cursor(12);
                    const speed = 60;
                    c.dash(to, speed);
                    c.later(v2.distance(to, c.player.pos) / speed + 0.1, () => {
                        for (const e of c.enemies(4)) c.hit(e, 45, "w");
                    });
                    return;
                }
                const pos = c.at("w");
                spot(c, "w", pos);
                c.traps.push({ pos, arm: 0.5, life: 30, kind: "snap" });
                capTraps(c, 3);
            },
            // Primal Surge: heals her and quickens her attacks. Swipe (cougar): a claw in front of her
            e: () => {
                if (cougar) {
                    const hits = inCone(c, 8, 50);
                    if (!hits.length) return false;
                    for (const e of hits) c.hit(e, 50, "e");
                    return;
                }
                c.heal(35);
                temp(c, "nidalee_e", 4, { attackSpeed: 0.6 });
            },
            // Aspect of the Cougar: switches form, and the cougar is quicker on her feet
            r: () => {
                cougar = !cougar;
                c.stats.moveSpeed += cougar ? 1.5 : -1.5;
                c.buffs.nidalee_cougar = cougar ? 1e6 : 0;
            },
        };
    },

    nilah: (c) => ({
        // Formless Blade: a thrust through everything in a line
        q: () => {
            const range = c.reach("q");
            fly(c, {
                id: "nilah_q",
                key: "q",
                speed: 120,
                range,
                width: 1.6,
                pierce: true,
                hit: (e) => c.hit(e, 45, "q"),
            });
        },
        // Jubilant Veil: quicker, tougher and hitting faster for a moment
        w: () => {
            temp(c, "nilah_w", 3, { attackSpeed: 0.5, moveSpeed: 1.5, damageReduction: 0.3 });
        },
        // Slipstream: dashes through an enemy, cutting it on the way
        e: () => {
            const t = c.nearest(c.reach("e"));
            if (!t) return false;
            c.dash(v2.add(t.pos, v2.mul(dirOf(c.player.pos, t.pos), 3)), 55);
            c.hit(t, 45, "e");
        },
        // Apotheosis: drags everyone nearby in and cuts them three times
        r: () => {
            const r = c.reach("r");
            const pass = () => {
                for (const e of c.enemies(r)) {
                    pullTo(e, v2.add(c.player.pos, v2.mul(dirOf(c.player.pos, e.pos), 2)), 22);
                    c.hit(e, 35, "r");
                }
            };
            c.later(0.3, pass);
            c.later(0.9, pass);
            c.later(1.5, pass);
            c.buffs.nilah_r = 1.5;
        },
    }),

    nocturne: (c) => ({
        // Duskbringer: a blade of shadow that cuts through everyone in its path
        q: () => {
            let healed = false;
            fly(c, {
                id: "nocturne_q",
                key: "q",
                speed: 90,
                range: c.reach("q"),
                width: 1.8,
                pierce: true,
                hit: (e) => {
                    c.hit(e, 55, "q");
                    if (!healed) c.heal(10);
                    healed = true;
                },
            });
        },
        // Shroud of Darkness: a spell shield and a flurry of attacks
        w: () => {
            c.addShield(50);
            temp(c, "nocturne_w", 4, { attackSpeed: 0.6 });
        },
        // Unspeakable Horror: tethers the nearest enemy, silencing it, and bites hard if it is still near
        e: () => {
            const t = c.nearest(c.reach("e"));
            if (!t) return false;
            c.hit(t, 20, "e");
            t.debuffs.applySlow(0.4, 2);
            t.debuffs.silence = Math.max(t.debuffs.silence, 2);
            c.later(2, () => {
                if (!t.dead && v2.distance(t.pos, c.player.pos) <= 16) {
                    c.hit(t, 50, "e");
                    stun(t, 0.5);
                }
            });
        },
        // Paranoia: crosses the whole map to the nearest enemy
        r: () => {
            const t = c.nearest(c.reach("r"));
            if (!t) return false;
            c.buffs.nocturne_r = 1;
            c.dash(t.pos, 150);
            c.later(v2.distance(t.pos, c.player.pos) / 150 + 0.25, () => {
                if (!t.dead) c.hit(t, 90, "r");
            });
        },
    }),

    nunu: (c) => ({
        // Consume: a bite that heals
        q: () => {
            const t = c.nearest(6);
            if (!t) return false;
            c.hit(t, 55, "q");
            c.heal(30);
        },
        // Biggest Snowball Ever!: rolls forward, knocking up everything it meets
        w: () => {
            const to = c.cursor(25);
            c.shoot("nunu_w", "w", dirOf(c.player.pos, to), { distance: 25 });
            c.dash(to, 55);
            const struck = new Set<Player>();
            repeat(c, 10, 0.1, () => {
                for (const e of c.enemies(4)) {
                    if (struck.has(e)) continue;
                    struck.add(e);
                    c.hit(e, 40, "w");
                    knockUp(e, 0.9);
                }
            });
        },
        // Snowball Barrage: four snowballs fanned out, slowing what they hit
        e: () => {
            for (const a of [-0.18, -0.06, 0.06, 0.18]) {
                fly(c, {
                    id: "nunu_e",
                    key: "e",
                    speed: 80,
                    range: c.reach("e"),
                    width: 1.1,
                    dir: v2.rotate(c.aim, a),
                    hit: (e) => {
                        c.hit(e, 20, "e");
                        e.debuffs.applySlow(0.3, 1.5);
                    },
                });
            }
        },
        // Absolute Zero: a blizzard that slows and shreds everyone near, then bursts
        r: () => {
            c.buffs.nunu_r = 3.6;
            c.addShield(40);
            repeat(c, 7, 0.5, () => {
                for (const e of c.enemies(16)) {
                    c.hit(e, 22, "r");
                    e.debuffs.applySlow(0.6, 1);
                }
            });
            c.later(3.6, () => {
                for (const e of c.enemies(16)) c.hit(e, 50, "r");
            });
        },
    }),

    olaf: (c) => ({
        // Undertow: an axe that slows everything it cuts
        q: () => {
            fly(c, {
                id: "olaf_q",
                key: "q",
                speed: 80,
                range: c.reach("q"),
                width: 1.6,
                pierce: true,
                hit: (e) => {
                    c.hit(e, 50, "q");
                    e.debuffs.applySlow(0.4, 1.5);
                },
            });
        },
        // Tough It Out: a shield and a berserker's pace
        w: () => {
            c.addShield(45);
            temp(c, "olaf_w", 5, { attackSpeed: 0.6 });
        },
        // Reckless Swing: true damage, paid for in his own blood
        e: () => {
            const t = c.nearest(c.reach("e"));
            if (!t) return false;
            const p = c.player;
            p.health = Math.max(1, p.health - 12);
            p.setDirty();
            c.hit(t, 55, "e", true);
        },
        // Ragnarok: immune to crowd control and stronger for a while
        r: () => {
            cleanse(c);
            temp(c, "olaf_r", 6, { damage: 0.4, damageReduction: 0.2 });
            repeat(c, 30, 0.2, () => cleanse(c));
        },
    }),

    orianna: (c) => {
        // where her ball is, or undefined while it is with her
        let ball: Vec2 | undefined;
        return {
            // Command: Attack: sends the ball across the target area, the first to be hit hurt most
            q: () => {
                const from = v2.copy(ball ?? c.player.pos);
                const to = c.at("q");
                const range = Math.max(1, v2.distance(from, to));
                let n = 0;
                fly(c, {
                    id: "orianna_q",
                    key: "q",
                    speed: 70,
                    range,
                    width: 2,
                    from,
                    dir: dirOf(from, to),
                    pierce: true,
                    hit: (e) => c.hit(e, Math.max(25, 55 - 8 * n++), "q"),
                    end: (at) => {
                        ball = at;
                    },
                });
            },
            // Command: Dissonance: the ball pulses, slowing foes around it
            w: () => {
                const at = v2.copy(ball ?? c.player.pos);
                spot(c, "w", at);
                c.later(0.25, () => {
                    for (const e of c.enemies(8, at)) {
                        c.hit(e, 40, "w");
                        e.debuffs.applySlow(0.4, 2);
                    }
                });
            },
            // Command: Protect: the ball comes back to her, shielding her and cutting what it passes
            e: () => {
                c.addShield(55);
                if (!ball) return;
                const from = ball;
                ball = undefined;
                fly(c, {
                    id: "orianna_e",
                    key: "e",
                    speed: 90,
                    range: Math.max(1, v2.distance(from, c.player.pos)),
                    width: 1.6,
                    from,
                    dir: dirOf(from, c.player.pos),
                    pierce: true,
                    hit: (e) => c.hit(e, 35, "e"),
                });
            },
            // Command: Shockwave: after a beat, everything near the ball is dragged onto it
            r: () => {
                const at = v2.copy(ball ?? c.player.pos);
                spot(c, "r", at);
                c.later(0.5, () => {
                    for (const e of c.enemies(14, at)) {
                        c.hit(e, 90, "r");
                        pullTo(e, at, 35);
                        knockUp(e, 0.5);
                    }
                });
            },
        };
    },

    ornn: (c) => ({
        // Volcanic Rupture: a wall of rock that slows
        q: () => {
            fly(c, {
                id: "ornn_q",
                key: "q",
                speed: 90,
                range: c.reach("q"),
                width: 2,
                pierce: true,
                hit: (e) => {
                    c.hit(e, 50, "q");
                    e.debuffs.applySlow(0.4, 2);
                },
            });
        },
        // Bellows Breath: a cone of fire that burns a second time
        w: () => {
            const hits = inCone(c, 10, 35);
            if (!hits.length) return false;
            for (const e of hits) {
                c.hit(e, 40, "w");
                c.later(0.6, () => {
                    if (!e.dead) c.hit(e, 20, "w");
                });
            }
        },
        // Searing Charge: a ram that knocks up whatever it lands on
        e: () => {
            const to = c.cursor(15);
            const speed = 70;
            c.dash(to, speed);
            c.later(v2.distance(to, c.player.pos) / speed + 0.1, () => {
                for (const e of c.enemies(5.5)) {
                    c.hit(e, 55, "e");
                    knockUp(e, 0.8);
                }
            });
        },
        // Call of the Forge God: a charging elemental, which turns round and knocks up on the way back
        r: () => {
            c.later(0.8, () => {
                const dir = c.aim;
                fly(c, {
                    id: "ornn_r",
                    key: "r",
                    speed: 55,
                    range: 40,
                    width: 3.5,
                    dir,
                    pierce: true,
                    hit: (e) => {
                        c.hit(e, 60, "r");
                        e.debuffs.applySlow(0.5, 2);
                    },
                    end: (at) =>
                        fly(c, {
                            id: "ornn_r",
                            key: "r",
                            speed: 55,
                            range: 40,
                            width: 3.5,
                            from: at,
                            dir: v2.mul(dir, -1),
                            pierce: true,
                            hit: (e) => {
                                c.hit(e, 60, "r");
                                knockUp(e, 1);
                            },
                        }),
                });
            });
        },
    }),

    pantheon: (c) => ({
        // Comet Spear: a thrust that finishes the wounded
        q: () => {
            fly(c, {
                id: "pantheon_q",
                key: "q",
                speed: 150,
                range: c.reach("q"),
                width: 1.6,
                pierce: true,
                hit: (e) => c.hit(e, 45 + (e.health < e.maxHealth * 0.4 ? 25 : 0), "q"),
            });
        },
        // Shield Vault: leaps onto the nearest enemy and stuns it
        w: () => {
            const t = c.nearest(c.reach("w"));
            if (!t) return false;
            c.dash(t.pos, 90);
            c.later(v2.distance(t.pos, c.player.pos) / 90 + 0.15, () => {
                if (t.dead) return;
                c.hit(t, 40, "w");
                stun(t, 1);
            });
        },
        // Aegis Assault: braced behind the shield, three strikes in front of him
        e: () => {
            c.player.dodgeTime = Math.max(c.player.dodgeTime, 1);
            c.addShield(25);
            repeat(c, 3, 0.3, () => {
                for (const e of inCone(c, 9, 45)) c.hit(e, 22, "e");
            });
        },
        // Grand Starfall: out of sight, then down on the target area
        r: () => {
            const to = c.cursor(60);
            c.buffs.pantheon_r = 1.4;
            c.player.dodgeTime = Math.max(c.player.dodgeTime, 1.4);
            c.later(0.5, () => c.dash(to, 150));
            c.later(1.4, () => {
                spot(c, "r", to);
                for (const e of c.enemies(8, to)) {
                    c.hit(e, 100, "r");
                    e.debuffs.applySlow(0.5, 2);
                }
            });
        },
    }),

    poppy: (c) => ({
        // Hammer Shock: a shockwave that slows, and goes off again
        q: () => {
            fly(c, {
                id: "poppy_q",
                key: "q",
                speed: 100,
                range: c.reach("q"),
                width: 2.2,
                pierce: true,
                hit: (e) => {
                    c.hit(e, 45, "q");
                    e.debuffs.applySlow(0.3, 1.5);
                    c.later(0.9, () => {
                        if (!e.dead) c.hit(e, 25, "q");
                    });
                },
            });
        },
        // Steadfast Presence: a burst of speed behind a shield
        w: () => {
            c.addShield(35);
            temp(c, "poppy_w", 2, { moveSpeed: 3 });
        },
        // Heroic Charge: grabs the nearest enemy, drives it away and stuns it
        e: () => {
            const t = c.nearest(c.reach("e"));
            if (!t) return false;
            const dir = dirOf(c.player.pos, t.pos);
            c.dash(v2.sub(t.pos, v2.mul(dir, 1.5)), 80);
            c.later(v2.distance(t.pos, c.player.pos) / 80 + 0.1, () => {
                if (t.dead) return;
                c.hit(t, 40, "e");
                shove(t, dir, 8, 45);
                stun(t, 1);
            });
        },
        // Keeper's Verdict: after a charge-up, a wave that throws everything away from her
        r: () => {
            c.buffs.poppy_r = 0.7;
            c.later(0.7, () => {
                const dir = c.aim;
                fly(c, {
                    id: "poppy_r",
                    key: "r",
                    speed: 70,
                    range: 17,
                    width: 3,
                    dir,
                    pierce: true,
                    hit: (e) => {
                        c.hit(e, 70, "r");
                        knockUp(e, 0.8);
                        shove(e, dir, 8, 40);
                    },
                });
            });
        },
    }),

    pyke: (c) => ({
        // Bone Skewer: a hook that drags its target in
        q: () => {
            fly(c, {
                id: "pyke_q",
                key: "q",
                speed: 110,
                range: 22,
                width: 1.4,
                hit: (e) => {
                    c.hit(e, 50, "q");
                    pullTo(e, v2.add(c.player.pos, v2.mul(dirOf(c.player.pos, e.pos), 2)), 60);
                    e.debuffs.applySlow(0.4, 1.2);
                },
            });
        },
        // Ghostwater Dive: moves fast, unseen
        w: () => {
            temp(c, "pyke_w", 4, { moveSpeed: 3 });
        },
        // Phantom Undertow: his shade rakes the line in front of him, then drags back and stuns it
        e: () => {
            const from = v2.copy(c.player.pos);
            const dir = c.aim;
            const hits = inLine(c, from, dir, c.reach("e"), 2.5);
            c.dash(v2.add(from, v2.mul(dir, 8)), 70);
            c.later(0.5, () => {
                for (const e of hits) {
                    if (e.dead) continue;
                    c.hit(e, 40, "e");
                    stun(e, 1);
                }
            });
        },
        // Death From Below: marks everyone near, and executes the weak
        r: () => {
            const targets = c.enemies(c.reach("r"));
            if (!targets.length) return false;
            c.buffs.pyke_r = 0.5;
            c.dash(targets[0].pos, 200);
            c.later(0.5, () => {
                for (const t of targets) {
                    if (t.dead) continue;
                    const weak = t.health <= t.maxHealth * 0.3;
                    c.hit(t, weak ? t.health + 60 : 70, "r", true);
                    if (t.dead) c.cooldowns[3] = 0;
                }
            });
        },
    }),

    qiyana: (c) => {
        // 1 water slows, 2 brush roots, 3 rock stuns: Terrain Mastery swaps the element Q carries
        let elem = 0;
        return {
            // Edge of Ixtal: a throw that carries the element she last drew from the terrain
            q: () => {
                const e0 = c.buff("qiyana_imbue") ? elem : 0;
                c.buffs.qiyana_imbue = 0;
                fly(c, {
                    id: "qiyana_q",
                    key: "q",
                    speed: 120,
                    range: c.reach("q"),
                    width: 1.6,
                    pierce: true,
                    hit: (e) => {
                        c.hit(e, 50 + (e0 ? 20 : 0), "q");
                        if (e0 === 1) e.debuffs.applySlow(0.5, 2);
                        else if (e0 === 2) e.debuffs.root = Math.max(e.debuffs.root, 1);
                        else if (e0 === 3) stun(e, 0.8);
                    },
                });
            },
            // Terrain Mastery: a dash that imbues her next Q with the next element
            w: () => {
                elem = (elem % 3) + 1;
                c.buffs.qiyana_imbue = 6;
                c.dash(c.cursor(18), 90);
                c.addShield(20);
            },
            // Audacity: through the nearest enemy
            e: () => {
                const t = c.nearest(c.reach("e"));
                if (!t) return false;
                c.dash(v2.add(t.pos, v2.mul(dirOf(c.player.pos, t.pos), 3)), 100);
                c.hit(t, 50, "e");
            },
            // Supreme Display of Talent: a wave that drives everything back and stuns it
            r: () => {
                const dir = c.aim;
                fly(c, {
                    id: "qiyana_r",
                    key: "r",
                    speed: 90,
                    range: 25,
                    width: 3.5,
                    dir,
                    pierce: true,
                    hit: (e) => {
                        c.hit(e, 80, "r");
                        shove(e, dir, 7, 35);
                        stun(e, 0.9);
                    },
                });
            },
        };
    },

    quinn: (c) => ({
        // Blinding Assault: Valor's strike, which blinds
        q: () => {
            fly(c, {
                id: "quinn_q",
                key: "q",
                speed: 100,
                range: c.reach("q"),
                width: 1.5,
                hit: (e) => {
                    c.hit(e, 45, "q");
                    e.debuffs.silence = Math.max(e.debuffs.silence, 1);
                    e.debuffs.applySlow(0.2, 1);
                },
            });
        },
        // Heightened Senses: Valor spots for her and she moves and shoots faster
        w: () => {
            temp(c, "quinn_w", 3, { attackSpeed: 0.5, moveSpeed: 1.5 });
        },
        // Vault: kicks off the nearest enemy and springs back
        e: () => {
            const t = c.nearest(c.reach("e"));
            if (!t) return false;
            const dir = dirOf(c.player.pos, t.pos);
            c.dash(v2.sub(t.pos, v2.mul(dir, 1.5)), 120);
            c.hit(t, 40, "e");
            t.debuffs.applySlow(0.5, 1.5);
            c.later(0.3, () => c.dash(v2.sub(t.pos, v2.mul(dir, 7)), 90));
        },
        // Behind Enemy Lines: Valor's speed, then the Skystrike
        r: () => {
            temp(c, "quinn_r", 3, { moveSpeed: 3 });
            c.later(0.8, () => {
                for (const e of c.enemies(9)) c.hit(e, 55 + (e.maxHealth - e.health) * 0.3, "r");
            });
        },
    }),

    rakan: (c) => ({
        // Gleaming Quill: a feather that heals him where it lands
        q: () => {
            fly(c, {
                id: "rakan_q",
                key: "q",
                speed: 100,
                range: c.reach("q"),
                width: 1.5,
                hit: (e) => {
                    c.hit(e, 50, "q");
                    c.heal(25);
                },
            });
        },
        // Grand Entrance: a leap that knocks up where he lands
        w: () => {
            const to = c.cursor(20);
            c.dash(to, 90);
            c.later(v2.distance(to, c.player.pos) / 90 + 0.15, () => {
                for (const e of c.enemies(5.5)) {
                    c.hit(e, 45, "w");
                    knockUp(e, 0.8);
                }
            });
        },
        // Battle Dance: a dash behind a shield
        e: () => {
            c.addShield(55);
            c.dash(c.cursor(14), 80);
            temp(c, "rakan_e", 2, { moveSpeed: 2 });
        },
        // Encore: charms everyone near
        r: () => {
            temp(c, "rakan_r", 3, { moveSpeed: 3 });
            for (const e of c.enemies(8)) {
                c.hit(e, 35, "r");
                charm(e, 1.2);
                e.debuffs.applySlow(0.6, 1.2);
            }
        },
    }),

    rammus: (c) => ({
        // Powerball: rolls forward and knocks up what it hits
        q: () => {
            const to = c.cursor(25);
            c.dash(to, 70);
            const struck = new Set<Player>();
            repeat(c, 10, 0.07, () => {
                for (const e of c.enemies(3.5)) {
                    if (struck.has(e)) continue;
                    struck.add(e);
                    c.hit(e, 50, "q");
                    knockUp(e, 0.8);
                }
            });
        },
        // Defensive Ball Curl: takes less damage and spikes anyone close
        w: () => {
            temp(c, "rammus_w", 5, { damageReduction: 0.4 });
            repeat(c, 8, 0.6, () => {
                for (const e of c.enemies(4.5)) c.hit(e, 10, "w");
            });
        },
        // Frenzying Taunt: everyone near is forced toward him
        e: () => {
            const targets = c.enemies(c.reach("e"));
            if (!targets.length) return false;
            for (const e of targets) {
                c.hit(e, 20, "e");
                e.webPull = { target: v2.add(e.pos, v2.mul(dirOf(e.pos, c.player.pos), 3)), speed: 8, time: 1.5 };
                e.debuffs.applySlow(0.3, 1.5);
            }
        },
        // Soaring Slam: a long leap and a shockwave
        r: () => {
            const to = c.cursor(40);
            c.dash(to, 80);
            c.later(v2.distance(to, c.player.pos) / 80 + 0.2, () => {
                for (const e of c.enemies(9)) {
                    c.hit(e, 85, "r");
                    e.debuffs.applySlow(0.6, 2);
                }
            });
        },
    }),

    reksai: (c) => {
        let burrowed = false;
        return {
            // Queen's Wrath: a flurry on the ground. Prey Seeker: a missile from underground
            q: () => {
                if (burrowed) {
                    fly(c, {
                        id: "reksai_q",
                        key: "q",
                        speed: 100,
                        range: 25,
                        width: 1.5,
                        hit: (e) => c.hit(e, 65, "q"),
                    });
                    return;
                }
                c.nextAttackBonus = Math.max(c.nextAttackBonus, 0.6);
                temp(c, "reksai_q", 3, { attackSpeed: 0.5 });
                for (const e of c.enemies(6)) c.hit(e, 35, "q");
            },
            // Burrow / Unburrow: coming up knocks up whatever is above
            w: () => {
                if (burrowed) {
                    burrowed = false;
                    c.stats.moveSpeed -= 2;
                    c.buffs.reksai_burrow = 0;
                    for (const e of c.enemies(7)) {
                        c.hit(e, 50, "w");
                        knockUp(e, 1);
                    }
                    return;
                }
                burrowed = true;
                c.stats.moveSpeed += 2;
                c.buffs.reksai_burrow = 1e6;
            },
            // Furious Bite on the ground, Tunnel underneath
            e: () => {
                if (burrowed) {
                    c.dash(c.cursor(20), 110);
                    return;
                }
                const t = c.nearest(c.reach("e"));
                if (!t) return false;
                c.hit(t, 45, "e", true);
            },
            // Void Rush: marks the nearest enemy and tunnels to it, hurting more the weaker it is
            r: () => {
                const t = c.nearest(c.reach("r"));
                if (!t) return false;
                c.buffs.reksai_r = 0.8;
                c.later(0.5, () => c.dash(t.pos, 250));
                c.later(0.8, () => {
                    if (!t.dead) c.hit(t, 60 + (t.maxHealth - t.health) * 0.4, "r", true);
                });
            },
        };
    },

    rell: (c) => {
        let mounted = true;
        return {
            // Shattering Strike: a lance thrust
            q: () => {
                const hits = inLine(c, c.player.pos, c.aim, 16, 1.8);
                if (!hits.length) return false;
                spot(c, "q", v2.add(c.player.pos, v2.mul(c.aim, 3)));
                for (const e of hits) {
                    c.hit(e, 45, "q");
                    e.debuffs.applySlow(0.2, 1.5);
                }
            },
            // Ferromancy: dismounts and mounts again, crashing down on each
            w: () => {
                const wasMounted = mounted;
                mounted = !mounted;
                c.buffs.rell_mounted = mounted ? 1e6 : 0;
                c.addShield(wasMounted ? 40 : 20);
                for (const e of c.enemies(6)) {
                    c.hit(e, 45, "w");
                    knockUp(e, 0.8);
                }
            },
            // Attract and Repel: drags everyone in, then throws them back out
            e: () => {
                const targets = c.enemies(16);
                if (!targets.length) return false;
                for (const e of targets) {
                    c.hit(e, 30, "e");
                    pullTo(e, v2.add(c.player.pos, v2.mul(dirOf(c.player.pos, e.pos), 2)), 35);
                }
                c.later(0.9, () => {
                    for (const e of c.enemies(7)) {
                        c.hit(e, 35, "e");
                        shove(e, dirOf(c.player.pos, e.pos), 6, 40);
                    }
                });
            },
            // Magnet Storm: a pulling storm
            r: () => {
                if (!c.enemies(12).length) return false;
                c.addShield(30);
                const pass = () => {
                    for (const e of c.enemies(12)) {
                        pullTo(e, v2.add(c.player.pos, v2.mul(dirOf(c.player.pos, e.pos), 2)), 30);
                        c.hit(e, 25, "r");
                        e.debuffs.applySlow(0.5, 1);
                    }
                };
                pass();
                repeat(c, 2, 0.6, pass);
            },
        };
    },

    renata: (c) => ({
        // Hand Shake: a grab that holds its target in place
        q: () => {
            fly(c, {
                id: "renata_q",
                key: "q",
                speed: 100,
                range: c.reach("q"),
                width: 1.3,
                hit: (e) => {
                    c.hit(e, 50, "q");
                    e.debuffs.root = Math.max(e.debuffs.root, 0.8);
                },
            });
        },
        // Bailout: a shield and a burst of speed
        w: () => {
            c.addShield(55);
            temp(c, "renata_w", 2, { moveSpeed: 2 });
        },
        // Loyalty Program: a missile through the line that slows, and a shield for her
        e: () => {
            c.addShield(30);
            fly(c, {
                id: "renata_e",
                key: "e",
                speed: 95,
                range: c.reach("e"),
                width: 1.6,
                pierce: true,
                hit: (e) => {
                    c.hit(e, 40, "e");
                    e.debuffs.applySlow(0.3, 2);
                },
            });
        },
        // Hostile Takeover: a wave that sends everything it hits berserk
        r: () => {
            fly(c, {
                id: "renata_r",
                key: "r",
                speed: 70,
                range: 40,
                width: 4,
                pierce: true,
                hit: (e) => {
                    c.hit(e, 40, "r");
                    charm(e, 1.8);
                    e.debuffs.applySlow(0.3, 1.8);
                },
            });
        },
    }),

    renekton: (c) => {
        const slice = (second: boolean) => {
            const dir = c.aim;
            c.dash(v2.add(c.player.pos, v2.mul(dir, 15)), 80);
            c.shoot("renekton_e", "e", dir, { distance: 15 });
            const struck = new Set<Player>();
            repeat(c, 5, 0.07, () => {
                for (const e of c.enemies(3.5)) {
                    if (struck.has(e)) continue;
                    struck.add(e);
                    c.hit(e, 40, "e");
                    if (second) e.debuffs.applySlow(0.4, 1.5);
                }
            });
        };
        return {
            // Cull the Meek: a sweep that heals him more the more it hits
            q: () => {
                const hits = c.enemies(9);
                if (!hits.length) return false;
                for (const e of hits) c.hit(e, 45, "q");
                c.heal(20 + 8 * (hits.length - 1));
            },
            // Ruthless Predator: the next attack hits twice as hard and stuns
            w: () => {
                c.nextAttackBonus = Math.max(c.nextAttackBonus, 0.8);
                c.nextAttackSilence = true;
                c.buffs.renekton_w = 4;
            },
            // Slice and Dice: a dash through them, and a second one a moment later
            e: () => {
                slice(false);
                c.later(1.4, () => slice(true));
            },
            // Dominus: grows tougher and tears at everything near
            r: () => {
                c.addShield(70);
                c.buffs.renekton_r = 3;
                repeat(c, 6, 0.5, () => {
                    for (const e of c.enemies(8)) c.hit(e, 15, "r");
                });
            },
        };
    },

    rengar: (c) => ({
        // Savagery: his next attack lands twice as hard, and he attacks faster for a moment
        q: () => {
            c.nextAttackBonus = Math.max(c.nextAttackBonus, 0.9);
            temp(c, "rengar_q", 3, { attackSpeed: 0.6 });
        },
        // Battle Roar: hurts everyone near, heals him and shakes off crowd control
        w: () => {
            const hits = c.enemies(c.reach("w"));
            if (!hits.length) return false;
            for (const e of hits) c.hit(e, 35, "w");
            c.heal(25);
            cleanse(c);
        },
        // Bola Strike: slows, and roots what it catches at range
        e: () => {
            fly(c, {
                id: "rengar_e",
                key: "e",
                speed: 90,
                range: c.reach("e"),
                width: 1.3,
                hit: (e, d) => {
                    c.hit(e, 50, "e");
                    e.debuffs.applySlow(0.5, 2);
                    if (d > 12) e.debuffs.root = Math.max(e.debuffs.root, 0.8);
                },
            });
        },
        // Thrill of the Hunt: fast and unseen, and he leaps on the nearest enemy
        r: () => {
            temp(c, "rengar_r", 4, { moveSpeed: 3 });
            const t = c.nearest(25);
            if (!t) return;
            c.later(0.8, () => {
                if (t.dead) return;
                c.dash(t.pos, 100);
                c.later(v2.distance(t.pos, c.player.pos) / 100 + 0.1, () => {
                    if (!t.dead) c.hit(t, 60, "r");
                });
            });
        },
    }),

    riven: (c) => {
        // Broken Wings is a three part combo, and the count lapses if she waits too long
        let qCount = 0;
        let qUntil = 0;
        return {
            q: () => {
                const now = clock(c);
                if (now > qUntil) qCount = 0;
                const n = qCount;
                qCount = (qCount + 1) % 3;
                qUntil = now + 4;
                const dir = c.aim;
                c.dash(v2.add(c.player.pos, v2.mul(dir, 5)), 60);
                if (n === 2) c.shoot("riven_q3", "q", dir, { distance: 6 });
                for (const e of c.enemies(7)) {
                    c.hit(e, n === 2 ? 55 : 35, "q");
                    if (n === 2) {
                        knockUp(e, 0.6);
                        shove(e, dirOf(c.player.pos, e.pos), 4, 40);
                    }
                }
            },
            // Ki Burst: stuns everyone close
            w: () => {
                const hits = c.enemies(c.reach("w") * 0.8);
                if (!hits.length) return false;
                for (const e of hits) {
                    c.hit(e, 40, "w");
                    stun(e, 0.75);
                }
            },
            // Valor: a dash behind a shield
            e: () => {
                c.addShield(55);
                c.dash(c.cursor(12), 90);
            },
            // Blade of the Exile: a surge in strength, and the Wind Slash that follows hits the weak harder
            r: () => {
                temp(c, "riven_r", 6, { damage: 0.25, attackSpeed: 0.3 });
                c.later(0.4, () =>
                    fly(c, {
                        id: "riven_r",
                        key: "r",
                        speed: 95,
                        range: 30,
                        width: 2.5,
                        pierce: true,
                        hit: (e) => c.hit(e, 70 * (1 + (1 - e.health / e.maxHealth)), "r"),
                    }));
            },
        };
    },

    rumble: (c) => ({
        // Flamespitter: a cone of fire that keeps burning
        q: () => {
            const hits = inCone(c, 12, 30);
            if (!hits.length) return false;
            for (const e of hits) {
                c.hit(e, 35, "q");
                e.applyBurn(2, c.player, c.sourceOf("q"));
            }
        },
        // Scrap Shield: a shield and a short sprint
        w: () => {
            c.addShield(60);
            temp(c, "rumble_w", 1.5, { moveSpeed: 1.5 });
        },
        // Electro Harpoon: two harpoons, each of which slows
        e: () => {
            const harpoon = () =>
                fly(c, {
                    id: "rumble_e",
                    key: "e",
                    speed: 100,
                    range: c.reach("e"),
                    width: 1.2,
                    hit: (e) => {
                        c.hit(e, 40, "e");
                        e.debuffs.applySlow(0.35, 2);
                    },
                });
            harpoon();
            c.later(0.6, harpoon);
        },
        // The Equalizer: a rocket barrage that leaves a burning field
        r: () => {
            const pos = c.cursor(40);
            const range = Math.max(1, v2.distance(c.player.pos, pos));
            fly(c, {
                id: "rumble_r",
                key: "r",
                speed: 70,
                range,
                width: 0.5,
                dir: dirOf(c.player.pos, pos),
                pierce: true,
                end: (at) =>
                    repeat(c, 5, 0.5, () => {
                        spot(c, "r", at);
                        for (const e of c.enemies(6, at)) {
                            c.hit(e, 25, "r");
                            e.debuffs.applySlow(0.4, 0.8);
                            e.applyBurn(1.5, c.player, c.sourceOf("r"));
                        }
                    }),
            });
        },
    }),

    ryze: (c) => {
        // targets carrying Spell Flux, which Rune Prison holds longer and Overload hits harder
        const fluxed = new Set<number>();
        const mark = (e: Player) => {
            fluxed.add(e.__id);
            c.later(4, () => fluxed.delete(e.__id));
        };
        return {
            // Overload
            q: () => {
                fly(c, {
                    id: "ryze_q",
                    key: "q",
                    speed: 100,
                    range: c.reach("q"),
                    width: 1.2,
                    hit: (e) => {
                        c.hit(e, 50 + (fluxed.has(e.__id) ? 20 : 0), "q");
                        mark(e);
                    },
                });
            },
            // Rune Prison
            w: () => {
                const t = c.nearest(c.reach("w"));
                if (!t) return false;
                c.hit(t, 35, "w");
                t.debuffs.root = Math.max(t.debuffs.root, fluxed.has(t.__id) ? 1.8 : 1.1);
                mark(t);
            },
            // Spell Flux: a bolt that jumps to the two nearest others
            e: () => {
                const t = c.nearest(c.reach("e"));
                if (!t) return false;
                c.shoot("ryze_e", "e", dirOf(c.player.pos, t.pos), { homing: t });
                const others = c.enemies(8, t.pos).filter((o) => o !== t).slice(0, 2);
                c.later(0.15, () => {
                    if (!t.dead) {
                        c.hit(t, 40 + (fluxed.has(t.__id) ? 15 : 0), "e");
                        mark(t);
                    }
                    for (const o of others) {
                        if (o.dead) continue;
                        c.hit(o, 30, "e");
                        mark(o);
                    }
                });
            },
            // Realm Warp: gathers himself behind a shield and then teleports
            r: () => {
                const to = c.cursor(40);
                c.addShield(45);
                c.buffs.ryze_r = 1;
                c.later(1, () => c.dash(to, 200));
            },
        };
    },

    samira: (c) => ({
        // Flair: a shot, or a slash if they are close
        q: () => {
            fly(c, {
                id: "samira_q",
                key: "q",
                speed: 120,
                range: c.reach("q"),
                width: 1.2,
                hit: (e, d) => c.hit(e, 45 + (d < 6 ? 25 : 0), "q"),
            });
        },
        // Blade Whirl: cuts everyone close and stops shots from either side
        w: () => {
            for (const side of [2, -2]) {
                c.zones.push({
                    pos: v2.add(c.player.pos, v2.mul(c.aim, side)),
                    time: 1.5,
                    kind: "windwall",
                    dir: c.aim,
                });
            }
            const pass = () => {
                for (const e of c.enemies(7)) c.hit(e, 30, "w");
            };
            pass();
            c.later(0.4, pass);
        },
        // Wild Rush: through the nearest enemy
        e: () => {
            const t = c.nearest(c.reach("e"));
            if (!t) return false;
            c.dash(v2.add(t.pos, v2.mul(dirOf(c.player.pos, t.pos), 2.5)), 100);
            c.hit(t, 40, "e");
            c.heal(12);
        },
        // Inferno Trigger: a long burst at whoever is nearest
        r: () => {
            c.buffs.samira_r = 1.6;
            repeat(c, 8, 0.2, () => {
                const t = c.nearest(20);
                if (!t) return;
                c.shoot("samira_r", "r", dirOf(c.player.pos, t.pos), { homing: t });
                c.hit(t, 18, "r");
            });
        },
    }),

    sejuani: (c) => ({
        // Arctic Assault: a charge that knocks up what it passes through
        q: () => {
            c.dash(v2.add(c.player.pos, v2.mul(c.aim, 22)), 100);
            const struck = new Set<Player>();
            repeat(c, 8, 0.06, () => {
                for (const e of c.enemies(3.5)) {
                    if (struck.has(e)) continue;
                    struck.add(e);
                    c.hit(e, 45, "q");
                    knockUp(e, 0.6);
                }
            });
        },
        // Winter's Wrath: her flail in front of her, and then all round
        w: () => {
            c.buffs.sejuani_w = 0.8;
            c.later(0.3, () => {
                for (const e of inCone(c, 10, 70)) c.hit(e, 35, "w");
            });
            c.later(0.8, () => {
                for (const e of c.enemies(10)) {
                    c.hit(e, 40, "w");
                    e.debuffs.applySlow(0.4, 1.5);
                }
            });
        },
        // Permafrost: slows everyone near, and stuns the ones already slowed
        e: () => {
            const hits = c.enemies(11);
            if (!hits.length) return false;
            for (const e of hits) {
                c.hit(e, 30, "e");
                if (e.debuffs.slow > 0) stun(e, 1.2);
                else e.debuffs.applySlow(0.6, 2);
            }
        },
        // Glacial Prison: a bola that freezes the ground where it lands
        r: () => {
            let landed = false;
            const land = (at: Vec2) => {
                if (landed) return;
                landed = true;
                spot(c, "r", at);
                for (const e of c.enemies(7, at)) {
                    c.hit(e, 70, "r");
                    stun(e, 1.5);
                }
            };
            fly(c, {
                id: "sejuani_r",
                key: "r",
                speed: 80,
                range: 43,
                width: 1.5,
                hit: (_e, _d, at) => land(at),
                end: land,
            });
        },
    }),

    senna: (c) => ({
        // Piercing Darkness: a beam that heals her on every hit
        q: () => {
            fly(c, {
                id: "senna_q",
                key: "q",
                speed: 160,
                range: 28,
                width: 1.3,
                pierce: true,
                hit: (e) => {
                    c.hit(e, 45, "q");
                    c.heal(8);
                },
            });
        },
        // Last Embrace: a wave of darkness that roots what it hits a moment later
        w: () => {
            fly(c, {
                id: "senna_w",
                key: "w",
                speed: 100,
                range: c.reach("w"),
                width: 1.2,
                hit: (e) => {
                    c.hit(e, 40, "w");
                    c.later(0.6, () => {
                        if (!e.dead) e.debuffs.root = Math.max(e.debuffs.root, 1.2);
                    });
                },
            });
        },
        // Curse of the Black Mist: hidden in the mist, quick and shielded
        e: () => {
            c.addShield(40);
            temp(c, "senna_e", 4, { moveSpeed: 2 });
        },
        // Dawning Shadow: a beam across the whole map
        r: () => {
            c.addShield(60);
            c.later(0.5, () =>
                fly(c, {
                    id: "senna_r",
                    key: "r",
                    speed: 300,
                    range: 100,
                    width: 2.5,
                    pierce: true,
                    hit: (e) => c.hit(e, 100, "r"),
                }));
        },
    }),

    seraphine: (c) => {
        // her passive: every third spell echoes and hits harder
        let casts = 0;
        const echo = () => (++casts % 3 === 0 ? 1.4 : 1);
        return {
            // High Note: a note that lands on the target area
            q: () => {
                const m = echo();
                const to = c.at("q");
                fly(c, {
                    id: "seraphine_q",
                    key: "q",
                    speed: 80,
                    range: Math.max(1, v2.distance(c.player.pos, to)),
                    width: 0.5,
                    dir: dirOf(c.player.pos, to),
                    pierce: true,
                    end: (at) => {
                        for (const e of c.enemies(5, at)) c.hit(e, 45 * m, "q");
                    },
                });
            },
            // Surround Sound: a shield and a burst of healing and speed
            w: () => {
                echo();
                c.addShield(50);
                c.heal(25);
                temp(c, "seraphine_w", 2.5, { moveSpeed: 2 });
            },
            // Beat Drop: a wave that slows, and roots the ones it finds already slowed
            e: () => {
                const m = echo();
                fly(c, {
                    id: "seraphine_e",
                    key: "e",
                    speed: 80,
                    range: c.reach("e"),
                    width: 2,
                    pierce: true,
                    hit: (e) => {
                        c.hit(e, 40 * m, "e");
                        if (e.debuffs.slow > 0) e.debuffs.root = Math.max(e.debuffs.root, 1.2);
                        e.debuffs.applySlow(0.5, 2);
                    },
                });
            },
            // Encore: a wave that charms
            r: () => {
                const m = echo();
                fly(c, {
                    id: "seraphine_r",
                    key: "r",
                    speed: 70,
                    range: 55,
                    width: 3.5,
                    pierce: true,
                    hit: (e) => {
                        c.hit(e, 60 * m, "r");
                        charm(e, 1.6);
                        e.debuffs.applySlow(0.5, 1.6);
                    },
                });
            },
        };
    },

    sett: (c) => ({
        // Knuckle Down: quicker, and his next attack hits much harder
        q: () => {
            temp(c, "sett_q", 2, { moveSpeed: 2 });
            c.nextAttackBonus = Math.max(c.nextAttackBonus, 0.8);
        },
        // Haymaker: a shield, then a punch in front of him that pays the grit back as true damage
        w: () => {
            c.addShield(50);
            c.later(0.5, () => {
                for (const e of inCone(c, 11, 55)) c.hit(e, 55, "w", true);
            });
        },
        // Facebreaker: drags in everyone in front of him, stunning them if there is more than one
        e: () => {
            const front = inCone(c, 16, 100);
            if (!front.length) return false;
            for (const e of front) {
                c.hit(e, 40, "e");
                pullTo(e, v2.add(c.player.pos, v2.mul(dirOf(c.player.pos, e.pos), 2.5)), 50);
                if (front.length >= 2) stun(e, 1);
                else e.debuffs.applySlow(0.5, 1.5);
            }
        },
        // The Show Stopper: hurls the nearest enemy and slams everyone round where it lands
        r: () => {
            const t = c.nearest(c.reach("r"));
            if (!t) return false;
            const dir = c.aim;
            const land = v2.add(c.player.pos, v2.mul(dir, 9));
            c.hit(t, 60, "r");
            knockUp(t, 1);
            t.webPull = { target: land, speed: 22, time: 1 };
            c.later(0.9, () => {
                spot(c, "r", land);
                for (const e of c.enemies(6, land)) {
                    c.hit(e, 70, "r");
                    e.debuffs.applySlow(0.6, 1.5);
                }
            });
        },
    }),

    shaco: (c) => ({
        // Deceive: blinks away, unseen, and the next attack is a backstab
        q: () => {
            c.dash(c.cursor(13), 200);
            c.nextAttackBonus = Math.max(c.nextAttackBonus, 1);
            c.buffs.shaco_stealth = 3;
        },
        // Jack in the Box: a trap that holds whoever opens it
        w: () => {
            const pos = c.at("w");
            spot(c, "w", pos);
            c.traps.push({ pos, arm: 0.8, life: 40, kind: "snap" });
            capTraps(c, 3);
        },
        // Two-Shiv Poison: a poisoned knife that slows and hurts the wounded more
        e: () => {
            fly(c, {
                id: "shaco_e",
                key: "e",
                speed: 100,
                range: c.reach("e"),
                width: 1.1,
                hit: (e) => {
                    c.hit(e, e.health < e.maxHealth * 0.3 ? 80 : 45, "e");
                    e.debuffs.applySlow(0.4, 2);
                },
            });
        },
        // Hallucinate: a clone stays where he was and fights, then blows up
        r: () => {
            const at = v2.copy(c.player.pos);
            c.buffs.shaco_r = 4;
            c.player.dodgeTime = Math.max(c.player.dodgeTime, 0.6);
            spot(c, "r", at);
            c.dash(c.cursor(10), 120);
            repeat(c, 3, 1, () => {
                for (const e of c.enemies(6, at)) c.hit(e, 20, "r");
            });
            c.later(4, () => {
                spot(c, "r", at);
                for (const e of c.enemies(7, at)) c.hit(e, 80, "r");
            });
        },
    }),
};
