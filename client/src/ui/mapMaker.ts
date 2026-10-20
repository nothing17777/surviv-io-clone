import $ from "jquery";
import { MapDefs } from "../../../shared/defs/mapDefs.ts";
import { RawMapObjectDefs } from "../../../shared/defs/mapObjectDefs.ts";
import { MapObjectDefs } from "../../../shared/defs/register.ts";
import { GameConfig } from "../../../shared/gameConfig.ts";
import { coldet, type Collider } from "../../../shared/utils/coldet.ts";
import { collider } from "../../../shared/utils/collider.ts";
import {
    type CustomMap,
    type CustomMapBiome,
    customMapBiomes,
    customMapGrassInset,
    CustomMapLimits,
    customMapShoreInset,
    fitInsideMap,
    parseCustomMap,
    smoothRiverPoints,
} from "../../../shared/utils/customMap.ts";
import { mapHelpers } from "../../../shared/utils/mapHelpers.ts";
import { math } from "../../../shared/utils/math.ts";
import { generateTerrain } from "../../../shared/utils/terrainGen.ts";
import { util } from "../../../shared/utils/util.ts";
import { v2, type Vec2 } from "../../../shared/utils/v2.ts";
import { itemImage } from "./modePicker.ts";

/**
 * Map maker: a top-down editor drawn the same way as the in-game minimap
 * (biome colors, minimap shapes of every object). Maps are plain JSON files
 * (see shared/utils/customMap.ts) kept in localStorage, downloadable, and
 * uploadable to a private party match.
 */

type Tool = "select" | "place" | "erase" | "river" | "spawnA" | "spawnB";

const svg = (body: string) =>
    `<svg class="mm-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`;

const toolIcons: Record<Tool, string> = {
    select: svg(`<path d="M5 3l14 8-6 2-3 6z" fill="currentColor"/>`),
    place: svg(`<path d="M12 5v14M5 12h14"/>`),
    erase: svg(`<path d="M7 21h10M4 15l9-9 6 6-7 7H8z"/>`),
    river: svg(`<path d="M3 8c3-3 6 3 9 0s6 3 9 0M3 16c3-3 6 3 9 0s6 3 9 0"/>`),
    spawnA: svg(
        `<circle cx="12" cy="12" r="9" fill="#3d8bff" stroke="none"/><text x="12" y="16.5" font-size="12" text-anchor="middle" fill="#fff" stroke="none" font-weight="bold">A</text>`,
    ),
    spawnB: svg(
        `<circle cx="12" cy="12" r="9" fill="#ff4d4d" stroke="none"/><text x="12" y="16.5" font-size="12" text-anchor="middle" fill="#fff" stroke="none" font-weight="bold">B</text>`,
    ),
};

const categoryIcons: Record<Category, string> = {
    Nature: "img/map/map-tree-01.svg",
    Cover: "img/map/map-crate-01.svg",
    Buildings: "img/map/map-building-house-ceiling.svg",
    Bunkers: "img/map/map-bunker-hydra-ceiling-01.svg",
    Tunnels: "img/map/map-bunker-hydra-ceiling-01.svg",
    Walls: "img/map/map-wall-02.svg",
    Loot: "img/loot/loot-ammo-box.svg",
    All: "",
};

const tools: Array<{ id: Tool; label: string; key: string; tip: string }> = [
    { id: "select", label: "Select", key: "1", tip: "Click to select, drag to move. Drag empty ground to pan." },
    { id: "place", label: "Place", key: "2", tip: "Click to place the picked object. Hold and drag to paint." },
    { id: "erase", label: "Erase", key: "3", tip: "Click or drag over things to remove them." },
    { id: "river", label: "River", key: "4", tip: "Click to add points, double-click or Enter to finish." },
    { id: "spawnA", label: "Spawn A", key: "5", tip: "Click to add a Team A start point." },
    { id: "spawnB", label: "Spawn B", key: "6", tip: "Click to add a Team B start point." },
];

const storageKey = "survev_custom_maps";

interface SavedMap {
    id: string;
    savedAt: number;
    map: CustomMap;
}

//
// Object catalog
//

type Category = "Nature" | "Cover" | "Buildings" | "Bunkers" | "Tunnels" | "Walls" | "Loot" | "All";
const categories: Category[] = ["Nature", "Cover", "Buildings", "Bunkers", "Tunnels", "Walls", "Loot", "All"];

interface CatalogItem {
    id: string;
    name: string;
    category: Category | null;
    img: string;
    color: string;
}

function hex(color: number) {
    return `#${(color >>> 0).toString(16).padStart(6, "0").slice(-6)}`;
}

function prettyName(id: string) {
    return id
        .replace(/_/g, " ")
        .replace(/\b(\w)/g, (c) => c.toUpperCase());
}

function categoryOf(id: string, type: string): Category | null {
    if (type === "loot_spawner") return /test/.test(id) ? null : "Loot";
    if (type === "structure") return /bridge/.test(id) ? null : "Bunkers";
    if (type === "building") {
        if (
            /sublevel|compartment|_under|basement|cellar|stairs|^bunker_|^bridge_|sideroom|vault|panicroom|saferoom/
                .test(id)
        ) {
            return null;
        }
        if (/^cache_|^candle/.test(id)) return "Cover";
        if (/^(brush_clump|kopje|savannah_patch|grassy_cover)/.test(id)) return "Nature";
        return "Buildings";
    }
    if (
        /door|window|stairs|collider|column|rail|_bar_|bar_back|_int_|^recorder|^button|^switch_0|^control_panel|^class_/
            .test(id)
    ) {
        return null;
    }
    if (/wall/.test(id)) return "Walls";
    if (/^(tree|stone|bush|brush|rock|log|cactus|bamboo|pumpkin)/.test(id)) return "Nature";
    return "Cover";
}

function spriteOf(def: Record<string, any>): string {
    let sprite: string | undefined;
    if (def.type === "obstacle") sprite = def.img?.sprite;
    else if (def.type === "building") sprite = def.ceiling?.imgs?.[0]?.sprite || def.floor?.imgs?.[0]?.sprite;
    else if (def.type === "structure") {
        const top = MapObjectDefs.typeToDefSafe(def.layers?.[0]?.type) as Record<string, any> | undefined;
        if (top) return spriteOf(top);
    }
    if (def.type === "loot_spawner") return lootIcon(def);
    return sprite && sprite !== "none" && sprite.endsWith(".img") ? `img/map/${sprite.replace(/\.img$/, ".svg")}` : "";
}

/** a loot spot shows the item it drops when it's a single item, a crate otherwise */
function lootIcon(def: Record<string, any>) {
    const tier = String(def.loot?.[0]?.tier ?? "").replace(/^tier_/, "");
    return itemImage(tier) || "img/loot/loot-ammo-box.svg";
}

let catalog: CatalogItem[] | undefined;

function getCatalog() {
    if (catalog) return catalog;
    catalog = [];
    for (const [id, def] of Object.entries(RawMapObjectDefs) as Array<[string, Record<string, any>]>) {
        if (!["obstacle", "building", "structure", "loot_spawner"].includes(def.type)) continue;
        const shapes = localShapes(id);
        let category = categoryOf(id, def.type);
        // a structure with several stairs is an underground passage between entrances
        if (category === "Bunkers" && id.startsWith("bunker_") && (def.stairs?.length ?? 0) >= 2) category = "Tunnels";
        catalog.push({
            id,
            name: prettyName(id),
            category,
            img: spriteOf(def),
            color: hex((shapes.find((s) => s.z < 2000) ?? shapes[0])?.color ?? 0x888888),
        });
    }
    catalog.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
    return catalog;
}

//
// Minimap-style shapes, in object space, children included
//

interface Shape {
    col: Collider;
    color: number;
    scale: number;
    z: number;
}

const shapeCache = new Map<string, Shape[]>();

function pickType(t: unknown): string {
    if (typeof t === "string") return t;
    if (t && typeof t === "object") {
        const entries = Object.entries(t as Record<string, number>).sort((a, b) => b[1] - a[1]);
        return entries[0]?.[0] ?? "";
    }
    return "";
}

function transformShapes(shapes: Shape[], pos: Vec2, ori: number, scale: number): Shape[] {
    return shapes.map((s) => ({
        ...s,
        col: collider.transform(s.col, pos, math.oriToRad(ori), scale),
    }));
}

