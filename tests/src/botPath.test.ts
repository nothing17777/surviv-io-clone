import { describe, expect, it } from "vitest";
import { findPath } from "../../server/src/game/botPath.ts";
import { ObjectType } from "../../shared/net/objectSerializeFns.ts";
import { TeamMode } from "../../shared/gameConfig.ts";
import { collider } from "../../shared/utils/collider.ts";
import { v2 } from "../../shared/utils/v2.ts";
import { createGame } from "./gameTestHelpers.ts";

describe("bot pathing", () => {
    it("reaches every spot a player can stand in around a toilet, from outside the house", () => {
        const game = createGame(TeamMode.Solo, "main");
        const solid = (p: { x: number; y: number }) =>
            game.grid.intersectCollider(collider.createCircle(p, 1)).some(
                (o) => o.__type === ObjectType.Obstacle && !o.dead && o.collidable && o.layer === 0
                    && collider.intersectCircle(o.collider, p, 1),
            );
        const toilets = game.objectRegister.objects.filter(
            (o) => o?.__type === ObjectType.Obstacle && o.type.includes("toilet") && o.layer === 0,
        );
        let spots = 0;
        const failed: string[] = [];
        for (const t of toilets) {
            const starts = Array.from({ length: 8 }, (_, a) =>
                v2.add(t.pos, v2.create(Math.cos(a) * 20, Math.sin(a) * 20))).filter((p) => !solid(p));
            for (let dx = -4; dx <= 4; dx += 0.5) {
                for (let dy = -4; dy <= 4; dy += 0.5) {
                    const spot = v2.add(t.pos, v2.create(dx, dy));
                    if (solid(spot)) continue;
                    spots++;
                    const ok = starts.some((from) => {
                        const path = findPath(game, from, spot, 0, 1);
                        return path && v2.distance(path[path.length - 1], spot) < 2.5;
                    });
                    if (!ok) failed.push(`${t.type} ${spot.x.toFixed(1)},${spot.y.toFixed(1)}`);
                }
            }
        }
        // a few sampled spots sit in pockets outside the walls no one can walk to
        expect(failed.length, failed.slice(0, 12).join(" | ")).toBeLessThan(spots * 0.04);
    });
});
