import type { AABB } from "../../utils/coldet.ts";
import { collider } from "../../utils/collider.ts";
import { util } from "../../utils/util.ts";
import { v2, type Vec2 } from "../../utils/v2.ts";
import type { BuildingDef, FloorImage } from "./buildings/buildingDefs.ts";
import type { ObstacleDef } from "./obstacles/obstacleDefs.ts";
import type { StructureDef } from "./structureDefs.ts";

/**
 * Buildings, tunnels and edited buildings from the map maker.
 *
 * Map object types are sent as ids from one fixed table, so new definitions
 * can't be added mid-game. Instead the table has a fixed set of empty slots
 * (custom_bldg_N, custom_struct_N) and wall pieces of every length
 * (cwall_<material>_<len>). Each game fills the slots from its map file with
 * applyCustomBuilds(), on the server and, from the same data in the map
 * message, on every client, so both sides end up with identical definitions.
 * Only one game runs per server process, so slots never clash.
 */

export const customWallMaterials = ["wood", "brick", "metal", "concrete"] as const;
export type CustomWallMaterial = (typeof customWallMaterials)[number];

export const CustomBuildLimits = {
    maxWallLen: 64,
    buildingSlots: 160,
    structureSlots: 40,
    minBuildingSize: 6,
    maxBuildingSize: 96,
    doorWidth: 4,
    windowWidth: 4,
    minTunnelWidth: 4,
    maxTunnelWidth: 12,
    stairsLen: 5,
};

export interface CustomBuilding {
    x: number;
    y: number;
    w: number;
    h: number;
    wall: CustomWallMaterial;
    roof: number;
    floor: number;
    /** side 0 = left, 1 = top, 2 = right, 3 = bottom; at = distance from the side's start */
    doors: Array<{ side: number; at: number }>;
    windows: Array<{ side: number; at: number }>;
    /** inside walls, axis aligned, in building space (center = 0,0) */
    walls: Array<{ x1: number; y1: number; x2: number; y2: number }>;
}

export interface CustomTunnel {
    /** axis aligned path in world space; stairs up at both ends */
    points: Vec2[];
    width: number;
}

export interface CustomChild {
    type: string;
    x: number;
    y: number;
    ori: number;
    scale?: number;
    /** structures only: which of its layers the child belongs to */
    layer?: number;
}

export interface CustomBuildSpec {
    buildings: CustomBuilding[];
    tunnels: CustomTunnel[];
    /** existing buildings or structures with their contents replaced */
    edits: Array<{ type: string; children: CustomChild[] }>;
}

const wallTemplates: Record<CustomWallMaterial, RegExp> = {
    wood: /^house_wall_int_\d+$/,
    brick: /^brick_wall_ext_\d+$/,
    metal: /^metal_wall_ext_\d+$/,
    concrete: /^concrete_wall_ext_\d+$/,
};

const wallColors: Record<CustomWallMaterial, number> = {
    wood: 0x6b4a2b,
    brick: 0x8a3c2c,
    metal: 0x4f5459,
    concrete: 0x6e6e6e,
};

export function customWallType(material: CustomWallMaterial, len: number) {
    return `cwall_${material}_${len}`;
}

const placeholderBuilding = (): BuildingDef => ({
    type: "building",
    map: { display: false },
    terrain: {},
    floor: { surfaces: [], imgs: [] },
    ceiling: { zoomRegions: [], imgs: [] },
    mapObjects: [],
});

const placeholderStructure = (): StructureDef => ({
    type: "structure",
    terrain: {},
    layers: [],
    stairs: [],
    mask: [],
});

/** Wall pieces and empty slots, added once to the map object table. */
export function createCustomBuildDefs(obstacles: Record<string, ObstacleDef>) {
    const defs: Record<string, ObstacleDef | BuildingDef | StructureDef> = {};
    for (const material of customWallMaterials) {
        const templateKey = Object.keys(obstacles).find((k) => wallTemplates[material].test(k))!;
        const template = obstacles[templateKey];
        for (let len = 1; len <= CustomBuildLimits.maxWallLen; len++) {
            const def = util.cloneDeep(template);
            // ori 0 runs along y, like the game's own walls
            def.collision = collider.createAabbExtents(v2.create(0, 0), v2.create(0.5, len / 2));
            def.destructible = false;
            defs[customWallType(material, len)] = def;
        }
    }
    for (let i = 0; i < CustomBuildLimits.buildingSlots; i++) defs[`custom_bldg_${i}`] = placeholderBuilding();
    for (let i = 0; i < CustomBuildLimits.structureSlots; i++) defs[`custom_struct_${i}`] = placeholderStructure();
    return defs;
}

