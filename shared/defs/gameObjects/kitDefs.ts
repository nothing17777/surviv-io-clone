import { ChampionDefs, ItemDefs } from "./championDefs.ts";

/**
 * Kits: a whole character picked before a private match or duel. "default" is the normal game
 * (your loadout, pickups, consumables). Every other kit has its own locked weapons and none of the
 * normal items, and its weapons (ids starting "kit_") can't be used outside it.
 */
export interface KitDef {
    name: string;
    health: number;
    /** shield over the health bar (and its cap) */
    shield?: number;
    helmet: string;
    chest: string;
    /** default: no bag (backpack00) */
    backpack?: string;
    outfit: string;
    /** weapon per slot: primary, secondary, melee */
    primary?: string;
    secondary?: string;
    melee: string;
    /** adrenaline is kept full */
    fullBoost?: boolean;
    /** added move speed */
    speedBonus?: number;
    /** item ids in ItemDefs (the build's health is already in `health`) */
    items?: string[];
    /** the build's health before its multipliers (base plus every item's flat health), for max HP that changes */
    healthBase?: number;
    /** the build's max HP multipliers added together, +1.38 is +138% */
    healthMult?: number;
    /** all damage this kit deals to players is multiplied by this (from its items) */
    damageMult?: number;
    /** everything this kit deals ignores this share of the target's damage reduction (from its items), on top of
     * any armor penetration the hit already has */
    armorIgnore?: number;
    /** hp per second, doubled under lowHealth */
    regen?: number;
    lowHealth?: number;
    /** hp/s instead of regen (and for free, instead of the energy healing) once `after` seconds have gone by without taking damage */
    calmRegen?: { rate: number; after: number };
    /** Spider-Man: fires `bullet` at the nearest enemy within `range`, `rate` shots/s (`dodgeRate` while dodging) */
    autoFire?: { bullet: string; range: number; rate: number; dodgeRate: number };
    /** Summoner: this much hp every `every` seconds */
    regenPulse?: { amount: number; every: number };
    /**
     * Summoner: `count` blade minions that circle him, can't be hit and only go when he does. They never go more than
     * `leash` from him. An enemy he can see (at least `range` out) gets dashed at by each of them once every
     * `dashEvery` s (staggered): the minion waits `dashFrom` away, runs at them at `dashSpeed` (hitting
     * within `hitRadius`, `damage`, ignoring every armor and damage reduction) and dashes back
     */
    daggers?: {
        count: number;
        damage: number;
        range: number;
        leash: number;
        dashFrom: number;
        dashEvery: number;
        dashSpeed: number;
        hitRadius: number;
    };
    /**
     * Summoner: whips fired automatically at the nearest enemy within `range`, `rate` a second, one after another
     * (each is a gun, for its shot and source). A hit marks the enemy for `duration` seconds: minion hits do
     * `extra` more damage and/or set them burning for `burn` seconds. Different whips' marks stack
     */
    whips?: { range: number; rate: number; duration: number; list: { gun: string; extra?: number; burn?: number }[] };
    /** Wizard: a circle around the player that burns enemies inside for `damage`/s; per enemy inside, per second: energy, shield, hp */
    aura?: { radius: number; damage: number; energy: number; shield: number; health: number; enhanceTime: number };
    /** Wolverine and Spider-Man: the nearest enemy within `range` is marked (a sigil under them), which their combos need */
    mark?: { range: number };
    /** Sentry: takes this fraction less damage from everything (a hit's armor penetration cuts it too) */
    damageReduction?: number;
    /** Sentry: once per game, a hit that would kill him leaves him at full health instead */
    revive?: boolean;
    /** Sentry: any debuff on him is removed at once, then none can be removed for `cooldown` s */
    cleanse?: { cooldown: number };
    /** Iron Man: energy pays for reloads, healing and shield */
    energy?: {
        max: number;
        perSecond: number;
        /** below max health: heals this many hp/s for healCost energy/s (0 = never) */
        heal: number;
        healCost: number;
        /** at full health: refills this many shield/s for shieldCost energy/s */
        shieldRegen: number;
        shieldCost: number;
    };
}

/**
 * A kit's build: every item's flat health is added to the base first, then the health multipliers are added
 * together into one (+44% and +44% is x1.88, not x2.07) and applied; all damage, damage taken and the share
 * of the enemy's reduction ignored work the same way
 */
