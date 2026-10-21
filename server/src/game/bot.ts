import { BulletDefs } from "../../../shared/defs/gameObjects/bulletDefs.ts";
import { ExplosionDefs } from "../../../shared/defs/gameObjects/explosionsDefs.ts";
import type { GunDef } from "../../../shared/defs/gameObjects/gunDefs.ts";
import type { ThrowableDef } from "../../../shared/defs/gameObjects/throwableDefs.ts";
import { GameObjectDefs, MapObjectDefs } from "../../../shared/defs/register.ts";
import { GameConfig, type InventoryItem, WeaponSlot } from "../../../shared/gameConfig.ts";
import * as net from "../../../shared/net/net.ts";
import { ObjectType } from "../../../shared/net/objectSerializeFns.ts";
import {
    type BotLevel,
    type BotSettings,
    defaultBotSettings,
    type PrivateBot,
    type VsBots,
} from "../../../shared/types/api.ts";
import { collider } from "../../../shared/utils/collider.ts";
import { math } from "../../../shared/utils/math.ts";
import { util } from "../../../shared/utils/util.ts";
import { v2, type Vec2 } from "../../../shared/utils/v2.ts";
import { findPath } from "./botPath.ts";
import { Client } from "./client.ts";
import type { Game } from "./game.ts";
import type { Bullet } from "./objects/bullet.ts";
import type { Loot } from "./objects/loot.ts";
import type { Obstacle } from "./objects/obstacle.ts";
import type { Player } from "./objects/player.ts";
import { NoOpSocket } from "./socket.ts";

interface BotSkill {
    /** chance a shot is aimed at the target rather than wide of it */
    accuracy: number;
    /** chance each bullet that would hit is dodged */
    dodge: number;
    /** seconds before reacting to a newly seen enemy */
    reaction: number;
    /** aims ahead of a moving target */
    lead: boolean;
    /** how fast the aim can swing, radians per second */
    turnRate: number;
    /** seconds of shooting, then seconds of pause (like a person re-aiming) */
    burst: [number, number];
    /** rolled hits ignore gun spread */
    noSpread: boolean;
    /** spins while fighting, snapping to the target only on the shot */
    spin: boolean;
    /** swaps guns right after a slow shot to skip the fire delay */
    quickSwitch: boolean;
    /** seconds between strafe direction changes */
    strafeTime: [number, number];
    /** seconds between grenade throws */
    throwEvery: [number, number];
    /** seconds a grenade is cooked before letting go */
    cook: number;
    /** how far off the landing spot can be, world units */
    throwError: number;
}

const Skills: Record<BotLevel, BotSkill> = {
    beginner: {
        accuracy: 0.35,
        dodge: 0.2,
        reaction: 0.9,
        lead: false,
        turnRate: 3,
        burst: [0.5, 0.9],
        noSpread: false,
        spin: false,
        quickSwitch: false,
        strafeTime: [1.2, 2.4],
        throwEvery: [14, 24],
        cook: 0,
        throwError: 6,
    },
    intermediate: {
        accuracy: 0.5,
        dodge: 0.35,
        reaction: 0.6,
        lead: false,
        turnRate: 5,
        burst: [0.8, 0.6],
        noSpread: false,
        spin: false,
        quickSwitch: false,
        strafeTime: [0.8, 1.6],
        throwEvery: [9, 16],
        cook: 0.6,
        throwError: 4,
    },
    advanced: {
        accuracy: 0.75,
        dodge: 0.7,
        reaction: 0.3,
        lead: true,
        turnRate: 10,
        burst: [1.5, 0.3],
        noSpread: false,
        spin: false,
        quickSwitch: true,
        strafeTime: [0.4, 1],
        throwEvery: [6, 11],
        cook: 1.6,
        throwError: 2,
    },
    hacker: {
        accuracy: 1,
        dodge: 0.9,
        reaction: 0,
        lead: true,
        turnRate: 1000,
        burst: [1000, 0],
        noSpread: true,
        spin: true,
        quickSwitch: true,
        strafeTime: [0.2, 0.6],
        throwEvery: [4, 7],
        cook: 2.4,
        throwError: 0.5,
    },
};

const BotNames = [
    "Ghost",
    "Viper",
    "Raptor",
    "Nova",
    "Shadow",
    "Blaze",
    "Frost",
    "Echo",
    "Rogue",
    "Falcon",
    "Havoc",
    "Jinx",
    "Kraken",
    "Lynx",
    "Maverick",
    "Nomad",
    "Onyx",
    "Phantom",
    "Quake",
    "Rebel",
    "Sniper",
    "Titan",
    "Vortex",
    "Wraith",
    "Zephyr",
    "Bandit",
    "Cobra",
    "Dagger",
    "Ember",
    "Fang",
    "Grim",
    "Hunter",
    "Ivy",
    "Juno",
    "Kai",
    "Luna",
    "Mako",
    "Nyx",
    "Orion",
    "Pixel",
    "Rex",
    "Sage",
    "Tango",
    "Ursa",
    "Vex",
    "Wolf",
    "Yeti",
    "Zed",
];

function randomBotName() {
    const name = BotNames[util.randomInt(0, BotNames.length - 1)];
    return Math.random() < 0.5 ? `${name}${util.randomInt(1, 999)}` : name;
}

/** a client that never sends anything: bots have no socket */
class BotClient extends Client {
    override sendMsg(): void {}
    override sendInstantMsg(): void {}
    override sendData(): void {}
}

const GunSlots = [WeaponSlot.Primary, WeaponSlot.Secondary];

/** target distance (center to center) where a bot pulls out its melee weapon */
const MeleeReach = 3.2;

