import { GameConfig, GasMode } from "../../../../shared/gameConfig.ts";
import { math } from "../../../../shared/utils/math.ts";
import { util } from "../../../../shared/utils/util.ts";
import { v2, type Vec2 } from "../../../../shared/utils/v2.ts";
import type { Game } from "../game.ts";

interface StageData {
    mode: GasMode;
    duration: number;
    rad: number;
    damage: number;
}

const GasStages: StageData[] = [
    {
        mode: GasMode.Inactive,
        duration: 0,
        rad: 0.7425,
        damage: 0,
    },
    {
        mode: GasMode.Waiting,
        duration: 80,
        rad: 0.45,
        damage: 1.4,
    },
    {
        mode: GasMode.Moving,
        duration: 30,
        rad: 0.45,
        damage: 1.4,
    },
    {
        mode: GasMode.Waiting,
        duration: 65,
        rad: 0.3125,
        damage: 2.2,
    },
    {
        mode: GasMode.Moving,
        duration: 25,
        rad: 0.3125,
        damage: 2.2,
    },
    {
        mode: GasMode.Waiting,
        duration: 50,
        rad: 0.2125,
        damage: 3.5,
    },
    {
        mode: GasMode.Moving,
        duration: 20,
        rad: 0.2125,
        damage: 3.5,
    },
    {
        mode: GasMode.Waiting,
        duration: 40,
        rad: 0.1375,
        damage: 7.5,
    },
    {
        mode: GasMode.Moving,
        duration: 15,
        rad: 0.1375,
        damage: 7.5,
    },
    {
        mode: GasMode.Waiting,
        duration: 30,
        rad: 0.075,
        damage: 10,
    },
    {
        mode: GasMode.Moving,
        duration: 10,
        rad: 0.075,
        damage: 10,
    },
    {
        mode: GasMode.Waiting,
        duration: 25,
        rad: 0.045,
        damage: 14,
    },
    {
        mode: GasMode.Moving,
        duration: 5,
        rad: 0.045,
        damage: 14,
    },
    {
        mode: GasMode.Waiting,
        duration: 20,
        rad: 0.0225,
        damage: 22,
    },
    {
        mode: GasMode.Moving,
        duration: 6,
        rad: 0.0225,
        damage: 22,
    },
    {
        mode: GasMode.Waiting,
        duration: 15,
        rad: 0,
        damage: 22,
    },
    {
        mode: GasMode.Moving,
        duration: 15,
        rad: 0,
        damage: 22,
    },
];

/**
 * Storm mode: shorter waits, quicker shrinks, and each circle's timing and size
 * is jittered so no two games play the same.
 */
const StormStages: StageData[] = [
    { mode: GasMode.Inactive, duration: 0, rad: 0.7425, damage: 0 },
    { mode: GasMode.Waiting, duration: 45, rad: 0.5, damage: 1.6 },
    { mode: GasMode.Moving, duration: 20, rad: 0.5, damage: 1.6 },
    { mode: GasMode.Waiting, duration: 35, rad: 0.34, damage: 2.6 },
    { mode: GasMode.Moving, duration: 18, rad: 0.34, damage: 2.6 },
    { mode: GasMode.Waiting, duration: 28, rad: 0.22, damage: 4 },
    { mode: GasMode.Moving, duration: 15, rad: 0.22, damage: 4 },
    { mode: GasMode.Waiting, duration: 22, rad: 0.14, damage: 8 },
    { mode: GasMode.Moving, duration: 12, rad: 0.14, damage: 8 },
    { mode: GasMode.Waiting, duration: 18, rad: 0.08, damage: 11 },
    { mode: GasMode.Moving, duration: 10, rad: 0.08, damage: 11 },
    { mode: GasMode.Waiting, duration: 14, rad: 0.045, damage: 15 },
    { mode: GasMode.Moving, duration: 8, rad: 0.045, damage: 15 },
    { mode: GasMode.Waiting, duration: 10, rad: 0.02, damage: 22 },
    { mode: GasMode.Moving, duration: 8, rad: 0.02, damage: 22 },
    { mode: GasMode.Waiting, duration: 8, rad: 0, damage: 22 },
    { mode: GasMode.Moving, duration: 10, rad: 0, damage: 22 },
];