function localShapes(type: string, depth = 0): Shape[] {
    const cached = shapeCache.get(type);
    if (cached) return cached;
    const def = MapObjectDefs.typeToDefSafe(type) as Record<string, any> | undefined;
    const out: Shape[] = [];
    if (!def || depth > 6) return out;

    if (def.type === "loot_spawner") {
        out.push({ col: collider.createCircle(v2.create(0, 0), 1.5), color: 0xffd34d, scale: 1, z: 2000 });
    } else if (def.type === "structure") {
        const top = def.layers?.[0];
        if (top) out.push(...transformShapes(localShapes(pickType(top.type), depth + 1), top.pos, top.ori, 1));
    } else if (def.type === "obstacle" || def.type === "building") {
        const z = def.type === "building" ? 750 + (def.zIdx || 0) : def.img?.zIdx || 0;
        if (def.map?.display) {
            if (def.map.shapes) {
                for (const s of def.map.shapes) {
                    out.push({ col: collider.copy(s.collider), color: s.color, scale: s.scale ?? 1, z });
                }
            } else {
                const col = def.type === "obstacle"
                    ? def.collision
                    : def.ceiling?.zoomRegions?.[0]?.zoomIn ?? mapHelpers.getBoundingCollider(type);
                if (col) {
                    out.push({
                        col: collider.copy(col),
                        color: def.map.color ?? 0x888888,
                        scale: def.map.scale ?? 1,
                        z,
                    });
                }
            }
        }
        if (def.type === "building") {
            for (const child of def.mapObjects ?? []) {
                const t = pickType(child.type);
                if (!t) continue;
                out.push(...transformShapes(localShapes(t, depth + 1), child.pos, child.ori ?? 0, child.scale ?? 1));
            }
        }
    }
    if (!out.length && depth === 0) {
        const col = mapHelpers.getBoundingCollider(type);
        out.push({ col: collider.copy(col), color: 0x8a8a8a, scale: 1, z: 0 });
    }
    shapeCache.set(type, out);
    return out;
}

const undergroundCache = new Map<string, Shape[]>();
const tunnelColor = 0x6b5a48;
const stairsColor = 0xe0b84d;

/** Below-ground view of a structure: its sublevel floors plus the stairs leading down. */
function undergroundShapes(type: string): Shape[] {
    const cached = undergroundCache.get(type);
    if (cached) return cached;
    const def = MapObjectDefs.typeToDefSafe(type) as Record<string, any> | undefined;
    const out: Shape[] = [];
    if (def?.type === "structure") {
        for (const layer of def.layers.slice(1)) {
            const sub = MapObjectDefs.typeToDefSafe(pickType(layer.type)) as Record<string, any> | undefined;
            if (!sub) continue;
            const cols: Collider[] = [
                ...(sub.floor?.surfaces ?? []).flatMap((f: { collision: Collider[] }) => f.collision),
                ...(sub.ceiling?.zoomRegions ?? []).map((z: { zoomIn?: Collider }) => z.zoomIn).filter(Boolean),
            ];
            const local = cols.map((c) => ({ col: collider.copy(c), color: tunnelColor, scale: 1, z: 0 }));
            out.push(...transformShapes(local, layer.pos, layer.ori, 1));
        }
        for (const st of def.stairs ?? []) {
            out.push({ col: collider.copy(st.collision), color: stairsColor, scale: 1, z: 1 });
        }
    }
    undergroundCache.set(type, out);
    return out;
}

function objectBounds(obj: CustomMap["objects"][number]) {
    const col = collider.transform(
        mapHelpers.getBoundingCollider(obj.type),
        v2.create(obj.x, obj.y),
        math.oriToRad(obj.ori),
        obj.scale ?? 1,
    );
    return collider.toAabb(col);
}

function typeRadius(type: string) {
    const aabb = collider.toAabb(mapHelpers.getBoundingCollider(type));
    return v2.length(v2.sub(aabb.max, aabb.min)) * 0.5;
}

function isObstacle(type: string) {
    return MapObjectDefs.typeToDefSafe(type)?.type === "obstacle";
}

//
// Templates
//

function emptyMap(name: string, size: number, biome: CustomMapBiome = "main"): CustomMap {
    return {
        format: "survev-map",
        version: 1,
        name,
        biome,
        width: size,
        height: size,
        noLoot: false,
        rivers: [],
        objects: [],
        spawns: [],
    };
}

function cornerSpawns(map: CustomMap) {
    const inset = customMapShoreInset + customMapGrassInset + 20;
    map.spawns.push({ x: inset, y: inset, side: 0 });
    map.spawns.push({ x: map.width - inset, y: map.height - inset, side: 1 });
}

/** Drop objects at random free spots on the grass, away from water and each other. */
function scatter(
    map: CustomMap,
    rand: () => number,
    type: string,
    count: number,
    area?: { x: number; y: number; rad: number },
) {
    const rad = typeRadius(type);
    const inset = customMapShoreInset + customMapGrassInset + rad + 2;
    const rivers = map.rivers.map((r) => ({ pts: smoothRiverPoints(r.points, r.looped), width: r.width }));
    const keepClear = map.spawns.map((s) => ({ x: s.x, y: s.y, r: 10 }));

    for (let n = 0; n < count; n++) {
        for (let attempt = 0; attempt < 60; attempt++) {
            let x: number;
            let y: number;
            if (area) {
                const a = rand() * Math.PI * 2;
                const d = Math.sqrt(rand()) * area.rad;
                x = area.x + Math.cos(a) * d;
                y = area.y + Math.sin(a) * d;
            } else {
                x = inset + rand() * (map.width - inset * 2);
                y = inset + rand() * (map.height - inset * 2);
            }
            if (x < inset || y < inset || x > map.width - inset || y > map.height - inset) continue;
            const pos = v2.create(x, y);
            const nearWater = rivers.some((r) => r.pts.some((p) => v2.distance(p, pos) < r.width + rad + 6));
            if (nearWater) continue;
            if (keepClear.some((c) => Math.hypot(c.x - x, c.y - y) < c.r + rad)) continue;
            const hit = map.objects.some((o) => Math.hypot(o.x - x, o.y - y) < typeRadius(o.type) * 0.8 + rad * 0.8);
            if (hit) continue;
            map.objects.push({ type, x: Math.round(x), y: Math.round(y), ori: Math.floor(rand() * 4) });
            break;
        }
    }
}

interface Template {
    id: string;
    name: string;
    desc: string;
    build: (rand: () => number) => CustomMap;
}

const templates: Template[] = [
    {
        id: "blank",
        name: "Blank Island",
        desc: "An empty island. Build everything yourself.",
        build: () => {
            const map = emptyMap("My Map", 256);
            cornerSpawns(map);
            return map;
        },
    },
    {
        id: "duel",
        name: "Duel Arena",
        desc: "Small arena with scattered trees, rocks and crates.",
        build: (rand) => {
            const map = emptyMap("Duel Arena", 256);
            cornerSpawns(map);
            scatter(map, rand, "container_01", 2);
            scatter(map, rand, "tree_01", 16);
            scatter(map, rand, "stone_01", 12);
            scatter(map, rand, "bush_01", 12);
            scatter(map, rand, "crate_01", 8);
            scatter(map, rand, "barrel_01", 4);
            scatter(map, rand, "hedgehog_01", 4);
            return map;
        },
    },
    {
        id: "forest",
        name: "Dense Forest",
        desc: "Thick woods, good for close fights.",
        build: (rand) => {
            const map = emptyMap("Forest", 320, "woods");
            cornerSpawns(map);
            scatter(map, rand, "tree_07", 70);
            scatter(map, rand, "tree_01", 40);
            scatter(map, rand, "stone_01", 18);
            scatter(map, rand, "bush_01", 30);
            scatter(map, rand, "crate_01", 6);
            return map;
        },
    },
    {
        id: "river",
        name: "River Crossing",
        desc: "A river splits the map; each team starts on one bank.",
        build: (rand) => {
            const map = emptyMap("River Crossing", 320);
            const mid = map.height / 2;
            map.rivers.push({
                width: 10,
                looped: false,
                points: [0, 0.25, 0.5, 0.75, 1].map((t) => ({
                    x: Math.round(t * map.width),
                    y: Math.round(mid + (rand() - 0.5) * 50),
                })),
            });
            map.spawns.push({ x: map.width / 2, y: 70, side: 0 });
            map.spawns.push({ x: map.width / 2, y: map.height - 70, side: 1 });
            scatter(map, rand, "shack_01", 2);
            scatter(map, rand, "tree_01", 30);
            scatter(map, rand, "stone_01", 16);
            scatter(map, rand, "bush_01", 18);
            scatter(map, rand, "crate_01", 8);
            return map;
        },
    },
    {
        id: "lake",
        name: "Lake",
        desc: "A lake in the middle with cover all around it.",
        build: (rand) => {
            const map = emptyMap("Lake", 352);
            const c = map.width / 2;
            const points = [];
            for (let i = 0; i < 8; i++) {
                const a = (i / 8) * Math.PI * 2;
                const r = 46 * (0.85 + rand() * 0.3);
                points.push({ x: Math.round(c + Math.cos(a) * r), y: Math.round(c + Math.sin(a) * r) });
            }
            map.rivers.push({ width: 20, looped: true, points });
            cornerSpawns(map);
            scatter(map, rand, "house_red_01", 2);
            scatter(map, rand, "tree_01", 36);
            scatter(map, rand, "stone_01", 18);
            scatter(map, rand, "bush_01", 20);
            scatter(map, rand, "crate_01", 10);
            return map;
        },
    },
    {
        id: "town",
        name: "Small Town",
        desc: "Houses, a barn and a warehouse to fight through.",
        build: (rand) => {
            const map = emptyMap("Small Town", 384);
            cornerSpawns(map);
            const c = map.width / 2;
            const town = { x: c, y: c, rad: 110 };
            scatter(map, rand, "police_01", 1, town);
            scatter(map, rand, "warehouse_01", 1, town);
            scatter(map, rand, "barn_01", 1, town);
            scatter(map, rand, "house_red_01", 2, town);
            scatter(map, rand, "house_red_02", 2, town);
            scatter(map, rand, "shack_01", 2);
            scatter(map, rand, "tree_01", 40);
            scatter(map, rand, "stone_01", 20);
            scatter(map, rand, "bush_01", 20);
            scatter(map, rand, "crate_01", 12);
            scatter(map, rand, "barrel_01", 6);
            return map;
        },
    },
    {
        id: "bunkers",
        name: "Bunker Wars",
        desc: "Each team gets a bunker, with containers in between.",
        build: (rand) => {
            const map = emptyMap("Bunker Wars", 320, "desert");
            const inset = 90;
            map.objects.push({ type: "bunker_structure_01", x: inset, y: inset, ori: 0 });
            map.objects.push({ type: "bunker_structure_01", x: map.width - inset, y: map.height - inset, ori: 2 });
            map.spawns.push({ x: inset + 24, y: inset - 24, side: 0 });
            map.spawns.push({ x: map.width - inset - 24, y: map.height - inset + 24, side: 1 });
            const c = { x: map.width / 2, y: map.height / 2, rad: 60 };
            scatter(map, rand, "container_01", 3, c);
            scatter(map, rand, "container_02", 2, c);
            scatter(map, rand, "stone_01", 20);
            scatter(map, rand, "bush_01", 14);
            scatter(map, rand, "crate_01", 8);
            return map;
        },
    },
];