/** farthest a bot tries to throw, world units */
const MaxThrowDist = 26;
/** toMouseLen per unit of throw distance (measured: max mouse dist lands about this far) */
const ThrowMouseLenPerUnit = 0.7;

export class BotBrain {
    readonly skill: BotSkill;

    target?: Player;
    private _reactTimer = 0;
    private _thinkTicker = Math.random() * 0.15;
    private _moveDir = v2.create(0, 0);
    private _goal?: Vec2;
    private _lootTarget?: Loot;
    private _crateTarget?: Obstacle;
    private _strafeSign = 1;
    private _strafeTicker = 0;
    private _wanderTicker = 0;
    private _stuckCheckPos = v2.create(0, 0);
    private _stuckTicker = 0;
    private _unstickTicker = 0;
    private _spin = Math.random() * Math.PI * 2;
    private _lastCooldown = 0;
    private _targetVel = v2.create(0, 0);
    private _targetLastPos = v2.create(0, 0);
    private _dodgeRolls = new Map<Bullet, { start: Vec2; dodge: boolean }>();
    /** one react-or-not roll per grenade / airstrike zone */
    private _blastRolls = new WeakMap<object, boolean>();
    private _dodgeClearTicker = 0;
    /** loot / crates we couldn't path to, by object id -> seconds left to ignore them */
    private _unreachable = new Map<number, number>();
    private _zoneRun = false;
    private _throw?: { prev: number; timer: number; released: boolean; cook: number; error: Vec2 };
    private _throwCooldown = util.random(3, 8);
    private _path?: Vec2[];
    private _pathGoal?: Vec2;
    private _pathTicker = 0;
    private _steerTicker = 0;
    private _steerDesired?: Vec2;
    private _steerDir = v2.create(1, 0);
    private _steerSide = 1;
    private _stuckCount = 0;
    private _coverSpot?: Vec2;
    private _retreat?: Vec2;
    private _lastThreat?: Vec2;
    private _sinceThreat = Infinity;
    private _burstTicker = 0;
    private _bursting = true;
    /** set for the shot fired this tick when it was rolled as a hit */
    aimLocked = false;

    readonly settings: BotSettings;

    constructor(readonly player: Player, readonly level: BotLevel, settings?: BotSettings) {
        this.settings = settings ?? defaultBotSettings()[level];
        // the party leader's hit / dodge numbers replace the level's
        this.skill = {
            ...Skills[level],
            accuracy: this.settings.accuracy / 100,
            dodge: this.settings.dodge / 100,
        };
        v2.set(this._stuckCheckPos, player.pos);
    }

    /**
     * Rolled once per bullet: true lets the bullet pass through.
     * Bullets get re-used, so the roll is keyed on the bullet and its start pos.
     */
    dodgeBullet(bullet: Bullet): boolean {
        if (bullet.player === this.player) return false;
        if (bullet.player && bullet.player.teamId === this.player.teamId) return false;
        const roll = this._dodgeRolls.get(bullet);
        if (roll && roll.start === bullet.startPos) return roll.dodge;
        const dodge = Math.random() < this.skill.dodge;
        this._dodgeRolls.set(bullet, { start: bullet.startPos, dodge });
        // sidestep away from the shot so the dodge reads on screen
        if (dodge) this._strafeSign = v2.dot(v2.perp(bullet.dir), v2.sub(this.player.pos, bullet.pos)) > 0 ? 1 : -1;
        return dodge;
    }

    get game(): Game {
        return this.player.game;
    }

    update(dt: number) {
        const player = this.player;
        if (player.dead) return;

        if (this.game.map.perkMode && !player.role) {
            const roles = this.game.map.mapDef.gameMode.perkModeRoles!;
            player.roleSelect(roles[util.randomInt(0, roles.length - 1)]);
            return;
        }

        this._dodgeClearTicker -= dt;
        if (this._dodgeClearTicker <= 0) {
            this._dodgeRolls.clear();
            this._dodgeClearTicker = 3;
        }

        this._sinceThreat += dt;
        for (const [id, t] of this._unreachable) {
            if (t - dt <= 0) this._unreachable.delete(id);
            else this._unreachable.set(id, t - dt);
        }
        this._thinkTicker -= dt;
        if (this._thinkTicker <= 0) {
            this._thinkTicker = 0.15;
            this.think();
        }

        this.act(dt);
    }

    //
    // Decisions, a few times a second
    //

    private think() {
        const player = this.player;
        const prevTarget = this.target;
        this.target = this.findTarget();
        if (this.target && this.target !== prevTarget) {
            this._reactTimer = this.skill.reaction * util.random(0.8, 1.2);
            v2.set(this._targetLastPos, this.target.pos);
            v2.set(this._targetVel, v2.create(0, 0));
        }

        this._goal = undefined;

        if (player.downed) {
            // crawl away from whoever downed us
            if (this.target) this._goal = v2.add(player.pos, v2.sub(player.pos, this.target.pos));
            return;
        }

        // empty handed: only brawl up close, otherwise keep looting
        if (this.target && !this.hasGunWithAmmo() && v2.distance(this.target.pos, player.pos) > 12) {
            this.target = undefined;
        }

        if (this.target) {
            this._lastThreat = v2.copy(this.target.pos);
            this._sinceThreat = 0;
            this._coverSpot = undefined;
            this.pickCombatWeapon(v2.distance(this.target.pos, player.pos));
            // hurt and carrying heals: fall back behind cover (hackers just keep fighting)
            this._retreat = undefined;
            if (player.health < 35 && this.settings.heal && this.pickHeal() && this.level !== "hacker") {
                this._retreat = this.findCover(this.target.pos);
            }
            return;
        }
        this._retreat = undefined;

        this.outOfCombat();
    }

