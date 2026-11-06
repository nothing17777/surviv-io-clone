import type { AbilityKey } from "../../../../shared/defs/gameObjects/championDefs.ts";
import { v2, type Vec2 } from "../../../../shared/utils/v2.ts";
import type { Champion } from "../champion.ts";
import type { Player } from "../objects/player.ts";
import type { ChampionKitMap } from "./types.ts";

const ahead = (c: Champion, d: number) => v2.add(c.player.pos, v2.mul(c.aim, d));

/** where `p` ends up when pushed `d` units straight away from `from` */
const awayFrom = (from: Vec2, p: Vec2, d: number) =>
    v2.add(p, v2.mul(v2.normalizeSafe(v2.sub(p, from), v2.create(1, 0)), d));

const shove = (e: Player, from: Vec2, d: number, speed = 40) => {
    e.webPull = { target: awayFrom(from, e.pos, d), speed, time: d / speed + 0.1 };
};

const drag = (e: Player, to: Vec2, speed = 40) => {
    e.webPull = { target: to, speed, time: v2.distance(e.pos, to) / speed + 0.1 };
};

/** a ground marker at `pos` (a bullet that does nothing but show where an ability lands) */
const mark = (c: Champion, id: string, key: AbilityKey, pos: Vec2) => c.shoot(id, key, c.aim, { from: pos });

/** lob a shot at `pos` and run `land` when it gets there */
const lob = (c: Champion, id: string, key: AbilityKey, pos: Vec2, speed: number, land: () => void) => {
    const to = v2.sub(pos, c.player.pos);
    const dist = Math.max(v2.length(to), 1);
    c.shoot(id, key, to, { distance: dist });
    c.later(dist / speed, land);
};

/** the enemy nearest to the champion inside the line in front of them */
const firstInLine = (c: Champion, length: number, width: number): Player | undefined =>
    c.lineHit(length, width).sort(
        (a, b) => v2.distance(a.pos, c.player.pos) - v2.distance(b.pos, c.player.pos),
    )[0];

/** enemies inside a cone in front of the champion */
const cone = (c: Champion, range: number, half: number): Player[] =>
    c.enemies(range).filter((e) =>
        v2.dot(v2.normalizeSafe(v2.sub(e.pos, c.player.pos), c.aim), c.aim) >= Math.cos(half)
    );

/** hit everyone near `pos` */
const blast = (c: Champion, pos: Vec2, radius: number, amount: number, key: AbilityKey, fn?: (e: Player) => void) => {
    for (const e of c.enemies(radius, pos)) {
        c.hit(e, amount, key);
        fn?.(e);
    }
};