//
// Storage
//

function loadSaved(): SavedMap[] {
    try {
        const list = JSON.parse(localStorage.getItem(storageKey) || "[]") as SavedMap[];
        return list.filter((s) => s && typeof s.id === "string" && !("error" in parseCustomMap(s.map)));
    } catch {
        return [];
    }
}

function writeSaved(list: SavedMap[]) {
    localStorage.setItem(storageKey, JSON.stringify(list));
}

//
// Editor
//

type Drag =
    | { kind: "pan"; startX: number; startY: number; camX: number; camY: number }
    | { kind: "object"; idx: number; offset: Vec2; moved: boolean; before: string }
    | { kind: "spawn"; idx: number; moved: boolean; before: string }
    | { kind: "riverPoint"; river: number; point: number; moved: boolean; before: string }
    | { kind: "paint"; last: Vec2 }
    | { kind: "erase" };

type Selection =
    | { kind: "object"; idx: number }
    | { kind: "spawn"; idx: number }
    | { kind: "river"; idx: number }
    | null;

class MapMaker {
    root = $("#map-maker");
    canvas!: HTMLCanvasElement;
    ctx!: CanvasRenderingContext2D;

    map: CustomMap = emptyMap("My Map", 256);
    savedId: string | null = null;
    dirty = false;

    tool: Tool = "select";
    underground = false;
    placeType = "tree_01";
    placeOri = 0;
    snap = true;
    category: Category = "Nature";
    search = "";

    cam = { x: 128, y: 128, zoom: 2 };
    mouse: Vec2 | null = null;
    spaceDown = false;
    drag: Drag | null = null;
    selection: Selection = null;

    riverDraft: Vec2[] = [];
    /** half width, like the game's own rivers */
    riverWidth = 8;
    riverLake = false;

    undoStack: string[] = [];
    redoStack: string[] = [];

    terrainKey = "";
    terrain!: ReturnType<typeof generateTerrain>;

    renderQueued = false;
    partyHook: ((map: CustomMap) => void) | null = null;

    constructor() {
        this.build();
    }

    //
    // DOM
    //

