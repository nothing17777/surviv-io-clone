import $ from "jquery";
import { CustomGuns, CustomMelees } from "../../../shared/defs/gameObjects/customWeaponDefs.ts";
import { HiddenCustomGuns, SwingShots } from "../../../shared/defs/gameObjects/customWeaponEffects.ts";
import { GameObjectDefs } from "../../../shared/defs/register.ts";

/** what each effect does, in a sentence */
const GunEffectText: Record<string, string> = {
    plain: "Fires regular bullets.",
    laser: "Instant laser beam that goes through players and walls.",
    rail: "Instant heavy beam through everything, 1.6x damage.",
    prism: "Six rainbow beams that close into one beam doing 3x damage after 3 s of firing.",
    minigun: "Minigun: starts slow and spins up to full fire rate.",
    sniper_pierce: "Shots go through players, losing 25% damage on each.",
    shock: "Slow electric orbs that blow up in a shock.",
    flame: "Short range stream of fire.",
    frost: "Freezes whoever it hits for a moment.",
    poison: "Toxic splash that slows.",
    magic: "Slow shots that curve onto enemies.",
    void: "Exploding dark matter orbs that leave a damaging vortex.",
    arrow: "Slow, heavy arrows.",
    bubble: "Slow water shots.",
    rocket: "Rocket that blows up like a frag. One shot per reload.",
    nanobots: "Nanobot swarms that home in on enemies and burst, inflicting bleed.",
    multitaskers: "Fast firing dual guns with splash damage and high mobility.",
    christmas_ultimatum: "Cluster bomb tree rocket whose fragments split again, dropping 20% damage each split.",
    judge: "Slow, cursor-steered rocket that carries player camera up to 400 tiles.",
    frozen_dragon: "Flamethrower shooting blue flames that slow and burn for 2 seconds.",
};

/** what each sword does beyond its swing */
const SwordText: Record<string, string> = {
    tr_terra_blade: "Fires a big curved green wave that cuts through enemies and stops at walls.",
    tr_night_s_edge: "Wide purple aura swing.",
    tr_excalibur: "Huge golden aura swing, twice the blade's reach.",
    tr_meowmere: "Throws a rainbow cat that bounces 4 times, blowing up bigger each bounce.",
    tr_star_wrath: "Calls three stars down onto your cursor.",
    tr_zenith: "Sends spinning swords out to your cursor and back.",
    tr_spinal_tap: "Bone whip that lashes enemies up to 10 tiles away.",
    pg_heroic_epee: "Swift rapier that regenerates 12 HP per second while holding.",
    lol_sundered_sky: "Heavy strikes that heal 40 HP on hit.",
    lol_eclipse: "Strikes for 60 damage and grants a 50 HP shield every second hit.",
};

/** per weapon notes from its wiki page, where the effect alone doesn't say it */
const Notes: Record<string, string> = {
    pg_ultimatum: "Shotgun pellets go through walls and enemies. Never reloads.",
    pg_double_barreled_shotgun: "Two big blasts, then reload.",
    pg_napalmcannon: "Rocket that leaves fire burning for 3 s.",
    tr_sdmg: "Insanely fast, glowing shots.",
};

type Tab = "gun" | "melee";

interface Row {
    id: string;
    name: string;
    game: string;
    img: string;
    desc: string;
    values: Record<string, number>;
}

interface Column {
    key: string;
    label: string;
    /** larger is better, so clicking sorts high to low first */
    desc?: boolean;
    places?: number;
}

const columns: Record<Tab, Column[]> = {
    gun: [
        { key: "damage", label: "Damage", desc: true, places: 1 },
        { key: "pellets", label: "Pellets", desc: true },
        { key: "dps", label: "DPS", desc: true },
        { key: "rate", label: "Shots/s", desc: true, places: 1 },
        { key: "clip", label: "Clip", desc: true },
        { key: "reload", label: "Reload s", places: 1 },
        { key: "range", label: "Range", desc: true },
        { key: "speed", label: "Bullet speed", desc: true },
    ],
    melee: [
        { key: "damage", label: "Damage", desc: true },
        { key: "swing", label: "s/swing", places: 2 },
        { key: "dps", label: "DPS", desc: true },
        { key: "reach", label: "Reach", desc: true, places: 1 },
    ],
};

function round(n: number, places = 0) {
    const m = 10 ** places;
    return Math.round(n * m) / m;
}

function lootImg(id: string) {
    return (GameObjectDefs.typeToDef(id) as { lootImg: { sprite: string } }).lootImg.sprite;
}

