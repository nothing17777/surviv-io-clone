import type { AbilityKey } from "../../../../shared/defs/gameObjects/championDefs.ts";
import { v2, type Vec2 } from "../../../../shared/utils/v2.ts";
import type { Champion } from "../champion.ts";
import type { Player } from "../objects/player.ts";
import type { ChampionKitMap } from "./types.ts";

/** hand-written kits, batch 3 (see types.ts: do not read anything off `c` outside a callback) */

type Stat = keyof Champion["stats"];

/** a timed stat boost that is taken back off when it ends */
function boost(c: Champion, name: string, stat: Stat, amount: number, secs: number) {
    c.buffs[name] = secs;
    c.stats[stat] += amount;
    c.later(secs, () => {
        c.stats[stat] -= amount;
    });
}

/** everyone within r of `at` takes the hit, and `fx` lands on each of them */
function blast(
    c: Champion,
    at: Vec2,
    r: number,
    dmg: number,
    key: AbilityKey,
    fx?: (e: Player) => void,
): Player[] {
    const hit = c.enemies(r, at);
    for (const e of hit) {
        c.hit(e, dmg, key);
        fx?.(e);
    }
    return hit;
}

/** pushes an enemy away from the champion (or from `from`) */
function shove(c: Champion, e: Player, dist: number, speed = 50, from = c.player.pos) {
    const d = v2.normalizeSafe(v2.sub(e.pos, from), c.aim);
    e.webPull = { target: v2.add(e.pos, v2.mul(d, dist)), speed, time: dist / speed + 0.1 };
}

/** pulls an enemy to a spot */
function drag(e: Player, to: Vec2, speed = 45) {
    e.webPull = { target: to, speed, time: v2.distance(e.pos, to) / speed + 0.1 };
}

const stun = (e: Player, t: number) => {
    e.debuffs.root = Math.max(e.debuffs.root, t);
    e.debuffs.silence = Math.max(e.debuffs.silence, t);
};
const knockUp = (e: Player, t: number) => {
    e.debuffs.airborne = Math.max(e.debuffs.airborne, t);
};
const root = (e: Player, t: number) => {
    e.debuffs.root = Math.max(e.debuffs.root, t);
};

/** a shot lobbed at a spot: the effect lands when it arrives */
function lob(c: Champion, key: AbilityKey, bullet: string, speed: number, to: Vec2, then: () => void) {
    const from = v2.copy(c.player.pos);
    const dist = v2.distance(from, to);
    c.shoot(bullet, key, v2.sub(to, from), { distance: dist });
    c.later(dist / speed, then);
}

/** how far along a ray the enemy is, or -1 when it is not on it */
function along(e: Player, origin: Vec2, dir: Vec2, len: number, width: number) {
    const to = v2.sub(e.pos, origin);
    const a = v2.dot(to, dir);
    return a > 0 && a < len + e.rad && Math.abs(v2.dot(to, v2.perp(dir))) < width + e.rad ? a : -1;
}

/** a shot that stops at the first enemy on its line; `onHit` runs when it gets there */
function skillshot(
    c: Champion,
    bullet: string,
    key: AbilityKey,
    len: number,
    width: number,
    speed: number,
    onHit: (e: Player) => void,
) {
    const origin = v2.copy(c.player.pos);
    const dir = c.aim;
    let best: Player | undefined;
    let bestAlong = Infinity;
    for (const e of c.enemies(len + 2)) {
        const a = along(e, origin, dir, len, width);
        if (a >= 0 && a < bestAlong) [best, bestAlong] = [e, a];
    }
    c.shoot(bullet, key, dir, { distance: best ? bestAlong : len });
    if (!best) return;
    const t = best;
    c.later(bestAlong / speed, () => {
        if (!t.dead && along(t, origin, dir, len, width + 1) >= 0) onHit(t);
    });
}

/** a piercing wave: everyone it sweeps over is hit once */
function wave(
    c: Champion,
    bullet: string,
    key: AbilityKey,
    speed: number,
    len: number,
    width: number,
    dmg: number,
    fx?: (e: Player, dir: Vec2) => void,
) {
    const origin = v2.copy(c.player.pos);
    const dir = c.aim;
    c.shoot(bullet, key, dir, { distance: len });
    const hit = new Set<Player>();
    const step = Math.min(0.1, (width * 0.9) / speed);
    for (let i = 0; i <= Math.ceil(len / speed / step); i++) {
        c.later(i * step, () => {
            const at = v2.add(origin, v2.mul(dir, Math.min(len, speed * i * step)));
            for (const e of c.enemies(width + 1, at)) {
                if (hit.has(e)) continue;
                hit.add(e);
                c.hit(e, dmg, key);
                fx?.(e, dir);
            }
        });
    }
}

const pulses = (c: Champion, n: number, every: number, fn: (i: number) => void) => {
    for (let i = 0; i < n; i++) c.later(every * i, () => fn(i));
};

const spread = (c: Champion, rad: number) => v2.rotate(c.aim, (Math.random() - 0.5) * 2 * rad);

