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
    /** Iron Man: energy pays for reloads, healing and shield */
    energy?: {
        max: number;
        perSecond: number;
        /** below max health: heals this many hp/s for healCost energy/s */
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
        energy: { max: 100, perSecond: 15, heal: 10, healCost: 5, shieldRegen: 15, shieldCost: 3 },
    },
};

export function isKitItem(type: string) {
    return type.startsWith("kit_");
}
