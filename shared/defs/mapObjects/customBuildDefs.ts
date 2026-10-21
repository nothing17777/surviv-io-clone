import type { AABB } from "../../utils/coldet.ts";
import { collider } from "../../utils/collider.ts";
import { util } from "../../utils/util.ts";
import { v2, type Vec2 } from "../../utils/v2.ts";
import type { BuildingDef, FloorImage } from "./buildings/buildingDefs.ts";
import type { ObstacleDef } from "./obstacles/obstacleDefs.ts";
import type { StructureDef } from "./structureDefs.ts";

/**
 * Tunnels from the map maker.
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
    minTunnelWidth: 4,
    maxTunnelWidth: 12,
    stairsLen: 5,
};

export interface CustomTunnel {
    /** axis aligned path in world space; stairs up at both ends */
    points: Vec2[];
    width: number;
}

export interface CustomBuildSpec {
    tunnels: CustomTunnel[];
}

const wallTemplates: Record<CustomWallMaterial, RegExp> = {
    wood: /^house_wall_int_\d+$/,
    brick: /^brick_wall_ext_\d+$/,
    metal: /^metal_wall_ext_\d+$/,
    concrete: /^concrete_wall_ext_\d+$/,
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
    tunnelTypes: Array<{ type: string; pos: Vec2 }>;
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
        if (nextB >= CustomBuildLimits.buildingSlots) throw new Error("Too many tunnels");
        const name = `custom_bldg_${nextB++}`;
        defs[name] = def;
        return name;
    };
    const takeS = (def: StructureDef) => {
        if (nextS >= CustomBuildLimits.structureSlots) throw new Error("Too many tunnels");
        const name = `custom_struct_${nextS++}`;
        defs[name] = def;
        return name;
    };

    const out: AppliedCustomBuilds = { tunnelTypes: [] };
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
    return out;
}
