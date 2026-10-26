import { PerkProperties } from "../../../../shared/defs/gameObjects/perkDefs.ts";
import { GameObjectDefs, MapObjectDefs } from "../../../../shared/defs/register.ts";
import { type DamageType, GameConfig } from "../../../../shared/gameConfig.ts";
import { Constants } from "../../../../shared/net/net.ts";
import { ObjectType } from "../../../../shared/net/objectSerializeFns.ts";
import { coldet } from "../../../../shared/utils/coldet.ts";
import { collider } from "../../../../shared/utils/collider.ts";
import { math } from "../../../../shared/utils/math.ts";
import { util } from "../../../../shared/utils/util.ts";
import { v2, type Vec2 } from "../../../../shared/utils/v2.ts";
import type { Game } from "../game.ts";
import type { DamageParams, GameObject } from "./gameObject.ts";
import type { Obstacle } from "./obstacle.ts";
import type { Player } from "./player.ts";

// NOTE: most of this code was copied from surviv client and bit heroes arena client
// to get bullet collision the most accurate possible

interface BulletCollision {
    type: "obstacle" | "player" | "pan";
    obj?: Player | Obstacle;
    obstacleType?: string;
    collidable: boolean;
    point: Vec2;
    normal: Vec2;
    dist: number;
    player?: Player;
    layer?: number;
}

export interface BulletParams {
    bulletType: string;
    gameSourceType: string;
    mapSourceType?: string;
    pos: Vec2;
    dir: Vec2;
    layer: number;
    damageMult: number;
    damageType: DamageType;
    shotFx?: boolean;
    shotOffhand?: boolean;
    lastShot?: boolean;
    splinter?: boolean;
    apRounds?: boolean;
    highVelocity?: boolean;
    combatStims?: boolean;
    shotAlt?: boolean;
    trailSaturated?: boolean;
    trailSmall?: boolean;
    trailThick?: boolean;
    varianceT?: number;
    playerId: number;
    reflectCount?: number;
    reflectObjId?: number;
    onHitFx?: string;
    clipDistance?: boolean;
    distance?: number;
    hasModifier?: boolean;
    speedMult?: number;
    distanceMult?: number;
}

export class BulletBarn {
    bullets: Bullet[] = [];
    newBullets: Bullet[] = [];

    constructor(public game: Game) {}

    damages: Array<DamageParams & { obj: GameObject }> = [];

    /** dark matter vortexes: an explosion that keeps going off where the shot hit */
    lingering: Array<{
        explosion: string;
        duration: number;
        interval: number;
        next: number;
        pos: Vec2;
        layer: number;
        source?: Player;
        gameSourceType: string;
    }> = [];

    update(dt: number): void {
        for (let i = this.lingering.length - 1; i >= 0; i--) {
            const l = this.lingering[i];
            l.duration -= dt;
            l.next -= dt;
            if (l.next <= 0) {
                l.next += l.interval;
                this.game.explosionBarn.addExplosion(l.explosion, l.pos, l.layer, {
                    source: l.source,
                    gameSourceType: l.gameSourceType,
                    weaponSourceType: l.gameSourceType,
                    damageType: GameConfig.DamageType.Player,
                });
            }
            if (l.duration <= 0) this.lingering.splice(i, 1);
        }

        let activeCount = 0;
        for (let i = 0; i < this.bullets.length; i++) {
            const bullet = this.bullets[i];
            if (bullet.active) {
                bullet.update(dt);
                activeCount++;
            }
        }

        for (let i = 0; i < this.damages.length; i++) {
            const damageRecord = this.damages[i];
            damageRecord.obj.damage(damageRecord);
        }
        this.damages.length = 0;

        // free some bullets if pool is too big
        if (this.bullets.length > 512 && activeCount < this.bullets.length / 2) {
            this.bullets = this.bullets.filter((b) => b.active);
        }

        // console.log("allocated:", this.bullets.length, "active:", activeCount)
    }

    flush(): void {
        for (let i = 0; i < this.newBullets.length; i++) {
            this.newBullets[i].sentToClient = true;
        }
        this.newBullets.length = 0;
    }