export const kits: ChampionKitMap = {
    kayn: (c) => ({
        // Reaping Slash: dashes, then slashes everything around the landing
        q: () => {
            const to = c.at("q");
            c.dash(to, 60);
            c.later(0.25, () => blast(c, c.player.pos, 6, 60, "q"));
        },
        // Blade's Reach: the scythe swings down a line after a beat, damaging and slowing
        w: () => {
            c.shoot("kayn_w", "w");
            c.later(0.5, () => {
                for (const e of c.lineHit(c.reach("w"), 2.5)) {
                    c.hit(e, 60, "w");
                    e.debuffs.applySlow(0.4, 1.5);
                }
            });
        },
        // Shadow Step: faster, and regains health while walking through terrain
        e: () => {
            boost(c, "kayn_e", "moveSpeed", 3, 1.5);
            c.heal(15);
        },
        // Umbral Trespass: possess an enemy, then burst out of them
        r: () => {
            const t = c.nearest(c.reach("r"));
            if (!t) return false;
            c.dash(t.pos, 60);
            c.player.dodgeTime = 1.2;
            c.buffs.kayn_r = 1.2;
            c.later(1.2, () => {
                if (!t.dead) c.hit(t, 100 + (t.maxHealth - t.health) * 0.15, "r", true);
            });
        },
    }),

    kennen: (c) => ({
        // Thundering Shuriken
        q: () => c.shoot("kennen_q", "q"),
        // Electrical Surge: shocks everything nearby
        w: () => {
            blast(c, c.player.pos, c.reach("w"), 40, "w");
        },
        // Lightning Rush: a ball of lightning that is much faster and shocks what it touches
        e: () => {
            boost(c, "kennen_e", "moveSpeed", 5, 2);
            pulses(c, 5, 0.4, () => blast(c, c.player.pos, 4, 18, "e"));
        },
        // Slicing Maelstrom: a storm around him for three seconds
        r: () => {
            pulses(c, 6, 0.5, () => blast(c, c.player.pos, c.reach("r"), 28, "r"));
            c.buffs.kennen_r = 3;
        },
    }),

    khazix: (c) => ({
        // Taste Their Fear: stronger against an isolated target
        q: () => {
            const t = c.nearest(c.reach("q"));
            if (!t) return false;
            const alone = c.enemies(12, t.pos).length <= 1;
            c.hit(t, alone ? 100 : 65, "q");
        },
        // Void Spike: three spikes in a fan
        w: () => {
            for (const a of [-0.3, 0, 0.3]) c.shoot("khazix_w", "w", v2.rotate(c.aim, a));
        },
        // Leap
        e: () => {
            const to = c.at("e");
            c.dash(to, 90);
            c.later(0.35, () => blast(c, c.player.pos, 4, 60, "e"));
        },
        // Void Assault: stealth and speed, and the other spells come back sooner
        r: () => {
            boost(c, "khazix_r", "moveSpeed", 2.5, 5);
            c.nextAttackBonus = Math.max(c.nextAttackBonus, 0.6);
            for (let i = 0; i < 3; i++) c.cooldowns[i] *= 0.5;
        },
    }),

    kindred: (c) => ({
        // Dance of Arrows: tumbles and looses arrows at nearby targets
        q: () => {
            c.dash(c.at("q"), 70);
            c.later(0.15, () => {
                const ts = c.enemies(20).sort((a, b) =>
                    v2.distance(a.pos, c.player.pos) - v2.distance(b.pos, c.player.pos)
                );
                for (let i = 0; i < 3; i++) {
                    const t = ts[i % Math.max(ts.length, 1)];
                    c.shoot("kindred_q", "q", t ? v2.sub(t.pos, c.player.pos) : spread(c, 0.3), { homing: t });
                }
            });
        },
        // Wolf's Frenzy: the wolf guards a spot and bites whoever stands in it
        w: () => {
            const at = v2.copy(c.player.pos);
            c.buffs.kindred_w = 3;
            pulses(c, 6, 0.5, () => blast(c, at, 14, 14, "w"));
        },
        // Mounting Dread: a marked arrow that slows
        e: () => {
            const t = c.nearest(c.reach("e"));
            c.shoot("kindred_e", "e", t ? v2.sub(t.pos, c.player.pos) : c.aim, { homing: t });
            if (t) {
                c.later(0.15, () => {
                    if (!t.dead) t.debuffs.applySlow(0.5, 1.5);
                });
            }
        },
        // Lamb's Respite: death is held off for a few seconds
        r: () => {
            c.stats.damageReduction += 0.6;
            c.buffs.kindred_r = 4;
            c.later(4, () => {
                c.stats.damageReduction -= 0.6;
            });
            pulses(c, 4, 1, () => c.heal(20));
        },
    }),

    kled: (c) => ({
        // Beartrap on a Rope: snares the first enemy hit and reels them in
        q: () =>
            skillshot(c, "kled_q", "q", c.reach("q"), 1.5, 80, (e) => {
                c.hit(e, 55, "q");
                drag(e, v2.add(c.player.pos, v2.mul(v2.normalizeSafe(v2.sub(e.pos, c.player.pos)), 3)), 55);
            }),
        // Violent Tendencies: faster attacks, the third a heavy one
        w: () => {
            boost(c, "kled_w", "attackSpeed", 0.7, 4);
            c.nextAttackBonus = Math.max(c.nextAttackBonus, 0.5);
        },
        // Jousting: a charge that hits at the end
        e: () => {
            c.dash(c.at("e"), 70);
            c.later(0.35, () => blast(c, c.player.pos, 4, 60, "e", (e) => e.debuffs.applySlow(0.3, 1)));
        },
        // Chaaaaaaaarge!!!: a long charge that hits everything it runs over
        r: () => {
            c.addShield(60);
            c.dash(c.cursor(60), 80);
            pulses(c, 6, 0.12, () => blast(c, c.player.pos, 4, 20, "r"));
            c.later(0.8, () => blast(c, c.player.pos, 6, 60, "r", (e) => e.debuffs.applySlow(0.5, 1.5)));
        },
    }),

    kogmaw: (c) => ({
        // Caustic Spittle
        q: () => c.shoot("kogmaw_q", "q"),
        // Bio-Arcane Barrage: a long burst of fast attacks
        w: () => boost(c, "kogmaw_w", "attackSpeed", 0.9, 6),
        // Void Ooze: a slowing trail across the line
        e: () => {
            c.shoot("kogmaw_e", "e");
            for (const e of c.lineHit(c.reach("e"), 2)) {
                c.hit(e, 45, "e");
                e.debuffs.applySlow(0.4, 2);
            }
        },
        // Living Artillery: a shell lands at the target spot
        r: () => {
            const to = c.at("r");
            lob(c, "r", "kogmaw_r", 110, to, () => blast(c, to, 4, 100, "r"));
        },
    }),

    leblanc: (c) => {
        let last: AbilityKey = "q";
        // Sigil of Malice: hits now and again when the sigil goes off
        const q = (m = 1) => {
            const t = c.nearest(c.reach("q"));
            c.shoot("leblanc_q", "q", t ? v2.sub(t.pos, c.player.pos) : c.aim, { homing: t });
            if (t) {
                c.later(1.2, () => {
                    if (!t.dead) c.hit(t, 55 * m, "q");
                });
            }
        };
        // Distortion: slides away, bursts on landing, and slides back
        const w = (m = 1) => {
            const origin = v2.copy(c.player.pos);
            c.dash(c.at("w"), 90);
            c.later(0.25, () => blast(c, c.player.pos, 4, 50 * m, "w"));
            c.later(3, () => c.dash(origin, 90));
        };
        // Ethereal Chains: roots whoever it hits
        const e = (m = 1) =>
            skillshot(c, "leblanc_e", "e", c.reach("e"), 1.5, 70, (t) => {
                c.hit(t, 30 * m, "e");
                root(t, 1.5);
            });
        return {
            q: () => {
                last = "q";
                q();
            },
            w: () => {
                last = "w";
                w();
            },
            e: () => {
                last = "e";
                e();
            },
            // Mimic: casts the last of those again, harder
            r: () => {
                if (last === "w") w(1.6);
                else if (last === "e") e(1.8);
                else q(1.8);
            },
        };
    },

    leesin: (c) => ({
        // Sonic Wave / Resonating Strike: hits, then Lee flies to what he hit
        q: () =>
            skillshot(c, "leesin_q", "q", c.reach("q"), 1.5, 70, (t) => {
                c.hit(t, 50, "q");
                c.later(0.3, () => {
                    if (t.dead) return;
                    c.dash(v2.sub(t.pos, v2.mul(v2.normalizeSafe(v2.sub(t.pos, c.player.pos)), 1.5)), 80);
                    c.hit(t, 40 + (t.maxHealth - t.health) * 0.12, "q");
                });
            }),
        // Safeguard / Iron Will: a shield and life steal
        w: () => {
            c.addShield(60);
            boost(c, "leesin_w", "lifesteal", 0.2, 4);
        },
        // Tempest: a shockwave that leaves enemies slowed
        e: () => {
            blast(c, c.player.pos, 13, 50, "e", (e) => e.debuffs.applySlow(0.4, 2));
        },
        // Dragon's Rage: a kick that sends the target flying into the others
        r: () => {
            const t = c.nearest(c.reach("r"));
            if (!t) return false;
            c.hit(t, 100, "r");
            const dir = v2.normalizeSafe(v2.sub(t.pos, c.player.pos), c.aim);
            const from = v2.copy(t.pos);
            shove(c, t, 14, 70);
            c.later(0.15, () => {
                for (const e of c.enemies(6, v2.add(from, v2.mul(dir, 7)))) {
                    if (e === t) continue;
                    c.hit(e, 60, "r");
                    knockUp(e, 0.6);
                }
            });
        },
    }),

    leona: (c) => ({
        // Shield of Daybreak: the next attack stuns
        q: () => {
            c.nextAttackBonus = Math.max(c.nextAttackBonus, 0.8);
            c.nextAttackSlow = true;
            c.nextAttackSilence = true;
            c.buffs.leona_q = 4;
        },
        // Eclipse: armor now and an explosion when it ends
        w: () => {
            c.addShield(60);
            c.stats.damageReduction += 0.3;
            c.buffs.leona_w = 3;
            c.later(3, () => {
                c.stats.damageReduction -= 0.3;
                blast(c, c.player.pos, 11, 55, "w");
            });
        },
        // Zenith Blade: a blade that Leona charges after
        e: () => {
            const dir = c.aim;
            const origin = v2.copy(c.player.pos);
            let best: Player | undefined;
            let bestAlong = Infinity;
            for (const e of c.enemies(c.reach("e") + 2)) {
                const a = along(e, origin, dir, c.reach("e"), 1.5);
                if (a >= 0 && a < bestAlong) [best, bestAlong] = [e, a];
            }
            c.shoot("leona_e", "e", dir, { distance: best ? bestAlong : c.reach("e") });
            if (best) {
                const t = best;
                c.dash(v2.sub(t.pos, v2.mul(dir, 1.5)), 80);
                c.later(0.3, () => {
                    if (t.dead) return;
                    c.hit(t, 50, "e");
                    root(t, 0.5);
                });
            }
        },
        // Solar Flare: a beam from the sun; the outer ring is slowed, the center is stunned
        r: () => {
            const at = c.at("r");
            c.shoot("leona_r", "r", v2.sub(at, c.player.pos), { from: at, distance: 0.1 });
            c.later(0.9, () => {
                blast(c, at, 6, 80, "r", (e) => e.debuffs.applySlow(0.6, 1.5));
                for (const e of c.enemies(2.5, at)) stun(e, 1.5);
            });
        },
    }),

    lillia: (c) => ({
        // Blooming Blows: the edge of the swing hits harder
        q: () => {
            const hit = c.enemies(c.reach("q"));
            for (const e of hit) c.hit(e, v2.distance(e.pos, c.player.pos) > 9 ? 70 : 40, "q");
            if (hit.length) c.heal(20);
            c.buffs.lillia_q = 0.5;
        },
        // Watch Out! Eep!: a burst at a spot, harder in the middle
        w: () => {
            const at = c.at("w");
            c.shoot("lillia_w", "w", v2.sub(at, c.player.pos), { from: at, distance: 0.1 });
            c.later(0.6, () => {
                for (const e of c.enemies(7, at)) c.hit(e, v2.distance(e.pos, at) < 3 ? 90 : 45, "w");
            });
        },
        // Swirlseed: a seed that bursts and slows
        e: () => {
            const to = c.at("e");
            lob(c, "e", "lillia_e", 70, to, () => {
                blast(c, to, 3.5, 40, "e", (e) => e.debuffs.applySlow(0.4, 2));
                c.later(1.5, () => blast(c, to, 3.5, 30, "e"));
            });
        },
        // Lilting Lullaby: everyone nearby falls asleep, and wakes to damage
        r: () => {
            const near = c.enemies(25);
            c.buffs.lillia_r = 1.4;
            for (const e of near) stun(e, 1.4);
            c.later(1.4, () => {
                for (const e of near) if (!e.dead) c.hit(e, 90, "r");
            });
        },
    }),

    lissandra: (c) => ({
        // Ice Shard: slows what it passes through
        q: () => {
            c.shoot("lissandra_q", "q");
            c.later(0.25, () => {
                for (const e of c.lineHit(c.reach("q"), 1.5)) e.debuffs.applySlow(0.3, 1.5);
            });
        },
        // Ring of Frost: roots everyone around her
        w: () => {
            blast(c, c.player.pos, c.reach("w"), 45, "w", (e) => root(e, 1.2));
        },
        // Glacial Path: send the claw out and teleport to it
        e: () => {
            const to = c.at("e");
            c.shoot("lissandra_e", "e", v2.sub(to, c.player.pos), { distance: v2.distance(to, c.player.pos) });
            c.later(v2.distance(to, c.player.pos) / 70 + 0.2, () => c.dash(to, 150));
        },
        // Frozen Tomb: encases the nearest enemy, and a frost burst around her
        r: () => {
            const t = c.nearest(c.reach("r"));
            c.buffs.lissandra_r = 1.5;
            if (t) {
                stun(t, 1.5);
                c.hit(t, 80, "r");
            }
            blast(c, c.player.pos, 6, 40, "r", (e) => e.debuffs.applySlow(0.5, 2));
        },
    }),

    locke: (c) => ({
        // Ritual Nails: three nails that mark what they hit; the mark is cashed in by the next damage
        q: () => {
            for (const a of [-0.15, 0, 0.15]) c.shoot("locke_q", "q", v2.rotate(c.aim, a));
            c.later(0.35, () => {
                for (const e of c.lineHit(c.reach("q"), 3)) c.markedIds.set(e.__id, 1);
            });
        },
        // Soul Ignition: faster and quicker, at the cost of some health that is partly given back
        w: () => {
            const p = c.player;
            p.health = Math.max(1, p.health - 15);
            p.setDirty();
            boost(c, "locke_w", "attackSpeed", 0.6, 4);
            boost(c, "locke_w2", "moveSpeed", 2, 4);
            c.later(4, () => c.heal(10));
        },
        // Ashen Pursuit: blinks to the spot, then lunges at whoever is nearest
        e: () => {
            c.dash(c.at("e"), 200);
            c.later(0.2, () => {
                const t = c.nearest(15);
                if (!t) return;
                c.dash(t.pos, 90);
                c.later(0.15, () => blast(c, t.pos, 3, 50, "e"));
            });
        },
        // Purgatory: a binding artifact that finishes the weak
        r: () =>
            skillshot(c, "locke_r", "r", c.reach("r"), 2, 60, (t) => {
                c.hit(t, 90, "r");
                if (t.health < t.maxHealth * 0.3) c.hit(t, t.health + 1, "r", true);
            }),
    }),

    lucian: (c) => ({
        // Piercing Light: a bolt that goes straight through
        q: () => {
            c.shoot("lucian_q", "q");
        },
        // Ardent Blaze: a bolt that bursts and marks
        w: () => c.shoot("lucian_w", "w"),
        // Relentless Pursuit: dashes, and the next shot is free
        e: () => {
            c.dash(c.at("e"), 90);
            c.nextAttackBonus = Math.max(c.nextAttackBonus, 0.4);
            c.later(0.2, () => {
                const t = c.nearest(25);
                c.shoot("lucian_p", "e", t ? v2.sub(t.pos, c.player.pos) : c.aim, { homing: t });
            });
        },
        // The Culling: a long stream of shots, aimed as he goes
        r: () => {
            c.buffs.lucian_r = 1.8;
            pulses(c, 12, 0.15, () => c.shoot("lucian_r", "r", spread(c, 0.06)));
        },
    }),

    lulu: (c) => ({
        // Glitterlance: Lulu's bolt and Pix's, side by side
        q: () => {
            const side = v2.perp(c.aim);
            c.shoot("lulu_q", "q");
            c.shoot("lulu_q", "q", c.aim, { from: v2.add(c.player.pos, v2.mul(side, 1.5)) });
            c.later(0.25, () => {
                for (const e of c.lineHit(c.reach("q"), 2)) e.debuffs.applySlow(0.5, 1.5);
            });
        },
        // Whimsy: polymorphs the nearest enemy and speeds Lulu up
        w: () => {
            boost(c, "lulu_w", "moveSpeed", 3, 3);
            const t = c.nearest(c.reach("w"));
            if (!t) return;
            stun(t, 1.5);
            t.debuffs.applySlow(0.6, 1.5);
        },
        // Help, Pix!: a shield, and Pix zaps the nearest enemy
        e: () => {
            c.addShield(70, 200);
            const t = c.nearest(c.reach("e"));
            if (t) c.shoot("lulu_e", "e", v2.sub(t.pos, c.player.pos), { homing: t });
        },
        // Wild Growth: knocks up everyone close and grows tougher
        r: () => {
            c.addShield(100, 220);
            c.heal(30);
            c.buffs.lulu_r = 7;
            blast(c, c.player.pos, 12, 30, "r", (e) => knockUp(e, 1.2));
        },
    }),

    malphite: (c) => ({
        // Seismic Shard: a shard to a spot that slows and steals speed
        q: () => {
            const to = c.at("q");
            lob(c, "q", "malphite_q", 90, to, () => {
                const hit = blast(c, to, 3, 55, "q", (e) => e.debuffs.applySlow(0.5, 3));
                if (hit.length) boost(c, "malphite_q", "moveSpeed", 2, 3);
            });
        },
        // Thunderclap: tougher and the next strike hits everything around
        w: () => {
            c.stats.damageReduction += 0.2;
            c.later(4, () => {
                c.stats.damageReduction -= 0.2;
            });
            boost(c, "malphite_w", "damage", 0.3, 4);
            c.nextAttackBonus = Math.max(c.nextAttackBonus, 0.7);
        },
        // Ground Slam
        e: () => {
            blast(c, c.player.pos, c.reach("e"), 50, "e", (e) => e.debuffs.applySlow(0.5, 3));
        },
        // Unstoppable Force: charges to a spot and knocks everyone up
        r: () => {
            c.dash(c.at("r"), 110);
            c.later(0.5, () => blast(c, c.player.pos, 8, 100, "r", (e) => knockUp(e, 1.3)));
        },
    }),

    malzahar: (c) => ({
        // Call of the Void: two portals sweep in and silence
        q: () => {
            for (const a of [-0.25, 0.25]) c.shoot("malzahar_q", "q", v2.rotate(c.aim, a));
            c.later(0.5, () => {
                for (const e of c.lineHit(c.reach("q"), 3)) {
                    c.hit(e, 40, "q");
                    e.debuffs.silence = Math.max(e.debuffs.silence, 1.5);
                }
            });
        },
        // Void Swarm: voidlings that attack whoever is near
        w: () => {
            c.buffs.malzahar_w = 1.5;
            pulses(c, 5, 0.3, () => {
                const t = c.nearest(18);
                if (t) c.shoot("malzahar_w", "w", v2.sub(t.pos, c.player.pos), { homing: t });
            });
        },
        // Malefic Visions: a corrupting bolt that keeps burning
        e: () => {
            const t = c.nearest(c.reach("e"));
            if (!t) return false;
            c.shoot("malzahar_e", "e", v2.sub(t.pos, c.player.pos), { homing: t });
            t.applyPoison(3, c.player);
        },
        // Nether Grasp: suppresses one enemy while he channels
        r: () => {
            const t = c.nearest(c.reach("r"));
            if (!t) return false;
            stun(t, 2.5);
            c.player.debuffs.root = Math.max(c.player.debuffs.root, 2.5);
            drag(t, v2.add(c.player.pos, v2.mul(v2.normalizeSafe(v2.sub(t.pos, c.player.pos)), 4)));
            pulses(c, 5, 0.5, () => {
                if (!t.dead) c.hit(t, 30, "r", true);
            });
        },
    }),

    maokai: (c) => ({
        // Bramble Smash: a wave that throws enemies back
        q: () =>
            wave(c, "maokai_q", "q", 60, c.reach("q"), 2.5, 55, (e) => {
                shove(c, e, 6, 45);
                e.debuffs.applySlow(0.5, 1.5);
            }),
        // Twisted Advance: charges a target and roots it
        w: () => {
            const t = c.nearest(c.reach("w"));
            if (!t) return false;
            c.dash(t.pos, 90);
            c.later(0.3, () => {
                if (t.dead) return;
                c.hit(t, 45, "w");
                root(t, 1);
            });
        },
        // Sapling Toss: a sapling that lands and keeps biting
        e: () => {
            const to = c.at("e");
            lob(c, "e", "maokai_e", 70, to, () => {
                blast(c, to, 4, 35, "e", (e) => e.debuffs.applySlow(0.4, 1));
                pulses(c, 3, 0.6, () => blast(c, to, 5, 15, "e"));
            });
        },
        // Nature's Grasp: a slow wall of brambles that roots what it crosses
        r: () =>
            wave(c, "maokai_r", "r", 60, 48, 5, 55, (e) => {
                root(e, 1.5);
            }),
    }),

    mel: (c) => ({
        // Radiant Volley: a barrage that explodes around the target spot
        q: () => {
            const to = c.at("q");
            for (let i = 0; i < 6; i++) {
                const at = v2.add(to, v2.create((Math.random() - 0.5) * 6, (Math.random() - 0.5) * 6));
                c.later(0.15 * i, () => lob(c, "q", "mel_q", 80, at, () => blast(c, at, 3, 18, "q")));
            }
        },
        // Rebuttal: a barrier that stops shots and damage
        w: () => {
            c.zones.push({ pos: v2.add(c.player.pos, v2.mul(c.aim, 2)), time: 1.5, kind: "windwall", dir: c.aim });
            c.player.dodgeTime = 1;
            boost(c, "mel_w", "moveSpeed", 3, 2);
        },
        // Solar Snare: an orb that roots its center and slows around it
        e: () => {
            const to = c.at("e");
            lob(c, "e", "mel_e", 60, to, () => {
                blast(c, to, 4, 35, "e", (e) => e.debuffs.applySlow(0.5, 2));
                for (const e of c.enemies(2, to)) root(e, 1.2);
            });
        },
        // Golden Eclipse: strikes every enemy, wherever they are
        r: () => {
            const all = c.enemies(80);
            if (!all.length) return false;
            for (const e of all) {
                c.shoot("mel_r", "r", v2.sub(e.pos, c.player.pos), { from: e.pos, distance: 0.1 });
                c.later(0.5, () => {
                    if (!e.dead) c.hit(e, 90 + (e.maxHealth - e.health) * 0.1, "r");
                });
            }
        },
    }),

    milio: (c) => ({
        // Ultra Mega Fire Kick: a ball that knocks up where it lands
        q: () => {
            const to = c.at("q");
            lob(c, "q", "milio_q", 70, to, () => blast(c, to, 3.5, 45, "q", (e) => knockUp(e, 0.8)));
        },
        // Cozy Campfire: heals while standing near it
        w: () => {
            const at = v2.copy(c.player.pos);
            c.buffs.milio_w = 3;
            pulses(c, 5, 0.6, () => {
                if (v2.distance(c.player.pos, at) < 8) c.heal(12);
            });
        },
        // Warm Hugs: a shield and a burst of speed
        e: () => {
            c.addShield(70, 180);
            boost(c, "milio_e", "moveSpeed", 3, 2);
        },
        // Breath of Life: heals and cleanses
        r: () => {
            c.heal(80);
            const d = c.player.debuffs;
            d.root =
                d.slow =
                d.silence =
                d.airborne =
                    0;
            c.buffs.milio_r = 1;
        },
    }),

    missfortune: (c) => ({
        // Double Up: a shot that ricochets into someone behind
        q: () => {
            const t = c.nearest(c.reach("q"));
            c.shoot("missfortune_q", "q", t ? v2.sub(t.pos, c.player.pos) : c.aim, { homing: t });
            if (!t) return;
            const second = c.enemies(8, t.pos).filter((e) => e !== t)[0];
            if (!second) return;
            c.later(0.25, () => {
                c.shoot("missfortune_q", "q", v2.sub(second.pos, t.pos), { homing: second, from: t.pos, mult: 1.4 });
            });
        },
        // Strut: faster to move and to attack
        w: () => {
            boost(c, "missfortune_w", "moveSpeed", 4, 4);
            boost(c, "missfortune_w2", "attackSpeed", 0.5, 4);
        },
        // Make It Rain: a rain of bullets over a spot
        e: () => {
            const to = c.at("e");
            c.shoot("missfortune_e", "e", v2.sub(to, c.player.pos), { distance: v2.distance(to, c.player.pos) });
            c.later(0.4, () => {
                pulses(c, 5, 0.4, () => blast(c, to, 5, 20, "e", (e) => e.debuffs.applySlow(0.5, 0.8)));
            });
        },
        // Bullet Time: stands still and fires a storm in a cone
        r: () => {
            c.player.debuffs.root = Math.max(c.player.debuffs.root, 2);
            c.buffs.missfortune_r = 2;
            pulses(c, 12, 0.16, () => c.shoot("missfortune_r", "r", spread(c, 0.3)));
        },
    }),

    monkeyking: (c) => ({
        // Crushing Blow: a faster next strike that hits hard
        q: () => {
            c.nextAttackBonus = Math.max(c.nextAttackBonus, 1);
            boost(c, "monkeyking_q", "moveSpeed", 3, 3);
        },
        // Decoy: slips away and leaves a clone that strikes
        w: () => {
            c.player.dodgeTime = 0.8;
            boost(c, "monkeyking_w", "moveSpeed", 2, 2);
            const at = v2.copy(c.player.pos);
            c.later(1.2, () => blast(c, at, 8, 45, "w"));
        },
        // Nimbus Strike: dashes to a target while clones hit the others
        e: () => {
            const t = c.nearest(c.reach("e"));
            if (!t) return false;
            c.dash(t.pos, 90);
            c.later(0.3, () => {
                c.hit(t, 55, "e");
                for (const o of c.enemies(8, t.pos)) if (o !== t) c.hit(o, 30, "e");
            });
        },
        // Cyclone: a spin that throws everyone up
        r: () => {
            boost(c, "monkeyking_r", "moveSpeed", 3, 2.4);
            blast(c, c.player.pos, c.reach("r"), 20, "r", (e) => knockUp(e, 0.8));
            pulses(c, 7, 0.3, () => blast(c, c.player.pos, c.reach("r"), 18, "r", (e) => knockUp(e, 0.4)));
        },
    }),

    mordekaiser: (c) => ({
        // Obliterate: a heavy mace blow, stronger against a lone target
        q: () => {
            const at = c.at("q");
            c.later(0.3, () => {
                const hit = c.enemies(4, at);
                for (const e of hit) c.hit(e, hit.length === 1 ? 85 : 60, "q");
            });
            c.buffs.mordekaiser_q = 0.4;
        },
        // Indestructible: soaks damage, and some of it comes back as health
        w: () => {
            c.addShield(90, 200);
            c.buffs.mordekaiser_w = 3;
            c.later(3, () => c.heal(40));
        },
        // Death's Grasp: drags everyone in the area to him
        e: () => {
            const at = c.at("e");
            c.later(0.4, () => {
                for (const e of blast(c, at, 4, 55, "e")) {
                    drag(e, v2.add(c.player.pos, v2.mul(c.aim, 2.5)));
                }
            });
            c.buffs.mordekaiser_e = 0.4;
        },
        // Realm of Death: drags a target into a duel and drains them
        r: () => {
            const t = c.nearest(c.reach("r"));
            if (!t) return false;
            c.hit(t, 40, "r");
            drag(t, v2.add(c.player.pos, v2.mul(v2.normalizeSafe(v2.sub(t.pos, c.player.pos)), 3)));
            t.debuffs.applySlow(0.4, 3);
            pulses(c, 4, 0.5, () => {
                if (t.dead) return;
                c.hit(t, 15, "r", true);
                c.heal(5);
            });
        },
    }),

    morgana: (c) => ({
        // Dark Binding: roots the first enemy it touches
        q: () =>
            skillshot(c, "morgana_q", "q", c.reach("q"), 1.5, 75, (e) => {
                c.hit(e, 55, "q");
                root(e, 2);
            }),
        // Tormented Shadow: a pool of dark flame that burns
        w: () => {
            const at = c.at("w");
            pulses(c, 5, 0.5, () => {
                c.shoot("morgana_w", "w", c.aim, { from: at, distance: 0.1 });
                blast(c, at, 5, 15, "w");
            });
        },
        // Black Shield: absorbs damage and shrugs off crowd control
        e: () => {
            c.addShield(90, 200);
            const d = c.player.debuffs;
            d.root =
                d.slow =
                d.silence =
                d.airborne =
                    0;
            c.buffs.morgana_e = 4;
        },
        // Soul Shackles: chains everyone nearby, then stuns those who stay
        r: () => {
            blast(c, c.player.pos, 20, 55, "r", (e) => e.debuffs.applySlow(0.4, 2.5));
            c.buffs.morgana_r = 2.5;
            c.later(2.5, () => blast(c, c.player.pos, 20, 55, "r", (e) => stun(e, 1.5)));
        },
    }),

    naafiri: (c) => ({
        // Darkin Daggers: a fan of daggers that make enemies bleed
        q: () => {
            for (const a of [-0.2, 0, 0.2]) c.shoot("naafiri_q", "q", v2.rotate(c.aim, a));
            c.later(0.3, () => {
                for (const e of c.lineHit(c.reach("q"), 3)) e.applyBleed(3, c.player);
            });
        },
        // Hounds' Pursuit: charges the nearest enemy with the pack
        w: () => {
            const t = c.nearest(c.reach("w") + 8);
            if (!t) {
                c.dash(c.at("w"), 70);
                return;
            }
            c.dash(t.pos, 90);
            c.later(0.25, () => {
                c.hit(t, 50, "w");
                for (const o of c.enemies(5, t.pos)) if (o !== t) c.hit(o, 25, "w");
            });
        },
        // Eviscerate: a whirling slash, twice
        e: () => {
            blast(c, c.player.pos, 12, 45, "e");
            c.later(0.4, () => blast(c, c.player.pos, 12, 45, "e"));
        },
        // Call of the Pack: charges in and brings the pack, stronger for it
        r: () => {
            c.dash(c.at("r"), 100);
            c.addShield(60);
            boost(c, "naafiri_r", "damage", 0.25, 8);
            boost(c, "naafiri_r2", "moveSpeed", 2, 8);
            c.later(0.35, () => blast(c, c.player.pos, 5, 60, "r"));
        },
    }),

    nami: (c) => ({
        // Aqua Prison: a bubble that lands and holds enemies up
        q: () => {
            const to = c.at("q");
            lob(c, "q", "nami_q", 40, to, () => blast(c, to, 4, 55, "q", (e) => knockUp(e, 1.5)));
        },
        // Ebb and Flow: a bolt that heals her as it goes
        w: () => {
            const t = c.nearest(c.reach("w"));
            c.shoot("nami_w", "w", t ? v2.sub(t.pos, c.player.pos) : c.aim, { homing: t });
            c.heal(20);
        },
        // Tidecaller's Blessing: the next strike slows, and she attacks faster
        e: () => {
            c.nextAttackBonus = Math.max(c.nextAttackBonus, 0.6);
            c.nextAttackSlow = true;
            boost(c, "nami_e", "attackSpeed", 0.3, 6);
        },
        // Tidal Wave: a huge wave that throws everything in it into the air
        r: () => wave(c, "nami_r", "r", 55, 60, 5, 80, (e) => knockUp(e, 1)),
    }),

    nasus: (c) => ({
        // Siphoning Strike: the next attack hits much harder
        q: () => {
            c.nextAttackBonus = Math.max(c.nextAttackBonus, 1.2);
            c.buffs.nasus_q = 6;
        },
        // Wither: slows a target more and more
        w: () => {
            const t = c.nearest(c.reach("w"));
            if (!t) return false;
            t.debuffs.applySlow(0.7, 4);
            c.hit(t, 15, "w");
        },
        // Spirit Fire: a fire that burns the ground
        e: () => {
            const at = c.at("e");
            c.shoot("mark", "e", c.aim, { from: at, distance: 0.1 });
            c.later(0.3, () => blast(c, at, 5, 50, "e"));
            c.later(0.8, () => pulses(c, 4, 0.5, () => blast(c, at, 5, 12, "e", (e) => e.debuffs.applySlow(0.2, 0.6))));
        },
        // Fury of the Sands: bigger, tougher, and scorching everything near
        r: () => {
            c.addShield(100, 250);
            c.heal(50);
            c.buffs.nasus_r = 7;
            pulses(c, 14, 0.5, () => blast(c, c.player.pos, 13, 10, "r"));
        },
    }),

    nautilus: (c) => ({
        // Dredge Line: an anchor that hauls in whoever it hits
        q: () =>
            skillshot(c, "nautilus_q", "q", c.reach("q"), 1.5, 75, (e) => {
                c.hit(e, 45, "q");
                root(e, 0.5);
                drag(e, v2.add(c.player.pos, v2.mul(v2.normalizeSafe(v2.sub(e.pos, c.player.pos)), 2.5)), 60);
            }),
        // Titan's Wrath: a shield and damage to whoever is next to him
        w: () => {
            c.addShield(70);
            c.buffs.nautilus_w = 2;
            pulses(c, 4, 0.5, () => blast(c, c.player.pos, 12, 14, "w"));
        },
        // Riptide: three waves spreading out from him
        e: () => {
            pulses(c, 3, 0.3, (i) => blast(c, c.player.pos, 6 + i * 3, 30, "e", (e) => e.debuffs.applySlow(0.5, 1.5)));
        },
        // Depth Charge: a shockwave that tracks a target and launches it
        r: () => {
            const t = c.nearest(c.reach("r"));
            if (!t) return false;
            c.shoot("nautilus_r", "r", v2.sub(t.pos, c.player.pos), { homing: t });
            c.later(v2.distance(t.pos, c.player.pos) / 70, () => {
                if (t.dead) return;
                c.hit(t, 100, "r");
                knockUp(t, 1.2);
            });
        },
    }),

    neeko: (c) => ({
        // Blooming Burst: a seed that bursts twice
        q: () => {
            const to = c.at("q");
            lob(c, "q", "neeko_q", 55, to, () => {
                blast(c, to, 4, 45, "q");
                c.later(0.6, () => blast(c, to, 4, 35, "q"));
            });
        },
        // Shapesplitter: vanishes briefly while two clones fire at the nearest enemy
        w: () => {
            boost(c, "neeko_w", "moveSpeed", 3, 2.5);
            c.player.dodgeTime = 0.5;
            const side = v2.perp(c.aim);
            for (const o of [-3, 3]) {
                const from = v2.add(c.player.pos, v2.mul(side, o));
                c.later(0.4, () => {
                    const t = c.nearest(25, from);
                    c.shoot("neeko_w", "w", t ? v2.sub(t.pos, from) : c.aim, { from, homing: t });
                });
            }
        },
        // Tangle-Barbs: a piercing snare
        e: () => wave(c, "neeko_e", "e", 70, c.reach("e"), 2.2, 50, (e) => root(e, 1.5)),
        // Pop Blossom: leaps, then bursts on whoever is below
        r: () => {
            c.player.dodgeTime = 1;
            c.buffs.neeko_r = 1;
            c.later(1, () => blast(c, c.player.pos, 10, 100, "r", (e) => knockUp(e, 1.2)));
        },
    }),
};
