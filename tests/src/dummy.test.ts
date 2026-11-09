import { expect, test } from "vitest";
import { addBot } from "../../server/src/game/bot.ts";
import { GameConfig, TeamMode } from "../../shared/gameConfig.ts";
import * as net from "../../shared/net/net.ts";
import { ObjectSerializeFns, ObjectType } from "../../shared/net/objectSerializeFns.ts";
import { BotLevels, defaultBotSettings, TrainingDummyHealth, zBotSettingsByLevel } from "../../shared/types/api.ts";
import { v2 } from "../../shared/utils/v2.ts";
import { createGame } from "./gameTestHelpers.ts";
import "./testHelpers.ts";

const hit = (p: { damage: (d: object) => void }, amount: number) =>
    p.damage({ amount, damageType: GameConfig.DamageType.Bleeding, dir: v2.create(1, 0) });

test("Training dummy: 5000 hp, bare and unarmed", () => {
    const game = createGame(TeamMode.Solo, "test_normal");
    const dummy = addBot(game, "dummy");
    expect(dummy.name).toBe("Training Dummy");
    expect(TrainingDummyHealth).toBe(5000);
    expect(dummy.maxHealth).toBe(5000);
    expect(dummy.health).toBe(5000);
    expect(dummy.perks.length).toBe(0);
    expect(dummy.helmet).toBe("");
    expect(dummy.chest).toBe("");
    expect(dummy.activeWeapon).toBe("fists");
});

test("Training dummy: never moves, even with an enemy shooting it", () => {
    const game = createGame(TeamMode.Solo, "test_normal");
    const dummy = addBot(game, "dummy");
    const foe = game.playerBarn.addTestPlayer({});
    foe.pos = v2.add(dummy.pos, v2.create(6, 0));
    foe.collider.pos = v2.copy(foe.pos);
    game.grid.updateObject(foe);
    const start = v2.copy(dummy.pos);
    for (let i = 0; i < 100; i++) {
        hit(dummy, 10);
        game.step(0.1);
    }
    expect(v2.length(v2.sub(dummy.pos, start))).toBeLessThan(0.001);
});

test("Training dummy: doesn't fight back or aim at anyone", () => {
    const game = createGame(TeamMode.Solo, "test_normal");
    const dummy = addBot(game, "dummy");
    const foe = game.playerBarn.addTestPlayer({});
    foe.pos = v2.add(dummy.pos, v2.create(5, 0));
    foe.collider.pos = v2.copy(foe.pos);
    game.grid.updateObject(foe);
    const health = foe.health;
    for (let i = 0; i < 50; i++) game.step(0.1);
    expect(foe.health).toBe(health);
    expect(dummy.botBrain?.target).toBeUndefined();
    expect(dummy.shootStart).toBe(false);
});

test("Training dummy: takes damage off its 5000 hp", () => {
    const game = createGame(TeamMode.Solo, "test_normal");
    const dummy = addBot(game, "dummy");
    hit(dummy, 1000);
    expect(dummy.health).toBe(4000);
    expect(dummy.dead).toBe(false);
});

test("Training dummy: its health bar reaches the client", () => {
    const game = createGame(TeamMode.Solo, "test_normal");
    const dummy = addBot(game, "dummy");
    hit(dummy, 2500);
    const read = (p: typeof dummy) => {
        const s = new net.BitStream(new ArrayBuffer(ObjectSerializeFns[ObjectType.Player].serializedFullSize));
        ObjectSerializeFns[ObjectType.Player].serializeFull(s, p as never);
        s.index = 0;
        const data = {} as Record<string, unknown> & { dummy: boolean; dummyHealth: number };
        ObjectSerializeFns[ObjectType.Player].deserializeFull(s, data as never);
        return data;
    };
    const data = read(dummy);
    expect(data.dummy).toBe(true);
    expect(Math.abs(data.dummyHealth - 0.5)).toBeLessThan(0.002);
    // an ordinary player has no bar
    expect(read(game.playerBarn.addTestPlayer({})).dummy).toBe(false);
});

test("Training dummy: is a bot level with settings, and old saved settings still parse", () => {
    expect(BotLevels).toContain("dummy");
    const settings = defaultBotSettings();
    expect(settings.dummy.chase).toBe(false);
    // settings saved before the dummy existed have no "dummy" key
    const { dummy: _dummy, ...old } = settings;
    const parsed = zBotSettingsByLevel.safeParse(old);
    expect(parsed.success).toBe(true);
    expect(parsed.data?.dummy.accuracy).toBe(0);
});
