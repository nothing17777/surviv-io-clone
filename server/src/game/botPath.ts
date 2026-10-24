import { MapObjectDefs } from "../../../shared/defs/register.ts";
import { ObjectType } from "../../../shared/net/objectSerializeFns.ts";
import { collider } from "../../../shared/utils/collider.ts";
import { util } from "../../../shared/utils/util.ts";
import { v2, type Vec2 } from "../../../shared/utils/v2.ts";
import type { Game } from "./game.ts";

/** a crate or breakable wall a bot can punch through quickly (stones take forever, barrels blow up) */
export function isBreakable(obj: { type: string; destructible: boolean; isDoor: boolean }): boolean {
    if (!obj.destructible || obj.isDoor) return false;
    const def = MapObjectDefs.typeToDef(obj.type, "obstacle");
    return def.health <= 600 && !def.explosion;
}

/** grid cell size in world units; half a player wide so narrow house doorways stay open */
const Cell = 0.625;
/** how far around the bot the grid reaches; farther goals are walked toward in legs */
const Reach = 32;
const Size = Math.ceil((Reach * 2) / Cell);
/** extra cost of a cell inside something breakable: worth punching through, but only to skip a real detour */
const BreakCost = 6;

const blocked = new Uint8Array(Size * Size);
const cost = new Float32Array(Size * Size);
const parent = new Int32Array(Size * Size);
const closed = new Uint8Array(Size * Size);

/**
 * A* over a small grid centered on `from`, around every solid obstacle
 * (doors count as open, they swing when walked into; crates and breakable
 * walls are open at a cost, the bot punches through). Returns world-space
 * waypoints ending near `to`, or undefined when there's no way through.
 */
