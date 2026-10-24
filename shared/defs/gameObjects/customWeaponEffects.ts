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
