// Episode ideas: each one is a bots-only 50v50-map match the recorder can start by itself.
// side 0 is the star (the camera follows `focus`), side 1 is everyone they have to beat.
//   npx tsx record.ts --list     prints them all
import { GameObjectDefs } from "../shared/defs/register.ts";
import {
    type BotLevel,
    type BotSettings,
    type BotSettingsByLevel,
    defaultBotSettings,
    defaultPrivateLoadout,
    type PrivateLoadout,
} from "../shared/types/api.ts";

type Kit = Partial<PrivateLoadout>;

export interface Recipe {
    title: string;
    /** bot name the camera follows; extra hackers are "austrian painter 2", "3", ... */
    focus: string;
    /** what the arrow at the start calls the star (default HACKER) */
    label?: string;
    sides: [Partial<Record<BotLevel, number>>, Partial<Record<BotLevel, number>>];
    /** what each side spawns with, over the full default kit; leave a side out to keep its usual gear */
    kits?: [Kit?, Kit?];
    /** what the loadout screen calls each side */
    names?: [string, string];
    map?: string;
    /** bot tuning over the defaults, e.g. a melee star that dodges more so it can close the gap */
    bots?: Partial<Record<BotLevel, Partial<BotSettings>>>;
}

/** a melee or pistol star needs to survive the walk in */
const tough = (level: BotLevel): Recipe["bots"] => ({ [level]: { dodge: 99 } });

export function botSettings(recipe: Recipe): BotSettingsByLevel {
    const settings = defaultBotSettings();
    for (const [level, over] of Object.entries(recipe.bots ?? {}) as [BotLevel, Partial<BotSettings>][]) {
        settings[level] = { ...settings[level], ...over };
    }
    return settings;
}

/** a non-hacker star gets this name so the camera can find it */
export const STAR = "the chosen one";

const melee = (m: string): Kit => ({ primary: "", secondary: "", melee: m, throwable: "", throwableCount: 0 });
const guns = (primary: string, secondary = ""): Kit => ({ primary, secondary });
const hacker = "austrian painter";