export class Gas {
    /**
     * Current gas mode
     * Inactive: The gas is not active, used when only a single player is on the lobby
     * Waiting: The Gas has started and is waiting to advance to the next stage
     * Moving: The gas is moving between one stage and another
     */
    mode = GasMode.Inactive;

    /**
     * Current gas stage used to track the gas damage from `GameConfig.gas.damage`
     * Is incremented when gas mode changes
     */
    stage = 0;

    /**
     * Like stage but is incremented after gas goes through Waiting and Moving mode's
     */
    circleIdx = -1;

    /**
     * Current gas stage damage
     */
    damage: number;

    /**
     * Current gas duration
     * returns 0 if gas if inactive
     */
    duration: number;

    /**
     * Old gas radius
     * When gas mode is waiting this will be the same as `currentRad`
     * When gas mode is moving this will be the radius from the previous state
     * And will be used for lerping `currentRad`
     */
    radOld: number;
    /**
     * New gas radius
     * When gas mode is waiting this will be the radius for the new stage
     * When gas mode is moving this will be the radius at the end of the stage
     */
    radNew: number;
    /**
     * Current gas radius
     * When gas mode is waiting this and `radOld` will be the same
     * When gas mode is moving this will be a lerp between `radOld` and `radNew` using `gasT` as the interpolation factor
     */
    currentRad: number;

    /**
     * Old gas position
     * When gas mode is waiting this will be the same as `currentPos`
     * When gas mode is moving this will be the position from the previous state
     * And will be used for lerping `currentPos`
     */
    posOld: Vec2;
    /**
     * New gas position
     * When gas mode is waiting this will be the position for the new stage
     * When gas mode is moving this will be the position at the end of the stage
     */
    posNew: Vec2;
    /**
     * Current gas position
     * When gas mode is waiting this and `posOld` will be the same
     * When gas mode is moving this will be a lerp between `posOld` and `posNew` using `gasT` as the interpolation factor
     */
    currentPos: Vec2;

    /**
     * Gas Timer
     * in a range between 0 and 1
     */
    gasT = 0;

    /**
     * Current duration ticker
     */
    private _gasTicker = 0;

    /**
     * If the gas full state needs to be sent to clients
     */
    dirty = true;
    /**
     * If the gas time needs to be sent to clients
     */
    timeDirty = true;

    private _damageTicker = 0;
    private _running = false;

    doDamage = false;

    mapSize: number;

    private _stages: StageData[];
    private _storm: boolean;
    private _volatility: number;

    constructor(readonly game: Game) {
        const map = game.map;
        this._storm = !!map.mapDef.gameMode.stormMode || !!game.customMap?.storm;
        this._stages = this._storm ? StormStages : GasStages;
        this._volatility = game.customMap?.zoneVolatility ?? (this._storm ? 1 : 0);
        this.mapSize = (map.width + map.height) / 2;
        this.posOld = v2.create(map.width / 2, map.height / 2);
        this.posNew = v2.copy(this.posOld);
        this.currentPos = v2.copy(this.posOld);

        const stage = this._getStageData();
        this.radOld = 0.85 * this.mapSize;
        this.radNew = this.currentRad = stage.rad * this.mapSize;
        this.duration = stage.duration;
        this.damage = stage.damage;
    }

    update(dt: number) {
        this._gasTicker += dt;

        if (this._running) {
            this.gasT = math.clamp(this._gasTicker / this.duration, 0, 1);
            this.timeDirty = true;

            if (this.mode === GasMode.Moving) {
                this.currentPos = v2.lerp(this.gasT, this.posOld, this.posNew);
                this.currentRad = math.lerp(this.gasT, this.radOld, this.radNew);
            }

            if (this.gasT >= 1) {
                this.advanceGasStage();
            }
        }

        this.doDamage = false;
        this._damageTicker += dt;

        if (this._damageTicker >= GameConfig.gas.damageTickRate) {
            this._damageTicker = 0;
            this.doDamage = true;
        }
    }

