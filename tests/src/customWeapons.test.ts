import { expect, test } from "vitest";
import { CustomGuns, CustomMelees } from "../../shared/defs/gameObjects/customWeaponDefs.ts";
import { SwingShots } from "../../shared/defs/gameObjects/customWeaponEffects.ts";
import { GameObjectDefs } from "../../shared/defs/register.ts";
import { TeamMode, WeaponSlot } from "../../shared/gameConfig.ts";
import { v2, type Vec2 } from "../../shared/utils/v2.ts";
import { createGame } from "./gameTestHelpers.ts";
import "./testHelpers.ts";

/** has one weapon attack for a few seconds; returns the damage each target took */
function attack(weapon: string, slot: number, targetOffsets: Vec2[], aim = v2.create(1, 0)) {
    const game = createGame(TeamMode.Solo, "test_normal");
    const shooter = game.playerBarn.addTestPlayer({});
    const targets = targetOffsets.map(() => game.playerBarn.addTestPlayer({}));
    // somewhere open, away from the map's obstacles
    shooter.pos = v2.create(game.map.width / 2, 30);
    const taken = targets.map(() => 0);
    targets.forEach((t, i) => {
        t.pos = v2.add(shooter.pos, targetOffsets[i]);
        // record hits instead of taking them, so nobody dies mid test
        t.damage = (params) => {
            taken[i] += params.amount ?? 0;
        };
    });
    for (const p of [shooter, ...targets]) game.grid.updateObject(p);
    shooter.weaponManager.setWeapon(slot, weapon, 999);
    shooter.weaponManager.setCurWeapIndex(slot, true);
    for (let t = 0; t < 4; t += 0.05) {
        shooter.dir = v2.normalize(aim);
        shooter.toMouseLen = v2.length(targetOffsets[0]);
        shooter.shootStart = true;
        shooter.shootHold = true;
        game.step(0.05);
    }
    return taken;
}

for (const [id, , , , effect] of CustomGuns) {
    test(`${id} (${effect}) hits`, () => {
        const def = GameObjectDefs.typeToDef(id, "gun");
        const bullet = GameObjectDefs.typeToDef(def.bulletType, "bullet");
        const near = Math.min(10, bullet.distance - 4);
        // a second target right behind the first, and one off to the side of the aim
        const [front, behind, side] = attack(id, WeaponSlot.Primary, [
            v2.create(near, 0),
            v2.create(near + 2.5, 0),
            v2.create(near, near * 0.5),
        ]);
        expect(front, "front target").toBeGreaterThan(0);
        // homing shots that pierce still end in the target they chased
        if (bullet.pierce && !bullet.homing) expect(behind, "pierces to the target behind").toBeGreaterThan(0);
        if (bullet.homing) {
            // aimed away from the side target only
            const [, , sideOnly] = attack(id, WeaponSlot.Primary, [
                v2.create(0, -40),
                v2.create(0, -42),
                v2.create(near, near * 0.5),
            ], v2.create(1, 0.1));
            expect(sideOnly, "curves onto a target off the aim line").toBeGreaterThan(0);
        }
        if (effect === "rocket") expect(front + behind + side, "blast hits around").toBeGreaterThan(60);
    });
}

for (const [id] of CustomMelees) {
    const shot = SwingShots[id];
    test(`${id} ${shot ? `fires ${shot.bullet}` : "swings"}`, () => {
        // well out of sword reach: only the swing's projectile can get there
        const [far] = attack(id, WeaponSlot.Melee, [v2.create(12, 0)]);
        if (shot) expect(far).toBeGreaterThan(0);
        const [close] = attack(id, WeaponSlot.Melee, [v2.create(2.5, 0)]);
        expect(close).toBeGreaterThan(0);
    });
}
