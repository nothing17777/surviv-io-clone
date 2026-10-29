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

/** the kit's player aura id sent to clients: 0 none, 1 summoner daggers, 2 wizard circle, 3 enhanced */
export function kitAura(kit: string, enhanced: boolean) {
    if (kit === "summoner") return 1;
    if (kit === "wizard") return enhanced ? 3 : 2;
    return 0;
}

export function isKitItem(type: string) {
    return type.startsWith("kit_");
}
