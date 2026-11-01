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

export const KitDefs: Record<string, KitDef> = {
    default: { name: "Default", health: 100, helmet: "", chest: "", outfit: "", melee: "" },
    wolverine: {
        name: "Wolverine",
        health: 200,
        helmet: "helmet04",
        chest: "chest04",
        outfit: "outfitKitWolverine",
        secondary: "kit_wolverine_dash",
        melee: "kit_wolverine_claws",
        fullBoost: true,
        speedBonus: 2,
        regen: 5,
        calmRegen: { rate: 10, after: 5 },
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
        // no armor: the sheet gives him none
        helmet: "",
        chest: "",
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

export const UltronMinion = { count: 4, health: 17.5, speedMult: 0.75, life: 15, explosion: "explosion_kit_minion" };

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
