import { expect, test, vi } from "vitest";
import { BulletDefs } from "../../shared/defs/gameObjects/bulletDefs.ts";
import { dronePos, KitDefs, UltronMinion } from "../../shared/defs/gameObjects/kitDefs.ts";
import { GameObjectDefs } from "../../shared/defs/register.ts";
import { GameConfig, TeamMode } from "../../shared/gameConfig.ts";
import * as net from "../../shared/net/net.ts";
import { ObjectSerializeFns, ObjectType } from "../../shared/net/objectSerializeFns.ts";
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
    // a moved player's hitbox only follows on its next move
    enemy.collider.pos = v2.copy(enemy.pos);
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

test("Spider-Man: 2 hp/s regen, 20 hp/s after 5 s without damage", () => {
    const { game, me } = setup("spiderman", v2.create(200, 0));
    me.damage({ amount: 240, damageType: GameConfig.DamageType.Bleeding, dir: v2.create(1, 0) });
    // adrenaline heals on top, the same in both seconds
    let hp = me.health;
    for (let i = 0; i < 10; i++) game.step(0.1);
    const hurt = me.health - hp;
    for (let i = 0; i < 50; i++) game.step(0.1);
    hp = me.health;
    for (let i = 0; i < 10; i++) game.step(0.1);
    expect(me.health - hp - hurt).toBeCloseTo(18, 0);
});