    fireBullet(params: BulletParams): Bullet {
        this.game.map.clampToMapBounds(params.pos);

        // sentToClient check to make sure bullets that are created and die immediately
        // go through a net-tick first, so their data is not overwritten by the init call
        let bullet = this.bullets.find((b) => !b.active && b.sentToClient);
        if (!bullet) {
            bullet = new Bullet(this);
            this.bullets.push(bullet);
        }
        bullet.init(params);

        this.newBullets.push(bullet);

        const bulletDef = GameObjectDefs.typeToDef(params.bulletType, "bullet");
        if (bulletDef.addFlare) {
            this.game.planeBarn.addAirdrop(params.pos);
        }

        return bullet;
    }
}

export class Bullet {
    alive = false;
    active = false;

    distanceTraveled!: number;
    sentToClient!: boolean;
    collided!: boolean;
    playerId!: number;
    player?: Player;
    pos!: Vec2;
    endPos!: Vec2;
    clientEndPos!: Vec2;
    dir!: Vec2;
    bulletType!: string;
    layer!: number;
    varianceT!: number;
    distAdjIdx!: number;
    clipDistance!: boolean;
    distance!: number;
    maxDistance!: number;
    shotFx!: boolean;
    shotSourceType!: string;
    mapSourceType!: string;
    shotOffhand!: boolean;
    lastShot!: boolean;
    reflectCount!: number;
    reflectObjId!: number;
    hasSpecialFx!: boolean;
    shotAlt!: boolean;
    splinter!: boolean;
    apRounds!: boolean;
    highVelocity!: boolean;
    combatStims!: boolean;
    trailSaturated!: boolean;
    trailSmall!: boolean;
    trailThick!: boolean;
    startPos!: Vec2;
    speed!: number;
    damageSelf!: boolean;
    damage!: number;
    damageMult!: number;
    obstacleDamageMult!: number;
    falloff!: number;
    hasModifier!: boolean;
    speedMult!: number;
    distanceMult!: number;
    onHitFx?: string;
    hasOnHitFx!: boolean;
    damageType!: DamageType;
    isShrapnel!: boolean;
    skipCollision!: boolean;
    reflected!: boolean;
    /** fired by the super hacker (dev_nothing): one-shots, pierces everything, crosses the map */
    devShot!: boolean;

    /** the super hacker's target: the shot bends toward wherever they are now, until it hits them */
    homingId = 0;

    /** sent to clients so they draw it going through things too */
    get pierce(): boolean {
        return this.devShot || this.defPierce;
    }

    /** laser-style shots from custom weapons go through players and obstacles */
    defPierce = false;

    /** Meowmere's cats bounce off every obstacle */
    bounce = false;

    /** Terra Blade / Heavy Sniper shots go through players, losing some damage on each */
    playerPierce = false;

    /** Zenith's swords fly out, then back to the shooter */
    boomerang = false;
    returning = false;
    canReflect!: boolean;
    damagedObjIds!: Set<number>;

    constructor(public bulletManager: BulletBarn) {}

