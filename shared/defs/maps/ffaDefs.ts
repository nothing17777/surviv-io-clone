import { util } from "../../utils/util.ts";
import type { MapDef } from "../mapDefs.ts";
import { Main, type PartialMapDef } from "./baseDefs.ts";

/**
 * Free For All: the normal map, solo, with the lobby packed full of bots of every level.
 */
const mapDef: PartialMapDef = {
    desc: {
        name: "Free For All",
    },
    gameMode: {
        ffaMode: true,
    },
};

export const Ffa = util.mergeDeep({}, Main, mapDef) as MapDef;

/** Free For All where everyone spawns with max gear and the guns they picked */
export const FfaGod = util.mergeDeep({}, Ffa, {
    desc: { name: "Free For All (God Kit)" },
    gameMode: { godLoadout: true },
} satisfies PartialMapDef) as MapDef;
