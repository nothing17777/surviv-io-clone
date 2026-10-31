import type { DeepPartial } from "../../utils/util.ts";
import type { BulletDef } from "./bulletDefs.ts";
import type { GunDef } from "./gunDefs.ts";
import type { MeleeDef } from "./meleeDefs.ts";

/**
 * What a Terraria / Pixel Gun 3D weapon does in its own game, in surviv terms.
 * scripts/genCustomWeapons.py picks one per weapon from its name.
 */
export interface GunEffect {
    /** changes to the base gun's bullet */
    bullet?: Partial<BulletDef>;
    /** multiplies the base bullet's damage */
    damageMult?: number;
    gun?: DeepPartial<GunDef>;
}

/** kept in the game but left out of the loadout dropdowns and the potato swap */
export const HiddenCustomGuns = new Set([
    "pg_apocalypse",
    "pg_armageddon",
    "pg_combat_rifle",
    "pg_crossbow",
    "pg_desert_eagle",
    "pg_dual_revolvers",
    "pg_grenade_launcher",
    "pg_heavy_sniper_rifle",
    "pg_laser_bow",
    "pg_machine_gun",
    "pg_napalmcannon",
    "pg_mega_destroyer",
    "pg_railgun",
    "pg_rocket_launcher",
    "pg_tesla_cannon",
    "pg_water_rifle",
    "pg_sniper_rifle",
    "pg_plasma_rifle",
    "pg_pixel_gun",
    "pg_shotgun",
    "pg_hand_gatling",
    "pg_double_barreled_shotgun",
    // melee: left out of the loadout dropdowns too
    "tr_meowmere",
    "tr_night_s_edge",
    "tr_star_wrath",
]);