test("Wolverine: dashes 16 tiles through an enemy for 50 dmg and a bleed", () => {
    const { game, me, enemy } = setup("wolverine", v2.create(4, 0));
    expect(me.maxHealth).toBe(200);
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

test("Ultron: shield recovery is 2 per second for 3 energy per second", () => {
    const { shieldRegen, shieldCost } = KitDefs.ultron.energy!;
    expect(shieldRegen).toBe(2);
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

test("kit regen: slow base rates, then the out of combat rate after 5 s without being hit", () => {
    // a kit on full adrenaline heals this much on top of its own rate
    const boostRegen = 1.75;
    const rates = {
        spiderman: { base: 2, calm: 20, boosted: true },
        wolverine: { base: 5, calm: 10, boosted: true },
        ironman: { base: 0, calm: 5, boosted: false },
        ultron: { base: 0, calm: 5, boosted: false },
    };
    for (const [kit, r] of Object.entries(rates)) {
        const { game, me } = setup(kit, v2.create(60, 0));
        me.energy = 0;
        me.health = 20;
        me.calmTime = 0;
        const adrenaline = r.boosted ? boostRegen : 0;
        const before = me.health;
        // game.step runs whole 0.1 s ticks: ten of them is a second
        for (let i = 0; i < 10; i++) game.step(0.1);
        // the first second is still "in combat": only the base rate (0 for kits without one)
        expect(me.health - before).toBeCloseTo(r.base + adrenaline, 1);

        me.calmTime = 5;
        const calm = me.health;
        for (let i = 0; i < 10; i++) game.step(0.1);
        expect(me.health - calm).toBeCloseTo(r.calm + adrenaline, 1);
    }
    expect(KitDefs.wolverine.lowHealth).toBeUndefined();
});

test("kit regen: a hit the shield soaks up still ends the calm", () => {
    const { game, me, enemy } = setup("ultron", v2.create(60, 0));
    me.calmTime = 10;
    me.damage({
        amount: 10,
        damageType: GameConfig.DamageType.Player,
        dir: v2.create(1, 0),
        source: enemy,
        gameSourceType: "ak47",
    });
    expect(me.shield).toBeLessThan(200);
    expect(me.health).toBe(me.maxHealth);
    expect(me.calmTime).toBe(0);
    game.step(0.05);
});

test("kit shield and health sustain numbers", () => {
    expect(KitDefs.ironman.energy).toMatchObject({ heal: 1, shieldRegen: 1 });
    expect(KitDefs.ultron.energy).toMatchObject({ shieldRegen: 2 });
    expect(KitDefs.wolverine.health).toBe(200);
    expect(KitDefs.wizard.aura).toMatchObject({ shield: 2, health: 2 });
});

test("War Machine: 50 hp, 150 armor, Second Fire, Missile Barrage and Iron Man's gauntlets", () => {
    const { me } = setup("warmachine", v2.create(200, 0));
    expect(me.maxHealth).toBe(50);
    expect(me.health).toBe(50);
    expect(me.maxShield).toBe(150);
    expect(me.shield).toBe(150);
    expect(me.weapons[Slot.Primary].type).toBe("kit_warmachine_secondfire");
    expect(me.weapons[Slot.Secondary].type).toBe("kit_warmachine_barrage");
    expect(me.weapons[Slot.Melee].type).toBe("kit_warmachine_fists");
    expect(me.outfit).toBe("outfitKitWarmachine");
    // slot 3 is a copy of Iron Man's gauntlets
    const mine = GameObjectDefs.typeToDef("kit_warmachine_fists", "melee");
    const his = GameObjectDefs.typeToDef("kit_ironman_fists", "melee");
    expect(mine.damage).toBe(his.damage);
    expect(mine.attack).toEqual(his.attack);
});

test("War Machine: the right shoulder mount fires 5 shots/s at the nearest enemy within 30", () => {
    const { game, me, enemy } = setup("warmachine", v2.create(20, 0));
    enemy.maxHealth = 10000;
    enemy.health = 10000;
    const fire = vi.spyOn(game.bulletBarn, "fireBullet");
    // the skill isn't used: only the passive hits (6 dmg a shot, so about 90 in 3 s)
    for (let i = 0; i < 30; i++) game.step(0.1);
    const dealt = 10000 - enemy.health;
    expect(dealt).toBeGreaterThanOrEqual(60);
    expect(dealt).toBeLessThanOrEqual(120);
    // quiet, and the shot comes from the mount's gun def
    const first = fire.mock.calls[0][0];
    expect(first.gameSourceType).toBe("kit_warmachine_mount");
    expect(first.shotFx).toBe(true);
    // out of range nothing fires
    enemy.pos = v2.add(me.pos, v2.create(40, 0));
    game.grid.updateObject(enemy);
    const hp = enemy.health;
    for (let i = 0; i < 20; i++) game.step(0.1);
    expect(enemy.health).toBe(hp);
});

test("War Machine: the mount sits behind his right shoulder, the second one behind the left", () => {
    const { me } = setup("warmachine", v2.create(200, 0));
    const m = KitDefs.warmachine.mounts!;
    me.dir = v2.create(1, 0);
    const right = me.mountPos(m, false);
    const left = me.mountPos(m, true);
    // facing +x with y up: his right hand is -y, and his back is -x
    expect(right.x).toBeCloseTo(me.pos.x - m.back);
    expect(right.y).toBeCloseTo(me.pos.y - m.side);
    expect(left.x).toBeCloseTo(me.pos.x - m.back);
    expect(left.y).toBeCloseTo(me.pos.y + m.side);
    me.dir = v2.create(0, 1);
    const turned = me.mountPos(m, false);
    expect(turned.x).toBeCloseTo(me.pos.x + m.side);
    expect(turned.y).toBeCloseTo(me.pos.y - m.back);
});

test("War Machine: Second Fire adds a left mount for 10 s, then waits out a 12 s cooldown", () => {
    const { game, me, enemy } = setup("warmachine", v2.create(20, 0));
    enemy.maxHealth = 100000;
    enemy.health = 100000;
    expect(me.kitAura).toBe(4);
    for (let i = 0; i < 30; i++) game.step(0.1);
    const single = 100000 - enemy.health;

    use(game, me, Slot.Primary, 1);
    expect(me.kitAura).toBe(5);
    expect(me.kitEnhanceTime).toBeGreaterThan(9);
    expect(me.abilityCooldowns[0]).toBeGreaterThan(10);
    const before = enemy.health;
    for (let i = 0; i < 30; i++) game.step(0.1);
    const double = before - enemy.health;
    expect(double).toBeGreaterThanOrEqual(single * 1.6);

    // 10 s after the skill the left mount shuts off again
    for (let i = 0; i < 80; i++) game.step(0.1);
    expect(me.kitEnhanceTime).toBe(0);
    expect(me.kitAura).toBe(4);
    const after = enemy.health;
    for (let i = 0; i < 30; i++) game.step(0.1);
    expect(after - enemy.health).toBeLessThanOrEqual(single * 1.3);
    // the cooldown is still running until 12 s, then the skill is ready again
    expect(me.abilityCooldowns[0]).toBe(0);
});

test("War Machine: Missile Barrage flies him 1.5 s with 2 rockets of 10 dmg and no second volley", () => {
    const { game, me, enemy } = setup("warmachine", v2.create(20, 0));
    enemy.maxHealth = 100000;
    enemy.health = 100000;
    const gun = GameObjectDefs.typeToDef("kit_warmachine_barrage", "gun");
    const iron = GameObjectDefs.typeToDef("kit_ironman_rockets", "gun");
    // the same flight and cooldown as Iron Man's rockets, but 2 rockets of 10 dmg
    expect(gun.flight).toMatchObject({ duration: iron.flight!.duration, untargetable: iron.flight!.untargetable });
    expect(gun.fireDelay).toBe(iron.fireDelay);
    expect(gun.bulletCount).toBe(2);
    expect(BulletDefs[gun.bulletType].damage).toBe(10);
    expect(BulletDefs[gun.bulletType].sprite).toBe(BulletDefs[iron.bulletType].sprite);

    // 2 s of the passive alone: 10 shots at 6 dmg
    const fire = vi.spyOn(game.bulletBarn, "fireBullet");
    for (let i = 0; i < 20; i++) game.step(0.1);
    const calm = fire.mock.calls.filter((c) => c[0].gameSourceType === "kit_warmachine_mount").length;
    expect(calm).toBeGreaterThanOrEqual(9);
    expect(calm).toBeLessThanOrEqual(11);

    expect(me.flying).toBe(false);
    use(game, me, Slot.Secondary, 1);
    expect(me.flying).toBe(true);
    expect(me.flightTime).toBeCloseTo(1.5, 1);
    expect(me.abilityCooldowns[1]).toBeGreaterThan(8);
    const barrage = fire.mock.calls.filter((c) => c[0].gameSourceType === "kit_warmachine_barrage");
    // 2 rockets and no second volley
    expect(barrage.length).toBe(2);
    for (let i = 0; i < 20; i++) game.step(0.1);
    expect(fire.mock.calls.filter((c) => c[0].gameSourceType === "kit_warmachine_barrage").length).toBe(2);
    expect(me.flying).toBe(false);
});

test("War Machine: the mounts fire 10 shots/s each while flying, the left one too once Second Fire is up", () => {
    const shots = (second: boolean, flying: boolean) => {
        const { game, me, enemy } = setup("warmachine", v2.create(20, 0));
        enemy.maxHealth = 100000;
        enemy.health = 100000;
        const fire = vi.spyOn(game.bulletBarn, "fireBullet");
        if (second) me.kitEnhanceTime = 10;
        if (flying) me.flightTime = 10;
        // game.step runs whole 0.1 s ticks: 20 of them is 2 s
        for (let i = 0; i < 20; i++) game.step(0.1);
        return fire.mock.calls.filter((c) => c[0].gameSourceType === "kit_warmachine_mount").length;
    };
    const base = shots(false, false);
    expect(base).toBeGreaterThanOrEqual(9);
    expect(base).toBeLessThanOrEqual(11);
    const flying = shots(false, true);
    expect(flying).toBeGreaterThanOrEqual(19);
    expect(flying).toBeLessThanOrEqual(21);
    // both mounts, both faster: about 4x the ground rate with one mount
    const both = shots(true, true);
    expect(both).toBeGreaterThanOrEqual(38);
    expect(both).toBeLessThanOrEqual(42);
});

test("War Machine: Missile Barrage rockets burn for 4 s like Iron Man's", () => {
    const { me, enemy } = setup("warmachine", v2.create(200, 0));
    enemy.damage({
        amount: 10,
        damageType: GameConfig.DamageType.Player,
        dir: v2.create(1, 0),
        source: me,
        gameSourceType: "kit_warmachine_barrage",
    });
    expect(enemy.burnDuration).toBeGreaterThan(3.5);
    expect(enemy.burnWeapon).toBe("kit_warmachine_barrage");
});

test("War Machine: armor regens 2/s, 8/s after 5 s without being hit", () => {
    const { game, me } = setup("warmachine", v2.create(200, 0));
    // game.step runs whole 0.1 s ticks: 10 of them is 1 s
    me.shield = 10;
    me.calmTime = 0;
    for (let i = 0; i < 10; i++) game.step(0.1);
    // the first second is still in combat
    expect(me.shield - 10).toBeCloseTo(2, 0);
    me.shield = 10;
    me.calmTime = 5;
    for (let i = 0; i < 10; i++) game.step(0.1);
    expect(me.shield - 10).toBeCloseTo(8, 0);
    me.shield = 149;
    for (let i = 0; i < 10; i++) game.step(0.1);
    expect(me.shield).toBe(150);
});

test("War Machine: a hit ends the calm, and the shoulder mount's shots are quiet and don't kick his hands", () => {
    const { me, enemy } = setup("warmachine", v2.create(200, 0));
    me.calmTime = 10;
    me.damage({
        amount: 10,
        damageType: GameConfig.DamageType.Player,
        dir: v2.create(1, 0),
        source: enemy,
        gameSourceType: "ak47",
    });
    expect(me.calmTime).toBe(0);
    const gun = GameObjectDefs.typeToDef("kit_warmachine_mount", "gun");
    expect(gun.mounted).toBe(true);
    expect(gun.shotVolume).toBeLessThan(0.5);
    expect(BulletDefs[gun.bulletType].damage).toBe(6);
    expect(BulletDefs[gun.bulletType].distance).toBe(KitDefs.warmachine.mounts!.range);
});

test("every kit: reloading a slot that holds no gun does nothing", () => {
    for (const kit of Object.keys(KitDefs)) {
        const { game, me } = setup(kit);
        for (const slot of [Slot.Primary, Slot.Secondary]) {
            me.weaponManager.setCurWeapIndex(slot, true);
            use(game, me, slot, 40, true);
            me.weaponManager.tryReload();
            me.weaponManager.reload(slot);
            for (let i = 0; i < 20; i++) game.step(0.05);
        }
        expect(me.dead).toBe(false);
    }
});

const goblin = KitDefs.greengoblin.drone!;

test("Green Goblin: 150 hp, no armor, three skills in slots 1-3, in the sheet's green", () => {
    const { me } = setup("greengoblin", v2.create(200, 0));
    expect(me.maxHealth).toBe(150);
    expect(me.health).toBe(150);
    expect(me.maxShield).toBe(0);
    expect(me.helmet).toBe("");
    expect(me.chest).toBe("");
    expect(me.weapons[Slot.Primary].type).toBe("kit_goblin_pumpkin");
    expect(me.weapons[Slot.Secondary].type).toBe("kit_goblin_upgrade");
    expect(me.weapons[Slot.Melee].type).toBe("kit_goblin_swap");
    expect(me.outfit).toBe("outfitKitGreengoblin");
    expect(me.kitAura).toBe(6);
});

test("Green Goblin: regens 1 hp/s, 4 hp/s after 5 s without being hit", () => {
    const { game, me } = setup("greengoblin", v2.create(200, 0));
    me.health = 20;
    me.calmTime = 0;
    // game.step runs whole 0.1 s ticks: 10 of them is 1 s
    for (let i = 0; i < 10; i++) game.step(0.1);
    expect(me.health - 20).toBeCloseTo(1, 0);
    me.health = 20;
    me.calmTime = 5;
    for (let i = 0; i < 10; i++) game.step(0.1);
    expect(me.health - 20).toBeCloseTo(4, 0);
});

test("Green Goblin: the drone circles counter clockwise at radius 25 and its point leads", () => {
    const { game, me } = setup("greengoblin", v2.create(200, 0));
    const start = me.droneAngle;
    game.step(0.1);
    // counter clockwise: the angle grows, by the turn rate
    expect(me.droneAngle - start).toBeCloseTo(goblin.turnRate * 0.1, 3);
    const [main] = me.dronePositions(goblin);
    expect(v2.length(v2.sub(main.pos, me.pos))).toBeCloseTo(25, 5);
    // the tip is ahead of the drone along the circle's tangent, at right angles to the radius
    const tip = me.droneTip(goblin, main);
    expect(v2.dot(tip.dir, v2.normalize(v2.sub(main.pos, me.pos)))).toBeCloseTo(0, 5);
    expect(v2.dot(tip.dir, v2.create(-Math.sin(main.angle), Math.cos(main.angle)))).toBeCloseTo(1, 5);
    expect(v2.length(v2.sub(tip.pos, main.pos))).toBeCloseTo(goblin.tip, 5);
    // and it stays inside [0, 2pi) however long it has turned, since clients are sent it in 8 bits
    for (let i = 0; i < 400; i++) {
        game.step(0.1);
        expect(me.droneAngle).toBeGreaterThanOrEqual(0);
        expect(me.droneAngle).toBeLessThan(Math.PI * 2);
    }
});

test("Green Goblin: the drone cuts an enemy it passes between ticks for 25 and a 4 s bleed, once a lap", () => {
    // 25 up from the goblin: the drone covers over 10 units a tick, so it passes this enemy without ever
    // being within reach of it at the end of a tick
    const { game, me, enemy } = setup("greengoblin", v2.create(0, 25));
    enemy.maxHealth = 10000;
    enemy.health = 10000;
    const hit = vi.spyOn(enemy, "damage");
    const hits = () => hit.mock.calls.filter((c) => c[0].gameSourceType === "kit_goblin_drone");
    for (let i = 0; i < 5; i++) game.step(0.1);
    expect(hits().length).toBe(1);
    expect(hits()[0][0].amount).toBe(25);
    expect(enemy.bleeding).toBe(true);
    expect(enemy.bleedDotDuration).toBeGreaterThan(3);
    expect(enemy.bleedDotDuration).toBeLessThanOrEqual(4);
    // a lap takes 1.5 s: it comes round again at about 1.9 s, and not before the next one at about 3.4 s
    for (let i = 5; i < 30; i++) game.step(0.1);
    expect(hits().length).toBe(2);
    // an enemy out of the circle's reach is left alone
    const far = game.playerBarn.addTestPlayer({});
    far.pos = v2.add(me.pos, v2.create(0, 40));
    far.layer = me.layer;
    game.grid.updateObject(far);
    const farHit = vi.spyOn(far, "damage");
    for (let i = 0; i < 20; i++) game.step(0.1);
    expect(farHit.mock.calls.filter((c) => c[0].gameSourceType === "kit_goblin_drone").length).toBe(0);
});

test("Green Goblin: the drone never hurts its owner's team or an untargetable enemy", () => {
    const { game, me, enemy } = setup("greengoblin", v2.create(25, 0));
    enemy.teamId = me.teamId;
    const hit = vi.spyOn(enemy, "damage");
    for (let i = 0; i < 20; i++) game.step(0.1);
    expect(hit.mock.calls.length).toBe(0);
    expect(me.health).toBe(me.maxHealth);
});

test("Green Goblin: Pumpkin Bombs throw 3 bouncing bombs in a 60 degree cone, 6 s cooldown", () => {
    const { game, me } = setup("greengoblin", v2.create(30, 0));
    const fire = vi.spyOn(game.bulletBarn, "fireBullet");
    use(game, me, Slot.Primary, 1);
    const bombs = fire.mock.calls.filter((c) => c[0].bulletType === "bullet_kit_goblin_pumpkin");
    expect(bombs.length).toBe(3);
    const angles = bombs.map((c) => Math.atan2(c[0].dir.y, c[0].dir.x) * 180 / Math.PI).sort((a, b) => a - b);
    // aimed along +x: one straight on and one 30 degrees either side
    expect(angles[0]).toBeCloseTo(-30, 1);
    expect(angles[1]).toBeCloseTo(0, 1);
    expect(angles[2]).toBeCloseTo(30, 1);
    expect(me.abilityCooldowns[0]).toBeGreaterThan(5);
    expect(me.abilityCooldowns[0]).toBeLessThanOrEqual(6);
    // a second throw before the 6 s are up does nothing
    fire.mockClear();
    use(game, me, Slot.Primary, 1);
    expect(fire.mock.calls.filter((c) => c[0].bulletType === "bullet_kit_goblin_pumpkin").length).toBe(0);
    const def = BulletDefs.bullet_kit_goblin_pumpkin;
    expect(def.bounce).toBe(true);
    expect(def.lifetime).toBe(10);
    expect(def.speed).toBeGreaterThanOrEqual(60);
    expect(def.damage).toBe(0);
});

test("Green Goblin: a pumpkin bomb goes off on the enemy it hits for 25 and a 3 s burn, and spares him", () => {
    const { game, me, enemy } = setup("greengoblin", v2.create(15, 0));
    enemy.maxHealth = 10000;
    enemy.health = 10000;
    const hit = vi.spyOn(enemy, "damage");
    use(game, me, Slot.Primary, 1);
    for (let i = 0; i < 6; i++) game.step(0.1);
    const blast = hit.mock.calls.filter((c) => c[0].gameSourceType === "kit_goblin_pumpkin" && c[0].amount > 0);
    expect(blast.length).toBeGreaterThan(0);
    expect(blast.some((c) => c[0].amount === 25)).toBe(true);
    expect(enemy.burnDuration).toBeGreaterThan(2);
    expect(enemy.burnDuration).toBeLessThanOrEqual(3);
    expect(enemy.burnWeapon).toBe("kit_goblin_pumpkin");
    expect(me.health).toBe(me.maxHealth);
});

test("Green Goblin: his own bombs never hurt him or his team, even going off at his feet", () => {
    const { game, me, enemy } = setup("greengoblin", v2.create(1, 0));
    const mate = game.playerBarn.addTestPlayer({});
    mate.teamId = me.teamId;
    mate.pos = v2.add(me.pos, v2.create(0, 1));
    mate.layer = me.layer;
    game.grid.updateObject(mate);
    const params = { source: me, gameSourceType: "kit_goblin_pumpkin", damageType: GameConfig.DamageType.Player };
    game.explosionBarn.addExplosion("explosion_kit_pumpkin", v2.copy(me.pos), me.layer, params);
    game.step(0.1);
    expect(me.health).toBe(me.maxHealth);
    expect(mate.health).toBe(mate.maxHealth);
    expect(enemy.health).toBeLessThan(enemy.maxHealth);
    const def = GameObjectDefs.typeToDef("explosion_kit_pumpkin", "explosion");
    expect(def.damage).toBe(25);
});

test("Green Goblin: a bomb bounces off a wall and the 10 s of its life carry on through the bounce", () => {
    const { game, me } = setup("greengoblin", v2.create(30, 0));
    // a boulder 20 ahead of him
    game.map.genObstacle("stone_01", v2.add(me.pos, v2.create(20, 0)), 0, 0, 1);
    const fire = vi.spyOn(game.bulletBarn, "fireBullet");
    const blasts = vi.spyOn(game.explosionBarn, "addExplosion");
    use(game, me, Slot.Primary, 1);
    for (let i = 0; i < 6; i++) game.step(0.1);
    // the bomb that flew straight at the boulder came back as a new bomb, one bounce in
    const bounced = fire.mock.calls.filter(
        (c) => c[0].bulletType === "bullet_kit_goblin_pumpkin" && (c[0].reflectCount ?? 0) > 0,
    );
    expect(bounced.length).toBeGreaterThan(0);
    // it did not go off on the wall
    const onWall = blasts.mock.calls.filter((c) =>
        c[0] === "explosion_kit_pumpkin"
        && v2.length(v2.sub(c[1], v2.add(me.pos, v2.create(20, 0)))) < 4
    );
    expect(onWall.length).toBe(0);
    // and the new bomb knows how long it has already flown: well under the 10 s, not a fresh 10 s
    const live = game.bulletBarn.bullets.find((b) =>
        b.active && b.reflectCount === 1
        && b.bulletType === "bullet_kit_goblin_pumpkin"
    );
    expect(live).toBeDefined();
    expect(live!.age).toBeGreaterThan(0.05);
    expect(live!.age).toBeLessThan(1);
    // it can't hurt him as it comes back through
    expect(me.health).toBe(me.maxHealth);
});

test("Green Goblin: Golden Upgrade adds 2 yellow drones a third of a lap apart, speed, and bombs off their tips", () => {
    const { game, me } = setup("greengoblin", v2.create(200, 0));
    me.weaponManager.setCurWeapIndex(Slot.Secondary, true);
    for (let i = 0; i < 3; i++) game.step(0.1);
    me.recalculateSpeed(false);
    const baseSpeed = me.speed;
    const fire = vi.spyOn(game.bulletBarn, "fireBullet");
    use(game, me, Slot.Secondary, 1);
    expect(me.kitEnhanceTime).toBeGreaterThan(7.5);
    expect(me.kitEnhanceTime).toBeLessThanOrEqual(8);
    expect(me.kitAura).toBe(7);
    // nothing fires at once: the sub drones' first bombs come 2 s in
    expect(fire.mock.calls.filter((c) => c[0].bulletType === "bullet_kit_goblin_pumpkin").length).toBe(0);
    me.recalculateSpeed(false);
    expect(me.speed - baseSpeed).toBeCloseTo(goblin.upgrade.speedBonus, 5);

    const drones = me.dronePositions(goblin);
    expect(drones.length).toBe(3);
    // equal steps round the same circle: a triangle
    const step = (Math.PI * 2) / 3;
    expect(drones[1].angle - drones[0].angle).toBeCloseTo(step, 5);
    expect(drones[2].angle - drones[1].angle).toBeCloseTo(step, 5);
    const side = (a: number, b: number) => v2.length(v2.sub(drones[a].pos, drones[b].pos));
    expect(side(0, 1)).toBeCloseTo(side(1, 2), 4);
    expect(side(1, 2)).toBeCloseTo(side(2, 0), 4);

    // every 2 s, both sub drones (not the main one) throw a bomb forward off their tip
    for (let i = 0; i < 82; i++) game.step(0.1);
    const bombs = fire.mock.calls.filter((c) => c[0].bulletType === "bullet_kit_goblin_pumpkin");
    expect(bombs.length).toBeGreaterThanOrEqual(6);
    expect(bombs.length).toBeLessThanOrEqual(8);
    expect(bombs.length % 2).toBe(0);
    for (const [b] of bombs) {
        // from a tip: on the drone's circle, along the tangent a little way out
        expect(v2.length(v2.sub(b.pos, me.pos))).toBeCloseTo(Math.hypot(goblin.radius, goblin.tip), 0);
        // aimed along the tangent, at right angles to the radius, counter clockwise
        const radial = v2.normalize(v2.sub(b.pos, me.pos));
        expect(Math.abs(v2.dot(b.dir, radial))).toBeLessThan(0.1);
        expect(v2.dot(b.dir, v2.create(-radial.y, radial.x))).toBeGreaterThan(0.9);
        expect(b.gameSourceType).toBe("kit_goblin_pumpkin");
        expect(b.shotFx).toBeFalsy();
    }
    // 8 s later the upgrade is over: one drone, normal speed, 12 s cooldown still running
    expect(me.kitEnhanceTime).toBe(0);
    expect(me.kitAura).toBe(6);
    expect(me.dronePositions(goblin).length).toBe(1);
    me.recalculateSpeed(false);
    expect(me.speed).toBeCloseTo(baseSpeed, 5);
    expect(me.abilityCooldowns[1]).toBeGreaterThan(3);
});

test("Green Goblin: Tricky Swap trades places with the drone, which then circles from his old spot", () => {
    const { game, me, enemy } = setup("greengoblin", v2.create(1, 0));
    for (let i = 0; i < 4; i++) game.step(0.1);
    const fire = vi.spyOn(game.bulletBarn, "fireBullet");
    let from = v2.create(0, 0);
    let drone = v2.create(0, 0);
    let after = v2.create(0, 0);
    const swap = me.goblinSwap.bind(me);
    me.goblinSwap = () => {
        from = v2.copy(me.pos);
        drone = dronePos(me.pos, goblin.radius, me.droneAngle);
        swap();
        // the drone is now where he stood
        after = dronePos(me.pos, goblin.radius, me.droneAngle);
    };
    use(game, me, Slot.Melee, 1);
    expect(v2.length(v2.sub(me.pos, from))).toBeCloseTo(25, 0);
    expect(v2.length(v2.sub(me.pos, drone))).toBeLessThan(1);
    expect(v2.length(v2.sub(after, from))).toBeLessThan(0.01);
    // and the drone carries on circling him, 25 away, from that spot
    for (let i = 0; i < 5; i++) game.step(0.1);
    expect(v2.length(v2.sub(dronePos(me.pos, goblin.radius, me.droneAngle), me.pos))).toBeCloseTo(25, 5);
    expect(me.abilityCooldowns[2]).toBeGreaterThan(5);
    expect(me.abilityCooldowns[2]).toBeLessThanOrEqual(6);

    // a bomb is left at the old spot and goes off 0.5 s later: 25 and a 3 s burn to whoever is still there
    const trap = fire.mock.calls.filter((c) => c[0].bulletType === "bullet_kit_goblin_trap");
    expect(trap.length).toBe(1);
    expect(v2.length(v2.sub(trap[0][0].pos, from))).toBeLessThan(0.01);
    const trapDef = BulletDefs.bullet_kit_goblin_trap;
    expect(trapDef.distance / trapDef.speed).toBeCloseTo(goblin.swapBombFuse, 5);
    void enemy;
});

test("Green Goblin: the bomb Tricky Swap leaves goes off after 0.5 s, not before", () => {
    // an enemy standing right where the goblin starts, out of the drone's way
    const { game, me, enemy } = setup("greengoblin", v2.create(1, 0));
    enemy.maxHealth = 10000;
    enemy.health = 10000;
    const hit = vi.spyOn(enemy, "damage");
    const blast = () => hit.mock.calls.filter((c) => c[0].gameSourceType === "kit_goblin_pumpkin" && c[0].amount > 0);
    use(game, me, Slot.Melee, 1);
    for (let i = 0; i < 3; i++) game.step(0.1);
    expect(blast().length).toBe(0);
    for (let i = 0; i < 5; i++) game.step(0.1);
    expect(blast().length).toBeGreaterThan(0);
    expect(blast().some((c) => c[0].amount === 25)).toBe(true);
    expect(enemy.burnDuration).toBeGreaterThan(0);
    expect(me.health).toBe(me.maxHealth);
});

test("Green Goblin: the drone angle and the kit aura survive the trip to the client", () => {
    const { game, me } = setup("greengoblin", v2.create(200, 0));
    for (let i = 0; i < 7; i++) game.step(0.1);
    use(game, me, Slot.Secondary, 1);
    const s = new net.BitStream(new ArrayBuffer(ObjectSerializeFns[ObjectType.Player].serializedFullSize));
    ObjectSerializeFns[ObjectType.Player].serializeFull(s, me as never);
    s.index = 0;
    const data = {} as Record<string, unknown> & { kitAura: number; droneAngle: number };
    ObjectSerializeFns[ObjectType.Player].deserializeFull(s, data as never);
    expect(data.kitAura).toBe(7);
    expect(Math.abs(data.droneAngle - me.droneAngle)).toBeLessThan((Math.PI * 2) / 255);
});

test("Green Goblin: a fresh kit starts with the drone on his right and no upgrade running", () => {
    const { game, me } = setup("greengoblin", v2.create(200, 0));
    use(game, me, Slot.Secondary, 1);
    for (let i = 0; i < 5; i++) game.step(0.1);
    expect(me.kitEnhanceTime).toBeGreaterThan(0);
    me.applyKit("greengoblin");
    expect(me.kitEnhanceTime).toBe(0);
    expect(me.droneAngle).toBe(0);
    expect(me.droneHits.size).toBe(0);
});
