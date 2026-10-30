import * as PIXI from "pixi.js-legacy";
import { type AbilityKey, type AbilityRange, AbilityRanges } from "../../shared/defs/gameObjects/championDefs.ts";
import { v2, type Vec2 } from "../../shared/utils/v2.ts";
import type { Camera } from "./camera.ts";
import type { Renderer } from "./renderer.ts";

/**
 * League's range indicators: holding an ability key draws how far and where it reaches on the ground,
 * from the ranges in AbilityRanges. Drawn under everything, like League draws them under the champions.
 */

/** League's indicator teal */
const Fill = 0x37c9e0;
const Edge = 0xaeefff;
const FillAlpha = 0.16;
const EdgeAlpha = 0.75;
/** a skillshot with no width of its own */
const LineWidth = 0.6;

class LeagueIndicator {
    /** made fresh for each game: quitting one destroys everything on the stage, this with it */
    gfx?: PIXI.Graphics;

    init(renderer: Renderer) {
        this.gfx = new PIXI.Graphics();
        renderer.addPIXIObj(this.gfx, 0, 11);
    }

    /** held is the ability key the player is holding, if any */
    m_render(
        camera: Camera,
        champion: string | undefined,
        held: AbilityKey | undefined,
        pos: Vec2,
        dir: Vec2,
        cursor: Vec2,
    ) {
        const gfx = this.gfx;
        if (!gfx || !gfx.transform) return;
        gfx.clear();
        const def: AbilityRange | undefined = champion && held
            ? AbilityRanges[champion]?.[held]
            : undefined;
        if (!def) {
            gfx.visible = false;
            return;
        }
        gfx.visible = true;

        const px = (units: number) => camera.m_pixels(units * camera.m_ppu);
        const at = (p: Vec2) => camera.m_pointToScreen(p);
        const here = at(pos);
        // the cursor, pulled back to the edge of the range
        const toCursor = v2.sub(cursor, pos);
        const reach = Math.min(v2.length(toCursor), def.range);
        const aim = v2.normalizeSafe(toCursor, dir);
        const landing = v2.add(pos, v2.mul(aim, reach));
        // screen y points down, so an angle on screen is the negated world angle
        const angle = Math.atan2(-aim.y, aim.x);

        const ring = (center: Vec2, radius: number, fill: boolean) => {
            const c = at(center);
            if (fill) gfx.beginFill(Fill, FillAlpha);
            gfx.lineStyle(2, Edge, EdgeAlpha);
            gfx.drawCircle(c.x, c.y, px(radius));
            if (fill) gfx.endFill();
        };

        switch (def.indicator) {
            case "line": {
                // a lane down the aim line, as wide as the shot
                const half = px(def.radius ?? LineWidth);
                const len = px(def.range);
                gfx.beginFill(Fill, FillAlpha);
                gfx.lineStyle(2, Edge, EdgeAlpha);
                gfx.drawRect(0, -half, len, half * 2);
                gfx.endFill();
                gfx.position.set(here.x, here.y);
                gfx.rotation = angle;
                return;
            }
            case "cone": {
                // radius is the cone's half angle, in radians
                const spread = def.radius ?? 0.5;
                const len = px(def.range);
                gfx.beginFill(Fill, FillAlpha);
                gfx.lineStyle(2, Edge, EdgeAlpha);
                gfx.moveTo(0, 0);
                gfx.arc(0, 0, len, -spread, spread);
                gfx.lineTo(0, 0);
                gfx.endFill();
                gfx.position.set(here.x, here.y);
                gfx.rotation = angle;
                return;
            }
            case "circle": {
                ring(pos, def.range, false);
                ring(landing, def.radius ?? 1, true);
                break;
            }
            case "wall": {
                const half = px(def.radius ?? 5);
                const c = at(landing);
                ring(pos, def.range, false);
                gfx.lineStyle(4, Edge, EdgeAlpha);
                gfx.moveTo(c.x - Math.sin(angle) * half, c.y + Math.cos(angle) * half);
                gfx.lineTo(c.x + Math.sin(angle) * half, c.y - Math.cos(angle) * half);
                break;
            }
            case "self": {
                // what it covers around the champion, or how far it reaches for one that picks its own target
                const radius = def.radius ?? def.range;
                // a self-cast, or one that reaches the whole screen, has nothing to draw
                if (radius > 0 && radius < 200) ring(pos, radius, def.radius !== undefined);
                break;
            }
        }
        gfx.position.set(0, 0);
        gfx.rotation = 0;
    }
}

export const leagueIndicator = new LeagueIndicator();