    private outOfCombat() {
        const player = this.player;
        const gas = this.game.gas;

        // the zone always wins; once heading in, keep going until well inside
        const zoneDist = v2.distance(player.pos, gas.posNew);
        if (gas.isInGas(player.pos) || zoneDist > gas.radNew * 0.95) this._zoneRun = true;
        else if (zoneDist < gas.radNew * 0.75) this._zoneRun = false;
        if (this._zoneRun) {
            this._goal = v2.copy(gas.posNew);
            this._lootTarget = undefined;
            this._crateTarget = undefined;
            return;
        }

        // heal up while nobody is around
        if (player.actionType === GameConfig.Action.None) {
            if (player.health < 75 && this.settings.heal) {
                const heal = this.pickHeal();
                if (heal) {
                    // get behind something first, then heal
                    const threat = this.threatPos();
                    if (threat && !this._coverSpot) this._coverSpot = this.findCover(threat);
                    if (this._coverSpot && v2.distance(this._coverSpot, player.pos) > 1.5) {
                        this._goal = v2.copy(this._coverSpot);
                        return;
                    }
                    this._coverSpot = undefined;
                    player.useHealingItem(heal);
                    return;
                }
            }
            if (player.boost < 50 && this.settings.boost) {
                const boost = (["painkiller", "soda"] as InventoryItem[]).find((b) => player.invManager.has(b));
                if (boost) {
                    player.useBoostItem(boost);
                    return;
                }
            }
            // top up the clip
            const weap = player.weapons[player.curWeapIdx];
            const def = GameObjectDefs.typeToDefSafe(weap.type);
            if (def?.type === "gun" && weap.ammo < (def as GunDef).maxClip && this.reserveAmmo(def as GunDef) > 0) {
                player.weaponManager.scheduledReload = true;
            }
        }
        if (player.actionType !== GameConfig.Action.None) {
            // stand still while healing / reloading / reviving
            return;
        }

        // pick a downed teammate back up
        const downedMate = player.group?.players.find(
            (p) => p !== player && p.downed && !p.dead && v2.distance(p.pos, player.pos) < 25,
        );
        if (downedMate) {
            if (v2.distance(downedMate.pos, player.pos) < GameConfig.player.reviveRange) {
                player.revive(downedMate);
            } else {
                this._goal = v2.copy(downedMate.pos);
            }
            return;
        }

        // chase: go to where the enemy was last seen
        if (this.settings.chase && this._lastThreat && this._sinceThreat < 6) {
            if (v2.distance(this._lastThreat, player.pos) > 2.5) {
                this._goal = v2.copy(this._lastThreat);
                return;
            }
            this._lastThreat = undefined;
        }

        // loot
        if (!this.settings.loot) {
            this._lootTarget = undefined;
        } else if (!this._lootTarget || this._lootTarget.destroyed || !this.wantsLoot(this._lootTarget)) {
            this._lootTarget = this.findLoot();
        }
        if (this._lootTarget) {
            const loot = this._lootTarget;
            if (v2.distance(loot.pos, player.pos) < player.rad + loot.rad + 0.5) {
                player.interactWith(loot);
                this._lootTarget = undefined;
            } else {
                this._goal = v2.copy(loot.pos);
            }
            return;
        }

        // nothing to shoot with: break crates for loot
        if (!this.hasGunWithAmmo() && this.settings.loot) {
            if (!this._crateTarget || this._crateTarget.dead) this._crateTarget = this.findCrate();
            if (this._crateTarget) {
                const crate = this._crateTarget;
                this._goal = v2.copy(crate.pos);
                return;
            }
        }

        // wander inside the zone
        this._wanderTicker -= 0.15;
        if (!this._wanderGoal || this._wanderTicker <= 0 || v2.distance(this._wanderGoal, player.pos) < 3) {
            this._wanderTicker = util.random(6, 14);
            const r = Math.min(gas.radNew * 0.7, 120);
            this._wanderGoal = v2.add(gas.posNew, util.randomPointInCircle(r));
            this._wanderGoal.x = math.clamp(this._wanderGoal.x, 10, this.game.map.width - 10);
            this._wanderGoal.y = math.clamp(this._wanderGoal.y, 10, this.game.map.height - 10);
        }
        this._goal = this._wanderGoal;
    }

    private _wanderGoal?: Vec2;

    private findTarget(): Player | undefined {
        const player = this.player;
        const range = Math.max(player.zoom * 1.2, 35);
        let best: Player | undefined;
        let bestDist = range;
        const nearby = this.game.grid.intersectCollider(
            collider.createCircle(player.pos, range),
        );
        for (const obj of nearby) {
            if (obj.__type !== ObjectType.Player) continue;
            if (obj === player || obj.dead || obj.teamId === player.teamId) continue;
            if (!util.sameLayer(obj.layer, player.layer)) continue;
            const dist = v2.distance(obj.pos, player.pos);
            // keep the current target a little longer so we don't flip-flop
            const d = obj === this.target ? dist * 0.7 : dist;
            if (d >= bestDist) continue;
            if (!this.canSee(obj.pos)) continue;
            best = obj;
            bestDist = d;
        }
        return best;
    }

    private canSee(pos: Vec2): boolean {
        const player = this.player;
        const objs = this.game.grid.intersectLineSegment(player.pos, pos);
        for (const obj of objs) {
            if (obj.__type !== ObjectType.Obstacle) continue;
            if (obj.dead || !obj.collidable || obj.height < GameConfig.bullet.height) continue;
            if (!util.sameLayer(obj.layer, player.layer)) continue;
            if (collider.intersectSegment(obj.collider, player.pos, pos)) return false;
        }
        return true;
    }

    private reserveAmmo(def: GunDef) {
        const ammo = def.ammo as InventoryItem;
        return this.player.invManager.isValid(ammo) ? this.player.invManager.get(ammo) : 0;
    }

