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
    /** Summoner: orbiting blade minions that attack enemies within `range` of the player */
    daggers?: { count: number; damage: number; range: number; interval: number; leash: number };
    /** Summoner: the whip leaves its target taking `extraDamage` more from each minion hit for `duration` seconds */
    vulnerable?: { extraDamage: number; duration: number };
    /** Wizard: a circle around the player that burns enemies inside for `damage`/s; per enemy inside, per second: energy, shield, hp */
    aura?: { radius: number; damage: number; energy: number; shield: number; health: number; enhanceTime: number };
    /** War Machine: the shield refills for free, `rate`/s, or `calmRate`/s once `after` s have gone by unhurt */
    armorRegen?: { rate: number; calmRate: number; after: number };
    /**
     * War Machine: shoulder-mounted guns that fire `bullet` (shot sound and source `gun`) at the nearest enemy
     * within `range`, `rate` shots/s each. The right mount is always on; the left one runs for `secondDuration`
     * seconds after the skill. `back` and `side` place a mount behind and to the right (or left) of the player
     */
    mounts?: {
        gun: string;
        bullet: string;
        range: number;
        rate: number;
        /** shots/s each while the Missile Barrage flight is on */
        flyingRate: number;
        back: number;
        side: number;
        secondDuration: number;
    };
    /**
     * Green Goblin: a drone circling the player counter clockwise at `radius`, `turnRate` rad/s, its point leading.
     * An enemy it touches takes `damage` and bleeds for `bleed` s (and can't be hit again by it for `hitCooldown` s).
     * Golden Upgrade (`upgrade.duration` s) adds `speedBonus` move speed and `subDrones` more drones, evenly spaced
     * round the same circle, that each throw a pumpkin bomb off their tip every `bombEvery` s. Tricky Swap trades
     * places with the main drone and leaves a bomb that goes off `swapBombFuse` s later
     */
    drone?: {
        radius: number;
        turnRate: number;
        damage: number;
        bleed: number;
        /** how far from the drone's centre an enemy's edge can be and still be hit */
        hitRadius: number;
        hitCooldown: number;
        /** how far the tip is from the drone's centre (the drawn triangle's size) */
        tip: number;
        /** the pumpkin bomb the sub drones throw (and Tricky Swap leaves): gun id for the damage source, bullets */
        bombGun: string;
        bomb: string;
        swapBomb: string;
        upgrade: { duration: number; speedBonus: number; subDrones: number; bombEvery: number };
        swapBombFuse: number;
    };
    /** Wolverine: the nearest enemy within `range` is marked (a sigil under them), which his Claw Combo needs */
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
        health: 200,
        shield: 100,
        helmet: "helmet04",
        chest: "chest04",
        outfit: "outfitKitIronman",
        primary: "kit_ironman_blast",
        secondary: "kit_ironman_rockets",
        melee: "kit_ironman_fists",
        energy: { max: 100, perSecond: 10, heal: 1, healCost: 5, shieldRegen: 1, shieldCost: 3 },
        calmRegen: { rate: 5, after: 5 },
    },
    spiderman: {
        name: "Spider-Man",
        health: 250,
        helmet: "helmet04",
        chest: "chest04",
        outfit: "outfitKitSpiderman",
        primary: "kit_spider_web",
        melee: "kit_spider_dodge",
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
    warmachine: {
        name: "War Machine",
        health: 50,
        shield: 150,
        helmet: "helmet04",
        chest: "chest04",
        outfit: "outfitKitWarmachine",
        // skill 1 (Second Fire) and skill 2 (Missile Barrage) are guns that fire nothing or the rockets; left
        // click on the slot to use them. Slot 3 is Iron Man's gauntlets
        primary: "kit_warmachine_secondfire",
        secondary: "kit_warmachine_barrage",
        melee: "kit_warmachine_fists",
        armorRegen: { rate: 2, calmRate: 8, after: 5 },
        mounts: {
            gun: "kit_warmachine_mount",
            bullet: "bullet_kit_warmachine_mount",
            range: 30,
            rate: 5,
            flyingRate: 10,
            back: 0.6,
            side: 1,
            secondDuration: 10,
        },
    },
    greengoblin: {
        name: "Green Goblin",
        health: 150,
        helmet: "helmet04",
        chest: "chest04",
        outfit: "outfitKitGreengoblin",
        // skills 1 and 2 are guns used for their cooldowns (left click on the slot); skill 3 is a melee
        primary: "kit_goblin_pumpkin",
        secondary: "kit_goblin_upgrade",
        melee: "kit_goblin_swap",
        regen: 1,
        calmRegen: { rate: 4, after: 5 },
        drone: {
            radius: 25,
            turnRate: 4.2,
            damage: 25,
            bleed: 4,
            hitRadius: 1.2,
            hitCooldown: 1,
            tip: 1.4,
            bombGun: "kit_goblin_pumpkin",
            bomb: "bullet_kit_goblin_pumpkin",
            swapBomb: "bullet_kit_goblin_trap",
            upgrade: { duration: 8, speedBonus: 4, subDrones: 2, bombEvery: 2 },
            swapBombFuse: 0.5,
        },
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
        melee: "kit_summoner_whip",
        regenPulse: { amount: 20, every: 5 },
        daggers: { count: 4, damage: 30, range: 13, interval: 1.2, leash: 40 },
        vulnerable: { extraDamage: 10, duration: 4 },
    },
    wizard: {
        name: "Wizard",
        health: 100,
        shield: 100,
        helmet: "helmet04",
        chest: "chest04",
        outfit: "outfitKitWizard",
        primary: "kit_wizard_blast",
        secondary: "kit_wizard_stars",
        melee: "kit_wizard_enhance",
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
/** Spider-Man's Sudden Dodge: seconds untargetable */
export const SpiderDodgeTime = 2;

/** Wolverine's dash: how far he goes */
export const WolverineDashDistance = 16;

/**
 * Wolverine's dash flies with a Claw Combo hand (the claw) on either side of the streak, `offset` tiles from its
 * line, and hits everyone within `hitRadius` tiles of that line, so the hands are what widen it
 */
export const WolverineDashHands = { offset: 2.5, hitRadius: 3.5 };

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

export const UltronMinion ={ count: 4, health: 17.5, speedMult: 0.75, life: 15, explosion: "explosion_kit_minion" };

/** Ultron's energy blast orbs, one per colour, and the laser each one's blast fires */
export const UltronOrbColors = ["red", "blue", "green", "yellow", "purple", "orange"] as const;

/**
 * the kit's player aura id sent to clients: 0 none, 1 summoner daggers, 2 wizard circle, 3 enhanced,
 * 4 War Machine's right shoulder mount, 5 both mounts, 6 Green Goblin's drone, 7 the drone and its two sub drones.
 * The field is 3 bits on the wire, so 7 is the last id
 */
export function kitAura(kit: string, enhanced: boolean) {
    if (kit === "summoner") return 1;
    if (kit === "wizard") return enhanced ? 3 : 2;
    if (kit === "warmachine") return enhanced ? 5 : 4;
    if (kit === "greengoblin") return enhanced ? 7 : 6;
    return 0;
}

/** where a Green Goblin drone is: `angle` round the player (counter clockwise from +x, world y up) */
export function dronePos(center: { x: number; y: number }, radius: number, angle: number) {
    return { x: center.x + Math.cos(angle) * radius, y: center.y + Math.sin(angle) * radius };
}

export function isKitItem(type: string) {
    return type.startsWith("kit_");
}