export const GunEffects: Record<string, GunEffect> = {
    plain: {},
    // straight beam: near instant, goes through players and walls, drawn as a solid beam
    laser: {
        bullet: { pierce: true, beam: true, speed: 400, tracerColor: "cw_laser", tracerWidth: 0.2, falloff: 1 },
    },
    // railgun / gauss: one instant heavy beam through everything
    rail: {
        bullet: { pierce: true, beam: true, speed: 500, distance: 300, tracerColor: "cw_plasma", tracerWidth: 0.35 },
        damageMult: 1.6,
    },
    // Last Prism: six rainbow beams that close into one 3x beam over 3 seconds of firing
    prism: {
        bullet: {
            pierce: true,
            beam: true,
            speed: 400,
            distance: 70,
            falloff: 1,
            tracerColor: "cw_rainbow",
            tracerWidth: 0.25,
        },
        gun: {
            prismCharge: 3,
            fireMode: "auto",
            fireDelay: 0.1,
            shotSpread: 0,
            moveSpread: 0,
            maxClip: 200,
            maxReload: 200,
        },
    },
    // Pixel Gun 3D Excalibur: a minigun that spins up over about 1.5 s to 10 shots/s
    minigun: {
        gun: { spinUp: 1.45, fireDelay: 0.1, isMinigun: true },
    },
    // Heavy Sniper Rifle: shots go through players, losing damage on each
    sniper_pierce: {
        bullet: { playerPierce: true, pierceLoss: 0.25 },
    },
    // Tesla Cannon: slow, short range electric orbs that blow up in a shock
    shock: {
        bullet: {
            onHit: "explosion_cw_tesla",
            tracerColor: "cw_plasma",
            tracerWidth: 0.3,
            tracerLength: 0.3,
            speed: 40,
            distance: 45,
            sprite: "img/custom-weapons/fx/tesla_orb.png",
            spriteSize: 48,
            spin: 8,
        },
        damageMult: 0.7,
    },
    // flamethrowers: short range, a stream of fire that bursts on hit
    flame: {
        bullet: {
            onHit: "explosion_cw_fire",
            distance: 20,
            speed: 45,
            falloff: 1,
            tracerColor: "cw_flame",
            tracerWidth: 0.35,
            tracerLength: 0.4,
            flame: true,
            sprites: [
                "img/custom-weapons/fx/flame_1.png",
                "img/custom-weapons/fx/flame_2.png",
                "img/custom-weapons/fx/flame_3.png",
            ],
            spriteSize: 52,
        },
        damageMult: 0.6,
        gun: { shotSpread: 10, moveSpread: 12 },
    },
    // ice weapons: freeze whoever they hit for a moment
    frost: {
        bullet: { onHit: "explosion_cw_frost", tracerColor: "cw_frost", tracerWidth: 0.16, speed: 80 },
    },
    // acid, venom, toxic: splash that slows
    poison: {
        bullet: { onHit: "explosion_cw_poison", tracerColor: "cw_poison", tracerWidth: 0.16, speed: 75 },
        damageMult: 0.85,
    },
    // staves, spells and bee guns: slower shots that seek the nearest enemy you aim at
    magic: {
        bullet: { homing: true, speed: 55, distance: 70, falloff: 1, tracerColor: "cw_magic", tracerWidth: 0.22 },
    },
    // Dark Matter Generator: explosive orbs that leave a damaging vortex for a few seconds
    void: {
        bullet: {
            onHit: "explosion_cw_dark",
            linger: { explosion: "explosion_cw_vortex", duration: 3, interval: 0.5 },
            speed: 45,
            distance: 80,
            tracerColor: "cw_void",
            tracerWidth: 0.4,
            tracerLength: 0.4,
            sprite: "img/custom-weapons/fx/dark_orb.png",
            spriteSize: 56,
            spin: -5,
        },
        damageMult: 0.8,
    },
    // Nanobots Rifle: single shots of nanobot swarms that home in on enemies and burst in a small area
    nanobots: {
        bullet: {
            homing: true,
            speed: 75,
            distance: 120,
            falloff: 1,
            onHit: "explosion_cw_star",
            tracerColor: "cw_flame",
            tracerWidth: 0.3,
            tracerLength: 0.4,
            sprite: "img/custom-weapons/fx/tesla_orb.png",
            spriteSize: 32,
            spin: 12,
        },
        gun: { fireMode: "single", fireDelay: 0.35, maxClip: 6, maxReload: 6, extendedClip: 8, extendedReload: 8 },
    },
    // bows and crossbows: slow heavy arrows
    arrow: {
        bullet: { speed: 70, falloff: 1, tracerColor: "cw_arrow", tracerWidth: 0.12, tracerLength: 0.5 },
        damageMult: 1.3,
    },
    // bubble and water guns: slow, short bursts of water
    bubble: {
        bullet: { speed: 35, distance: 50, tracerColor: "cw_bubble", tracerWidth: 0.4, tracerLength: 0.3 },
    },
    // rocket and grenade launchers: a slow round that blows up like a frag
    rocket: {
        bullet: {
            onHit: "explosion_cw_rocket",
            speed: 45,
            distance: 90,
            falloff: 1,
            tracerColor: "cw_flame",
            tracerWidth: 0.4,
            tracerLength: 0.6,
            sprite: "img/custom-weapons/fx/rocket.png",
            spriteSize: 56,
        },
        damageMult: 0.5,
        // one rocket per 3 s reload, like Pixel Gun 3D
        gun: {
            maxClip: 1,
            maxReload: 1,
            extendedClip: 1,
            extendedReload: 1,
            reloadTime: 3,
            fireDelay: 0.5,
            bulletCount: 1,
            shotSpread: 1,
        },
    },
    // Multitaskers: fast fire rate, 32 dmg per shot, splash dmg, 30 capacity, fast mobility
    multitaskers: {
        bullet: {
            damage: 32,
            speed: 120,
            distance: 70,
            onHit: "explosion_cw_multitaskers",
            // a cyan Phantasmal Deathray head, round end first, with a thin cyan trail
            tracerColor: "cw_plasma",
            tracerWidth: 0.12,
            sprite: "img/custom-weapons/fx/deathray.png",
            spriteSize: 48,
        },
        gun: {
            fireMode: "auto",
            // 4.3 shots/s
            fireDelay: 0.233,
            maxClip: 30,
            maxReload: 30,
            extendedClip: 30,
            extendedReload: 30,
            shotSpread: 3,
            moveSpread: 4,
            speed: { equip: 3.5, attack: 1 },
        },
    },
    // Fake Pistol: the Multitaskers' speed and range, no splash, and the base pistol's own bullet look (no sprite
    // or tracer override); its damage, pellets, fire rate and capacity are in GunOverrides
    pistol_plasma: {
        bullet: {
            damage: 32,
            speed: 120,
            distance: 70,
        },
        gun: {
            fireMode: "auto",
            fireDelay: 0.233,
            maxClip: 30,
            maxReload: 30,
            extendedClip: 30,
            extendedReload: 30,
            shotSpread: 3,
            moveSpread: 4,
            speed: { equip: 3.5, attack: 1 },
        },
    },
    // Christmas Ultimatum: 6 capacity, 150 dmg direct hit, cluster bomb whose frags split again, -20% dmg per split
    christmas_ultimatum: {
        bullet: {
            damage: 150,
            speed: 55,
            distance: 50,
            falloff: 1,
            onHit: "explosion_cw_christmas_tree_1",
            sprite: "img/custom-weapons/fx/xmas_tree.png",
            spriteSize: 80,
            noTracer: true,
            tracerColor: "cw_flame",
            tracerWidth: 0.35,
        },
        gun: {
            maxClip: 6,
            maxReload: 6,
            extendedClip: 6,
            extendedReload: 6,
            reloadTime: 2.4,
            // 0.7 shots/s
            fireDelay: 1.43,
            bulletCount: 1,
            shotSpread: 1,
        },
    },
    // Judge: 1 capacity, 250 dmg direct hit, controllable orange rocket up to 400 tiles
    judge: {
        bullet: {
            damage: 250,
            speed: 32,
            distance: 400,
            falloff: 1,
            onHit: "explosion_cw_judge",
            sprite: "img/custom-weapons/fx/judge_rocket.png",
            spriteSize: 64,
            tracerColor: "cw_flame",
            tracerWidth: 0.45,
        },
        gun: {
            maxClip: 1,
            maxReload: 1,
            extendedClip: 1,
            extendedReload: 1,
            reloadTime: 3.0,
            fireDelay: 1.0,
            bulletCount: 1,
            shotSpread: 0,
        },
    },
    // Frozen Dragon: flamethrower with blue flames, 12 dmg per hit, 60 capacity, fast fire rate, slow & burn for 2s
    frozen_dragon: {
        bullet: {
            damage: 17,
            speed: 55,
            distance: 38,
            falloff: 1,
            onHit: "explosion_cw_frozen_dragon",
            // burns through everyone in its path and stops at the first wall
            playerPierce: true,
            pierceLoss: 0,
            tracerColor: "cw_frost",
            tracerWidth: 0.35,
            tracerLength: 0.4,
            noTracer: true,
            sprite: "img/custom-weapons/fx/frost_wave.png",
            // a bit smaller than the Christmas Ultimatum tree (80)
            spriteSize: 60,
        },
        gun: {
            fireMode: "auto",
            // 10 shots/s
            fireDelay: 0.1,
            maxClip: 60,
            maxReload: 60,
            extendedClip: 60,
            extendedReload: 60,
            shotSpread: 8,
            moveSpread: 10,
            sound: { shoot: "vss_01" },
        },
    },
};