    private gunHasAmmo(slot: number) {
        const weap = this.player.weapons[slot];
        if (!weap.type) return false;
        const def = GameObjectDefs.typeToDefSafe(weap.type);
        if (def?.type !== "gun") return false;
        return weap.ammo > 0 || this.reserveAmmo(def as GunDef) > 0
            || this.player.weaponManager.isInfinite(def as GunDef);
    }

    private hasGunWithAmmo() {
        return GunSlots.some((s) => this.gunHasAmmo(s));
    }

    /** how far this gun's bullets travel */
    private gunRange(slot: number): number {
        const def = GameObjectDefs.typeToDefSafe(this.player.weapons[slot].type);
        if (def?.type !== "gun") return 0;
        return BulletDefs[(def as GunDef).bulletType]?.distance ?? 100;
    }

    /**
     * A loaded gun that reaches the target, else any loaded gun (we'll close
     * in), else one we can reload, else melee.
     */
    private pickCombatWeapon(dist: number) {
        // mid-throw: leave the grenade in hand
        if (this._throw) return;
        const player = this.player;
        // close enough to hit: out with the melee weapon
        if (this.settings.melee && dist < MeleeReach && player.weapons[WeaponSlot.Melee].type) {
            if (player.curWeapIdx !== WeaponSlot.Melee) player.weaponManager.setCurWeapIndex(WeaponSlot.Melee);
            return;
        }
        const cur = player.curWeapIdx;
        const loaded = GunSlots.filter((s) => player.weapons[s].ammo > 0);
        const inRange = loaded.filter((s) => this.gunRange(s) * 0.9 >= dist);
        const slot = (inRange.includes(cur) ? cur : inRange[0])
            ?? (loaded.includes(cur) ? cur : loaded[0])
            ?? (GunSlots.includes(cur) && this.gunHasAmmo(cur) ? cur : GunSlots.find((s) => this.gunHasAmmo(s)))
            ?? WeaponSlot.Melee;
        if (slot !== cur) player.weaponManager.setCurWeapIndex(slot);
    }

    private pickHeal(): InventoryItem | undefined {
        const inv = this.player.invManager;
        if (this.player.health < 40 && inv.has("healthkit")) return "healthkit";
        if (inv.has("bandage")) return "bandage";
        if (inv.has("healthkit")) return "healthkit";
        return undefined;
    }

    private wantsLoot(loot: Loot): boolean {
        const player = this.player;
        if (!util.sameLayer(loot.layer, player.layer)) return false;
        if (loot.ownerId !== 0 && loot.ownerId !== player.__id) return false;
        const def = GameObjectDefs.typeToDefSafe(loot.type);
        if (!def) return false;
        switch (def.type) {
            case "gun":
                return GunSlots.some((s) => !player.weapons[s].type);
            case "melee":
                return player.weapons[WeaponSlot.Melee].type === "fists";
            case "helmet":
            case "chest":
            case "backpack": {
                const cur = def.type === "helmet"
                    ? player.helmet
                    : def.type === "chest"
                    ? player.chest
                    : player.backpack;
                return player.getGearLevel(loot.type) > player.getGearLevel(cur);
            }
            case "scope":
                return !player.invManager.has(loot.type as InventoryItem);
            case "perk":
                return !player.hasPerk(loot.type);
            case "ammo": {
                const usesIt = GunSlots.some((s) => {
                    const g = GameObjectDefs.typeToDefSafe(player.weapons[s].type);
                    return g?.type === "gun" && (g as GunDef).ammo === loot.type;
                });
                if (!usesIt) return false;
                return this.hasRoomFor(loot.type);
            }
            case "heal":
            case "boost":
            case "throwable":
                return this.hasRoomFor(loot.type);
        }
        return false;
    }

    private hasRoomFor(type: string) {
        const inv = this.player.invManager;
        if (!inv.isValid(type)) return false;
        return inv.get(type) < inv.getMaxCapacity(type);
    }

    private findLoot(): Loot | undefined {
        const player = this.player;
        const range = 40;
        let best: Loot | undefined;
        let bestDist = range;
        const nearby = this.game.grid.intersectCollider(collider.createCircle(player.pos, range));
        for (const obj of nearby) {
            if (obj.__type !== ObjectType.Loot || obj.destroyed || this._unreachable.has(obj.__id)) continue;
            const dist = v2.distance(obj.pos, player.pos);
            if (dist >= bestDist) continue;
            // stay inside the next zone, or the zone rule and the loot pull fight forever
            const gas = this.game.gas;
            if (gas.isInGas(obj.pos) || v2.distance(obj.pos, gas.posNew) > gas.radNew * 0.9) continue;
            if (!this.wantsLoot(obj)) continue;
            best = obj;
            bestDist = dist;
        }
        return best;
    }

    private findCrate(): Obstacle | undefined {
        const player = this.player;
        const range = 30;
        let best: Obstacle | undefined;
        let bestDist = range;
        const nearby = this.game.grid.intersectCollider(collider.createCircle(player.pos, range));
        for (const obj of nearby) {
            if (obj.__type !== ObjectType.Obstacle || obj.dead || !obj.destructible) continue;
            if (this._unreachable.has(obj.__id)) continue;
            if (!util.sameLayer(obj.layer, player.layer)) continue;
            const def = MapObjectDefs.typeToDef(obj.type, "obstacle");
            // crates, barrels and the like; stones take forever to punch
            if (!def.loot?.length || def.health > 150) continue;
            const gas = this.game.gas;
            if (v2.distance(obj.pos, gas.posNew) > gas.radNew * 0.9) continue;
            const dist = v2.distance(obj.pos, player.pos);
            if (dist >= bestDist) continue;
            best = obj;
            bestDist = dist;
        }
        return best;
    }