//
// Filling the slots
//

const rect = (x0: number, y0: number, x1: number, y1: number) =>
    collider.createAabb(v2.create(Math.min(x0, x1), Math.min(y0, y1)), v2.create(Math.max(x0, x1), Math.max(y0, y1)));

/** A flat colored rectangle; the client draws "solid" sprites as tinted squares. */
function solid(r: AABB, color: number, alpha = 1): FloorImage {
    return {
        sprite: "solid",
        pos: v2.mul(v2.add(r.min, r.max), 0.5),
        size: v2.sub(r.max, r.min),
        scale: 1,
        alpha,
        tint: color,
    };
}

type Child = BuildingDef["mapObjects"][number];

/** Wall pieces covering a straight run; vertical when x0 === x1. */
function wallRun(material: CustomWallMaterial, x0: number, y0: number, x1: number, y1: number, out: Child[]) {
    const vertical = x0 === x1;
    let a = vertical ? Math.min(y0, y1) : Math.min(x0, x1);
    const b = vertical ? Math.max(y0, y1) : Math.max(x0, x1);
    while (b - a > 0.01) {
        const len = Math.min(CustomBuildLimits.maxWallLen, Math.max(1, Math.round(b - a)));
        const mid = a + len / 2;
        out.push({
            type: customWallType(material, len),
            pos: vertical ? v2.create(x0, mid) : v2.create(mid, y0),
            scale: 1,
            ori: vertical ? 0 : 1,
        });
        a += len;
    }
}

/** Corners of side `side` of a w×h box centered at 0,0, in walking order. */
function sideLine(side: number, w: number, h: number) {
    const hw = w / 2;
    const hh = h / 2;
    switch (side) {
        case 0:
            return { a: v2.create(-hw, -hh), b: v2.create(-hw, hh) };
        case 1:
            return { a: v2.create(-hw, hh), b: v2.create(hw, hh) };
        case 2:
            return { a: v2.create(hw, -hh), b: v2.create(hw, hh) };
        default:
            return { a: v2.create(-hw, -hh), b: v2.create(hw, -hh) };
    }
}

export function sideLength(side: number, w: number, h: number) {
    return side % 2 === 0 ? h : w;
}