/** tweaks to one weapon on top of its effect, from its wiki page */
export const GunOverrides: Record<string, GunEffect> = {
    // Fake Pistol: a shotgun pistol like the Ultimatum's pellets and spread: 12 pellets x 15 dmg, 1.2 shots/s, 8 rounds,
    // bleeds for 3 s (see Player.damage)
    pg_fake_pistol: {
        bullet: { damage: 15 },
        gun: {
            fireDelay: 0.833,
            bulletCount: 12,
            shotSpread: 3,
            moveSpread: 5,
            maxClip: 8,
            maxReload: 8,
            extendedClip: 8,
            extendedReload: 8,
        },
    },
    // Phantom Dancer: attack speed item, fires faster than the vector
    lol_phantom_dancer: { gun: { fireDelay: 0.06 } },
    // The Collector: executes, so it hits hard
    lol_the_collector: { bullet: { damage: 38 } },
    // purple lasers, 5 shots/s
    pg_laser_minigun: {
        bullet: { damage: 22, tracerColor: "cw_magic" },
        gun: { fireDelay: 0.2, maxClip: 75, maxReload: 75, extendedClip: 75, extendedReload: 75 },
    },
    // Hellraiser: plain bullets at twice the flame range, 8.5 shots/s
    pg_hellraiser: {
        bullet: {
            damage: 14,
            distance: 40,
            speed: 100,
            onHit: undefined,
            flame: false,
            sprites: undefined,
            tracerColor: "762mm",
            tracerWidth: 0.1,
            tracerLength: 0.8,
        },
        gun: {
            fireMode: "auto",
            fireDelay: 0.118,
            maxClip: 35,
            maxReload: 35,
            extendedClip: 35,
            extendedReload: 35,
            shotSpread: 3,
            moveSpread: 5,
        },
    },
    // 1.2 shots/s, pellets spread a bit wider
    pg_acid_shotgun: { gun: { fireDelay: 0.833, shotSpread: 12 } },
    // Excalibur minigun: 70 capacity, 21 dmg
    pg_excalibur: { bullet: { damage: 21 }, gun: { maxClip: 70, maxReload: 70, extendedClip: 70, extendedReload: 70 } },
    // 2.14 shots/s, 12 capacity, 24 dmg (the orb's blast is its splash)
    pg_dark_matter_generator: {
        // a spinning Nebula Arcanum orb with a slight splash (no lingering vortex)
        bullet: {
            damage: 24,
            sprite: "img/custom-weapons/fx/nebula_orb.png",
            // spriteSize is screen px at zoom 1 (the Christmas Ultimatum tree is 80), not world units
            spriteSize: 64,
            noTracer: true,
            onHit: "explosion_cw_dmg_splash",
            linger: undefined,
        },
        gun: { fireMode: "single", fireDelay: 0.467, maxClip: 12, maxReload: 12, extendedClip: 12, extendedReload: 12 },
    },
    // Gauss: stops at walls but still goes through enemies; 0.7317 shots/s, 6 capacity
    pg_gauss_cannon: {
        bullet: { pierce: false, playerPierce: true, pierceLoss: 0 },
        gun: { fireMode: "single", fireDelay: 1.367, maxClip: 6, maxReload: 6, extendedClip: 6, extendedReload: 6 },
    },
    // 0.88 shots/s, 29 dmg
    pg_nanobots_rifle: { bullet: { damage: 29 }, gun: { fireDelay: 1.136 } },
    // Photon: a fast orange bullet (no beam, stops at walls), 91 dmg, 0.7 shots/s, burns for 4 s
    pg_photon_sniper_rifle: {
        bullet: { damage: 91, pierce: false, beam: false, speed: 160, tracerColor: "cw_flame", tracerWidth: 0.2 },
        gun: { fireMode: "single", fireDelay: 1.43 },
    },
    // red beam
    pg_railgun: { bullet: { tracerColor: "cw_laser" } },
    // "insanely fast" (use time 5, about 12 shots/s) with shots that light up their path
    tr_sdmg: { gun: { fireDelay: 0.08 }, bullet: { tracerColor: "cw_plasma", tracerWidth: 0.14 } },
    // Ultimatum: a sniper-like shotgun whose 12 pellets go through walls and enemies; never reloads
    pg_ultimatum: {
        // 12 x 30: a near one-shot even if some pellets miss
        bullet: {
            damage: 30,
            pierce: true,
            speed: 200,
            distance: 55,
            falloff: 0.8,
            tracerColor: "cw_plasma",
            tracerWidth: 0.14,
        },
        gun: {
            bulletCount: 12,
            shotSpread: 3,
            moveSpread: 5,
            // ammo is sent as one byte, so 250 is about as big as a clip gets
            maxClip: 250,
            maxReload: 250,
            extendedClip: 250,
            extendedReload: 250,
            ammoInfinite: true,
            // 0.375 shots/s
            fireDelay: 2.67,
        },
    },
    // two barrels: two big blasts, then reload
    pg_double_barreled_shotgun: {
        gun: { maxClip: 2, maxReload: 2, extendedClip: 2, extendedReload: 2, fireDelay: 0.25 },
        damageMult: 1.3,
    },
    // napalm: the blast leaves fire burning on the ground for a few seconds
    pg_napalmcannon: {
        bullet: { linger: { explosion: "explosion_cw_fire", duration: 3, interval: 0.4 }, tracerColor: "cw_flame" },
    },
    // a stream of water
    pg_water_rifle: { gun: { fireMode: "auto", fireDelay: 0.09 } },
    // Mercenary: bursts of 5 red bullets (10 shots/s on average), 15 dmg, 35 rounds, burns
    pg_mercenary: {
        bullet: { damage: 15, tracerColor: "cw_laser", tracerWidth: 0.14 },
        gun: {
            fireMode: "burst",
            burstCount: 5,
            burstDelay: 0.04,
            fireDelay: 0.3,
            maxClip: 35,
            maxReload: 35,
            extendedClip: 35,
            extendedReload: 35,
            shotSpread: 1,
            moveSpread: 2,
        },
    },
    // Laser Cycler: a blue laser bolt that bounces off walls, 60 dmg, 1.57 shots/s, 12 rounds
    pg_laser_cycler: {
        bullet: {
            damage: 60,
            speed: 160,
            distance: 120,
            falloff: 1,
            bounce: true,
            maxBounces: 3,
            tracerColor: "cw_plasma",
            tracerWidth: 0.3,
            tracerLength: 1.2,
        },
        gun: { fireMode: "single", fireDelay: 0.637, maxClip: 12, maxReload: 12, extendedClip: 12, extendedReload: 12 },
    },
    // Engineer Exoskeleton: a stream of red lasers through enemies (not walls), 12 dmg, 15 shots/s,
    // 80 rounds, heals the damage it deals
    pg_engineer_exoskeleton: {
        bullet: {
            damage: 12,
            beam: true,
            speed: 300,
            distance: 80,
            falloff: 1,
            playerPierce: true,
            pierceLoss: 0,
            // steel and other reflective walls stop it instead of bouncing it back
            noReflect: true,
            tracerColor: "cw_laser",
            tracerWidth: 0.25,
        },
        gun: {
            fireMode: "auto",
            fireDelay: 0.0667,
            maxClip: 80,
            maxReload: 80,
            extendedClip: 80,
            extendedReload: 80,
            shotSpread: 1,
            moveSpread: 2,
        },
    },
    // Aphrodite Crossbow: 3 pink arrows in a fixed cone, 80 dmg each, 0.94 shots/s, 10 rounds, charms
    pg_aphrodite_crossbow: {
        bullet: { damage: 80, tracerColor: "cw_rainbow", tracerWidth: 0.14 },
        gun: {
            fireMode: "single",
            fireDelay: 1.064,
            bulletCount: 3,
            fanShot: true,
            shotSpread: 14,
            moveSpread: 0,
            maxClip: 10,
            maxReload: 10,
            extendedClip: 10,
            extendedReload: 10,
        },
    },
    // Goo Substance Rifle: green goo blobs, 22 dmg + 2 s poison, 8.5 shots/s, 40 rounds
    pg_goo_substance_rifle: {
        bullet: {
            damage: 22,
            tracerColor: "cw_poison",
            tracerWidth: 0.2,
            sprite: "img/custom-weapons/fx/goo_bomb.png",
            spriteSize: 32,
        },
        gun: { fireMode: "auto", fireDelay: 0.118, maxClip: 40, maxReload: 40, extendedClip: 40, extendedReload: 40 },
    },
    // Minigun Shotgun: 12 pellets x 6 dmg in an Ultimatum-tight spread, 3.33 shots/s, 15 rounds, no windup
    pg_minigun_shotgun: {
        bullet: { damage: 6 },
        gun: {
            fireMode: "auto",
            fireDelay: 0.3,
            bulletCount: 12,
            shotSpread: 3,
            moveSpread: 5,
            maxClip: 15,
            maxReload: 15,
            extendedClip: 15,
            extendedReload: 15,
        },
    },
    // Portalium laser: purple, 0.8108 shots/s
    pg_prototype: { bullet: { damage: 200, tracerColor: "cw_magic" }, gun: { fireDelay: 1.233 } },
};