export function findPath(game: Game, from: Vec2, to: Vec2, layer: number, rad: number): Vec2[] | undefined {
    // far goals: path to the edge of the grid toward them
    const toGoal = v2.sub(to, from);
    const goalDist = v2.length(toGoal);
    const target = goalDist > Reach - Cell * 2
        ? v2.add(from, v2.mul(v2.normalize(toGoal), Reach - Cell * 2))
        : to;

    const origin = v2.create(from.x - Reach, from.y - Reach);
    const cellOf = (p: Vec2) => {
        const x = Math.floor((p.x - origin.x) / Cell);
        const y = Math.floor((p.y - origin.y) / Cell);
        return x >= 0 && y >= 0 && x < Size && y < Size ? y * Size + x : -1;
    };
    const center = (i: number) =>
        v2.create(origin.x + ((i % Size) + 0.5) * Cell, origin.y + (Math.floor(i / Size) + 0.5) * Cell);

    // mark cells a player can't stand in
    blocked.fill(0);
    const objs = game.grid.intersectCollider(
        collider.createAabb(origin, v2.create(from.x + Reach, from.y + Reach)),
    );
    const pad = rad + 0.05;
    for (const obj of objs) {
        if (obj.__type !== ObjectType.Obstacle) continue;
        if (obj.dead || !obj.collidable || obj.isDoor) continue;
        if (!util.sameLayer(obj.layer, layer)) continue;
        // 1 solid, 2 breakable
        const mark = isBreakable(obj) ? 2 : 1;
        const box = collider.toAabb(obj.collider);
        const x0 = Math.max(0, Math.floor((box.min.x - pad - origin.x) / Cell));
        const y0 = Math.max(0, Math.floor((box.min.y - pad - origin.y) / Cell));
        const x1 = Math.min(Size - 1, Math.floor((box.max.x + pad - origin.x) / Cell));
        const y1 = Math.min(Size - 1, Math.floor((box.max.y + pad - origin.y) / Cell));
        for (let y = y0; y <= y1; y++) {
            for (let x = x0; x <= x1; x++) {
                const i = y * Size + x;
                if (blocked[i] === 1) continue;
                if (collider.intersectCircle(obj.collider, center(i), pad)) blocked[i] = mark;
            }
        }
    }

    const start = cellOf(from);
    let goal = cellOf(target);
    if (start < 0 || goal < 0) return undefined;
    // someone is standing here, so it's open, even when squeezed between furniture
    const open = (c: number) => {
        const sx = c % Size;
        const sy = Math.floor(c / Size);
        for (let dy = -1; dy <= 1; dy++) {
            for (let dx = -1; dx <= 1; dx++) {
                const x = sx + dx;
                const y = sy + dy;
                if (x >= 0 && y >= 0 && x < Size && y < Size) blocked[y * Size + x] = 0;
            }
        }
    };
    open(start);
    // chasing a player tucked against a toilet or into a corner: they fit there, so do we
    if (target === to && game.playerBarn.livingPlayers.some((p) => v2.distance(p.pos, to) < 0.5)) open(goal);
    // goal inside something (loot on a table, a crate): settle for the nearest open cell
    if (blocked[goal]) {
        const gx = goal % Size;
        const gy = Math.floor(goal / Size);
        let found = -1;
        for (let r = 1; r <= 3 && found < 0; r++) {
            for (let dy = -r; dy <= r && found < 0; dy++) {
                for (let dx = -r; dx <= r && found < 0; dx++) {
                    const x = gx + dx;
                    const y = gy + dy;
                    if (x < 0 || y < 0 || x >= Size || y >= Size) continue;
                    if (!blocked[y * Size + x]) found = y * Size + x;
                }
            }
        }
        if (found < 0) return undefined;
        goal = found;
    }

    // A*, 8 neighbours, no squeezing diagonally past corners
    cost.fill(Infinity);
    closed.fill(0);
    parent.fill(-1);
    const gxGoal = goal % Size;
    const gyGoal = Math.floor(goal / Size);
    const h = (i: number) => {
        const dx = Math.abs((i % Size) - gxGoal);
        const dy = Math.abs(Math.floor(i / Size) - gyGoal);
        return Math.max(dx, dy) + 0.414 * Math.min(dx, dy);
    };
    const heap = new MinHeap();
    heap.push(start, h(start));
    cost[start] = 0;
    let reached = false;
    let expanded = 0;
    while (heap.size && expanded < 12000) {
        const cur = heap.pop();
        if (closed[cur]) continue;
        closed[cur] = 1;
        expanded++;
        if (cur === goal) {
            reached = true;
            break;
        }
        const cx = cur % Size;
        const cy = Math.floor(cur / Size);
        for (let dy = -1; dy <= 1; dy++) {
            for (let dx = -1; dx <= 1; dx++) {
                if (!dx && !dy) continue;
                const x = cx + dx;
                const y = cy + dy;
                if (x < 0 || y < 0 || x >= Size || y >= Size) continue;
                const n = y * Size + x;
                if (blocked[n] === 1 || closed[n]) continue;
                if (dx && dy && (blocked[cy * Size + x] === 1 || blocked[y * Size + cx] === 1)) continue;
                const c = cost[cur] + (dx && dy ? 1.414 : 1) + (blocked[n] ? BreakCost : 0);
                if (c >= cost[n]) continue;
                cost[n] = c;
                parent[n] = cur;
                heap.push(n, c + h(n));
            }
        }
    }
    if (!reached) return undefined;

    const cells: number[] = [];
    for (let i = goal; i !== -1; i = parent[i]) cells.push(i);
    cells.reverse();

    // drop waypoints that a straight walk can skip
    const clear = (a: number, b: number) => {
        let x0 = a % Size;
        let y0 = Math.floor(a / Size);
        const x1 = b % Size;
        const y1 = Math.floor(b / Size);
        const dx = Math.abs(x1 - x0);
        const dy = -Math.abs(y1 - y0);
        const sx = x0 < x1 ? 1 : -1;
        const sy = y0 < y1 ? 1 : -1;
        let err = dx + dy;
        while (true) {
            if (blocked[y0 * Size + x0]) return false;
            if (x0 === x1 && y0 === y1) return true;
            const e2 = 2 * err;
            if (e2 >= dy) {
                err += dy;
                x0 += sx;
            }
            if (e2 <= dx) {
                err += dx;
                y0 += sy;
            }
        }
    };
    const points: Vec2[] = [];
    let anchor = 0;
    while (anchor < cells.length - 1) {
        let next = cells.length - 1;
        while (next > anchor + 1 && !clear(cells[anchor], cells[next])) next--;
        points.push(center(cells[next]));
        anchor = next;
    }
    // finish on the real goal when it's the last leg and reachable
    if (points.length && target === to && !blocked[cellOf(to)]) points[points.length - 1] = v2.copy(to);
    return points;
}

/** binary min-heap of cell indices keyed by score */
class MinHeap {
    private items: number[] = [];
    private keys: number[] = [];

    get size() {
        return this.items.length;
    }

    push(item: number, key: number) {
        const items = this.items;
        const keys = this.keys;
        let i = items.length;
        items.push(item);
        keys.push(key);
        while (i > 0) {
            const p = (i - 1) >> 1;
            if (keys[p] <= key) break;
            items[i] = items[p];
            keys[i] = keys[p];
            i = p;
        }
        items[i] = item;
        keys[i] = key;
    }

    pop(): number {
        const items = this.items;
        const keys = this.keys;
        const top = items[0];
        const lastItem = items.pop()!;
        const lastKey = keys.pop()!;
        if (items.length) {
            let i = 0;
            const n = items.length;
            while (true) {
                const l = i * 2 + 1;
                if (l >= n) break;
                const r = l + 1;
                const c = r < n && keys[r] < keys[l] ? r : l;
                if (keys[c] >= lastKey) break;
                items[i] = items[c];
                keys[i] = keys[c];
                i = c;
            }
            items[i] = lastItem;
            keys[i] = lastKey;
        }
        return top;
    }
}