export function kitBuild(baseHealth: number, items: string[]) {
    let flat = 0;
    let healthMult = 0;
    let damageMult = 0;
    let damageReduction = 0;
    let armorIgnore = 0;
    for (const id of items) {
        const item = ItemDefs[id];
        flat += item.health ?? 0;
        healthMult += item.healthMult ?? 0;
        damageMult += item.allDamage ?? 0;
        damageReduction += item.damageTakenReduction ?? 0;
        armorIgnore += item.ignoreReduction ?? 0;
    }
    return {
        health: Math.round((baseHealth + flat) * (1 + healthMult)),
        base: baseHealth + flat,
        healthMult,
        damageMult: 1 + damageMult,
        damageReduction,
        armorIgnore,
    };
}

/** Sentry's own damage reduction, before his items' */
const SentryBaseReduction = 0.45;
const SentryItems = [
    "sentry_heal",
    "sentry_artifact",
    "sentry_liberation",
    "sentry_jeff",
    "sentry_conquest",
    "sentry_rescue",
];
const SentryBuild = kitBuild(300, SentryItems);

export const KitDefs: Record<string, KitDef> = {
    default: { name: "Default", health: 100, helmet: "", chest: "", outfit: "", melee: "" },
    wolverine: {
        name: "Wolverine",
        health: 200,
        helmet: "helmet04",
        chest: "chest04",
        outfit: "outfitKitWolverine",
        // skill 1 is a gun used for its cooldown (left click on the slot, see WeaponManager and Player.startClawCombo)
        primary: "kit_wolverine_combo",
        secondary: "kit_wolverine_dash",
        melee: "kit_wolverine_claws",
        fullBoost: true,
        speedBonus: 2,
        regen: 5,
        calmRegen: { rate: 10, after: 5 },
        mark: { range: 30 },
    },
    ironman: {
        name: "Iron Man",
        health: 100,
        shield: 100,
        helmet: "helmet04",
        chest: "chest04",
        outfit: "outfitKitIronman",
        primary: "kit_ironman_blast",
        // skill 1 Repulsor Blast, skill 2 Laser Spin (guns); skill 3 Blast Combo is a melee-slot ability that needs
        // the marked enemy (the nearest one within 40)
        secondary: "kit_ironman_spin",
        melee: "kit_ironman_combo",
        mark: { range: 40 },
        energy: { max: 100, perSecond: 10, heal: 1, healCost: 5, shieldRegen: 2, shieldCost: 3 },
        calmRegen: { rate: 5, after: 5 },
    },
    spiderman: {
        name: "Spider-Man",
        health: 200,
        helmet: "helmet04",
        chest: "chest04",
        outfit: "outfitKitSpiderman",
        primary: "kit_spider_web",
        melee: "kit_spider_dodge",
        mark: { range: 30 },
        fullBoost: true,
        speedBonus: 2,
        regen: 2,
        calmRegen: { rate: 20, after: 5 },
        autoFire: { bullet: "bullet_kit_spider_auto", range: 40, rate: 1, dodgeRate: 3 },
    },
    ultron: {
        name: "Ultron",
        health: 50,
        shield: 200,
        helmet: "helmet04",
        chest: "chest04",
        outfit: "outfitKitUltron",
        primary: "kit_ultron_laser",
        secondary: "kit_ultron_blast",
        melee: "kit_ultron_minions",
        energy: { max: 200, perSecond: 20, heal: 0, healCost: 0, shieldRegen: 2, shieldCost: 3 },
        calmRegen: { rate: 5, after: 5 },
    },
    sentry: {
        name: "Sentry",
        // 300 base + Heal's 812, then +138% (Artifact 44, Liberation 25, Jeff 44, Rescue 25, added together): 2647
        health: SentryBuild.health,
        items: SentryItems,
        healthBase: SentryBuild.base,
        healthMult: SentryBuild.healthMult,
        damageMult: SentryBuild.damageMult,
        armorIgnore: SentryBuild.armorIgnore,
        speedBonus: 3,
        helmet: "helmet04",
        chest: "chest04",
        outfit: "outfitKitSentry",
        // skill 1 is a gun used for its cooldown and its dash (see WeaponManager); slot 3 is plain fists
        primary: "kit_sentry_charge",
        secondary: "kit_sentry_solar",
        melee: "fists",
        damageReduction: SentryBaseReduction + SentryBuild.damageReduction,
        revive: true,
        cleanse: { cooldown: 4 },
    },
    summoner: {
        name: "Summoner",
        health: 150,
        helmet: "",
        chest: "",
        outfit: "outfitKitSummoner",
        // skill 1 is a gun used for its cooldown (see WeaponManager)
        primary: "kit_summoner_potions",
        secondary: "kit_summoner_rod",
        melee: "fists",
        regenPulse: { amount: 20, every: 5 },
        daggers: {
            count: 4,
            damage: 8,
            range: 13,
            leash: 35,
            dashFrom: 10,
            dashEvery: 1,
            dashSpeed: 55,
            hitRadius: 1.5,
        },
        whips: {
            range: 30,
            rate: 1.5,
            duration: 4,
            list: [
                { gun: "kit_summoner_whip", extra: 6 },
                { gun: "kit_summoner_whip_blue", extra: 4 },
                { gun: "kit_summoner_whip_fire", burn: 4 },
            ],
        },
    },
    wizard: {
        name: "Wizard",
        health: 100,
        shield: 100,
        helmet: "helmet04",
        chest: "chest04",
        outfit: "outfitKitWizard",
        primary: "kit_wizard_blast",
        secondary: "kit_wizard_crystals",
        melee: "kit_wizard_wave",
        energy: { max: 300, perSecond: 20, heal: 0, healCost: 0, shieldRegen: 0, shieldCost: 0 },
        // radius is also the drawn circle's radius on the client, so enemies inside it are the ones marked
        aura: { radius: 32, damage: 10, energy: 10, shield: 2, health: 2, enhanceTime: 6 },
    },
    // League of Legends champions: keys 1-4 cast their abilities, the build's items are built in
    ...Object.fromEntries(
        Object.entries(ChampionDefs).map(([id, c]): [string, KitDef] => [id, {
            name: c.name,
            health: c.health + c.items.reduce((sum, item) => sum + (ItemDefs[item].health ?? 0), 0),
            helmet: "helmet04",
            chest: "chest04",
            backpack: "backpack04",
            outfit: `outfitChampion_${id}`,
            primary: c.gun ? `kit_${id}_basic` : undefined,
            melee: c.gun ? "fists" : `kit_${id}_basic`,
            speedBonus: c.speedBonus,
        }]),
    ),
};

