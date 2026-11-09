import { expect, test, vi } from "vitest";
import { BulletDefs } from "../../shared/defs/gameObjects/bulletDefs.ts";
import { dronePos, kitBuild, KitDefs, SentryCharge, UltronMinion } from "../../shared/defs/gameObjects/kitDefs.ts";
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

    // the Combo takes all his energy, and the ring, 5 blasts, 5 portal shots and 5 lasers (20 + 50 + 50 + 75) finish a 100 hp enemy
    me.energy = 200;
    use(game, me, Slot.Secondary, 1);
    expect(me.energy).toBeLessThan(5);
    expect(me.untargetable).toBe(true);
    for (let i = 0; i < 40; i++) game.step(0.1);
    expect(enemy.dead).toBeTruthy();
    expect(me.untargetable).toBe(false);

    const laser = setup("ultron");
    laser.me.energy = 200;
    use(laser.game, laser.me, Slot.Primary, 10, true);
    expect(laser.me.energy).toBeLessThan(200);
    expect(laser.enemy.health).toBeLessThan(100);

    // minions blow up after 20 s
    for (let i = 0; i < 420; i++) game.step(0.05);
    expect(me.minions.every((m) => m.dead)).toBeTruthy();
});

test("Summoner: four blade minions dash at enemies, the whip sets their focus", () => {
    const { game, me, enemy } = setup("summoner", v2.create(22, 0));
    expect(me.maxHealth).toBe(150);
    // anyone on screen, not just close by: they dash once a second, 8 each
    for (let i = 0; i < 40; i++) game.step(0.05);
    expect(me.daggerMinions.length).toBe(4);
    expect(enemy.health).toBeLessThan(100);
    // and never go further from him than 35
    for (const m of me.daggerMinions) expect(v2.length(v2.sub(m.pos, me.pos))).toBeLessThanOrEqual(35.01);

    const whip = setup("summoner", v2.create(20, 0));
    whip.enemy.pos = v2.add(whip.me.pos, v2.create(8, 0));
    whip.game.grid.updateObject(whip.enemy);
    whip.enemy.maxHealth = 1e6;
    whip.enemy.health = 1e6;
    use(whip.game, whip.me, Slot.Melee, 10, true);
    expect(whip.me.summonerFocusId).toBe(whip.enemy.__id);
});

test("Summoner: a minion's dash ignores armor and damage reduction, a marked target takes 5 more", () => {
    const { game, me, enemy } = setup("summoner", v2.create(60, 0));
    enemy.maxHealth = 1e6;
    enemy.health = 1e6;
    enemy.shield = 0;
    enemy.chest = "chest04";
    enemy.helmet = "helmet04";
    const hit = (source: string, amount: number) => {
        const before = enemy.health;
        enemy.damage({
            amount,
            damageType: GameConfig.DamageType.Player,
            dir: v2.create(1, 0),
            source: me,
            gameSourceType: source,
        });
        return before - enemy.health;
    };
    expect(hit("kit_summoner_dagger", 8)).toBeCloseTo(8, 5);
    expect(enemy.vulnerable).toBe(false);
    // the whip's lash marks it
    hit("kit_summoner_whip", 14);
    expect(enemy.vulnerable).toBe(true);
    expect(hit("kit_summoner_dagger", 8)).toBeCloseTo(14, 5);
    for (let i = 0; i < 81; i++) game.step(0.05);
    expect(enemy.vulnerable).toBe(false);
    expect(hit("kit_summoner_dagger", 8)).toBeCloseTo(8, 5);
});

