import type { Atlas } from "../../shared/defs/mapDefs.ts";
import { MapObjectDefs } from "../../shared/defs/register.ts";
import { Atlases } from "../atlas-builder/atlasDefs.ts";

let atlasBySprite: Map<string, Atlas[]> | undefined;

function spriteIndex() {
    if (!atlasBySprite) {
        atlasBySprite = new Map();
        for (const [atlas, def] of Object.entries(Atlases) as Array<[Atlas, { images: string[] }]>) {
            for (const img of def.images) {
                const list = atlasBySprite.get(img) ?? [];
                list.push(atlas);
                atlasBySprite.set(img, list);
            }
        }
    }
    return atlasBySprite;
}

function collectSprites(type: string, out: Set<string>, seen: Set<string>) {
    if (seen.has(type)) return;
    seen.add(type);
    const def = MapObjectDefs.typeToDefSafe(type);
    if (!def) return;

    const walk = (val: unknown) => {
        if (typeof val === "string") {
            if (val.endsWith(".img")) out.add(`map/${val.replace(/\.img$/, ".svg")}`);
        } else if (Array.isArray(val)) {
            for (const v of val) walk(v);
        } else if (val && typeof val === "object") {
            for (const v of Object.values(val)) walk(v);
        }
    };
    walk(def);

    const children: unknown[] = [
        ...("mapObjects" in def ? def.mapObjects : []),
        ...("layers" in def ? def.layers : []),
    ];
    for (const child of children) {
        const t = (child as { type?: string | Record<string, number> }).type;
        if (typeof t === "string") collectSprites(t, out, seen);
        else if (t) { for (const key of Object.keys(t)) collectSprites(key, out, seen); }
    }
}

/**
 * Atlases the given map objects need beyond the ones already loaded. Normal
 * maps only use their own biome's objects so this is empty; a map maker map
 * can mix objects from any biome.
 */
export function extraAtlasesFor(types: Iterable<string>, loaded: readonly Atlas[]): Atlas[] {
    const sprites = new Set<string>();
    const seen = new Set<string>();
    for (const type of types) collectSprites(type, sprites, seen);

    const index = spriteIndex();
    const extra = new Set<Atlas>();
    for (const sprite of sprites) {
        const atlases = index.get(sprite);
        if (!atlases || atlases.some((a) => loaded.includes(a))) continue;
        extra.add(atlases[0]);
    }
    return [...extra];
}