    init(params: BulletParams) {
        this.alive = true;
        this.active = true;
        this.collided = false;
        this.distanceTraveled = 0;
        this.sentToClient = false;
        // this.serialized = false; // TODO: cache bullet serialization?

        const bulletDef = GameObjectDefs.typeToDef(params.bulletType, "bullet");

        const variance = 1 + (params.varianceT ?? 1) * bulletDef.variance;

        this.layer = params.layer;
        this.pos = v2.copy(params.pos);
        this.dir = v2.normalize(params.dir);
        this.playerId = params.playerId;
        this.startPos = v2.copy(params.pos);
        this.bulletType = params.bulletType;
        this.reflectCount = params.reflectCount ?? 0;
        this.reflectObjId = params.reflectObjId ?? 0;
        this.reflected = false;
        this.lastShot = params.lastShot ?? false;
        this.speedMult = params.speedMult ?? 1;
        this.speed = bulletDef.speed * this.speedMult * variance;
        this.hasModifier = this.speedMult !== 1 || this.distanceMult !== 1;
        this.onHitFx = bulletDef.onHit ?? params.onHitFx;
        // flames burn out on walls instead of bouncing off metal
        this.canReflect = this.onHitFx !== "explosion_rounds" && !bulletDef.flame;
        this.damagedObjIds = new Set();

        this.hasOnHitFx = !!this.onHitFx;

        const player = this.bulletManager.game.objectRegister.getById(this.playerId);
        if (player?.__type === ObjectType.Player) {
            this.player = player;
        } else {
            this.player = undefined;
        }

        // Add random jitter to the bullet distance. This makes spray patterns
        // for low spread, high rate-of-fire guns like the vector look better.
        //
        // Don't apply the jitter on shotguns as they have inherent jitter
        // due to how the player computes the shot start position.
        const distAdjIdxMax = 16;
        const distAdjIdx = !bulletDef.noDistAdj
            ? util.randomInt(0, distAdjIdxMax)
            : distAdjIdxMax / 2;
        const distAdj = math.remap(distAdjIdx, 0, distAdjIdxMax, -1.0, 1.0);

        this.devShot = this.player?.botBrain?.level === "super_hacker";
        this.defPierce = !!bulletDef.pierce;
        this.bounce = !!bulletDef.bounce;
        this.playerPierce = !!bulletDef.playerPierce;
        this.boomerang = !!bulletDef.boomerang;
        this.returning = false;
        this.homingId = bulletDef.homing && this.reflectCount === 0 ? this.findHomingTarget(params.pos, this.dir) : 0;
        let distance = bulletDef.distance
            / Math.pow(GameConfig.bullet.reflectDistDecay, this.reflectCount);
        if (this.devShot) {
            distance = Constants.MaxPosition;
            this.homingId = this.player?.botBrain?.target?.__id ?? 0;
        }
        if (params.clipDistance) {
            distance = math.min(
                bulletDef.distance * (params.distanceMult ?? 1),
                params.distance!,
            );
            // we don't want it to be multiplied twice
            params.distanceMult = 1;
        }

        this.shotSourceType = params.gameSourceType;
        this.mapSourceType = params.mapSourceType ?? "";
        this.damageType = params.damageType;
        this.damageMult = params.damageMult;
        this.shotFx = params.shotFx ?? false;
        this.shotOffhand = params.shotOffhand ?? false;
        this.shotAlt = params.shotAlt ?? false;
        this.splinter = params.splinter ?? false;
        this.apRounds = params.apRounds ?? false;
        this.highVelocity = params.highVelocity ?? false;
        this.combatStims = params.combatStims ?? false;
        this.trailSaturated = params.trailSaturated ?? false;
        this.trailSmall = params.trailSmall ?? false;
        this.trailThick = params.trailThick ?? false;
        this.varianceT = params.varianceT ?? 1;
        this.distAdjIdx = distAdjIdx;
        this.distanceMult = params.distanceMult ?? 1;
        this.distance = this.maxDistance = math.clamp(
            distance * this.distanceMult * variance + distAdj,
            0,
            Constants.MaxPosition,
        );
        // the client works out range from the gun unless told; tell it for the super hacker's map-wide shots
        this.clipDistance = !!params.clipDistance || this.devShot;
        this.endPos = v2.add(params.pos, v2.mul(this.dir, this.distance));
        this.clientEndPos = v2.copy(this.endPos);
        this.damage = bulletDef.damage * this.damageMult;
        this.skipCollision = !!bulletDef.skipCollision;
        this.isShrapnel = bulletDef.shrapnel;
        this.falloff = bulletDef.falloff;
        this.obstacleDamageMult = bulletDef.obstacleDamage;

        this.damageSelf = this.reflectCount > 0 || this.isShrapnel;
        this.hasSpecialFx = this.shotAlt
            || this.splinter
            || this.apRounds
            || this.highVelocity
            || this.combatStims
            || this.trailSaturated
            || this.trailSmall
            || this.trailThick;

        const nearbyObjs = this.bulletManager.game.grid.intersectLineSegment(
            this.pos,
            this.endPos,
        );
        const colIds: Array<{
            obj: Obstacle;
            pos: Vec2;
            nrm: Vec2;
            dist: number;
        }> = [];

        for (let i = 0; i < nearbyObjs.length; i++) {
            const obj = nearbyObjs[i] as Obstacle;

            if (
                obj.__type !== ObjectType.Obstacle
                || obj.dead
                || obj.height < GameConfig.bullet.height
                || !util.sameLayer(obj.layer, this.layer)
                || obj.__id === this.reflectObjId
            ) {
                continue;
            }

            const res = collider.intersectSegment(obj.collider, this.pos, this.endPos);

            if (res) {
                const dist = v2.lengthSqr(v2.sub(res.point, this.pos));
                colIds.push({
                    obj,
                    pos: res.point,
                    nrm: res.normal,
                    dist,
                });
            }
        }

        colIds.sort((a, b) => a.dist - b.dist);

        // Clamp end pos to the map boundaries if the bullet
        // has an onHit effect
        if (this.hasOnHitFx) {
            const res = coldet.intersectSegmentAabb2(
                this.startPos,
                this.endPos,
                this.bulletManager.game.map.bounds.min,
                this.bulletManager.game.map.bounds.max,
            );
            if (res) {
                const dist = v2.length(v2.sub(res.point, this.startPos));
                this.endPos = res.point;
                this.clientEndPos = res.point;
                this.distance = dist;
                this.maxDistance = dist;
                this.clipDistance = true;
            }
        }

        // Store furthest possible travel distance to
        // an indestructible obstacle for the client.
        let maxDistance = this.distance;
        for (let i = 0; i < colIds.length && !this.devShot; i++) {
            const col = colIds[i];
            const obj = col.obj;
            if (obj && !obj.destructible) {
                maxDistance = Math.sqrt(col.dist);
                break;
            }
        }
        this.clientEndPos = v2.add(this.startPos, v2.mul(this.dir, maxDistance));
    }

