import type { AbilityKey } from "../../../../shared/defs/gameObjects/championDefs.ts";
import type { Champion } from "../champion.ts";

/** what one ability does when it casts: return false to not cast at all (no target, nothing to hit) */
export type Ability = () => boolean | void;

/**
 * A champion's hand-written kit. It is built once, while the Champion is still being constructed,
 * so the factory body must not read anything off `c` — `c.def`, `c.items` and `c.stats` are all
 * still unset at that point. Read them inside the ability callbacks, which only run on a cast.
 */
export type ChampionKit = (c: Champion) => Partial<Record<AbilityKey, Ability>>;

export type ChampionKitMap = Record<string, ChampionKit>;