    //
    // Every tick: steer, aim, pull the trigger
    //

    private act(dt: number) {
        const player = this.player;
        player.shootHold = false;
        player.shootStart = false;
        this.aimLocked = false;

        let move = v2.create(0, 0);
        let lookDir: Vec2 | undefined;

        const target = this.target && !this.target.dead ? this.target : undefined;

        if (target && !player.downed) {
            // track the target's velocity for leading shots
            const vel = v2.div(v2.sub(target.pos, this._targetLastPos), Math.max(dt, 0.001));
            this._targetVel = v2.lerp(0.5, this._targetVel, vel);
            v2.set(this._targetLastPos, target.pos);

            const toTarget = v2.sub(target.pos, player.pos);
            const dist = v2.length(toTarget);
            const dirTo = v2.normalizeSafe(toTarget);

            const weapDef = GameObjectDefs.typeToDefSafe(player.activeWeapon);
            const isGun = weapDef?.type === "gun";
            const gunDef = isGun ? (weapDef as GunDef) : undefined;
            const isShotgun = !!gunDef && gunDef.bulletCount > 1;
            // stay where the gun actually reaches
            const range = gunDef ? (BulletDefs[gunDef.bulletType]?.distance ?? 100) * 0.9 : 0;
            const prefDist = !gunDef ? 0 : Math.min(isShotgun ? 7 : 16, range * 0.7);

            // strafe sideways and hold the preferred range
            this._strafeTicker -= dt;
            if (this._strafeTicker <= 0) {
                this._strafeTicker = util.random(...this.skill.strafeTime);
                this._strafeSign = Math.random() < 0.5 ? -1 : 1;
            }
            const strafe = v2.mul(v2.perp(dirTo), this._strafeSign);
            let approach = 0;
            // chase off: hold ground, never walk toward them
            if (dist > prefDist + 4 && this.settings.chase) approach = 1;
            else if (dist < prefDist - 4) approach = -1;
            move = v2.add(strafe, v2.mul(dirTo, approach * 1.2));
            if (!gunDef) move = this.settings.chase || dist < 4 ? dirTo : strafe; // melee: rush in
            // low on health: back off to cover while still shooting
            if (this._retreat) move = this.followPath(this._retreat, dt);

            // don't fight in the gas
            if (this.game.gas.isInGas(player.pos)) {
                move = v2.add(move, v2.mul(v2.normalizeSafe(v2.sub(this.game.gas.posNew, player.pos)), 2));
            }

            // the aim swings toward the wanted direction at a human-ish speed
            const throwDir = this.updateThrow(dt, target);
            if (throwDir) {
                lookDir = throwDir;
            } else {
                const wanted = this.aimAt(target, dist, gunDef);
                const curAng = Math.atan2(player.dir.y, player.dir.x);
                const diff = math.angleDiff(curAng, Math.atan2(wanted.y, wanted.x));
                const step = math.clamp(diff, -this.skill.turnRate * dt, this.skill.turnRate * dt);
                lookDir = v2.create(Math.cos(curAng + step), Math.sin(curAng + step));
                // a shot only goes when the aim has caught up
                const onTarget = Math.abs(diff - step) < 0.15;

                // fire in bursts with short pauses
                this._burstTicker -= dt;
                if (this._burstTicker <= 0) {
                    this._bursting = !this._bursting;
                    const [fire, pause] = this.skill.burst;
                    this._burstTicker = this._bursting ? fire * util.random(0.7, 1.3) : pause * util.random(0.7, 1.3);
                }

                this._reactTimer -= dt;
                const canShoot = this._reactTimer <= 0 && player.actionType !== GameConfig.Action.Revive
                    && onTarget && (this._bursting || !gunDef)
                    // don't waste shots the bullets can't reach
                    && (!gunDef || dist <= range);
                if (canShoot) {
                    if (gunDef) {
                        const weap = player.weapons[player.curWeapIdx];
                        if (weap.ammo > 0) {
                            if (gunDef.fireMode === "single") player.shootStart = true;
                            else player.shootHold = true;
                        }
                        // quick switch: right after a slow shot, swap to the other gun
                        if (
                            this.skill.quickSwitch
                            && gunDef.fireMode === "single"
                            && gunDef.fireDelay >= 0.45
                            && this._lastCooldown <= 0
                            && weap.cooldown > 0
                        ) {
                            const other = player.curWeapIdx === WeaponSlot.Primary
                                ? WeaponSlot.Secondary
                                : WeaponSlot.Primary;
                            if (player.weapons[other].ammo > 0 && this.gunRange(other) * 0.9 >= dist) {
                                player.weaponManager.setCurWeapIndex(other);
                            }
                        }
                        this._lastCooldown = player.weapons[player.curWeapIdx].cooldown;
                    } else if (dist < 4) {
                        player.shootStart = true;
                        player.shootHold = true;
                    }
                }

                // the hacker spins, and only faces the target on the tick it fires
                if (this.skill.spin) {
                    const weap = player.weapons[player.curWeapIdx];
                    const firing = (player.shootHold || player.shootStart) && weap.cooldown <= dt;
                    if (!firing) {
                        this._spin += dt * 25;
                        lookDir = v2.create(Math.cos(this._spin), Math.sin(this._spin));
                    }
                }
                player.toMouseLen = dist;
            }
        } else if (this._goal) {
            move = this.followPath(this._goal, dt);
            // punch the crate we walked up to
            const crate = this._crateTarget;
            if (crate && !crate.dead && collider.intersectCircle(crate.collider, player.pos, player.rad + 1.5)) {
                if (player.curWeapIdx !== WeaponSlot.Melee) player.weaponManager.setCurWeapIndex(WeaponSlot.Melee);
                // keep leaning into it so it stays in melee range
                lookDir = v2.normalizeSafe(v2.sub(crate.pos, player.pos));
                player.shootStart = true;
                player.shootHold = true;
            }
        }

        // grenades and airstrikes: get out of the blast first, keep shooting while running
        const escape = this.blastEscape();
        if (escape) {
            move = escape;
            // no finishing that bandage on top of a grenade
            if (player.actionType !== GameConfig.Action.None) player.cancelAction();
        }

        // combat strafing has no path: just sidestep whatever is in the way
        if ((escape || (target && !this._retreat)) && v2.length(move) > 0.01) {
            move = this.steer(v2.normalize(move), dt);
        }

        // still stuck: back off sideways, and give up on a goal we keep failing to reach
        this._stuckTicker += dt;
        if (this._stuckTicker > 0.8) {
            const moved = v2.distance(player.pos, this._stuckCheckPos);
            if (v2.length(move) > 0.1 && moved < 1 && this._unstickTicker <= 0) {
                this._unstickTicker = util.random(0.6, 1.2);
                const side = Math.random() < 0.5 ? 1 : -1;
                this._moveDir = v2.normalize(v2.add(v2.mul(v2.perp(move), side), v2.mul(move, -0.5)));
                this._stuckCount++;
                this._path = undefined;
                if (this._stuckCount >= 3) {
                    this._stuckCount = 0;
                    this._lootTarget = undefined;
                    this._crateTarget = undefined;
                    this._wanderGoal = undefined;
                    this._coverSpot = undefined;
                }
            } else if (moved >= 1) {
                this._stuckCount = 0;
            }
            v2.set(this._stuckCheckPos, player.pos);
            this._stuckTicker = 0;
        }
        if (this._unstickTicker > 0) {
            this._unstickTicker -= dt;
            move = this._moveDir;
        }

        const moving = v2.length(move) > 0.01;
        player.touchMoveActive = true;
        player.touchMoveDir = moving ? v2.normalize(move) : v2.create(1, 0);
        player.touchMoveLen = moving ? 255 : 0;
        if (!moving) {
            player.moveLeft =
                player.moveRight =
                player.moveUp =
                player.moveDown =
                    false;
        }

        if (!lookDir && moving) lookDir = v2.normalize(move);
        if (lookDir) player.dirNew = v2.normalizeSafe(lookDir, player.dir);
    }