/** melee in surviv terms: all swing like a katana, these change how hard, fast and far */
export const MeleeEffects: Record<string, DeepPartial<MeleeDef>> = {
    // swords, sabers
    sword: {},
    // claymores, hammers, axes, big blades: slow and heavy
    heavy: { damage: 60, obstacleDamage: 2.5, attack: { cooldownTime: 0.7, rad: 2.4 } },
    // daggers, knives, shortswords, fists: quick jabs
    quick: { damage: 24, cleave: false, attack: { cooldownTime: 0.25, rad: 1.5, damageTimes: [0.1] } },
    // spears, lances, yoyos, flails, boomerangs: hit far away
    reach: { damage: 34, attack: { offset: { x: 3.5, y: 0 }, rad: 2.2, cooldownTime: 0.5 } },
    // terra blade, starfury, zenith...: shoot or summon something with each swing, so they hit far and hard
    legendary: { damage: 55, armorPiercing: true, attack: { offset: { x: 3, y: 0 }, rad: 3, cooldownTime: 0.4 } },
    // Heroic Epee: 30 dmg, fast mobility, 12 hp/s heal while holding
    heroic_epee: {
        damage: 30,
        speed: { equip: 1.25, attack: 1.05 },
        attack: { offset: { x: 2.2, y: 0 }, rad: 2.4, cooldownTime: 0.35 },
    },
    // Sundered Sky: 40 dmg, heal 40 health on hit
    sundered_sky: { damage: 40, attack: { offset: { x: 2.6, y: 0 }, rad: 2.8, cooldownTime: 0.45 } },
    // Power Fists: 45 dmg, 1.3 punches/s, 10 shield/s (up to 200) while held; a natural one-two punch
    power_fists: {
        damage: 45,
        cleave: false,
        attack: { offset: { x: 1.5, y: 0 }, rad: 1.6, damageTimes: [0.1], cooldownTime: 0.77 },
        anim: { idlePose: "fists", attackAnims: ["fists", "fists"] },
    },
    // Eclipse: 60 dmg, gain a 50 hp shield every second hit
    eclipse: { damage: 60, attack: { offset: { x: 2.4, y: 0 }, rad: 2.6, cooldownTime: 0.5 } },
};