export function createCustomBuildingDef(b: CustomBuilding): BuildingDef {
    const { w, h } = b;
    const children: Child[] = [];
    const wallImgs: FloorImage[] = [];
    const wallColor = wallColors[b.wall];

    for (let side = 0; side < 4; side++) {
        const len = sideLength(side, w, h);
        const { a, b: end } = sideLine(side, w, h);
        const dir = v2.normalize(v2.sub(end, a));
        const gaps: Array<{ from: number; to: number; kind: "door" | "window" }> = [];
        for (const d of b.doors) {
            if (d.side === side) gaps.push({ from: d.at - 2, to: d.at + 2, kind: "door" });
        }
        for (const wi of b.windows) {
            if (wi.side === side) gaps.push({ from: wi.at - 2, to: wi.at + 2, kind: "window" });
        }
        gaps.sort((x, y) => x.from - y.from);
        let cursor = 0;
        const runs: Array<[number, number]> = [];
        for (const g of gaps) {
            const from = math_clamp(g.from, 0, len);
            const to = math_clamp(g.to, 0, len);
            if (from < cursor || to - from < 3.99) continue; // overlapping or clipped at a corner
            runs.push([cursor, from]);
            cursor = to;
            const p0 = v2.add(a, v2.mul(dir, from));
            const center = v2.add(a, v2.mul(dir, (from + to) / 2));
            if (g.kind === "door") {
                // a door's hinge sits at its pos and it swings 4 units along +y (ori 0) or +x (ori 3)
                children.push({ type: "house_door_01", pos: p0, scale: 1, ori: side % 2 === 0 ? 0 : 3 });
            } else {
                children.push({ type: "house_window_01", pos: center, scale: 1, ori: side % 2 === 0 ? 0 : 1 });
                const half = side % 2 === 0 ? v2.create(0.4, 2) : v2.create(2, 0.4);
                wallImgs.push(solid(rect(center.x - half.x, center.y - half.y, center.x + half.x, center.y + half.y), 0x9bc4d6));
            }
        }
        runs.push([cursor, len]);
        for (const [s, e] of runs) {
            if (e - s < 0.01) continue;
            const p = v2.add(a, v2.mul(dir, s));
            const q = v2.add(a, v2.mul(dir, e));
            wallRun(b.wall, p.x, p.y, q.x, q.y, children);
            wallImgs.push(solid(rect(p.x - 0.5, p.y - 0.5, q.x + 0.5, q.y + 0.5), wallColor));
        }
    }
    for (const iw of b.walls) {
        const x2 = Math.abs(iw.x2 - iw.x1) >= Math.abs(iw.y2 - iw.y1) ? iw.x2 : iw.x1;
        const y2 = x2 === iw.x1 ? iw.y2 : iw.y1;
        wallRun(b.wall, iw.x1, iw.y1, x2, y2, children);
        wallImgs.push(solid(rect(iw.x1 - 0.5, iw.y1 - 0.5, x2 + 0.5, y2 + 0.5), wallColor));
    }

    const inside = rect(-w / 2, -h / 2, w / 2, h / 2);
    return {
        type: "building",
        map: { display: true, shapes: [{ collider: collider.copy(inside), color: b.roof }] },
        terrain: {},
        zIdx: 1,
        floor: {
            surfaces: [{ type: "house", collision: [collider.copy(inside)] }],
            imgs: [solid(inside, b.floor), ...wallImgs],
        },
        ceiling: {
            zoomRegions: [{ zoomIn: rect(-w / 2 + 0.5, -h / 2 + 0.5, w / 2 - 0.5, h / 2 - 0.5) }],
            vision: { width: 4 },
            imgs: [solid(rect(-w / 2 - 0.75, -h / 2 - 0.75, w / 2 + 0.75, h / 2 + 0.75), b.roof)],
        },
        mapObjects: children,
    };
}

function math_clamp(v: number, lo: number, hi: number) {
    return Math.max(lo, Math.min(hi, v));
}

//
// Tunnels: the path is rasterized onto a 1 unit grid, so corners, crossings
// and the stair wells all come out as one clean shape.
//

const tunnelFloorColor = 0x4a4038;
const tunnelWallColor = 0x2b2622;
const stairsColor = 0x6e5f4e;

export function tunnelOrigin(t: CustomTunnel) {
    const xs = t.points.map((p) => p.x);
    const ys = t.points.map((p) => p.y);
    return v2.create(Math.round((Math.min(...xs) + Math.max(...xs)) / 2), Math.round((Math.min(...ys) + Math.max(...ys)) / 2));
}