function gunRows(): Row[] {
    return CustomGuns.filter(([id]) => !HiddenCustomGuns.has(id)).map(([id, name, game, , effect]) => {
        const def = GameObjectDefs.typeToDef(id, "gun");
        const bullet = GameObjectDefs.typeToDef(def.bulletType, "bullet");
        const rate = 1 / def.fireDelay;
        return {
            id,
            name,
            game,
            img: lootImg(id),
            desc: [GunEffectText[effect] ?? "", Notes[id] ?? ""].filter(Boolean).join(" "),
            values: {
                damage: bullet.damage,
                pellets: def.bulletCount,
                dps: bullet.damage * def.bulletCount * rate,
                rate,
                clip: def.maxClip,
                reload: def.reloadTime,
                range: bullet.distance,
                speed: bullet.speed,
            },
        };
    });
}

function meleeRows(): Row[] {
    return CustomMelees.map(([id, name, game]) => {
        const def = GameObjectDefs.typeToDef(id, "melee");
        return {
            id,
            name,
            game,
            img: lootImg(id),
            desc: SwordText[id] ?? (SwingShots[id] ? "Fires a projectile each swing." : "Swings hard and wide."),
            values: {
                damage: def.damage,
                swing: def.attack.cooldownTime,
                dps: def.damage / def.attack.cooldownTime,
                reach: def.attack.offset.x + def.attack.rad,
            },
        };
    });
}

/** The catalog of Terraria and Pixel Gun 3D weapons, opened from the icon next to the Armory. */
export function initCrossoverCatalog() {
    const modal = $("#modal-crossover");
    if (!modal.length) return;
    const rows: Record<Tab, Row[]> = { gun: gunRows(), melee: meleeRows() };
    const table = $("#crossover-table");
    let tab: Tab = "gun";
    let game = "";
    let sortKey = "name";
    let sortDesc = false;

    function render() {
        const cols = columns[tab];
        const query = (($("#crossover-search").val() as string) || "").trim().toLowerCase();
        const list = rows[tab]
            .filter((row) => (!game || row.game === game) && (!query || row.name.toLowerCase().includes(query)))
            .sort((a, b) => {
                const cmp = sortKey === "name"
                    ? a.name.localeCompare(b.name)
                    : sortKey === "game"
                    ? a.game.localeCompare(b.game) || a.name.localeCompare(b.name)
                    : a.values[sortKey] - b.values[sortKey];
                return sortDesc ? -cmp : cmp;
            });

        const head = $("<tr>").append(
            $("<th>", { class: "armory-th armory-th-name", text: "Weapon", "data-key": "name" }),
            $("<th>", { class: "armory-th armory-text", text: "Game", "data-key": "game" }),
        );
        for (const col of cols) head.append($("<th>", { class: "armory-th", text: col.label, "data-key": col.key }));
        head.append($("<th>", { class: "armory-text", text: "What it does" }));
        head.find(`.armory-th[data-key="${sortKey}"]`).addClass(sortDesc ? "sort-desc" : "sort-asc");

        const body = $("<tbody>");
        for (const row of list) {
            const tr = $("<tr>", { class: "armory-row" }).append(
                $("<td>", { class: "armory-name" }).append(
                    $("<img>", { class: "armory-img", src: row.img, alt: "" }),
                    $("<span>", { text: row.name }),
                ),
                $("<td>", { class: "armory-text", text: row.game }),
            );
            for (const col of cols) tr.append($("<td>", { text: round(row.values[col.key], col.places) }));
            tr.append($("<td>", { class: "armory-text", text: row.desc }));
            body.append(tr);
        }
        table.empty().append($("<thead>").append(head), body);
        $("#crossover-count").text(`${list.length} of ${rows[tab].length}`);
    }

    $("#crossover-tabs").on("click", ".armory-tab", (e) => {
        $("#crossover-tabs .armory-tab").removeClass("armory-tab-selected");
        $(e.currentTarget).addClass("armory-tab-selected");
        tab = $(e.currentTarget).attr("data-tab") as Tab;
        sortKey = "name";
        sortDesc = false;
        render();
    });
    $("#crossover-games").on("click", ".armory-tab", (e) => {
        $("#crossover-games .armory-tab").removeClass("armory-tab-selected");
        $(e.currentTarget).addClass("armory-tab-selected");
        game = $(e.currentTarget).attr("data-game") || "";
        render();
    });
    table.on("click", ".armory-th", (e) => {
        const key = $(e.currentTarget).attr("data-key")!;
        if (key === sortKey) {
            sortDesc = !sortDesc;
        } else {
            sortKey = key;
            sortDesc = !!columns[tab].find((c) => c.key === key)?.desc;
        }
        render();
    });
    $("#crossover-search").on("input", render);
    render();
}
