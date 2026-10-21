import { z } from "zod";
import { RawMapObjectDefs } from "../defs/mapObjectDefs.ts";
import {
    applyCustomBuilds,
    type CustomBuildSpec,
    CustomBuildLimits,
} from "../defs/mapObjects/customBuildDefs.ts";
import { MapObjectDefs } from "../defs/register.ts";
import { collider } from "./collider.ts";
import { mapHelpers } from "./mapHelpers.ts";
import { math } from "./math.ts";
import { Spline } from "./spline.ts";
import { v2, type Vec2 } from "./v2.ts";

/** Biomes a custom map can use; each one brings its colors, sounds and sprite atlases. */
export const customMapBiomes = {
    main: "Classic",
    desert: "Desert",
    woods: "Woods",
    snow: "Snow",
    savannah: "Savannah",
    cobalt: "Cobalt",
    halloween: "Halloween",
    beach: "Beach",
} as const;

export type CustomMapBiome = keyof typeof customMapBiomes;

export const CustomMapLimits = {
    minSize: 128,
    maxSize: 1024,
    maxObjects: 4000,
    maxRivers: 16,
    maxRiverPoints: 64,
    minRiverWidth: 4,
    maxRiverWidth: 40,
    maxSpawns: 32,
    maxTunnels: 16,
    maxTunnelPoints: 32,
    /** the whole file, as JSON text */
    maxBytes: 400 * 1024,
};

/** beach around the edge of every custom map, in game units */
export const customMapShoreInset = 32;
export const customMapGrassInset = 18;

const zPos = z.number().min(0).max(CustomMapLimits.maxSize);

export const zCustomTunnel = z.object({
    points: z.array(z.object({ x: zPos, y: zPos })).min(2).max(CustomMapLimits.maxTunnelPoints),
    width: z.number().int().min(CustomBuildLimits.minTunnelWidth).max(CustomBuildLimits.maxTunnelWidth),
});

export const zCustomMap = z.object({
    format: z.literal("survev-map"),
    version: z.literal(1),
    name: z.string().trim().min(1).max(32),
    biome: z.enum(Object.keys(customMapBiomes) as [CustomMapBiome, ...CustomMapBiome[]]),
    width: z.number().int().min(CustomMapLimits.minSize).max(CustomMapLimits.maxSize),
    height: z.number().int().min(CustomMapLimits.minSize).max(CustomMapLimits.maxSize),
    /** no loot from crates, buildings, loot spots or airdrops */
    noLoot: z.boolean(),
    /** faster, drifting storm gas (see Gas); missing in older map files */
    storm: z.boolean().optional(),
    /** zone speed multiplier: 2 closes twice as fast */
    zoneSpeed: z.number().min(0.25).max(4).optional(),
    /** where the final zone closes; missing = random, like normal games */
    zoneEnd: z.object({ x: zPos, y: zPos }).optional(),
    rivers: z
        .array(
            z.object({
                width: z.number().int().min(CustomMapLimits.minRiverWidth).max(CustomMapLimits.maxRiverWidth),
                /** a closed loop is a lake */
                looped: z.boolean(),
                points: z.array(z.object({ x: zPos, y: zPos })).min(2).max(CustomMapLimits.maxRiverPoints),
            }),
        )
        .max(CustomMapLimits.maxRivers),
    objects: z
        .array(
            z.object({
                type: z.string().max(64),
                x: zPos,
                y: zPos,
                ori: z.number().int().min(0).max(3),
                scale: z.number().min(0.5).max(2).optional(),
            }),
        )
        .max(CustomMapLimits.maxObjects),
    /** where each side starts; side 0 = Team A, 1 = Team B */
    spawns: z
        .array(z.object({ x: zPos, y: zPos, side: z.number().int().min(0).max(1) }))
        .max(CustomMapLimits.maxSpawns),
    /** drawn in the map maker; missing in older map files */
    tunnels: z.array(zCustomTunnel).max(CustomMapLimits.maxTunnels).optional(),
});

export type CustomMap = z.infer<typeof zCustomMap>;
export type CustomMapObject = CustomMap["objects"][number];

/** What the party menu shows about the uploaded map; the full file stays on the server. */
export interface CustomMapSummary {
    name: string;
    biome: CustomMapBiome;
    width: number;
    height: number;
    objects: number;
    noLoot: boolean;
}

export function summarizeCustomMap(map: CustomMap): CustomMapSummary {
    return {
        name: map.name,
        biome: map.biome,
        width: map.width,
        height: map.height,
        objects: map.objects.length,
        noLoot: map.noLoot,
    };
}

const placeableTypes = new Set(["obstacle", "building", "structure", "loot_spawner"]);

/** map maker slots and generated walls, never placed directly */
export function isCustomBuildType(type: string) {
    return type.startsWith("custom_bldg_") || type.startsWith("custom_struct_") || type.startsWith("cwall_");
}

