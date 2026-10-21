import $ from "jquery";
import en from "../en.json";
import { RawGameObjectDefs } from "../../../shared/defs/gameObjectDefs.ts";
import { type MapDefKey, MapDefs } from "../../../shared/defs/mapDefs.ts";
import { GameConfig, type TeamMode } from "../../../shared/gameConfig.ts";
import { defaultPrivateLoadout, type PrivateLoadout } from "../../../shared/types/api.ts";

/**
 * Helpers for the map + team size pickers on the main menu and the party menu,
 * and the duel "god loadout" gun pickers.
 */

export interface ModeInfo {
    mapName: string;
    teamMode: TeamMode;
    enabled: boolean;
}

export function mapLabel(mapName: string) {
    return (MapDefs[mapName as MapDefKey] || MapDefs.main).desc.name;
}

export function isDuelMap(mapName: string) {
    return !!MapDefs[mapName as MapDefKey]?.gameMode.duelMode;
}

export function isGodLoadoutMap(mapName: string) {
    return !!MapDefs[mapName as MapDefKey]?.gameMode.godLoadout;
}

export function modeLabel(mode: ModeInfo) {
    if (isDuelMap(mode.mapName)) {
        return `${mode.teamMode}v${mode.teamMode}`;
    }
    const str = GameConfig.TeamModeToString[mode.teamMode] || "solo";
    return str[0].toUpperCase() + str.slice(1);
}

/** Unique map names in config order, only maps with at least one enabled mode */
export function getModeMaps(modes: ModeInfo[], filter?: (m: ModeInfo) => boolean) {
    const maps: string[] = [];
    for (const mode of modes) {
        if (!mode.enabled || (filter && !filter(mode))) continue;
        if (!maps.includes(mode.mapName)) maps.push(mode.mapName);
    }
    return maps;
}

export function fillMapSelect(select: JQuery<HTMLElement>, maps: string[], selected: string) {
    select.empty();
    for (const mapName of maps) {
        const opt = $("<option>", { value: mapName, text: mapLabel(mapName) });
        if (mapName === selected) opt.prop("selected", true);
        select.append(opt);
    }
}

//
// God loadout (duel)
//
const godLoadoutKey = "survev_god_loadout";

/** every slot a loadout picker can set; perks are three optional slots */
export const pickerSlotType = {
    primary: "gun",
    secondary: "gun",
    melee: "melee",
    throwable: "throwable",
    helmet: "helmet",
    chest: "chest",
    backpack: "backpack",
    perk1: "perk",
    perk2: "perk",
    perk3: "perk",
} as const;
export type PickerSlot = keyof typeof pickerSlotType;
const pickerSlots = Object.keys(pickerSlotType) as PickerSlot[];
/** slots that can be left empty */
const optionalSlots = new Set<string>(["helmet", "chest", "perk1", "perk2", "perk3"]);

export type GodLoadout = Record<PickerSlot, string>;

const defaultGodLoadout: GodLoadout = {
    primary: "m4a1",
    secondary: "mp220",
    throwable: "frag",
    melee: "fists",
    helmet: "helmet03",
    chest: "chest03",
    backpack: "backpack03",
    perk1: "",
    perk2: "",
    perk3: "",
};

export function loadGodLoadout(key = godLoadoutKey): GodLoadout {
    const loadout: GodLoadout = { ...defaultGodLoadout };
    try {
        Object.assign(loadout, JSON.parse(localStorage.getItem(key) || "{}"));
    } catch {}
    // drop anything that isn't a real item so the join message can't fail to encode
    for (const slot of pickerSlots) {
        const id = loadout[slot];
        const ok = (id === "" && optionalSlots.has(slot))
            || (RawGameObjectDefs as Record<string, { type: string }>)[id]?.type === pickerSlotType[slot];
        if (!ok) loadout[slot] = defaultGodLoadout[slot];
    }
    return loadout;
}

