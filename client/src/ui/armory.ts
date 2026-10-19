import $ from "jquery";
import { WeaponTypeToDefs } from "../../../shared/defs/gameObjectDefs.ts";
import { BulletDefs } from "../../../shared/defs/gameObjects/bulletDefs.ts";
import { ExplosionDefs } from "../../../shared/defs/gameObjects/explosionsDefs.ts";
import type { GunDef } from "../../../shared/defs/gameObjects/gunDefs.ts";
import type { MeleeDef } from "../../../shared/defs/gameObjects/meleeDefs.ts";
import type { ThrowableDef } from "../../../shared/defs/gameObjects/throwableDefs.ts";
import { itemImage } from "./modePicker.ts";

/**
 * Weapon handbook. Every number shown here is read out of the real defs in
 * shared/defs at runtime; nothing is hardcoded. Derived values (DPS, RPM) are
 * computed the same way the server times a shot in
 * server/src/game/weaponManager.ts.
 */

type Tab = "gun" | "melee" | "throwable";

interface Column {
    key: string;
    label: string;
    /** sorted descending first - true for "bigger is better" stats */
    desc?: boolean;
}

interface Row {
    id: string;
    name: string;
    img: string;
    /** a skin of the same weapon, used when the base def's icon file is missing */
    fallbackImg?: string;
    /** sortable numbers, undefined when the def doesn't carry the stat */
    values: Record<string, number | undefined>;
    /** what to print, when it isn't just the rounded number */
    text: Record<string, string>;
}

const columns: Record<Tab, Column[]> = {
    gun: [
        { key: "type", label: "Type" },
        { key: "damage", label: "Dmg", desc: true },
        { key: "bulletCount", label: "Shot", desc: true },
        { key: "burst", label: "Burst", desc: true },
        { key: "rpm", label: "RPM", desc: true },
        { key: "dps", label: "DPS", desc: true },
        { key: "maxClip", label: "Mag", desc: true },
        { key: "reloadTime", label: "Reload" },
        { key: "headshotMult", label: "Head", desc: true },
        { key: "range", label: "Range", desc: true },
        { key: "speed", label: "Bullet", desc: true },
        { key: "ammo", label: "Ammo" },
    ],
    melee: [
        { key: "damage", label: "Dmg", desc: true },
        { key: "hits", label: "Hits", desc: true },
        { key: "cooldown", label: "Cooldown" },
        { key: "dps", label: "DPS", desc: true },
        { key: "obstacleDamage", label: "vs Obst.", desc: true },
        { key: "rad", label: "Reach", desc: true },
        { key: "cleave", label: "Cleave" },
    ],
    throwable: [
        { key: "damage", label: "Dmg", desc: true },
        { key: "radMin", label: "Rad min", desc: true },
        { key: "radMax", label: "Rad max", desc: true },
        { key: "shrapnel", label: "Shrapnel", desc: true },
        { key: "fuseTime", label: "Fuse" },
        { key: "throwSpeed", label: "Throw", desc: true },
    ],
};

/** drops pure reskins (same stats under another name), keeps real items */
function catalogIds(defs: Record<string, { baseType?: string }>) {
    return Object.keys(defs).filter((id) => {
        const baseType = defs[id].baseType;
        return baseType === undefined || baseType === id;
    });
}

/** base weapon id -> icon of one of its skins, for bases that ship no icon file */
function skinImages(defs: Record<string, { baseType?: string }>) {
    const images: Record<string, string> = {};
    for (const id of Object.keys(defs)) {
        const baseType = defs[id].baseType;
        if (!baseType || baseType === id || images[baseType]) continue;
        const img = itemImage(id);
        if (img) images[baseType] = img;
    }
    return images;
}

function round(n: number, places = 0) {
    const mult = 10 ** places;
    return Math.round(n * mult) / mult;
}

function gunRows(): Row[] {
    const defs = WeaponTypeToDefs.gun as Record<string, GunDef>;
    return catalogIds(defs).map((id) => {
        const def = defs[id];
        const bullet = BulletDefs[def.bulletType];
        // the server sets weapon.cooldown to fireDelay after a shot; a burst
        // weapon queues burstCount shots burstDelay apart, then adds fireDelay
        const burstCount = def.fireMode === "burst" ? (def.burstCount ?? 1) : 1;
        const cycle = def.fireMode === "burst"
            ? burstCount * (def.burstDelay ?? 0) + def.fireDelay
            : def.fireDelay;
        const shotsPerSec = cycle > 0 ? burstCount / cycle : undefined;
        const damage = bullet?.damage;
        const perShot = damage === undefined ? undefined : damage * def.bulletCount;
        return {
            id,
            name: def.name,
            img: itemImage(id),
            values: {
                damage,
                bulletCount: def.bulletCount,
                burst: def.fireMode === "burst" ? burstCount : undefined,
                rpm: shotsPerSec === undefined ? undefined : shotsPerSec * 60,
                dps: perShot === undefined || shotsPerSec === undefined
                    ? undefined
                    : perShot * shotsPerSec,
                maxClip: def.maxClip,
                reloadTime: def.reloadTime,
                headshotMult: def.headshotMult,
                range: bullet?.distance,
                speed: bullet?.speed,
            },
            text: {
                type: def.fireMode,
                reloadTime: `${round(def.reloadTime, 2)}s`,
                headshotMult: `${round(def.headshotMult, 2)}x`,
                ammo: def.ammoInfinite ? "∞" : def.ammo,
            },
        };
    });
}

