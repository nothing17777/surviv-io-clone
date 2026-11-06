import type { AbilityKey } from "../../../../shared/defs/gameObjects/championDefs.ts";
import { v2, type Vec2 } from "../../../../shared/utils/v2.ts";
import type { Champion } from "../champion.ts";
import type { Player } from "../objects/player.ts";
import type { ChampionKitMap } from "./types.ts";

// ---- small helpers shared by the kits below (they take the champion, so nothing here runs early)

/** the way from the champion to a point, falling back to where it faces */
const dirTo = (c: Champion, to: Vec2) => v2.normalizeSafe(v2.sub(to, c.player.pos), c.aim);

/** a point `dist` along `dir` from `from` */
const along = (from: Vec2, dir: Vec2, dist: number) => v2.add(from, v2.mul(dir, dist));

/** a tiny shot at a spot, so every client plays the champion's hit effect there */
const spot = (c: Champion, key: AbilityKey, pos: Vec2) => c.shoot("mark", key, c.aim, { from: pos, distance: 0.1 });

/** enemies in a line from a point */
const inLine = (c: Champion, from: Vec2, dir: Vec2, length: number, width: number): Player[] =>
    c.enemies(length + 2, from).filter((e) => {
        const to = v2.sub(e.pos, from);
        const a = v2.dot(to, dir);
        return a > -e.rad && a < length + e.rad && Math.abs(v2.dot(to, v2.perp(dir))) < width + e.rad;
    }).sort((a, b) => v2.distance(a.pos, from) - v2.distance(b.pos, from));

/** enemies in a cone from the champion */
const inCone = (c: Champion, dir: Vec2, range: number, half: number): Player[] =>
    c.enemies(range).filter((e) => {
        const to = v2.normalizeSafe(v2.sub(e.pos, c.player.pos), dir);
        return v2.dot(to, dir) >= Math.cos(half);
    });

/** stun: rooted and silenced */
const stun = (e: Player, time: number) => {
    e.debuffs.root = Math.max(e.debuffs.root, time);
    e.debuffs.silence = Math.max(e.debuffs.silence, time);
};

const knockUp = (e: Player, time: number) => {
    e.debuffs.airborne = Math.max(e.debuffs.airborne, time);
};

/** shove an enemy away from a point */
const push = (c: Champion, e: Player, from: Vec2, dist: number, speed = 50) => {
    const d = v2.normalizeSafe(v2.sub(e.pos, from), c.aim);
    e.webPull = { target: along(e.pos, d, dist), speed, time: dist / speed + 0.1 };
};

/** drag an enemy to a point */
const drag = (e: Player, to: Vec2, speed = 50) => {
    e.webPull = { target: v2.copy(to), speed, time: v2.distance(e.pos, to) / speed + 0.1 };
};

/** `times` calls, `every` seconds apart, the first after `delay` */
const repeat = (c: Champion, times: number, every: number, fn: (i: number) => void, delay = every) => {
    for (let i = 0; i < times; i++) c.later(delay + every * i, () => fn(i));
};

/** damage to everyone in a circle after a delay, with an optional extra effect on each */
const blast = (
    c: Champion,
    key: AbilityKey,
    pos: Vec2,
    radius: number,
    delay: number,
    damage: number,
    fx?: (e: Player) => void,
) => {
    c.later(delay, () => {
        spot(c, key, pos);
        for (const e of c.enemies(radius, pos)) {
            c.hit(e, damage, key);
            fx?.(e);
        }
    });
};

/** how long a shot takes to cover a distance */
const flight = (dist: number, speed: number) => dist / speed;

/** +3 move speed for a while (the garen_q buff only speeds the champion up) */
const sprint = (c: Champion, time: number) => {
    c.buffs.garen_q = Math.max(c.buffs.garen_q ?? 0, time);
};

