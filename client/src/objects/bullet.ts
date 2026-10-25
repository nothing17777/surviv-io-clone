import * as PIXI from "pixi.js-legacy";

import { GameObjectDefs, MapObjectDefs } from "../../../shared/defs/register.ts";
import { GameConfig } from "../../../shared/gameConfig.ts";
import type { Bullet } from "../../../shared/net/updateMsg.ts";
import { coldet } from "../../../shared/utils/coldet.ts";
import { collider } from "../../../shared/utils/collider.ts";
import { math } from "../../../shared/utils/math.ts";
import { util } from "../../../shared/utils/util.ts";
import { v2, type Vec2 } from "../../../shared/utils/v2.ts";
import type { AudioManager } from "../audioManager.ts";
import type { Camera } from "../camera.ts";
import type { Map } from "../map.ts";
import type { Renderer } from "../renderer.ts";
import type { FlareBarn } from "./flare.ts";
import type { ParticleBarn } from "./particles.ts";
import type { Player, PlayerBarn } from "./player.ts";

export function createBullet(
    bullet: Bullet,
    bulletBarn: BulletBarn,
    flareBarn: FlareBarn,
    playerBarn: PlayerBarn,
    renderer: Renderer,
) {
    if (GameObjectDefs.typeToDef(bullet.bulletType, "bullet").addFlare) {
        flareBarn.addFlare(bullet, playerBarn);
    } else {
        bulletBarn.addBullet(bullet, playerBarn, renderer);
    }
}

export function playHitFx(
    particleName: string,
    soundName: string,
    pos: Vec2,
    dir: Vec2,
    layer: number,
    particleBarn: ParticleBarn,
    audioManager: AudioManager,
) {
    const numParticles = Math.floor(util.random(1, 2));
    let vel = v2.mul(dir, 9.5);
    for (let i = 0; i < numParticles; i++) {
        vel = v2.rotate(vel, ((Math.random() - 0.5) * Math.PI) / 3);
        particleBarn.addParticle(particleName, layer, pos, vel);
    }
    audioManager.playGroup(soundName, {
        channel: "hits",
        soundPos: pos,
        layer,
        filter: "muffled",
    });
}
export class BulletBarn {
    bullets: Array<{
        alive: boolean;
        container: PIXI.Container;
        bulletTrail: PIXI.Sprite;
        isNew: boolean;
        collided: boolean;
        scale: number;
        playerId: number;
        bulletType: string;
        pos: Vec2;
        dir: Vec2;
        layer: number;
        speed: number;
        distance: number;
        damageSelf: boolean;
        reflectCount: number;
        reflectObjId: number;
        whizHeard: boolean;
        startPos: Vec2;
        tracerLength: number;
        suppressed: boolean;
        tracerAlphaRate?: number;
        tracerAlphaMin?: number;
        combatStims: boolean;
        particleTicker: number;
        /** the super hacker's shots: hit fx on everything, stopped by nothing */
        pierce: boolean;
        /** a laser-type custom weapon's shot: pierces like the super hacker's but only flies its range */
        defPierce: boolean;
        homingId: number;
        /** Terra Blade / Heavy Sniper: through players, stopped by walls */
        playerPierce: boolean;
        /** Zenith: flies out, then back to the shooter */
        boomerang: boolean;
        returning: boolean;
        /** Zenith's loop at the far point, as on the server */
        orbit?: { radius: number; turns: number };
        orbitT: number;
        orbitCenter: Vec2;
        orbitAng: number;
        traveled: number;
        /** lasers: the trail runs all the way back to the muzzle */
        beam: boolean;
        /** custom weapons' projectile image (cat, star, orb...) */
        fxSprite: PIXI.Sprite;
        flame: boolean;
        whip: boolean;
        whipFrom: Vec2;
        whipTex: PIXI.Texture | null;
        fxSize: number;
        fxSpin: number;
    }> = [];

    tracerColors = {} as typeof GameConfig["tracerColors"];

