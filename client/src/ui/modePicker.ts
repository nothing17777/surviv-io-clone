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
}

export function loadGodLoadout(): GodLoadout {
    const loadout: GodLoadout = { primary: "m4a1", secondary: "mp220", throwable: "frag" };
    try {
        Object.assign(loadout, JSON.parse(localStorage.getItem(godLoadoutKey) || "{}"));
    } catch {}
    // drop anything that isn't a real item so the join message can't fail to encode
    const valid = (id: string, type: string) =>
        (RawGameObjectDefs as Record<string, { type: string }>)[id]?.type === type;
    if (!valid(loadout.primary, "gun")) loadout.primary = "m4a1";
    if (!valid(loadout.secondary, "gun")) loadout.secondary = "mp220";
    if (!valid(loadout.throwable, "throwable")) loadout.throwable = "frag";
    return loadout;
}

export function saveGodLoadout(loadout: GodLoadout) {
    try {
        localStorage.setItem(godLoadoutKey, JSON.stringify(loadout));
    } catch {}
}

function defsOfType(type: string) {
    return Object.entries(RawGameObjectDefs as Record<string, { type: string; name?: string }>)
        .filter(([, def]) => def.type === type)
        .map(([id, def]) => ({ id, name: def.name || id }))
        .sort((a, b) => a.name.localeCompare(b.name));
}

export function initGodLoadoutPicker() {
    const loadout = loadGodLoadout();
    const guns = defsOfType("gun");
    const throwables = defsOfType("throwable");

    const fill = (sel: JQuery<HTMLElement>, list: Array<{ id: string; name: string }>, value: string) => {
        sel.empty();
        for (const item of list) {
            sel.append($("<option>", { value: item.id, text: item.name }));
        }
        sel.val(value);
    };
    const primary = $("#god-primary");
    const secondary = $("#god-secondary");
    const throwable = $("#god-throwable");
    fill(primary, guns, loadout.primary);
    fill(secondary, guns, loadout.secondary);
    fill(throwable, throwables, loadout.throwable);

    $("#god-primary, #god-secondary, #god-throwable").on("change", () => {
        saveGodLoadout({
            primary: primary.val() as string,
            secondary: secondary.val() as string,
            throwable: throwable.val() as string,
        });
    });
}