    update(dt: number): void {
        // Zenith: halfway out it turns and flies back to the shooter, able to hit everyone again
        if (this.boomerang) {
            if (!this.returning && this.distanceTraveled >= this.distance / 2) {
                this.returning = true;
                this.homingId = 0;
                this.damagedObjIds.clear();
            }
            if (this.returning) {
                const owner = this.player;
                if (!owner || owner.dead || v2.length(v2.sub(owner.pos, this.pos)) < 1.5) {
                    this.alive = false;
                    this.active = false;
                    return;
                }
                this.dir = v2.normalizeSafe(v2.sub(owner.pos, this.pos), this.dir);
            }
        }
        // super hacker: bend toward the target's current spot; once it's through them (or they're gone), fly straight
        if (this.homingId) {
            const target = this.bulletManager.game.objectRegister.getById(this.homingId);
            if (
                !this.devShot
                && (target?.__type !== ObjectType.Player || target.dead || this.damagedObjIds.has(this.homingId))
            ) {
                // magic shots lose their target and fly straight on
                this.homingId = 0;
            } else if (target?.__type !== ObjectType.Player || target.dead || this.damagedObjIds.has(this.homingId)) {
                // done with it: end here instead of flying on across the map (hundreds of these lag clients)
                this.homingId = 0;
                this.alive = false;
                this.active = false;
                return;
            } else {
                this.dir = v2.normalizeSafe(v2.sub(target.pos, this.pos), this.dir);
            }
        }
        if (this.bulletType === "bullet_pg_judge") {
            const player = this.player;
            if (player && !player.dead) {
                player.activeJudgeRocket = this;
                // the camera follows the rocket, so the player's aim is from the rocket to the cursor;
                // turn toward it (the client does the same with the player's networked dir)
                this.dir = v2.normalizeSafe(v2.lerp(math.min(dt * 4, 1), this.dir, player.dir), this.dir);
                this.endPos = v2.add(this.pos, v2.mul(this.dir, this.distance - this.distanceTraveled));
            }
        }
        const posOld = v2.copy(this.pos);
        // a steered rocket counts the path it flew, not the straight line back
        const distLeft = this.boomerang || this.bulletType === "bullet_pg_judge"
            ? this.distance - this.distanceTraveled
            : this.distance - v2.length(v2.sub(this.startPos, this.pos));
        const moveDist = math.min(distLeft, dt * this.speed);
        this.distanceTraveled += moveDist;

        v2.set(this.pos, v2.add(this.pos, v2.mul(this.dir, moveDist)));

        const map = this.bulletManager.game.map;
        if (!coldet.testPointAabb(this.pos, map.bounds.min, map.bounds.max)) {
            this.alive = false;
            map.clampToMapBounds(this.pos);
        }

        this.checkForCollisions(posOld);

        // Check if bullet has reached the maximun distance
        if (math.eqAbs(this.distanceTraveled, this.distance, 0.001)) {
            this.alive = false;
            // Explosive rounds peter out
            if (this.onHitFx === "explosion_rounds") {
                this.onHitFx = "";
            }
        }

        if (!this.alive && !this.reflected && this.onHitFx) {
            const def = GameObjectDefs.typeToDef(this.bulletType, "bullet");
            // explosion_rounds_sg has lower volume and is used for shotguns
            // since they spawn a bunch of explosions at once
            if (this.onHitFx === "explosion_rounds" && def.useExplosiveRoundsAlt) {
                this.onHitFx = "explosion_rounds_sg";
            }
            if (def.linger) {
                this.bulletManager.lingering.push({
                    ...def.linger,
                    pos: v2.sub(this.pos, v2.mul(this.dir, 0.1)),
                    layer: this.layer,
                    next: def.linger.interval,
                    source: this.player,
                    gameSourceType: this.shotSourceType,
                });
            }
            this.bulletManager.game.explosionBarn.addExplosion(
                this.onHitFx,
                // spawn the explosion a bit behind the bullet so it won't spawn inside obstacles
                v2.sub(this.pos, v2.mul(this.dir, 0.1)),
                this.layer,
                {
                    source: this.player,
                    gameSourceType: this.shotSourceType,
                    weaponSourceType: this.shotSourceType,
                    mapSourceType: this.mapSourceType,
                    damageType: this.damageType,
                },
                this.dir,
            );
        }

        // set active at the end of the update because:
        // new bullets may be created inside this update call from the `reflect` method
        // so if we check for alive instead of active, the new bullet may be the one we are
        // currently updating
        if (!this.alive) {
            this.active = false;
        }
    }

