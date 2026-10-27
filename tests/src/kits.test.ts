import { expect, test } from "vitest";
import { UltronMinion } from "../../shared/defs/gameObjects/kitDefs.ts";
import { GameConfig, TeamMode } from "../../shared/gameConfig.ts";
import { v2 } from "../../shared/utils/v2.ts";
import { createGame } from "./gameTestHelpers.ts";
import "./testHelpers.ts";

const Slot = GameConfig.WeaponSlot;

function setup(kit: string, enemyOffset = v2.create(8, 0)) {
    const game = createGame(TeamMode.Solo, "test_normal");
    const me = game.playerBarn.addTestPlayer({});
    const enemy = game.playerBarn.addTestPlayer({});
    me.applyKit(kit);
    enemy.pos = v2.add(me.pos, enemyOffset);
    enemy.layer = me.layer;
    me.dir = v2.normalize(enemyOffset);
    me.dirNew = v2.copy(me.dir);
    return { game, me, enemy };
}

function use(game: ReturnType<typeof createGame>, me: ReturnType<typeof setup>["me"], slot: number, ticks = 1, hold = false) {
    me.weaponManager.setCurWeapIndex(slot, true);
    for (let i = 0; i < 5; i++) game.step(0.05);
    for (let i = 0; i < ticks; i++) {
        me.shootStart = i === 0;
        me.shootHold = hold || i === 0;
        game.step(0.05);
    }
    me.shootStart = false;
    me.shootHold = false;
}

test("Spider-Man: web swings him to what it hit, slash bleeds and shields", () => {
    const { game, me, enemy } = setup("spiderman");
    expect(me.maxHealth).toBe(250);
    const start = v2.copy(me.pos);
    use(game, me, Slot.Primary, 1);
    for (let i = 0; i < 10; i++) game.step(0.05);
    expect(v2.length(v2.sub(me.pos, start))).toBeGreaterThan(3);
    expect(enemy.health).toBeLessThan(100);

    enemy.pos = v2.add(me.pos, v2.mul(me.dir, 2.5));
    const shield = me.shield;
    use(game, me, Slot.Melee, 10, true);
    expect(enemy.bleeding).toBeTruthy();
    expect(me.shield).toBeGreaterThan(shield);
});

test("Ultron: minions, orb blast and laser cost energy and hit", () => {
    const { game, me, enemy } = setup("ultron");
    expect(me.shield).toBe(300);
    use(game, me, Slot.Melee, 1);
    expect(me.minions.length).toBe(UltronMinion.count);
    expect(me.minions.every((m) => m.teamId === me.teamId)).toBeTruthy();

    me.energy = 200;
    use(game, me, Slot.Secondary, 1);
    expect(me.energy).toBeLessThan(200 - 70);
    for (let i = 0; i < 20; i++) game.step(0.05);
    expect(enemy.health).toBeLessThan(100);

    const laser = setup("ultron");
    laser.me.energy = 200;
    use(laser.game, laser.me, Slot.Primary, 10, true);
    expect(laser.me.energy).toBeLessThan(200);
    expect(laser.enemy.health).toBeLessThan(100);

    // minions blow up after 20 s
    for (let i = 0; i < 420; i++) game.step(0.05);
    expect(me.minions.every((m) => m.dead)).toBeTruthy();
});

test("Summoner: daggers attack nearby enemies, the whip sets their focus", () => {
    const { game, me, enemy } = setup("summoner", v2.create(6, 0));
    expect(me.maxHealth).toBe(150);
    for (let i = 0; i < 20; i++) game.step(0.05);
    expect(enemy.health).toBeLessThan(100);

    const whip = setup("summoner", v2.create(20, 0));
    // out of dagger range, then the whip pulls focus once in reach
    whip.enemy.pos = v2.add(whip.me.pos, v2.create(8, 0));
    use(whip.game, whip.me, Slot.Melee, 10, true);
    expect(whip.me.summonerFocusId).toBe(whip.enemy.__id);
});

test("Wizard: circle feeds energy, enhance marks enemies, spells fire", () => {
    const { game, me, enemy } = setup("wizard", v2.create(8, 0));
    me.energy = 0;
    for (let i = 0; i < 20; i++) game.step(0.05);
    expect(me.energy).toBeGreaterThan(20);

    me.energy = 300;
    use(game, me, Slot.Melee, 1);
    expect(me.kitEnhanceTime).toBeGreaterThan(0);
    game.step(0.05);
    expect(enemy.wizardMarked).toBeTruthy();

    use(game, me, Slot.Primary, 1);
    for (let i = 0; i < 10; i++) game.step(0.05);
    expect(enemy.health).toBeLessThan(100);

    const stars = setup("wizard", v2.create(12, 0));
    stars.me.energy = 300;
    use(stars.game, stars.me, Slot.Secondary, 30, true);
    expect(stars.enemy.health).toBeLessThan(100);
});
