import { bullets } from "../../../../shared/defs/gameObjects/championAbilityBullets/batch1.ts";
import type { AbilityKey } from "../../../../shared/defs/gameObjects/championDefs.ts";
import { math } from "../../../../shared/utils/math.ts";
import { v2, type Vec2 } from "../../../../shared/utils/v2.ts";
import type { Champion } from "../champion.ts";
import type { Player } from "../objects/player.ts";
import type { ChampionKitMap } from "./types.ts";

/**
 * hand-written kits, batch 1 (see types.ts: do not read anything off `c` outside a callback).
 *
 * Most projectiles here are *visual* shots (damage 0 in the bullets file) paired with a sweep that
 * finds who the shot actually reaches, because a bullet can't carry a stun, a pull or a mark: the
 * hit itself goes through Champion.hit(), so ability power and the kill feed still apply.
 */

type Fn = (e: Player) => void;
const KeyIndex: Record<AbilityKey, number> = { q: 0, w: 1, e: 2, r: 3 };
const speedOf = (id: string) => bullets[id]?.speed ?? 90;
const dirTo = (c: Champion, to: Vec2) => v2.normalizeSafe(v2.sub(to, c.player.pos), c.aim);
const fullCooldown = (c: Champion, key: AbilityKey) => c.def.abilities[key].cooldown * (1 - c.stats.abilityHaste);

const stun = (e: Player, t: number) => {
    e.debuffs.root = Math.max(e.debuffs.root, t);
    e.debuffs.silence = Math.max(e.debuffs.silence, t);
};
const knockUp = (e: Player, t: number) => {
    e.debuffs.airborne = Math.max(e.debuffs.airborne, t);
};
/** throws a target along `dir` */
function shove(e: Player, dir: Vec2, dist: number, speed = 50) {
    e.webPull = { target: v2.add(e.pos, v2.mul(dir, dist)), speed, time: dist / speed + 0.1 };
}
/** drags a target to a point */
function drag(e: Player, to: Vec2, speed = 50) {
    e.webPull = { target: v2.copy(to), speed, time: v2.distance(e.pos, to) / speed + 0.1 };
}
/** runs `fn` n times, `gap` seconds apart, the first one right away */
function pulse(c: Champion, n: number, gap: number, fn: (i: number) => void) {
    for (let i = 0; i < n; i++) c.later(i * gap, () => fn(i));
}

function segDist(p: Vec2, a: Vec2, b: Vec2) {
    const ab = v2.sub(b, a);
    const l2 = v2.dot(ab, ab);
    const t = l2 === 0 ? 0 : math.clamp(v2.dot(v2.sub(p, a), ab) / l2, 0, 1);
    return v2.distance(p, v2.add(a, v2.mul(ab, t)));
}

/**
 * Lets an ability be cast again shortly after: it comes off cooldown after `gap` s and, if nobody
 * recasts within `window` s, goes on its full cooldown (running `expire` to reset the kit's state).
 */
function openRecast(
    c: Champion,
    key: AbilityKey,
    gap: number,
    window: number,
    s: { token: number },
    expire: () => void,
) {
    const i = KeyIndex[key];
    const token = ++s.token;
    c.later(0, () => {
        c.cooldowns[i] = gap;
    });
    c.later(window, () => {
        if (s.token !== token) return;
        expire();
        c.cooldowns[i] = fullCooldown(c, key);
    });
}

/** walks a line at a shot's speed and calls `hit` on whoever it reaches; `end` runs if it reached no one */
function sweep(
    c: Champion,
    o: {
        from: Vec2;
        dir: Vec2;
        len: number;
        width: number;
        speed: number;
        pierce?: boolean;
        hit: Fn;
        end?: (pos: Vec2) => void;
    },
) {
    const from = v2.copy(o.from);
    const done = new Set<Player>();
    const step = 0.05;
    const n = Math.max(1, Math.ceil(o.len / o.speed / step));
    const at = (i: number) => v2.add(from, v2.mul(o.dir, Math.min(o.len, o.speed * i * step)));
    for (let i = 1; i <= n; i++) {
        c.later(i * step, () => {
            const a = at(i - 1);
            const b = at(i);
            if (!o.pierce && done.size) return;
            for (const e of c.enemies(o.len + 6, from)) {
                if (done.has(e) || segDist(e.pos, a, b) > o.width + e.rad) continue;
                done.add(e);
                o.hit(e);
                if (!o.pierce) return;
            }
            if (i === n && !done.size) o.end?.(b);
        });
    }
}

/** fires a visible shot and damages (and applies `on` to) whoever it reaches */
function skillshot(
    c: Champion,
    id: string,
    key: AbilityKey,
    o: {
        len: number;
        width: number;
        dmg?: number;
        pierce?: boolean;
        dir?: Vec2;
        from?: Vec2;
        on?: Fn;
        end?: (pos: Vec2) => void;
    },
) {
    const dir = o.dir ?? c.aim;
    const from = v2.copy(o.from ?? c.player.pos);
    c.shoot(id, key, dir, { distance: o.len, from });
    sweep(c, {
        from,
        dir,
        len: o.len,
        width: o.width,
        speed: speedOf(id),
        pierce: o.pierce,
        end: o.end,
        hit: (e) => {
            if (o.dmg) c.hit(e, o.dmg, key);
            o.on?.(e);
        },
    });
}

/** throws a visible shot to a spot; returns how long it flies */
function lob(c: Champion, id: string, key: AbilityKey, to: Vec2): number {
    const d = v2.distance(to, c.player.pos);
    c.shoot(id, key, dirTo(c, to), { distance: Math.max(d, 0.5) });
    return d / speedOf(id);
}

/** an area that goes off at a spot: the shot (if any) lands, then `delay` s later everyone in it is hit */
function blast(c: Champion, key: AbilityKey, at: Vec2, r: number, fn: Fn, o: { id?: string; delay?: number } = {}) {
    const where = v2.copy(at);
    const flight = o.id ? lob(c, o.id, key, where) : 0;
    c.later(flight + (o.delay ?? 0), () => {
        for (const e of c.enemies(r + 0.5, where)) fn(e);
    });
}

/** a melee swing in a cone in front of the champion */
function cone(
    c: Champion,
    key: AbilityKey,
    o: { len: number; half: number; fn: Fn; id?: string; delay?: number; dir?: Vec2 },
) {
    const dir = o.dir ?? c.aim;
    const from = v2.copy(c.player.pos);
    if (o.id) c.shoot(o.id, key, dir, { distance: o.len });
    c.later(o.delay ?? 0.1, () => {
        for (const e of c.enemies(o.len + 1, from)) {
            const to = v2.sub(e.pos, from);
            const l = v2.length(to);
            if (l < 0.5 || v2.dot(v2.mul(to, 1 / l), dir) >= Math.cos(o.half)) o.fn(e);
        }
    });
}

/** a ring of visible shots out of the champion */
function ring(c: Champion, id: string, key: AbilityKey, n: number, dist: number, from = c.player.pos) {
    const origin = v2.copy(from);
    for (let i = 0; i < n; i++) {
        c.shoot(id, key, v2.rotate(v2.create(1, 0), (i * Math.PI * 2) / n), { distance: dist, from: origin });
    }
}

/** a homing visible shot that deals its damage when it arrives */
function bolt(c: Champion, id: string, key: AbilityKey, t: Player, dmg: number, on?: Fn, from?: Vec2) {
    const origin = v2.copy(from ?? c.player.pos);
    c.shoot(id, key, v2.normalizeSafe(v2.sub(t.pos, origin), c.aim), { homing: t, from: origin });
    c.later(v2.distance(t.pos, origin) / speedOf(id), () => {
        if (t.dead) return;
        if (dmg) c.hit(t, dmg, key);
        on?.(t);
    });
}