    checkForCollisions(posOld: Vec2): void {
        if (this.skipCollision) return;

        const collisions: BulletCollision[] = [];

        const objects = this.bulletManager.game.grid.intersectLineSegment(
            posOld,
            this.pos,
        );

        for (let i = 0; i < objects.length; i++) {
            const obj = objects[i];

            if (obj.__type === ObjectType.Obstacle) {
                if (
                    obj.dead
                    || !util.sameLayer(obj.layer, this.layer)
                    || obj.height < GameConfig.bullet.height
                    || obj.__id === this.reflectObjId
                ) {
                    continue;
                }

                const res = collider.intersectSegment(obj.collider, posOld, this.pos);
                if (res) {
                    collisions.push({
                        type: "obstacle",
                        obj: obj,
                        obstacleType: obj.type,
                        collidable: obj.collidable,
                        point: res.point,
                        normal: res.normal,
                        dist: v2.lengthSqr(v2.sub(res.point, this.startPos)),
                    });
                }
            } else if (obj.__type === ObjectType.Player) {
                if (
                    !(
                        !obj.dead
                        // the super hacker's shots reach into bunkers and up from them too
                        && (util.sameLayer(obj.layer, this.layer) || 2 & obj.layer || this.devShot)
                        && (obj.__id !== this.playerId || this.damageSelf)
                        && obj.__id !== this.reflectObjId
                    )
                ) {
                    continue;
                }

                if (
                    obj.hasPerk("windwalk")
                    && obj.hasteType != GameConfig.HasteType.Windwalk // can't stack windwalk
                    && v2.distance(this.pos, obj.pos) <= PerkProperties.windwalk.maxTriggerDistance
                    && this.player?.teamId !== obj.teamId // bullet shooter or its teammates cant give the shooter winwalk
                ) {
                    obj.giveHaste(GameConfig.HasteType.Windwalk, PerkProperties.windwalk.hasteDuration);
                }

                let panCollision = null;
                if (obj.hasActivePan()) {
                    const p = obj;
                    const panSeg = p.getPanSegment()!;
                    const oldSegment = math.transformSegment(
                        panSeg.p0,
                        panSeg.p1,
                        p.posOld,
                        p.dirOld,
                    );
                    const newSegment = math.transformSegment(
                        panSeg.p0,
                        panSeg.p1,
                        p.pos,
                        p.dir,
                    );
                    const newIntersection = coldet.intersectSegmentSegment(
                        posOld,
                        this.pos,
                        oldSegment.p0,
                        oldSegment.p1,
                    );
                    const oldIntersection = coldet.intersectSegmentSegment(
                        posOld,
                        this.pos,
                        newSegment.p0,
                        newSegment.p1,
                    );
                    const finalIntersection = oldIntersection || newIntersection;
                    if (finalIntersection) {
                        const segment = newIntersection ? newSegment : oldSegment;
                        const normal = v2.normalize(
                            v2.perp(v2.sub(segment.p1, segment.p0)),
                        );
                        panCollision = {
                            point: v2.add(
                                finalIntersection.point,
                                v2.mul(v2.neg(this.dir), 0.2),
                            ),
                            normal: normal,
                        };
                    }
                }
                const collision = coldet.intersectSegmentCircle(
                    posOld,
                    this.pos,
                    obj.pos,
                    obj.rad,
                );
                if (
                    collision
                    && !obj.botBrain?.dodgeBullet(this)
                    && (!panCollision
                        || v2.lengthSqr(v2.sub(collision.point, this.startPos))
                            < v2.lengthSqr(v2.sub(panCollision.point, this.startPos)))
                ) {
                    collisions.push({
                        type: "player",
                        player: obj,
                        point: collision.point,
                        normal: collision.normal,
                        layer: obj.layer,
                        collidable: true,
                        dist: v2.lengthSqr(v2.sub(collision.point, this.startPos)),
                    });
                    if (obj.hasPerk("steelskin")) {
                        const point = v2.add(
                            collision.point,
                            v2.mul(collision.normal, 0.1),
                        );
                        collisions.push({
                            type: "pan",
                            point,
                            normal: collision.normal,
                            layer: obj.layer,
                            collidable: false,
                            obj: obj,
                            dist: v2.lengthSqr(v2.sub(point, this.startPos)),
                        });
                    }
                } else if (panCollision) {
                    collisions.push({
                        type: "pan",
                        point: panCollision.point,
                        normal: panCollision.normal,
                        layer: obj.layer,
                        collidable: true,
                        dist: v2.lengthSqr(v2.sub(panCollision.point, this.startPos)),
                    });
                }
            }
        }

        if (!collisions.length) return;

        collisions.sort((a, b) => {
            return a.dist - b.dist;
        });

        let shooterDead = false;
        const player = this.player;
        if (player && (player.dead || player.downed)) {
            shooterDead = true;
        }
        let hit = false;

        let finalDamage = this.damage;
        finalDamage *= 1 / (this.reflectCount + 1);

        if (GameConfig.bullet.falloff) {
            const distT = math.clamp(this.distanceTraveled / this.distance, 0, 1);
            const falloff = math.remap(distT, 0, 1, 1, this.falloff);
            finalDamage *= falloff;
        }

        for (let i = 0; i < collisions.length; i++) {
            const col = collisions[i];

            if (col.obj) {
                if (this.damagedObjIds.has(col.obj.__id)) continue;

                this.damagedObjIds.add(col.obj.__id);
            }

            if (col.type == "obstacle") {
                const mapDef = MapObjectDefs.typeToDef(col.obstacleType!, "obstacle");

                // AP Obstacle Multiplier Buff
                let obstacleMult = this.obstacleDamageMult;
                if (this.apRounds) {
                    obstacleMult *= PerkProperties.ap_rounds.obstacleMult;
                }

                this.bulletManager.damages.push({
                    obj: col.obj!,
                    gameSourceType: this.shotSourceType,
                    weaponSourceType: this.shotSourceType,
                    mapSourceType: this.mapSourceType,
                    damageType: this.damageType,
                    source: this.player,
                    amount: finalDamage * obstacleMult,
                    dir: this.dir,
                });

                if ((mapDef.reflectBullets || (this.bounce && col.collidable)) && !this.pierce) {
                    this.reflect(col.point, col.normal, col.obj!.__id);
                }

                // Continue travelling if non-collidable
                hit = col.collidable && !this.pierce;
            } else if (col.type == "player") {
                if (!shooterDead) {
                    const isHighValueTarget = this.player?.hasPerk("targeting") && col.player!.perks.length;

                    let multiplier = 1;
                    if (isHighValueTarget) {
                        multiplier *= PerkProperties.targeting.damageMult;
                    }

                    this.bulletManager.damages.push({
                        obj: col.player!,
                        gameSourceType: this.shotSourceType,
                        weaponSourceType: this.shotSourceType,
                        mapSourceType: this.mapSourceType,
                        source: this.player,
                        damageType: this.damageType,
                        // the super hacker's shots go through any armor and health
                        amount: this.devShot ? 10000 : multiplier * finalDamage,
                        dir: this.dir,
                        isExplosion: this.isShrapnel,
                        armorPenetration: this.devShot
                            ? 1
                            : this.apRounds
                            ? PerkProperties.ap_rounds.armorPenetration
                            : undefined,
                    });
                }
                hit = col.collidable && !this.pierce;
                // a homing shot that pierces still ends in its target
                if (this.defPierce && !this.boomerang && col.player?.__id === this.homingId) hit = true;
                // going through players costs damage
                if (this.playerPierce) {
                    hit = false;
                    this.damage *= 1 - (GameObjectDefs.typeToDef(this.bulletType, "bullet").pierceLoss ?? 0);
                }
            } else if (col.type == "pan") {
                // pans don't stop the super hacker either
                if (this.devShot) continue;
                hit = col.collidable;
                this.reflect(col.point, col.normal, col.obj?.__id ?? 0);
            }
            if (hit) {
                this.pos = col.point;
                // custom explosive shots go off on the player they hit, so the blast can't miss them
                if (col.type == "player" && this.onHitFx?.startsWith("explosion_cw")) this.pos = v2.copy(col.player!.pos);
                this.alive = false;
                break;
            }
        }
    }

