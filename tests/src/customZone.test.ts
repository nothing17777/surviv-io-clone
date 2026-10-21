import { expect, test } from "vitest";
import { Config } from "../../server/src/config.ts";
import { Game } from "../../server/src/game/game.ts";
import { TeamMode } from "../../shared/gameConfig.ts";
import { type CustomMap, parseCustomMap } from "../../shared/utils/customMap.ts";
import { v2 } from "../../shared/utils/v2.ts";
import "./testHelpers.ts";

function zoneGame(extra: Partial<CustomMap>) {
    Config.logging.debugLogs = false;
    Config.logging.infoLogs = false;
    const res = parseCustomMap({
        format: "survev-map",
        version: 1,
        name: "zone test",
        biome: "main",
        width: 256,
        height: 256,
        noLoot: true,
        rivers: [],
        objects: [],
        spawns: [],
        ...extra,
    });
    if ("error" in res) throw new Error(res.error);
    return new Game("zone", {
        mapName: "main",
        teamMode: TeamMode.Solo,
        privateMatch: { godLoadout: false, customMap: res.map },
    });
}

/** run the gas through every stage, returning the radius it settles at */
function finalRadius(game: Game) {
    for (let i = 0; i < 40; i++) game.gas.advanceGasStage();
    return game.gas.radNew;
}

test("the zone stops shrinking at the smallest size", () => {
    expect(finalRadius(zoneGame({ zoneMinRadius: 30 }))).toBeCloseTo(30);
});

test("without a smallest size it closes completely", () => {
    expect(finalRadius(zoneGame({}))).toBe(0);
});

test("the zone still ends on the chosen point with a smallest size and full volatility", () => {
    const game = zoneGame({ zoneMinRadius: 20, zoneVolatility: 1, zoneEnd: { x: 60, y: 190 } });
    finalRadius(game);
    expect(v2.distance(game.gas.posNew, v2.create(60, 190))).toBeLessThan(20);
});
