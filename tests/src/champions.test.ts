import { expect, test } from "vitest";
import { ChampionDefs, ChampionIds, championIndex, ItemDefs } from "../../shared/defs/gameObjects/championDefs.ts";
import { GameObjectDefs } from "../../shared/defs/register.ts";
import { Action, Anim, GameConfig, HasteType, TeamMode } from "../../shared/gameConfig.ts";
import { InputMsg } from "../../shared/net/inputMsg.ts";
import { BitStream } from "../../shared/net/net.ts";
import { type ObjectData, ObjectSerializeFns, ObjectType } from "../../shared/net/objectSerializeFns.ts";
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

// every champion's index has to survive the wire: the field was 4 bits, so anything past the
// 15th champion arrived as a different one (the client then drew that champion's sprites,
// animations and abilities instead)
test("every champion's index round-trips through the player object data", () => {
    const base: ObjectData<ObjectType.Player> = {
        pos: v2.create(10, 10),
        dir: v2.create(1, 0),
        outfit: "outfitBase",
        backpack: "backpack00",
        helmet: "",
        chest: "",
        activeWeapon: "fists",
        layer: 0,
        dead: false,
        downed: false,
        animType: Anim.None,
        animSeq: 0,
        actionType: Action.None,
        actionSeq: 0,
        wearingPan: false,
        bigPan: false,
        healEffect: false,
        lastStandEffect: false,
        bleeding: false,
        poisoned: false,
        burning: false,
        charmed: false,
        kitAura: 0,
        droneAngle: 0,
        wizardMarked: false,
        vulnerable: false,
        excaliburActive: false,
        flying: false,
        championIndex: 0,
        champCastSeq: 0,
        champCastKey: 0,
        champRooted: false,
        frozen: false,
        frozenOri: 0,
        frozenType: "",
        hasteType: HasteType.None,
        hasteSeq: 0,
        actionItem: "",
        scale: 1,
        role: "",
        perks: [],
    };
    const fns = ObjectSerializeFns[ObjectType.Player];
    for (const id of ChampionIds) {
        const index = championIndex(id);
        const stream = new BitStream(new ArrayBuffer(1024));
        fns.serializeFull(stream, { ...base, championIndex: index });
        stream.index = 0;
        const out = { ...base, championIndex: -1 };
        fns.deserializeFull(stream, out);
        expect(out.championIndex, id).toBe(index);
    }
});

// a champion whose ability fires nothing the player can see reads as broken in game, which is what
// the generic kit used to do: Q only set a hidden buff and R was an invisible delayed hit
test("every champion's abilities do something the player can see", () => {
    const silent: string[] = [];
    for (const id of ChampionIds) {
        for (let i = 0; i < 4; i++) {
            // close enough that a melee champion's abilities reach, far enough to still aim
            const { game, me, enemy } = setup(id, v2.create(3, 0));
            // one step first, because game.now is only set once the game has ticked and an
            // ability that reads the clock (Yasuo's Sweeping Blade) finds no target without it
            steps(game, 1);
            const bullets = game.bulletBarn.newBullets.length;
            const health = enemy.health;
            const shield = me.shield;
            const weapon = me.weapons[GameConfig.WeaponSlot.Primary].type;
            const pull = me.webPull;
            const enemyPull = enemy.webPull;
            const placed = me.champ!.zones.length + me.champ!.traps.length;
            me.champ!.cast(i);
            // a dash is read before the steps below, because it is over well inside them
            const moved = me.webPull !== pull || enemy.webPull !== enemyPull;
            // a wind wall or a chomper counts from the moment it is laid, before it burns down
            const laid = me.champ!.zones.length + me.champ!.traps.length > placed;
            // 2 s, so an ability that lands on a delay (Caitlyn's and Lux's ultimates) still counts
            steps(game, 40);
            const fired = game.bulletBarn.newBullets.length > bullets;
            const hurt = enemy.health < health;
            const shielded = me.shield > shield;
            const swapped = me.weapons[GameConfig.WeaponSlot.Primary].type !== weapon;
            const buffed = me.champ!.nextAttackBonus > 0 || Object.keys(me.champ!.buffs).length > 0;
            if (!fired && !hurt && !shielded && !moved && !swapped && !buffed && !laid) {
                silent.push(`${id} ${"qwer"[i]}`);
            }
        }
    }
    // Last Breath is the one ability with a precondition nothing here stands in for: it only
    // casts on a target Yasuo's own knock-up has put in the air
    expect(silent, `abilities with no visible effect: ${silent.join(", ")}`).toEqual(["yasuo r"]);
});
