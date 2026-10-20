import { z } from "zod";
import { MapObjectDefs } from "../defs/register.ts";
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
    /** the whole file, as JSON text */
    maxBytes: 400 * 1024,
};

/** beach around the edge of every custom map, in game units */
export const customMapShoreInset = 32;
export const customMapGrassInset = 18;

const zPos = z.number().min(0).max(CustomMapLimits.maxSize);

export const zCustomMap = z.object({
    format: z.literal("survev-map"),
    version: z.literal(1),
    name: z.string().trim().min(1).max(32),
    biome: z.enum(Object.keys(customMapBiomes) as [CustomMapBiome, ...CustomMapBiome[]]),
    width: z.number().int().min(CustomMapLimits.minSize).max(CustomMapLimits.maxSize),
    height: z.number().int().min(CustomMapLimits.minSize).max(CustomMapLimits.maxSize),
    /** no loot from crates, buildings, loot spots or airdrops */
    noLoot: z.boolean(),
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

export function isPlaceableType(type: string) {
    const def = MapObjectDefs.typeToDefSafe(type);
    return !!def && placeableTypes.has(def.type);
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
    return { map };
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