/** hits for `amount`, then lights it up for the same again over `ticks` */
function dot(c: Champion, e: Player, key: AbilityKey, each: number, ticks: number, gap = 0.5) {
    pulse(c, ticks, gap, () => {
        if (!e.dead) c.hit(e, each, key);
    });
}

export const kits: ChampionKitMap = {
    // ---------------------------------------------------------------------------------------------
    aatrox: (c) => {
        const q = { token: 0, stage: 0 };
        return {
            // The Darkin Blade: three strikes, a line, a wide sweep, then a slam that knocks up
            q: () => {
                const stage = q.stage;
                c.dash(v2.add(c.player.pos, v2.mul(c.aim, 4)), 45);
                if (stage === 0) {
                    cone(c, "q", { len: 12, half: 0.3, id: "aatrox_q", fn: (e) => c.hit(e, 50, "q") });
                } else if (stage === 1) {
                    cone(c, "q", { len: 10, half: 0.9, id: "aatrox_q2", fn: (e) => c.hit(e, 55, "q") });
                } else {
                    blast(c, "q", v2.add(c.player.pos, v2.mul(c.aim, 9)), 5, (e) => {
                        c.hit(e, 75, "q");
                        knockUp(e, 1);
                    }, { id: "aatrox_q3", delay: 0.15 });
                }
                if (stage < 2) {
                    q.stage = stage + 1;
                    openRecast(c, "q", 0.4, 4, q, () => (q.stage = 0));
                } else {
                    q.stage = 0;
                    q.token++;
                }
            },
            // Infernal Chains: a chain that slows, and drags the target in if it runs
            w: () => {
                skillshot(c, "aatrox_w", "w", {
                    len: Math.min(c.reach("w"), 26),
                    width: 1.6,
                    dmg: 45,
                    on: (e) => {
                        e.debuffs.applySlow(0.3, 1.5);
                        const mark = v2.copy(e.pos);
                        c.later(1.5, () => {
                            if (e.dead || v2.distance(e.pos, mark) < 4) return;
                            c.hit(e, 40, "w");
                            drag(e, v2.add(c.player.pos, v2.mul(dirTo(c, e.pos), 2)), 55);
                        });
                    },
                });
            },
            // Umbral Dash: a dash that heals him
            e: () => {
                c.dash(c.cursor(10), 80);
                c.heal(12);
            },
            // World Ender: terrifies everyone near, then 10 s of speed, damage and healing
            r: () => {
                ring(c, "aatrox_r", "r", 10, 9);
                for (const e of c.enemies(9)) {
                    c.hit(e, 40, "r");
                    shove(e, dirTo(c, e.pos), 7, 22);
                    e.debuffs.applySlow(0.4, 1.5);
                }
                c.buffs.excited = 10;
                c.buffs.aatrox_r = 10;
                pulse(c, 10, 1, () => c.heal(5));
            },
        };
    },

    // ---------------------------------------------------------------------------------------------
    akali: (c) => {
        const e = { token: 0, stage: 0 };
        const r = { token: 0, stage: 0 };
        let marked: Player | undefined;
        return {
            // Five Point Strike: five kunai in a cone
            q: () => {
                for (let i = -2; i <= 2; i++) c.shoot("akali_q", "q", v2.rotate(c.aim, i * 0.14));
            },
            // Twilight Shroud: smoke she vanishes in, with a burst of speed and a sharpened next hit
            w: () => {
                c.player.dodgeTime = 1;
                c.buffs.youmuu = 4;
                c.buffs.akali_w = 4;
                c.nextAttackBonus = Math.max(c.nextAttackBonus, 0.5);
                ring(c, "akali_w", "w", 8, 3.5);
            },
            // Shuriken Flip: a shuriken that marks; cast again to flip to the mark and strike
            e: () => {
                if (e.stage === 1) {
                    const t = marked;
                    if (!t || t.dead) return false;
                    e.stage = 0;
                    e.token++;
                    c.dash(t.pos, 90);
                    c.later(0.15, () => {
                        for (const x of c.enemies(5, t.pos)) c.hit(x, 55, "e");
                    });
                    return;
                }
                marked = undefined;
                skillshot(c, "akali_e", "e", {
                    len: Math.min(c.reach("e"), 26),
                    width: 1.4,
                    dmg: 40,
                    on: (x) => (marked = x),
                });
                e.stage = 1;
                openRecast(c, "e", 0.3, 3, e, () => (e.stage = 0));
            },
            // Perfect Execution: dash onto a target, then dash through for the finish
            r: () => {
                if (r.stage === 0) {
                    const t = c.nearest(c.reach("r"));
                    if (!t) return false;
                    c.dash(t.pos, 100);
                    c.later(0.2, () => c.hit(t, 70, "r"));
                    r.stage = 1;
                    openRecast(c, "r", 1.5, 10, r, () => (r.stage = 0));
                    return;
                }
                r.stage = 0;
                const dir = c.aim;
                c.dash(v2.add(c.player.pos, v2.mul(dir, 14)), 110);
                skillshot(c, "akali_r", "r", {
                    len: 14,
                    width: 2.5,
                    pierce: true,
                    dir,
                    on: (x) => c.hit(x, 60 + (x.maxHealth - x.health) * 0.3, "r"),
                });
            },
        };
    },

    // ---------------------------------------------------------------------------------------------
    akshan: (c) => ({
        // Avengerang: a boomerang that hits on the way out and back
        q: () => c.shoot("akshan_q", "q"),
        // Going Rogue: he sees further, runs faster and is harder to hit for a moment
        w: () => {
            c.buffs.hawkshot = 6;
            c.buffs.youmuu = 4;
            c.player.dodgeTime = 0.6;
        },
        // Heroic Swing: swings across the map and shoots whoever is close as he lands
        e: () => {
            c.dash(c.at("e"), 65);
            c.later(0.25, () => {
                const t = c.nearest(25);
                if (t) bolt(c, "akshan_e", "e", t, 40);
            });
        },
        // Comeuppance: locks onto a target, then four shots that hit harder the lower it is
        r: () => {
            const t = c.nearest(c.reach("r"));
            if (!t) return false;
            c.buffs.akshan_r = 1.2;
            pulse(c, 4, 0.15, () => {
                if (t.dead) return;
                const miss = 1 + (1 - t.health / t.maxHealth);
                c.shoot("akshan_r", "r", v2.sub(t.pos, c.player.pos), { homing: t, mult: miss });
            });
        },
    }),

    // ---------------------------------------------------------------------------------------------
    alistar: (c) => ({
        // Pulverize: slams the ground, hurting and knocking up everyone around him
        q: () => {
            ring(c, "alistar_q", "q", 12, 9);
            c.later(0.25, () => {
                for (const e of c.enemies(Math.min(c.reach("q"), 10))) {
                    c.hit(e, 50, "q");
                    knockUp(e, 1);
                }
            });
        },
        // Headbutt: charges a target and sends it flying back
        w: () => {
            const t = c.nearest(c.reach("w"));
            if (!t) return false;
            const dir = dirTo(c, t.pos);
            c.dash(v2.sub(t.pos, v2.mul(dir, 1.5)), 85);
            c.shoot("alistar_w", "w", dir, { distance: v2.distance(t.pos, c.player.pos) });
            c.later(0.2, () => {
                if (t.dead) return;
                c.hit(t, 55, "w");
                shove(t, dir, 7, 55);
                t.debuffs.root = Math.max(t.debuffs.root, 0.5);
            });
        },
        // Trample: stomps for 5 s, hurting everyone near, faster on his feet
        e: () => {
            c.buffs.youmuu = 5;
            c.buffs.alistar_e = 5;
            pulse(c, 10, 0.5, () => {
                for (const e of c.enemies(6)) c.hit(e, 9, "e");
                if (c.enemies(6).length) c.shoot("alistar_e", "e", c.aim, { distance: 5 });
            });
        },
        // Unbreakable Will: shrugs off crowd control and takes far less damage for 7 s
        r: () => {
            const d = c.player.debuffs;
            d.root =
                d.slow =
                d.silence =
                d.airborne =
                    0;
            c.addShield(60);
            c.buffs.garen_w = 7;
            c.buffs.alistar_r = 7;
            c.nextAttackBonus = Math.max(c.nextAttackBonus, 0.6);
        },
    }),

    // ---------------------------------------------------------------------------------------------
    ambessa: (c) => {
        const q = { token: 0, stage: 0 };
        return {
            // Cunning Sweep, then Sundering Slam
            q: () => {
                if (q.stage === 0) {
                    c.dash(v2.add(c.player.pos, v2.mul(c.aim, 6)), 70);
                    cone(c, "q", { len: 13, half: 0.7, id: "ambessa_q", fn: (e) => c.hit(e, 55, "q") });
                    q.stage = 1;
                    openRecast(c, "q", 0.4, 3, q, () => (q.stage = 0));
                    return;
                }
                q.stage = 0;
                q.token++;
                blast(c, "q", v2.add(c.player.pos, v2.mul(c.aim, 7)), 5, (e) => {
                    c.hit(e, 70, "q");
                    e.debuffs.applySlow(0.4, 1.5);
                }, { id: "ambessa_q2", delay: 0.15 });
            },
            // Repudiation: a shield, then a counter-lunge that slashes around her
            w: () => {
                c.addShield(60);
                c.buffs.ambessa_w = 1.5;
                c.dash(c.cursor(7), 70);
                c.later(0.35, () => {
                    ring(c, "ambessa_w", "w", 8, 6);
                    for (const e of c.enemies(6)) c.hit(e, 40, "w");
                });
            },
            // Lunge: a long leap onto whoever is near the end of it
            e: () => {
                const to = c.cursor(11);
                c.dash(to, 100);
                c.shoot("ambessa_e", "e", c.aim, { distance: 11 });
                c.later(0.2, () => {
                    const t = c.nearest(5);
                    if (!t) return;
                    c.hit(t, 50, "e");
                    t.debuffs.applySlow(0.35, 1.5);
                });
            },
            // Public Execution: drags the target low with her, then finishes it
            r: () => {
                const t = c.nearest(8, c.at("r")) ?? c.nearest(c.reach("r"));
                if (!t) return false;
                c.dash(t.pos, 95);
                c.later(0.3, () => {
                    if (t.dead) return;
                    stun(t, 0.6);
                    c.hit(t, 70 + (t.maxHealth - t.health) * 0.25, "r", true);
                    ring(c, "ambessa_r", "r", 6, 5, t.pos);
                });
            },
        };
    },

    // ---------------------------------------------------------------------------------------------
    amumu: (c) => ({
        // Bandage Toss: a bandage that stuns the first target and pulls Amumu to it
        q: () => {
            skillshot(c, "amumu_q", "q", {
                len: Math.min(c.reach("q"), 30),
                width: 1.5,
                dmg: 45,
                on: (e) => {
                    stun(e, 1);
                    c.dash(v2.sub(e.pos, v2.mul(dirTo(c, e.pos), 1.5)), 75);
                },
            });
        },
        // Despair: a weeping aura that burns everyone near for 5 s
        w: () => {
            c.buffs.amumu_w = 5;
            pulse(c, 10, 0.5, () => {
                ring(c, "amumu_w", "w", 6, 4);
                for (const e of c.enemies(10)) c.hit(e, 8, "w");
            });
        },
        // Tantrum: a burst around him, and a little padding against the next blows
        e: () => {
            ring(c, "amumu_e", "e", 10, 8);
            c.later(0.15, () => {
                for (const e of c.enemies(Math.min(c.reach("e"), 11))) c.hit(e, 45, "e");
            });
            c.addShield(25);
            c.buffs.garen_w = 1.5;
        },
        // Curse of the Sad Mummy: bandages everyone around him in place
        r: () => {
            ring(c, "amumu_r", "r", 12, 12);
            for (const e of c.enemies(c.reach("r"))) {
                c.hit(e, 80, "r");
                stun(e, 1.8);
            }
        },
    }),

    // ---------------------------------------------------------------------------------------------
    anivia: (c) => ({
        // Flash Frost: a ball of ice that bursts where it lands, stunning
        q: () => {
            blast(c, "q", c.cursor(Math.min(c.reach("q"), 30)), 4, (e) => {
                c.hit(e, 55, "q");
                stun(e, 1.1);
                e.debuffs.applySlow(0.3, 1.5);
            }, { id: "anivia_q", delay: 0.1 });
        },
        // Crystallize: a wall of ice that stops shots and slows anyone in it
        w: () => {
            const pos = c.at("w");
            const dir = c.aim;
            lob(c, "anivia_w", "w", pos);
            c.zones.push({ pos, time: 5, kind: "windwall", dir });
            c.buffs.anivia_w = 5;
            const side = v2.perp(dir);
            pulse(c, 20, 0.25, () => {
                for (const e of c.enemies(7, pos)) {
                    const to = v2.sub(e.pos, pos);
                    if (Math.abs(v2.dot(to, dir)) < 2 && Math.abs(v2.dot(to, side)) < 5) e.debuffs.applySlow(0.5, 0.4);
                }
            });
        },
        // Frostbite: a shard that hurts twice as much against a chilled target
        e: () => {
            const t = c.nearest(c.reach("e"));
            if (!t) return false;
            bolt(c, "anivia_e", "e", t, 0, (x) => c.hit(x, x.debuffs.slow > 0 ? 85 : 42, "e"));
        },
        // Glacial Storm: a blizzard that slows and burns an area for 5 s
        r: () => {
            const pos = c.at("r");
            const flight = lob(c, "anivia_r", "r", pos);
            c.buffs.anivia_r = 5 + flight;
            c.later(flight, () => {
                pulse(c, 10, 0.5, () => {
                    ring(c, "anivia_r2", "r", 5, 6, pos);
                    for (const e of c.enemies(7, pos)) {
                        c.hit(e, 10, "r");
                        e.debuffs.applySlow(0.5, 0.7);
                    }
                });
            });
        },
    }),

    // ---------------------------------------------------------------------------------------------
    annie: (c) => {
        // Pyromania: every fifth spell stuns
        let casts = 0;
        const pyro = () => {
            if (casts >= 4) {
                casts = 0;
                return true;
            }
            casts++;
            return false;
        };
        return {
            // Disintegrate: a fireball at the nearest target
            q: () => {
                const t = c.nearest(c.reach("q"));
                if (!t) return false;
                const s = pyro();
                bolt(c, "annie_q", "q", t, 55, (x) => s && stun(x, 1.5));
            },
            // Incinerate: a cone of fire
            w: () => {
                const s = pyro();
                cone(c, "w", {
                    len: Math.min(c.reach("w"), 20),
                    half: 0.5,
                    id: "annie_w",
                    fn: (e) => {
                        c.hit(e, 50, "w");
                        if (s) stun(e, 1.5);
                    },
                });
            },
            // Molten Shield: a shield and a little speed
            e: () => {
                pyro();
                c.addShield(60);
                c.buffs.youmuu = 3;
                c.buffs.annie_e = 3;
            },
            // Summon: Tibbers: the bear lands, then burns everything near him for 6 s
            r: () => {
                const s = pyro();
                const at = c.at("r");
                const flight = lob(c, "annie_r", "r", at);
                c.later(flight, () => {
                    for (const e of c.enemies(5.5, at)) {
                        c.hit(e, 100, "r");
                        if (s) stun(e, 1.5);
                    }
                    pulse(c, 6, 1, () => {
                        ring(c, "annie_r2", "r", 6, 4, at);
                        for (const e of c.enemies(5, at)) {
                            c.hit(e, 14, "r");
                            e.applyBurn(1.5, c.player, c.sourceOf("r"));
                        }
                    });
                });
            },
        };
    },

    // ---------------------------------------------------------------------------------------------
    aphelios: (c) => {
        // the weapon in his main hand; the next one waits in the off hand
        let main = 0;
        const fire = (i: number, key: AbilityKey) => {
            switch (i) {
                // Calibrum: a long rifle shot
                case 0:
                    skillshot(c, "aphelios_0", key, { len: 40, width: 1, dmg: 60 });
                    break;
                // Severum: a close sweep that heals him
                case 1:
                    cone(c, key, {
                        len: 14,
                        half: 0.5,
                        id: "aphelios_1",
                        fn: (e) => {
                            c.hit(e, 45, key);
                            c.heal(12);
                        },
                    });
                    break;
                // Gravitum: roots whoever it hits
                case 2:
                    skillshot(c, "aphelios_2", key, {
                        len: 25,
                        width: 1.2,
                        dmg: 35,
                        on: (e) => e.debuffs.root = Math.max(e.debuffs.root, 1.2),
                    });
                    break;
                // Infernum: a cone of flame that sets them ablaze
                case 3:
                    cone(c, key, {
                        len: 18,
                        half: 0.45,
                        id: "aphelios_3",
                        fn: (e) => {
                            c.hit(e, 40, key);
                            e.applyBurn(3, c.player, c.sourceOf(key));
                        },
                    });
                    break;
                // Crescendum: a chakram that passes through and slows
                default:
                    skillshot(c, "aphelios_4", key, {
                        len: 28,
                        width: 1.5,
                        pierce: true,
                        dmg: 30,
                        on: (e) => e.debuffs.applySlow(0.3, 1.5),
                    });
            }
        };
        return {
            q: () => fire(main, "q"),
            // Phase: swaps to the next weapon
            w: () => {
                main = (main + 1) % 5;
                c.buffs.aphelios_w = 1.5;
                c.buffs.youmuu = 1.5;
            },
            // the off-hand weapon's own attack
            e: () => fire((main + 1) % 5, "e"),
            // Moonlight Vigil: a shell that bursts where it lands, with the main hand's effect
            r: () => {
                const burst = (pos: Vec2) => {
                    ring(c, "aphelios_r2", "r", 8, 5, pos);
                    for (const e of c.enemies(5.5, pos)) {
                        c.hit(e, 100, "r");
                        if (main === 1) c.heal(15);
                        else if (main === 2) e.debuffs.root = Math.max(e.debuffs.root, 1.5);
                        else if (main === 3) e.applyBurn(3, c.player, c.sourceOf("r"));
                        else if (main === 4) e.debuffs.applySlow(0.4, 2);
                    }
                };
                skillshot(c, "aphelios_r", "r", {
                    len: Math.min(c.reach("r"), 40),
                    width: 1.6,
                    on: (e) => burst(e.pos),
                    end: burst,
                });
            },
        };
    },

    // ---------------------------------------------------------------------------------------------
    aurelionsol: (c) => ({
        // Breath of Light: a beam he holds on target for 1.5 s
        q: () => {
            c.buffs.aurelionsol_q = 1.5;
            pulse(c, 6, 0.25, () => c.shoot("aurelionsol_q", "q"));
        },
        // Astral Flight: he flies a long way in the direction he is facing
        w: () => {
            c.dash(c.cursor(Math.min(c.reach("w"), 40)), 75);
            c.buffs.aurelionsol_w = 1.2;
            c.buffs.youmuu = 1.5;
        },
        // Singularity: a black hole that drags at everyone near, then collapses
        e: () => {
            const pos = c.at("e");
            lob(c, "aurelionsol_e", "e", pos);
            c.zones.push({ pos, time: 4, kind: "singularity", dir: c.aim });
        },
        // Falling Star: a star that lands where he points and stuns what is under it
        r: () => {
            blast(c, "r", c.cursor(Math.min(c.reach("r"), 40)), 8, (e) => {
                c.hit(e, 95, "r");
                stun(e, 1.2);
                e.debuffs.applySlow(0.4, 2);
            }, { id: "aurelionsol_r", delay: 0.3 });
        },
    }),

    // ---------------------------------------------------------------------------------------------
    aurora: (c) => ({
        // Twofold Hex: a hex that flies out and curls back, hitting both ways
        q: () => c.shoot("aurora_q", "q"),
        // Across the Veil: slips through the veil in a dash, and her next attack lands harder
        w: () => {
            c.dash(c.cursor(c.reach("w")), 80);
            c.player.dodgeTime = 0.5;
            c.nextAttackBonus = Math.max(c.nextAttackBonus, 0.5);
            c.buffs.aurora_w = 2;
        },
        // Piercing Darkness: a wide beam of dark that slows
        e: () => {
            skillshot(c, "aurora_e", "e", {
                len: Math.min(c.reach("e"), 28),
                width: 2.4,
                pierce: true,
                dmg: 55,
                on: (e) => e.debuffs.applySlow(0.4, 1.5),
            });
        },
        // Between Worlds: a ring of the veil that drags everything near her inward
        r: () => {
            ring(c, "aurora_r", "r", 10, 8);
            c.later(0.3, () => {
                for (const e of c.enemies(8)) {
                    c.hit(e, 70, "r");
                    drag(e, v2.add(c.player.pos, v2.mul(dirTo(c, e.pos), 2)), 30);
                    e.debuffs.applySlow(0.5, 1.5);
                }
            });
        },
    }),

    // ---------------------------------------------------------------------------------------------
    azir: (c) => {
        const soldiers: Array<{ pos: Vec2; dead: boolean }> = [];
        return {
            // Conquering Sands: every soldier throws a spear of sand at the cursor (Azir does if he has none)
            q: () => {
                const to = c.at("q");
                if (!soldiers.length) {
                    skillshot(c, "azir_q", "q", {
                        len: 25,
                        width: 1.5,
                        dmg: 35,
                        on: (e) => e.debuffs.applySlow(0.3, 1),
                    });
                    return;
                }
                for (const s of soldiers) {
                    const dir = v2.normalizeSafe(v2.sub(to, s.pos), c.aim);
                    skillshot(c, "azir_q", "q", {
                        len: 14,
                        width: 1.5,
                        pierce: true,
                        dir,
                        from: s.pos,
                        dmg: 40,
                        on: (e) => e.debuffs.applySlow(0.3, 1),
                    });
                }
            },
            // Arise!: raises a soldier that hits whoever stands near it for 9 s (two at once)
            w: () => {
                const pos = c.at("w");
                const s = { pos, dead: false };
                soldiers.push(s);
                if (soldiers.length > 2) soldiers.shift()!.dead = true;
                const flight = lob(c, "azir_w2", "w", pos);
                c.later(flight, () => {
                    pulse(c, 18, 0.5, () => {
                        if (s.dead) return;
                        const t = c.nearest(5, s.pos);
                        if (t) bolt(c, "azir_w", "w", t, 12, undefined, s.pos);
                    });
                });
                c.later(flight + 9, () => {
                    s.dead = true;
                    const i = soldiers.indexOf(s);
                    if (i >= 0) soldiers.splice(i, 1);
                });
            },
            // Shifting Sands: dashes to the soldier nearest the cursor, stunning whoever is in the way
            e: () => {
                const cursor = c.cursor(25);
                let dest = cursor;
                let best = Infinity;
                for (const s of soldiers) {
                    const d = v2.distance(s.pos, cursor);
                    if (d < best) [dest, best] = [s.pos, d];
                }
                const dist = v2.distance(dest, c.player.pos);
                const dir = dirTo(c, dest);
                c.dash(dest, 90);
                c.buffs.azir_e = 0.6;
                sweep(c, {
                    from: c.player.pos,
                    dir,
                    len: dist,
                    width: 2,
                    speed: 90,
                    hit: (e) => {
                        c.hit(e, 45, "e");
                        stun(e, 0.8);
                    },
                });
            },
            // Emperor's Divide: a wall of soldiers charges forward and throws everything back
            r: () => {
                const dir = c.aim;
                const side = v2.perp(dir);
                for (const o of [-4, -2, 0, 2, 4]) {
                    c.shoot("azir_r", "r", dir, { distance: 14, from: v2.add(c.player.pos, v2.mul(side, o)) });
                }
                sweep(c, {
                    from: c.player.pos,
                    dir,
                    len: 14,
                    width: 5,
                    speed: speedOf("azir_r"),
                    pierce: true,
                    hit: (e) => {
                        c.hit(e, 70, "r");
                        shove(e, dir, 8, 50);
                    },
                });
            },
        };
    },

    // ---------------------------------------------------------------------------------------------
    bard: (c) => ({
        // Cosmic Binding: a bolt that stuns the first thing it hits
        q: () => {
            skillshot(c, "bard_q", "q", {
                len: 30,
                width: 1.4,
                dmg: 50,
                on: (e) => stun(e, 1.2),
            });
        },
        // Caretaker's Shrine: a healing shrine he drops at his feet
        w: () => {
            const pos = v2.copy(c.player.pos);
            c.heal(30);
            c.buffs.bard_w = 4;
            ring(c, "bard_w", "w", 6, 3);
            pulse(c, 4, 1, () => {
                if (v2.distance(c.player.pos, pos) < 5) c.heal(6);
            });
        },
        // Magical Journey: steps through a portal in the air, a short way ahead
        e: () => {
            const to = c.cursor(14);
            c.shoot("bard_e", "e", c.aim, { distance: v2.distance(to, c.player.pos) });
            c.dash(to, 100);
            c.buffs.bard_e = 1;
        },
        // Tempered Fate: everything where it lands is held out of time
        r: () => {
            blast(c, "r", c.cursor(Math.min(c.reach("r"), 40)), 7, (e) => {
                e.dodgeTime = Math.max(e.dodgeTime, 2.5);
                stun(e, 2.5);
            }, { id: "bard_r", delay: 0.4 });
        },
    }),

    // ---------------------------------------------------------------------------------------------
    belveth: (c) => ({
        // Void Surge: a dash that cuts through everyone in its path
        q: () => {
            const dir = c.aim;
            c.dash(v2.add(c.player.pos, v2.mul(dir, 15)), 90);
            skillshot(c, "belveth_q", "q", { len: 15, width: 2, pierce: true, dmg: 40, dir });
        },
        // Above and Below: her tail slams down where she points and throws things up
        w: () => {
            blast(c, "w", c.cursor(c.reach("w")), 4, (e) => {
                c.hit(e, 55, "w");
                knockUp(e, 0.8);
                e.debuffs.applySlow(0.3, 1.5);
            }, { id: "belveth_w", delay: 0.2 });
        },
        // Royal Maelstrom: she spins for 2 s, hurting everyone near, and takes less damage doing it
        e: () => {
            c.buffs.garen_w = 2;
            c.buffs.belveth_e = 2;
            pulse(c, 5, 0.4, () => {
                ring(c, "belveth_e", "e", 6, 7);
                for (const e of c.enemies(8)) c.hit(e, 14, "e");
                c.heal(4);
            });
        },
        // Endless Banquet: a void burst around her, then 10 s of speed and healing
        r: () => {
            ring(c, "belveth_r", "r", 10, 8);
            for (const e of c.enemies(8)) c.hit(e, 60, "r");
            c.heal(25);
            c.buffs.highlander = 10;
            c.buffs.belveth_r = 10;
        },
    }),

    // ---------------------------------------------------------------------------------------------
    blitzcrank: (c) => ({
        // Rocket Grab: a fist on a chain that pulls the first target to him
        q: () => {
            skillshot(c, "blitzcrank_q", "q", {
                len: Math.min(c.reach("q"), 30),
                width: 1.5,
                dmg: 55,
                on: (e) => {
                    drag(e, v2.add(c.player.pos, v2.mul(dirTo(c, e.pos), 2.5)), 75);
                    e.debuffs.silence = Math.max(e.debuffs.silence, 0.6);
                },
            });
        },
        // Overdrive: a burst of speed, then a slow when it wears off
        w: () => {
            c.buffs.excited = 4;
            c.buffs.blitzcrank_w = 4;
            c.later(4, () => c.player.debuffs.applySlow(0.3, 1.5));
        },
        // Power Fist: punches whoever is in reach and launches them, or charges the next attack
        e: () => {
            const t = c.nearest(Math.max(c.reach("e"), 7));
            c.buffs.blitzcrank_e = 3;
            if (!t) {
                c.nextAttackBonus = Math.max(c.nextAttackBonus, 1);
                return;
            }
            c.hit(t, 55, "e");
            knockUp(t, 1);
            c.shoot("blitzcrank_e", "e", dirTo(c, t.pos), { distance: 8 });
        },
        // Static Field: lightning arcs to everyone near and silences them
        r: () => {
            ring(c, "blitzcrank_r", "r", 12, 14);
            c.later(0.25, () => {
                for (const e of c.enemies(Math.min(c.reach("r"), 16))) {
                    c.hit(e, 60, "r");
                    e.debuffs.silence = Math.max(e.debuffs.silence, 2.5);
                }
            });
        },
    }),

    // ---------------------------------------------------------------------------------------------
    brand: (c) => ({
        // Sear: a fireball that lights its target; a target already burning is stunned
        q: () => {
            skillshot(c, "brand_q", "q", {
                len: Math.min(c.reach("q"), 32),
                width: 1.3,
                dmg: 50,
                on: (e) => {
                    if (e.burning) stun(e, 1.5);
                    e.applyBurn(3, c.player, c.sourceOf("q"));
                },
            });
        },
        // Pillar of Flame: a pillar after a short delay, hitting harder on burning targets
        w: () => {
            blast(c, "w", c.at("w"), 4, (e) => {
                c.hit(e, e.burning ? 75 : 60, "w");
                e.applyBurn(3, c.player, c.sourceOf("w"));
            }, { id: "brand_w", delay: 0.8 });
        },
        // Conflagration: sets a target alight and spreads to the ones next to it
        e: () => {
            const t = c.nearest(c.reach("e"));
            if (!t) return false;
            bolt(c, "brand_e", "e", t, 45, (x) => {
                x.applyBurn(3, c.player, c.sourceOf("e"));
                for (const o of c.enemies(6, x.pos)) {
                    if (o === x) continue;
                    c.hit(o, 30, "e");
                    o.applyBurn(3, c.player, c.sourceOf("e"));
                }
            });
        },
        // Pyroclasm: a fireball that bounces between enemies up to five times
        r: () => {
            const first = c.nearest(c.reach("r"));
            if (!first) return false;
            const seen = new Set<Player>();
            const jump = (t: Player, from: Vec2, left: number) => {
                seen.add(t);
                bolt(c, "brand_r", "r", t, 35, (x) => {
                    x.applyBurn(2, c.player, c.sourceOf("r"));
                    if (left <= 0) return;
                    const next = c.enemies(10, x.pos).filter((o) => !seen.has(o))[0]
                        ?? c.enemies(10, x.pos).find((o) => o !== x);
                    if (next) c.later(0.1, () => jump(next, x.pos, left - 1));
                }, from);
            };
            jump(first, c.player.pos, 4);
        },
    }),

    // ---------------------------------------------------------------------------------------------
    braum: (c) => ({
        // Winter's Bite: an icy bolt that slows hard
        q: () => {
            skillshot(c, "braum_q", "q", {
                len: Math.min(c.reach("q"), 30),
                width: 1.5,
                dmg: 50,
                on: (e) => e.debuffs.applySlow(0.7, 2),
            });
        },
        // Stand Behind Me: leaps behind his shield and takes less damage
        w: () => {
            c.addShield(55);
            c.buffs.garen_w = 3;
            c.buffs.braum_w = 3;
            c.dash(c.cursor(6), 60);
        },
        // Unbreakable: raises his shield in front of him, stopping shots, and takes less damage
        e: () => {
            c.zones.push({ pos: v2.add(c.player.pos, v2.mul(c.aim, 3)), time: 3, kind: "windwall", dir: c.aim });
            c.buffs.garen_w = 3;
            c.buffs.braum_e = 3;
        },
        // Glacial Fissure: a crack in the ground that throws things up and chills them
        r: () => {
            skillshot(c, "braum_r", "r", {
                len: Math.min(c.reach("r"), 30),
                width: 3,
                pierce: true,
                dmg: 70,
                on: (e) => {
                    knockUp(e, 1);
                    e.debuffs.applySlow(0.7, 3);
                },
            });
        },
    }),

    // ---------------------------------------------------------------------------------------------
    briar: (c) => ({
        // Head Rush: leaps at a target and stuns on landing
        q: () => {
            const t = c.nearest(c.reach("q"));
            if (!t) return false;
            const dir = dirTo(c, t.pos);
            c.dash(v2.sub(t.pos, v2.mul(dir, 1.5)), 85);
            c.later(0.2, () => {
                if (t.dead) return;
                c.hit(t, 60, "q");
                stun(t, 1.1);
            });
        },
        // Blood Frenzy: a frenzy of speed and bites that heals her
        w: () => {
            c.buffs.excited = 4;
            c.buffs.briar_w = 4;
            c.nextAttackBonus = Math.max(c.nextAttackBonus, 0.3);
            pulse(c, 8, 0.5, () => c.heal(3));
        },
        // Chilling Scream: a roar that rips into everything in front of her and throws it back
        e: () => {
            cone(c, "e", {
                len: 13,
                half: 0.7,
                id: "briar_e",
                fn: (e) => {
                    c.hit(e, 40 + (e.maxHealth - e.health) * 0.2, "e");
                    shove(e, c.aim, 5, 45);
                    c.heal(10);
                },
            });
        },
        // Certain Death: a bolt that carries her to its target and sends it into a panic
        r: () => {
            skillshot(c, "briar_r", "r", {
                len: 60,
                width: 2,
                dmg: 80,
                on: (e) => {
                    c.dash(v2.sub(e.pos, v2.mul(dirTo(c, e.pos), 1.5)), 110);
                    stun(e, 0.5);
                    e.debuffs.applySlow(0.5, 2);
                    c.heal(30);
                },
            });
        },
    }),

    // ---------------------------------------------------------------------------------------------
    camille: (c) => {
        const q = { token: 0, stage: 0 };
        return {
            // Precision Protocol: the next attack hits harder; cast again for a bigger one
            q: () => {
                if (q.stage === 0) {
                    c.nextAttackBonus = Math.max(c.nextAttackBonus, 0.6);
                    c.buffs.camille_q = 3;
                    c.shoot("camille_q", "q", c.aim, { distance: 8 });
                    q.stage = 1;
                    openRecast(c, "q", 1, 3, q, () => (q.stage = 0));
                    return;
                }
                q.stage = 0;
                q.token++;
                c.nextAttackBonus = Math.max(c.nextAttackBonus, 1.3);
                c.buffs.camille_q = 3;
                c.shoot("camille_q", "q", c.aim, { distance: 8 });
            },
            // Tactical Sweep: a sweep whose outer edge hurts, slows and heals
            w: () => {
                const len = Math.min(c.reach("w"), 20);
                const from = v2.copy(c.player.pos);
                cone(c, "w", {
                    len,
                    half: 0.5,
                    id: "camille_w",
                    delay: 0.4,
                    fn: (e) => {
                        if (v2.distance(e.pos, from) > len * 0.6) {
                            c.hit(e, 55, "w");
                            e.debuffs.applySlow(0.4, 1.5);
                            c.heal(12);
                        } else {
                            c.hit(e, 30, "w");
                        }
                    },
                });
            },
            // Hookshot: fires a grapple and flies to the end of it, stunning what she lands on
            e: () => {
                const to = c.at("e");
                c.shoot("camille_e", "e", c.aim, { distance: v2.distance(to, c.player.pos) });
                c.dash(to, 90);
                c.later(v2.distance(to, c.player.pos) / 90 + 0.1, () => {
                    const t = c.nearest(4);
                    if (!t) return;
                    c.hit(t, 50, "e");
                    stun(t, 1);
                });
            },
            // Hextech Ultimatum: leaps onto a target and walls it in with her for 3 s
            r: () => {
                const t = c.nearest(Math.max(c.reach("r"), 12));
                if (!t) return false;
                c.dash(t.pos, 90);
                const center = v2.copy(t.pos);
                c.buffs.camille_r = 3;
                ring(c, "camille_r", "r", 12, 6, center);
                pulse(c, 12, 0.25, (i) => {
                    if (t.dead) return;
                    if (v2.distance(t.pos, center) > 5.5) drag(t, center, 40);
                    if (i % 4 === 3) c.hit(t, 25, "r");
                });
            },
        };
    },

    // ---------------------------------------------------------------------------------------------
    cassiopeia: (c) => ({
        // Noxious Blast: a cloud that poisons, bursting where it lands
        q: () => {
            blast(c, "q", c.at("q"), 4.5, (e) => {
                c.hit(e, 60, "q");
                e.applyPoison(3, c.player);
                c.heal(8);
            }, { id: "cassiopeia_q", delay: 0.5 });
        },
        // Miasma: a lingering cloud that slows and poisons everyone in it for 5 s
        w: () => {
            const pos = c.at("w");
            const flight = lob(c, "cassiopeia_w", "w", pos);
            c.buffs.cassiopeia_w = 5 + flight;
            c.later(flight, () => {
                pulse(c, 10, 0.5, () => {
                    ring(c, "cassiopeia_w2", "w", 4, 5, pos);
                    for (const e of c.enemies(7, pos)) {
                        c.hit(e, 6, "w");
                        e.applyPoison(1, c.player);
                        e.debuffs.applySlow(0.45, 0.7);
                    }
                });
            });
        },
        // Twin Fang: a pair of fangs at the nearest target, deadly against the poisoned
        e: () => {
            const t = c.nearest(c.reach("e"));
            if (!t) return false;
            bolt(c, "cassiopeia_e", "e", t, 0, (x) => {
                const poisoned = x.poisoned;
                c.hit(x, poisoned ? 85 : 35, "e");
                if (poisoned) c.heal(20);
            });
        },
        // Petrifying Gaze: everything in front of her that faces her is turned to stone
        r: () => {
            const from = v2.copy(c.player.pos);
            cone(c, "r", {
                len: Math.min(c.reach("r"), 26),
                half: 0.6,
                id: "cassiopeia_r",
                delay: 0.3,
                fn: (e) => {
                    c.hit(e, 80, "r");
                    if (v2.dot(e.dir, v2.normalizeSafe(v2.sub(from, e.pos))) > 0) stun(e, 2);
                    else e.debuffs.applySlow(0.6, 2);
                },
            });
        },
    }),

    // ---------------------------------------------------------------------------------------------
    chogath: (c) => ({
        // Rupture: the ground bursts after a delay, throwing everyone up
        q: () => {
            blast(c, "q", c.at("q"), 4, (e) => {
                c.hit(e, 65, "q");
                knockUp(e, 1.2);
                e.debuffs.applySlow(0.6, 1.5);
            }, { id: "chogath_q", delay: 0.9 });
        },
        // Feral Scream: a scream that silences everything in front of him
        w: () => {
            cone(c, "w", {
                len: 12,
                half: 0.55,
                id: "chogath_w",
                delay: 0.25,
                fn: (e) => {
                    c.hit(e, 55, "w");
                    e.debuffs.silence = Math.max(e.debuffs.silence, 2);
                },
            });
        },
        // Vorpal Spikes: spikes fly out of him, and his next attack is stronger
        e: () => {
            for (const a of [-0.25, 0, 0.25]) c.shoot("chogath_e", "e", v2.rotate(c.aim, a));
            c.nextAttackBonus = Math.max(c.nextAttackBonus, 0.3);
            c.buffs.chogath_e = 6;
        },
        // Feast: eats the nearest enemy for true damage, and heals if it kills
        r: () => {
            const t = c.nearest(Math.max(c.reach("r"), 10));
            if (!t) return false;
            c.shoot("chogath_r", "r", dirTo(c, t.pos), { distance: v2.distance(t.pos, c.player.pos) });
            c.later(0.3, () => {
                if (t.dead) return;
                stun(t, 0.4);
                c.hit(t, 140, "r", true);
                if (t.dead) c.heal(60);
                else c.heal(25);
            });
        },
    }),

    // ---------------------------------------------------------------------------------------------
    corki: (c) => {
        let missiles = 0;
        return {
            // Phosphorus Bomb: a bomb that bursts where it lands
            q: () => {
                blast(c, "q", c.at("q"), 4.5, (e) => c.hit(e, 60, "q"), { id: "corki_q", delay: 0.05 });
            },
            // Valkyrie: a dash that leaves a trail of fire behind him
            w: () => {
                const to = c.cursor(Math.min(c.reach("w"), 20));
                const len = Math.max(v2.distance(to, c.player.pos), 1);
                const dir = c.aim;
                c.dash(to, 70);
                skillshot(c, "corki_w", "w", {
                    len,
                    width: 2,
                    pierce: true,
                    dir,
                    dmg: 30,
                    on: (e) => e.applyBurn(2, c.player, c.sourceOf("w")),
                });
            },
            // Gatling Gun: a stream of fire from his gun for 4 s
            e: () => {
                c.buffs.corki_e = 4;
                pulse(c, 20, 0.2, () => c.shoot("corki_e", "e", v2.rotate(c.aim, (Math.random() - 0.5) * 0.25)));
            },
            // Missile Barrage: rockets that burst on impact, every third one a big one
            r: () => {
                missiles++;
                const big = missiles % 3 === 0;
                const burst = (pos: Vec2) => {
                    for (const e of c.enemies(big ? 5.5 : 4, pos)) c.hit(e, big ? 90 : 50, "r");
                };
                skillshot(c, big ? "corki_r2" : "corki_r", "r", {
                    len: Math.min(c.reach("r"), 40),
                    width: big ? 1.8 : 1.4,
                    on: (e) => burst(e.pos),
                    end: burst,
                });
            },
        };
    },

    // ---------------------------------------------------------------------------------------------
    diana: (c) => {
        // Moonlight: who her Crescent Strike has marked, and until when (ms)
        const marks = new Map<Player, number>();
        const isMarked = (e: Player) => (marks.get(e) ?? 0) > c.player.game.now;
        return {
            // Crescent Strike: a crescent of moonlight that marks whoever it hits
            q: () => {
                skillshot(c, "diana_q", "q", {
                    len: Math.min(c.reach("q"), 28),
                    width: 3,
                    pierce: true,
                    dmg: 50,
                    on: (e) => marks.set(e, c.player.game.now + 3500),
                });
            },
            // Pale Cascade: a shield, then three orbs that burst around her
            w: () => {
                c.addShield(55);
                c.buffs.diana_w = 3;
                ring(c, "diana_w", "w", 3, 4);
                c.later(0.8, () => {
                    for (const e of c.enemies(5)) c.hit(e, 45, "w");
                });
            },
            // Moonfall: pulls everyone near to her and slows them
            e: () => {
                ring(c, "diana_e", "e", 8, 10);
                for (const e of c.enemies(14)) {
                    c.hit(e, 25, "e");
                    drag(e, v2.add(c.player.pos, v2.mul(dirTo(c, e.pos), 2)), 40);
                    e.debuffs.applySlow(0.6, 1.5);
                }
            },
            // Lunar Rush: a dash onto a target, best a marked one; a marked kill resets it
            r: () => {
                const near = c.enemies(Math.max(c.reach("r"), 12));
                const t = near.find(isMarked) ?? near[0];
                if (!t) return false;
                const marked = isMarked(t);
                marks.delete(t);
                c.dash(t.pos, 110);
                c.shoot("diana_r", "r", dirTo(c, t.pos), { distance: v2.distance(t.pos, c.player.pos) });
                c.later(0.2, () => {
                    if (t.dead) return;
                    c.hit(t, marked ? 105 : 70, "r");
                    if (marked) c.cooldowns[3] = 0;
                });
            },
        };
    },

    // ---------------------------------------------------------------------------------------------
    drmundo: (c) => ({
        // Infected Bonesaw: a cleaver that slows and heals him
        q: () => {
            skillshot(c, "drmundo_q", "q", {
                len: Math.min(c.reach("q"), 30),
                width: 1.5,
                dmg: 50,
                on: (e) => {
                    e.debuffs.applySlow(0.4, 1.5);
                    c.heal(15);
                },
            });
        },
        // Heart Zapper: a toxic cloud around him for 4 s
        w: () => {
            c.buffs.drmundo_w = 4;
            pulse(c, 8, 0.5, () => {
                ring(c, "drmundo_w", "w", 6, 5);
                for (const e of c.enemies(11)) c.hit(e, 7, "w");
            });
        },
        // Blunt Force Trauma: his next attack hits very hard and slows
        e: () => {
            c.nextAttackBonus = Math.max(c.nextAttackBonus, 1.2);
            c.nextAttackSlow = true;
            c.buffs.drmundo_e = 5;
        },
        // Maximum Dosage: heals him over 12 s and speeds him up
        r: () => {
            c.heal(30);
            c.buffs.youmuu = 12;
            c.buffs.drmundo_r = 12;
            pulse(c, 12, 1, () => c.heal(c.player.maxHealth * 0.02));
        },
    }),

    // ---------------------------------------------------------------------------------------------
    draven: (c) => ({
        // Spinning Axe: his next attack hits harder
        q: () => {
            c.nextAttackBonus = Math.max(c.nextAttackBonus, 0.6);
            c.buffs.draven_q = 6;
        },
        // Blood Rush: speed and attack speed for a moment
        w: () => {
            c.buffs.excited = 3;
            c.buffs.draven_w = 3;
        },
        // Stand Aside: two axes that throw everything aside
        e: () => {
            for (const a of [-0.12, 0.12]) c.shoot("draven_e", "e", v2.rotate(c.aim, a), { distance: 30 });
            const dir = c.aim;
            skillshot(c, "draven_e", "e", {
                len: Math.min(c.reach("e"), 32),
                width: 2.5,
                pierce: true,
                dmg: 55,
                on: (e) => {
                    shove(e, v2.perp(dir), 5, 45);
                    e.debuffs.applySlow(0.4, 1.5);
                },
            });
        },
        // Whirling Death: a huge axe that flies out and comes back
        r: () => {
            const dir = c.aim;
            const from = v2.copy(c.player.pos);
            const len = 50;
            skillshot(c, "draven_r", "r", { len, width: 2, pierce: true, dmg: 110 });
            const end = v2.add(from, v2.mul(dir, len));
            c.later(len / speedOf("draven_r") + 0.1, () => {
                skillshot(c, "draven_r", "r", {
                    len,
                    width: 2,
                    pierce: true,
                    dmg: 55,
                    dir: v2.mul(dir, -1),
                    from: end,
                });
            });
        },
    }),

    // ---------------------------------------------------------------------------------------------
    ekko: (c) => ({
        // Timewinder: a device that flies out and rewinds back, hitting both ways
        q: () => {
            const dir = c.aim;
            const from = v2.copy(c.player.pos);
            const len = 30;
            skillshot(c, "ekko_q", "q", {
                len,
                width: 1.5,
                pierce: true,
                dmg: 35,
                on: (e) => e.debuffs.applySlow(0.4, 1.5),
            });
            const end = v2.add(from, v2.mul(dir, len));
            c.later(len / speedOf("ekko_q") + 0.2, () => {
                skillshot(c, "ekko_q", "q", {
                    len,
                    width: 1.5,
                    pierce: true,
                    dmg: 45,
                    dir: v2.mul(dir, -1),
                    from: end,
                });
            });
        },
        // Parallax: a bubble that slows, then stuns everyone in it and shields him if he is there
        w: () => {
            const pos = c.at("w");
            const flight = lob(c, "ekko_w", "w", pos);
            c.buffs.ekko_w = flight + 3;
            c.later(flight + 1, () => {
                pulse(c, 5, 0.4, () => {
                    for (const e of c.enemies(6, pos)) e.debuffs.applySlow(0.35, 0.6);
                });
                c.later(2, () => {
                    ring(c, "ekko_w2", "w", 8, 6, pos);
                    for (const e of c.enemies(6, pos)) {
                        c.hit(e, 40, "w");
                        stun(e, 2);
                    }
                    if (v2.distance(c.player.pos, pos) < 6) c.addShield(50);
                });
            });
        },
        // Phase Dive: blinks forward and strikes the nearest enemy with a charged attack
        e: () => {
            c.dash(c.cursor(Math.min(c.reach("e"), 11)), 120);
            c.nextAttackBonus = Math.max(c.nextAttackBonus, 0.6);
            c.later(0.2, () => {
                const t = c.nearest(6);
                if (t) c.hit(t, 55, "e");
            });
        },
        // Chronobreak: bursts where he stands, then rewinds back there, healing and bursting again
        r: () => {
            const home = v2.copy(c.player.pos);
            const burst = () => {
                ring(c, "ekko_r", "r", 12, 8, home);
                for (const e of c.enemies(8, home)) {
                    c.hit(e, 65, "r");
                    e.debuffs.applySlow(0.4, 1.5);
                }
            };
            burst();
            c.buffs.ekko_r = 2;
            c.later(1.5, () => {
                c.dash(home, 120);
                c.heal(35);
                c.later(0.3, burst);
            });
        },
    }),

    // ---------------------------------------------------------------------------------------------
    elise: (c) => {
        let spider = false;
        let form = 0;
        return {
            // Neurotoxin / Venomous Bite
            q: () => {
                if (!spider) {
                    const t = c.nearest(c.reach("q"));
                    if (!t) return false;
                    bolt(c, "elise_q", "q", t, 0, (x) => c.hit(x, 35 + x.health * 0.1, "q"));
                    return;
                }
                const t = c.nearest(c.reach("q"));
                if (!t) return false;
                const dir = dirTo(c, t.pos);
                c.dash(v2.sub(t.pos, v2.mul(dir, 1.2)), 90);
                c.shoot("elise_q2", "q", dir, { distance: v2.distance(t.pos, c.player.pos) });
                c.later(0.2, () => {
                    if (t.dead) return;
                    c.hit(t, 55 + (t.maxHealth - t.health) * 0.08, "q");
                    c.heal(10);
                });
            },
            // Volatile Spiderling / Skittering Frenzy
            w: () => {
                if (spider) {
                    c.buffs.excited = 4;
                    c.buffs.elise_w = 4;
                    c.heal(20);
                    return;
                }
                const pos = c.at("w");
                const flight = lob(c, "elise_w", "w", pos);
                for (const [delay, dmg] of [[0.7, 35], [2, 25]]) {
                    c.later(flight + delay, () => {
                        for (const e of c.enemies(5, pos)) {
                            c.hit(e, dmg, "w");
                            e.debuffs.applySlow(0.3, 1);
                        }
                    });
                }
            },
            // Cocoon / Rappel
            e: () => {
                if (!spider) {
                    skillshot(c, "elise_e", "e", {
                        len: 30,
                        width: 1.4,
                        dmg: 20,
                        on: (e) => stun(e, 1.6),
                    });
                    return;
                }
                c.player.dodgeTime = 1;
                c.buffs.elise_e = 1;
                c.dash(c.cursor(12), 70);
                c.later(1, () => {
                    const t = c.nearest(6);
                    if (!t) return;
                    c.hit(t, 45, "e");
                    stun(t, 0.8);
                });
            },
            // Spider Form: switches form (and back)
            r: () => {
                const mine = ++form;
                spider = !spider;
                c.buffs.elise_r = spider ? 8 : 0;
                c.buffs.excited = spider ? 8 : 0;
                c.shoot("elise_r", "r", c.aim, { distance: 3 });
                if (spider) {
                    c.later(8, () => {
                        if (form === mine) spider = false;
                    });
                }
            },
        };
    },

    // ---------------------------------------------------------------------------------------------
    evelynn: (c) => ({
        // Hate Spike: three barbs in a volley down a line
        q: () => {
            pulse(c, 3, 0.15, (i) => {
                skillshot(c, "evelynn_q", "q", {
                    len: Math.min(c.reach("q"), 26),
                    width: 1.2,
                    dmg: i === 0 ? 30 : 18,
                });
            });
        },
        // Allure: marks a target; after 2.5 s it is charmed and drawn to her
        w: () => {
            const t = c.nearest(Math.min(c.reach("w"), 40));
            if (!t) return false;
            bolt(c, "evelynn_w", "w", t, 0);
            c.later(2.5, () => {
                if (t.dead) return;
                c.hit(t, 50, "w");
                if (t.charmDuration <= 0) t.setDirty();
                t.charmDuration = Math.max(t.charmDuration, 1.5);
                t.debuffs.applySlow(0.65, 1.5);
                drag(t, v2.add(t.pos, v2.mul(dirTo(c, t.pos), -3)), 4);
            });
        },
        // Whiplash: lashes everything just in front of her and slows it
        e: () => {
            cone(c, "e", {
                len: 8,
                half: 0.6,
                id: "evelynn_e",
                fn: (e) => {
                    c.hit(e, 45 + (e.maxHealth - e.health) * 0.15, "e");
                    e.debuffs.applySlow(0.3, 1.5);
                },
            });
        },
        // Last Caress: a cone of claws that finishes anyone already low
        r: () => {
            cone(c, "r", {
                len: 10,
                half: 0.7,
                id: "evelynn_r",
                delay: 0.15,
                fn: (e) => c.hit(e, e.health < e.maxHealth * 0.3 ? 200 : 90, "r"),
            });
            c.player.dodgeTime = 0.5;
            c.buffs.youmuu = 2;
        },
    }),
};