export function createCustomTunnelDefs(t: CustomTunnel) {
    const origin = tunnelOrigin(t);
    const pts = t.points.map((p) => v2.sub(v2.create(Math.round(p.x), Math.round(p.y)), origin));
    const hw = Math.round(t.width) / 2;
    const L = CustomBuildLimits.stairsLen;

    // stair wells: past each end, pointing away from the tunnel
    const ends = [
        { p: pts[0], d: v2.normalize(v2.sub(pts[0], pts[1])) },
        { p: pts[pts.length - 1], d: v2.normalize(v2.sub(pts[pts.length - 1], pts[pts.length - 2])) },
    ];

    const boxes: AABB[] = [];
    for (let i = 0; i + 1 < pts.length; i++) {
        const a = pts[i];
        const b = pts[i + 1];
        boxes.push(rect(Math.min(a.x, b.x) - hw, Math.min(a.y, b.y) - hw, Math.max(a.x, b.x) + hw, Math.max(a.y, b.y) + hw));
    }
    const wells: AABB[] = [];
    for (const { p, d } of ends) {
        // from the end of the tunnel box out L units
        const near = v2.add(p, v2.mul(d, hw));
        const far = v2.add(near, v2.mul(d, L));
        const side = v2.create(Math.abs(d.y) * hw, Math.abs(d.x) * hw);
        wells.push(rect(near.x - side.x, near.y - side.y, far.x + side.x, far.y + side.y));
    }

    // occupancy grid over everything
    const all = [...boxes, ...wells];
    const minX = Math.floor(Math.min(...all.map((r) => r.min.x))) - 1;
    const minY = Math.floor(Math.min(...all.map((r) => r.min.y))) - 1;
    const maxX = Math.ceil(Math.max(...all.map((r) => r.max.x))) + 1;
    const maxY = Math.ceil(Math.max(...all.map((r) => r.max.y))) + 1;
    const W = maxX - minX;
    const H = maxY - minY;
    const grid = new Uint8Array(W * H);
    for (const r of all) {
        for (let y = Math.round(r.min.y); y < Math.round(r.max.y); y++) {
            for (let x = Math.round(r.min.x); x < Math.round(r.max.x); x++) grid[(y - minY) * W + (x - minX)] = 1;
        }
    }
    const at = (x: number, y: number) => x >= minX && y >= minY && x < maxX && y < maxY && grid[(y - minY) * W + (x - minX)] === 1;

    // floor: row runs merged downward into rectangles
    const floorRects: AABB[] = [];
    const open = new Map<string, AABB>();
    for (let y = minY; y < maxY; y++) {
        const runs: Array<[number, number]> = [];
        for (let x = minX; x < maxX; x++) {
            if (!at(x, y)) continue;
            const s = x;
            while (at(x, y)) x++;
            runs.push([s, x]);
        }
        const next = new Map<string, AABB>();
        for (const [s, e] of runs) {
            const key = `${s},${e}`;
            const prev = open.get(key);
            if (prev) {
                prev.max.y = y + 1;
                next.set(key, prev);
            } else {
                const r = rect(s, y, e, y + 1);
                floorRects.push(r);
                next.set(key, r);
            }
        }
        open.clear();
        for (const [k, v] of next) open.set(k, v);
    }

    // walls on every edge between floor and rock
    const subChildren: Child[] = [];
    const wallImgs: FloorImage[] = [];
    const addWall = (x0: number, y0: number, x1: number, y1: number) => {
        wallRun("concrete", x0, y0, x1, y1, subChildren);
        wallImgs.push(solid(rect(x0 - 0.5, y0 - 0.5, x1 + 0.5, y1 + 0.5), tunnelWallColor));
    };
    for (let y = minY; y <= maxY; y++) {
        for (let x = minX; x < maxX; x++) {
            if (at(x, y) === at(x, y - 1)) continue;
            const s = x;
            const below = at(x, y - 1);
            while (x < maxX && at(x, y) !== at(x, y - 1) && at(x, y - 1) === below) x++;
            addWall(s, y, x, y);
            x--;
        }
    }
    for (let x = minX; x <= maxX; x++) {
        for (let y = minY; y < maxY; y++) {
            if (at(x, y) === at(x - 1, y)) continue;
            const s = y;
            const left = at(x - 1, y);
            while (y < maxY && at(x, y) !== at(x - 1, y) && at(x - 1, y) === left) y++;
            addWall(x, s, x, y);
            y--;
        }
    }

    // surface: a walled stair well at each end, open on the far side
    const topChildren: Child[] = [];
    const topImgs: FloorImage[] = [];
    const stairs: StructureDef["stairs"] = [];
    for (let i = 0; i < ends.length; i++) {
        const r = wells[i];
        const { d } = ends[i];
        topImgs.push(solid(r, stairsColor));
        stairs.push({ collision: collider.copy(r), downDir: v2.mul(d, -1) });
        const horizontal = d.y === 0; // the well runs along x
        if (horizontal) {
            wallRun("metal", r.min.x, r.min.y, r.max.x, r.min.y, topChildren);
            wallRun("metal", r.min.x, r.max.y, r.max.x, r.max.y, topChildren);
            const x = d.x > 0 ? r.min.x : r.max.x; // the end over the tunnel
            wallRun("metal", x, r.min.y, x, r.max.y, topChildren);
        } else {
            wallRun("metal", r.min.x, r.min.y, r.min.x, r.max.y, topChildren);
            wallRun("metal", r.max.x, r.min.y, r.max.x, r.max.y, topChildren);
            const y = d.y > 0 ? r.min.y : r.max.y;
            wallRun("metal", r.min.x, y, r.max.x, y, topChildren);
        }
    }

    const top: BuildingDef = {
        type: "building",
        map: { display: true, shapes: wells.map((r) => ({ collider: collider.copy(r), color: stairsColor })) },
        terrain: {},
        zIdx: 2,
        floor: {
            surfaces: [{ type: "container", collision: wells.map((r) => collider.copy(r)) }],
            imgs: topImgs,
        },
        ceiling: { zoomRegions: [], vision: { dist: 5, width: 2.75, linger: 0.5, fadeRate: 6 }, imgs: [] },
        mapObjects: topChildren,
    };
    const sub: BuildingDef = {
        type: "building",
        map: { display: false },
        terrain: {},
        zIdx: 0,
        floor: {
            surfaces: [{ type: "bunker", collision: floorRects.map((r) => collider.copy(r)) }],
            imgs: [...floorRects.map((r) => solid(r, tunnelFloorColor)), ...wallImgs],
        },
        ceiling: {
            zoomRegions: floorRects.map((r) => ({ zoomIn: collider.copy(r) })),
            vision: { dist: 5, width: 3 },
            imgs: [],
        },
        mapObjects: subChildren,
    };
    return { origin, top, sub, floorRects, stairs };
}