export const recipes: Record<string, Recipe> = {
    // ---- the classics: how many can one hacker take?
    "hacker-vs-50-noobs": { title: "1 HACKER vs 50 NOOBS", focus: hacker, sides: [{ hacker: 1 }, { beginner: 50 }] },
    "hacker-vs-100-noobs": { title: "1 HACKER vs 100 NOOBS", focus: hacker, sides: [{ hacker: 1 }, { beginner: 100 }] },
    "hacker-vs-200-noobs": { title: "1 HACKER vs 200 NOOBS", focus: hacker, sides: [{ hacker: 1 }, { beginner: 200 }] },
    "hacker-vs-30-pros": { title: "1 HACKER vs 30 PROS", focus: hacker, sides: [{ hacker: 1 }, { advanced: 30 }] },
    "hacker-vs-every-rank": {
        title: "1 HACKER vs EVERY RANK",
        focus: hacker,
        sides: [{ hacker: 1 }, { beginner: 40, intermediate: 25, advanced: 10, scripter: 1 }],
    },

    // ---- hacker vs hacker
    "hacker-vs-hacker": { title: "HACKER vs HACKER", focus: hacker, sides: [{ hacker: 1 }, { hacker: 1 }] },
    "hacker-vs-scripter": { title: "HACKER vs SCRIPTER", focus: hacker, sides: [{ hacker: 1 }, { scripter: 1 }] },
    "hacker-vs-5-scripters": {
        title: "1 HACKER vs 5 SCRIPTERS",
        focus: hacker,
        sides: [{ hacker: 1 }, { scripter: 5 }],
    },
    "hacker-squad-vs-hacker-squad": {
        title: "4 HACKERS vs 4 HACKERS",
        focus: hacker,
        sides: [{ hacker: 4 }, { hacker: 4 }],
    },
    "5-hackers-vs-300-noobs": {
        title: "5 HACKERS vs 300 NOOBS",
        focus: hacker,
        sides: [{ hacker: 5 }, { beginner: 300 }],
    },
    "sniper-hacker-vs-shotgun-hacker": {
        title: "SNIPER HACKER vs SHOTGUN HACKER",
        focus: hacker,
        sides: [{ hacker: 1 }, { hacker: 1 }],
        kits: [guns("awc", "sv98"), guns("spas12", "usas")],
    },

    // ---- different guns each side
    "hacker-pistol-vs-50-noobs-m249": {
        title: "HACKER WITH A PISTOL vs 50 NOOBS WITH M249s",
        focus: hacker,
        sides: [{ hacker: 1 }, { beginner: 50 }],
        bots: tough("hacker"),
        kits: [guns("m1911"), guns("m249", "pkp")],
    },
    "snipers-vs-shotguns": {
        title: "1 SNIPER vs 50 SHOTGUNS",
        focus: STAR,
        label: "SNIPER",
        sides: [{ advanced: 1 }, { beginner: 50 }],
        kits: [guns("awc", "mosin"), guns("m870", "spas12")],
    },
    "flare-gun-hacker": {
        title: "HACKER WITH ONLY A FLARE GUN vs 50 NOOBS",
        focus: hacker,
        sides: [{ hacker: 1 }, { beginner: 50 }],
        kits: [guns("flare_gun"), undefined],
    },
    "potato-cannon-vs-noobs": {
        title: "1 POTATO CANNON vs 50 NOOBS",
        focus: STAR,
        label: "POTATO GOD",
        sides: [{ advanced: 1 }, { beginner: 50 }],
        kits: [{ ...guns("potato_cannon"), perks: ["rare_potato"] }, undefined],
    },
    "deagle-only-duel": {
        title: "DEAGLE ONLY: 1 PRO vs 20 NOOBS",
        focus: STAR,
        label: "PRO",
        sides: [{ advanced: 1 }, { beginner: 20 }],
        kits: [guns("deagle"), guns("deagle")],
    },

    // ---- melee only
    "hacker-pan-vs-50-noobs": {
        title: "HACKER WITH A PAN vs 50 NOOBS",
        focus: hacker,
        sides: [{ hacker: 1 }, { beginner: 50 }],
        bots: tough("hacker"),
        kits: [melee("pan"), undefined],
    },
    "katana-vs-50-fists": {
        title: "1 KATANA vs 50 FISTS",
        focus: STAR,
        label: "SAMURAI",
        sides: [{ advanced: 1 }, { beginner: 50 }],
        bots: tough("advanced"),
        kits: [melee("katana"), melee("fists")],
    },
    "melee-only-hacker-vs-hacker": {
        title: "MELEE ONLY: HACKER vs HACKER",
        focus: hacker,
        sides: [{ hacker: 1 }, { hacker: 1 }],
        kits: [melee("sledgehammer"), melee("naginata")],
    },
    "fists-vs-guns": {
        title: "HACKER WITH FISTS vs 30 NOOBS WITH GUNS",
        focus: hacker,
        sides: [{ hacker: 1 }, { beginner: 30 }],
        bots: tough("hacker"),
        kits: [melee("fists"), guns("m4a1", "mp220")],
    },

    // ---- perks
    "small-arms-hacker": {
        title: "TINY HACKER vs 100 NOOBS",
        focus: hacker,
        sides: [{ hacker: 1 }, { beginner: 100 }],
        kits: [{ perks: ["small_arms"] }, undefined],
    },
    "endless-ammo-m249": {
        title: "ENDLESS AMMO M249 vs 100 NOOBS",
        focus: STAR,
        label: "BULLET HOSE",
        sides: [{ advanced: 1 }, { beginner: 100 }],
        kits: [{ ...guns("m249", "pkp"), perks: ["endless_ammo", "firepower"] }, undefined],
    },
    "steelskin-tank": {
        title: "THE TANK: STEELSKIN + LVL 3 vs 50 NOOBS",
        focus: STAR,
        label: "TANK",
        sides: [{ advanced: 1 }, { beginner: 50 }],
        kits: [{ ...guns("saiga", "usas"), armor: 3, perks: ["steelskin", "flak_jacket"] }, undefined],
    },

    // ---- armor
    "no-armor-hacker-vs-lvl3-noobs": {
        title: "HACKER WITH NO ARMOR vs 50 NOOBS WITH LVL 3",
        focus: hacker,
        sides: [{ hacker: 1 }, { beginner: 50 }],
        kits: [{ armor: 0 }, { armor: 3 }],
    },
    "lvl1-vs-lvl3": {
        title: "LVL 1 PRO vs 30 LVL 3 NOOBS",
        focus: STAR,
        label: "PRO",
        sides: [{ advanced: 1 }, { beginner: 30 }],
        kits: [{ armor: 1 }, { armor: 3 }],
    },

    // ---- throwables
    "grenade-spam": {
        title: "40 GRENADES vs 50 NOOBS",
        focus: STAR,
        label: "GRENADE MAN",
        sides: [{ advanced: 1 }, { beginner: 50 }],
        bots: tough("advanced"),
        kits: [{
            ...melee("fists"),
            throwable: "frag",
            throwableCount: 40,
            extraThrowables: ["mirv"],
            perks: ["amped_explosives", "flak_jacket"],
        }, undefined],
    },
    "snowball-fight": {
        title: "SNOWBALLS ONLY: 1 HACKER vs 50 NOOBS",
        focus: hacker,
        sides: [{ hacker: 1 }, { beginner: 50 }],
        bots: tough("hacker"),
        kits: [{ ...melee("fists"), throwable: "snowball", throwableCount: 40 }, {
            ...melee("fists"),
            throwable: "snowball",
            throwableCount: 40,
        }],
    },
};

