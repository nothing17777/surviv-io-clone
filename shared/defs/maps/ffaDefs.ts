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