export function isPlaceableType(type: string) {
    if (isCustomBuildType(type)) return false;
    const def = MapObjectDefs.typeToDefSafe(type);
    // the *_test loot tiers point at loot tables that don't exist
    return !!def && placeableTypes.has(def.type) && !type.endsWith("_test");
}

/**
 * Where an object has to sit so all of it, children included, stays on the
 * map. Big buildings near the edge otherwise put parts outside the map,
 * which the map message can't encode.
 */
export function fitInsideMap(obj: CustomMapObject, width: number, height: number): { x: number; y: number } {
    const aabb = collider.toAabb(
        collider.transform(
            mapHelpers.getBoundingCollider(obj.type),
            v2.create(0, 0),
            math.oriToRad(obj.ori),
            obj.scale ?? 1,
        ),
    );
    const fit = (pos: number, min: number, max: number, size: number) => {
        // some buildings have parts a few units past their listed bounds
        const lo = -min + 10;
        const hi = size - max - 10;
        return lo > hi ? size / 2 : math.clamp(pos, lo, hi);
    };
    return {
        x: fit(obj.x, aabb.min.x, aabb.max.x, width),
        y: fit(obj.y, aabb.min.y, aabb.max.y, height),
    };
}

/**
 * Parse and check a map file. Returns the map, or a message saying what's wrong
 * with it. Unknown object types and points off the map are errors rather than
 * silently dropped, so the editor and the server always agree on the map.
 */
export function parseCustomMap(input: unknown): { map: CustomMap } | { error: string } {
    let data = input;
    if (typeof input === "string") {
        if (input.length > CustomMapLimits.maxBytes) return { error: "Map file is too large." };
        try {
            data = JSON.parse(input);
        } catch {
            return { error: "That file isn't valid JSON." };
        }
    }
    const res = zCustomMap.safeParse(data);
    if (!res.success) {
        const issue = res.error.issues[0];
        const where = issue.path.length ? ` (${issue.path.join(".")})` : "";
        return { error: `Not a valid map file${where}: ${issue.message}` };
    }
    const map = res.data;
    for (const obj of map.objects) {
        if (!isPlaceableType(obj.type)) return { error: `Unknown object "${obj.type}".` };
        if (obj.x > map.width || obj.y > map.height) return { error: `"${obj.type}" is off the map.` };
    }
    for (const spawn of map.spawns) {
        if (spawn.x > map.width || spawn.y > map.height) return { error: "A spawn point is off the map." };
    }
    for (const river of map.rivers) {
        if (river.looped && river.points.length < 3) return { error: "A lake needs at least 3 points." };
        for (const p of river.points) {
            if (p.x > map.width || p.y > map.height) return { error: "A river point is off the map." };
        }
    }
    for (const t of map.tunnels ?? []) {
        for (let i = 0; i + 1 < t.points.length; i++) {
            const a = t.points[i];
            const b = t.points[i + 1];
            if ((a.x !== b.x && a.y !== b.y) || (a.x === b.x && a.y === b.y)) {
                return { error: "Tunnels have to run straight across or straight up and down." };
            }
        }
    }
    try {
        // fill a scratch copy of the table, so a map that doesn't fit is caught here
        applyCustomBuilds({ ...RawMapObjectDefs }, customBuildSpec(map));
    } catch (err) {
        return { error: err instanceof Error ? err.message : "The tunnels in this map don't fit." };
    }
    return { map };
}

/** What gets generated from a map: its tunnels. */
export function customBuildSpec(map: CustomMap): CustomBuildSpec {
    return { tunnels: map.tunnels ?? [] };
}

/**
 * Fill the live map object table for this map. Returns the generated types,
 * in the order of spec.tunnels.
 */
export function applyCustomMapBuilds(spec: CustomBuildSpec) {
    const applied = applyCustomBuilds(RawMapObjectDefs, spec);
    mapHelpers.forgetBoundingColliders(isCustomBuildType);
    return applied;
}

/**
 * The river polygons get one vertex per point, so the few points clicked in
 * the editor are run through a spline into a smooth curve, one point every
 * few units. The editor preview and the server both use this.
 */
export function smoothRiverPoints(points: Array<{ x: number; y: number }>, looped: boolean): Vec2[] {
    const pts = points.map((p) => v2.create(p.x, p.y));
    if (looped) pts.push(v2.copy(pts[0]));
    if (pts.length < 2) return pts;

    let length = 0;
    for (let i = 1; i < pts.length; i++) length += v2.distance(pts[i - 1], pts[i]);
    // the map message stores at most 255 points per river
    const count = math.clamp(Math.round(length / 4), pts.length, 240);

    const spline = new Spline(pts, looped);
    const out: Vec2[] = [];
    for (let i = 0; i <= count; i++) out.push(spline.getPos(i / count));
    return out;
}
