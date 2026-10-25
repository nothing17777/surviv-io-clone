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
        bullet: { pierce: true, beam: true, speed: 400, distance: 70, falloff: 1, tracerColor: "cw_rainbow", tracerWidth: 0.25 },
        gun: { prismCharge: 3, fireMode: "auto", fireDelay: 0.1, shotSpread: 0, moveSpread: 0, maxClip: 200, maxReload: 200 },
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
            spriteSize: 2.2,
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
            sprites: ["img/custom-weapons/fx/flame_1.png", "img/custom-weapons/fx/flame_2.png", "img/custom-weapons/fx/flame_3.png"],
            spriteSize: 2.6,
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
            spriteSize: 2.4,
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
            spriteSize: 1.2,
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
            spriteSize: 2.6,
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
            tracerColor: "cw_flame",
            tracerWidth: 0.22,
        },
        gun: {
            fireMode: "auto",
            fireDelay: 0.08,
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
            spriteSize: 2.5,
            tracerColor: "cw_flame",
            tracerWidth: 0.35,
        },
        gun: {
            maxClip: 6,
            maxReload: 6,
            extendedClip: 6,
            extendedReload: 6,
            reloadTime: 2.4,
            fireDelay: 0.6,
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
            spriteSize: 2.8,
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
            damage: 12,
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
            flame: true,
            sprites: [
                "img/custom-weapons/fx/frost_flame_1.png",
                "img/custom-weapons/fx/frost_flame_2.png",
                "img/custom-weapons/fx/frost_flame_3.png",
            ],
            spriteSize: 3,
        },
        gun: {
            fireMode: "auto",
            fireDelay: 0.075,
            maxClip: 60,
            maxReload: 60,
            extendedClip: 60,
            extendedReload: 60,
            shotSpread: 8,
            moveSpread: 10,
        },
    },
};

/** tweaks to one weapon on top of its effect, from its wiki page */
export const GunOverrides: Record<string, GunEffect> = {
    // purple lasers
    pg_laser_minigun: { bullet: { tracerColor: "cw_magic" } },
    // red beam
    pg_railgun: { bullet: { tracerColor: "cw_laser" } },
    // "insanely fast" (use time 5, about 12 shots/s) with shots that light up their path
    tr_sdmg: { gun: { fireDelay: 0.08 }, bullet: { tracerColor: "cw_plasma", tracerWidth: 0.14 } },
    // Ultimatum: a sniper-like shotgun whose 12 pellets go through walls and enemies; never reloads
    pg_ultimatum: {
        // 12 x 30: a near one-shot even if some pellets miss
        bullet: { damage: 30, pierce: true, speed: 200, distance: 55, falloff: 0.8, tracerColor: "cw_plasma", tracerWidth: 0.14 },
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
            fireDelay: 1,
        },
    },
    // two barrels: two big blasts, then reload
    pg_double_barreled_shotgun: { gun: { maxClip: 2, maxReload: 2, extendedClip: 2, extendedReload: 2, fireDelay: 0.25 }, damageMult: 1.3 },
    // napalm: the blast leaves fire burning on the ground for a few seconds
    pg_napalmcannon: {
        bullet: { linger: { explosion: "explosion_cw_fire", duration: 3, interval: 0.4 }, tracerColor: "cw_flame" },
    },
    // a stream of water
    pg_water_rifle: { gun: { fireMode: "auto", fireDelay: 0.09 } },
    // Portalium laser: blue
    pg_prototype: { bullet: { damage: 200, tracerColor: "cw_plasma" } },
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
    // whips: long range lash (10 tiles, 20 dmg)
    // whips: the swing itself only reaches arm's length, the lash (a swing shot) does the long range
    whip: { damage: 35, autoAttack: true, attack: { offset: { x: 2.5, y: 0 }, rad: 2, cooldownTime: 1.15 } },
    // Heroic Epee: 30 dmg, fast mobility, 12 hp/s heal while holding
    heroic_epee: { damage: 30, speed: { equip: 1.25, attack: 1.05 }, attack: { offset: { x: 2.2, y: 0 }, rad: 2.4, cooldownTime: 0.35 } },
    // Sundered Sky: 40 dmg, heal 40 health on hit
    sundered_sky: { damage: 40, attack: { offset: { x: 2.6, y: 0 }, rad: 2.8, cooldownTime: 0.45 } },
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
    tr_night_s_edge: { damage: 34, autoAttack: true, attack: { offset: { x: 1.8, y: 0 }, rad: 3.2, cooldownTime: 0.42 } },
    // a big yellow aura reaching about twice the blade's length
    tr_excalibur: { damage: 42, autoAttack: true, attack: { offset: { x: 2.2, y: 0 }, rad: 3.6, cooldownTime: 0.33 } },
    tr_meowmere: { damage: 46, autoAttack: true, attack: { offset: { x: 1.4, y: 0 }, rad: 3, cooldownTime: 0.23 } },
    tr_star_wrath: { damage: 44, autoAttack: true, attack: { offset: { x: 1.4, y: 0 }, rad: 3, cooldownTime: 0.27 } },
    tr_zenith: { damage: 50, autoAttack: true, attack: { offset: { x: 1.4, y: 0 }, rad: 3, cooldownTime: 0.5 } },
};

