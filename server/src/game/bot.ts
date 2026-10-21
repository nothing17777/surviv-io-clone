import { BulletDefs } from "../../../shared/defs/gameObjects/bulletDefs.ts";
import type { GunDef } from "../../../shared/defs/gameObjects/gunDefs.ts";
import { GameObjectDefs, MapObjectDefs } from "../../../shared/defs/register.ts";
import { GameConfig, type InventoryItem, WeaponSlot } from "../../../shared/gameConfig.ts";
import * as net from "../../../shared/net/net.ts";
import { ObjectType } from "../../../shared/net/objectSerializeFns.ts";
import { type BotCounts, type BotLevel, BotLevels, type VsBots } from "../../../shared/types/api.ts";
import { collider } from "../../../shared/utils/collider.ts";
import { math } from "../../../shared/utils/math.ts";
import { util } from "../../../shared/utils/util.ts";
import { v2, type Vec2 } from "../../../shared/utils/v2.ts";
import { Client } from "./client.ts";
import type { Game } from "./game.ts";
import type { Bullet } from "./objects/bullet.ts";
import type { Loot } from "./objects/loot.ts";
import type { Obstacle } from "./objects/obstacle.ts";
import type { Player } from "./objects/player.ts";
import { NoOpSocket } from "./socket.ts";

interface BotSkill {
    /** chance each shot is aimed dead on the target */
    accuracy: number;
    /** chance each bullet that would hit is dodged */
    dodge: number;
    /** seconds before reacting to a newly seen enemy */
    reaction: number;
    /** spins while fighting, snapping to the target only on the shot */
    spin: boolean;
    /** swaps guns right after a slow shot to skip the fire delay */
    quickSwitch: boolean;
    /** seconds between strafe direction changes */
    strafeTime: [number, number];
}

