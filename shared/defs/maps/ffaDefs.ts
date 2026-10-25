import { util } from "../../utils/util.ts";
import type { MapDef } from "../mapDefs.ts";
import { Main, type PartialMapDef } from "./baseDefs.ts";
import { Potato } from "./potatoDefs.ts";

/**
 * Free For All: the normal map filled to 100 players with bots (no hackers or scripters).
 */
const mapDef: PartialMapDef = {
    desc: {
        name: "Free For All",
    },
    gameMode: {
        maxPlayers: 100,
        ffaMode: true,
    },
};

export const Ffa = util.mergeDeep({}, Main, mapDef) as MapDef;

/** Free For All where everyone spawns with max gear and the guns they picked */
export const FfaGod = util.mergeDeep({}, Ffa, {
    desc: { name: "Free For All (God Kit)" },
    gameMode: { godLoadout: true },
} satisfies PartialMapDef) as MapDef;

/** Zombie Apocalypse: the lobby packed with bots of every level, hackers and scripters included */
export const Zombie = util.mergeDeep({}, Main, {
    desc: { name: "Zombie Apocalypse" },
    gameMode: { ffaMode: true, ffaAllLevels: true },
} satisfies PartialMapDef) as MapDef;

/** Free For All on the potato map */
export const FfaPotato = util.mergeDeep({}, Potato, {
    desc: { name: "Free For All (Potato)" },
    gameMode: { maxPlayers: 100, ffaMode: true },
} satisfies PartialMapDef) as MapDef;
