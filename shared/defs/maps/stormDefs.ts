import { util } from "../../utils/util.ts";
import type { MapDef } from "../mapDefs.ts";
import { Main, type PartialMapDef } from "./baseDefs.ts";

/**
 * Storm: the normal map, but the gas closes faster with jittered timings, and
 * each new circle can overlap the current storm so players have to keep moving.
 */
const mapDef: PartialMapDef = {
    desc: {
        name: "Storm",
    },
    gameMode: {
        stormMode: true,
    },
};

export const Storm = util.mergeDeep({}, Main, mapDef) as MapDef;