    build() {
        const biomeOptions = Object.entries(customMapBiomes)
            .map(([id, name]) => `<option value="${id}">${name}</option>`)
            .join("");
        const toolButtons = tools
            .map((t) =>
                `<button class="mm-tool" data-tool="${t.id}" title="${t.tip} (${t.key})">`
                + `${toolIcons[t.id]}${t.label}<span class="mm-key">${t.key}</span></button>`
            )
            .join("");
        const catTabs = categories
            .map((c) =>
                `<button class="mm-cat" data-cat="${c}">`
                + (categoryIcons[c] ? `<img class="mm-cat-icon" src="${categoryIcons[c]}" alt="">` : "")
                + `${c}</button>`
            )
            .join("");

        this.root.html(`
            <div class="mm-topbar">
                <button class="mm-btn" id="mm-home" title="New map, templates and your saved maps">Maps</button>
                <input id="mm-name" class="mm-input" maxlength="32" spellcheck="false" title="Map name">
                <div class="mm-tools">${toolButtons}</div>
                <div class="mm-spacer"></div>
                <button class="mm-btn" id="mm-undo" title="Undo (Ctrl+Z)">Undo</button>
                <button class="mm-btn" id="mm-redo" title="Redo (Ctrl+Y)">Redo</button>
                <button class="mm-btn" id="mm-save" title="Save to this browser (Ctrl+S)">Save</button>
                <button class="mm-btn" id="mm-download" title="Download the map file">Download</button>
                <button class="mm-btn mm-btn-go" id="mm-use" title="Upload to your party's private match">Use in Party</button>
                <button class="mm-btn mm-close" id="mm-close" title="Close (Esc)">&times;</button>
            </div>
            <div class="mm-main">
                <div class="mm-side mm-left">
                    <input id="mm-search" class="mm-input" placeholder="Search objects" spellcheck="false">
                    <div class="mm-cats">${catTabs}</div>
                    <div class="mm-palette"></div>
                </div>
                <div class="mm-view">
                    <canvas class="mm-canvas"></canvas>
                    <div class="mm-hint"></div>
                    <div class="mm-coords"></div>
                    <div class="mm-zoom">
                        <button class="mm-btn" id="mm-zoom-in" title="Zoom in (+)">+</button>
                        <button class="mm-btn" id="mm-zoom-out" title="Zoom out (-)">&minus;</button>
                        <button class="mm-btn" id="mm-fit" title="Fit map (F)">Fit</button>
                        <button class="mm-btn" id="mm-under" title="Show tunnels and bunkers below ground (U)">Underground</button>
                    </div>
                    <div class="mm-toast"></div>
                </div>
                <div class="mm-side mm-right">
                    <div class="mm-panel">
                        <h3>Map</h3>
                        <label>Biome <select id="mm-biome" class="mm-input">${biomeOptions}</select></label>
                        <label>Size
                            <span class="mm-size">
                                <input id="mm-width" class="mm-input" type="number" min="${CustomMapLimits.minSize}" max="${CustomMapLimits.maxSize}" step="16">
                                &times;
                                <input id="mm-height" class="mm-input" type="number" min="${CustomMapLimits.minSize}" max="${CustomMapLimits.maxSize}" step="16">
                            </span>
                        </label>
                        <label class="mm-check"><input id="mm-noloot" type="checkbox"> No loot
                            <span class="mm-sub">crates, buildings and airdrops drop nothing</span></label>
                        <label class="mm-check"><input id="mm-storm" type="checkbox"> Storm
                            <span class="mm-sub">faster gas, next circle can overlap the storm</span></label>
                        <label class="mm-check"><input id="mm-snap" type="checkbox"> Snap to grid <span class="mm-key">G</span></label>
                        <div class="mm-stats"></div>
                    </div>
                    <div class="mm-panel" id="mm-inspect"></div>
                    <div class="mm-panel mm-help">
                        <h3>Controls</h3>
                        <div><b>Pan</b> right-drag, space-drag, or drag empty ground</div>
                        <div><b>Zoom</b> mouse wheel</div>
                        <div><b>Rotate</b> R</div>
                        <div><b>Delete</b> Del / Backspace</div>
                        <div><b>Nudge</b> arrow keys</div>
                        <div><b>Undo</b> Ctrl+Z &nbsp; <b>Redo</b> Ctrl+Y</div>
                    </div>
                </div>
            </div>
            <div class="mm-home">
                <div class="mm-home-box">
                    <div class="mm-home-head">
                        <h2>Map Maker</h2>
                        <button class="mm-btn mm-close" id="mm-home-close" title="Back to the editor">&times;</button>
                    </div>
                    <h3>Start from a template</h3>
                    <div class="mm-templates"></div>
                    <h3>Your maps <span class="mm-sub">saved in this browser</span></h3>
                    <div class="mm-saved"></div>
                    <div class="mm-home-actions">
                        <button class="mm-btn" id="mm-import">Open a map file&hellip;</button>
                        <input type="file" id="mm-import-file" accept=".json,application/json" hidden>
                    </div>
                </div>
            </div>
        `);

        this.canvas = this.root.find(".mm-canvas")[0] as HTMLCanvasElement;
        this.ctx = this.canvas.getContext("2d")!;

        // toolbar
        this.root.on("click", ".mm-tool", (e) => this.setTool($(e.currentTarget).attr("data-tool") as Tool));
        this.root.find("#mm-close").on("click", () => this.close());
        this.root.find("#mm-home").on("click", () => this.showHome(true));
        this.root.find("#mm-home-close").on("click", () => this.showHome(false));
        this.root.find("#mm-undo").on("click", () => this.undo());
        this.root.find("#mm-redo").on("click", () => this.redo());
        this.root.find("#mm-save").on("click", () => this.save());
        this.root.find("#mm-download").on("click", () => this.download());
        this.root.find("#mm-use").on("click", () => this.useInParty());
        this.root.find("#mm-zoom-in").on("click", () => this.zoomBy(1.25));
        this.root.find("#mm-zoom-out").on("click", () => this.zoomBy(0.8));
        this.root.find("#mm-fit").on("click", () => this.fit());
        this.root.find("#mm-under").on("click", () => this.toggleUnderground());
        this.root.find("#mm-name").on("change", (e) => {
            const name = String($(e.currentTarget).val()).trim().slice(0, 32) || "My Map";
            this.edit(() => (this.map.name = name));
        });

        // map settings
        this.root.find("#mm-biome").on("change", (e) => {
            this.edit(() => (this.map.biome = $(e.currentTarget).val() as CustomMapBiome));
        });
        this.root.find("#mm-width, #mm-height").on("change", () => {
            const clampSize = (v: unknown) =>
                math.clamp(Math.round(Number(v) || 256), CustomMapLimits.minSize, CustomMapLimits.maxSize);
            const w = clampSize(this.root.find("#mm-width").val());
            const h = clampSize(this.root.find("#mm-height").val());
            this.edit(() => this.resize(w, h));
        });
        this.root.find("#mm-noloot").on("change", (e) => {
            this.edit(() => (this.map.noLoot = (e.currentTarget as HTMLInputElement).checked));
        });
        this.root.find("#mm-storm").on("change", (e) => {
            this.edit(() => (this.map.storm = (e.currentTarget as HTMLInputElement).checked));
        });
        this.root.find("#mm-snap").on("change", (e) => {
            this.snap = (e.currentTarget as HTMLInputElement).checked;
        });

        // palette
        this.root.find("#mm-search").on("input", (e) => {
            this.search = String($(e.currentTarget).val()).toLowerCase().trim();
            this.renderPalette();
        });
        this.root.on("click", ".mm-cat", (e) => {
            this.category = $(e.currentTarget).attr("data-cat") as Category;
            this.renderPalette();
        });
        this.root.on("click", ".mm-item", (e) => {
            this.placeType = $(e.currentTarget).attr("data-type")!;
            this.setTool("place");
            this.renderPalette();
        });

        // inspector
        this.root.on("click", "[data-act]", (e) => this.inspectorAction($(e.currentTarget).attr("data-act")!));
        this.root.on("change", "#mm-obj-scale", (e) => {
            const sel = this.selection;
            if (sel?.kind !== "object") return;
            const v = math.clamp(Number($(e.currentTarget).val()) || 1, 0.5, 2);
            this.edit(() => (this.map.objects[sel.idx].scale = Math.round(v * 100) / 100));
        });
        this.root.on("input change", "#mm-river-width", (e) => {
            const v = math.clamp(
                Math.round(Number($(e.currentTarget).val()) || 12),
                CustomMapLimits.minRiverWidth,
                CustomMapLimits.maxRiverWidth,
            );
            const sel = this.selection;
            if (sel?.kind === "river") {
                if (e.type === "change") this.edit(() => (this.map.rivers[sel.idx].width = v));
                else {
                    this.map.rivers[sel.idx].width = v;
                    this.queueRender();
                }
            } else {
                this.riverWidth = v;
            }
            this.root.find("#mm-river-width-val").text(v);
        });
        this.root.on("change", "#mm-river-lake", (e) => {
            const checked = (e.currentTarget as HTMLInputElement).checked;
            const sel = this.selection;
            if (sel?.kind === "river") {
                if (checked && this.map.rivers[sel.idx].points.length < 3) {
                    this.toast("A lake needs at least 3 points.");
                    this.renderInspector();
                    return;
                }
                this.edit(() => (this.map.rivers[sel.idx].looped = checked));
            } else {
                this.riverLake = checked;
                this.queueRender();
            }
        });

        // home screen
        const tpl = this.root.find(".mm-templates");
        for (const t of templates) {
            const card = $("<button>", { class: "mm-card", "data-template": t.id });
            card.append($(sizedCanvas(240, 240)).addClass("mm-card-preview"));
            card.append($("<div>", { class: "mm-card-name", text: t.name }));
            card.append($("<div>", { class: "mm-card-desc", text: t.desc }));
            tpl.append(card);
        }
        this.root.on("click", ".mm-card", (e) => {
            const t = templates.find((t) => t.id === $(e.currentTarget).attr("data-template"));
            if (!t || !this.confirmDiscard()) return;
            this.loadMap(t.build(util.seededRand(Math.floor(Math.random() * 2 ** 31))), null);
            this.showHome(false);
        });
        this.root.on("click", "[data-saved-act]", (e) => {
            const el = $(e.currentTarget);
            this.savedAction(el.attr("data-saved-act")!, el.attr("data-id")!);
        });
        this.root.find("#mm-import").on("click", () => this.root.find("#mm-import-file").trigger("click"));
        this.root.find("#mm-import-file").on("change", async (e) => {
            const input = e.currentTarget as HTMLInputElement;
            const file = input.files?.[0];
            input.value = "";
            if (!file) return;
            const res = parseCustomMap(await file.text());
            if ("error" in res) {
                this.toast(res.error);
                return;
            }
            if (!this.confirmDiscard()) return;
            this.loadMap(res.map, null);
            this.showHome(false);
            this.toast(`Opened "${res.map.name}". Save it to keep it in this browser.`);
        });

        // canvas input
        this.canvas.addEventListener("mousedown", (e) => this.onMouseDown(e));
        window.addEventListener("mousemove", (e) => this.onMouseMove(e));
        window.addEventListener("mouseup", (e) => this.onMouseUp(e));
        this.canvas.addEventListener("dblclick", () => {
            if (this.tool === "river") this.finishRiver();
        });
        this.canvas.addEventListener("wheel", (e) => this.onWheel(e), { passive: false });
        this.canvas.addEventListener("contextmenu", (e) => e.preventDefault());
        this.canvas.addEventListener("mouseleave", () => {
            this.mouse = null;
            this.queueRender();
        });
        window.addEventListener("keydown", (e) => this.onKeyDown(e), true);
        window.addEventListener("keyup", (e) => {
            if (e.code === "Space") this.spaceDown = false;
        });
        window.addEventListener("resize", () => this.isOpen() && this.queueRender());
        window.addEventListener("beforeunload", (e) => {
            if (this.isOpen() && this.dirty) e.preventDefault();
        });
    }

    isOpen() {
        return this.root.hasClass("mm-open");
    }

    open() {
        this.root.addClass("mm-open");
        $("body").addClass("mm-body-lock");
        this.syncUi();
        this.showHome(!this.map.objects.length && !this.savedId && !this.dirty);
        requestAnimationFrame(() => this.fit());
    }

    close() {
        if (!this.confirmDiscard()) return;
        this.root.removeClass("mm-open");
        $("body").removeClass("mm-body-lock");
    }

    showHome(show: boolean) {
        this.root.find(".mm-home").toggle(show);
        if (!show) return;
        this.root.find("#mm-home-close").toggle(this.dirty || this.map.objects.length > 0 || !!this.savedId);
        this.root.find(".mm-card").each((_i, el) => {
            const t = templates.find((t) => t.id === $(el).attr("data-template"))!;
            const c = $(el).find("canvas")[0] as HTMLCanvasElement;
            drawThumbnail(c, t.build(util.seededRand(7)));
        });
        this.renderSaved();
    }

    renderSaved() {
        const box = this.root.find(".mm-saved").empty();
        const list = loadSaved().sort((a, b) => b.savedAt - a.savedAt);
        if (!list.length) {
            box.append($("<div>", { class: "mm-empty", text: "No saved maps yet. Pick a template above to begin." }));
            return;
        }
        for (const s of list) {
            const row = $("<div>", { class: "mm-saved-row" });
            const thumb = $(sizedCanvas(112, 112)).addClass("mm-saved-thumb");
            drawThumbnail(thumb[0] as HTMLCanvasElement, s.map);
            row.append(thumb);
            const info = $("<div>", { class: "mm-saved-info" });
            info.append($("<div>", { class: "mm-saved-name", text: s.map.name }));
            info.append(
                $("<div>", {
                    class: "mm-sub",
                    text:
                        `${
                            customMapBiomes[s.map.biome]
                        } · ${s.map.width}×${s.map.height} · ${s.map.objects.length} objects`
                        + (s.map.noLoot ? " · no loot" : "") + (s.map.storm ? " · storm" : "") + ` · ${new Date(s.savedAt).toLocaleDateString()}`,
                }),
            );
            row.append(info);
            const acts = $("<div>", { class: "mm-saved-acts" });
            const btn = (act: string, label: string, cls = "") =>
                $("<button>", { class: `mm-btn ${cls}`, "data-saved-act": act, "data-id": s.id, text: label });
            acts.append(btn("edit", "Edit"));
            if (this.partyHook) acts.append(btn("party", "Use in Party", "mm-btn-go"));
            acts.append(btn("download", "Download"));
            acts.append(btn("delete", "Delete", "mm-btn-danger"));
            row.append(acts);
            box.append(row);
        }
    }

    savedAction(act: string, id: string) {
        const list = loadSaved();
        const saved = list.find((s) => s.id === id);
        if (!saved) return;
        switch (act) {
            case "edit":
                if (!this.confirmDiscard()) return;
                this.loadMap(saved.map, saved.id);
                this.showHome(false);
                break;
            case "party":
                this.partyHook?.(saved.map);
                this.toast(`"${saved.map.name}" sent to your party.`);
                break;
            case "download":
                downloadMap(saved.map);
                break;
            case "delete":
                if (!confirm(`Delete "${saved.map.name}"? This can't be undone.`)) return;
                writeSaved(list.filter((s) => s.id !== id));
                if (this.savedId === id) this.savedId = null;
                this.renderSaved();
                break;
        }
    }

