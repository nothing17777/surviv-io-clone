import { v2, type Vec2 } from "../../../../shared/utils/v2.ts";
import type { Champion } from "../champion.ts";
import type { Player } from "../objects/player.ts";
import type { ChampionKitMap } from "./types.ts";

/** hand-written kits, batch 2 (see types.ts: do not read anything off `c` outside a callback) */

const toward = (c: Champion, p: Vec2) => v2.sub(p, c.player.pos);

/** the spot `dist` units past `e`, straight away from the champion */
const awayFrom = (c: Champion, e: Player, dist: number) =>
    v2.add(e.pos, v2.mul(v2.normalizeSafe(v2.sub(e.pos, c.player.pos)), dist));

const shove = (e: Player, to: Vec2, speed = 45) => {
    e.webPull = { target: to, speed, time: v2.distance(to, e.pos) / speed + 0.1 };
};

/** enemies inside a cone in front of the champion */
const cone = (c: Champion, range: number, deg: number, from = c.player.pos) =>
    c.enemies(range, from).filter((e) => {
        const to = v2.normalizeSafe(v2.sub(e.pos, from));
        return v2.dot(to, c.aim) >= Math.cos((deg * Math.PI) / 180);
    });

/** `n` shots spread evenly across `deg` degrees around the aim */
const fan = (c: Champion, id: string, key: "q" | "w" | "e" | "r", n: number, deg: number, from?: Vec2) => {
    for (let i = 0; i < n; i++) {
        const a = n === 1 ? 0 : ((i / (n - 1) - 0.5) * deg * Math.PI) / 180;
        c.shoot(id, key, v2.rotate(c.aim, a), from ? { from } : {});
    }
};

/** a shot lobbed to a spot; returns how long it flies */
const lob = (c: Champion, id: string, key: "q" | "w" | "e" | "r", pos: Vec2, speed: number, from?: Vec2) => {
    const origin = from ?? c.player.pos;
    const d = Math.max(v2.distance(pos, origin), 0.5);
    c.shoot(id, key, v2.sub(pos, origin), { distance: d, from });
    return d / speed;
};

/** `n` runs of `fn`, the first now and the rest every `every` seconds */
const pulse = (c: Champion, n: number, every: number, fn: (i: number) => void) => {
    for (let i = 0; i < n; i++) {
        if (i === 0) fn(0);
        else c.later(i * every, () => fn(i));
    }
};

const dmg = (c: Champion, e: Player, amount: number, key: "q" | "w" | "e" | "r", trueDamage = false) => {
    if (!e.dead) c.hit(e, amount, key, trueDamage);
};

