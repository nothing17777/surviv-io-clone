import * as PIXI from "pixi.js-legacy";
import { AnimFrameSize, ChampionAnims } from "./championAnims.ts";

export { AnimFrameSize };

/**
 * The champions' own animations, drawn from the sprite sheets scripts/genLolChampionAnims.py poses out
 * of the game's skeletons: a frame of the walk while the champion moves, and of the spell it just cast.
 */

/** seconds a frame is held */
export const AnimFrameTime = 1 / 14;
/** how long a cast animation plays before the champion goes back to walking */
export const CastAnimTime = 0.55;
/** a walk keeps playing this long after the champion last moved */
export const WalkHoldTime = 0.2;
/** the sheets are drawn at AnimFrameSize; the standing model is drawn at 256 */
export const AnimScale = 0.42 * (256 / AnimFrameSize);

/** one frame of a sheet, cut out once and kept */
const frames = new Map<string, PIXI.Texture>();

export function hasAnims(champion: string) {
    return !!ChampionAnims[champion];
}

export function animCount(champion: string, name: string) {
    return ChampionAnims[champion]?.[name] ?? 0;
}

export function animFrame(champion: string, name: string, frame: number) {
    const key = `${champion}_${name}_${frame}`;
    let tex = frames.get(key);
    if (!tex) {
        const sheet = PIXI.Texture.from(`img/champions/models/${champion}_${name}.png`);
        tex = new PIXI.Texture(
            sheet.baseTexture,
            new PIXI.Rectangle(frame * AnimFrameSize, 0, AnimFrameSize, AnimFrameSize),
        );
        frames.set(key, tex);
    }
    return tex;
}