    confirmDiscard() {
        return !this.dirty || confirm("You have unsaved changes to this map. Discard them?");
    }

    loadMap(map: CustomMap, savedId: string | null) {
        this.map = util.cloneDeep(map);
        this.savedId = savedId;
        this.dirty = false;
        this.selection = null;
        this.riverDraft = [];
        this.undoStack = [];
        this.redoStack = [];
        this.syncUi();
        this.fit();
    }

    syncUi() {
        this.root.find("#mm-name").val(this.map.name);
        this.root.find("#mm-biome").val(this.map.biome);
        this.root.find("#mm-width").val(this.map.width);
        this.root.find("#mm-height").val(this.map.height);
        this.root.find("#mm-noloot").prop("checked", this.map.noLoot);
        this.root.find("#mm-storm").prop("checked", !!this.map.storm);
        this.root.find("#mm-snap").prop("checked", this.snap);
        this.root.find("#mm-use").toggle(!!this.partyHook);
        this.root.find(".mm-tool").each((_i, el) => {
            $(el).toggleClass("mm-active", $(el).attr("data-tool") === this.tool);
        });
        const tip = tools.find((t) => t.id === this.tool)!.tip;
        this.root.find(".mm-hint").text(tip);
        this.root.find("#mm-undo").prop("disabled", !this.undoStack.length);
        this.root.find("#mm-redo").prop("disabled", !this.redoStack.length);
        this.root.find("#mm-save").toggleClass("mm-unsaved", this.dirty);
        const a = this.map.spawns.filter((s) => s.side === 0).length;
        const b = this.map.spawns.length - a;
        this.root.find(".mm-stats").html("").append(
            $("<div>", { text: `${this.map.objects.length} / ${CustomMapLimits.maxObjects} objects` }),
            $("<div>", { text: `${this.map.rivers.length} rivers & lakes` }),
            $("<div>", {
                text: a || b ? `Spawns: ${a} Team A, ${b} Team B` : "No spawns set: players start at random spots",
            }),
        );
        this.renderPalette();
        this.renderInspector();
        this.queueRender();
    }

    renderPalette() {
        this.root.find(".mm-cat").each((_i, el) => {
            $(el).toggleClass("mm-active", !this.search && $(el).attr("data-cat") === this.category);
        });
        const box = this.root.find(".mm-palette").empty();
        const q = this.search;
        const items = getCatalog().filter((item) => {
            if (q) return item.name.toLowerCase().includes(q) || item.id.includes(q);
            return this.category === "All" || item.category === this.category;
        });
        for (const item of items.slice(0, 400)) {
            const el = $("<button>", {
                class: `mm-item${item.id === this.placeType ? " mm-active" : ""}`,
                "data-type": item.id,
                title: item.id,
            });
            const thumb = $("<div>", { class: "mm-thumb" }).css("background-color", item.color);
            if (item.img) {
                const img = $("<img>", { src: item.img, alt: "", loading: "lazy", draggable: false });
                img.on("load", () => thumb.css("background-color", "transparent"));
                img.on("error", () => img.remove());
                thumb.append(img);
            }
            el.append(thumb, $("<span>", { text: item.name }));
            box.append(el);
        }
        if (!items.length) box.append($("<div>", { class: "mm-empty", text: "Nothing matches." }));
        if (items.length > 400) {
            box.append($("<div>", { class: "mm-empty", text: `${items.length - 400} more, search to narrow down.` }));
        }
    }

    renderInspector() {
        const box = this.root.find("#mm-inspect").empty();
        const sel = this.selection;
        const btn = (act: string, label: string, cls = "") =>
            `<button class="mm-btn ${cls}" data-act="${act}">${label}</button>`;
        const riverControls = (width: number, lake: boolean) => `
            <label>Width <span id="mm-river-width-val">${width}</span>
                <input id="mm-river-width" type="range" min="${CustomMapLimits.minRiverWidth}" max="${CustomMapLimits.maxRiverWidth}" value="${width}"></label>
            <label class="mm-check"><input id="mm-river-lake" type="checkbox" ${
            lake ? "checked" : ""
        }> Lake (closed loop)</label>`;

        if (sel?.kind === "object") {
            const obj = this.map.objects[sel.idx];
            box.html(`<h3>Selected</h3><div class="mm-sel-name"></div>
                <div class="mm-row">${btn("rotl", "&#8634; Rotate")}${btn("rotr", "Rotate &#8635;")}</div>
                ${
                isObstacle(obj.type)
                    ? `<label>Scale <input id="mm-obj-scale" class="mm-input" type="number" min="0.5" max="2" step="0.1" value="${
                        obj.scale ?? 1
                    }"></label>`
                    : ""
            }
                <div class="mm-row">${btn("dup", "Duplicate")}${btn("del", "Delete", "mm-btn-danger")}</div>`);
            box.find(".mm-sel-name").text(prettyName(obj.type));
        } else if (sel?.kind === "spawn") {
            const s = this.map.spawns[sel.idx];
            box.html(`<h3>Spawn point</h3><div class="mm-sel-name">Team ${s.side === 0 ? "A" : "B"}</div>
                <div class="mm-row">${btn("side", "Switch team")}${btn("del", "Delete", "mm-btn-danger")}</div>`);
        } else if (sel?.kind === "river") {
            const r = this.map.rivers[sel.idx];
            box.html(`<h3>${r.looped ? "Lake" : "River"}</h3>
                <div class="mm-sub">Drag the white points to reshape it.</div>
                ${riverControls(r.width, r.looped)}
                <div class="mm-row">${btn("del", "Delete", "mm-btn-danger")}</div>`);
        } else if (this.tool === "river") {
            box.html(`<h3>New river</h3>
                <div class="mm-sub">${
                this.riverDraft.length
                    ? `${this.riverDraft.length} points. Double-click or Enter to finish, Esc to cancel.`
                    : "Click on the map to start drawing."
            }</div>
                ${riverControls(this.riverWidth, this.riverLake)}
                ${this.riverDraft.length >= 2 ? `<div class="mm-row">${btn("finish", "Finish")}</div>` : ""}`);
        } else if (this.tool === "place") {
            box.html(`<h3>Placing</h3><div class="mm-sel-name"></div>
                <div class="mm-sub">Click to place, drag to paint. R rotates.</div>`);
            box.find(".mm-sel-name").text(prettyName(this.placeType));
        } else {
            box.html(`<h3>Selected</h3><div class="mm-sub">Nothing. Click something on the map.</div>`);
        }
    }

    inspectorAction(act: string) {
        const sel = this.selection;
        switch (act) {
            case "rotl":
            case "rotr":
                this.rotate(act === "rotr" ? 1 : -1);
                break;
            case "del":
                this.deleteSelection();
                break;
            case "dup":
                if (sel?.kind === "object") {
                    const src = this.map.objects[sel.idx];
                    if (!this.roomForObjects()) return;
                    this.edit(() => {
                        this.map.objects.push(this.keepInside({ ...src, x: src.x + 8, y: src.y - 8 }));
                        this.selection = { kind: "object", idx: this.map.objects.length - 1 };
                    });
                }
                break;
            case "side":
                if (sel?.kind === "spawn") {
                    this.edit(() => (this.map.spawns[sel.idx].side ^= 1));
                }
                break;
            case "finish":
                this.finishRiver();
                break;
        }
    }

    toast(msg: string) {
        const el = this.root.find(".mm-toast");
        el.text(msg).addClass("mm-show");
        clearTimeout((el[0] as any)._timer);
        (el[0] as any)._timer = setTimeout(() => el.removeClass("mm-show"), 3200);
    }

    //
    // Editing
    //

    /** every change goes through here so undo, dirty and the UI stay in sync */
    edit(fn: () => void, before?: string) {
        this.undoStack.push(before ?? JSON.stringify(this.map));
        if (this.undoStack.length > 80) this.undoStack.shift();
        this.redoStack = [];
        fn();
        this.dirty = true;
        this.syncUi();
    }

    undo() {
        const prev = this.undoStack.pop();
        if (!prev) return;
        this.redoStack.push(JSON.stringify(this.map));
        this.map = JSON.parse(prev);
        this.selection = null;
        this.dirty = true;
        this.syncUi();
    }

    redo() {
        const next = this.redoStack.pop();
        if (!next) return;
        this.undoStack.push(JSON.stringify(this.map));
        this.map = JSON.parse(next);
        this.selection = null;
        this.dirty = true;
        this.syncUi();
    }

    toggleUnderground() {
        this.underground = !this.underground;
        this.root.find("#mm-under").toggleClass("mm-active", this.underground);
        this.toast(this.underground ? "Underground view: tunnels and bunker floors" : "Surface view");
        this.queueRender();
    }

    setTool(tool: Tool) {
        if (this.tool === "river" && tool !== "river") this.riverDraft = [];
        this.tool = tool;
        if (tool !== "select") this.selection = null;
        this.syncUi();
    }

    resize(w: number, h: number) {
        this.map.width = w;
        this.map.height = h;
        // keep everything on the map
        this.map.objects = this.map.objects.filter((o) => o.x <= w && o.y <= h);
        for (const o of this.map.objects) this.keepInside(o);
        this.map.spawns = this.map.spawns.filter((s) => s.x <= w && s.y <= h);
        for (const r of this.map.rivers) {
            for (const p of r.points) {
                p.x = Math.min(p.x, w);
                p.y = Math.min(p.y, h);
            }
        }
        this.selection = null;
    }

    clampX(x: number) {
        return math.clamp(x, 0, this.map.width);
    }

    clampY(y: number) {
        return math.clamp(y, 0, this.map.height);
    }

    snapPos(p: Vec2, step = 2) {
        if (!this.snap) return v2.create(Math.round(p.x * 4) / 4, Math.round(p.y * 4) / 4);
        return v2.create(Math.round(p.x / step) * step, Math.round(p.y / step) * step);
    }

    roomForObjects() {
        if (this.map.objects.length >= CustomMapLimits.maxObjects) {
            this.toast(`Maps can hold up to ${CustomMapLimits.maxObjects} objects.`);
            return false;
        }
        return true;
    }

    placeAt(world: Vec2) {
        if (!this.roomForObjects()) return;
        const p = this.snapPos(world);
        const obj = { type: this.placeType, x: p.x, y: p.y, ori: this.placeOri };
        this.map.objects.push(this.keepInside(obj));
    }

    /** big buildings can't hang off the edge, the server can't send that map */
    keepInside<T extends CustomMap["objects"][number]>(obj: T): T {
        const pos = fitInsideMap(obj, this.map.width, this.map.height);
        obj.x = Math.round(pos.x * 4) / 4;
        obj.y = Math.round(pos.y * 4) / 4;
        return obj;
    }

    rotate(dir: number) {
        const sel = this.selection;
        if (sel?.kind === "object") {
            this.edit(() => {
                const o = this.map.objects[sel.idx];
                o.ori = (o.ori + dir + 4) % 4;
                this.keepInside(o);
            });
        } else if (this.tool === "place") {
            this.placeOri = (this.placeOri + dir + 4) % 4;
            this.queueRender();
        }
    }

    deleteSelection() {
        const sel = this.selection;
        if (!sel) return;
        this.edit(() => {
            if (sel.kind === "object") this.map.objects.splice(sel.idx, 1);
            else if (sel.kind === "spawn") this.map.spawns.splice(sel.idx, 1);
            else this.map.rivers.splice(sel.idx, 1);
            this.selection = null;
        });
    }

    finishRiver() {
        const pts = this.riverDraft;
        if (pts.length < 2) {
            this.toast("A river needs at least 2 points.");
            return;
        }
        if (this.riverLake && pts.length < 3) {
            this.toast("A lake needs at least 3 points.");
            return;
        }
        if (this.map.rivers.length >= CustomMapLimits.maxRivers) {
            this.toast(`Maps can hold up to ${CustomMapLimits.maxRivers} rivers and lakes.`);
            return;
        }
        this.edit(() => {
            this.map.rivers.push({
                width: this.riverWidth,
                looped: this.riverLake,
                points: pts.map((p) => ({ x: Math.round(p.x), y: Math.round(p.y) })),
            });
            this.riverDraft = [];
        });
    }

    save() {
        const res = parseCustomMap(this.map);
        if ("error" in res) {
            this.toast(res.error);
            return;
        }
        const list = loadSaved();
        const id = this.savedId ?? Math.random().toString(36).slice(2, 10);
        const entry: SavedMap = { id, savedAt: Date.now(), map: util.cloneDeep(this.map) };
        const idx = list.findIndex((s) => s.id === id);
        if (idx >= 0) list[idx] = entry;
        else list.push(entry);
        try {
            writeSaved(list);
        } catch {
            this.toast("Browser storage is full. Download the map to keep it.");
            return;
        }
        this.savedId = id;
        this.dirty = false;
        this.syncUi();
        this.toast(`Saved "${this.map.name}".`);
    }

    download() {
        const res = parseCustomMap(this.map);
        if ("error" in res) {
            this.toast(res.error);
            return;
        }
        downloadMap(this.map);
    }

    useInParty() {
        const res = parseCustomMap(this.map);
        if ("error" in res) {
            this.toast(res.error);
            return;
        }
        if (!this.partyHook) {
            this.toast("Open a party and switch it to Private Match first.");
            return;
        }
        this.partyHook(res.map);
        this.toast(`"${res.map.name}" is now your party's map.`);
    }