    advanceGasStage() {
        this.stage++;
        this._running = true;

        const stage = this._getStageData();

        if (!stage) {
            this._running = false;
            return;
        }

        this.mode = stage.mode;
        this.radOld = this.currentRad;
        // how unpredictable circles are: 0 = classic nested circles, 1 = storm
        const v = this._volatility;
        this.duration = stage.duration;
        if (v > 0) {
            this.duration *= util.random(1 - 0.3 * v, 1 + 0.3 * v);
        }
        this.duration /= this.game.customMap?.zoneSpeed ?? 1;
        if (this.mode === GasMode.Waiting) {
            let rad = stage.rad;
            if (v > 0 && rad > 0) {
                // only shrink, never grow past the current circle
                rad = Math.min(rad * util.random(1 - 0.2 * v, 1 + 0.2 * v), this.radOld / this.mapSize);
            }
            // the map maker's smallest zone: hold there instead of closing
            const minRad = this.game.customMap?.zoneMinRadius ?? 0;
            this.radNew = Math.min(Math.max(rad * this.mapSize, minRad), this.radOld);
        }
        this.damage = stage.damage;

        const circleIdxOld = this.circleIdx;

        if (this.mode === GasMode.Waiting) {
            this.posOld = v2.copy(this.posNew);

            // Normal: next circle sits fully inside the current one.
            // Storm: next center can be anywhere up to the current edge, so part
            // of the new circle can sit in today's storm and the zone drifts.
            const zoneEnd = this.game.customMap?.zoneEnd;
            if (zoneEnd) {
                // Shrink toward the map maker's end point: scaling the circle about
                // that point keeps it inside every circle, so the zone always ends there.
                const end = v2.create(zoneEnd.x, zoneEnd.y);
                const k = this.radOld > 0 ? this.radNew / this.radOld : 0;
                this.posNew = v2.add(end, v2.mul(v2.sub(this.posNew, end), k));
                if (v > 0) {
                    // still let volatile circles poke into the current storm
                    this.posNew = v2.add(this.posNew, util.randomPointInCircle(this.radNew * 0.5 * v));
                }
            } else {
                // up to radOld - radNew keeps it nested; volatility lets it reach past the edge
                const maxOffset = this.radOld - this.radNew + v * this.radNew * util.random(0.6, 1);
                this.posNew = v2.add(this.posNew, util.randomPointInCircle(maxOffset));

                const rad = this.radNew * 0.75; // ensure at least 75% of the safe zone will be inside map bounds
                this.posNew = math.v2Clamp(
                    this.posNew,
                    v2.create(rad, rad),
                    v2.create(this.game.map.width - rad, this.game.map.height - rad),
                );
            }

            this.currentPos = this.posOld;
            this.currentRad = this.radOld;
            this.circleIdx++;
        }

        if (this.circleIdx !== circleIdxOld) {
            if (this.game.map.mapDef.gameConfig.roles) {
                this.game.playerBarn.scheduleRoleAssignments();
            }

            if (this.game.map.mapDef.gameConfig.unlocks) {
                this.game.map.scheduleUnlocks();
            }

            for (const plane of this.game.map.mapDef.gameConfig.planes.timings) {
                if (plane.circleIdx === this.circleIdx && !this.game.noLoot) {
                    this.game.planeBarn.schedulePlane(plane.wait, plane.options);
                }
            }
        }

        this._gasTicker = 0;
        this.gasT = 0;
        this.dirty = true;
        this.timeDirty = true;

        this.game.updateData();
    }

    private _getStageData() {
        return this._stages[this.stage];
    }

    isInGas(pos: Vec2) {
        return v2.distance(pos, this.currentPos) >= this.currentRad;
    }

    isOutSideSafeZone(pos: Vec2) {
        return v2.distance(pos, this.posNew) >= this.radNew;
    }

    flush() {
        this.dirty = false;
        this.timeDirty = false;
    }
}