//
// Applying a spec
//

export interface AppliedCustomBuilds {
    buildingTypes: string[];
    tunnelTypes: Array<{ type: string; pos: Vec2 }>;
    editTypes: string[];
}

function toChild(c: CustomChild): Child {
    return { type: c.type, pos: v2.create(c.x, c.y), scale: c.scale ?? 1, ori: c.ori };
}

/**
 * Fills the custom slots in `defs` (the live map object table) from `spec`.
 * Deterministic: the same spec gives the same slot names everywhere.
 */
export function applyCustomBuilds(
    defs: Record<string, unknown>,
    spec: CustomBuildSpec,
): AppliedCustomBuilds {
    let nextB = 0;
    let nextS = 0;
    const takeB = (def: BuildingDef) => {
        if (nextB >= CustomBuildLimits.buildingSlots) throw new Error("Too many custom buildings");
        const name = `custom_bldg_${nextB++}`;
        defs[name] = def;
        return name;
    };
    const takeS = (def: StructureDef) => {
        if (nextS >= CustomBuildLimits.structureSlots) throw new Error("Too many tunnels or edited structures");
        const name = `custom_struct_${nextS++}`;
        defs[name] = def;
        return name;
    };

    const out: AppliedCustomBuilds = { buildingTypes: [], tunnelTypes: [], editTypes: [] };
    for (const b of spec.buildings) out.buildingTypes.push(takeB(createCustomBuildingDef(b)));
    for (const t of spec.tunnels) {
        const { origin, top, sub, floorRects, stairs } = createCustomTunnelDefs(t);
        const topType = takeB(top);
        const subType = takeB(sub);
        const type = takeS({
            type: "structure",
            terrain: {},
            layers: [
                { type: topType, pos: v2.create(0, 0), ori: 0 },
                { type: subType, pos: v2.create(0, 0), ori: 0 },
            ],
            stairs,
            mask: floorRects.map((r) => collider.copy(r)),
        });
        out.tunnelTypes.push({ type, pos: origin });
    }
    for (const e of spec.edits) {
        const base = defs[e.type] as BuildingDef | StructureDef | undefined;
        if (base?.type === "building") {
            const def = util.cloneDeep(base);
            def.mapObjects = e.children.map(toChild);
            out.editTypes.push(takeB(def));
        } else if (base?.type === "structure") {
            const def = util.cloneDeep(base);
            def.layers = def.layers.map((layer, i) => {
                const layerDef = util.cloneDeep(defs[layer.type] as BuildingDef);
                layerDef.mapObjects = e.children.filter((c) => (c.layer ?? 0) === i).map(toChild);
                return { ...layer, type: takeB(layerDef) };
            });
            out.editTypes.push(takeS(def));
        } else {
            out.editTypes.push(e.type);
        }
    }
    return out;
}