/** the glowing aura drawn around each swing, as in Terraria */
export const SwingArcs: Record<string, string> = {
    tr_terra_blade: "img/custom-weapons/fx/arc_green.png",
    tr_night_s_edge: "img/custom-weapons/fx/arc_purple.png",
    tr_excalibur: "img/custom-weapons/fx/arc_gold.png",
    tr_meowmere: "img/custom-weapons/fx/arc_rainbow.png",
    tr_star_wrath: "img/custom-weapons/fx/arc_pink.png",
    tr_zenith: "img/custom-weapons/fx/arc_rainbow.png",
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
    // a fast green slash that goes through enemies (losing 25% each) and stops at walls
    tr_terra_blade: {
        bullet: "bullet_cw_terra_beam",
        lanes: { bullet: "bullet_cw_terra_beam_edge", offsets: [-4.5, -2.25, 2.25, 4.5] },
    },
    // a cat head with a rainbow trail that bounces 4 times, blowing up bigger each bounce
    tr_meowmere: { bullet: "bullet_cw_meowmere_cat" },
    // three pink stars fall onto where you aim
    tr_star_wrath: { bullet: "bullet_cw_star", count: 3, spread: 3, fromSky: true },
    // a flurry of spinning swords rush to the cursor anywhere on screen (locking onto an enemy near it),
    // then fly back, cutting through walls and everyone both ways
    tr_zenith: { bullet: "bullet_cw_zenith_sword", count: 6, spread: 6, toCursor: true },
    // the whip lashes out 100 tiles and snaps back
    tr_spinal_tap: { bullet: "bullet_cw_whip_lash" },
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
        tracerColor: "cw_terra",
        tracerWidth: 1.2,
        sprite: "img/custom-weapons/fx/terra_slash.png",
        spriteSize: 12,
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
        bounceExplosions: ["explosion_cw_rainbow_1", "explosion_cw_rainbow_2", "explosion_cw_rainbow_3", "explosion_cw_rainbow_4"],
        tracerColor: "cw_rainbow",
        tracerWidth: 0.45,
        sprite: "img/custom-weapons/fx/cat.png",
        spriteSize: 1.8,
    }),
    bullet_cw_star: swingBullet({
        damage: 26,
        speed: 80,
        onHit: "explosion_cw_star",
        tracerColor: "cw_star",
        tracerWidth: 0.4,
        tracerLength: 0.8,
        sprite: "img/custom-weapons/fx/star.png",
        spriteSize: 1.8,
        spin: 10,
    }),
    // the whip's tip: out 100 and back (a boomerang turns at half its distance), through everyone, stopped by walls
    bullet_cw_whip_lash: swingBullet({
        damage: 35,
        distance: 200,
        speed: 180,
        playerPierce: true,
        pierceLoss: 0,
        boomerang: true,
        whip: true,
        sprite: "img/custom-weapons/fx/whip_lash.png",
        spriteSize: 3,
        tracerColor: "cw_magic",
    }),
    bullet_cw_zenith_sword: swingBullet({
        damage: 30,
        distance: 140,
        speed: 100,
        pierce: true,
        boomerang: true,
        // swirls in a loop round the cursor before coming back
        orbit: { radius: 3.5, turns: 1 },
        spin: 18,
        tracerColor: "cw_rainbow",
        tracerWidth: 0.25,
        tracerLength: 1.4,
        sprites: [
            "img/custom-weapons/world/tr_zenith.png",
            "img/custom-weapons/world/tr_terra_blade.png",
            "img/custom-weapons/world/tr_meowmere.png",
            "img/custom-weapons/world/tr_star_wrath.png",
            "img/custom-weapons/world/tr_night_s_edge.png",
            "img/custom-weapons/world/tr_excalibur.png",
        ],
        spriteSize: 3.2,
    }),
    bullet_cw_christmas_tree_frag: swingBullet({
        damage: 0,
        speed: 50,
        distance: 18,
        onHit: "explosion_cw_christmas_tree_2",
        sprite: "img/custom-weapons/fx/xmas_tree.png",
        spriteSize: 1.8,
        tracerColor: "cw_flame",
        tracerWidth: 0.25,
    }),
    bullet_cw_christmas_tree_subfrag: swingBullet({
        damage: 0,
        speed: 40,
        distance: 12,
        onHit: "explosion_cw_christmas_tree_3",
        sprite: "img/custom-weapons/fx/xmas_tree.png",
        spriteSize: 1.2,
        tracerColor: "cw_flame",
        tracerWidth: 0.2,
    }),
};
