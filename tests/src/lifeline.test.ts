import { expect, test } from "vitest";
import { GameConfig, TeamMode } from "../../shared/gameConfig.ts";
import { v2 } from "../../shared/utils/v2.ts";
import { createGame } from "./gameTestHelpers.ts";
import "./testHelpers.ts";

test("Leadership doesn't refill what Indomitable Spirit spends", () => {
    const game = createGame(TeamMode.Solo, "test_normal");
    const playerA = game.playerBarn.addTestPlayer({});
    const playerB = game.playerBarn.addTestPlayer({});
    playerB.addPerk("leadership", false);
    playerB.addPerk("lifeline", false);
    playerB.boost = 100;

    const hit = () =>
        playerB.damage({
            amount: playerB.health + 10,
            damageType: GameConfig.DamageType.Player,
            dir: v2.randomUnit(),
            source: playerA,
        });

    // first lethal hits are saved by adrenaline, then it runs out instead of refilling
    for (let i = 0; i < 20 && !playerB.dead; i++) {
        hit();
        game.update(0.1);
    }
    expect(playerB.dead).toBeTruthy();
});