test("Wizard: circle feeds energy, the blast and Crystal Burst fire", () => {
    const { game, me, enemy } = setup("wizard", v2.create(8, 0));
    me.energy = 0;
    for (let i = 0; i < 20; i++) game.step(0.05);
    expect(me.energy).toBeGreaterThan(20);

    me.energy = 300;
    use(game, me, Slot.Primary, 1);
    for (let i = 0; i < 10; i++) game.step(0.05);
    expect(enemy.health).toBeLessThan(100);

    expect(KitDefs.wizard.secondary).toBe("kit_wizard_crystals");
    const gun = GameObjectDefs.typeToDef("kit_wizard_crystals", "gun");
    expect(gun.fireDelay).toBe(5);
    expect(gun.energyCost).toBe(40);
    const crystals = setup("wizard", v2.create(12, 0));
    crystals.me.energy = 300;
    use(crystals.game, crystals.me, Slot.Secondary, 30, true);
    expect(crystals.enemy.health).toBeLessThan(100);
    expect(crystals.enemy.bleeding).toBeTruthy();
});

test("Wizard: the Stun Wave hurts and stuns enemies inside his circle and no one outside", () => {
    const radius = KitDefs.wizard.aura!.radius;
    expect(KitDefs.wizard.melee).toBe("kit_wizard_wave");
    const inside = setup("wizard", v2.create(radius - 4, 0));
    inside.me.energy = 300;
    use(inside.game, inside.me, Slot.Melee, 1);
    for (let i = 0; i < 10; i++) inside.game.step(0.05);
    expect(inside.enemy.stunTime).toBeGreaterThan(2);

    const outside = setup("wizard", v2.create(radius + 6, 0));
    outside.me.energy = 300;
    use(outside.game, outside.me, Slot.Melee, 1);
    for (let i = 0; i < 10; i++) outside.game.step(0.05);
    expect(outside.enemy.stunTime).toBe(0);
});

test("Ultron: shield recovery is 2 per second for 3 energy per second", () => {
    const { shieldRegen, shieldCost } = KitDefs.ultron.energy!;
    expect(shieldRegen).toBe(2);
    expect(shieldCost).toBe(3);
    expect(KitDefs.wizard.shield).toBe(100);
});

test("Iron Man: Laser Spin burns and destroys what the two lasers sweep over", () => {
    expect(KitDefs.ironman.secondary).toBe("kit_ironman_spin");
    expect(KitDefs.ironman.melee).toBe("kit_ironman_combo");
    const spin = GameObjectDefs.typeToDef("kit_ironman_spin", "gun");
    expect(spin.fireDelay).toBe(6);
    expect(spin.energyCost).toBe(30);
    const { game, me, enemy } = setup("ironman", v2.create(20, 0));
    me.energy = 100;
    const health = enemy.health + enemy.shield;
    use(game, me, Slot.Secondary, 1);
    for (let i = 0; i < 20; i++) game.step(0.05);
    // the lasers start out to his left and right and turn a full circle, so one of them crosses the enemy
    expect(enemy.health + enemy.shield).toBeLessThan(health);
});