    onMapLoad(map: Map) {
        this.tracerColors = util.mergeDeep<typeof GameConfig["tracerColors"]>(
            {},
            GameConfig.tracerColors,
            map.getMapDef().biome.tracerColors,
        );
    }

    addBullet(bullet: Bullet, playerBarn: PlayerBarn, renderer: Renderer) {
        let b: (typeof this.bullets)[number] | null = null;

        for (let i = 0; i < this.bullets.length; i++) {
            if (!this.bullets[i].alive && !this.bullets[i].collided) {
                b = this.bullets[i];
                break;
            }
        }

        if (!b) {
            b = {} as (typeof this.bullets)[number];
            b.alive = false;
            b.container = new PIXI.Container();
            b.container.pivot.set(14.5, 0);
            b.container.visible = false;
            b.bulletTrail = PIXI.Sprite.from("player-bullet-trail-02.img");
            b.bulletTrail.anchor.set(0.5, 0.5);
            b.container.addChild(b.bulletTrail);
            b.fxSprite = new PIXI.Sprite();
            b.whipTex = null;
            b.fxSprite.anchor.set(0.5, 0.5);
            b.fxSprite.visible = false;
            this.bullets.push(b);
        }

        const bulletDef = GameObjectDefs.typeToDef(bullet.bulletType, "bullet");

        const variance = 1 + bullet.varianceT * bulletDef.variance;
        const distAdj = math.remap(bullet.distAdjIdx, 0, 16, -1, 1);
        let distance = bulletDef.distance
            / Math.pow(GameConfig.bullet.reflectDistDecay, bullet.reflectCount);
        if (bullet.clipDistance) {
            distance = bullet.distance;
        }
        b.alive = true;
        b.isNew = true;
        b.collided = false;
        b.scale = 1;
        b.playerId = bullet.playerId;
        b.bulletType = bullet.bulletType;
        b.startPos = v2.copy(bullet.pos);
        b.pos = v2.copy(bullet.pos);
        b.dir = v2.copy(bullet.dir);
        b.layer = bullet.layer;
        b.speed = bulletDef.speed * bullet.speedMult * variance;
        b.distance = distance * bullet.distanceMult * variance + distAdj;
        b.damageSelf = bulletDef.shrapnel || bullet.reflectCount > 0;
        b.reflectCount = bullet.reflectCount;
        b.reflectObjId = bullet.reflectObjId;
        b.whizHeard = false;
        b.combatStims = bullet.combatStims;
        b.pierce = bullet.pierce;
        b.defPierce = !!bulletDef.pierce;
        b.playerPierce = !!bulletDef.playerPierce;
        b.boomerang = !!bulletDef.boomerang;
        b.returning = false;
        b.orbit = bulletDef.orbit;
        b.orbitT = -1;
        b.traveled = 0;
        b.beam = !!bulletDef.beam;
        const fxImg = bulletDef.sprites ? util.randomItem(bulletDef.sprites) : bulletDef.sprite;
        b.fxSprite.visible = !!fxImg;
        if (fxImg) {
            b.fxSprite.texture = PIXI.Texture.from(fxImg);
            b.fxSprite.rotation = 0;
            b.fxSize = bulletDef.spriteSize ?? 2;
            b.fxSpin = bulletDef.spin ?? 0;
        }
        b.flame = !!bulletDef.flame;
        b.whip = !!bulletDef.whip;
        b.whipFrom = v2.copy(bullet.pos);
        if (b.whip) {
            // a long strip of the whip's links with the tip at its right end; render shows as much as is out
            if (!b.whipTex) {
                const base = PIXI.BaseTexture.from("img/custom-weapons/fx/whip_strip.png");
                base.scaleMode = PIXI.SCALE_MODES.NEAREST;
                b.whipTex = new PIXI.Texture(base, new PIXI.Rectangle(0, 0, 1, whipStripHeight));
            }
            b.fxSprite.texture = b.whipTex;
            b.fxSprite.visible = true;
            b.fxSprite.anchor.set(1, 0.5);
        } else {
            b.fxSprite.anchor.set(0.5, 0.5);
        }
        b.fxSprite.alpha = 1;
        if (b.flame) {
            b.fxSprite.rotation = util.random(0, Math.PI * 2);
            b.fxSpin = util.random(-6, 6);
        }
        b.homingId = bullet.homingId;
        b.particleTicker = util.random(0.05, 0.15);

        const angleRadians = Math.atan2(b.dir.x, b.dir.y);
        b.container.rotation = angleRadians - Math.PI / 2;

        b.layer = bullet.layer;
        const player = playerBarn.getPlayerById(b.playerId);
        if (player && player.layer & 2) {
            b.layer |= 2;
        }

        // Set default scale.x to standard working length of 0.8
        let tracerWidth = bulletDef.tracerWidth;
        if (bullet.trailSmall) {
            tracerWidth *= 0.5;
        }
        if (bullet.trailThick) {
            tracerWidth *= 2;
        }
        b.bulletTrail.scale.set(0.8, tracerWidth);
        b.tracerLength = bulletDef.tracerLength;
        b.suppressed = !!bulletDef.suppressed;

        // Use saturated color if the player is on a bright surface
        const tracerColors = this.tracerColors[bulletDef.tracerColor];
        let tracerTint = tracerColors.regular;
        if (bullet.apRounds && tracerColors.apSaturated) {
            tracerTint = tracerColors.apSaturated;
        } else if (bullet.trailSaturated) {
            tracerTint = tracerColors.chambered || tracerColors.saturated;
        } else if (player?.surface?.data.isBright) {
            tracerTint = tracerColors.saturated;
        }
        b.bulletTrail.tint = tracerTint;
        b.tracerAlphaRate = tracerColors.alphaRate;
        b.tracerAlphaMin = tracerColors.alphaMin;
        b.bulletTrail.alpha = 1;
        if (b.reflectCount > 0) {
            b.bulletTrail.alpha *= 0.5;
        }
        b.container.visible = !b.flame && !b.whip && !bulletDef.noTracer;
        renderer.addPIXIObj(b.container, b.layer, 20);
        if (fxImg) renderer.addPIXIObj(b.fxSprite, b.layer, 21);
    }