/** Ultron's minions: bots that fight for their summoner, then blow up */
/**
 * Spider-Man's second skill, the Portal Combo. It needs an enemy in his mark (like Wolverine's), who is stunned
 * for `stun` seconds the moment it starts. Then eight portals open around the mark (its four sides, twice), one every `interval` seconds (as long as a dash takes),
 * on the sides `offsets` names (world y is up) and `startDist` away; each lasts `portalLife`, and `enter` seconds
 * after it opens he steps through and dashes straight across the mark to the same distance on the far side
 * (`speed`, `distance` long), hurting everyone the dash crosses once for `damage`. He can't move on his own for the
 * whole combo, and it leaves him where the last dash ended
 */
const SpiderDashSpeed = 80;
const SpiderDashDistance = 32;
/** how long one dash takes: the next portal is ready the moment it ends */
const SpiderDashTime = SpiderDashDistance / SpiderDashSpeed;
/** right, left, top, bottom of the mark, and then once more */
const SpiderOffsets = [
    { x: 1, y: 0 },
    { x: -1, y: 0 },
    { x: 0, y: 1 },
    { x: 0, y: -1 },
    { x: 1, y: 0 },
    { x: -1, y: 0 },
    { x: 0, y: 1 },
    { x: 0, y: -1 },
];
export const SpiderCombo = {
    cooldown: 8,
    damage: 10,
    // the whole combo (a dash per portal) and a moment more: the mark stays stunned until it is over
    stun: SpiderDashTime * SpiderOffsets.length + 0.3,
    // a portal opens as the last dash ends, he steps straight in, and it closes as he comes out the other side
    interval: SpiderDashTime,
    portalLife: SpiderDashTime,
    enter: 0,
    speed: SpiderDashSpeed,
    distance: SpiderDashDistance,
    startDist: 16,
    hitRadius: 2.5,
    /** a portal this much slower than a bullet can be: it only sits where it was fired */
    parkSpeed: 0.2,
    offsets: SpiderOffsets,
};

/** Wolverine's dash: how far he goes */
export const WolverineDashDistance = 16;

/**
 * Wolverine's second skill, Adamantium Dash: the Claw Combo with a single claw, from below. It needs a marked
 * enemy, hides and roots him the same way, drags the mark along and puts him at the claw's far end. It keeps the
 * dash's old 50 dmg and 4 s bleed (see Player.damage) and 8 s cooldown
 */
export const WolverineDash = { cooldown: 8, damage: 50, offsets: [{ x: 0, y: -1 }] };

/**
 * Wolverine's Claw Combo. It needs an enemy in his mark (the nearest one within the kit's `mark.range`). While it
 * runs he is hidden, untargetable and can't move, and a claw flies in on the mark ten times, one after another,
 * twice as fast as the dash (same length and sprite size). Each one starts `startDist` tiles off, on the side
 * `offsets` names (world y is up), and is aimed through the mark, so every claw hits, drags the mark with it and
 * leaves it where the next one starts: the mark is stunned for the whole combo. A claw hits once, for `damage`
 * and a `bleed` of that many seconds, then stays where it ended for `linger` s (for show only). He ends up at
 * the far end of the last claw
 */