    /**
     * Direction toward the next waypoint of an A* path to `goal`, replanned
     * when the goal moves, the path runs out or every couple of seconds.
     */
    private followPath(goal: Vec2, dt: number): Vec2 {
        const player = this.player;
        this._pathTicker -= dt;
        if (
            !this._path?.length
            || !this._pathGoal
            || v2.distance(goal, this._pathGoal) > 2
            || this._pathTicker <= 0
        ) {
            this._pathGoal = v2.copy(goal);
            this._pathTicker = util.random(1.5, 2.5);
            this._path = findPath(this.game, player.pos, goal, player.layer, player.rad);
        }
        const path = this._path;
        if (!path?.length) {
            // no route: drop whatever we were walking to and pick something else next think
            const obj = this._lootTarget ?? this._crateTarget;
            if (obj) this._unreachable.set(obj.__id, 30);
            this._lootTarget = undefined;
            this._crateTarget = undefined;
            this._coverSpot = undefined;
            this._wanderGoal = undefined;
            return this.steer(v2.normalizeSafe(v2.sub(goal, player.pos)), dt);
        }
        while (path.length > 1 && v2.distance(path[0], player.pos) < 1.2) path.shift();
        // the path ends short of the goal (it's walled in): give up on that target for a while
        if (
            path.length === 1 && v2.distance(path[0], player.pos) < 1.2
            && v2.distance(goal, player.pos) > 4 && v2.distance(goal, player.pos) < 30
        ) {
            const obj = this._lootTarget ?? this._crateTarget;
            if (obj) this._unreachable.set(obj.__id, 30);
            this._lootTarget = undefined;
            this._crateTarget = undefined;
            this._coverSpot = undefined;
            this._path = undefined;
            return v2.create(0, 0);
        }
        return v2.normalizeSafe(v2.sub(path[0], player.pos));
    }

    /**
     * Which way to run from live grenades / airstrike zones we're inside of,
     * or undefined when safe. Each threat gets one dodge roll, so a beginner
     * often just stands in it.
     */
    private blastEscape(): Vec2 | undefined {
        const player = this.player;
        let escape: Vec2 | undefined;
        const add = (center: Vec2, rad: number, key: object, own = false) => {
            const dist = v2.distance(player.pos, center);
            if (dist > rad) return;
            let react = this._blastRolls.get(key);
            if (react === undefined) {
                // everyone knows where their own grenade went
                react = own || Math.random() < this.skill.dodge;
                this._blastRolls.set(key, react);
            }
            if (!react) return;
            // closer = more urgent
            const away = v2.mul(v2.normalizeSafe(v2.sub(player.pos, center), v2.randomUnit()), 1 + (rad - dist) / rad);
            escape = escape ? v2.add(escape, away) : away;
        };

        for (const proj of this.game.projectileBarn.projectiles) {
            if (proj.destroyed || !util.sameLayer(proj.layer, player.layer)) continue;
            const def = GameObjectDefs.typeToDefSafe(proj.type);
            if (def?.type !== "throwable") continue;
            const explosion = (def as ThrowableDef).explosionType;
            if (!explosion || explosion.includes("smoke")) continue;
            const rad = (ExplosionDefs[explosion] as { rad?: { max: number } }).rad?.max ?? 8;
            // where it's rolling to, not just where it is
            const landing = v2.add(proj.pos, v2.mul(proj.vel, 0.5));
            add(landing, rad + 2.5, proj, proj.playerId === player.__id);
        }
        for (const zone of this.game.planeBarn.airstrikeZones) {
            add(zone.pos, zone.rad + 3, zone);
        }
        return escape;
    }