/** how long each base gun is drawn in hand, in sprite units */
export const BaseGunLengths: Record<string, number> = {
    deagle: 32,
    vector: 38,
    famas: 44,
    m870: 46,
    saiga: 46,
    ak47: 48,
    svd: 54,
    mosin: 54,
    sv98: 56,
    m249: 52,
    barrett: 56,
    potato_cannon: 52,
};

/** tweaks to one melee weapon, from its wiki page */
export const MeleeOverrides: Record<string, DeepPartial<MeleeDef>> = {
    // Terraria swords swing over and over while you hold, sweeping a wide arc around you that hits
    // everything in it. Swing time is the wiki's use time / 60 s; damage scales with its wiki damage.
    tr_terra_blade: { damage: 38, autoAttack: true, attack: { offset: { x: 1.4, y: 0 }, rad: 3, cooldownTime: 0.3 } },
    // a purple aura past the blade, and a second one toward the cursor: no flying projectile
    tr_night_s_edge: {
        damage: 34,
        autoAttack: true,
        attack: { offset: { x: 1.8, y: 0 }, rad: 3.2, cooldownTime: 0.42 },
    },
    // a big yellow aura reaching about twice the blade's length
    tr_excalibur: { damage: 42, autoAttack: true, attack: { offset: { x: 2.2, y: 0 }, rad: 3.6, cooldownTime: 0.33 } },
    tr_meowmere: { damage: 46, autoAttack: true, attack: { offset: { x: 1.4, y: 0 }, rad: 3, cooldownTime: 0.23 } },
    tr_star_wrath: { damage: 44, autoAttack: true, attack: { offset: { x: 1.4, y: 0 }, rad: 3, cooldownTime: 0.27 } },
    // damage cut by 30%
    tr_zenith: { damage: 35, autoAttack: true, attack: { offset: { x: 1.4, y: 0 }, rad: 3, cooldownTime: 0.5 } },
};