export const WolverineCombo = {
    cooldown: 10,
    damage: 10,
    bleed: 2,
    /** twice the dash's streak */
    speed: 80,
    distance: WolverineDashDistance,
    /** how far from the mark each claw starts */
    startDist: 8,
    /** how wide a claw hits (the mark's own radius is added) */
    hitRadius: 2.5,
    /** how long a claw stays where it ended */
    linger: 0.5,
    /** a parked claw barely moves: this slow, so it hangs where it was left */
    clawSpeed: 0.2,
    /**
     * the side each claw comes from: bottom left, top right, top left, bottom right, straight above, top right,
     * bottom left, bottom right, top left, then from below
     */
    offsets: [
        { x: -1, y: -1 },
        { x: 1, y: 1 },
        { x: -1, y: 1 },
        { x: 1, y: -1 },
        { x: 0, y: 1 },
        { x: 1, y: 1 },
        { x: -1, y: -1 },
        { x: 1, y: -1 },
        { x: -1, y: 1 },
        { x: 0, y: -1 },
    ],
};
/** seconds one claw takes, and the whole combo */
export const WolverineComboStep = WolverineCombo.distance / WolverineCombo.speed;
export const WolverineComboTime = WolverineComboStep * WolverineCombo.offsets.length;

/**
 * Sentry Charge: dashes `distance` tiles at `speed` (Ahri's dash speed) and flies for `flight` s. Whoever it hits
 * takes the bullet's damage, burns, bleeds and is stunned for `debuff` s and loses their perks for `perkStrip` s;
 * every charge heals the Sentry `healPercent` of his max hp, hit or miss. `armorPen` multiplies the armor reduction it meets.
 * `hitRadius` is the crescent's width; `bodyRadius` is a second hitbox on the Sentry himself, so running
 * through someone hits them too. Everyone hit is carried along with the dash (`pullSpeedMult` x the dash speed
 * is how fast they are reeled in to just in front of him) until the dash ends
 */
export const SentryCharge = {
    distance: 30,
    speed: 80,
    cooldown: 3,
    damage: 120,
    /** every charge heals this share of his max health */
    healPercent: 0.3,
    debuff: 3,
    perkStrip: 5,
    armorPen: 0.2,
    flight: 2,
    hitRadius: 14,
    bodyRadius: 6,
    pullSpeedMult: 2,
};

/**
 * Sentry skill 2, Solar Explosion: a piercing yellow ring grows from him at `speed` up to `radius` world units.
 * Whoever it reaches is dragged outward on the wave front and hit up to `hits` times (`damage` each, one every
 * `hitEvery` s). It heals `heal` of his max hp, halves the armor penetration of what hits him for `penGuardTime` s,
 * and he flies for `flight` s
 */
/**
 * Summoner skill 1, Bundle of Potions: for `duration` s he takes `reduction` less damage (then `flat` less from each
 * hit), is immune to burning, regenerates `regen` hp/s and runs `speed` faster; using it also heals `heal` hp
 */
export const SummonerPotions = { cooldown: 20, duration: 12, heal: 30, reduction: 0.1, flat: 4, regen: 2, speed: 20 };

/** Summoner skill 2, Rod of Discord: teleports him to the cursor for `cost` hp (never the last of it) */
export const SummonerRod = { cooldown: 1.5, cost: 30 };

export const SentryNova = {
    speed: 220,
    radius: 100,
    hits: 5,
    damage: 100,
    hitEvery: 0.1,
    heal: 0.4,
    /** share of an attacker's armor penetration that is taken away */
    penGuard: 0.5,
    penGuardTime: 12,
    flight: 5,
    cooldown: 8,
};

/**
 * Ultron's Combo (his skill 2): all his energy, `cooldown` s. He hangs untargetable and rooted until it ends.
 * A green ring expands from him to `ring.radius`: each enemy it crosses takes `ring.damage` once and is
 * stunned until the combo is over, enemy projectiles it crosses are deleted, and the first enemy it hits (the
 * closest) is marked orange. `orbs.count` red orbs then appear round the marked enemy, get a blue outline after
 * `orbs.red` s and go off `orbs.blue` s later in a wide blast (`orbs.damage` each, full damage out to
 * `orbs.blast.min` and none past `orbs.blast.max`). A portal opens at every blast; `portal.lead` s later they
 * fire in turn, `portal.interval` s apart: each one a blast (`blast.damage`) and, `laser.delay` s after it, a
 * piercing laser (`laser.damage`), and closes as the laser leaves. `Times` are seconds since the cast
 */