    /**
     * Grenades: every so often in a fight, swap to the throwable, aim where
     * the target is heading, cook it for a level-based time, let go, and
     * swap back to the gun. Returns the aim while a throw is underway.
     */
    private updateThrow(dt: number, target: Player): Vec2 | undefined {
        const player = this.player;
        const wm = player.weaponManager;
        if (!this._throw) {
            this._throwCooldown -= dt;
            if (!this.settings.throwables) return undefined;
            if (this._throwCooldown > 0 || this._reactTimer > 0 || player.downed) return undefined;
            if (player.actionType !== GameConfig.Action.None) return undefined;
            const type = player.weapons[WeaponSlot.Throwable].type;
            const def = GameObjectDefs.typeToDefSafe(type) as ThrowableDef | undefined;
            if (def?.type !== "throwable" || !def.explosionType || def.explosionType.includes("smoke")) {
                return undefined;
            }
            if (!player.invManager.isValid(type) || !player.invManager.has(type)) return undefined;
            const dist = v2.distance(target.pos, player.pos);
            if (dist < 10 || dist > MaxThrowDist) return undefined;
            this._throwCooldown = util.random(...this.skill.throwEvery);
            this._throw = {
                prev: player.curWeapIdx,
                timer: 0,
                released: false,
                // a grenade that explodes in hand is no good: always leave flight time
                cook: def.cookable ? Math.min(this.skill.cook * util.random(0.8, 1.1), def.fuseTime - 1.6) : 0,
                error: util.randomPointInCircle(this.skill.throwError),
            };
            wm.setCurWeapIndex(WeaponSlot.Throwable);
        }

        const t = this._throw;
        t.timer += dt;
        const flight = 0.9;
        const lead = this.skill.lead ? v2.mul(this._targetVel, flight) : v2.create(0, 0);
        const aimPos = v2.add(v2.add(target.pos, lead), t.error);
        let toAim = v2.sub(aimPos, player.pos);
        // a sloppy throw can land short, but never at our own feet
        if (v2.length(toAim) < 8) toAim = v2.mul(v2.normalizeSafe(toAim, player.dir), 8);
        player.toMouseLen = math.clamp(
            v2.length(toAim) * ThrowMouseLenPerUnit,
            0,
            GameConfig.player.throwableMaxMouseDist,
        );

        const done = () => {
            this._throw = undefined;
            if (player.weapons[t.prev]?.type && player.curWeapIdx === WeaponSlot.Throwable) wm.setCurWeapIndex(t.prev);
        };
        if (!t.released) {
            if (!wm.cookingThrowable) {
                // keep pressing until the cook starts; give up if it never does
                if (t.timer > 1.5 || player.curWeapIdx !== WeaponSlot.Throwable) {
                    done();
                    return undefined;
                }
                player.shootStart = true;
                player.shootHold = true;
            } else if (wm.cookTicker < Math.max(t.cook, GameConfig.player.cookTime + 0.05)) {
                player.shootHold = true;
            } else {
                // let go: the weapon manager throws on release
                t.released = true;
            }
        } else if (!wm.cookingThrowable || t.timer > t.cook + 3) {
            done();
            return undefined;
        }
        return v2.normalizeSafe(toAim, player.dir);
    }

    /** true when walking `len` units along `dir` would bump into an obstacle */
    private blocked(dir: Vec2, len: number): boolean {
        const player = this.player;
        const side = v2.mul(v2.perp(dir), player.rad * 0.9);
        const starts = [player.pos, v2.add(player.pos, side), v2.sub(player.pos, side)];
        const end = v2.add(player.pos, v2.mul(dir, len));
        const objs = this.game.grid.intersectCollider(collider.createCircle(player.pos, len + player.rad));
        for (const obj of objs) {
            if (obj.__type !== ObjectType.Obstacle) continue;
            // doors swing open when walked into
            if (obj.dead || !obj.collidable || obj.isDoor) continue;
            if (!util.sameLayer(obj.layer, player.layer)) continue;
            for (const a of starts) {
                if (collider.intersectSegment(obj.collider, a, v2.add(a, v2.sub(end, player.pos)))) return true;
            }
        }
        return false;
    }

    /**
     * Picks the direction closest to `desired` that isn't blocked a few
     * units ahead, fanning out to the side it last turned to so it doesn't
     * flip-flop at a wall.
     */
    private steer(desired: Vec2, dt: number): Vec2 {
        this._steerTicker -= dt;
        if (this._steerTicker > 0 && this._steerDesired && v2.dot(this._steerDesired, desired) > 0.98) {
            return this._steerDir;
        }
        this._steerTicker = 0.1;
        this._steerDesired = desired;
        const base = Math.atan2(desired.y, desired.x);
        const s = this._steerSide;
        for (const off of [0, 0.35, 0.7, 1.05, 1.4, 1.75, 2.2, 2.7]) {
            for (const sign of off === 0 ? [1] : [s, -s]) {
                const ang = base + off * sign;
                const dir = v2.create(Math.cos(ang), Math.sin(ang));
                if (!this.blocked(dir, 3.5)) {
                    if (off !== 0) this._steerSide = sign;
                    this._steerDir = dir;
                    return dir;
                }
            }
        }
        this._steerDir = desired;
        return desired;
    }