    //
    // Hit testing
    //

    hitObject(world: Vec2): number {
        let best = -1;
        let bestArea = Infinity;
        for (let i = 0; i < this.map.objects.length; i++) {
            const b = objectBounds(this.map.objects[i]);
            if (!coldet.testPointAabb(world, b.min, b.max)) continue;
            const area = (b.max.x - b.min.x) * (b.max.y - b.min.y);
            // smallest wins so a crate inside a house is still clickable
            if (area <= bestArea) {
                best = i;
                bestArea = area;
            }
        }
        return best;
    }

    hitSpawn(world: Vec2): number {
        const rad = Math.max(4, 10 / this.cam.zoom);
        return this.map.spawns.findIndex((s) => Math.hypot(s.x - world.x, s.y - world.y) < rad);
    }

    hitRiver(world: Vec2): number {
        for (let i = this.map.rivers.length - 1; i >= 0; i--) {
            const r = this.map.rivers[i];
            const pts = smoothRiverPoints(r.points, r.looped);
            for (let j = 1; j < pts.length; j++) {
                const d = distToSegment(world, pts[j - 1], pts[j]);
                if (d < r.width + 3) return i;
            }
        }
        return -1;
    }

    hitRiverPoint(world: Vec2): { river: number; point: number } | null {
        const sel = this.selection;
        if (sel?.kind !== "river") return null;
        const rad = Math.max(3, 9 / this.cam.zoom);
        const pts = this.map.rivers[sel.idx].points;
        const point = pts.findIndex((p) => Math.hypot(p.x - world.x, p.y - world.y) < rad);
        return point >= 0 ? { river: sel.idx, point } : null;
    }

    eraseAt(world: Vec2) {
        const spawn = this.hitSpawn(world);
        if (spawn >= 0) {
            this.map.spawns.splice(spawn, 1);
            return true;
        }
        const obj = this.hitObject(world);
        if (obj >= 0) {
            this.map.objects.splice(obj, 1);
            return true;
        }
        const river = this.hitRiver(world);
        if (river >= 0) {
            this.map.rivers.splice(river, 1);
            return true;
        }
        return false;
    }

    //
    // Input
    //

    screenToWorld(sx: number, sy: number): Vec2 {
        const rect = this.canvas.getBoundingClientRect();
        const x = (sx - rect.left - rect.width / 2) / this.cam.zoom + this.cam.x;
        const y = this.cam.y - (sy - rect.top - rect.height / 2) / this.cam.zoom;
        return v2.create(x, y);
    }

    onMouseDown(e: MouseEvent) {
        if (!this.isOpen()) return;
        e.preventDefault();
        (document.activeElement as HTMLElement | null)?.blur?.();
        const world = this.screenToWorld(e.clientX, e.clientY);
        const startPan = () => {
            this.drag = { kind: "pan", startX: e.clientX, startY: e.clientY, camX: this.cam.x, camY: this.cam.y };
            this.canvas.classList.add("mm-panning");
        };

        if (e.button === 1 || e.button === 2 || this.spaceDown) {
            startPan();
            return;
        }
        if (e.button !== 0) return;

        switch (this.tool) {
            case "select": {
                const before = JSON.stringify(this.map);
                const rp = this.hitRiverPoint(world);
                if (rp) {
                    this.drag = { kind: "riverPoint", ...rp, moved: false, before };
                    return;
                }
                const spawn = this.hitSpawn(world);
                if (spawn >= 0) {
                    this.selection = { kind: "spawn", idx: spawn };
                    this.drag = { kind: "spawn", idx: spawn, moved: false, before };
                    this.syncUi();
                    return;
                }
                const obj = this.hitObject(world);
                if (obj >= 0) {
                    const o = this.map.objects[obj];
                    this.selection = { kind: "object", idx: obj };
                    this.drag = {
                        kind: "object",
                        idx: obj,
                        offset: v2.create(o.x - world.x, o.y - world.y),
                        moved: false,
                        before,
                    };
                    this.syncUi();
                    return;
                }
                const river = this.hitRiver(world);
                if (river >= 0) {
                    this.selection = { kind: "river", idx: river };
                    this.syncUi();
                    return;
                }
                if (this.selection) {
                    this.selection = null;
                    this.syncUi();
                }
                startPan();
                return;
            }
            case "place": {
                if (!this.roomForObjects()) return;
                this.edit(() => this.placeAt(world));
                this.drag = { kind: "paint", last: world };
                return;
            }
            case "erase": {
                const before = JSON.stringify(this.map);
                if (this.eraseAt(world)) this.edit(() => {}, before);
                this.drag = { kind: "erase" };
                return;
            }
            case "river": {
                if (this.riverDraft.length >= CustomMapLimits.maxRiverPoints) {
                    this.toast(`Rivers can have up to ${CustomMapLimits.maxRiverPoints} points.`);
                    return;
                }
                const p = this.snapPos(world);
                this.riverDraft.push(v2.create(this.clampX(p.x), this.clampY(p.y)));
                this.renderInspector();
                this.queueRender();
                return;
            }
            case "spawnA":
            case "spawnB": {
                if (this.map.spawns.length >= CustomMapLimits.maxSpawns) {
                    this.toast(`Maps can hold up to ${CustomMapLimits.maxSpawns} spawn points.`);
                    return;
                }
                const p = this.snapPos(world);
                this.edit(() =>
                    this.map.spawns.push({
                        x: this.clampX(p.x),
                        y: this.clampY(p.y),
                        side: this.tool === "spawnA" ? 0 : 1,
                    })
                );
            }
        }
    }