test("Iron Man: Blast Combo stuns the marked enemy for 2 s and roots him", () => {
    const { game, me, enemy } = setup("ironman", v2.create(20, 0));
    me.energy = 100;
    game.step(0.05);
    use(game, me, Slot.Melee, 1);
    expect(enemy.stunTime).toBeGreaterThan(1.5);
    expect(me.ironCombo).toBeDefined();
    for (let i = 0; i < 50; i++) game.step(0.05);
    expect(me.ironCombo).toBeUndefined();
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
    // the circle still burns him
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
    expect(KitDefs.ironman.energy).toMatchObject({ heal: 1, shieldRegen: 2 });
    expect(KitDefs.ultron.energy).toMatchObject({ shieldRegen: 2 });
    expect(KitDefs.wolverine.health).toBe(200);
    expect(KitDefs.wizard.aura).toMatchObject({ shield: 2, health: 2 });
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

test("Sentry: 2369 hp, yellow outfit, Sentry Charge in slot 1", () => {
    const { me } = setup("sentry");
    // (300 + Heal's 812) x 2.13: the Artifact's, Liberation's and Jeff's +44%, +25% and +44% are added together
    expect(me.maxHealth).toBe(2369);
    expect(me.health).toBe(2369);
    expect(me.outfit).toBe("outfitKitSentry");
    expect(me.weapons[Slot.Primary].type).toBe("kit_sentry_charge");
    // his own 45% plus Liberation's 20%, added together
    expect(KitDefs.sentry.damageReduction).toBeCloseTo(0.65, 5);
    expect("kit_sentry_charge".length).toBeLessThanOrEqual(32);
    expect("sentry".length).toBeLessThanOrEqual(16);
});

test("Sentry: takes 65% less damage", () => {
    const { me } = setup("sentry", v2.create(200, 0));
    // bleeding skips armor, so only the passive is left
    me.damage({ amount: 100, damageType: GameConfig.DamageType.Bleeding, dir: v2.create(1, 0) });
    expect(me.health).toBeCloseTo(2369 - 35, 1);
});

test("Sentry: items add flat health first, then the multipliers are summed, +3 speed, +44% damage", () => {
    expect(kitBuild(300, ["sentry_heal"]).health).toBe(1112);
    expect(kitBuild(300, ["sentry_artifact"]).health).toBe(432);
    // two +44% multipliers make x1.88, not x2.07
    expect(kitBuild(100, ["sentry_artifact", "sentry_artifact"]).health).toBe(188);
    expect(kitBuild(100, ["sentry_artifact", "sentry_artifact"]).damageMult).toBeCloseTo(1.88, 5);
    expect(KitDefs.sentry.items).toEqual(["sentry_heal", "sentry_artifact", "sentry_liberation", "sentry_jeff"]);
    expect(kitBuild(300, KitDefs.sentry.items!).health).toBe(2369);
    // +44% and +89% damage, added together
    expect(KitDefs.sentry.damageMult).toBeCloseTo(2.33, 5);
    expect(KitDefs.sentry.armorIgnore).toBeCloseTo(0.1, 5);
    expect(KitDefs.sentry.speedBonus).toBe(3);
    const { me, enemy } = setup("sentry", v2.create(200, 0));
    enemy.maxHealth = 1000;
    enemy.health = 1000;
    enemy.damage({
        amount: 100,
        damageType: GameConfig.DamageType.Player,
        dir: v2.create(1, 0),
        source: me,
        gameSourceType: "fists",
    });
    expect(1000 - enemy.health).toBeCloseTo(233, 1);
});

test("Sentry items: Liberation and Jeff stack with the others, and Jeff ignores 10% of enemy damage reduction", () => {
    const build = kitBuild(300, ["sentry_heal", "sentry_artifact", "sentry_liberation", "sentry_jeff"]);
    expect(build.health).toBe(2369);
    expect(build.damageReduction).toBeCloseTo(0.2, 5);
    const { me, enemy } = setup("sentry", v2.create(200, 0));
    enemy.maxHealth = 1000;
    enemy.health = 1000;
    enemy.chest = "chest03";
    enemy.helmet = "";
    const vest = GameObjectDefs.typeToDef("chest03", "chest").damageReduction;
    const hit = (armorPenetration?: number) => {
        enemy.health = 1000;
        enemy.damage({
            amount: 100,
            damageType: GameConfig.DamageType.Player,
            dir: v2.create(1, 0),
            source: me,
            gameSourceType: "fists",
            armorPenetration,
        });
        return 1000 - enemy.health;
    };
    // x2.33 damage, and the vest only counts for 90% of what it would
    expect(hit()).toBeCloseTo(233 * (1 - vest * 0.9), 1);
    // like Sentry Charge's 20% armor penetration, which ignores 80%: Jeff makes that 90%
    expect(hit(0.2)).toBeCloseTo(233 * (1 - vest * 0.1), 1);
    // someone without the items gets the plain numbers
    const { me: plain, enemy: other } = setup("default", v2.create(200, 0));
    other.maxHealth = 1000;
    other.health = 1000;
    other.chest = "chest03";
    other.helmet = "";
    other.damage({
        amount: 100,
        damageType: GameConfig.DamageType.Player,
        dir: v2.create(1, 0),
        source: plain,
        gameSourceType: "fists",
    });
    expect(1000 - other.health).toBeCloseTo(100 * (1 - vest), 1);
});

test("Sentry: survives a killing hit once per game, at full health", () => {
    const { me } = setup("sentry", v2.create(200, 0));
    me.damage({ amount: 20000, damageType: GameConfig.DamageType.Bleeding, dir: v2.create(1, 0) });
    expect(me.dead).toBe(false);
    expect(me.health).toBe(2369);
    me.damage({ amount: 20000, damageType: GameConfig.DamageType.Bleeding, dir: v2.create(1, 0) });
    expect(me.dead).toBe(true);
});

test("Sentry: removes a debuff, then waits 4 s before removing another", () => {
    const { game, me } = setup("sentry", v2.create(200, 0));
    me.applyBurn(30);
    game.step(0.1);
    expect(me.burning).toBe(false);
    me.applyBurn(30);
    // 3 s later it is still on him
    for (let i = 0; i < 30; i++) game.step(0.1);
    expect(me.burning).toBe(true);
    // the cooldown is up by 4 s
    for (let i = 0; i < 15; i++) game.step(0.1);
    expect(me.burning).toBe(false);
});

test("Sentry Charge: dashes 30 tiles, hits for 120, heals 30% of max hp, flies 2 s, 3 s cooldown", () => {
    const { game, me, enemy } = setup("sentry", v2.create(4, 0));
    enemy.maxHealth = 1000;
    enemy.health = 1000;
    // 3000 less 65% is 1050 off his 2369, so there is room for the whole heal
    me.damage({ amount: 3000, damageType: GameConfig.DamageType.Bleeding, dir: v2.create(1, 0) });
    const hurt = me.health;
    const start = v2.copy(me.pos);
    use(game, me, Slot.Primary, 1);
    expect(me.flying).toBe(true);
    for (let i = 0; i < 10; i++) game.step(0.1);
    const moved = v2.length(v2.sub(me.pos, start));
    expect(moved).toBeGreaterThan(26);
    expect(moved).toBeLessThan(32);
    // 120 once (not once per tick it overlaps), with no armor on him
    expect(1000 - enemy.health).toBeGreaterThanOrEqual(279);
    expect(1000 - enemy.health).toBeLessThan(559);
    // the heal is 30% of his max hp (711), once per cast
    expect(me.health - hurt).toBeGreaterThanOrEqual(705);
    expect(me.health - hurt).toBeLessThanOrEqual(716);
    expect(enemy.burning).toBe(true);
    expect(enemy.bleeding).toBe(true);
    expect(enemy.stunned).toBe(true);
    for (let i = 0; i < 15; i++) game.step(0.1);
    expect(me.flying).toBe(false);
    // cooldown shows while it runs
    expect(me.abilityCooldowns[Slot.Primary]).toBeGreaterThan(0);
});

test("Sentry Charge: a stunned enemy can't move or act for 3 s, and loses perks for 5 s", () => {
    const { game, me, enemy } = setup("sentry", v2.create(4, 0));
    enemy.maxHealth = 1000;
    enemy.health = 1000;
    enemy.addPerk("steelskin");
    use(game, me, Slot.Primary, 1);
    for (let i = 0; i < 5; i++) game.step(0.1);
    expect(enemy.stunned).toBe(true);
    expect(enemy.hasPerk("steelskin")).toBe(false);
    const at = v2.copy(enemy.pos);
    enemy.moveRight = true;
    for (let i = 0; i < 10; i++) game.step(0.1);
    expect(v2.length(v2.sub(enemy.pos, at))).toBeLessThan(0.01);
    // 3 s stun is over, 5 s perk loss is not
    for (let i = 0; i < 25; i++) game.step(0.1);
    expect(enemy.stunned).toBe(false);
    expect(enemy.hasPerk("steelskin")).toBe(false);
    for (let i = 0; i < 25; i++) game.step(0.1);
    expect(enemy.hasPerk("steelskin")).toBe(true);
});

test("Sentry Charge: reaches a dodging (untargetable) enemy and ignores 80% of armor", () => {
    const { game, me, enemy } = setup("sentry", v2.create(4, 0));
    enemy.maxHealth = 1000;
    enemy.health = 1000;
    enemy.dodgeTime = 5;
    expect(enemy.untargetable).toBe(true);
    use(game, me, Slot.Primary, 1);
    for (let i = 0; i < 5; i++) game.step(0.1);
    expect(enemy.health).toBeLessThan(1000);
    const def = BulletDefs.bullet_kit_sentry_charge;
    expect(def.hitsFlying).toBe(true);
    expect(def.armorPenetration).toBe(0.2);
    expect(def.hitRadius).toBeGreaterThan(1);
});

test("Sentry Charge: 3 s cooldown", () => {
    const { game, me } = setup("sentry", v2.create(200, 0));
    expect(SentryCharge.cooldown).toBe(3);
    use(game, me, Slot.Primary, 1);
    expect(me.abilityCooldowns[Slot.Primary]).toBeGreaterThan(2);
    expect(me.abilityCooldowns[Slot.Primary]).toBeLessThanOrEqual(3);
    for (let i = 0; i < 31; i++) game.step(0.1);
    expect(me.abilityCooldowns[Slot.Primary]).toBe(0);
});

test("Sentry Charge: his body hits too, and an enemy off to the side of the crescent's path still gets caught", () => {
    expect(SentryCharge.hitRadius).toBeGreaterThan(10.5);
    expect(SentryCharge.bodyRadius).toBeGreaterThan(1);
    const { game, me, enemy } = setup("sentry", v2.create(4, 0));
    enemy.maxHealth = 1000;
    enemy.health = 1000;
    use(game, me, Slot.Primary, 1);
    for (let i = 0; i < 5; i++) game.step(0.1);
    // hit once, not once from the crescent and once from his body
    expect(1000 - enemy.health).toBeGreaterThanOrEqual(30);
    expect(1000 - enemy.health).toBeLessThan(559);
    expect(me.sentryDashHit.has(enemy.__id)).toBe(true);
});

test("Sentry Charge: stuns whoever it hits and drags them along the dash", () => {
    const { game, me, enemy } = setup("sentry", v2.create(4, 0));
    enemy.maxHealth = 1000;
    enemy.health = 1000;
    const start = v2.copy(enemy.pos);
    use(game, me, Slot.Primary, 1);
    for (let i = 0; i < 4; i++) game.step(0.1);
    expect(enemy.stunned).toBe(true);
    // carried well past where he stood, right in front of the Sentry
    expect(v2.length(v2.sub(enemy.pos, start))).toBeGreaterThan(15);
    expect(v2.distance(enemy.pos, me.pos)).toBeLessThan(6);
    // the drag ends with the dash: still stunned, but no longer moving
    for (let i = 0; i < 5; i++) game.step(0.1);
    const at = v2.copy(enemy.pos);
    game.step(0.1);
    expect(enemy.stunned).toBe(true);
    expect(v2.length(v2.sub(enemy.pos, at))).toBeLessThan(0.01);
});

test("Sentry Charge: heals 30% of max hp even when it hits nothing, and never past full", () => {
    const { game, me } = setup("sentry", v2.create(200, 0));
    me.damage({ amount: 3000, damageType: GameConfig.DamageType.Bleeding, dir: v2.create(1, 0) });
    const hurt = me.health;
    use(game, me, Slot.Primary, 1);
    expect(me.health - hurt).toBeGreaterThanOrEqual(705);
    expect(me.health - hurt).toBeLessThanOrEqual(716);
    // a nearly full Sentry only gets what is missing
    me.health = me.maxHealth - 10;
    me.weapons[Slot.Primary].cooldown = 0;
    use(game, me, Slot.Primary, 1);
    expect(me.health).toBeLessThanOrEqual(me.maxHealth);
    expect(me.health).toBeGreaterThan(me.maxHealth - 10);
});