/** the glowing aura drawn around each swing, as in Terraria */
export const SwingArcs: Record<string, string> = {
    tr_terra_blade: "img/custom-weapons/fx/arc_terra.png",
    tr_night_s_edge: "img/custom-weapons/fx/arc_purple.png",
    tr_excalibur: "img/custom-weapons/fx/arc_gold.png",
    tr_meowmere: "img/custom-weapons/fx/arc_rainbow.png",
    tr_star_wrath: "img/custom-weapons/fx/arc_pink.png",
    tr_zenith: "img/custom-weapons/fx/arc_rainbow.png",
    kit_wolverine_claws: "img/custom-weapons/fx/arc_claws.png",
};

/** what a sword fires with each swing in its own game */
export interface SwingShot {
    bullet: string;
    count?: number;
    /** degrees between shots when count > 1 */
    spread?: number;
    /** falls onto the aim point from off screen, like Star Wrath's stars */
    fromSky?: boolean;
    /** a boomerang that turns back right at the cursor, like Zenith's swords */
    toCursor?: boolean;
    /** extra shots fired alongside, offset sideways by these many units, so a wide wave hits along its width */
    lanes?: { bullet: string; offsets: number[] };
}

export const SwingShots: Record<string, SwingShot> = {
    // the Summoner's whip lashes a chain out 10 tiles
    kit_summoner_whip: { bullet: "bullet_kit_whip" },
    // a fast green slash that goes through enemies (losing 25% each) and stops at walls
    tr_terra_blade: {
        bullet: "bullet_cw_terra_beam",
        lanes: { bullet: "bullet_cw_terra_beam_edge", offsets: [-4.5, -2.25, 2.25, 4.5] },
    },
    // a cat head with a rainbow trail that bounces 4 times, blowing up bigger each bounce
    tr_meowmere: { bullet: "bullet_cw_meowmere_cat" },
    // three pink stars fall onto where you aim
    tr_star_wrath: { bullet: "bullet_cw_star", count: 3, spread: 3, fromSky: true },
    // a swarm of 100 mini Zeniths rush to the cursor anywhere on screen (locking onto an enemy near it),
    // then fly back, cutting through walls and everyone both ways
    tr_zenith: { bullet: "bullet_cw_zenith_sword", count: 100, spread: 0.6, toCursor: true },
};