/** a kit's value for one picker slot (old kits only have an armor tier) */
export function kitSlot(kit: Partial<PrivateLoadout>, slot: PickerSlot): string {
    switch (slot) {
        case "helmet":
        case "chest": {
            const armor = kit.armor ?? 3;
            return kit[slot] ?? (armor > 0 ? `${slot}0${armor}` : "");
        }
        case "backpack":
            return kit.backpack || "backpack03";
        case "perk1":
        case "perk2":
        case "perk3":
            return kit.perks?.[Number(slot[4]) - 1] ?? "";
        default:
            return kit[slot] ?? "";
    }
}

export function setKitSlot(kit: Partial<PrivateLoadout>, slot: PickerSlot, value: string) {
    if (pickerSlotType[slot] === "perk") {
        const perks = (["perk1", "perk2", "perk3"] as const).map((p) => (p === slot ? value : kitSlot(kit, p)));
        kit.perks = perks.filter((p, i) => p && perks.indexOf(p) === i);
    } else {
        (kit as Record<string, unknown>)[slot] = value;
    }
}

/** the picker slots as kit fields: gear by name, perks as a list */
export function loadoutToKit(l: GodLoadout) {
    return {
        primary: l.primary,
        secondary: l.secondary,
        throwable: l.throwable,
        melee: l.melee,
        helmet: l.helmet,
        chest: l.chest,
        backpack: l.backpack,
        perks: [l.perk1, l.perk2, l.perk3].filter((p, i, a) => p && a.indexOf(p) === i),
    };
}

export function saveGodLoadout(loadout: GodLoadout, key = godLoadoutKey) {
    try {
        localStorage.setItem(key, JSON.stringify(loadout));
    } catch {}
}

/** the weapons Duel (Bots) hands the opponent ("bot") and teammate ("ally") bots */
const botDuelKitKeys = { bot: "survev_bot_duel_kit", ally: "survev_bot_duel_ally_kit" } as const;

export function loadBotDuelKit(side: keyof typeof botDuelKitKeys): GodLoadout {
    return loadGodLoadout(botDuelKitKeys[side]);
}

/** Duel (Bots) bot weapon pickers (#bot-primary, #ally-primary etc.), saved in this browser */
export function initBotDuelPicker() {
    for (const side of ["bot", "ally"] as const) {
        const sync = () => {
            const kit = loadBotDuelKit(side);
            for (const slot of pickerSlots) fillItemPicker(side, slot, pickerSlotType[slot], kit[slot]);
        };
        sync();
        for (const slot of pickerSlots) {
            $(`#${side}-${slot}`).on("change", (e) => {
                const kit = loadBotDuelKit(side);
                kit[slot] = $(e.currentTarget).val() as string;
                saveGodLoadout(kit, botDuelKitKeys[side]);
                sync();
            });
        }
    }
}

export function defsOfType(type: string) {
    return Object.entries(RawGameObjectDefs as Record<string, { type: string; name?: string }>)
        .filter(([, def]) => def.type === type)
        // the names players see in game, e.g. "One With Nature" for tree_climbing
        .map(([id, def]) => ({ id, name: (en as Record<string, string>)[`game-${id}`] || def.name || id }))
        .sort((a, b) => a.name.localeCompare(b.name));
}

/** loot icon for an item, e.g. img/loot/loot-weapon-m4a1.svg */
export function itemImage(id: string) {
    const def = (RawGameObjectDefs as Record<string, { lootImg?: { sprite?: string } }>)[id];
    const sprite = def?.lootImg?.sprite;
    return sprite ? `img/loot/${sprite.replace(/\.img$/, ".svg")}` : "";
}


/**
 * Fills one picker with every item of a type and shows the picked item's loot
 * icon beside it. Options are only rebuilt when they change, so an open
 * dropdown isn't closed by a refresh.
 */
