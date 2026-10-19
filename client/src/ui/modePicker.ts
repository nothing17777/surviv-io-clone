import $ from "jquery";
import { RawGameObjectDefs } from "../../../shared/defs/gameObjectDefs.ts";
import { type MapDefKey, MapDefs } from "../../../shared/defs/mapDefs.ts";
import { GameConfig, type TeamMode } from "../../../shared/gameConfig.ts";

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

export interface GodLoadout {
    primary: string;
    secondary: string;
    throwable: string;
    melee: string;
}

export function loadGodLoadout(): GodLoadout {
    const loadout: GodLoadout = { primary: "m4a1", secondary: "mp220", throwable: "frag", melee: "fists" };
    try {
        Object.assign(loadout, JSON.parse(localStorage.getItem(godLoadoutKey) || "{}"));
    } catch {}
    // drop anything that isn't a real item so the join message can't fail to encode
    const valid = (id: string, type: string) =>
        (RawGameObjectDefs as Record<string, { type: string }>)[id]?.type === type;
    if (!valid(loadout.primary, "gun")) loadout.primary = "m4a1";
    if (!valid(loadout.secondary, "gun")) loadout.secondary = "mp220";
    if (!valid(loadout.throwable, "throwable")) loadout.throwable = "frag";
    if (!valid(loadout.melee, "melee")) loadout.melee = "fists";
    return loadout;
}

export function saveGodLoadout(loadout: GodLoadout) {
    try {
        localStorage.setItem(godLoadoutKey, JSON.stringify(loadout));
    } catch {}
}

export function defsOfType(type: string) {
    return Object.entries(RawGameObjectDefs as Record<string, { type: string; name?: string }>)
        .filter(([, def]) => def.type === type)
        .map(([id, def]) => ({ id, name: def.name || id }))
        .sort((a, b) => a.name.localeCompare(b.name));
}

/** loot icon for an item, e.g. img/loot/loot-weapon-m4a1.svg */
export function itemImage(id: string) {
    const def = (RawGameObjectDefs as Record<string, { lootImg?: { sprite?: string } }>)[id];
    const sprite = def?.lootImg?.sprite;
    return sprite ? `img/loot/${sprite.replace(/\.img$/, ".svg")}` : "";
}

const pickerSlots = ["primary", "secondary", "melee", "throwable"] as const;

export const pickerSlotType = {
    primary: "gun",
    secondary: "gun",
    melee: "melee",
    throwable: "throwable",
} as const;

/**
 * Fills one picker with every item of a type and shows the picked item's loot
 * icon beside it. Options are only rebuilt when they change, so an open
 * dropdown isn't closed by a refresh.
 */
export function fillItemPicker(prefix: string, slot: string, type: string, value: string) {
    const sel = $(`#${prefix}-${slot}`);
    if (!sel.length) return;

    const items = defsOfType(type);
    if (sel.children().length !== items.length) {
        sel.empty();
        for (const item of items) {
            sel.append($("<option>", { value: item.id, text: item.name }));
        }
    }
    if (!sel.parent().hasClass("god-row")) {
        sel.wrap($("<div>", { class: "god-row" }));
        sel.before($("<img>", { class: "god-item-img", alt: "", id: `${prefix}-${slot}-img` }));
    }
    sel.val(value);
    const img = $(`#${prefix}-${slot}-img`);
    const src = itemImage(value);
    img.attr("src", src).toggle(!!src);
}

/**
 * Fills the gun / throwable pickers with a given id prefix ("god" on the main
 * menu, "team-god" in the party menu). Both sets share the saved loadout.
 */
export function initGodLoadoutPicker(prefix = "god") {
    const lists = {
        primary: defsOfType("gun"),
        secondary: defsOfType("gun"),
        melee: defsOfType("melee"),
        throwable: defsOfType("throwable"),
    };

    for (const slot of pickerSlots) {
        const sel = $(`#${prefix}-${slot}`);
        if (!sel.length) continue;
        sel.empty();
        for (const item of lists[slot]) {
            sel.append($("<option>", { value: item.id, text: item.name }));
        }

        // picture of the picked item, shown left of the dropdown
        if (!sel.parent().hasClass("god-row")) {
            sel.wrap($("<div>", { class: "god-row" }));
            sel.before($("<img>", { class: "god-item-img", alt: "", id: `${prefix}-${slot}-img` }));
        }

        sel.on("change", () => {
            const loadout = loadGodLoadout();
            loadout[slot] = sel.val() as string;
            saveGodLoadout(loadout);
            syncGodLoadoutPickers();
        });
    }
    syncGodLoadoutPickers();
}

/** Shows the saved loadout (and its pictures) in every picker on the page */
export function syncGodLoadoutPickers() {
    const loadout = loadGodLoadout();
    for (const prefix of ["god"]) {
        for (const slot of pickerSlots) {
            $(`#${prefix}-${slot}`).val(loadout[slot]);
            const img = $(`#${prefix}-${slot}-img`);
            const src = itemImage(loadout[slot]);
            img.attr("src", src).toggle(!!src);
        }
    }
}
