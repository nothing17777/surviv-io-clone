import { expect, test, vi } from "vitest";
import { KitDefs, UltronMinion } from "../../shared/defs/gameObjects/kitDefs.ts";
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
    game.grid.updateObject(enemy);
    me.dir = v2.normalize(enemyOffset);
    me.dirNew = v2.copy(me.dir);
    return { game, me, enemy };
}

function use(
    game: ReturnType<typeof createGame>,
    me: ReturnType<typeof setup>["me"],
    slot: number,
    ticks = 1,
    hold = false,
) {
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

test("Spider-Man: web swings him to what it hit", () => {
    const { game, me, enemy } = setup("spiderman");
    expect(me.maxHealth).toBe(250);
    const start = v2.copy(me.pos);
    use(game, me, Slot.Primary, 1);
    for (let i = 0; i < 10; i++) game.step(0.05);
    expect(v2.length(v2.sub(me.pos, start))).toBeGreaterThan(3);
    expect(enemy.health).toBeLessThan(100);
});

test("Spider-Man: auto webs the nearest enemy, 3x as often while dodging", () => {
    const { game, me, enemy } = setup("spiderman", v2.create(20, 0));
    enemy.maxHealth = 10000;
    enemy.health = 10000;
    // the web shooter isn't fired: only the passive hits
    me.weaponManager.setCurWeapIndex(Slot.Melee, true);
    // game.step runs whole 0.1 s ticks: 30 of them is 3 s
    for (let i = 0; i < 30; i++) game.step(0.1);
    const calm = 10000 - enemy.health;
    expect(calm).toBeGreaterThanOrEqual(60);
    expect(calm).toBeLessThanOrEqual(120);

    use(game, me, Slot.Melee, 1);
    expect(me.untargetable).toBe(true);
    const before = enemy.health;
    for (let i = 0; i < 20; i++) game.step(0.1);
    expect(me.untargetable).toBe(false);
    expect(before - enemy.health).toBeGreaterThanOrEqual(150);
});

test("Spider-Man: 5 hp/s regen, 20 hp/s after 5 s without damage", () => {
    const { game, me } = setup("spiderman", v2.create(200, 0));
    me.damage({ amount: 240, damageType: GameConfig.DamageType.Bleeding, dir: v2.create(1, 0) });
    // adrenaline heals on top, the same in both seconds
    let hp = me.health;
    for (let i = 0; i < 10; i++) game.step(0.1);
    const hurt = me.health - hp;
    for (let i = 0; i < 50; i++) game.step(0.1);
    hp = me.health;
    for (let i = 0; i < 10; i++) game.step(0.1);
    expect(me.health - hp - hurt).toBeCloseTo(15, 0);
});

test("Wolverine: dashes 16 tiles through an enemy for 50 dmg and a bleed", () => {
    const { game, me, enemy } = setup("wolverine", v2.create(4, 0));
    expect(me.maxHealth).toBe(300);
    const start = v2.copy(me.pos);
    use(game, me, Slot.Secondary, 1);
    for (let i = 0; i < 10; i++) game.step(0.05);
    expect(v2.length(v2.sub(me.pos, start))).toBeGreaterThan(12);
    expect(enemy.health).toBeLessThanOrEqual(50);
    expect(enemy.bleeding).toBeTruthy();
});

test("Ultron: minions, orb blast and laser cost energy and hit", () => {
    const { game, me, enemy } = setup("ultron");
    expect(me.shield).toBe(200);
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

    // anyone on screen, not just close by
    const far = setup("summoner", v2.create(22, 0));
    for (let i = 0; i < 20; i++) far.game.step(0.05);
    expect(far.enemy.health).toBeLessThan(100);

    const whip = setup("summoner", v2.create(20, 0));
    // the whip pulls focus once in reach
    whip.enemy.pos = v2.add(whip.me.pos, v2.create(8, 0));
    whip.game.grid.updateObject(whip.enemy);
    // the daggers would kill them before the whip lands
    whip.enemy.maxHealth = 1e6;
    whip.enemy.health = 1e6;
    use(whip.game, whip.me, Slot.Melee, 10, true);
    expect(whip.me.summonerFocusId).toBe(whip.enemy.__id);
});

test("Summoner: the whip leaves its target vulnerable, taking 10 more from each minion hit for 4 s", () => {
    const { game, me, enemy } = setup("summoner", v2.create(60, 0));
    enemy.maxHealth = 1e6;
    enemy.health = 1e6;
    const hit = (amount: number) => {
        const before = enemy.health;
        enemy.damage({
            amount,
            damageType: GameConfig.DamageType.Player,
            dir: v2.create(1, 0),
            source: me,
            gameSourceType: "kit_summoner_whip",
        });
        return before - enemy.health;
    };
    const dagger = hit(30);
    expect(enemy.vulnerable).toBe(false);
    // a lash, softer than a dagger
    hit(14);
    expect(enemy.vulnerable).toBe(true);
    expect(hit(30)).toBeCloseTo(dagger + 10, 5);
    for (let i = 0; i < 81; i++) game.step(0.05);
    expect(enemy.vulnerable).toBe(false);
    expect(hit(30)).toBeCloseTo(dagger, 5);
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

test("Wizard: the enhanced circle marks enemies inside its drawn radius and no one outside", () => {
    const radius = KitDefs.wizard.aura!.radius;
    const inside = setup("wizard", v2.create(radius - 4, 0));
    inside.me.energy = 300;
    use(inside.game, inside.me, Slot.Melee, 1);
    inside.game.step(0.05);
    expect(inside.enemy.wizardMarked).toBeTruthy();

    const outside = setup("wizard", v2.create(radius + 6, 0));
    outside.me.energy = 300;
    use(outside.game, outside.me, Slot.Melee, 1);
    outside.game.step(0.05);
    expect(outside.enemy.wizardMarked).toBeFalsy();
});

test("Ultron: shield recovery is 5 per second for 3 energy per second", () => {
    const { shieldRegen, shieldCost } = KitDefs.ultron.energy!;
    expect(shieldRegen).toBe(5);
    expect(shieldCost).toBe(3);
    expect(KitDefs.wizard.shield).toBe(100);
});

test("Iron Man: the rockets fly him for 1.5 s, untargetable, with a second wave 0.75 s in", () => {
    const { game, me, enemy } = setup("ironman", v2.create(30, 0));
    me.energy = 100;
    const wave = vi.spyOn(me.weaponManager, "fireRingWave");
    expect(me.flying).toBe(false);
    use(game, me, Slot.Secondary, 1);
    expect(me.flying).toBe(true);
    expect(me.flightTime).toBeCloseTo(1.5, 5);

    // nothing hits him in the air, not a bullet's damage and not an explosion's
    const health = me.health;
    const shield = me.shield;
    me.damage({
        amount: 50,
        damageType: GameConfig.DamageType.Player,
        dir: v2.create(1, 0),
        source: enemy,
        gameSourceType: "ak47",
    });
    me.damage({
        amount: 50,
        damageType: GameConfig.DamageType.Player,
        dir: v2.create(1, 0),
        source: enemy,
        isExplosion: true,
    });
    expect(me.health).toBe(health);
    expect(me.shield).toBe(shield);

    // the first wave is the shot itself; the second one is due 0.75 s in, even holding another weapon
    me.weaponManager.setCurWeapIndex(Slot.Primary, true);
    for (let i = 0; i < 4; i++) game.step(0.05);
    expect(wave).not.toHaveBeenCalled();
    for (let i = 0; i < 8; i++) game.step(0.05);
    expect(wave).toHaveBeenCalledTimes(1);
    expect(wave).toHaveBeenCalledWith("kit_ironman_rockets");
    expect(me.flying).toBe(true);

    // landed after 1.5 s, and he can be hurt again
    for (let i = 0; i < 18; i++) game.step(0.05);
    expect(me.flying).toBe(false);
    me.damage({
        amount: 20,
        damageType: GameConfig.DamageType.Player,
        dir: v2.create(1, 0),
        source: enemy,
        gameSourceType: "ak47",
    });
    expect(me.health + me.shield).toBeLessThan(health + shield);
    expect(wave).toHaveBeenCalledTimes(1);
});

test("Iron Man: in flight he is faster, walks through walls, and the Wizard's circle can't mark him", () => {
    const grounded = setup("ironman");
    const flier = setup("ironman");
    flier.me.energy = 100;
    use(flier.game, flier.me, Slot.Secondary, 1);
    expect(flier.me.flying).toBe(true);
    for (const t of [grounded, flier]) {
        t.me.moveLeft = false;
        t.me.moveRight = true;
        t.me.moveUp = false;
        t.me.moveDown = false;
        for (let i = 0; i < 5; i++) t.game.step(0.05);
    }
    expect(flier.me.speed).toBeGreaterThan(grounded.me.speed);

    const wizard = setup("wizard", v2.create(8, 0));
    wizard.enemy.flightTime = 5;
    wizard.me.energy = 300;
    use(wizard.game, wizard.me, Slot.Melee, 1);
    wizard.game.step(0.05);
    expect(wizard.enemy.wizardMarked).toBeFalsy();
    // but the circle still burns him
    const hp = wizard.enemy.health + wizard.enemy.shield;
    for (let i = 0; i < 10; i++) wizard.game.step(0.05);
    expect(wizard.enemy.health + wizard.enemy.shield).toBeLessThan(hp);
});

test("Iron Man: the gauntlets punch for 35 and cost no energy", () => {
    const { game, me, enemy } = setup("ironman", v2.create(2, 0));
    me.energy = 0;
    const health = enemy.health + enemy.shield;
    use(game, me, Slot.Melee, 1);
    for (let i = 0; i < 10; i++) game.step(0.05);
    expect(enemy.health + enemy.shield).toBeCloseTo(health - 35, 5);
});

test("Power Fists: punch for 45 and build shield while held", () => {
    const game = createGame(TeamMode.Solo, "test_normal");
    const me = game.playerBarn.addTestPlayer({});
    const enemy = game.playerBarn.addTestPlayer({});
    enemy.pos = v2.add(me.pos, v2.create(2, 0));
    enemy.layer = me.layer;
    me.dir = v2.create(1, 0);
    me.dirNew = v2.copy(me.dir);
    me.weaponManager.setWeapon(Slot.Melee, "pg_power_fists", 0);
    const health = enemy.health + enemy.shield;
    use(game, me, Slot.Melee, 1);
    for (let i = 0; i < 20; i++) game.step(0.05);
    expect(enemy.health + enemy.shield).toBeCloseTo(health - 45, 5);
    // 10 shield per second while they are the held weapon
    expect(me.shield).toBeGreaterThan(5);
});

test("Iron Man: untargetable for the whole 1.5 s flight, and damage over time still ticks", () => {
    const { game, me } = setup("ironman");
    me.energy = 100;
    use(game, me, Slot.Secondary, 1);
    expect(me.untargetable).toBe(true);
    const hp = me.health + me.shield;
    me.damage({ amount: 5, damageType: GameConfig.DamageType.Bleeding, dir: v2.create(1, 0) });
    expect(me.health + me.shield).toBeLessThan(hp);
    for (let i = 0; i < 5; i++) game.step(0.05);
    expect(me.flying).toBe(true);
    expect(me.untargetable).toBe(true);
    for (let i = 0; i < 20; i++) game.step(0.05);
    expect(me.flying).toBe(false);
    expect(me.untargetable).toBe(false);
});

test("Wolverine shows his dash cooldown, not his claw swings", () => {
    const { game, me } = setup("wolverine");
    use(game, me, Slot.Melee, 1);
    expect(me.abilityCooldowns[2]).toBe(0);
    use(game, me, Slot.Secondary, 1);
    expect(me.abilityCooldowns[1]).toBeGreaterThan(5);
    // swapping away and back keeps it
    me.weaponManager.setCurWeapIndex(Slot.Melee);
    game.step(0.1);
    me.weaponManager.setCurWeapIndex(Slot.Secondary);
    expect(me.abilityCooldowns[1]).toBeGreaterThan(5);
});