    m_update(
        dt: number,
        playerBarn: PlayerBarn,
        map: Map,
        camera: Camera,
        activePlayer: Player,
        renderer: Renderer,
        particleBarn: ParticleBarn,
        audioManager: AudioManager,
    ) {
        const players = playerBarn.playerPool.m_getPool();
        for (let i = 0; i < this.bullets.length; i++) {
            const b = this.bullets[i];
            if (b.collided) {
                b.fxSprite.visible = false;
                // beams fade out where they are instead of shrinking into the hit point
                if (b.beam) {
                    b.bulletTrail.alpha = math.max(b.bulletTrail.alpha - dt * 5, 0);
                    if (b.bulletTrail.alpha <= 0) b.scale = 0;
                } else {
                    b.scale = math.max(b.scale - dt * 6, 0);
                }
                if (b.scale <= 0) {
                    b.collided = false;
                    b.container.visible = false;
                }
            }
            if (b.alive) {
                // Zenith's swords swirl in loops at the far point, like on the server
                if (b.orbit && !b.returning && (b.orbitT >= 0 || b.traveled >= b.distance / 2)) {
                    const r = b.orbit.radius;
                    const w = b.speed / r;
                    if (b.orbitT < 0) {
                        b.orbitT = 0;
                        b.homingId = 0;
                        b.orbitCenter = v2.add(b.pos, v2.mul(v2.perp(b.dir), r));
                        b.orbitAng = Math.atan2(b.pos.y - b.orbitCenter.y, b.pos.x - b.orbitCenter.x);
                    }
                    b.orbitT += dt;
                    b.orbitAng += w * dt;
                    const next = v2.add(b.orbitCenter, v2.mul(v2.create(Math.cos(b.orbitAng), Math.sin(b.orbitAng)), r));
                    b.dir = v2.normalizeSafe(v2.sub(next, b.pos), b.dir);
                    b.container.rotation = Math.atan2(b.dir.x, b.dir.y) - Math.PI / 2;
                    b.pos = next;
                    if (b.orbitT * w >= b.orbit.turns * Math.PI * 2) b.returning = true;
                    continue;
                }
                // Zenith's swords turn back halfway, like on the server
                if (b.boomerang) {
                    if (!b.orbit && !b.returning && b.traveled >= b.distance / 2) {
                        b.returning = true;
                        b.homingId = 0;
                    }
                    if (b.returning) {
                        const owner = playerBarn.getPlayerById(b.playerId);
                        if (!owner || owner.m_netData.m_dead || v2.length(v2.sub(owner.m_pos, b.pos)) < 1.5) {
                            b.alive = false;
                            b.container.visible = false;
                            b.fxSprite.visible = false;
                            continue;
                        }
                        b.dir = v2.normalizeSafe(v2.sub(owner.m_pos, b.pos), b.dir);
                        b.container.rotation = Math.atan2(b.dir.x, b.dir.y) - Math.PI / 2;
                    }
                }
                // the super hacker's shot curves toward its target, like on the server
                if (b.homingId) {
                    const target = playerBarn.getPlayerById(b.homingId);
                    if (!target || target.m_netData.m_dead) {
                        b.homingId = 0;
                        // the super hacker's shots end; magic ones fly on straight
                        if (b.pierce && !b.defPierce) {
                            b.alive = false;
                            b.fxSprite.visible = false;
                        }
                    } else {
                        b.dir = v2.normalizeSafe(v2.sub(target.m_pos, b.pos), b.dir);
                        const ang = Math.atan2(b.dir.x, b.dir.y);
                        b.container.rotation = ang - Math.PI / 2;
                    }
                }
                // the Judge's rocket turns toward where its owner aims, like on the server
                if (b.bulletType === "bullet_pg_judge") {
                    const owner = playerBarn.getPlayerById(b.playerId);
                    if (owner && !owner.m_netData.m_dead) {
                        b.dir = v2.normalizeSafe(v2.lerp(math.min(dt * 4, 1), b.dir, owner.m_dir), b.dir);
                        b.container.rotation = Math.atan2(b.dir.x, b.dir.y) - Math.PI / 2;
                    }
                }
                const distLeft = b.boomerang || b.bulletType === "bullet_pg_judge"
                    ? b.distance - b.traveled
                    : b.distance - v2.length(v2.sub(b.startPos, b.pos));
                const distTravel = math.min(distLeft, dt * b.speed);
                b.traveled += distTravel;
                const posOld = v2.copy(b.pos);
                b.pos = v2.add(b.pos, v2.mul(b.dir, distTravel));

                if (b.whip) {
                    const owner = playerBarn.getPlayerById(b.playerId);
                    if (owner) b.whipFrom = v2.copy(owner.m_pos);
                }
                b.particleTicker += dt;
                // flames leave a trail of overlapping puffs, so a held trigger reads as one stream of fire
                if (b.flame && b.particleTicker >= 0.012) {
                    b.particleTicker = 0;
                    const particle = particleBarn.addParticle(
                        "flame_puff",
                        b.layer,
                        v2.lerp(Math.random(), posOld, b.pos),
                        v2.mul(b.dir, b.speed * 0.15),
                    );
                    particle.setColor(b.bulletTrail.tint as number);
                }
                if (b.combatStims && b.particleTicker >= 0.15) {
                    const particle = particleBarn.addParticle(
                        "boost_basic",
                        b.layer,
                        b.pos,
                        b.dir,
                    );
                    particle.setColor(PIXI.Color.shared.setValue(b.bulletTrail.tint).toNumber());
                    b.particleTicker = util.random(0, 0.1); // Done to make the particles for shotguns less periodic and more continuous
                }

                if (
                    !activePlayer.m_netData.m_dead
                    && util.sameAudioLayer(activePlayer.layer, b.layer)
                    && v2.length(v2.sub(camera.m_pos, b.pos)) < 7.5
                    && !b.whizHeard
                    && b.playerId != activePlayer.__id
                ) {
                    audioManager.playGroup("bullet_whiz", {
                        soundPos: b.pos,
                        fallOff: 4,
                    });
                    b.whizHeard = true;
                }

                // Trail alpha
                if (b.tracerAlphaRate && b.suppressed) {
                    const rate = b.tracerAlphaRate;
                    b.bulletTrail.alpha = math.max(
                        b.tracerAlphaMin!,
                        b.bulletTrail.alpha * rate,
                    );
                }

                // Gather colliding obstacles and players
                const colObjs: Array<{
                    type: string;
                    obstacleType?: string;
                    collidable: boolean;
                    point: Vec2;
                    normal: Vec2;
                    dist?: number;
                    player?: Player;
                    layer?: number;
                }> = [];

                // Obstacles
                const obstacles = map.m_obstaclePool.m_getPool();
                // the super hacker's shots go through every obstacle: skip testing all of them each frame
                for (let j = 0; j < (b.pierce ? 0 : obstacles.length); j++) {
                    const obstacle = obstacles[j];
                    if (
                        !!obstacle.active
                        && !obstacle.dead
                        && !!util.sameLayer(obstacle.layer, b.layer)
                        && obstacle.height >= GameConfig.bullet.height
                        && (b.reflectCount <= 0 || obstacle.__id != b.reflectObjId)
                    ) {
                        const res = collider.intersectSegment(
                            obstacle.collider,
                            posOld,
                            b.pos,
                        );
                        if (res) {
                            colObjs.push({
                                type: "obstacle",
                                obstacleType: obstacle.type,
                                collidable: obstacle.collidable,
                                point: res.point,
                                normal: res.normal,
                            });
                        }
                    }
                }
                for (let j = 0; j < players.length; j++) {
                    const player = players[j];
                    if (
                        player.active
                        && !player.m_netData.m_dead
                        && (util.sameLayer(player.m_netData.m_layer, b.layer)
                            || player.m_netData.m_layer & 2
                            || b.pierce)
                        && (player.__id != b.playerId || b.damageSelf)
                    ) {
                        let panCollision = null;
                        if (player.m_hasActivePan()) {
                            const panSeg = player.m_getPanSegment()!;
                            const oldSegment = math.transformSegment(
                                panSeg.p0,
                                panSeg.p1,
                                player.m_posOld,
                                player.m_dirOld,
                            );
                            const newSegment = math.transformSegment(
                                panSeg.p0,
                                panSeg.p1,
                                player.m_pos,
                                player.m_dir,
                            );
                            const newIntersection = coldet.intersectSegmentSegment(
                                posOld,
                                b.pos,
                                oldSegment.p0,
                                oldSegment.p1,
                            );
                            const oldIntersection = coldet.intersectSegmentSegment(
                                posOld,
                                b.pos,
                                newSegment.p0,
                                newSegment.p1,
                            );
                            const finalIntersection = oldIntersection || newIntersection;
                            if (finalIntersection) {
                                const normal = v2.normalize(
                                    v2.perp(v2.sub(newSegment.p1, newSegment.p0)),
                                );
                                panCollision = {
                                    point: finalIntersection.point,
                                    normal: normal,
                                };
                            }
                        }
                        const collision = coldet.intersectSegmentCircle(
                            posOld,
                            b.pos,
                            player.m_pos,
                            player.m_rad,
                        );
                        if (
                            collision
                            && (!panCollision
                                || v2.length(v2.sub(collision.point, b.startPos))
                                    < v2.length(v2.sub(panCollision.point, b.startPos)))
                        ) {
                            colObjs.push({
                                type: "player",
                                player,
                                point: collision.point,
                                normal: collision.normal,
                                layer: player.layer,
                                collidable: true,
                            });
                            if (player.m_hasPerk("steelskin")) {
                                colObjs.push({
                                    type: "pan",
                                    point: v2.add(
                                        collision.point,
                                        v2.mul(collision.normal, 0.1),
                                    ),
                                    normal: collision.normal,
                                    layer: player.layer,
                                    collidable: false,
                                });
                            }
                        } else if (panCollision) {
                            colObjs.push({
                                type: "pan",
                                point: panCollision.point,
                                normal: panCollision.normal,
                                layer: player.layer,
                                collidable: true,
                            });
                        }
                        if (collision || panCollision) {
                            break;
                        }
                    }
                }

                for (let j = 0; j < colObjs.length; j++) {
                    const col = colObjs[j];
                    col.dist = v2.length(v2.sub(col.point, posOld));
                }

                colObjs.sort((a, b) => {
                    return a.dist! - b.dist!;
                });

                let shooterDead = false;
                const shooter = playerBarn.getPlayerById(b.playerId);
                if (shooter && (shooter.m_netData.m_dead || shooter.m_netData.m_downed)) {
                    shooterDead = true;
                }
                let hit = false;
                for (let j = 0; j < colObjs.length; j++) {
                    const col = colObjs[j];
                    if (col.type == "obstacle") {
                        const mapDef = MapObjectDefs.typeToDef(col.obstacleType!, "obstacle");
                        playHitFx(
                            mapDef.hitParticle,
                            mapDef.sound.bullet!,
                            col.point,
                            col.normal,
                            b.layer,
                            particleBarn,
                            audioManager,
                        );

                        // Continue travelling if non-collidable
                        hit = col.collidable && !b.pierce;
                    } else if (col.type == "player") {
                        // Don't create a hit particle if the shooting
                        // player is dead; this helps avoid confusion around
                        // bullets being inactivated when a player dies.
                        if (!shooterDead) {
                            const collidedPlayer = col.player!;
                            if (map.turkeyMode && shooter?.m_hasPerk("turkey_shoot")) {
                                const vel = v2.randomUnit(util.random(3, 6));
                                particleBarn.addParticle(
                                    "turkeyFeathersHit",
                                    collidedPlayer.layer,
                                    collidedPlayer.m_pos,
                                    vel,
                                );
                            }
                            const diff = v2.sub(col.point, collidedPlayer?.m_pos);
                            diff.y *= -1;
                            particleBarn.addParticle(
                                "bloodSplat",
                                collidedPlayer.layer,
                                v2.mul(diff, camera.m_ppu),
                                v2.create(0, 0),
                                1,
                                1,
                                collidedPlayer.container,
                            );
                            audioManager.playGroup("player_bullet_hit", {
                                soundPos: collidedPlayer.m_pos,
                                fallOff: 1,
                                layer: collidedPlayer.layer,
                                filter: "muffled",
                            });
                        }
                        hit = col.collidable && !b.pierce && !b.playerPierce;
                        // through its target: it ends there, like on the server
                        if (b.pierce && !b.boomerang && col.player?.__id === b.homingId) {
                            b.homingId = 0;
                            hit = true;
                        }
                    } else if (col.type == "pan") {
                        playHitFx(
                            "barrelChip",
                            GameObjectDefs.typeToDef("pan", "melee").sound.bullet!,
                            col.point,
                            col.normal,
                            col.layer!,
                            particleBarn,
                            audioManager,
                        );
                        hit = col.collidable && !b.pierce;
                    }
                    if (hit) {
                        b.pos = col.point;
                        break;
                    }
                }
                if (!(b.layer & 2)) {
                    const structures = map.m_structurePool.m_getPool();
                    let targetLayer = b.layer;
                    for (let j = 0; j < structures.length; j++) {
                        const struct = structures[j];
                        if (struct.active) {
                            let onStair = false;
                            let onMask = false;
                            for (let k = 0; k < struct.stairs.length; k++) {
                                const stair = struct.stairs[k];
                                if (
                                    !stair?.lootOnly
                                    && collider.intersectSegment(
                                        stair?.collision,
                                        b.pos,
                                        posOld,
                                    )
                                ) {
                                    onStair = true;
                                    break;
                                }
                            }
                            for (let k = 0; k < struct.mask.length; k++) {
                                if (
                                    collider.intersectSegment(struct.mask[k], b.pos, posOld)
                                ) {
                                    onMask = true;
                                    break;
                                }
                            }
                            if (onStair && !onMask) {
                                targetLayer |= 2;
                            }
                        }
                    }
                    if (targetLayer != b.layer) {
                        b.layer = targetLayer;
                        renderer.addPIXIObj(b.container, b.layer, 20);
                    }
                }
                if (hit || math.eqAbs(distLeft, distTravel)) {
                    b.collided = true;
                    b.alive = false;
                }
                b.isNew = false;
            }
        }
    }