export const kits: ChampionKitMap = {
    shen: (c) => ({
        // Twilight Assault: a slash that slows, and the next attacks hit harder
        q: () => {
            const dir = c.aim;
            const from = v2.copy(c.player.pos);
            c.dash(along(from, dir, 4), 60);
            for (const e of inLine(c, from, dir, c.reach("q"), 2.5)) {
                c.hit(e, 45, "q");
                e.debuffs.applySlow(0.35, 1.5);
            }
            c.buffs.shen_q = 3;
            c.nextAttackBonus = Math.max(c.nextAttackBonus, 0.5);
        },
        // Spirit's Refuge: a shield while he stands his ground
        w: () => {
            c.addShield(60);
            c.buffs.shen_w = 1.75;
        },
        // Shadow Dash: charges in and taunts (slows and silences) everyone he lands among
        e: () => {
            const to = c.at("e");
            c.dash(to, 70);
            c.buffs.shen_e = 1.5;
            c.later(flight(v2.distance(to, c.player.pos), 70) + 0.15, () => {
                for (const e of c.enemies(5)) {
                    c.hit(e, 40, "e");
                    e.debuffs.applySlow(0.5, 1.5);
                    e.debuffs.silence = Math.max(e.debuffs.silence, 1);
                }
            });
        },
        // Stand United: shields himself while he gathers, then shunts to the target area and lands hard
        r: () => {
            c.addShield(80, 200);
            c.buffs.shen_r = 1.5;
            c.later(1.5, () => {
                const to = c.cursor(45);
                c.dash(to, 110);
                c.later(flight(v2.distance(to, c.player.pos), 110) + 0.1, () => {
                    for (const e of c.enemies(6)) {
                        c.hit(e, 50, "r");
                        e.debuffs.applySlow(0.4, 1.5);
                    }
                });
            });
        },
    }),

    shyvana: (c) => ({
        // Emberstrike (Twin Bite): the next attack lands twice
        q: () => {
            c.nextAttackBonus = Math.max(c.nextAttackBonus, 1);
            c.buffs.shyvana_q = 4;
        },
        // Inferno Aegis (Burnout): a shield and a ring of flame that scorches everyone close
        w: () => {
            c.addShield(35);
            c.buffs.shyvana_w = 3;
            repeat(c, 6, 0.5, () => {
                for (const e of c.enemies(5)) {
                    c.hit(e, 9, "w");
                    e.debuffs.applySlow(0.2, 0.6);
                }
            });
        },
        // Molten Burst (Flame Breath): a fireball down the line
        e: () => c.shoot("shyvana_e", "e"),
        // Dragon's Descent: leaps to the target and lands, knocking everything around back
        r: () => {
            const to = c.at("r");
            c.dash(to, 90);
            c.later(flight(v2.distance(to, c.player.pos), 90) + 0.1, () => {
                const at = c.player.pos;
                spot(c, "r", at);
                for (const e of c.enemies(7)) {
                    c.hit(e, 70, "r");
                    push(c, e, at, 8);
                }
            });
        },
    }),

    singed: (c) => ({
        // Poison Trail: toggled, leaves poison wherever he runs
        q: () => {
            if (c.buff("singed_q")) {
                c.buffs.singed_q = 0;
                return;
            }
            c.buffs.singed_q = 8;
            repeat(c, 16, 0.5, () => {
                if (!c.buff("singed_q")) return;
                for (const e of c.enemies(3.5)) c.hit(e, 8, "q");
            });
        },
        // Mega Adhesive: a bottle of glue that slows everyone in the puddle
        w: () => {
            const pos = c.at("w");
            const d = v2.distance(pos, c.player.pos);
            c.shoot("singed_w", "w", dirTo(c, pos), { distance: d });
            c.later(flight(d, 60), () => {
                spot(c, "w", pos);
                repeat(c, 12, 0.25, () => {
                    for (const e of c.enemies(6, pos)) e.debuffs.applySlow(0.6, 0.4);
                }, 0);
            });
        },
        // Fling: throws the nearest enemy over his shoulder, the way he faces
        e: () => {
            const target = c.nearest(8);
            if (!target) return false;
            c.hit(target, 55, "e");
            drag(target, along(c.player.pos, c.aim, 14), 55);
            knockUp(target, 0.6);
            target.debuffs.applySlow(0.3, 1.5);
        },
        // Insanity Potion: faster, tougher and healthier for a while
        r: () => {
            c.buffs.singed_r = 10;
            c.buffs.excited = 8;
            c.heal(25);
            c.addShield(40);
        },
    }),

    sion: (c) => ({
        // Decimating Smash: a long wind-up, then a smash that knocks everything in front up
        q: () => {
            const dir = c.aim;
            const from = v2.copy(c.player.pos);
            c.buffs.sion_q = 0.7;
            c.player.debuffs.applySlow(0.5, 0.7);
            c.later(0.7, () => {
                for (const e of inLine(c, from, dir, 8, 3.5)) {
                    c.hit(e, 70, "q");
                    knockUp(e, 0.9);
                    e.debuffs.applySlow(0.4, 1.5);
                }
            });
        },
        // Soul Furnace: a shield that bursts when it ends
        w: () => {
            c.addShield(70, 160);
            c.buffs.sion_w = 3;
            c.later(3, () => {
                spot(c, "w", c.player.pos);
                for (const e of c.enemies(6)) c.hit(e, 45, "w");
            });
        },
        // Roar of the Slayer: a roar that slows everything in its path
        e: () => {
            c.shoot("sion_e", "e");
            for (const e of inLine(c, c.player.pos, c.aim, c.reach("e"), 2.5)) e.debuffs.applySlow(0.4, 1.5);
        },
        // Unstoppable Onslaught: charges across the map, knocking up everyone he rams
        r: () => {
            const to = c.cursor(40);
            c.dash(to, 75);
            c.buffs.sion_r = 1.2;
            const struck = new Set<Player>();
            repeat(c, 10, 0.1, () => {
                for (const e of c.enemies(3.5)) {
                    if (struck.has(e)) continue;
                    struck.add(e);
                    c.hit(e, 45, "r");
                    knockUp(e, 0.9);
                }
            });
        },
    }),

    sivir: (c) => ({
        // Boomerang Blade: out and back, hitting on both ways
        q: () => c.shoot("sivir_q", "q"),
        // Ricochet: the next attack bounces
        w: () => {
            c.buffs.sivir_w = 4;
            c.nextAttackBonus = Math.max(c.nextAttackBonus, 0.5);
        },
        // Spell Shield: shrugs off the next spell
        e: () => {
            c.addShield(55);
            c.buffs.sivir_e = 1.5;
        },
        // On The Hunt: attack and move speed for a while
        r: () => {
            c.buffs.excited = 6;
            c.buffs.sivir_r = 6;
        },
    }),

    skarner: (c) => ({
        // Shattered Earth: a wave of rock down the line
        q: () => {
            for (const e of inLine(c, c.player.pos, c.aim, c.reach("q"), 2.5)) {
                c.hit(e, 45, "q");
                e.debuffs.applySlow(0.4, 1.5);
            }
            c.buffs.skarner_q = 4;
            c.nextAttackBonus = Math.max(c.nextAttackBonus, 0.4);
        },
        // Seismic Bastion: a shield, then a shockwave
        w: () => {
            c.addShield(70);
            c.later(0.4, () => {
                spot(c, "w", c.player.pos);
                for (const e of c.enemies(6)) {
                    c.hit(e, 30, "w");
                    e.debuffs.applySlow(0.35, 1.5);
                }
            });
        },
        // Ixtal's Impact: charges forward carrying the first enemy he catches, and slams him down
        e: () => {
            const dest = c.cursor(35);
            const from = v2.copy(c.player.pos);
            const dist = v2.distance(dest, from);
            const caught = inLine(c, from, c.aim, dist + 2, 2.5)[0];
            c.dash(dest, 100);
            if (caught) {
                c.hit(caught, 45, "e");
                drag(caught, dest, 100);
                c.later(flight(dist, 100) + 0.1, () => {
                    if (caught.dead) return;
                    c.hit(caught, 35, "e");
                    stun(caught, 1);
                });
            }
        },
        // Impale: leaps onto the nearest enemy, holds him in the air and tears into him
        r: () => {
            const target = c.nearest(c.reach("r"));
            if (!target) return false;
            c.dash(target.pos, 90);
            c.later(0.25, () => {
                if (target.dead) return;
                c.hit(target, 40, "r");
                knockUp(target, 1.5);
                stun(target, 1.5);
            });
            repeat(c, 3, 0.5, () => {
                if (!target.dead) c.hit(target, 20, "r", true);
            }, 0.6);
        },
    }),

    smolder: (c) => ({
        // Super Scorcher Breath
        q: () => c.shoot("smolder_q", "q"),
        // Achooo!: a sneeze that bursts into flame, in a small spread
        w: () => {
            for (const a of [-0.25, 0, 0.25]) c.shoot("smolder_w", "w", v2.rotate(c.aim, a));
        },
        // Flap, Flap, Flap: takes off, faster and with a stronger next attack
        e: () => {
            c.dash(c.at("e"), 60);
            c.buffs.smolder_e = 3;
            sprint(c, 3);
            c.nextAttackBonus = Math.max(c.nextAttackBonus, 0.5);
        },
        // MMOOOMMMM!: a barrage of fire shells over a wide area
        r: () => {
            for (let i = 0; i < 6; i++) {
                c.later(0.15 * i, () => c.shoot("smolder_r", "r", v2.rotate(c.aim, (i - 2.5) * 0.12)));
            }
        },
    }),

    sona: (c) => ({
        // Hymn of Valor: chords seek out the two nearest enemies, and the next attack is a power chord
        q: () => {
            const targets = c.enemies(c.reach("q")).sort((a, b) =>
                v2.distance(a.pos, c.player.pos) - v2.distance(b.pos, c.player.pos)
            ).slice(0, 2);
            if (targets.length) {
                for (const t of targets) c.shoot("sona_q", "q", v2.sub(t.pos, c.player.pos), { homing: t });
            } else {
                c.shoot("sona_q", "q");
            }
            c.buffs.sona_q = 4;
            c.nextAttackBonus = Math.max(c.nextAttackBonus, 0.4);
        },
        // Aria of Perseverance: heals and shields
        w: () => {
            c.heal(35);
            c.addShield(45);
            c.buffs.sona_w = 2;
        },
        // Song of Celerity: speed for a while
        e: () => {
            sprint(c, 3);
            c.buffs.sona_e = 3;
        },
        // Crescendo: a wave that stuns everyone in its path
        r: () => {
            c.shoot("sona_r", "r");
            for (const e of inLine(c, c.player.pos, c.aim, 30, 5)) {
                c.hit(e, 70, "r");
                stun(e, 1.5);
            }
        },
    }),

    soraka: (c) => ({
        // Starcall: stars rain down on everyone around her, and heal her for it
        q: () => {
            for (let i = 0; i < 6; i++) c.shoot("soraka_q", "q", v2.rotate(c.aim, (i * Math.PI) / 3));
            c.buffs.soraka_q = 3;
            for (const e of c.enemies(8)) {
                c.hit(e, 35, "q");
                e.debuffs.applySlow(0.3, 1.5);
                c.heal(15);
            }
        },
        // Astral Infusion: spends nothing here, heals her
        w: () => {
            c.heal(40);
            c.buffs.soraka_w = 1;
        },
        // Equinox: a zone that silences everyone in it, then roots them
        e: () => {
            const pos = c.at("e");
            spot(c, "e", pos);
            c.buffs.soraka_e = 1.5;
            repeat(c, 15, 0.1, () => {
                for (const e of c.enemies(6, pos)) e.debuffs.silence = Math.max(e.debuffs.silence, 0.3);
            }, 0);
            c.later(1.5, () => {
                spot(c, "e", pos);
                for (const e of c.enemies(6, pos)) {
                    c.hit(e, 40, "e");
                    e.debuffs.root = Math.max(e.debuffs.root, 1.5);
                }
            });
        },
        // Wish: a big heal
        r: () => {
            c.heal(80);
            c.addShield(40);
            c.buffs.soraka_r = 2;
        },
    }),

    swain: (c) => ({
        // Death's Hand: three bolts in a cone
        q: () => {
            for (const a of [-0.3, 0, 0.3]) c.shoot("swain_q", "q", v2.rotate(c.aim, a));
        },
        // Vision of Empire: a circle that flares after a moment and slows
        w: () => {
            const pos = c.cursor(40);
            c.buffs.swain_w = 0.8;
            blast(c, "w", pos, 7, 0.8, 40, (e) => e.debuffs.applySlow(0.5, 2));
        },
        // Nevermove: a raven flies out, then the area it landed in pulls everyone in and roots them
        e: () => {
            const pos = c.at("e");
            const d = v2.distance(pos, c.player.pos);
            c.shoot("swain_e", "e", dirTo(c, pos), { distance: d });
            blast(c, "e", pos, 4.5, flight(d, 70), 40, (e) => e.debuffs.applySlow(0.4, 1));
            c.later(flight(d, 70) + 0.6, () => {
                for (const e of c.enemies(6, pos)) {
                    drag(e, pos, 40);
                    e.debuffs.root = Math.max(e.debuffs.root, 1);
                    c.hit(e, 25, "e");
                }
            });
        },
        // Demonic Ascension: drains everyone close to him for a while
        r: () => {
            c.buffs.swain_r = 6;
            c.addShield(40);
            repeat(c, 12, 0.5, () => {
                for (const e of c.enemies(7)) {
                    c.hit(e, 12, "r");
                    c.heal(5);
                }
            });
        },
    }),

    sylas: (c) => ({
        // Chain Lash: the chains lash out, then flare where they landed
        q: () => {
            const pos = c.at("q");
            const d = v2.distance(pos, c.player.pos);
            c.shoot("sylas_q", "q", dirTo(c, pos), { distance: d });
            blast(c, "q", pos, 4, 0.6, 50, (e) => e.debuffs.applySlow(0.35, 1.2));
        },
        // Kingslayer: lunges at the nearest enemy and heals off the hit
        w: () => {
            const target = c.nearest(c.reach("w") + 4);
            if (!target) return false;
            c.dash(target.pos, 80);
            c.later(0.15, () => {
                if (target.dead) return;
                c.hit(target, 55, "w");
                c.heal(18 + (c.player.maxHealth - c.player.health) * 0.2);
            });
        },
        // Abscond / Abduct: dashes, then the chain drags the nearest enemy in
        e: () => {
            c.dash(c.at("e"), 70);
            c.shoot("sylas_e", "e");
            c.later(0.3, () => {
                const target = c.nearest(14);
                if (!target) return;
                drag(target, c.player.pos, 50);
                target.debuffs.root = Math.max(target.debuffs.root, 0.8);
                c.hit(target, 45, "e");
            });
        },
        // Hijack: hooks the nearest enemy and takes a piece of their power for himself
        r: () => {
            const target = c.nearest(c.reach("r"));
            if (!target) return false;
            c.shoot("sylas_r", "r", v2.sub(target.pos, c.player.pos), { homing: target });
            c.later(0.4, () => {
                if (target.dead) return;
                c.hit(target, 75, "r");
                c.addShield(40);
                c.nextAttackBonus = Math.max(c.nextAttackBonus, 0.5);
            });
        },
    }),

    syndra: (c) => {
        // the dark spheres she has out, for Force of Will, Scatter the Weak and Unleashed Power
        const spheres: Array<{ pos: Vec2; until: number }> = [];
        const live = () => {
            const now = c.player.game.now;
            for (let i = spheres.length - 1; i >= 0; i--) if (spheres[i].until <= now) spheres.splice(i, 1);
            return spheres;
        };
        return {
            // Dark Sphere: lobs an orb that blasts where it lands and stays there
            q: () => {
                const pos = c.at("q");
                const d = v2.distance(pos, c.player.pos);
                const t = flight(d, 80);
                c.shoot("syndra_q", "q", dirTo(c, pos), { distance: d });
                blast(c, "q", pos, 3.5, t + 0.1, 55);
                c.later(t + 0.1, () => {
                    spheres.push({ pos, until: c.player.game.now + 6000 });
                });
            },
            // Force of Will: throws a sphere (or, with none out, a bolt) to the target area
            w: () => {
                const sphere = live().pop();
                const from = sphere?.pos ?? v2.copy(c.player.pos);
                const dest = c.cursor(c.reach("w"));
                const d = v2.distance(dest, from);
                c.shoot("syndra_w", "w", v2.sub(dest, from), { from, distance: d });
                blast(c, "w", dest, 4, flight(d, 80) + 0.2, 50, (e) => e.debuffs.applySlow(0.4, 1.5));
            },
            // Scatter the Weak: a wave that knocks enemies back, and flings spheres that stun
            e: () => {
                c.buffs.syndra_e = 0.5;
                c.shoot("syndra_e", "e");
                for (const e of inCone(c, c.aim, c.reach("e"), 0.6)) {
                    c.hit(e, 30, "e");
                    push(c, e, c.player.pos, 7);
                }
                for (const s of live()) {
                    c.shoot("syndra_e", "e", c.aim, { from: s.pos, distance: 22 });
                    for (const e of inLine(c, s.pos, c.aim, 22, 2)) {
                        c.hit(e, 30, "e");
                        stun(e, 1.2);
                    }
                }
            },
            // Unleashed Power: every sphere she has, and three more, home in on one enemy
            r: () => {
                const target = c.nearest(c.reach("r"));
                if (!target) return false;
                const out = live().splice(0);
                const n = 3 + out.length;
                for (let i = 0; i < n; i++) {
                    c.later(0.1 * (i + 1), () => {
                        if (target.dead) return;
                        const from = out[i]?.pos ?? c.player.pos;
                        c.shoot("syndra_r", "r", v2.sub(target.pos, from), { from, homing: target });
                    });
                }
            },
        };
    },

    tahmkench: (c) => ({
        // Tongue Lash: a lash of the tongue that slows the first thing it hits
        q: () => {
            c.shoot("tahmkench_q", "q");
            const target = inLine(c, c.player.pos, c.aim, c.reach("q"), 1.8)[0];
            if (!target) return;
            c.hit(target, 50, "q");
            target.debuffs.applySlow(0.4, 2);
        },
        // Abyssal Dive: sinks, then rises at the target and shakes everything around
        w: () => {
            const dest = c.cursor(c.reach("w"));
            c.buffs.tahm_w = 0.8;
            spot(c, "w", dest);
            c.later(0.8, () => {
                c.dash(dest, 200);
                c.later(flight(v2.distance(dest, c.player.pos), 200) + 0.1, () => {
                    for (const e of c.enemies(7)) {
                        c.hit(e, 55, "w");
                        knockUp(e, 0.4);
                        e.debuffs.applySlow(0.5, 2);
                    }
                });
            });
        },
        // Thick Skin: a shield and a bit of health back
        e: () => {
            c.addShield(70, 160);
            c.heal(15);
            c.buffs.tahm_e = 3;
        },
        // Devour: swallows the nearest enemy and holds them (only once every few seconds)
        r: () => {
            if (c.buff("tahm_r")) return false;
            const target = c.nearest(8);
            if (!target) return false;
            c.buffs.tahm_r = 6;
            c.hit(target, 60, "r");
            drag(target, c.player.pos, 60);
            stun(target, 1.2);
            c.heal(20);
        },
    }),

    taliyah: (c) => ({
        // Threaded Volley: five bolts in a tight fan
        q: () => {
            for (let i = -2; i <= 2; i++) c.shoot("taliyah_q", "q", v2.rotate(c.aim, i * 0.07));
        },
        // Seismic Shove: the ground heaves and throws everything on it away from her
        w: () => {
            const pos = c.at("w");
            c.buffs.taliyah_w = 0.6;
            c.later(0.6, () => {
                spot(c, "w", pos);
                for (const e of c.enemies(4.5, pos)) {
                    c.hit(e, 35, "w");
                    push(c, e, c.player.pos, 9);
                }
            });
        },
        // Unraveled Earth: a field of mines that root whoever steps on them
        e: () => {
            for (const e of inCone(c, c.aim, 20, 0.5)) c.hit(e, 25, "e");
            for (const [dist, a] of [[8, 0], [12, -0.25], [12, 0.25], [17, -0.4], [17, 0.4]] as const) {
                c.traps.push({
                    pos: along(c.player.pos, v2.rotate(c.aim, a), dist),
                    arm: 0.4,
                    life: 4,
                    kind: "snap",
                });
            }
        },
        // Weaver's Wall: a wall of rock that blocks shots and throws up what it rises under, and she rides it
        r: () => {
            const dest = c.cursor(40);
            const wall = along(c.player.pos, c.aim, 8);
            c.zones.push({ pos: wall, time: 4, kind: "windwall", dir: c.aim });
            for (const e of c.enemies(5, wall)) {
                c.hit(e, 40, "r");
                knockUp(e, 0.8);
            }
            c.dash(dest, 60);
            sprint(c, 2);
        },
    }),

    talon: (c) => ({
        // Noxian Diplomacy: jumps onto the nearest enemy and makes them bleed
        q: () => {
            const target = c.nearest(c.reach("q"));
            if (!target) return false;
            c.dash(target.pos, 90);
            c.later(0.15, () => {
                if (target.dead) return;
                c.hit(target, 55, "q");
                target.applyBleed(3, c.player);
            });
            c.nextAttackBonus = Math.max(c.nextAttackBonus, 0.8);
        },
        // Rake: blades spin out in a fan and come back, slowing what they cross
        w: () => {
            for (const a of [-0.2, 0, 0.2]) c.shoot("talon_w", "w", v2.rotate(c.aim, a));
            for (const e of inCone(c, c.aim, c.reach("w"), 0.4)) e.debuffs.applySlow(0.4, 1.5);
        },
        // Assassin's Path: a quick vault over whatever is in the way
        e: () => {
            if (c.buff("talon_e")) return false;
            c.buffs.talon_e = 4;
            c.dash(c.at("e"), 90);
        },
        // Shadow Assault: blades burst out around him, then fly back to him
        r: () => {
            c.buffs.talon_r = 2.5;
            sprint(c, 2.5);
            const ring = () => {
                spot(c, "r", c.player.pos);
                for (const e of c.enemies(7)) {
                    c.hit(e, 45, "r");
                    e.debuffs.applySlow(0.4, 1.5);
                }
            };
            ring();
            c.later(1.2, ring);
        },
    }),

    taric: (c) => ({
        // Starlight's Touch: heals him
        q: () => {
            c.heal(40);
            c.buffs.taric_q = 1;
        },
        // Bastion: a shield
        w: () => {
            c.addShield(70);
            c.buffs.taric_w = 2.5;
        },
        // Dazzle: a beam that stuns whoever it finds after a beat
        e: () => {
            const dir = c.aim;
            const from = v2.copy(c.player.pos);
            c.shoot("taric_e", "e");
            c.later(0.6, () => {
                for (const e of inLine(c, from, dir, c.reach("e"), 2.5)) {
                    c.hit(e, 50, "e");
                    stun(e, 1.5);
                }
            });
        },
        // Cosmic Radiance: after a short gathering, he cannot be touched and everything close is hurt
        r: () => {
            c.buffs.taric_r = 1.5;
            c.later(1.5, () => {
                c.player.dodgeTime = 2.5;
                spot(c, "r", c.player.pos);
                for (const e of c.enemies(13)) c.hit(e, 40, "r");
            });
        },
    }),

    teemo: (c) => ({
        // Blinding Dart: damages and blinds (here: silences) the nearest enemy
        q: () => {
            const target = c.nearest(c.reach("q"));
            if (!target) {
                c.shoot("teemo_q", "q");
                return;
            }
            c.shoot("teemo_q", "q", v2.sub(target.pos, c.player.pos), { homing: target });
            c.later(flight(v2.distance(target.pos, c.player.pos), 120) + 0.05, () => {
                target.debuffs.silence = Math.max(target.debuffs.silence, 1.5);
            });
        },
        // Move Quick: speed while he is not hurt
        w: () => {
            sprint(c, 3);
            c.buffs.teemo_w = 3;
        },
        // Toxic Shot: the next attack poisons and slows
        e: () => {
            c.buffs.teemo_e = 5;
            c.nextAttackBonus = Math.max(c.nextAttackBonus, 0.5);
            c.nextAttackSlow = true;
        },
        // Noxious Trap: a mushroom that roots and hurts whoever steps on it, three out at once
        r: () => {
            const pos = c.at("r");
            const d = v2.distance(pos, c.player.pos);
            c.shoot("teemo_r", "r", dirTo(c, pos), { distance: d });
            c.traps.push({ pos, arm: flight(d, 60) + 1, life: 40, kind: "snap" });
            const snaps = c.traps.filter((t) => t.kind === "snap");
            if (snaps.length > 3) c.traps.splice(c.traps.indexOf(snaps[0]), 1);
        },
    }),

    thresh: (c) => ({
        // Death Sentence: a hook that drags the first enemy it catches back to him
        q: () => {
            const dir = c.aim;
            const target = inLine(c, c.player.pos, dir, c.reach("q"), 1.8)[0];
            c.shoot("thresh_q", "q", dir, { distance: target ? v2.distance(target.pos, c.player.pos) + 1 : undefined });
            if (!target) return;
            c.later(flight(v2.distance(target.pos, c.player.pos), 90), () => {
                if (target.dead) return;
                c.hit(target, 40, "q");
                drag(target, c.player.pos, 70);
                target.debuffs.root = Math.max(target.debuffs.root, 0.8);
            });
        },
        // Dark Passage: a lantern and a shield, and he pulls himself toward it
        w: () => {
            c.addShield(70);
            c.buffs.thresh_w = 6;
            c.dash(c.cursor(8), 50);
        },
        // Flay: sweeps enemies in front of him back and slows them
        e: () => {
            c.buffs.thresh_e = 0.5;
            spot(c, "e", along(c.player.pos, c.aim, 4));
            for (const e of inCone(c, c.aim, c.reach("e"), 0.85)) {
                c.hit(e, 35, "e");
                push(c, e, c.player.pos, 8);
                e.debuffs.applySlow(0.5, 1.5);
            }
        },
        // The Box: a ring of walls around him that hurts and slows whoever crosses it
        r: () => {
            const center = v2.copy(c.player.pos);
            c.buffs.thresh_r = 4;
            const struck = new Set<Player>();
            for (const e of c.enemies(9, center)) e.debuffs.applySlow(0.6, 1);
            repeat(c, 8, 0.5, () => {
                for (const e of c.enemies(11, center)) {
                    e.debuffs.applySlow(0.6, 0.7);
                    const edge = Math.abs(v2.distance(e.pos, center) - 9);
                    if (edge < 1.5 && !struck.has(e)) {
                        struck.add(e);
                        c.hit(e, 40, "r");
                    }
                }
            }, 0);
        },
    }),

    tristana: (c) => ({
        // Rapid Fire: attack speed (and some speed) for a while
        q: () => {
            c.buffs.excited = 5;
            c.buffs.tristana_q = 5;
        },
        // Rocket Jump: leaps, and lands with a blast that slows
        w: () => {
            const dest = c.at("w");
            c.dash(dest, 90);
            blast(c, "w", dest, 5, flight(v2.distance(dest, c.player.pos), 90) + 0.1, 55, (e) => {
                e.debuffs.applySlow(0.6, 2);
            });
        },
        // Explosive Charge: plants a bomb on the nearest enemy that goes off a moment later
        e: () => {
            const target = c.nearest(c.reach("e") + 6);
            if (!target) return false;
            c.shoot("tristana_e", "e", v2.sub(target.pos, c.player.pos), { homing: target });
            c.buffs.tristana_e = 1.5;
            c.later(0.2, () => {
                if (!target.dead) c.hit(target, 25, "e");
            });
            c.later(1.5, () => {
                if (target.dead) return;
                const at = v2.copy(target.pos);
                spot(c, "e", at);
                for (const e of c.enemies(4, at)) c.hit(e, e === target ? 50 : 30, "e");
            });
        },
        // Buster Shot: a huge shell that hurts and throws the target far away
        r: () => {
            const target = c.nearest(c.reach("r"));
            if (!target) return false;
            c.shoot("tristana_r", "r", v2.sub(target.pos, c.player.pos), { homing: target });
            c.later(0.15, () => {
                if (target.dead) return;
                c.hit(target, 80, "r");
                push(c, target, c.player.pos, 14, 60);
                target.debuffs.root = Math.max(target.debuffs.root, 0.6);
            });
        },
    }),

    trundle: (c) => ({
        // Chomp: the next attack bites twice as hard and slows
        q: () => {
            c.nextAttackBonus = Math.max(c.nextAttackBonus, 1);
            c.nextAttackSlow = true;
            c.buffs.trundle_q = 4;
        },
        // Frozen Domain: a frosty ground that slows enemies and speeds him
        w: () => {
            const pos = v2.copy(c.player.pos);
            c.buffs.trundle_w = 4;
            sprint(c, 4);
            spot(c, "w", pos);
            repeat(c, 16, 0.25, () => {
                for (const e of c.enemies(6, pos)) e.debuffs.applySlow(0.3, 0.4);
            }, 0);
        },
        // Pillar of Ice: a pillar thrown up that hurls enemies away from it
        e: () => {
            const pos = c.at("e");
            c.buffs.trundle_e = 0.4;
            c.later(0.4, () => {
                spot(c, "e", pos);
                for (const e of c.enemies(4, pos)) {
                    c.hit(e, 45, "e");
                    push(c, e, pos, 6);
                    e.debuffs.applySlow(0.5, 2);
                }
            });
        },
        // Subjugate: drains the nearest enemy, healing himself
        r: () => {
            const target = c.nearest(c.reach("r"));
            if (!target) return false;
            c.dash(target.pos, 60);
            repeat(c, 6, 0.4, () => {
                if (target.dead) return;
                c.hit(target, 12, "r");
                target.debuffs.applySlow(0.4, 0.6);
                c.heal(12);
            }, 0.2);
        },
    }),

    tryndamere: (c) => ({
        // Bloodlust: heals and strengthens his attacks
        q: () => {
            c.heal(25);
            c.buffs.tryndamere_q = 4;
            c.nextAttackBonus = Math.max(c.nextAttackBonus, 0.4);
        },
        // Mocking Shout: slows everyone in front of him
        w: () => {
            c.buffs.tryndamere_w = 3;
            c.addShield(20);
            for (const e of inCone(c, c.aim, c.reach("w"), 0.9)) e.debuffs.applySlow(0.5, 3);
        },
        // Spinning Slash: slashes through everyone along his dash
        e: () => {
            const to = c.at("e");
            const t = flight(v2.distance(to, c.player.pos), 90);
            c.dash(to, 90);
            const struck = new Set<Player>();
            repeat(c, 4, t / 4, () => {
                for (const e of c.enemies(3.5)) {
                    if (struck.has(e)) continue;
                    struck.add(e);
                    c.hit(e, 55, "e");
                }
            }, t / 4);
        },
        // Undying Rage: he cannot be killed while it lasts
        r: () => {
            c.buffs.tryndamere_r = 5;
            c.addShield(120, 200);
            c.heal(40);
            repeat(c, 50, 0.1, () => {
                const p = c.player;
                if (c.buff("tryndamere_r") && !p.dead && p.health < 15) c.heal(15 - p.health);
            }, 0.1);
        },
    }),

    twistedfate: (c) => {
        // Pick a Card cycles gold, red, blue
        let card = 0;
        return {
            // Wild Cards: three cards in a fan
            q: () => {
                for (const a of [-0.25, 0, 0.25]) c.shoot("twistedfate_q", "q", v2.rotate(c.aim, a));
            },
            // Pick a Card: the next attack stuns (gold), slows (red) or hits hard and heals (blue)
            w: () => {
                c.buffs.tf_w = 5;
                const pick = card;
                card = (card + 1) % 3;
                if (pick === 0) {
                    c.nextAttackBonus = Math.max(c.nextAttackBonus, 0.7);
                    c.nextAttackSilence = true;
                } else if (pick === 1) {
                    c.nextAttackBonus = Math.max(c.nextAttackBonus, 0.5);
                    c.nextAttackSlow = true;
                } else {
                    c.nextAttackBonus = Math.max(c.nextAttackBonus, 1);
                    c.heal(15);
                }
            },
            // Stacked Deck: his next attacks hit harder
            e: () => {
                if (c.buff("tf_e")) return false;
                c.buffs.tf_e = 5;
                c.nextAttackBonus = Math.max(c.nextAttackBonus, 0.8);
            },
            // Destiny: gathers for a moment, then gates to the target area and lands a blow
            r: () => {
                const dest = c.cursor(60);
                c.buffs.tf_r = 1.5;
                c.later(1.5, () => {
                    c.dash(dest, 250);
                    blast(c, "r", dest, 6, flight(v2.distance(dest, c.player.pos), 250) + 0.1, 55, (e) => {
                        e.debuffs.applySlow(0.4, 1.5);
                    });
                });
            },
        };
    },

    twitch: (c) => ({
        // Ambush: speeds off, and attacks faster a moment later
        q: () => {
            sprint(c, 3);
            c.buffs.twitch_q = 3;
            c.later(3, () => {
                c.buffs.excited = 4;
            });
        },
        // Venom Cask: a cask that poisons and slows everyone it splashes
        w: () => {
            const pos = c.at("w");
            const d = v2.distance(pos, c.player.pos);
            c.shoot("twitch_w", "w", dirTo(c, pos), { distance: d });
            blast(c, "w", pos, 5, flight(d, 55), 30, (e) => {
                e.debuffs.applySlow(0.5, 3);
                e.applyPoison(3, c.player);
            });
        },
        // Contaminate: every poisoned enemy takes a heavy blow, the rest a light one
        e: () => {
            c.buffs.twitch_e = 0.5;
            for (const e of c.enemies(c.reach("e"))) c.hit(e, e.poisonDuration > 0 ? 70 : 20, "e");
        },
        // Spray and Pray: attacks faster and pierces everything in a line
        r: () => {
            c.buffs.highlander = 6;
            c.buffs.twitch_r = 6;
            for (const a of [-0.06, 0, 0.06]) c.shoot("twitch_r", "r", v2.rotate(c.aim, a));
        },
    }),

    udyr: (c) => ({
        // Wilding Claw (Tiger): a swipe that makes them bleed
        q: () => {
            c.buffs.udyr_q = 5;
            c.nextAttackBonus = Math.max(c.nextAttackBonus, 0.8);
            for (const e of inCone(c, c.aim, 8, 0.8)) {
                c.hit(e, 40, "q");
                e.applyBleed(3, c.player);
            }
        },
        // Iron Mantle (Turtle): a shield
        w: () => {
            c.addShield(90, 180);
            c.heal(15);
            c.buffs.udyr_w = 3;
        },
        // Blazing Stampede (Bear): charges ahead, stunning what he reaches
        e: () => {
            const to = c.at("e");
            c.dash(to, 60);
            sprint(c, 4);
            c.buffs.udyr_e = 4;
            c.later(flight(v2.distance(to, c.player.pos), 60) + 0.1, () => {
                for (const e of c.enemies(4)) {
                    c.hit(e, 35, "e");
                    stun(e, 1);
                }
            });
        },
        // Wingborne Storm (Phoenix): a storm of fire around him
        r: () => {
            c.buffs.udyr_r = 3;
            c.nextAttackBonus = Math.max(c.nextAttackBonus, 0.5);
            repeat(c, 6, 0.5, () => {
                for (const e of c.enemies(6)) {
                    c.hit(e, 14, "r");
                    e.applyBurn(1.5, c.player, c.sourceOf("r"));
                }
            });
        },
    }),

    urgot: (c) => ({
        // Corrosive Charge: a shell lobbed to the target area that bursts and slows
        q: () => {
            const pos = c.at("q");
            const d = v2.distance(pos, c.player.pos);
            c.shoot("urgot_q", "q", dirTo(c, pos), { distance: d });
            blast(c, "q", pos, 3.5, flight(d, 60) + 0.05, 45, (e) => e.debuffs.applySlow(0.4, 1.5));
        },
        // Purge: fires at the nearest enemy automatically for a few seconds
        w: () => {
            c.buffs.urgot_w = 4;
            repeat(c, 8, 0.5, () => {
                const target = c.nearest(16);
                if (!target) return;
                c.shoot("urgot_w", "w", v2.sub(target.pos, c.player.pos), { homing: target });
                target.debuffs.applySlow(0.25, 0.6);
            }, 0);
        },
        // Disdain: dashes, then flings whoever he lands beside
        e: () => {
            const to = c.at("e");
            c.dash(to, 70);
            c.buffs.urgot_e = 1;
            c.later(flight(v2.distance(to, c.player.pos), 70) + 0.1, () => {
                for (const e of c.enemies(4)) {
                    c.hit(e, 40, "e");
                    stun(e, 1);
                }
            });
        },
        // Fear Beyond Death: a harpoon that executes whoever it hits at low health
        r: () => {
            const target = c.nearest(c.reach("r"));
            if (!target) {
                c.shoot("urgot_r", "r");
                return;
            }
            const d = v2.distance(target.pos, c.player.pos);
            c.shoot("urgot_r", "r", v2.sub(target.pos, c.player.pos), { homing: target });
            c.later(flight(d, 150) + 0.15, () => {
                if (target.dead) return;
                c.hit(target, 70, "r");
                if (target.health < target.maxHealth * 0.25) c.hit(target, target.health + 5, "r", true);
            });
        },
    }),

    varus: (c) => ({
        // Piercing Arrow: drawn back for a moment, then loosed through everything
        q: () => {
            c.buffs.varus_q = 0.5;
            c.later(0.5, () => c.shoot("varus_q", "q"));
        },
        // Blighted Quiver: his arrows carry blight for a while
        w: () => {
            c.buffs.varus_w = 8;
            c.nextAttackBonus = Math.max(c.nextAttackBonus, 0.8);
        },
        // Hail of Arrows: a rain of arrows on the target area that slows and leaves blight
        e: () => {
            const pos = c.at("e");
            spot(c, "e", pos);
            blast(c, "e", pos, 6, 0.4, 45, (e) => e.debuffs.applySlow(0.5, 3));
            repeat(c, 8, 0.5, () => {
                for (const e of c.enemies(6, pos)) {
                    c.hit(e, 6, "e");
                    e.debuffs.applySlow(0.3, 0.6);
                }
            }, 0.9);
        },
        // Chain of Corruption: a tendril that roots the first enemy and spreads to those near
        r: () => {
            const dir = c.aim;
            const target = inLine(c, c.player.pos, dir, c.reach("r"), 2)[0];
            c.shoot("varus_r", "r", dir, { distance: target ? v2.distance(target.pos, c.player.pos) + 1 : undefined });
            if (!target) return;
            c.later(flight(v2.distance(target.pos, c.player.pos), 70), () => {
                if (target.dead) return;
                c.hit(target, 50, "r");
                target.debuffs.root = Math.max(target.debuffs.root, 2);
                c.later(1, () => {
                    for (const e of c.enemies(8, target.pos)) {
                        if (e === target) continue;
                        c.hit(e, 30, "r");
                        e.debuffs.root = Math.max(e.debuffs.root, 1.2);
                    }
                });
            });
        },
    }),

    vayne: (c) => ({
        // Tumble: rolls away and the next attack hits harder
        q: () => {
            c.dash(c.at("q"), 70);
            c.buffs.vayne_q = 3;
            c.nextAttackBonus = Math.max(c.nextAttackBonus, 0.6);
        },
        // Silver Bolts: a bolt that deals a share of the target's health as true damage
        w: () => {
            if (c.buff("vayne_w")) return false;
            c.buffs.vayne_w = 2;
            const target = c.nearest(c.reach("w"));
            if (!target) {
                c.shoot("vayne_w", "w");
                return;
            }
            c.shoot("vayne_w", "w", v2.sub(target.pos, c.player.pos), { homing: target });
            c.later(0.2, () => {
                if (!target.dead) c.hit(target, 6 + target.maxHealth * 0.09, "w", true);
            });
        },
        // Condemn: a heavy bolt that throws the nearest enemy back
        e: () => {
            const target = c.nearest(c.reach("e"));
            if (!target) return false;
            c.shoot("vayne_e", "e", v2.sub(target.pos, c.player.pos), { homing: target });
            c.later(0.2, () => {
                if (target.dead) return;
                c.hit(target, 45, "e");
                push(c, target, c.player.pos, 10, 80);
                target.debuffs.root = Math.max(target.debuffs.root, 0.8);
            });
        },
        // Final Hour: hits harder and moves faster for a while
        r: () => {
            c.buffs.vayne_r = 8;
            sprint(c, 8);
            c.nextAttackBonus = Math.max(c.nextAttackBonus, 0.8);
        },
    }),

    veigar: (c) => ({
        // Baleful Strike: a bolt through two enemies
        q: () => c.shoot("veigar_q", "q"),
        // Dark Matter: a meteor called down on the target area after a moment (every few seconds only)
        w: () => {
            if (c.buff("veigar_w")) return false;
            c.buffs.veigar_w = 6;
            blast(c, "w", c.at("w"), 4.5, 1.2, 70);
        },
        // Event Horizon: a cage that stuns whoever crosses its edge
        e: () => {
            const pos = c.at("e");
            c.buffs.veigar_e = 3.5;
            const struck = new Set<Player>();
            repeat(c, 30, 0.1, () => {
                for (const e of c.enemies(7, pos)) {
                    const edge = Math.abs(v2.distance(e.pos, pos) - 5);
                    if (edge < 1.2 && !struck.has(e)) {
                        struck.add(e);
                        stun(e, 1.5);
                    }
                }
            }, 0.5);
            c.later(0.5, () => spot(c, "e", pos));
        },
        // Primordial Burst: hits harder the less health the target has
        r: () => {
            const target = c.nearest(c.reach("r"));
            if (!target) return false;
            c.shoot("veigar_r", "r", v2.sub(target.pos, c.player.pos), { homing: target });
            c.later(0.3, () => {
                if (target.dead) return;
                c.hit(target, 70 + (target.maxHealth - target.health) * 0.5, "r", true);
            });
        },
    }),
};