/** hand-written kits, batch 6 (see types.ts: do not read anything off `c` outside a callback) */
export const kits: ChampionKitMap = {
    velkoz: (c) => ({
        // Plasma Fission: a bolt that splits in two at the end of its flight
        q: () => {
            const dir = c.aim;
            const end = ahead(c, 20);
            c.shoot("velkoz_q", "q");
            c.later(20 / 80, () => {
                for (const s of [-1, 1]) c.shoot("velkoz_q2", "q", v2.mul(v2.perp(dir), s), { from: end });
            });
        },
        // Void Rift: a line of rifts that tears open, then again a moment later
        w: () => {
            c.shoot("velkoz_w", "w");
            c.later(0.9, () => c.shoot("velkoz_w", "w", c.aim, { mult: 1.5 }));
        },
        // Tectonic Disruption: the ground heaves and throws up whoever is on it
        e: () => {
            const pos = c.at("e");
            lob(c, "velkoz_e", "e", pos, 60, () =>
                c.later(0.5, () =>
                    blast(c, pos, 5, 65, "e", (e) => {
                        e.debuffs.airborne = Math.max(e.debuffs.airborne, 0.75);
                    })));
        },
        // Life Form Disintegration Ray: a channelled beam that follows the cursor
        r: () => {
            c.player.debuffs.root = Math.max(c.player.debuffs.root, 2.5);
            for (let i = 0; i < 10; i++) c.later(0.2 + i * 0.25, () => c.shoot("velkoz_r", "r"));
        },
    }),

    vex: (c) => ({
        // Mistral Bolt: a piercing missile
        q: () => c.shoot("vex_q", "q"),
        // Personal Space: a shield and a burst that shoves enemies off her
        w: () => {
            c.addShield(60);
            blast(c, c.player.pos, 12, 40, "w", (e) => {
                shove(e, c.player.pos, 4);
                e.debuffs.applySlow(0.3, 1);
            });
        },
        // Looming Darkness: a patch of dark that slows and then bursts
        e: () => {
            const pos = c.at("e");
            lob(c, "vex_e", "e", pos, 70, () => blast(c, pos, 5, 55, "e", (e) => e.debuffs.applySlow(0.4, 2)));
        },
        // Shadow Surge: a long missile, then she dashes to what it marked and finishes it
        r: () => {
            const target = c.nearest(100);
            if (!target) return false;
            c.shoot("vex_r", "r", v2.sub(target.pos, c.player.pos), { homing: target });
            c.later(1, () => {
                if (target.dead) return;
                c.dash(awayFrom(c.player.pos, target.pos, -2), 120);
                c.hit(target, target.health < target.maxHealth * 0.35 ? 110 : 60, "r", true);
            });
        },
    }),

    vi: (c) => ({
        // Vault Breaker: a charged punch that carries her forward and knocks the target up
        q: () => {
            const to = c.cursor(22);
            c.dash(to, 55);
            c.later(v2.distance(to, c.player.pos) / 55 + 0.1, () => {
                const hit = c.nearest(5);
                if (!hit) return;
                c.hit(hit, 70, "q");
                hit.debuffs.airborne = Math.max(hit.debuffs.airborne, 0.6);
            });
        },
        // Denting Blows: her next punches hit harder, and she shields herself
        w: () => {
            c.buffs.vi_w = 4;
            c.addShield(30);
            c.nextAttackBonus = Math.max(c.nextAttackBonus, 0.6);
        },
        // Excessive Force: the next punch is heavy and rips through everyone in front of her
        e: () => {
            c.buffs.vi_e = 3;
            c.nextAttackBonus = Math.max(c.nextAttackBonus, 1);
            for (const e of cone(c, 13, Math.PI / 4)) {
                c.hit(e, 35, "e");
                e.debuffs.applySlow(0.25, 1.5);
            }
        },
        // Assault and Battery: she runs the target down and knocks it into the air
        r: () => {
            const target = c.nearest(27, c.at("r")) ?? c.nearest(27);
            if (!target) return false;
            c.dash(target.pos, 90);
            c.later(0.25, () => {
                if (target.dead) return;
                c.hit(target, 100, "r");
                target.debuffs.airborne = Math.max(target.debuffs.airborne, 1.2);
            });
        },
    }),

    viego: (c) => ({
        // Blade That Has Done Harm: a long thrust that heals him for what it hits
        q: () => {
            const hits = c.lineHit(20, 1.4);
            for (const e of hits) c.hit(e, 55, "q");
            if (hits.length) c.heal(10 * hits.length);
        },
        // Spectral Maw: he charges ahead and stuns whoever the hound catches
        w: () => {
            const to = c.cursor(14);
            c.dash(to, 70);
            c.shoot("viego_w", "w");
            c.later(0.4, () => {
                const hit = c.nearest(5, to);
                if (hit) hit.debuffs.root = Math.max(hit.debuffs.root, 1);
            });
        },
        // Harrowed Path: mist hides him and sharpens his next blows
        e: () => {
            c.buffs.viego_e = 6;
            c.buffs.excited = 3;
            c.nextAttackBonus = Math.max(c.nextAttackBonus, 0.4);
        },
        // Heartbreaker: he blinks onto the weakest nearby and blasts everyone around it away
        r: () => {
            const target = c.nearest(18);
            if (!target) return false;
            c.dash(target.pos, 120);
            c.later(0.2, () => {
                if (target.dead) return;
                c.hit(target, 60 + (target.maxHealth - target.health) * 0.25, "r", true);
                for (const e of c.enemies(7, target.pos)) if (e !== target) shove(e, target.pos, 6);
            });
        },
    }),

    viktor: (c) => ({
        // Siphon Power: a bolt that shields him and charges his next attack
        q: () => {
            const target = c.nearest(20);
            c.shoot("viktor_q", "q", target ? v2.sub(target.pos, c.player.pos) : c.aim, { homing: target });
            c.addShield(50);
            c.buffs.viktor_q = 5;
            c.nextAttackBonus = Math.max(c.nextAttackBonus, 0.6);
        },
        // Gravity Field: a field that slows, then stuns whoever is still inside
        w: () => {
            const pos = c.at("w");
            lob(c, "viktor_w", "w", pos, 60, () => {
                c.zones.push({ pos, time: 3, kind: "singularity", dir: c.aim });
                c.later(1.5, () => {
                    for (const e of c.enemies(5, pos)) e.debuffs.root = Math.max(e.debuffs.root, 1.2);
                });
            });
        },
        // Death Ray: a beam, and a second pass a moment later where he is aiming then
        e: () => {
            c.shoot("viktor_e", "e");
            c.later(0.35, () => c.shoot("viktor_e", "e", v2.rotate(c.aim, 0.15), { mult: 0.8 }));
        },
        // Chaos Storm: a storm that drifts toward the nearest enemy, burning as it goes
        r: () => {
            let pos = c.cursor(23);
            for (let i = 0; i < 8; i++) {
                c.later(0.4 + i * 0.5, () => {
                    const near = c.nearest(30, pos);
                    if (near) pos = v2.add(pos, v2.mul(v2.normalizeSafe(v2.sub(near.pos, pos)), 2.5));
                    mark(c, "viktor_r", "r", pos);
                    blast(c, pos, 5, 16, "r");
                });
            }
        },
    }),

    vladimir: (c) => ({
        // Transfusion: a bite of blood that heals him
        q: () => {
            const target = c.nearest(20);
            if (!target) return false;
            c.hit(target, 55, "q");
            c.heal(25);
        },
        // Sanguine Pool: he sinks into the ground, untouchable, bleeding all around him
        w: () => {
            c.buffs.vladimir_w = 2;
            c.player.dodgeTime = 2;
            for (let i = 1; i <= 4; i++) {
                c.later(i * 0.5, () => {
                    for (const e of c.enemies(7)) {
                        c.hit(e, 20, "w");
                        e.debuffs.applySlow(0.4, 0.6);
                        c.heal(6);
                    }
                });
            }
        },
        // Tides of Blood: after a short charge, blood bolts burst out all around him
        e: () => {
            c.buffs.vladimir_e = 0.6;
            c.later(0.6, () => {
                for (let i = 0; i < 6; i++) c.shoot("vladimir_e", "e", v2.rotate(c.aim, (i * Math.PI) / 3));
            });
        },
        // Hemoplague: everyone caught takes damage now and more when the plague ends
        r: () => {
            const pos = c.at("r");
            lob(c, "vladimir_r", "r", pos, 80, () => {
                const caught = c.enemies(6, pos);
                for (const e of caught) {
                    c.hit(e, 50, "r");
                    c.heal(10);
                }
                c.later(4, () => {
                    for (const e of caught) if (!e.dead) c.hit(e, 40, "r");
                });
            });
        },
    }),

    volibear: (c) => ({
        // Thundering Smash: a charge that ends in a stunning blow
        q: () => {
            const to = c.cursor(10);
            c.dash(to, 50);
            c.buffs.volibear_q = 3;
            c.later(0.3, () => {
                const hit = c.nearest(5, to);
                if (!hit) return;
                c.hit(hit, 45, "q");
                hit.debuffs.root = Math.max(hit.debuffs.root, 1);
            });
        },
        // Frenzied Maul: a bite that tears the target open and heals him
        w: () => {
            const target = c.nearest(11);
            if (!target) return false;
            c.hit(target, 60, "w");
            c.heal(20);
            c.buffs.volibear_w = 4;
            c.nextAttackBonus = Math.max(c.nextAttackBonus, 0.5);
        },
        // Sky Splitter: lightning crashes down where he points
        e: () => {
            const pos = c.at("e");
            mark(c, "volibear_e", "e", pos);
            c.later(1, () => {
                blast(c, pos, 6, 75, "e", (e) => e.debuffs.applySlow(0.5, 1.5));
                if (v2.distance(c.player.pos, pos) <= 6) c.addShield(50);
            });
        },
        // Stormbringer: he leaps in and lands with a shockwave
        r: () => {
            const pos = c.at("r");
            c.dash(pos, 60);
            c.player.dodgeTime = 0.5;
            mark(c, "volibear_r", "r", pos);
            c.later(v2.distance(pos, c.player.pos) / 60 + 0.2, () => {
                blast(c, pos, 7, 90, "r", (e) => e.debuffs.applySlow(0.5, 1.5));
                c.addShield(60);
            });
        },
    }),

    warwick: (c) => ({
        // Jaws of the Beast: he lunges at the nearest enemy and heals off the bite
        q: () => {
            const target = c.nearest(12);
            if (!target) return false;
            c.dash(target.pos, 80);
            c.later(0.15, () => {
                if (target.dead) return;
                c.hit(target, 60, "q");
                c.heal(25);
            });
        },
        // Blood Hunt: a frenzy of speed
        w: () => {
            c.buffs.warwick_w = 6;
            c.buffs.excited = 5;
        },
        // Primal Howl: a shield, then a howl that sends everyone nearby running
        e: () => {
            c.addShield(50);
            c.buffs.warwick_e = 2;
            c.later(1, () => {
                for (const e of c.enemies(13)) shove(e, c.player.pos, 7, 20);
            });
        },
        // Infinite Duress: he leaps onto the nearest enemy and holds it down
        r: () => {
            const target = c.nearest(30);
            if (!target) return false;
            c.dash(target.pos, 100);
            c.later(0.3, () => {
                if (target.dead) return;
                target.debuffs.root = Math.max(target.debuffs.root, 1.8);
                target.debuffs.silence = Math.max(target.debuffs.silence, 1.8);
                for (let i = 0; i < 3; i++) {
                    c.later(i * 0.5, () => {
                        if (target.dead) return;
                        c.hit(target, 35, "r");
                        c.heal(15);
                    });
                }
            });
        },
    }),

    xayah: (c) => {
        // the feathers her daggers leave behind, for Bladecaller to call back
        const feathers: Vec2[] = [];
        const drop = (pos: Vec2) => {
            feathers.push(pos);
            if (feathers.length > 6) feathers.shift();
        };
        return {
            // Double Daggers: two daggers that leave feathers where they end
            q: () => {
                for (const a of [-0.08, 0.08]) {
                    const dir = v2.rotate(c.aim, a);
                    c.shoot("xayah_q", "q", dir);
                    drop(v2.add(c.player.pos, v2.mul(dir, 18)));
                }
            },
            // Deadly Plumage: faster and quicker on her feet, with a fan of feathers
            w: () => {
                c.buffs.excited = 4;
                c.nextAttackBonus = Math.max(c.nextAttackBonus, 0.4);
                for (const a of [-0.25, 0, 0.25]) {
                    const dir = v2.rotate(c.aim, a);
                    c.shoot("xayah_w", "w", dir);
                    drop(v2.add(c.player.pos, v2.mul(dir, 22)));
                }
            },
            // Bladecaller: every feather flies back to her, and three or more pin what they cross
            e: () => {
                if (!feathers.length) { for (const d of [8, 12, 16]) drop(ahead(c, d)); }
                const set = feathers.splice(0);
                const pinned = new Set<Player>();
                for (const f of set) {
                    const back = v2.sub(c.player.pos, f);
                    c.shoot("xayah_e", "e", back, { from: f, distance: v2.length(back) + 2 });
                    for (const e of c.enemies(2.5, f)) pinned.add(e);
                }
                if (set.length >= 3) { for (const e of pinned) e.debuffs.root = Math.max(e.debuffs.root, 1.25); }
            },
            // Featherstorm: she leaps back, untouchable, and rains feathers in a cone
            r: () => {
                const dir = c.aim;
                c.dash(v2.sub(c.player.pos, v2.mul(dir, 8)), 80);
                c.player.dodgeTime = 1.2;
                c.later(0.3, () => {
                    for (let i = -3; i <= 3; i++) c.shoot("xayah_r", "r", v2.rotate(dir, i * 0.1));
                    for (const e of cone(c, 22, 0.35)) e.debuffs.root = Math.max(e.debuffs.root, 1);
                });
            },
        };
    },

    xerath: (c) => ({
        // Arcanopulse: a charged beam
        q: () => c.later(0.5, () => c.shoot("xerath_q", "q")),
        // Eye of Destruction: a blast whose centre hits much harder
        w: () => {
            const pos = c.at("w");
            mark(c, "xerath_w", "w", pos);
            c.later(0.8, () => {
                blast(c, pos, 6, 60, "w", (e) => {
                    e.debuffs.applySlow(0.6, 1.5);
                    if (v2.distance(e.pos, pos) < 2.5) c.hit(e, 30, "w");
                });
            });
        },
        // Shocking Orb: stuns the first enemy it reaches
        e: () => {
            const target = firstInLine(c, c.reach("e"), 1.5);
            c.shoot("xerath_e", "e");
            if (!target) return;
            c.later(v2.distance(target.pos, c.player.pos) / 100, () => {
                target.debuffs.root = Math.max(target.debuffs.root, 0.9);
            });
        },
        // Rite of the Arcane: three long-range strikes, each where the cursor is when it is called
        r: () => {
            for (let i = 0; i < 3; i++) {
                c.later(0.4 + i * 1.5, () => {
                    const pos = c.cursor(c.reach("r"));
                    mark(c, "xerath_r", "r", pos);
                    c.later(0.6, () => blast(c, pos, 5.5, 85, "r"));
                });
            }
        },
    }),

    xinzhao: (c) => ({
        // Three Talon Strike: three quick cuts, the last throwing the target up
        q: () => {
            const target = c.nearest(8);
            if (!target) return false;
            c.buffs.xinzhao_q = 1;
            for (let i = 0; i < 3; i++) {
                c.later(i * 0.3, () => {
                    if (target.dead) return;
                    c.hit(target, i === 2 ? 55 : 35, "q");
                    if (i === 2) target.debuffs.airborne = Math.max(target.debuffs.airborne, 0.8);
                });
            }
        },
        // Wind Becomes Lightning: a step forward and a long spear thrust that slows
        w: () => {
            c.dash(c.cursor(10), 70);
            c.shoot("xinzhao_w", "w");
            for (const e of c.lineHit(c.reach("w"), 2)) e.debuffs.applySlow(0.5, 2);
        },
        // Audacious Charge: he runs down the nearest enemy and slows it
        e: () => {
            const target = c.nearest(22, c.at("e")) ?? c.nearest(22);
            if (!target) return false;
            c.dash(target.pos, 90);
            c.later(0.3, () => {
                if (target.dead) return;
                c.hit(target, 55, "e");
                target.debuffs.applySlow(0.5, 2.5);
            });
        },
        // Crescent Guard: a sweep that throws everyone back, behind a guard
        r: () => {
            c.addShield(40);
            blast(c, c.player.pos, 12, 80, "r", (e) => shove(e, c.player.pos, 6));
        },
    }),

    yone: (c) => {
        let q = 0;
        return {
            // Mortal Steel: two thrusts, and the third raises a whirlwind that knocks up
            q: () => {
                const dash = c.cursor(4);
                c.dash(dash, 40);
                if (++q < 3) {
                    c.shoot("yone_q", "q");
                    return;
                }
                q = 0;
                const target = firstInLine(c, 35, 2);
                c.shoot("yone_q3", "q");
                if (!target) return;
                c.later(v2.distance(target.pos, c.player.pos) / 60, () => {
                    target.debuffs.airborne = Math.max(target.debuffs.airborne, 0.9);
                });
            },
            // Spirit Cleave: a sweep in front of him that shields him for what it catches
            w: () => {
                mark(c, "yone_w", "w", ahead(c, 7));
                const hits = cone(c, 14, Math.PI / 3);
                for (const e of hits) c.hit(e, 45, "w");
                c.addShield(35 + 15 * hits.length);
            },
            // Soul Unbound: his spirit runs ahead, then he snaps back to his body with the damage
            e: () => {
                const body = v2.copy(c.player.pos);
                c.buffs.yone_e = 4;
                c.buffs.excited = 4;
                c.later(4, () => {
                    c.dash(body, 120);
                    blast(c, body, 6, 60, "e");
                });
            },
            // Fate Sealed: he cuts through a line of enemies and pulls them behind him
            r: () => {
                const to = c.cursor(33);
                const hits = c.lineHit(33, 3);
                c.dash(to, 140);
                c.later(0.25, () => {
                    for (const e of hits) {
                        if (e.dead) continue;
                        c.hit(e, 80, "r");
                        drag(e, v2.add(to, v2.mul(c.aim, 2)), 70);
                    }
                });
            },
        };
    },

    yorick: (c) => ({
        // Last Rites: the next blow heals him
        q: () => {
            c.buffs.yorick_q = 6;
            c.nextAttackBonus = Math.max(c.nextAttackBonus, 1);
            c.heal(25);
        },
        // Dark Procession: a ring of mist that holds in whoever it closes around
        w: () => {
            const pos = c.at("w");
            mark(c, "yorick_w", "w", pos);
            c.zones.push({ pos, time: 4, kind: "singularity", dir: c.aim });
            for (const e of c.enemies(6, pos)) {
                e.debuffs.root = Math.max(e.debuffs.root, 1);
                e.debuffs.applySlow(0.6, 3);
            }
        },
        // Mourning Mist: a globule that slows and marks the first enemy it hits
        e: () => {
            const target = firstInLine(c, c.reach("e"), 1.5);
            c.shoot("yorick_e", "e");
            if (!target) return;
            c.later(v2.distance(target.pos, c.player.pos) / 80, () => {
                target.debuffs.applySlow(0.4, 3);
                c.hit(target, 15, "e");
            });
        },
        // Eulogy of the Isles: the Maiden stands by and strikes at whoever is nearest
        r: () => {
            c.buffs.yorick_r = 12;
            c.addShield(40);
            for (let i = 1; i <= 12; i++) {
                c.later(i, () => {
                    const target = c.nearest(14);
                    if (target) c.hit(target, 22, "r");
                });
            }
        },
    }),

    yunara: (c) => ({
        // Cultivation of Spirit: faster attacks that spread to nearby enemies (the same buff Ashe's
        // Ranger's Focus uses, which is what fires the extra shots)
        q: () => {
            c.buffs.ashe_q = 5;
            c.buffs.yunara_q = 5;
            c.nextAttackBonus = Math.max(c.nextAttackBonus, 0.3);
        },
        // Arc of Judgment: a prayer bead that slows; in her Transcendent State, a slowing laser
        w: () => {
            const target = firstInLine(c, c.reach("w"), 1.5);
            if (c.buff("yunara_r")) {
                c.shoot("yunara_w2", "w");
                for (const e of c.lineHit(c.reach("w"), 1.5)) e.debuffs.applySlow(0.4, 2);
                return;
            }
            c.shoot("yunara_w", "w");
            if (!target) return;
            c.later(v2.distance(target.pos, c.player.pos) / 90, () => target.debuffs.applySlow(0.4, 2));
        },
        // Kanmei's Steps: speed and a ghost's slip; transcended, she dashes instead
        e: () => {
            if (c.buff("yunara_r")) {
                c.dash(c.cursor(14), 70);
            } else {
                c.buffs.excited = 3;
            }
            c.buffs.yunara_e = 3;
            c.player.dodgeTime = 0.4;
        },
        // Transcend One's Self: her basic abilities are upgraded for a while
        r: () => {
            c.buffs.yunara_r = 10;
            c.buffs.ashe_q = 10;
            c.addShield(50);
        },
    }),

    yuumi: (c) => ({
        // Prowling Projectile: a slow missile that slows what it hits
        q: () => {
            const target = firstInLine(c, 80, 1.5);
            c.shoot("yuumi_q", "q");
            if (!target) return;
            c.later(v2.distance(target.pos, c.player.pos) / 60, () => target.debuffs.applySlow(0.4, 2));
        },
        // You and Me!: she pounces and shields herself (there is no one to attach to)
        w: () => {
            c.dash(c.cursor(12), 60);
            c.addShield(45);
            c.buffs.yuumi_w = 3;
        },
        // Zoomies: a heal and a burst of speed
        e: () => {
            c.heal(35);
            c.addShield(25);
            c.buffs.excited = 4;
        },
        // Final Chapter: five waves of magic, the last one rooting
        r: () => {
            for (let i = 0; i < 5; i++) {
                c.later(i * 0.4, () => {
                    c.shoot("yuumi_r", "r");
                    if (i < 4) return;
                    for (const e of c.lineHit(37, 2)) e.debuffs.root = Math.max(e.debuffs.root, 1.5);
                });
            }
        },
    }),

    zaahen: (c) => ({
        // The Darkin Glaive: two cuts that heal him, and a harder next blow
        q: () => {
            const target = c.nearest(8);
            if (target) {
                for (const t of [0, 0.25]) {
                    c.later(t, () => {
                        if (target.dead) return;
                        c.hit(target, 35, "q");
                        c.heal(10);
                    });
                }
            }
            c.buffs.zaahen_q = 4;
            c.nextAttackBonus = Math.max(c.nextAttackBonus, 0.6);
        },
        // Dreaded Return: a stab that drags everything it hits back to him
        w: () => {
            c.shoot("zaahen_w", "w");
            for (const e of c.lineHit(28, 1.5)) {
                c.hit(e, 55, "w");
                drag(e, ahead(c, 2), 50);
            }
        },
        // Aureate Rush: a dash that ends in a spinning slash
        e: () => {
            const to = c.cursor(20);
            c.dash(to, 90);
            c.later(v2.distance(to, c.player.pos) / 90 + 0.1, () => blast(c, c.player.pos, 8, 50, "e"));
        },
        // Grim Deliverance: he rises out of reach, then drives his blade down and heals
        r: () => {
            c.player.dodgeTime = 0.8;
            c.player.debuffs.root = Math.max(c.player.debuffs.root, 0.8);
            c.later(0.8, () => {
                let healed = 0;
                for (const e of c.enemies(10)) {
                    c.hit(e, 100, "r", true);
                    healed += 40;
                }
                c.heal(healed);
            });
        },
    }),

    zac: (c) => ({
        // Stretching Strikes: a lash that slows the first enemy it reaches
        q: () => {
            const target = firstInLine(c, 27, 1.5);
            c.shoot("zac_q", "q");
            if (!target) return;
            c.later(v2.distance(target.pos, c.player.pos) / 90, () => target.debuffs.applySlow(0.3, 2));
        },
        // Unstable Matter: a burst that takes a slice of everyone's health
        w: () => {
            for (const e of c.enemies(12)) c.hit(e, 25 + e.maxHealth * 0.06, "w");
        },
        // Elastic Slingshot: a leap that lands knocking enemies into the air
        e: () => {
            const to = c.cursor(30);
            c.dash(to, 70);
            c.later(v2.distance(to, c.player.pos) / 70 + 0.15, () =>
                blast(c, to, 6, 50, "e", (e) => {
                    e.debuffs.airborne = Math.max(e.debuffs.airborne, 0.8);
                }));
        },
        // Let's Bounce!: four jumps that throw everyone around him, slowing the last
        r: () => {
            for (let i = 0; i < 4; i++) {
                c.later(0.3 + i * 0.4, () => {
                    for (const e of c.enemies(10)) {
                        c.hit(e, 25, "r");
                        shove(e, c.player.pos, 4);
                        if (i === 3) e.debuffs.applySlow(0.5, 1.5);
                    }
                });
            }
        },
    }),

    zed: (c) => {
        let shadow: Vec2 | undefined;
        return {
            // Razor Shuriken: thrown by Zed, and by his shadow too if it is out
            q: () => {
                c.shoot("zed_q", "q");
                if (shadow && c.buff("zed_w")) c.shoot("zed_q", "q", c.aim, { from: shadow });
            },
            // Living Shadow: a shadow set where he points
            w: () => {
                shadow = v2.copy(c.cursor(22));
                c.buffs.zed_w = 5;
                mark(c, "zed_w", "w", shadow);
            },
            // Shadow Slash: a spinning cut around him and his shadow
            e: () => {
                const spots = shadow && c.buff("zed_w") ? [c.player.pos, shadow] : [c.player.pos];
                const hit = new Set<Player>();
                for (const s of spots) for (const e of c.enemies(10, s)) hit.add(e);
                for (const e of hit) {
                    c.hit(e, 40, "e");
                    e.debuffs.applySlow(0.4, 1.5);
                }
            },
            // Death Mark: he vanishes behind the target, then the mark detonates and he snaps back
            r: () => {
                const target = c.nearest(21);
                if (!target) return false;
                const origin = v2.copy(c.player.pos);
                shadow = origin;
                c.buffs.zed_w = 5;
                c.player.dodgeTime = 0.4;
                c.dash(awayFrom(origin, target.pos, 2), 150);
                c.later(0.3, () => {
                    if (!target.dead) c.hit(target, 50, "r");
                });
                c.later(3, () => {
                    if (!target.dead) c.hit(target, 90, "r", true);
                    c.dash(origin, 120);
                });
            },
        };
    },

    zeri: (c) => ({
        // Burst Fire: a quick burst of three
        q: () => {
            for (let i = 0; i < 3; i++) c.later(i * 0.12, () => c.shoot("zeri_q", "q"));
        },
        // Ultrashock Laser: a bolt, and a long laser a moment behind it
        w: () => {
            c.shoot("zeri_w", "w");
            c.later(0.25, () => {
                c.shoot("zeri_w2", "w");
                for (const e of c.lineHit(75, 1.5)) e.debuffs.applySlow(0.4, 1.5);
            });
        },
        // Spark Surge: a dash that charges her next shots
        e: () => {
            c.dash(c.cursor(14), 60);
            c.buffs.zeri_e = 4;
            c.buffs.excited = 3;
            c.nextAttackBonus = Math.max(c.nextAttackBonus, 0.5);
        },
        // Lightning Crash: a ring of bolts, and she speeds up
        r: () => {
            c.buffs.excited = 6;
            c.buffs.zeri_r = 6;
            for (let i = 0; i < 6; i++) c.shoot("zeri_r", "r", v2.rotate(c.aim, (i * Math.PI) / 3));
        },
    }),

    ziggs: (c) => ({
        // Bouncing Bomb: it lands, then bounces twice more, a little weaker each time
        q: () => {
            const dir = c.aim;
            const first = c.at("q");
            lob(c, "ziggs_q", "q", first, 70, () => {
                blast(c, first, 5, 60, "q");
                const second = v2.add(first, v2.mul(dir, 6));
                c.later(0.25, () => blast(c, second, 5, 50, "q"));
                c.later(0.5, () => blast(c, v2.add(second, v2.mul(dir, 6)), 5, 40, "q"));
            });
        },
        // Satchel Charge: it blows, throwing enemies and Ziggs himself away from it
        w: () => {
            const pos = c.at("w");
            lob(c, "ziggs_w", "w", pos, 70, () =>
                c.later(1, () => {
                    blast(c, pos, 6, 55, "w", (e) => shove(e, pos, 6));
                    if (v2.distance(c.player.pos, pos) <= 6) c.dash(awayFrom(pos, c.player.pos, 8), 70);
                }));
        },
        // Hexplosive Minefield: three mines, each rooting whoever steps on it
        e: () => {
            const centre = c.at("e");
            const side = v2.perp(c.aim);
            for (const o of [-3, 0, 3]) {
                const pos = v2.add(centre, v2.mul(side, o));
                const to = v2.sub(pos, c.player.pos);
                c.shoot("ziggs_e", "e", to, { distance: v2.length(to) });
                c.traps.push({ pos, arm: 0.6, life: 10, kind: "snap" });
            }
        },
        // Mega Inferno Bomb: a huge bomb from across the map
        r: () => {
            const pos = c.at("r");
            lob(c, "ziggs_r", "r", pos, 120, () =>
                c.later(0.3, () =>
                    blast(c, pos, 8, 100, "r", (e) => {
                        if (v2.distance(e.pos, pos) < 3.5) c.hit(e, 40, "r");
                    })));
        },
    }),

    zilean: (c) => ({
        // Time Bomb: it ticks, then goes off
        q: () => {
            const pos = c.at("q");
            lob(c, "zilean_q", "q", pos, 60, () => c.later(1.5, () => blast(c, pos, 5, 70, "q")));
        },
        // Rewind: his Q and E come back at once
        w: () => {
            c.buffs.zilean_w = 2;
            c.cooldowns[0] = 0;
            c.cooldowns[2] = 0;
        },
        // Time Warp: everyone near him slows, and he speeds up
        e: () => {
            c.buffs.excited = 2.5;
            for (const e of c.enemies(18)) e.debuffs.applySlow(0.45, 2.5);
        },
        // Chronoshift: a lifeline that shields and heals
        r: () => {
            c.buffs.zilean_r = 3;
            c.addShield(100, 200);
            c.heal(40);
        },
    }),

    zoe: (c) => ({
        // Paddle Star: a star that hits harder the further it has gone
        q: () => c.shoot("zoe_q", "q"),
        // Spell Thief: three small stolen bolts that find the nearest enemy
        w: () => {
            c.buffs.zoe_w = 4;
            const target = c.nearest(30);
            for (let i = -1; i <= 1; i++) {
                const dir = target ? v2.sub(target.pos, c.player.pos) : c.aim;
                c.shoot("zoe_w", "w", v2.rotate(dir, i * 0.2), { homing: target });
            }
        },
        // Sleepy Trouble Bubble: it puts the first enemy to sleep, and the sleeper takes extra
        e: () => {
            const target = firstInLine(c, 27, 1.5);
            c.shoot("zoe_e", "e");
            if (!target) return;
            c.later(v2.distance(target.pos, c.player.pos) / 70 + 0.2, () => {
                if (target.dead) return;
                target.debuffs.root = Math.max(target.debuffs.root, 1.5);
                target.debuffs.silence = Math.max(target.debuffs.silence, 1.5);
                c.later(1.5, () => {
                    if (!target.dead) c.hit(target, 60, "e");
                });
            });
        },
        // Portal Jump: she blinks out and is pulled back a moment later
        r: () => {
            const home = v2.copy(c.player.pos);
            c.dash(c.at("r"), 150);
            c.addShield(30);
            c.later(1.2, () => c.dash(home, 150));
        },
    }),

    zyra: (c) => ({
        // Deadly Spines: spines break the ground where she points
        q: () => {
            const pos = c.at("q");
            mark(c, "zyra_q", "q", pos);
            c.later(0.6, () => blast(c, pos, 4, 60, "q"));
        },
        // Rampant Growth: a seed becomes a plant that spits at whoever comes near
        w: () => {
            const pos = c.at("w");
            lob(c, "zyra_w", "w", pos, 60, () => {
                for (let i = 1; i <= 8; i++) {
                    c.later(i, () => {
                        const target = c.nearest(14, pos);
                        if (target) c.shoot("zyra_plant", "w", v2.sub(target.pos, pos), { from: pos, homing: target });
                    });
                }
            });
        },
        // Grasping Roots: a vine that roots the first enemy it catches
        e: () => {
            const target = firstInLine(c, c.reach("e"), 1.5);
            c.shoot("zyra_e", "e");
            if (!target) return;
            c.later(v2.distance(target.pos, c.player.pos) / 90, () => {
                target.debuffs.root = Math.max(target.debuffs.root, 1.5);
            });
        },
        // Stranglethorns: thorns throw everyone up, then hold the ground and strangle
        r: () => {
            const pos = c.at("r");
            mark(c, "zyra_r", "r", pos);
            c.later(0.6, () => {
                blast(c, pos, 7, 80, "r", (e) => {
                    e.debuffs.airborne = Math.max(e.debuffs.airborne, 1);
                });
                for (let i = 1; i <= 5; i++) {
                    c.later(i, () => blast(c, pos, 7, 10, "r", (e) => e.debuffs.applySlow(0.4, 1.2)));
                }
            });
        },
    }),
};
