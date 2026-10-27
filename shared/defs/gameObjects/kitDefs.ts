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
    /** Summoner: this much hp every `every` seconds */
    regenPulse?: { amount: number; every: number };
    /** Summoner: orbiting blade minions that attack enemies within `range` of the player */
    daggers?: { count: number; damage: number; range: number; interval: number };
    /** Wizard: a circle around the player; per enemy inside, per second: energy, shield, hp */
    aura?: { radius: number; energy: number; shield: number; health: number; enhanceTime: number };
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
        health: 400,
        helmet: "helmet04",
        chest: "chest04",
        outfit: "outfitKitWolverine",
        melee: "kit_wolverine_claws",
        fullBoost: true,
        speedBonus: 2,
        regen: 30,
        lowHealth: 100,
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
        melee: "fists",
        energy: { max: 100, perSecond: 15, heal: 10, healCost: 0, shieldRegen: 15, shieldCost: 0 },
    },
    spiderman: {
        name: "Spider-Man",
        health: 250,
        helmet: "helmet04",
        chest: "chest04",
        outfit: "outfitKitSpiderman",
        primary: "kit_spider_web",
        melee: "kit_spider_slash",
        fullBoost: true,
        speedBonus: 2,
        regen: 10,
    },
    ultron: {
        name: "Ultron",
        health: 50,
        shield: 300,
        helmet: "helmet04",
        chest: "chest04",
        outfit: "outfitKitUltron",
        primary: "kit_ultron_laser",
        secondary: "kit_ultron_blast",
        melee: "kit_ultron_minions",
        energy: { max: 200, perSecond: 20, heal: 0, healCost: 0, shieldRegen: 35, shieldCost: 0 },
    },
    summoner: {
        name: "Summoner",
        health: 150,
        helmet: "",
        chest: "",
        outfit: "outfitKitSummoner",
        melee: "kit_summoner_whip",
        regenPulse: { amount: 20, every: 5 },
        daggers: { count: 4, damage: 16, range: 15, interval: 0.4 },
    },
    wizard: {
        name: "Wizard",
        health: 100,
        shield: 300,
        helmet: "helmet04",
        chest: "chest04",
        outfit: "outfitKitWizard",
        primary: "kit_wizard_blast",
        secondary: "kit_wizard_stars",
        melee: "kit_wizard_enhance",
        energy: { max: 300, perSecond: 20, heal: 0, healCost: 0, shieldRegen: 0, shieldCost: 0 },
        aura: { radius: 12, energy: 10, shield: 30, health: 5, enhanceTime: 9 },
    },
};

/** Ultron's minions: bots that fight for their summoner, then blow up */
export const UltronMinion = { count: 5, health: 50, life: 20, explosion: "explosion_kit_minion" };

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