export const UltronCombo = {
    cooldown: 15,
    ring: { radius: 30, speed: 100, damage: 20, bullets: 64 },
    /** how long the stun lasts past the end of the combo */
    stunAfter: 0.5,
    orbs: { count: 5, radius: 4.5, red: 0.5, blue: 0.3, damage: 10, blast: { min: 5, max: 9 } },
    portal: { lead: 0.2, interval: 0.15 },
    blast: { damage: 10 },
    laser: { damage: 15, delay: 0.2 },
};

const ringEnd = UltronCombo.ring.radius / UltronCombo.ring.speed;
const blueAt = ringEnd + UltronCombo.orbs.red;
const boomAt = blueAt + UltronCombo.orbs.blue;
/** when portal `i` fires its blast, and when its laser follows */
const fireAt = (i: number) => boomAt + UltronCombo.portal.lead + i * UltronCombo.portal.interval;
const laserAt = (i: number) => fireAt(i) + UltronCombo.laser.delay;
export const UltronComboTimes = {
    ringEnd,
    blueAt,
    boomAt,
    fireAt,
    laserAt,
    end: laserAt(UltronCombo.orbs.count - 1) + 0.05,
};

/**
 * Iron Man skill 2, Laser Spin: two piercing lasers, one out to each side, spin a full turn in `time` s. Each is
 * `range` long, hurts everyone it sweeps past once (`damage`, and they burn for `burn` s) and destroys every
 * obstacle it touches
 */
export const IronManSpin = {
    cooldown: 6,
    energy: 30,
    range: 40,
    damage: 30,
    burn: 3,
    time: 0.3,
    beamRadius: 0.4,
    width: 0.7,
};

/**
 * Iron Man skill 3, Blast Combo (a melee-slot ability, needs the marked enemy): the target is stunned for `duration` s and Iron Man
 * can do nothing else until the drones go (`droneEnd`). Four drones appear `side` tiles to his left and right, `fwd` tiles toward
 * the target, so they curve in round it; at `fireAt` s all four and he fire a laser at it (his is `mainWidth` x
 * the drones') and the drones go at `droneEnd`
 */
export const IronManCombo = {
    cooldown: 10,
    energy: 50,
    range: 40,
    duration: 2,
    fireAt: 0.6,
    droneEnd: 0.9,
    main: { damage: 50, width: 1.8 },
    small: { damage: 10, width: 0.9 },
    drones: [
        { side: -6, fwd: 3 },
        { side: -3, fwd: 1 },
        { side: 3, fwd: 1 },
        { side: 6, fwd: 3 },
    ],
};

/**
 * Wizard skill 2, Crystal Burst: a spinning crystal then two spinning circles, one after the other. Each bleeds
 * for `bleed` s. The crystal bursts on whatever it hits into `shards` mini crystals, spread `shardRadius` tiles
 * round the burst so the one who took the crystal isn't also on a shard. They lie there `shardLife` s and go off
 * (`shard` dmg and bleeding) on the first enemy to touch them
 */
export const WizardCrystals = {
    cooldown: 5,
    energy: 40,
    crystal: 45,
    circle: 30,
    shard: 15,
    bleed: 4,
    shards: 5,
    shardRadius: 7,
    shardLife: 5,
    shardTouch: 1.5,
};

/**
 * Wizard skill 3, Stun Wave: a green ring spreads from him at `speed` tiles/s out to the radius of his circle
 * (KitDefs.wizard.aura). Enemies it reaches take `damage` and are stunned `stun` s, and enemy shots inside it go
 */
export const WizardWave = { cooldown: 9, energy: 50, damage: 30, stun: 3, speed: 90 };

export const UltronMinion = { count: 4, health: 17.5, speedMult: 0.75, life: 15, explosion: "explosion_kit_minion" };

/** Ultron's energy blast orbs, one per colour, and the laser each one's blast fires */
export const UltronOrbColors = ["red", "blue", "green", "yellow", "purple", "orange"] as const;

/**
 * the kit's player aura id sent to clients: 0 none, 1 summoner daggers, 2 wizard circle, 3 enhanced.
 * The field is 3 bits on the wire
 */
export function kitAura(kit: string, enhanced: boolean) {
    if (kit === "summoner") return 1;
    if (kit === "wizard") return enhanced ? 3 : 2;
    return 0;
}

export function isKitItem(type: string) {
    return type.startsWith("kit_");
}
