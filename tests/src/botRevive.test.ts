import { expect, test } from "vitest";
import { addBot } from "../../server/src/game/bot.ts";
import { GameConfig, TeamMode } from "../../shared/gameConfig.ts";
import { v2 } from "../../shared/utils/v2.ts";
import { createGame } from "./gameTestHelpers.ts";
import "./testHelpers.ts";

const down = (p: { damage: (d: object) => void }) =>
    p.damage({ amount: 999, damageType: GameConfig.DamageType.Airdrop, dir: v2.randomUnit() });

test("a downed bot with Revivify gets itself back up", () => {
    const game = createGame(TeamMode.Solo, "test_normal");
    const bot = addBot(game, "advanced");
    bot.addPerk("self_revive", false);
    down(bot);
    expect(bot.downed).toBeTruthy();
    for (let t = 0; t < 12 && bot.downed; t += 0.1) game.step(0.1);
    expect(bot.downed).toBeFalsy();
    expect(bot.dead).toBeFalsy();
});

test("a bot revives a downed teammate", () => {
    const game = createGame(TeamMode.Squad, "test_normal");
    const group = game.playerBarn.addGroup(false);
    const mate = game.playerBarn.addTestPlayer({ group });
    const _other = game.playerBarn.addTestPlayer({ group });
    const bot = addBot(game, "advanced");
    bot.teamId = mate.teamId;
    bot.pos = v2.add(mate.pos, v2.create(2, 0));
    down(mate);
    expect(mate.downed).toBeTruthy();
    for (let t = 0; t < 15 && mate.downed; t += 0.1) game.step(0.1);
    expect(mate.downed).toBeFalsy();
    expect(mate.dead).toBeFalsy();
});
