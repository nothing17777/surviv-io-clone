import { expect, test } from "vitest";
import { MapObjectDefs } from "../../shared/defs/register.ts";
import type { StructureDef } from "../../shared/defs/mapObjects/structureDefs.ts";
import { TeamMode } from "../../shared/gameConfig.ts";
import { InputMsg } from "../../shared/net/inputMsg.ts";
import { Config } from "../../server/src/config.ts";
import { Game } from "../../server/src/game/game.ts";
import { type CustomMap, parseCustomMap } from "../../shared/utils/customMap.ts";
import { v2 } from "../../shared/utils/v2.ts";
import "./testHelpers.ts";

function tunnelGame() {
    Config.logging.logDate = false;
    Config.logging.debugLogs = false;
    Config.logging.infoLogs = false;
    const file: CustomMap = {
        format: "survev-map",
        version: 1,
        name: "tunnel test",
        biome: "main",
        width: 256,
        height: 256,
        noLoot: true,
        rivers: [],
        objects: [],
        spawns: [],
        // an L: west to east, then north
        tunnels: [{ width: 6, points: [{ x: 80, y: 120 }, { x: 160, y: 120 }, { x: 160, y: 170 }] }],
    };
    const res = parseCustomMap(file);
    if ("error" in res) throw new Error(res.error);
    return new Game("tunnel", {
        mapName: "main",
        teamMode: TeamMode.Solo,
        privateMatch: { godLoadout: false, customMap: res.map },
    });
}

test("custom tunnel is built as a two layer structure", () => {
    const game = tunnelGame();
    const structures = game.map.structures;
    expect(structures.length).toBe(1);
    const def = MapObjectDefs.typeToDef(structures[0].type) as StructureDef;
    expect(def.layers.length).toBe(2);
    expect(def.stairs.length).toBe(2);
    // the underground layer has walls along the passage
    const sub = MapObjectDefs.typeToDef(def.layers[1].type) as { mapObjects: unknown[] };
    expect(sub.mapObjects.length).toBeGreaterThan(4);
});

test("walking down the stairs puts the player underground, and back up again", () => {
    const game = tunnelGame();
    // the west stair well runs from x = 77 to 72, entered from its far (west) end
    const player = game.playerBarn.addTestPlayer({ pos: v2.create(70, 120) });
    expect(player.layer).toBe(0);

    const walk = (dir: "moveLeft" | "moveRight", seconds: number) => {
        const msg = new InputMsg();
        msg[dir] = true;
        for (let t = 0; t < seconds; t += 1 / 30) {
            player.handleInput(msg);
            game.step(1 / 30);
        }
        const stop = new InputMsg();
        player.handleInput(stop);
        game.step(1 / 30);
    };

    // east into the well and on into the tunnel
    walk("moveRight", 2);
    expect(player.pos.x).toBeGreaterThan(85);
    expect(player.layer & 1).toBe(1);

    // back west, up the stairs and out
    walk("moveLeft", 3);
    expect(player.pos.x).toBeLessThan(72);
    expect(player.layer).toBe(0);
});
