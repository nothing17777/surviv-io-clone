import type { BulletDef } from "../bulletDefs.ts";

/**
 * Ability projectiles, keyed by the id passed to `Champion.shoot()` — so `"vi_q"` here is fired as
 * `this.shoot("vi_q", "q")` and registered as `bullet_champ_vi_q`. Defaults are speed 90,
 * distance 60, tracerWidth 0.2 (see champShot in gunDefs.ts).
 */
export type AbilityBullets = Record<string, Partial<BulletDef>>;

/**
 * A champion's own particle texture, as `<champ>/<texture>` — the name of a .tex under that
 * champion's extracted assets, without the extension. scripts/genLolChampionFx.py scans these
 * calls and converts exactly the textures named here into client/public/img/champions/fx/.
 */
export const champFx = (file: string) => `img/champions/fx/${file}.png`;