const Skills: Record<BotLevel, BotSkill> = {
    beginner: { accuracy: 0.6, dodge: 0.6, reaction: 0.55, spin: false, quickSwitch: false, strafeTime: [0.9, 1.8] },
    intermediate: {
        accuracy: 0.7,
        dodge: 0.7,
        reaction: 0.35,
        spin: false,
        quickSwitch: false,
        strafeTime: [0.6, 1.3],
    },
    advanced: { accuracy: 0.9, dodge: 0.9, reaction: 0.2, spin: false, quickSwitch: true, strafeTime: [0.35, 0.9] },
    hacker: { accuracy: 1, dodge: 1, reaction: 0, spin: true, quickSwitch: true, strafeTime: [0.2, 0.6] },
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
    private _dodgeClearTicker = 0;
    /** set for the shot fired this tick when it was rolled as a hit */
    aimLocked = false;

    constructor(readonly player: Player, readonly level: BotLevel) {
        this.skill = Skills[level];
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
            this.pickCombatWeapon();
            return;
        }

        this.outOfCombat();
    }

    private outOfCombat() {
        const player = this.player;
        const gas = this.game.gas;

        // the zone always wins
        if (gas.isInGas(player.pos) || v2.distance(player.pos, gas.posNew) > gas.radNew * 0.95) {
            this._goal = v2.copy(gas.posNew);
            this._lootTarget = undefined;
            return;
        }

        // heal up while nobody is around
        if (player.actionType === GameConfig.Action.None) {
            if (player.health < 75) {
                const heal = this.pickHeal();
                if (heal) {
                    player.useHealingItem(heal);
                    return;
                }
            }
            if (player.boost < 50) {
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

        // loot
        if (!this._lootTarget || this._lootTarget.destroyed || !this.wantsLoot(this._lootTarget)) {
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
        if (!this.hasGunWithAmmo()) {
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

    private pickCombatWeapon() {
        const player = this.player;
        const cur = player.curWeapIdx;
        if (GunSlots.includes(cur) && this.gunHasAmmo(cur)) {
            // still loaded, or reloading with nothing better to swap to
            const other = cur === WeaponSlot.Primary ? WeaponSlot.Secondary : WeaponSlot.Primary;
            if (player.weapons[cur].ammo > 0 || !(player.weapons[other].ammo > 0 && this.gunHasAmmo(other))) {
                return;
            }
            player.weaponManager.setCurWeapIndex(other);
            return;
        }
        const slot = GunSlots.find((s) => this.player.weapons[s].ammo > 0)
            ?? GunSlots.find((s) => this.gunHasAmmo(s))
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
            if (obj.__type !== ObjectType.Loot || obj.destroyed) continue;
            const dist = v2.distance(obj.pos, player.pos);
            if (dist >= bestDist) continue;
            if (this.game.gas.isInGas(obj.pos)) continue;
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
            if (!util.sameLayer(obj.layer, player.layer)) continue;
            const def = MapObjectDefs.typeToDef(obj.type, "obstacle");
            // crates, barrels and the like; stones take forever to punch
            if (!def.loot?.length || def.health > 150) continue;
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
            const prefDist = !gunDef ? 0 : isShotgun ? 7 : 16;

            // strafe sideways and hold the preferred range
            this._strafeTicker -= dt;
            if (this._strafeTicker <= 0) {
                this._strafeTicker = util.random(...this.skill.strafeTime);
                this._strafeSign = Math.random() < 0.5 ? -1 : 1;
            }
            const strafe = v2.mul(v2.perp(dirTo), this._strafeSign);
            let approach = 0;
            if (dist > prefDist + 4) approach = 1;
            else if (dist < prefDist - 4) approach = -1;
            move = v2.add(strafe, v2.mul(dirTo, approach * 1.2));
            if (!gunDef) move = dirTo; // melee: just rush

            // don't fight in the gas
            if (this.game.gas.isInGas(player.pos)) {
                move = v2.add(move, v2.mul(v2.normalizeSafe(v2.sub(this.game.gas.posNew, player.pos)), 2));
            }

            const aim = this.aimAt(target, dist, gunDef);
            lookDir = aim;

            this._reactTimer -= dt;
            const canShoot = this._reactTimer <= 0 && player.actionType !== GameConfig.Action.Revive;
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
                        if (player.weapons[other].ammo > 0) player.weaponManager.setCurWeapIndex(other);
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
        } else if (this._goal) {
            move = v2.normalizeSafe(v2.sub(this._goal, player.pos));
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

        // stuck on a wall: walk off in a random direction for a moment
        this._stuckTicker += dt;
        if (this._stuckTicker > 0.8) {
            const moved = v2.distance(player.pos, this._stuckCheckPos);
            if (v2.length(move) > 0.1 && moved < 1 && this._unstickTicker <= 0) {
                this._unstickTicker = util.random(0.5, 1.2);
                this._moveDir = v2.randomUnit();
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

    /** a dead-on aim for rolled hits, a near miss otherwise */
    private aimAt(target: Player, dist: number, gunDef?: GunDef): Vec2 {
        const player = this.player;
        let aimPos = target.pos;
        if (gunDef) {
            const bullet = BulletDefs[gunDef.bulletType];
            const travel = bullet ? dist / bullet.speed : 0;
            aimPos = v2.add(target.pos, v2.mul(this._targetVel, travel));
        }
        const dir = v2.normalizeSafe(v2.sub(aimPos, player.pos));
        if (Math.random() < this.skill.accuracy) {
            this.aimLocked = true;
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
    player.botBrain = new BotBrain(player, level);
    return player;
}

/** private match: the leader's exact mix, split across the two sides */
export function addPrivateBots(game: Game, counts: BotCounts) {
    const levels: BotLevel[] = [];
    for (const level of BotLevels) {
        for (let i = 0; i < (counts[level] ?? 0); i++) levels.push(level);
    }
    util.shuffleArray(levels);
    for (const level of levels) {
        // fill whichever side is smaller
        let side: number | undefined;
        if (game.duelRules && game.isTeamMode) {
            const a = game.playerBarn.players.filter((p) => p.privateSide === 0).length;
            const b = game.playerBarn.players.filter((p) => p.privateSide === 1).length;
            side = a <= b ? 0 : 1;
        } else if (game.duelRules) {
            side = Math.random() < 0.5 ? 0 : 1;
        }
        const bot = addBot(game, level, side);
        bot.privateSide = side;
    }
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
