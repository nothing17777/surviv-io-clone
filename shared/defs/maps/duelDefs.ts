import { util } from "../../utils/util.ts";
import type { MapDef } from "../mapDefs.ts";
import { Main, type PartialMapDef } from "./baseDefs.ts";

/**
 * Duel: a small arena for 1v1 / 2v2 / 3v3 / 4v4.
 * Exactly two teams fit in a game (see getModeMaxPlayers), and every player
 * spawns with a "god" kit: max armor, full ammo, heals and the guns they picked.
 */
const mapDef: PartialMapDef = {
    desc: {
        name: "Duel",
        icon: "",
        buttonCss: "",
        backgroundImg: "img/main_splash.png",
    },
    gameMode: {
        maxPlayers: 8,
        killLeaderEnabled: false,
        duelMode: true,
        godLoadout: true,
    },
    /* STRIP_FROM_PROD_CLIENT:START */
    gameConfig: {
        // no scheduled planes, but keep the normal crate list so a flare gun
        // can still call in an airdrop (an empty list crashed the game)
        planes: {
            timings: [],
        },
    },
    mapGen: {
        map: {
            baseWidth: 240,
            baseHeight: 240,
            scale: { small: 1, large: 1.25 },
            extension: 64,
            rivers: {
                lakes: [],
                weights: [{ weight: 1, widths: [] }],
                spawnCabins: false,
                masks: [],
            },
        },
        places: [],
        customSpawnRules: {
            locationSpawns: [],
            placeSpawns: [],
        },
        densitySpawns: [
            {
                stone_01: 350,
                barrel_01: 76,
                crate_01: 50,
                bush_01: 78,
                tree_01: 320,
                hedgehog_01: 24,
                container_01: 5,
                container_02: 5,
                shack_01: 7,
            },
        ],
        fixedSpawns: [
            {
                house_red_01: 1,
                house_red_02: 1,
                hut_01: 1,
                shack_03a: 1,
            },
        ],
        randomSpawns: [],
        spawnReplacements: [{}],
        importantSpawns: [],
    },
    /* STRIP_FROM_PROD_CLIENT:END */
};

export const Duel = util.mergeDeep({}, Main, mapDef) as MapDef;

/** Same arena, but players spawn with the normal empty kit and must loot. */
export const DuelClassic = util.mergeDeep(
    {},
    Duel,
    {
        desc: { name: "Duel Classic" },
        gameMode: { godLoadout: false },
    } satisfies PartialMapDef,
) as MapDef;