export const kits: ChampionKitMap = {
    fiddlesticks: (c) => ({
        // Terrify: fear, approximated by a long silence and a heavy slow
        q: () => {
            const t = c.nearest(c.reach("q"));
            if (!t) return false;
            dmg(c, t, 35, "q");
            t.debuffs.silence = Math.max(t.debuffs.silence, 1.5);
            t.debuffs.applySlow(0.6, 1.5);
            shove(t, awayFrom(c, t, 6), 25);
        },
        // Bountiful Harvest: a drain channel that heals him
        w: () => {
            if (!c.nearest(c.reach("w"))) return false;
            c.buffs.fiddlesticks_w = 2;
            c.player.debuffs.applySlow(0.5, 2);
            pulse(c, 5, 0.4, () => {
                const t = c.nearest(c.reach("w"));
                if (!t) return;
                dmg(c, t, 14, "w");
                c.heal(6);
            });
        },
        // Reap: a scythe arc that silences
        e: () => {
            const at = c.at("e");
            c.shoot("fiddlesticks_e", "e", toward(c, at), { distance: Math.max(v2.distance(at, c.player.pos), 2) });
            for (const e of c.enemies(5, at)) {
                dmg(c, e, 40, "e");
                e.debuffs.silence = Math.max(e.debuffs.silence, 1.5);
                e.debuffs.applySlow(0.3, 1.5);
            }
        },
        // Crowstorm: blink in, then the crows tear at everyone around him
        r: () => {
            const to = c.at("r");
            c.dash(to, 200);
            c.buffs.fiddlesticks_r = 1.9;
            const land = v2.distance(to, c.player.pos) / 200 + 0.15;
            for (let i = 0; i < 6; i++) {
                c.later(land + i * 0.25, () => {
                    for (const e of c.enemies(6)) dmg(c, e, 16, "r");
                });
            }
        },
    }),

    fiora: (c) => ({
        // Lunge: a short dash that strikes whoever she lands beside
        q: () => {
            const to = c.at("q");
            c.dash(to, 70);
            c.later(v2.distance(to, c.player.pos) / 70, () => {
                const t = c.nearest(5);
                if (t) dmg(c, t, 55, "q", true);
            });
        },
        // Riposte: parries everything for a moment, then stabs back and stuns
        w: () => {
            c.player.dodgeTime = 0.75;
            c.buffs.fiora_w = 0.75;
            c.later(0.75, () => {
                c.shoot("fiora_w", "w");
                for (const e of c.lineHit(c.reach("w"), 1.5)) {
                    dmg(c, e, 40, "w");
                    e.debuffs.root = Math.max(e.debuffs.root, 1.2);
                }
            });
        },
        // Bladework: the next strikes crit and slow
        e: () => {
            c.buffs.fiora_e = 3;
            c.nextAttackBonus = Math.max(c.nextAttackBonus, 1);
            c.nextAttackSlow = true;
        },
        // Grand Challenge: dive on a target and carve its vitals
        r: () => {
            const t = c.nearest(c.reach("r"));
            if (!t) return false;
            c.dash(t.pos, 90);
            c.buffs.fiora_r = 3;
            for (let i = 0; i < 4; i++) {
                c.later(0.2 + i * 0.25, () => {
                    if (t.dead) return;
                    dmg(c, t, 22, "r", true);
                    t.debuffs.applySlow(0.4, 0.5);
                });
            }
            c.later(1.2, () => c.heal(30));
        },
    }),

    fizz: (c) => ({
        // Urchin Strike: dash through the target
        q: () => {
            const t = c.nearest(c.reach("q"));
            if (!t) return false;
            c.dash(awayFrom(c, t, 3), 100);
            dmg(c, t, 50, "q");
        },
        // Seastone Trident: his next attack bleeds and slows
        w: () => {
            c.buffs.fizz_w = 4;
            c.nextAttackBonus = Math.max(c.nextAttackBonus, 0.6);
            c.nextAttackSlow = true;
            const t = c.nearest(8);
            if (t) {
                for (let i = 1; i <= 3; i++) c.later(i * 0.5, () => dmg(c, t, 10, "w"));
            }
        },
        // Playful / Trickster: hops out of reach, then slams down
        e: () => {
            const to = c.at("e");
            c.player.dodgeTime = 0.9;
            c.buffs.fizz_e = 0.9;
            c.dash(to, 60);
            c.later(0.9, () => {
                for (const e of c.enemies(4, to)) {
                    dmg(c, e, 45, "e");
                    e.debuffs.applySlow(0.4, 1.5);
                }
            });
        },
        // Chum the Waters: the shark rides a fish
        r: () => {
            c.shoot("fizz_r", "r");
        },
    }),

    galio: (c) => ({
        // Winds of War: two tornadoes that sweep in together
        q: () => {
            c.shoot("galio_q", "q", v2.rotate(c.aim, -0.18));
            c.shoot("galio_q", "q", v2.rotate(c.aim, 0.18));
        },
        // Shield of Durand: a magic shield, then a taunting burst
        w: () => {
            c.addShield(60);
            c.buffs.galio_w = 2;
            for (const e of c.enemies(c.reach("w"))) e.debuffs.applySlow(0.5, 2);
            c.later(2, () => {
                for (const e of c.enemies(c.reach("w"))) {
                    dmg(c, e, 35, "w");
                    e.debuffs.root = Math.max(e.debuffs.root, 0.8);
                }
            });
        },
        // Justice Punch: dash and knock up
        e: () => {
            const to = c.at("e");
            c.dash(to, 80);
            c.later(v2.distance(to, c.player.pos) / 80 + 0.05, () => {
                const t = c.nearest(5);
                if (!t) return;
                dmg(c, t, 50, "e");
                t.debuffs.airborne += 0.8;
            });
        },
        // Hero's Entrance: a long, untouchable leap that crashes down
        r: () => {
            const to = c.cursor(60);
            const time = v2.distance(to, c.player.pos) / 90 + 0.2;
            c.dash(to, 90);
            c.player.dodgeTime = time;
            c.buffs.galio_r = time;
            c.later(time, () => {
                for (const e of c.enemies(7, to)) {
                    dmg(c, e, 80, "r");
                    e.debuffs.airborne += 1;
                }
            });
        },
    }),

    gangplank: (c) => ({
        // Parrrley: a shot from the pistol
        q: () => {
            const t = c.nearest(c.reach("q"));
            if (!t) return false;
            c.shoot("gangplank_q", "q", toward(c, t.pos), { homing: t });
        },
        // Remove Scurvy: cleanse and heal
        w: () => {
            const d = c.player.debuffs;
            d.root = 0;
            d.slow = 0;
            d.silence = 0;
            d.airborne = 0;
            c.heal(35);
            c.buffs.gangplank_w = 1.5;
        },
        // Powder Keg: a keg lobbed out that blows after a short fuse
        e: () => {
            const at = c.at("e");
            const fly = lob(c, "gangplank_e", "e", at, 45);
            c.later(fly + 1, () => {
                for (const e of c.enemies(4, at)) {
                    dmg(c, e, 60, "e");
                    e.debuffs.applySlow(0.4, 1.5);
                }
            });
        },
        // Cannon Barrage: shells rain on a patch of ground
        r: () => {
            const at = c.cursor(60);
            c.buffs.gangplank_r = 3;
            pulse(c, 8, 0.4, () => {
                const spot = v2.add(at, v2.create((Math.random() - 0.5) * 8, (Math.random() - 0.5) * 8));
                c.shoot("gangplank_r", "r", v2.create(0, -1), { from: v2.add(spot, v2.create(0, 7)), distance: 7 });
                c.later(0.15, () => {
                    for (const e of c.enemies(5, at)) {
                        dmg(c, e, 14, "r");
                        e.debuffs.applySlow(0.4, 1);
                    }
                });
            });
        },
    }),

    // ranged Gnar: Mini Gnar's kit with the Mega Gnar shove on R
    gnar: (c) => ({
        // Boomerang Throw: out and back
        q: () => {
            c.shoot("gnar_q", "q");
        },
        // Hyper: faster, harder attacks
        w: () => {
            c.buffs.gnar_w = 3;
            c.nextAttackBonus = Math.max(c.nextAttackBonus, 0.6);
            c.addShield(25);
        },
        // Hop: a bounding leap that slows where it lands
        e: () => {
            const to = c.at("e");
            c.dash(to, 60);
            c.later(v2.distance(to, c.player.pos) / 60 + 0.05, () => {
                for (const e of c.enemies(3.5, to)) {
                    dmg(c, e, 25, "e");
                    e.debuffs.applySlow(0.4, 1.5);
                }
            });
        },
        // GNAR!: a roar that shoves everyone back
        r: () => {
            c.buffs.gnar_r = 2;
            for (const e of c.enemies(8)) {
                dmg(c, e, 50, "r");
                e.debuffs.root = Math.max(e.debuffs.root, 0.8);
                e.debuffs.applySlow(0.6, 1.5);
                shove(e, awayFrom(c, e, 8), 40);
            }
            fan(c, "gnar_r", "r", 8, 315);
        },
    }),

    gragas: (c) => ({
        // Barrel Roll: a barrel that bursts after a beat
        q: () => {
            const at = c.at("q");
            const fly = lob(c, "gragas_q", "q", at, 40);
            c.later(fly + 1.5, () => {
                for (const e of c.enemies(4, at)) {
                    dmg(c, e, 55, "q");
                    e.debuffs.applySlow(0.4, 2);
                }
            });
        },
        // Drunken Rage: a swig that shields and hardens his next hit
        w: () => {
            c.addShield(45);
            c.buffs.gragas_w = 3;
            c.nextAttackBonus = Math.max(c.nextAttackBonus, 0.7);
        },
        // Body Slam: shoulder charge that stuns what it meets
        e: () => {
            const to = c.at("e");
            c.dash(to, 80);
            c.later(v2.distance(to, c.player.pos) / 80 + 0.05, () => {
                for (const e of c.enemies(4, to)) {
                    dmg(c, e, 50, "e");
                    e.debuffs.root = Math.max(e.debuffs.root, 0.8);
                }
            });
        },
        // Explosive Cask: knocks everything away from where it lands
        r: () => {
            const at = c.at("r");
            const fly = lob(c, "gragas_r", "r", at, 50);
            c.later(fly, () => {
                for (const e of c.enemies(5, at)) {
                    dmg(c, e, 80, "r");
                    shove(e, v2.add(e.pos, v2.mul(v2.normalizeSafe(v2.sub(e.pos, at), c.aim), 7)), 45);
                }
            });
        },
    }),

    graves: (c) => ({
        // End of the Line: a shot, and a second after it
        q: () => {
            c.shoot("graves_q", "q");
            c.later(0.3, () => c.shoot("graves_q", "q", c.aim, { mult: 0.7 }));
        },
        // Smoke Screen: a cloud that slows and blinds
        w: () => {
            const at = c.at("w");
            const fly = lob(c, "graves_w", "w", at, 60);
            c.later(fly, () => {
                for (const e of c.enemies(5, at)) {
                    dmg(c, e, 30, "w");
                    e.debuffs.applySlow(0.5, 3);
                    e.debuffs.silence = Math.max(e.debuffs.silence, 1);
                }
            });
        },
        // Quickdraw: a dash that loads his gun
        e: () => {
            c.dash(c.at("e"), 80);
            c.addShield(25);
            c.buffs.graves_e = 4;
            c.nextAttackBonus = Math.max(c.nextAttackBonus, 0.5);
        },
        // Collateral Damage: a heavy slug that bursts into a cone of pellets, kicking him back
        r: () => {
            const dir = c.aim;
            c.shoot("graves_r", "r", dir);
            c.dash(v2.sub(c.player.pos, v2.mul(dir, 8)), 90);
            const burst = v2.add(c.player.pos, v2.mul(dir, c.reach("r") - 4));
            c.later(0.35, () => {
                for (let i = 0; i < 7; i++) {
                    c.shoot("graves_r2", "r", v2.rotate(dir, ((i - 3) * 9 * Math.PI) / 180), { from: burst });
                }
            });
        },
    }),

    gwen: (c) => ({
        // Snip Snip!: three cuts, the last one slows
        q: () => {
            fan(c, "gwen_q", "q", 3, 40);
            pulse(c, 3, 0.25, (i) => {
                for (const e of cone(c, c.reach("q"), 35)) {
                    dmg(c, e, i === 2 ? 45 : 25, "q");
                    if (i === 2) e.debuffs.applySlow(0.4, 1.5);
                }
            });
        },
        // Hallowed Mist: untouchable by anything from outside, for a moment
        w: () => {
            c.player.dodgeTime = 1;
            c.addShield(40);
            c.buffs.gwen_w = 4;
        },
        // Skip 'n Slash: dash and cut
        e: () => {
            const to = c.at("e");
            c.dash(to, 90);
            c.nextAttackBonus = Math.max(c.nextAttackBonus, 0.5);
            c.later(v2.distance(to, c.player.pos) / 90 + 0.05, () => {
                const t = c.nearest(4);
                if (t) dmg(c, t, 30, "e");
            });
        },
        // Needlework: three needles in a row
        r: () => {
            pulse(c, 3, 0.3, () => c.shoot("gwen_r", "r"));
        },
    }),

    hecarim: (c) => ({
        // Rampage: a sweep that heals from everyone it hits
        q: () => {
            c.buffs.hecarim_q = 3;
            for (const e of c.enemies(c.reach("q"))) {
                dmg(c, e, 35, "q");
                c.heal(8);
            }
        },
        // Spirit of Dread: a ghostly aura that drains
        w: () => {
            c.buffs.hecarim_w = 4;
            pulse(c, 8, 0.5, () => {
                for (const e of c.enemies(8)) {
                    dmg(c, e, 8, "w");
                    c.heal(3);
                }
            });
        },
        // Devastating Charge: a run that ends in a knockback
        e: () => {
            const to = v2.add(c.player.pos, v2.mul(c.aim, 18));
            c.dash(to, 70);
            c.buffs.hecarim_e = 3;
            c.nextAttackBonus = Math.max(c.nextAttackBonus, 1);
            c.later(0.3, () => {
                const t = c.nearest(5);
                if (!t) return;
                dmg(c, t, 40, "e");
                shove(t, awayFrom(c, t, 6), 50);
            });
        },
        // Onslaught of Shadows: a long charge ending in a terrifying burst
        r: () => {
            const to = c.cursor(40);
            c.dash(to, 90);
            c.later(v2.distance(to, c.player.pos) / 90 + 0.1, () => {
                for (const e of c.enemies(6, to)) {
                    dmg(c, e, 70, "r");
                    e.debuffs.silence = Math.max(e.debuffs.silence, 1.5);
                    e.debuffs.applySlow(0.7, 1.5);
                }
            });
        },
    }),

    heimerdinger: (c) => {
        let upgraded = false;
        /** UPGRADE!!!: the next Q, W or E is the big one */
        const upgrade = () => {
            if (!upgraded || !c.buff("heimerdinger_r")) return false;
            upgraded = false;
            return true;
        };
        return {
            // H-28G Evolution Turret
            q: () => {
                const big = upgrade();
                const pos = c.at("q");
                const fire = () => {
                    const t = c.nearest(16, pos);
                    if (t) c.shoot("heimerdinger_q", "q", v2.sub(t.pos, pos), { from: pos, mult: big ? 1.8 : 1 });
                };
                fire();
                for (let i = 1; i <= 10; i++) c.later(i * 0.75, fire);
            },
            // Hextech Micro-Rockets
            w: () => {
                const big = upgrade();
                fan(c, "heimerdinger_w", "w", big ? 5 : 3, big ? 24 : 16);
            },
            // CH-2 Electron Storm Grenade: stuns where it lands
            e: () => {
                const big = upgrade();
                const at = c.at("e");
                const spots = big
                    ? [at, v2.add(at, v2.mul(v2.perp(c.aim), 4)), v2.sub(at, v2.mul(v2.perp(c.aim), 4))]
                    : [at];
                for (const spot of spots) {
                    const fly = lob(c, "heimerdinger_e", "e", spot, 55);
                    c.later(fly, () => {
                        for (const e of c.enemies(4, spot)) {
                            dmg(c, e, 40, "e");
                            e.debuffs.root = Math.max(e.debuffs.root, 1.2);
                            e.debuffs.applySlow(0.5, 2);
                        }
                    });
                }
            },
            // UPGRADE!!!
            r: () => {
                upgraded = true;
                c.buffs.heimerdinger_r = 10;
                c.addShield(30);
            },
        };
    },

    // Hwei picks a subject with one press (Q, W or E, which casts nothing and costs no cooldown)
    // and casts the combined spell with the next one
    hwei: (c) => {
        let subject: "q" | "w" | "e" | undefined;
        type Key = "q" | "w" | "e";
        const spells: Record<Key, Record<Key, () => void>> = {
            q: {
                // Devastating Fire: a ball of flame
                q: () => {
                    c.shoot("hwei_qq", "q");
                },
                // Severing Bolt: a piercing bolt
                w: () => {
                    c.shoot("hwei_qw", "w");
                },
                // Molten Fissure: the ground erupts in a line
                e: () => {
                    c.shoot("hwei_qe", "e");
                    c.later(0.5, () => {
                        for (const e of c.lineHit(28, 2.5)) {
                            dmg(c, e, 50, "e");
                            e.debuffs.applySlow(0.3, 1.5);
                        }
                    });
                },
            },
            w: {
                // Fleeting Current: a dash that shields
                q: () => {
                    c.shoot("hwei_wq", "q", c.aim, { distance: 14 });
                    c.dash(v2.add(c.player.pos, v2.mul(c.aim, 14)), 80);
                    c.addShield(30);
                },
                // Pool of Reflection: a shield and a heal
                w: () => {
                    c.addShield(60);
                    c.heal(15);
                    c.buffs.hwei_ww = 3;
                },
                // Stirring Lights: speed and healing
                e: () => {
                    c.heal(25);
                    c.addShield(20);
                    c.buffs.excited = 3;
                },
            },
            e: {
                // Grim Visage: a fright that throws enemies back
                q: () => {
                    c.shoot("hwei_eq", "q");
                    for (const e of c.lineHit(24, 2)) {
                        dmg(c, e, 25, "q");
                        e.debuffs.silence = Math.max(e.debuffs.silence, 1);
                        e.debuffs.applySlow(0.6, 1.5);
                        shove(e, awayFrom(c, e, 8), 40);
                    }
                },
                // Gaze of the Abyss: an eye that opens on the nearest enemy and roots it
                w: () => {
                    const t = c.nearest(28);
                    if (!t) {
                        c.buffs.hwei_ew = 1;
                        return;
                    }
                    c.shoot("hwei_ew", "w", toward(c, t.pos), { homing: t });
                    t.debuffs.applySlow(0.5, 1);
                    c.later(0.7, () => {
                        dmg(c, t, 35, "w");
                        t.debuffs.root = Math.max(t.debuffs.root, 1.2);
                    });
                },
                // Crushing Maw: jaws that close on the cursor
                e: () => {
                    const at = c.cursor(30);
                    lob(c, "hwei_ee", "e", at, 90);
                    c.later(0.8, () => {
                        for (const e of c.enemies(4, at)) {
                            dmg(c, e, 45, "e");
                            e.debuffs.root = Math.max(e.debuffs.root, 1.2);
                        }
                    });
                },
            },
        };
        const press = (key: Key) => () => {
            if (!subject || !c.buff("hwei_subject")) {
                subject = key;
                c.buffs.hwei_subject = 6;
                return false;
            }
            const first = subject;
            subject = undefined;
            c.buffs.hwei_subject = 0;
            spells[first][key]();
        };
        return {
            q: press("q"),
            w: press("w"),
            e: press("e"),
            // Spiraling Despair: a long beam that slows
            r: () => {
                c.shoot("hwei_r", "r");
                for (const e of c.lineHit(c.reach("r"), 2.5)) {
                    dmg(c, e, 70, "r");
                    e.debuffs.applySlow(0.6, 2.5);
                }
            },
        };
    },

    illaoi: (c) => ({
        // Tentacle Smash: a tentacle slams down in front of her
        q: () => {
            c.shoot("illaoi_q", "q");
            c.later(0.4, () => {
                for (const e of c.lineHit(c.reach("q"), 2.2)) {
                    dmg(c, e, 55, "q");
                    e.debuffs.applySlow(0.3, 1);
                }
            });
        },
        // Harsh Lesson: lunge in with a heavy swing
        w: () => {
            c.buffs.illaoi_w = 3;
            c.nextAttackBonus = Math.max(c.nextAttackBonus, 0.9);
            const t = c.nearest(c.reach("w"));
            if (t) {
                c.dash(awayFrom(c, t, -2), 60);
                dmg(c, t, 40, "w");
            }
        },
        // Test of Spirit: rips a spirit out of the enemy
        e: () => {
            c.shoot("illaoi_e", "e");
            const t = c.lineHit(c.reach("e"), 1.5)[0];
            if (!t) return;
            dmg(c, t, 30, "e");
            t.debuffs.silence = Math.max(t.debuffs.silence, 1.5);
            shove(t, v2.add(c.player.pos, v2.mul(v2.normalizeSafe(v2.sub(t.pos, c.player.pos)), 3)), 30);
        },
        // Leap of Faith: tentacles burst all around
        r: () => {
            c.buffs.illaoi_r = 2;
            c.shoot("illaoi_r", "r", c.aim, { distance: 6 });
            pulse(c, 2, 0.6, () => {
                for (const e of c.enemies(c.reach("r"))) {
                    dmg(c, e, 45, "r");
                    e.debuffs.applySlow(0.5, 1.5);
                }
            });
        },
    }),

    irelia: (c) => ({
        // Bladesurge: dashes at an enemy; a weak one resets it
        q: () => {
            const t = c.nearest(c.reach("q"));
            if (!t) return false;
            c.dash(t.pos, 110);
            dmg(c, t, 45, "q");
            if (t.health < t.maxHealth * 0.4) c.cooldowns[0] = 0;
        },
        // Defiant Dance: braces, then lashes out
        w: () => {
            c.addShield(40);
            c.buffs.irelia_w = 1;
            c.later(1, () => c.shoot("irelia_w", "w"));
        },
        // Flawless Duet: a line of blades that stuns
        e: () => {
            c.shoot("irelia_e", "e");
            for (const e of c.lineHit(c.reach("e"), 2.5)) {
                dmg(c, e, 40, "e");
                e.debuffs.root = Math.max(e.debuffs.root, 1);
                e.debuffs.applySlow(0.4, 2);
            }
        },
        // Vanguard's Edge: a fan of blades
        r: () => {
            fan(c, "irelia_r", "r", 5, 30);
            c.buffs.irelia_r = 4;
        },
    }),

    ivern: (c) => ({
        // Rootcaller: a seed that roots the first enemy it meets
        q: () => {
            c.shoot("ivern_q", "q");
            const t =
                c.lineHit(c.reach("q"), 1.5).sort((a, b) =>
                    v2.distance(a.pos, c.player.pos) - v2.distance(b.pos, c.player.pos)
                )[0];
            if (!t) return;
            dmg(c, t, 40, "q");
            t.debuffs.root = Math.max(t.debuffs.root, 1.5);
            c.dash(awayFrom(c, t, -3), 60);
        },
        // Brushmaker: a bush to hide in
        w: () => {
            c.addShield(50);
            c.buffs.ivern_w = 4;
            c.nextAttackBonus = Math.max(c.nextAttackBonus, 0.6);
        },
        // Triggerseed: a burst of shield and thorns
        e: () => {
            c.addShield(70);
            c.buffs.ivern_e = 2;
            for (const e of c.enemies(5)) {
                dmg(c, e, 30, "e");
                e.debuffs.applySlow(0.5, 1.5);
            }
        },
        // Daisy!: a rock golem that smashes his enemies
        r: () => {
            const home = v2.add(c.player.pos, v2.mul(c.aim, 3));
            c.shoot("ivern_r", "r", c.aim, { distance: 3 });
            c.buffs.ivern_r = 8;
            pulse(c, 6, 1.2, (i) => {
                const t = c.nearest(9, home);
                if (!t) return;
                dmg(c, t, 30, "r");
                if (i % 3 === 0) t.debuffs.airborne += 0.5;
            });
        },
    }),

    janna: (c) => ({
        // Howling Gale: a tornado that tosses what it catches
        q: () => {
            c.shoot("janna_q", "q");
            for (const e of c.lineHit(c.reach("q"), 2)) {
                const along = v2.dot(v2.sub(e.pos, c.player.pos), c.aim);
                c.later(Math.max(along, 0) / 60, () => {
                    dmg(c, e, 35, "q");
                    e.debuffs.airborne += 0.8;
                });
            }
        },
        // Zephyr: a slowing, stinging gust
        w: () => {
            const t = c.nearest(25);
            if (!t) return false;
            c.shoot("janna_w", "w", toward(c, t.pos), { homing: t });
            t.debuffs.applySlow(0.6, 2);
            c.buffs.janna_w = 2;
        },
        // Eye of the Storm: shield, and her attacks hit harder
        e: () => {
            c.addShield(70);
            c.buffs.janna_e = 4;
            c.nextAttackBonus = Math.max(c.nextAttackBonus, 0.4);
        },
        // Monsoon: blows everyone away and heals
        r: () => {
            c.buffs.janna_r = 3;
            for (const e of c.enemies(10)) shove(e, awayFrom(c, e, 9), 40);
            pulse(c, 6, 0.5, () => c.heal(10));
        },
    }),

    jarvaniv: (c) => ({
        // Dragon Strike: a thrust that drags enemies along
        q: () => {
            const to = v2.add(c.player.pos, v2.mul(c.aim, 20));
            const hits = c.lineHit(c.reach("q"), 1.8);
            c.dash(to, 80);
            for (const e of hits) {
                dmg(c, e, 55, "q");
                shove(e, to, 80);
            }
        },
        // Golden Aegis: shield and a slowing shockwave
        w: () => {
            c.addShield(60);
            c.buffs.jarvaniv_w = 2;
            for (const e of c.enemies(8)) e.debuffs.applySlow(0.4, 1.5);
        },
        // Demacian Standard: a banner that empowers him while he stands by it
        e: () => {
            const at = c.at("e");
            const fly = lob(c, "jarvaniv_e", "e", at, 70);
            c.later(fly, () => {
                for (const e of c.enemies(4, at)) dmg(c, e, 30, "e");
                if (v2.distance(c.player.pos, at) < 8) c.buffs.excited = 4;
            });
        },
        // Cataclysm: leaps in and seals the arena
        r: () => {
            const t = c.nearest(c.reach("r"));
            if (!t) return false;
            const centre = v2.copy(t.pos);
            c.dash(centre, 90);
            c.buffs.jarvaniv_r = 3;
            c.later(v2.distance(centre, c.player.pos) / 90 + 0.1, () => {
                for (const e of c.enemies(7, centre)) dmg(c, e, 70, "r");
            });
            pulse(c, 7, 0.5, (i) => {
                if (i === 0) return;
                for (const e of c.enemies(14, centre)) {
                    if (v2.distance(e.pos, centre) > 7) shove(e, centre, 50);
                }
            });
        },
    }),

    jax: (c) => ({
        // Leap Strike
        q: () => {
            const t = c.nearest(c.reach("q"));
            if (!t) return false;
            c.dash(t.pos, 100);
            dmg(c, t, 55, "q");
        },
        // Empower: the next hit is a heavy one
        w: () => {
            c.buffs.jax_w = 3;
            c.nextAttackBonus = Math.max(c.nextAttackBonus, 0.9);
        },
        // Counter Strike: dodges every attack, then stuns whoever is close
        e: () => {
            c.player.dodgeTime = 1.5;
            c.buffs.jax_e = 1.5;
            c.later(1.5, () => {
                for (const e of c.enemies(c.reach("e") + 2)) {
                    dmg(c, e, 45, "e");
                    e.debuffs.root = Math.max(e.debuffs.root, 1);
                }
            });
        },
        // Grandmaster's Might: tougher and harder hitting
        r: () => {
            c.buffs.jax_r = 8;
            c.addShield(50);
            c.nextAttackBonus = Math.max(c.nextAttackBonus, 0.5);
        },
    }),

    // ranged Jayce: R swaps between Mercury Cannon and Mercury Hammer, which changes Q, W and E
    jayce: (c) => {
        let hammer = false;
        return {
            // Shock Blast / To the Skies!
            q: () => {
                if (!hammer) {
                    c.shoot("jayce_q", "q");
                    return;
                }
                const t = c.nearest(c.reach("q"));
                if (t) {
                    c.dash(t.pos, 100);
                    dmg(c, t, 50, "q");
                    t.debuffs.applySlow(0.4, 1.5);
                } else {
                    c.dash(c.at("q"), 100);
                }
            },
            // Hyper Charge / Lightning Field
            w: () => {
                if (!hammer) {
                    c.buffs.jayce_w = 3;
                    c.nextAttackBonus = Math.max(c.nextAttackBonus, 0.6);
                    return;
                }
                c.buffs.jayce_w = 3;
                pulse(c, 4, 0.5, () => {
                    for (const e of c.enemies(c.reach("w") + 2)) dmg(c, e, 14, "w");
                });
            },
            // Acceleration Gate / Thundering Blow
            e: () => {
                if (!hammer) {
                    c.shoot("jayce_e", "e", c.aim, { distance: 8 });
                    c.dash(v2.add(c.player.pos, v2.mul(c.aim, 8)), 70);
                    return;
                }
                const t = c.nearest(c.reach("e") + 3);
                if (!t) return false;
                dmg(c, t, 40, "e");
                shove(t, awayFrom(c, t, 8), 55);
            },
            // Transform: a blast as the gun changes form
            r: () => {
                hammer = !hammer;
                c.buffs.jayce_r = 5;
                c.shoot("jayce_q", "r", c.aim, { mult: 0.6 });
                if (hammer) c.dash(v2.add(c.player.pos, v2.mul(c.aim, 5)), 70);
                else c.addShield(30);
            },
        };
    },

    jhin: (c) => ({
        // Dancing Grenade: bounces to a fresh enemy up to four times
        q: () => {
            const t = c.nearest(c.reach("q"));
            if (!t) return false;
            const hit = new Set<Player>();
            const bounce = (from: Vec2, n: number) => {
                const next =
                    c.enemies(14, from).filter((e) => !hit.has(e)).sort((a, b) =>
                        v2.distance(a.pos, from) - v2.distance(b.pos, from)
                    )[0];
                if (!next || n >= 4) return;
                hit.add(next);
                c.shoot("jhin_q", "q", v2.sub(next.pos, from), { from, homing: next, mult: 1 + n * 0.25 });
                c.later(0.25, () => bounce(v2.copy(next.pos), n + 1));
            };
            bounce(c.player.pos, 0);
        },
        // Deadly Flourish: a rooting shot from across the map
        w: () => {
            c.shoot("jhin_w", "w");
            const t = c.lineHit(c.reach("w"), 1.4)[0];
            if (!t) return;
            dmg(c, t, 70, "w");
            t.debuffs.root = Math.max(t.debuffs.root, 1.5);
        },
        // Captive Audience: a trap that snaps shut on whoever steps in
        e: () => {
            const pos = c.at("e");
            lob(c, "jhin_e", "e", pos, 60);
            c.traps.push({ pos, arm: 0.6, life: 25, kind: "snap" });
            const snaps = c.traps.filter((t) => t.kind === "snap");
            if (snaps.length > 3) c.traps.splice(c.traps.indexOf(snaps[0]), 1);
        },
        // Curtain Call: four rounds down the aim line, the fourth the heaviest
        r: () => {
            const dir = c.aim;
            c.player.debuffs.root = Math.max(c.player.debuffs.root, 2.8);
            c.buffs.jhin_r = 2.8;
            for (let i = 0; i < 4; i++) {
                c.later(i * 0.7, () => c.shoot("jhin_r", "r", dir, { mult: i === 3 ? 2 : 1 }));
            }
        },
    }),

    ksante: (c) => {
        let thrusts = 0;
        return {
            // Ntofo Strikes: two thrusts, then a knock-up that carries him in
            q: () => {
                thrusts++;
                const third = thrusts >= 3;
                if (third) thrusts = 0;
                if (third) c.dash(v2.add(c.player.pos, v2.mul(c.aim, 6)), 80);
                for (const e of c.lineHit(c.reach("q") + 1, 1.8)) {
                    dmg(c, e, third ? 70 : 40, "q");
                    e.debuffs.applySlow(0.3, 1);
                    if (third) e.debuffs.airborne += 0.8;
                }
                c.buffs.ksante_q = 3;
            },
            // Path Maker: a charge that throws enemies back
            w: () => {
                const to = c.at("w");
                c.dash(to, 70);
                c.later(v2.distance(to, c.player.pos) / 70 + 0.05, () => {
                    for (const e of c.enemies(5, to)) {
                        dmg(c, e, 45, "w");
                        shove(e, awayFrom(c, e, 8), 45);
                    }
                });
            },
            // Footwork: a dash that shields
            e: () => {
                c.dash(c.at("e"), 70);
                c.addShield(40);
                c.buffs.ksante_e = 3;
            },
            // All Out: throws a target away and hits harder for a while
            r: () => {
                const t = c.nearest(8);
                if (!t) return false;
                dmg(c, t, 80, "r");
                shove(t, awayFrom(c, t, 14), 55);
                t.debuffs.airborne += 0.6;
                c.buffs.ksante_r = 8;
                c.nextAttackBonus = Math.max(c.nextAttackBonus, 0.6);
            },
        };
    },

    kaisa: (c) => ({
        // Icathian Rain: six missiles, spread over the nearest enemies
        q: () => {
            const targets = c.enemies(c.reach("q") + 8);
            for (let i = 0; i < 6; i++) {
                const t = targets[i % Math.max(targets.length, 1)];
                const dir = t ? toward(c, t.pos) : v2.rotate(c.aim, (i - 2.5) * 0.15);
                c.shoot("kaisa_q", "q", dir, { homing: t });
            }
        },
        // Void Seeker: a long shot that slows
        w: () => {
            c.shoot("kaisa_w", "w");
            for (const e of c.lineHit(c.reach("w"), 1.5)) e.debuffs.applySlow(0.4, 2);
        },
        // Supercharge: fast, with quick attacks
        e: () => {
            c.buffs.excited = 3;
            c.buffs.kaisa_e = 3;
        },
        // Killer Instinct: jumps beside a far enemy with a shield
        r: () => {
            const t = c.nearest(60);
            if (!t) return false;
            c.dash(awayFrom(c, t, -4), 120);
            c.addShield(80);
            c.buffs.kaisa_r = 2;
        },
    }),

    kalista: (c) => {
        const stuck = new Map<number, number>();
        const stick = (e: Player) => stuck.set(e.__id, (stuck.get(e.__id) ?? 0) + 1);
        return {
            // Pierce: a spear through everything in line
            q: () => {
                c.shoot("kalista_q", "q");
                for (const e of c.lineHit(c.reach("q"), 1.5)) stick(e);
            },
            // Sentinel: sets a scout that sees far
            w: () => {
                const at = c.cursor(40);
                lob(c, "kalista_w", "w", at, 60);
                c.buffs.hawkshot = 6;
            },
            // Rend: tears out every spear, hurting more the more are in
            e: () => {
                for (const e of c.enemies(c.reach("e"))) {
                    const n = (stuck.get(e.__id) ?? 0) + 1;
                    stuck.delete(e.__id);
                    dmg(c, e, 20 + 15 * n, "e");
                    e.debuffs.applySlow(0.5, 1.5);
                }
            },
            // Fate's Call: flings her bound ally and knocks everyone around her up
            r: () => {
                c.addShield(60);
                c.buffs.kalista_r = 4;
                for (const e of c.enemies(c.reach("r"))) {
                    dmg(c, e, 40, "r");
                    e.debuffs.airborne += 0.8;
                }
            },
        };
    },

    karma: (c) => {
        let mantra = false;
        const empowered = () => {
            if (!mantra || !c.buff("karma_r")) return false;
            mantra = false;
            return true;
        };
        return {
            // Inner Flame: a bolt that bursts, a mantra bolt leaves a slowing patch
            q: () => {
                const big = empowered();
                c.shoot("karma_q", "q", c.aim, { mult: big ? 1.5 : 1 });
                if (big) {
                    const at = v2.add(c.player.pos, v2.mul(c.aim, 20));
                    c.later(0.4, () => {
                        for (const e of c.enemies(4, at)) {
                            dmg(c, e, 40, "q");
                            e.debuffs.applySlow(0.5, 2);
                        }
                    });
                }
            },
            // Focused Resolve: a tether that roots if it holds
            w: () => {
                const big = empowered();
                const t = c.nearest(c.reach("w"));
                if (!t) return false;
                c.shoot("karma_w", "w", toward(c, t.pos), { homing: t });
                dmg(c, t, 30, "w");
                c.heal(big ? 40 : 20);
                c.later(big ? 1 : 1.8, () => {
                    if (t.dead || v2.distance(t.pos, c.player.pos) > c.reach("w") + 6) return;
                    dmg(c, t, 25, "w");
                    t.debuffs.root = Math.max(t.debuffs.root, big ? 1.8 : 1.2);
                });
            },
            // Inspire: a shield with a burst of speed
            e: () => {
                const big = empowered();
                c.addShield(big ? 90 : 60);
                c.buffs.karma_e = 3;
                c.buffs.excited = 2;
                if (big) { for (const e of c.enemies(6)) dmg(c, e, 20, "e"); }
            },
            // Mantra: the next spell is stronger
            r: () => {
                mantra = true;
                c.buffs.karma_r = 8;
                c.heal(15);
            },
        };
    },

    karthus: (c) => ({
        // Lay Waste: two blasts on the same spot
        q: () => {
            const at = c.at("q");
            lob(c, "karthus_q", "q", at, 120);
            for (const delay of [0.4, 0.9]) {
                c.later(delay, () => {
                    const hits = c.enemies(3.5, at);
                    for (const e of hits) dmg(c, e, hits.length > 1 ? 30 : 45, "q");
                });
            }
        },
        // Wall of Pain: a wall that slows what crosses it
        w: () => {
            const at = c.at("w");
            const side = v2.perp(c.aim);
            lob(c, "karthus_w", "w", at, 120);
            c.buffs.karthus_w = 5;
            pulse(c, 10, 0.5, () => {
                for (const e of c.enemies(10, at)) {
                    const to = v2.sub(e.pos, at);
                    if (Math.abs(v2.dot(to, side)) <= 9 && Math.abs(v2.dot(to, c.aim)) <= 2) {
                        e.debuffs.applySlow(0.5, 0.8);
                    }
                }
            });
        },
        // Defile: a death aura around him
        e: () => {
            c.buffs.karthus_e = 5;
            pulse(c, 10, 0.5, () => {
                for (const e of c.enemies(7)) {
                    dmg(c, e, 9, "e");
                    e.debuffs.applySlow(0.2, 0.6);
                }
            });
        },
        // Requiem: three seconds of channel, then death across the map
        r: () => {
            c.buffs.karthus_r = 3;
            c.addShield(40);
            c.later(3, () => {
                for (const e of c.enemies(c.reach("r"))) dmg(c, e, 120, "r", true);
            });
        },
    }),

    kassadin: (c) => {
        let rifts = 0;
        return {
            // Null Sphere: a silencing orb that shields him
            q: () => {
                const t = c.nearest(c.reach("q"));
                if (!t) return false;
                c.shoot("kassadin_q", "q", toward(c, t.pos), { homing: t });
                t.debuffs.silence = Math.max(t.debuffs.silence, 1.5);
                c.addShield(40);
            },
            // Nether Blade: a blade that heals on the next hit
            w: () => {
                c.buffs.kassadin_w = 4;
                c.nextAttackBonus = Math.max(c.nextAttackBonus, 0.8);
                c.heal(20);
            },
            // Force Pulse: a cone that slows
            e: () => {
                fan(c, "kassadin_e", "e", 3, 50);
                for (const e of cone(c, c.reach("e"), 40)) {
                    dmg(c, e, 45, "e");
                    e.debuffs.applySlow(0.5, 1.5);
                }
            },
            // Riftwalk: teleports, hurting more with each jump in a row
            r: () => {
                if (!c.buff("kassadin_r")) rifts = 0;
                const to = c.at("r");
                c.dash(to, 400);
                c.buffs.kassadin_r = 6;
                const mult = 1 + 0.5 * rifts;
                rifts = Math.min(rifts + 1, 4);
                for (const e of c.enemies(4, to)) dmg(c, e, 50 * mult, "r");
            },
        };
    },

    katarina: (c) => {
        const daggers: Array<{ pos: Vec2; until: number }> = [];
        const drop = (pos: Vec2) => {
            const until = c.player.game.now + 4000;
            daggers.push({ pos: v2.copy(pos), until });
            if (daggers.length > 4) daggers.shift();
        };
        return {
            // Bouncing Blade: jumps to two more enemies, and lands on the ground
            q: () => {
                const first = c.nearest(c.reach("q"));
                if (!first) return false;
                const hit = new Set<Player>([first]);
                c.shoot("katarina_q", "q", toward(c, first.pos), { homing: first });
                dmg(c, first, 50, "q");
                drop(first.pos);
                let from = first.pos;
                for (let i = 1; i <= 2; i++) {
                    const next = c.enemies(12, from).find((e) => !hit.has(e));
                    if (!next) break;
                    hit.add(next);
                    const origin = v2.copy(from);
                    const target = next;
                    c.later(i * 0.25, () => {
                        c.shoot("katarina_q", "q", v2.sub(target.pos, origin), { from: origin, homing: target });
                        dmg(c, target, 30, "q");
                    });
                    from = next.pos;
                }
            },
            // Preparation: a dagger tossed up to land at her feet, and a burst of speed
            w: () => {
                drop(v2.add(c.player.pos, v2.mul(c.aim, 2)));
                c.buffs.excited = 2;
                c.buffs.katarina_w = 2;
            },
            // Shunpo: blinks to a dagger (and spins) or to an enemy
            e: () => {
                const now = c.player.game.now;
                const live = daggers.filter((d) => d.until > now && v2.distance(d.pos, c.player.pos) <= c.reach("e"));
                const dagger =
                    live.sort((a, b) => v2.distance(a.pos, c.player.pos) - v2.distance(b.pos, c.player.pos))[0];
                const t = c.nearest(c.reach("e"));
                const to = dagger ? v2.copy(dagger.pos) : t ? awayFrom(c, t, -1.5) : c.at("e");
                c.dash(to, 400);
                if (dagger) daggers.splice(daggers.indexOf(dagger), 1);
                for (const e of c.enemies(4, to)) dmg(c, e, dagger ? 55 : 35, "e");
            },
            // Death Lotus: a flurry of daggers on the three nearest
            r: () => {
                const to = c.player.pos;
                if (!c.nearest(c.reach("r"))) return false;
                c.buffs.katarina_r = 2.5;
                c.player.debuffs.root = Math.max(c.player.debuffs.root, 2.5);
                pulse(c, 10, 0.25, () => {
                    for (const e of c.enemies(c.reach("r"), to).slice(0, 3)) {
                        c.shoot("katarina_q", "r", v2.sub(e.pos, c.player.pos), { homing: e, mult: 0.4 });
                        dmg(c, e, 14, "r");
                    }
                });
            },
        };
    },

    // ranged Kayle: a ranged caster who becomes more dangerous the longer she lasts
    kayle: (c) => ({
        // Radiant Blast: two bolts, the second slows
        q: () => {
            c.shoot("kayle_q", "q", v2.rotate(c.aim, -0.04));
            c.later(0.2, () => c.shoot("kayle_q", "q", v2.rotate(c.aim, 0.04)));
            for (const e of c.lineHit(c.reach("q"), 1.8)) e.debuffs.applySlow(0.35, 2);
        },
        // Celestial Blessing: heals and speeds her
        w: () => {
            c.heal(40);
            c.buffs.kayle_w = 3;
            c.buffs.excited = 2;
        },
        // Starfire Spellblade: her next attack burns, and flame waves fly out
        e: () => {
            c.buffs.kayle_e = 5;
            c.nextAttackBonus = Math.max(c.nextAttackBonus, 0.8);
            fan(c, "kayle_e", "e", 3, 24);
        },
        // Divine Judgment: untouchable for a moment, then a nova of light
        r: () => {
            c.player.dodgeTime = 2;
            c.buffs.kayle_r = 2;
            c.addShield(50);
            c.later(2, () => {
                for (let i = 0; i < 8; i++) {
                    c.shoot("kayle_r", "r", v2.rotate(v2.create(1, 0), (i * Math.PI) / 4));
                }
            });
        },
    }),
};