export function fillItemPicker(prefix: string, slot: string, type: string, value: string) {
    const sel = $(`#${prefix}-${slot}`);
    if (!sel.length) return;

    const items = defsOfType(type);
    if (optionalSlots.has(slot)) items.unshift({ id: "", name: `No ${slot.startsWith("perk") ? "perk" : slot === "chest" ? "vest" : slot}` });
    if (sel.children().length !== items.length) {
        sel.empty();
        for (const item of items) {
            sel.append($("<option>", { value: item.id, text: item.name }));
        }
    }
    if (!sel.parent().hasClass("god-row")) {
        sel.wrap($("<div>", { class: "god-row" }));
        sel.before($("<img>", { class: "god-item-img", alt: "", id: `${prefix}-${slot}-img` }));
        // follow the pick right away; refreshes skip a picker that has focus
        sel.on("change", () => {
            const src = itemImage(sel.val() as string);
            $(`#${prefix}-${slot}-img`).attr("src", src).toggle(!!src);
        });
    }
    sel.val(value);
    const img = $(`#${prefix}-${slot}-img`);
    const src = itemImage(value);
    img.attr("src", src).toggle(!!src);
}

/**
 * Fills the main menu loadout pickers ("god" prefix) and saves each pick.
 */
export function initGodLoadoutPicker(prefix = "god") {
    for (const slot of pickerSlots) {
        $(`#${prefix}-${slot}`).on("change", (e) => {
            const loadout = loadGodLoadout();
            loadout[slot] = $(e.currentTarget).val() as string;
            saveGodLoadout(loadout);
            syncGodLoadoutPickers();
        });
    }
    syncGodLoadoutPickers();
}

/** Shows the saved loadout (and its pictures) in the main menu pickers */
export function syncGodLoadoutPickers() {
    const loadout = loadGodLoadout();
    for (const slot of pickerSlots) fillItemPicker("god", slot, pickerSlotType[slot], loadout[slot]);
}

//
// Duel (Bots) consumable counts: you, opponent bots ("bot"), teammate bots ("ally")
//
const countFields = [
    ["throwableCount", "Throwables", 40],
    ["bandage", "Bandages", 30],
    ["healthkit", "Med Kits", 4],
    ["soda", "Sodas", 15],
    ["painkiller", "Pills", 4],
] as const;
type CountKey = (typeof countFields)[number][0];
export type DuelCounts = Pick<PrivateLoadout, CountKey>;
type CountSide = "you" | "bot" | "ally";

export function loadDuelCounts(side: CountSide): DuelCounts {
    const counts = {} as DuelCounts;
    let saved: Partial<Record<CountKey, unknown>> = {};
    try {
        saved = JSON.parse(localStorage.getItem(`survev_duel_counts_${side}`) || "{}");
    } catch {}
    for (const [key, , max] of countFields) {
        const v = Number(saved[key]);
        counts[key] = Number.isFinite(v) ? Math.min(max, Math.max(0, Math.round(v))) : defaultPrivateLoadout[key];
    }
    return counts;
}

/** number inputs for each side's consumables, saved in this browser */
export function initDuelCounts() {
    for (const side of ["you", "bot", "ally"] as const) {
        const box = $(`#${side}-counts`);
        const counts = loadDuelCounts(side);
        for (const [key, label, max] of countFields) {
            const input = $("<input>", { type: "number", min: 0, max, class: "menu-option", value: counts[key] });
            input.on("change", () => {
                const all = loadDuelCounts(side);
                const v = Math.round(Number(input.val()));
                all[key] = Number.isFinite(v) ? Math.min(max, Math.max(0, v)) : all[key];
                input.val(all[key]);
                try {
                    localStorage.setItem(`survev_duel_counts_${side}`, JSON.stringify(all));
                } catch {}
            });
            box.append($("<label>", { class: "god-heal" }).append($("<span>", { text: label }), input));
        }
    }
}