    onMouseMove(e: MouseEvent) {
        if (!this.isOpen()) return;
        const inCanvas = e.target === this.canvas;
        const world = this.screenToWorld(e.clientX, e.clientY);
        if (inCanvas || this.drag) this.mouse = world;
        const drag = this.drag;
        if (drag) {
            switch (drag.kind) {
                case "pan":
                    this.cam.x = drag.camX - (e.clientX - drag.startX) / this.cam.zoom;
                    this.cam.y = drag.camY + (e.clientY - drag.startY) / this.cam.zoom;
                    break;
                case "object": {
                    const o = this.map.objects[drag.idx];
                    const p = this.snapPos(v2.add(world, drag.offset));
                    o.x = p.x;
                    o.y = p.y;
                    this.keepInside(o);
                    drag.moved = true;
                    break;
                }
                case "spawn": {
                    const s = this.map.spawns[drag.idx];
                    const p = this.snapPos(world);
                    s.x = this.clampX(p.x);
                    s.y = this.clampY(p.y);
                    drag.moved = true;
                    break;
                }
                case "riverPoint": {
                    const pt = this.map.rivers[drag.river].points[drag.point];
                    const p = this.snapPos(world);
                    pt.x = this.clampX(p.x);
                    pt.y = this.clampY(p.y);
                    drag.moved = true;
                    break;
                }
                case "paint": {
                    const spacing = Math.max(2, typeRadius(this.placeType) * 1.6);
                    if (
                        v2.distance(world, drag.last) >= spacing && this.map.objects.length < CustomMapLimits.maxObjects
                    ) {
                        this.placeAt(world);
                        drag.last = world;
                        this.syncUi();
                    }
                    break;
                }
                case "erase":
                    if (this.eraseAt(world)) this.syncUi();
                    break;
            }
        }
        if (inCanvas || drag) {
            this.root.find(".mm-coords").text(
                `${Math.round(world.x)}, ${Math.round(world.y)} · ${Math.round(this.cam.zoom * 50)}%`,
            );
            this.queueRender();
        }
    }

    onMouseUp(_e: MouseEvent) {
        const drag = this.drag;
        if (!drag) return;
        this.drag = null;
        this.canvas.classList.remove("mm-panning");
        if ((drag.kind === "object" || drag.kind === "spawn" || drag.kind === "riverPoint") && drag.moved) {
            this.edit(() => {}, drag.before);
        }
    }

    onWheel(e: WheelEvent) {
        e.preventDefault();
        const before = this.screenToWorld(e.clientX, e.clientY);
        this.cam.zoom = math.clamp(this.cam.zoom * Math.exp(-e.deltaY * 0.0015), 0.2, 24);
        const after = this.screenToWorld(e.clientX, e.clientY);
        // keep the point under the cursor fixed
        this.cam.x += before.x - after.x;
        this.cam.y += before.y - after.y;
        this.queueRender();
    }

    zoomBy(f: number) {
        this.cam.zoom = math.clamp(this.cam.zoom * f, 0.2, 24);
        this.queueRender();
    }

    fit() {
        const rect = this.canvas.getBoundingClientRect();
        if (!rect.width) return;
        this.cam.x = this.map.width / 2;
        this.cam.y = this.map.height / 2;
        this.cam.zoom = Math.min(rect.width / this.map.width, rect.height / this.map.height) * 0.92;
        this.queueRender();
    }

    onKeyDown(e: KeyboardEvent) {
        if (!this.isOpen()) return;
        const target = e.target as HTMLElement;
        if (/^(INPUT|SELECT|TEXTAREA)$/.test(target.tagName)) {
            if (e.key === "Escape") target.blur();
            return;
        }
        // keep the main menu from reacting to keys while editing
        e.stopPropagation();
        const mod = e.ctrlKey || e.metaKey;
        const key = e.key.toLowerCase();
        const homeOpen = this.root.find(".mm-home").is(":visible");

        if (mod && key === "z") {
            e.preventDefault();
            if (e.shiftKey) this.redo();
            else this.undo();
            return;
        }
        if (mod && key === "y") {
            e.preventDefault();
            this.redo();
            return;
        }
        if (mod && key === "s") {
            e.preventDefault();
            this.save();
            return;
        }
        if (mod) return;
        if (homeOpen) {
            if (key === "escape" && this.root.find("#mm-home-close").is(":visible")) this.showHome(false);
            return;
        }

        const tool = tools.find((t) => t.key === e.key);
        if (tool) {
            this.setTool(tool.id);
            return;
        }
        switch (e.key) {
            case " ":
                this.spaceDown = true;
                e.preventDefault();
                break;
            case "r":
            case "R":
                this.rotate(e.shiftKey ? -1 : 1);
                break;
            case "g":
            case "G":
                this.snap = !this.snap;
                this.toast(this.snap ? "Snap to grid on" : "Snap to grid off");
                this.syncUi();
                break;
            case "f":
            case "F":
                this.fit();
                break;
            case "u":
            case "U":
                this.toggleUnderground();
                break;
            case "+":
            case "=":
                this.zoomBy(1.25);
                break;
            case "-":
                this.zoomBy(0.8);
                break;
            case "Delete":
            case "Backspace":
                e.preventDefault();
                this.deleteSelection();
                break;
            case "Enter":
                if (this.tool === "river") this.finishRiver();
                break;
            case "Escape":
                if (this.riverDraft.length) {
                    this.riverDraft = [];
                    this.syncUi();
                } else if (this.selection) {
                    this.selection = null;
                    this.syncUi();
                } else if (this.tool !== "select") {
                    this.setTool("select");
                } else {
                    this.close();
                }
                break;
            case "ArrowUp":
            case "ArrowDown":
            case "ArrowLeft":
            case "ArrowRight": {
                const sel = this.selection;
                if (sel?.kind !== "object" && sel?.kind !== "spawn") break;
                e.preventDefault();
                const step = e.shiftKey ? 8 : 1;
                const d = {
                    ArrowUp: [0, step],
                    ArrowDown: [0, -step],
                    ArrowLeft: [-step, 0],
                    ArrowRight: [step, 0],
                }[e.key]!;
                this.edit(() => {
                    const t = sel.kind === "object" ? this.map.objects[sel.idx] : this.map.spawns[sel.idx];
                    t.x = this.clampX(t.x + d[0]);
                    t.y = this.clampY(t.y + d[1]);
                    if (sel.kind === "object") this.keepInside(this.map.objects[sel.idx]);
                });
                break;
            }
        }
    }

    //
    // Rendering
    //

    queueRender() {
        if (this.renderQueued) return;
        this.renderQueued = true;
        requestAnimationFrame(() => {
            this.renderQueued = false;
            this.render();
        });
    }

    getTerrain() {
        const key = JSON.stringify([this.map.width, this.map.height, this.map.rivers]);
        if (key !== this.terrainKey) {
            this.terrainKey = key;
            this.terrain = buildTerrain(this.map);
        }
        return this.terrain;
    }