    /** nearest living enemy ahead of the shooter, for homing (magic) shots */
    findHomingTarget(pos: Vec2, dir: Vec2): number {
        let best = 0;
        // as far as the shot can fly, so long range shots home too
        let bestDist = Math.max(GameObjectDefs.typeToDef(this.bulletType, "bullet").distance, 70);
        for (const p of this.bulletManager.game.playerBarn.livingPlayers) {
            if (p.__id === this.playerId || (this.player && p.teamId === this.player.teamId)) continue;
            if (!util.sameLayer(p.layer, this.layer)) continue;
            const to = v2.sub(p.pos, pos);
            const dist = v2.length(to);
            // only things roughly where the shooter is aiming
            // anyone in front of the shooter (a ~140 degree cone), not just right on the aim line
            if (dist >= bestDist || v2.dot(v2.normalizeSafe(to, dir), dir) < 0.35) continue;
            best = p.__id;
            bestDist = dist;
        }
        return best;
    }

    reflect(pos: Vec2, normal: Vec2, objId: number) {
        if (!this.canReflect) return;
        const def = GameObjectDefs.typeToDef(this.bulletType, "bullet");
        if (this.reflectCount >= (def.maxBounces ?? GameConfig.bullet.maxReflect)) return;
        if (this.reflected) return;
        this.reflected = true;

        // Meowmere: a bigger rainbow blast at each bounce
        if (def.bounceExplosions) {
            const n = Math.min(this.reflectCount, def.bounceExplosions.length - 1);
            this.bulletManager.game.explosionBarn.addExplosion(def.bounceExplosions[n], v2.copy(pos), this.layer, {
                source: this.player,
                gameSourceType: this.shotSourceType,
                weaponSourceType: this.shotSourceType,
                mapSourceType: this.mapSourceType,
                damageType: this.damageType,
            });
        }

        const dot = v2.dot(this.dir, normal);
        const dir = v2.add(v2.mul(normal, dot * -2), this.dir);

        let distance = this.distance;
        if (this.clipDistance) {
            distance = math.max(1, this.distance - this.distanceTraveled)
                / Math.pow(GameConfig.bullet.reflectDistDecay, this.reflectCount);
        }

        this.bulletManager.fireBullet({
            bulletType: this.bulletType,
            gameSourceType: this.shotSourceType,
            mapSourceType: this.mapSourceType,
            pos,
            dir,
            layer: this.layer,
            hasModifier: this.hasModifier,
            damageMult: this.damageMult,
            speedMult: this.speedMult,
            distanceMult: this.distanceMult,
            shotFx: false,
            reflectCount: this.reflectCount + 1,
            reflectObjId: objId,
            playerId: this.playerId,
            damageType: this.damageType,
            shotAlt: this.shotAlt,
            splinter: this.splinter,
            apRounds: this.apRounds,
            highVelocity: this.highVelocity,
            combatStims: this.combatStims,
            trailSaturated: this.trailSaturated,
            trailSmall: this.trailSmall,
            trailThick: this.trailThick,
            onHitFx: this.onHitFx,
            varianceT: this.varianceT,
            clipDistance: this.clipDistance,
            distance: distance,
        });
    }
}
