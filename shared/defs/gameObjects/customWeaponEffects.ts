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

export const GunEffects: Record<string, GunEffect> = {
    plain: {},
    // straight beam: near instant, goes through players and walls
    laser: {
        bullet: { pierce: true, speed: 220, tracerColor: "cw_laser", tracerWidth: 0.2, tracerLength: 1.6, falloff: 1 },
    },
    // railgun / gauss: one slow heavy beam through everything
    rail: {
        bullet: { pierce: true, speed: 300, distance: 300, tracerColor: "cw_plasma", tracerWidth: 0.3, tracerLength: 2 },
        damageMult: 1.6,
    },
    // plasma, tesla, lightning: shots burst with a shock on impact
    shock: {
        bullet: { onHit: "explosion_cw_shock", tracerColor: "cw_plasma", tracerWidth: 0.16, speed: 130 },
        damageMult: 0.85,
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
    // black holes, dark matter: seek and pierce
    void: {
        bullet: { homing: true, pierce: true, speed: 50, distance: 70, tracerColor: "cw_void", tracerWidth: 0.3 },
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
        },
        damageMult: 0.5,
        gun: { maxClip: 4, maxReload: 4, extendedClip: 6, extendedReload: 6, fireDelay: 0.9, bulletCount: 1, shotSpread: 1 },
    },
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

/** what a sword fires with each swing in its own game */
export interface SwingShot {
    bullet: string;
    count?: number;
    /** degrees between shots when count > 1 */
    spread?: number;
    /** falls onto the aim point from off screen, like Star Wrath's stars */
    fromSky?: boolean;
}

export const SwingShots: Record<string, SwingShot> = {
    // a green beam that flies through everything
    tr_terra_blade: { bullet: "bullet_cw_terra_beam" },
    // a short purple slash wave
    tr_night_s_edge: { bullet: "bullet_cw_night_wave" },
    // holy light waves
    tr_excalibur: { bullet: "bullet_cw_holy_wave" },
    pg_excalibur: { bullet: "bullet_cw_holy_wave" },
    // a rainbow cat that bounces off walls
    tr_meowmere: { bullet: "bullet_cw_meowmere_cat" },
    // stars rain down where you aim
    tr_star_wrath: { bullet: "bullet_cw_star", count: 3, spread: 3, fromSky: true },
    // a fan of spectral swords that seek enemies
    tr_zenith: { bullet: "bullet_cw_zenith_sword", count: 5, spread: 12 },
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
    bullet_cw_terra_beam: swingBullet({ damage: 32, distance: 45, speed: 55, pierce: true, tracerColor: "cw_terra" }),
    bullet_cw_night_wave: swingBullet({ damage: 22, distance: 25, speed: 45, pierce: true }),
    bullet_cw_holy_wave: swingBullet({ damage: 26, distance: 30, pierce: true, tracerColor: "cw_holy" }),
    bullet_cw_meowmere_cat: swingBullet({ damage: 28, distance: 60, speed: 45, bounce: true, tracerColor: "cw_rainbow", tracerWidth: 0.45 }),
    bullet_cw_star: swingBullet({ damage: 24, speed: 80, onHit: "explosion_cw_shock", tracerColor: "cw_star", tracerWidth: 0.4, tracerLength: 0.8 }),
    bullet_cw_zenith_sword: swingBullet({ damage: 20, distance: 50, speed: 60, pierce: true, homing: true, tracerColor: "cw_rainbow", tracerWidth: 0.35, tracerLength: 0.7 }),
};