    /**
     * A spot on the far side of a solid obstacle from `threat`, the way a
     * person ducks behind a tree or rock to heal.
     */
    private findCover(threat: Vec2): Vec2 | undefined {
        const player = this.player;
        let best: Vec2 | undefined;
        let bestDist = 22;
        const objs = this.game.grid.intersectCollider(collider.createCircle(player.pos, bestDist));
        for (const obj of objs) {
            if (obj.__type !== ObjectType.Obstacle) continue;
            if (obj.dead || !obj.collidable || obj.isDoor || obj.height < GameConfig.bullet.height) continue;
            if (!util.sameLayer(obj.layer, player.layer)) continue;
            const c = obj.collider;
            const size = c.type === collider.Type.Circle
                ? c.rad
                : Math.max(c.max.x - c.min.x, c.max.y - c.min.y) / 2;
            if (size < 1.4) continue;
            const center = c.type === collider.Type.Circle ? c.pos : v2.mul(v2.add(c.min, c.max), 0.5);
            const away = v2.normalizeSafe(v2.sub(center, threat));
            const spot = v2.add(center, v2.mul(away, size + player.rad + 0.6));
            if (this.game.gas.isInGas(spot)) continue;
            const dist = v2.distance(spot, player.pos);
            if (dist < bestDist) {
                best = spot;
                bestDist = dist;
            }
        }
        return best;
    }

    /** where danger comes from: the last enemy we saw, else the nearest one alive */
    private threatPos(): Vec2 | undefined {
        if (this._lastThreat && this._sinceThreat < 15) return this._lastThreat;
        let best: Vec2 | undefined;
        let bestDist = Infinity;
        for (const p of this.game.playerBarn.livingPlayers) {
            if (p.teamId === this.player.teamId) continue;
            const d = v2.distance(p.pos, this.player.pos);
            if (d < bestDist) {
                best = p.pos;
                bestDist = d;
            }
        }
        return best;
    }

    /** a dead-on aim for rolled hits, a near miss otherwise */
    private aimAt(target: Player, dist: number, gunDef?: GunDef): Vec2 {
        const player = this.player;
        let aimPos = target.pos;
        if (gunDef && this.skill.lead) {
            const bullet = BulletDefs[gunDef.bulletType];
            const travel = bullet ? dist / bullet.speed : 0;
            aimPos = v2.add(target.pos, v2.mul(this._targetVel, travel));
        }
        const dir = v2.normalizeSafe(v2.sub(aimPos, player.pos));
        if (Math.random() < this.skill.accuracy) {
            this.aimLocked = this.skill.noSpread;
            return dir;
        }
        // miss just wide of the body
        const off = (target.rad + util.random(0.8, 2.5)) * (Math.random() < 0.5 ? -1 : 1);
        return v2.rotate(dir, Math.atan2(off, Math.max(dist, 1)));
    }
}

/**
 * Spawns a bot straight into the game, through the same path a joining client takes.
 * `side` is the private match side; bots on a side join that side's group.
 */
export function addBot(game: Game, level: BotLevel, side?: number): Player {
    const client = new BotClient(game, new NoOpSocket(), null, "");

    const joinMsg = new net.JoinMsg();
    joinMsg.name = randomBotName();
    joinMsg.bot = false;

    let groupHashToJoin = "";
    if (side !== undefined) groupHashToJoin = game.sideGroupHashes.get(side) ?? "";
    const player = game.playerBarn.addPlayer(client, joinMsg, {
        userId: null,
        findGameIp: "",
        // side bots must never autofill into the other side's group
        groupData: { side, autoFill: side === undefined, playerCount: 1, groupHashToJoin },
        bot: true,
    });
    client.player = player;
    const settings = game.config.privateMatch?.botSettings?.[level];
    // the leader's kit for this level replaces whatever the match handed out
    if (settings?.kit) player.applyGodLoadout(settings.kit, true);
    player.botBrain = new BotBrain(player, level, settings);
    return player;
}

/** private match: each bot the leader added, on the side it was put on */
export function addPrivateBots(game: Game, bots: PrivateBot[]) {
    for (const bot of bots) addBot(game, bot.level, bot.team);
}

/** vs bots: teammates join the party's side, the other side is all bots */
export function addVsBots(game: Game, vs: VsBots) {
    for (let i = 0; i < vs.allies; i++) addBot(game, vs.ally, 0);
    for (let i = 0; i < vs.enemies; i++) addBot(game, vs.enemy, 1);
}

/** public games: trickle bots in until the lobby looks alive */
export class BotFiller {
    target = 0;
    private _ticker = 0;

    constructor(readonly game: Game, readonly maxPlayers: number) {}

    start() {
        if (this.target) return;
        // small (duel) games fill every other slot; big ones leave room for real players
        this.target = this.maxPlayers <= 8
            ? this.maxPlayers - 1
            : Math.floor((this.maxPlayers - 4) * util.random(0.6, 0.9));
        // beginners and intermediates, plus one or two advanced at random spots in the order
        // a 1v1 duel would otherwise always be an advanced bot, so small games roll for one
        const advanced = this.maxPlayers <= 8
            ? Math.random() < 0.5 ? 1 : 0
            : Math.min(util.randomInt(1, 2), this.target);
        const order = Array.from({ length: this.target }, (_, i) => i);
        util.shuffleArray(order);
        this._advancedSlots = new Set(order.slice(0, advanced));
    }

    private _advancedSlots = new Set<number>();
    private _added = 0;

    private nextLevel(): BotLevel {
        if (this._advancedSlots.has(this._added++)) return "advanced";
        return Math.random() < 0.5 ? "beginner" : "intermediate";
    }

    update(dt: number) {
        if (!this.target || this.game.over) return;
        this._ticker -= dt;
        if (this._ticker > 0) return;
        this._ticker = util.random(0.1, 0.6);
        // only while people can still join
        if (!this.game.canJoin) return;
        if (this._added >= this.target) return;
        addBot(this.game, this.nextLevel());
    }
}