// ---- the loadout screen: what each side spawns with, in names and icons
export interface ItemView {
    name: string;
    /** svg in client/public/img/loot */
    icon?: string;
}
export interface SideView {
    name: string;
    who: string;
    items: ItemView[];
    perks: ItemView[];
    /** no fixed kit: they pick up whatever they find */
    loots: boolean;
}

/** the hacker's built-in perks, from server/src/game/bot.ts */
const HackerPerks = ["ap_rounds", "splinter", "high_velocity", "steelskin", "flak_jacket", "windwalk", "self_revive"];

function view(id: string): ItemView | undefined {
    const def = GameObjectDefs.typeToDefSafe(id) as { name?: string; lootImg?: { sprite?: string } } | undefined;
    if (!id || !def) return undefined;
    return { name: def.name ?? id, icon: def.lootImg?.sprite?.replace(/\.img$/, ".svg") };
}

const plural = (n: number, word: string) => `${n} ${word.toUpperCase()}${n === 1 ? "" : "S"}`;
const levelWord: Record<BotLevel, string> = {
    beginner: "noob",
    intermediate: "player",
    advanced: "pro",
    hacker: "hacker",
    scripter: "scripter",
};

/** the full kit the match hands a side, or undefined to keep each bot's usual gear */
export function sideKit(recipe: Recipe, side: number): PrivateLoadout | undefined {
    const own = recipe.kits?.[side];
    if (!own) return undefined;
    const hackers = Object.keys(recipe.sides[side]).every((l) => l === "hacker");
    return { ...(hackers ? defaultBotSettings().hacker.kit! : defaultPrivateLoadout), ...own };
}

export function describeSides(recipe: Recipe): [SideView, SideView] {
    const bots = defaultBotSettings();
    return recipe.sides.map((side, i) => {
        const levels = Object.entries(side) as [BotLevel, number][];
        const who = levels.map(([l, n]) => plural(n, levelWord[l])).join(" + ");
        const onlyHackers = levels.every(([l]) => l === "hacker");
        // the server's precedence: this side's kit, else the level's kit, else they loot
        const kit = sideKit(recipe, i) ?? (onlyHackers ? bots.hacker.kit : undefined);
        const items: ItemView[] = [];
        if (kit) {
            for (const id of [kit.primary, kit.secondary, kit.melee]) {
                const v = view(id);
                if (v) items.push(v);
            }
            const t = view(kit.throwable);
            if (t && kit.throwableCount) items.push({ ...t, name: `${t.name} x${kit.throwableCount}` });
            for (const id of kit.extraThrowables ?? []) {
                const v = view(id);
                if (v) items.push(v);
            }
            items.push(
                kit.armor
                    ? { name: `Level ${kit.armor} Armor`, icon: `loot-chest-0${kit.armor}.svg` }
                    : { name: "No Armor" },
            );
        }
        const perkIds = [...(kit?.perks ?? []), ...(levels.some(([l]) => l === "hacker") ? HackerPerks : [])];
        const perks = [...new Set(perkIds)].map(view).filter((v): v is ItemView => !!v);
        return {
            name: recipe.names?.[i] ?? (i === 0 ? `TEAM ${recipe.label ?? "HACKER"}` : "THE CHALLENGERS"),
            who,
            items,
            perks,
            loots: !kit,
        };
    }) as [SideView, SideView];
}