function meleeRows(): Row[] {
    const defs = WeaponTypeToDefs.melee as Record<string, MeleeDef>;
    const fallbacks = skinImages(defs);
    return catalogIds(defs).map((id) => {
        const def = defs[id];
        const hits = def.attack.damageTimes.length;
        const cooldown = def.attack.cooldownTime;
        return {
            id,
            name: def.name,
            img: itemImage(id),
            fallbackImg: fallbacks[id],
            values: {
                damage: def.damage,
                hits,
                cooldown,
                dps: cooldown > 0 ? (def.damage * hits) / cooldown : undefined,
                obstacleDamage: def.obstacleDamage,
                rad: def.attack.rad,
            },
            text: {
                cooldown: `${round(cooldown, 2)}s`,
                obstacleDamage: `${round(def.obstacleDamage, 2)}x`,
                rad: `${round(def.attack.rad, 2)}`,
                cleave: def.cleave ? "yes" : "no",
            },
        };
    });
}

function throwableRows(): Row[] {
    const defs = WeaponTypeToDefs.throwable as Record<string, ThrowableDef>;
    return catalogIds(defs).map((id) => {
        const def = defs[id];
        const explosion = ExplosionDefs[def.explosionType];
        return {
            id,
            name: def.name,
            img: itemImage(id),
            values: {
                damage: explosion?.damage,
                radMin: explosion?.rad.min,
                radMax: explosion?.rad.max,
                shrapnel: explosion?.shrapnelCount,
                fuseTime: def.fuseTime,
                throwSpeed: def.throwPhysics.speed,
            },
            text: {
                fuseTime: `${round(def.fuseTime, 2)}s`,
                radMin: `${round(explosion?.rad.min ?? 0, 1)}`,
                radMax: `${round(explosion?.rad.max ?? 0, 1)}`,
            },
        };
    });
}

function cell(row: Row, col: Column) {
    const value = row.values[col.key];
    const text = row.text[col.key];
    if (text) return text;
    if (value === undefined) return "–";
    return `${round(value, 2)}`;
}

export function initArmory() {
    const modal = $("#modal-armory");
    if (!modal.length) return;

    const rows: Record<Tab, Row[]> = {
        gun: gunRows(),
        melee: meleeRows(),
        throwable: throwableRows(),
    };

    const search = $("#armory-search");
    const table = $("#armory-table");
    const tabs = $("#armory-tabs");

    let tab: Tab = "gun";
    let sortKey = "name";
    let sortDesc = false;

    function render() {
        const cols = columns[tab];
        const query = (search.val() as string || "").trim().toLowerCase();
        const list = rows[tab]
            .filter((row) => !query || row.name.toLowerCase().includes(query) || row.id.includes(query))
            .sort((a, b) => {
                let cmp: number;
                if (sortKey === "name") {
                    cmp = a.name.localeCompare(b.name);
                } else {
                    const av = a.values[sortKey];
                    const bv = b.values[sortKey];
                    if (av === undefined && bv === undefined) cmp = a.name.localeCompare(b.name);
                    else if (av === undefined) cmp = 1;
                    else if (bv === undefined) cmp = -1;
                    else cmp = av - bv;
                }
                return sortDesc ? -cmp : cmp;
            });

        const head = $("<tr>");
        head.append($("<th>", { class: "armory-th armory-th-name", text: "Weapon", "data-key": "name" }));
        for (const col of cols) {
            head.append($("<th>", { class: "armory-th", text: col.label, "data-key": col.key }));
        }
        head.find(`.armory-th[data-key="${sortKey}"]`).addClass(sortDesc ? "sort-desc" : "sort-asc");

        const body = $("<tbody>");
        for (const row of list) {
            const tr = $("<tr>", { class: "armory-row" });
            const nameCell = $("<td>", { class: "armory-name" });
            if (row.img) {
                const img = $("<img>", { class: "armory-img", src: row.img, alt: "" });
                // some base weapons only ship an icon under one of their skins
                img.on("error", () => {
                    if (row.fallbackImg && img.attr("src") !== row.fallbackImg) {
                        img.attr("src", row.fallbackImg);
                    } else {
                        img.css("visibility", "hidden");
                    }
                });
                nameCell.append(img);
            }
            nameCell.append($("<span>", { text: row.name }));
            tr.append(nameCell);
            for (const col of cols) {
                tr.append($("<td>", { text: cell(row, col) }));
            }
            body.append(tr);
        }

        table.empty().append($("<thead>").append(head)).append(body);
        $("#armory-count").text(`${list.length} of ${rows[tab].length}`);
        tabs.find(".armory-tab").each((_i, el) => {
            $(el).toggleClass("armory-tab-selected", $(el).attr("data-tab") === tab);
        });
    }

    tabs.on("click", ".armory-tab", (e) => {
        tab = $(e.currentTarget).attr("data-tab") as Tab;
        sortKey = "name";
        sortDesc = false;
        render();
    });

    table.on("click", ".armory-th", (e) => {
        const key = $(e.currentTarget).attr("data-key")!;
        if (key === sortKey) {
            sortDesc = !sortDesc;
        } else {
            sortKey = key;
            sortDesc = key === "name" ? false : !!columns[tab].find((c) => c.key === key)?.desc;
        }
        render();
    });

    search.on("input", render);

    render();
}