    render() {
        if (!this.isOpen()) return;
        const canvas = this.canvas;
        const rect = canvas.getBoundingClientRect();
        const dpr = window.devicePixelRatio || 1;
        if (canvas.width !== Math.round(rect.width * dpr) || canvas.height !== Math.round(rect.height * dpr)) {
            canvas.width = Math.round(rect.width * dpr);
            canvas.height = Math.round(rect.height * dpr);
        }
        const ctx = this.ctx;
        const { zoom } = this.cam;
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        const colors = MapDefs[this.map.biome].biome.colors;
        ctx.fillStyle = hex(colors.background);
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        // world space: y up, like the game
        ctx.setTransform(
            zoom * dpr,
            0,
            0,
            -zoom * dpr,
            (rect.width / 2 - this.cam.x * zoom) * dpr,
            (rect.height / 2 + this.cam.y * zoom) * dpr,
        );
        drawMap(ctx, this.map, this.getTerrain(), zoom, this.underground);

        // grid
        const grid = GameConfig.map.gridSize;
        ctx.lineWidth = 1 / zoom;
        ctx.strokeStyle = "rgba(0,0,0,0.15)";
        ctx.beginPath();
        for (let x = 0; x <= this.map.width; x += grid) {
            ctx.moveTo(x, 0);
            ctx.lineTo(x, this.map.height);
        }
        for (let y = 0; y <= this.map.height; y += grid) {
            ctx.moveTo(0, y);
            ctx.lineTo(this.map.width, y);
        }
        ctx.stroke();
        ctx.lineWidth = 2 / zoom;
        ctx.strokeStyle = "rgba(0,0,0,0.6)";
        ctx.strokeRect(0, 0, this.map.width, this.map.height);

        drawSpawns(ctx, this.map, zoom);

        // selection
        const sel = this.selection;
        ctx.lineWidth = 2 / zoom;
        if (sel?.kind === "object" && this.map.objects[sel.idx]) {
            const b = objectBounds(this.map.objects[sel.idx]);
            ctx.strokeStyle = "#ffe14d";
            ctx.setLineDash([6 / zoom, 4 / zoom]);
            ctx.strokeRect(b.min.x - 0.5, b.min.y - 0.5, b.max.x - b.min.x + 1, b.max.y - b.min.y + 1);
            ctx.setLineDash([]);
        } else if (sel?.kind === "spawn" && this.map.spawns[sel.idx]) {
            const s = this.map.spawns[sel.idx];
            ctx.strokeStyle = "#ffe14d";
            ctx.beginPath();
            ctx.arc(s.x, s.y, Math.max(5, 12 / zoom), 0, Math.PI * 2);
            ctx.stroke();
        } else if (sel?.kind === "river" && this.map.rivers[sel.idx]) {
            const r = this.map.rivers[sel.idx];
            drawPolyline(ctx, smoothRiverPoints(r.points, r.looped), "#ffe14d", 2 / zoom, [6 / zoom, 4 / zoom]);
            for (const p of r.points) drawHandle(ctx, p, zoom);
        }

        // tool previews
        const m = this.mouse;
        if (this.tool === "river" && (this.riverDraft.length || m)) {
            const pts = [...this.riverDraft];
            if (m && !this.drag) pts.push(this.snapPos(m));
            if (pts.length >= 2) {
                const preview = this.riverLake && pts.length >= 3
                    ? smoothRiverPoints(pts, true)
                    : smoothRiverPoints(pts, false);
                drawPolyline(ctx, preview, "rgba(80,160,255,0.85)", this.riverWidth * 2, []);
            }
            for (const p of this.riverDraft) drawHandle(ctx, p, zoom);
        }
        if (this.tool === "place" && m && !this.drag?.kind.startsWith("pan")) {
            const p = this.snapPos(m);
            ctx.globalAlpha = 0.55;
            drawObject(ctx, { type: this.placeType, x: p.x, y: p.y, ori: this.placeOri });
            ctx.globalAlpha = 1;
        }
        if (this.tool === "erase" && m) {
            ctx.strokeStyle = "rgba(255,80,80,0.9)";
            ctx.beginPath();
            ctx.arc(m.x, m.y, 6 / zoom, 0, Math.PI * 2);
            ctx.stroke();
        }
    }
}

//
// Drawing helpers, shared by the editor and the thumbnails
//

function buildTerrain(map: CustomMap) {
    return generateTerrain(
        map.width,
        map.height,
        customMapShoreInset,
        customMapGrassInset,
        map.rivers.map((r) => ({ width: r.width, looped: r.looped, points: smoothRiverPoints(r.points, r.looped) })),
        1,
    );
}

function tracePoly(ctx: CanvasRenderingContext2D, pts: Vec2[]) {
    if (!pts.length) return;
    ctx.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
    ctx.closePath();
}

function drawMap(
    ctx: CanvasRenderingContext2D,
    map: CustomMap,
    terrain: ReturnType<typeof buildTerrain>,
    zoom: number,
    underground = false,
) {
    const colors = MapDefs[map.biome].biome.colors;
    ctx.fillStyle = hex(colors.water);
    ctx.fillRect(0, 0, map.width, map.height);
    ctx.fillStyle = hex(colors.beach);
    ctx.beginPath();
    tracePoly(ctx, terrain.shore);
    ctx.fill();
    ctx.fillStyle = hex(colors.grass);
    ctx.beginPath();
    tracePoly(ctx, terrain.grass);
    ctx.fill();
    for (const r of terrain.rivers) {
        ctx.fillStyle = hex(r.looped ? colors.lakeRiverbank ?? colors.riverbank : colors.riverbank);
        ctx.beginPath();
        tracePoly(ctx, r.shorePoly);
        ctx.fill();
    }
    for (const r of terrain.rivers) {
        ctx.fillStyle = hex(r.looped ? colors.lakeWater ?? colors.water : colors.water);
        ctx.beginPath();
        tracePoly(ctx, r.waterPoly);
        ctx.fill();
    }

    const shapes: Shape[] = [];
    for (const obj of map.objects) {
        shapes.push(...transformShapes(localShapes(obj.type), v2.create(obj.x, obj.y), obj.ori, obj.scale ?? 1));
    }
    shapes.sort((a, b) => a.z - b.z);
    for (const s of shapes) drawShape(ctx, s);

    if (underground) {
        // dim the surface, then draw the tunnels on top
        ctx.fillStyle = "rgba(12,10,8,0.72)";
        ctx.fillRect(0, 0, map.width, map.height);
        for (const obj of map.objects) {
            const under = transformShapes(undergroundShapes(obj.type), v2.create(obj.x, obj.y), obj.ori, obj.scale ?? 1);
            for (const s of under) drawShape(ctx, s);
        }
    }
    void zoom;
}

function drawShape(ctx: CanvasRenderingContext2D, s: Shape) {
    ctx.fillStyle = hex(s.color);
    const col = s.col;
    if (col.type === collider.Type.Circle) {
        ctx.beginPath();
        ctx.arc(col.pos.x, col.pos.y, col.rad * s.scale, 0, Math.PI * 2);
        ctx.fill();
    } else if (col.type === collider.Type.Aabb) {
        const ext = v2.mul(v2.sub(col.max, col.min), 0.5 * s.scale);
        const c = v2.mul(v2.add(col.min, col.max), 0.5);
        ctx.fillRect(c.x - ext.x, c.y - ext.y, ext.x * 2, ext.y * 2);
    }
}

function drawObject(ctx: CanvasRenderingContext2D, obj: CustomMap["objects"][number]) {
    const shapes = transformShapes(localShapes(obj.type), v2.create(obj.x, obj.y), obj.ori, obj.scale ?? 1);
    shapes.sort((a, b) => a.z - b.z);
    for (const s of shapes) drawShape(ctx, s);
}

function drawSpawns(ctx: CanvasRenderingContext2D, map: CustomMap, zoom: number) {
    const rad = Math.max(3, 8 / zoom);
    for (const s of map.spawns) {
        ctx.fillStyle = s.side === 0 ? "#3d8bff" : "#ff4d4d";
        ctx.strokeStyle = "#fff";
        ctx.lineWidth = Math.max(0.6, 2 / zoom);
        ctx.beginPath();
        ctx.arc(s.x, s.y, rad, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        // letter, drawn upright despite the flipped y axis
        ctx.save();
        ctx.translate(s.x, s.y);
        ctx.scale(1, -1);
        ctx.fillStyle = "#fff";
        ctx.font = `bold ${rad * 1.2}px sans-serif`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(s.side === 0 ? "A" : "B", 0, rad * 0.08);
        ctx.restore();
    }
}

function drawPolyline(ctx: CanvasRenderingContext2D, pts: Vec2[], color: string, width: number, dash: number[]) {
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.setLineDash(dash);
    ctx.beginPath();
    pts.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
    ctx.stroke();
    ctx.setLineDash([]);
}

function drawHandle(ctx: CanvasRenderingContext2D, p: { x: number; y: number }, zoom: number) {
    ctx.fillStyle = "#fff";
    ctx.strokeStyle = "#1a1a1a";
    ctx.lineWidth = 1.5 / zoom;
    ctx.beginPath();
    ctx.arc(p.x, p.y, 5 / zoom, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
}

function drawThumbnail(canvas: HTMLCanvasElement, map: CustomMap) {
    const ctx = canvas.getContext("2d")!;
    const s = Math.min(canvas.width / map.width, canvas.height / map.height);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = hex(MapDefs[map.biome].biome.colors.background);
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.setTransform(s, 0, 0, -s, (canvas.width - map.width * s) / 2, (canvas.height + map.height * s) / 2);
    drawMap(ctx, map, buildTerrain(map), s);
    drawSpawns(ctx, map, s);
}

function sizedCanvas(w: number, h: number) {
    const c = document.createElement("canvas");
    c.width = w;
    c.height = h;
    return c;
}

function distToSegment(p: Vec2, a: Vec2, b: Vec2) {
    const ab = v2.sub(b, a);
    const len = v2.lengthSqr(ab);
    const t = len ? math.clamp(v2.dot(v2.sub(p, a), ab) / len, 0, 1) : 0;
    return v2.distance(p, v2.add(a, v2.mul(ab, t)));
}

function downloadMap(map: CustomMap) {
    const blob = new Blob([JSON.stringify(map, null, 1)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${map.name.replace(/[^\w\- ]+/g, "").trim() || "map"}.survevmap.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
}

let instance: MapMaker | undefined;

function getMapMaker() {
    instance ??= new MapMaker();
    return instance;
}

export function openMapMaker() {
    getMapMaker().open();
}

/**
 * The party menu sets this while you lead a private match, so the editor can
 * hand a map straight to the party. Pass null when that's no longer possible.
 */
export function setMapMakerPartyHook(hook: ((map: CustomMap) => void) | null) {
    if (!instance && !hook) return;
    const mm = getMapMaker();
    mm.partyHook = hook;
    mm.root.find("#mm-use").toggle(!!hook);
}