    createBulletHit(
        playerBarn: PlayerBarn,
        targetId: number,
        audioManager: AudioManager,
    ) {
        const player = playerBarn.getPlayerById(targetId);
        if (player) {
            audioManager.playGroup("player_bullet_hit", {
                soundPos: player.m_pos,
                fallOff: 1,
                layer: player.layer,
                filter: "muffled",
            });
        }
    }

    m_render(camera: Camera) {
        for (let i = 0; i < this.bullets.length; i++) {
            const b = this.bullets[i];
            if (b.alive || b.collided) {
                const dist = v2.length(v2.sub(b.pos, b.startPos));
                const screenPos = camera.m_pointToScreen(b.pos);
                b.container.position.set(screenPos.x, screenPos.y);
                const screenScale = camera.m_pixels(1);
                // a beam reaches back to where it was fired; Zenith's turning swords keep a short trail
                const trailLength = b.beam ? dist / 2 : math.min(b.tracerLength * 15, (b.boomerang ? b.traveled : dist) / 2);
                // a flame's trail is a short wide glow under its puff, growing as it burns out
                const flameT = b.flame ? math.clamp(dist / Math.max(b.distance, 1), 0, 1) : 0;
                b.container.scale.set(
                    screenScale * (b.flame ? 1.2 + 1.8 * flameT : trailLength) * b.scale,
                    screenScale * (b.flame ? 2 + 4 * flameT : 1),
                );
                if (b.flame) b.bulletTrail.alpha = 1 - flameT * 0.8;
                if (b.fxSprite.visible) {
                    const tex = b.fxSprite.texture;
                    b.fxSprite.position.set(screenPos.x, screenPos.y);
                    let s = camera.m_pixels(b.fxSize) / Math.max(tex.width, 1);
                    if (b.flame) {
                        // starts as a tight burst at the muzzle and billows out as it burns away
                        const t = math.clamp(dist / Math.max(b.distance, 1), 0, 1);
                        s *= 0.35 + 1.65 * Math.sqrt(t);
                        b.fxSprite.alpha = (1 - t ** 1.6 * 0.9) * (b.collided ? b.scale : 1);
                    }
                    b.fxSprite.scale.set(s, s);
                    if (b.whip && b.whipTex) {
                        // wait for the strip to load: a frame can't be set on an empty texture
                        b.fxSprite.alpha = b.whipTex.baseTexture.valid ? 1 : 0;
                        if (!b.whipTex.baseTexture.valid) continue;
                        // tip at the shot, reaching back to the hand: show that much of the strip's right end
                        const from = camera.m_pointToScreen(b.whipFrom);
                        const dx = screenPos.x - from.x;
                        const dy = screenPos.y - from.y;
                        const k = camera.m_pixels(2.4) / whipStripHeight;
                        const w = math.clamp(Math.hypot(dx, dy) / k, 1, whipStripWidth);
                        b.whipTex.frame = new PIXI.Rectangle(whipStripWidth - w, 0, w, whipStripHeight);
                        b.whipTex.updateUvs();
                        b.fxSprite.scale.set(k, k);
                        b.fxSprite.rotation = Math.atan2(dy, dx);
                        continue;
                    }
                    b.fxSprite.rotation = b.fxSpin
                        ? b.fxSprite.rotation + b.fxSpin * 0.016
                        : b.container.rotation;
                }
            }
        }
    }
}


/** whip_strip.png: the Spinal Tap's handle, 120 links and tip, 18px tall */
const whipStripWidth = 1727;
const whipStripHeight = 18;
