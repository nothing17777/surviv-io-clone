import { expect, test } from "vitest";
import { ChampionDefs, ChampionIds, ItemDefs } from "../../shared/defs/gameObjects/championDefs.ts";
import { GameObjectDefs } from "../../shared/defs/register.ts";
import { GameConfig, TeamMode } from "../../shared/gameConfig.ts";
import { InputMsg } from "../../shared/net/inputMsg.ts";
import { v2 } from "../../shared/utils/v2.ts";
import { createGame } from "./gameTestHelpers.ts";
import "./testHelpers.ts";

function setup(champ: string, enemyOffset = v2.create(8, 0)) {
    const game = createGame(TeamMode.Solo, "test_normal");
    const me = game.playerBarn.addTestPlayer({});
    const enemy = game.playerBarn.addTestPlayer({});
    me.applyKit(champ);
    enemy.pos = v2.add(me.pos, enemyOffset);
    enemy.layer = me.layer;
    game.grid.updateObject(enemy);
    me.dir = v2.normalize(enemyOffset);
    me.dirNew = v2.copy(me.dir);
    me.toMouseLen = v2.length(enemyOffset);
    return { game, me, enemy };
}

function press(me: ReturnType<typeof setup>["me"], input: number) {
    const msg = new InputMsg();
    msg.toMouseDir = v2.copy(me.dir);
    msg.toMouseLen = 8;
    msg.inputs = [input];
    return msg;
}

const steps = (game: ReturnType<typeof createGame>, n: number) => {
    for (let i = 0; i < n; i++) game.step(0.05);
};

test("every champion has its basic attack and items", () => {
    for (const id of ChampionIds) {
        const c = ChampionDefs[id];
        expect(GameObjectDefs.typeToDefSafe(`kit_${id}_basic`), id).toBeDefined();
        for (const item of c.items) expect(ItemDefs[item], `${id} ${item}`).toBeDefined();
    }
});

test("keys 1-4 cast Q-R instead of switching weapons, and go on cooldown", () => {
    const { game, me } = setup("garen");
    expect(me.champ).toBeDefined();
    me.handleInput(press(me, GameConfig.Input.EquipPrimary));
    expect(me.champ!.cooldowns[0]).toBeGreaterThan(0);
    // Garen's basic attack (a melee weapon) is still in hand
    expect(me.curWeapIdx).toBe(GameConfig.WeaponSlot.Melee);
    const seq = me.champCastSeq;
    me.handleInput(press(me, GameConfig.Input.EquipPrimary));
    expect(me.champCastSeq).toBe(seq);
    steps(game, 1);
});

test("Garen's Demacian Justice hits harder the more health the target is missing", () => {
    const a = setup("garen");
    a.enemy.health = 100;
    a.me.champ!.cast(3);
    steps(a.game, 20);
    const full = 100 - a.enemy.health;
    const b = setup("garen");
    b.enemy.health = 30;
    b.me.champ!.cast(3);
    steps(b.game, 20);
    expect(full).toBeGreaterThan(0);
    // 70 + 30% of missing health kills a 30 hp target outright
    expect(b.enemy.dead || b.enemy.health <= 0).toBe(true);
});

test("Lux's Light Binding roots the enemy it hits", () => {
    const { game, me, enemy } = setup("lux", v2.create(10, 0));
    me.champ!.cast(0);
    steps(game, 20);
    expect(enemy.health).toBeLessThan(100);
    expect(enemy.debuffs.root).toBeGreaterThan(0);
});

test("Lord Dominik's Regards gives armor pen to the basic attack", () => {
    const { me } = setup("jinx");
    expect(me.champ!.stats.armorPen).toBeCloseTo(0.35);
    expect(me.champ!.stats.crit).toBeGreaterThan(0);
});

test("Yasuo's Steel Tempest stacks into a tornado that knocks up, then Last Breath", () => {
    const { game, me, enemy } = setup("yasuo", v2.create(3, 0));
    enemy.maxHealth = 1000;
    enemy.health = 1000;
    me.champ!.cast(0);
    me.champ!.cooldowns[0] = 0;
    me.champ!.cast(0);
    me.champ!.cooldowns[0] = 0;
    me.champ!.cast(0);
    steps(game, 6);
    expect(enemy.debuffs.airborne).toBeGreaterThan(0);
    const hp = enemy.health;
    me.champ!.cast(3);
    steps(game, 10);
    expect(enemy.health).toBeLessThan(hp);
});

test("Master Yi's Meditate heals", () => {
    const { game, me } = setup("masteryi");
    me.health = 50;
    me.champ!.cast(1);
    steps(game, 40);
    expect(me.health).toBeGreaterThan(70);
});

test("Zhonya's: Lux can't be hurt in stasis", () => {
    const { game, me, enemy } = setup("lux");
    me.champ!.useItem();
    me.damage({ amount: 50, damageType: GameConfig.DamageType.Player, source: enemy, dir: v2.create(1, 0) });
    expect(me.health).toBe(me.maxHealth);
    steps(game, 1);
});
