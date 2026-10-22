import { expect, test } from "vitest";
import { addBot } from "../../server/src/game/bot.ts";
import { TeamMode } from "../../shared/gameConfig.ts";
import { createGame } from "./gameTestHelpers.ts";
import "./testHelpers.ts";

test("a hacker with every perk still fits in a player update", () => {
    const game = createGame(TeamMode.Solo, "test_normal");
    const hacker = addBot(game, "hacker");
    expect(hacker.perks.length).toBeGreaterThan(20);
    expect(() => hacker.serializeFull()).not.toThrow();
});