const swingBullet = (b: Partial<BulletDef>): BulletDef => ({
    type: "bullet",
    damage: 25,
    obstacleDamage: 1,
    falloff: 1,
    distance: 40,
    speed: 50,
    variance: 0,
    shrapnel: false,
    tracerColor: "cw_magic",
    tracerWidth: 0.7,
    tracerLength: 0.35,
    noDistAdj: true,
    ...b,
});

export const SwingShotBullets: Record<string, BulletDef> = {
    // a big curved wave of green energy (increased width)
    bullet_cw_terra_beam: swingBullet({
        damage: 34,
        distance: 45,
        speed: 60,
        playerPierce: true,
        pierceLoss: 0.25,
        // only the Terra Beam image, no green tracer block over it
        noTracer: true,
        tracerColor: "cw_terra",
        tracerWidth: 1.2,
        // the Terra Beam with a light glow so it reads on grass
        sprite: "img/custom-weapons/fx/terra_beam_proj.png",
        // a bit smaller than the Christmas Ultimatum tree (80)
        spriteSize: 60,
    }),
    // the rest of the wave's width: hits, but draws nothing (the crescent covers it)
    bullet_cw_terra_beam_edge: swingBullet({
        damage: 34,
        distance: 45,
        speed: 60,
        playerPierce: true,
        pierceLoss: 0.25,
        tracerColor: "invis",
        tracerWidth: 0,
    }),
    bullet_cw_meowmere_cat: swingBullet({
        damage: 30,
        distance: 60,
        speed: 45,
        playerPierce: true,
        bounce: true,
        maxBounces: 4,
        bounceExplosions: [
            "explosion_cw_rainbow_1",
            "explosion_cw_rainbow_2",
            "explosion_cw_rainbow_3",
            "explosion_cw_rainbow_4",
        ],
        tracerColor: "cw_rainbow",
        tracerWidth: 0.45,
        sprite: "img/custom-weapons/fx/cat.png",
        spriteSize: 40,
    }),
    bullet_cw_star: swingBullet({
        damage: 26,
        speed: 80,
        onHit: "explosion_cw_star",
        tracerColor: "cw_star",
        tracerWidth: 0.4,
        tracerLength: 0.8,
        sprite: "img/custom-weapons/fx/star.png",
        spriteSize: 40,
        spin: 10,
    }),
    bullet_cw_zenith_sword: swingBullet({
        // 100 of them: the old 6 x 30 total, cut by 30%, spread over the swarm
        damage: 1.3,
        distance: 140,
        speed: 100,
        pierce: true,
        boomerang: true,
        // swirls in a loop round the cursor before coming back
        orbit: { radius: 3.5, turns: 1 },
        spin: 18,
        // just the spinning mini Zenith, no trail line
        noTracer: true,
        tracerColor: "cw_rainbow",
        tracerWidth: 0.25,
        tracerLength: 1.4,
        sprite: "img/custom-weapons/world/tr_zenith.png",
        // a bit smaller than the Christmas Ultimatum tree (80)
        spriteSize: 60,
    }),
    bullet_cw_christmas_tree_frag: swingBullet({
        damage: 0,
        speed: 50,
        distance: 18,
        onHit: "explosion_cw_christmas_tree_2",
        sprite: "img/custom-weapons/fx/xmas_tree.png",
        spriteSize: 55,
        noTracer: true,
        tracerColor: "cw_flame",
        tracerWidth: 0.25,
    }),
    bullet_cw_christmas_tree_subfrag: swingBullet({
        damage: 0,
        speed: 40,
        distance: 12,
        onHit: "explosion_cw_christmas_tree_3",
        sprite: "img/custom-weapons/fx/xmas_tree.png",
        spriteSize: 40,
        noTracer: true,
        tracerColor: "cw_flame",
        tracerWidth: 0.2,
    }),
};
