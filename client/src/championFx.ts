import * as PIXI from "pixi.js-legacy";
import { math } from "../../shared/utils/math.ts";
import { util } from "../../shared/utils/util.ts";
import { v2, type Vec2 } from "../../shared/utils/v2.ts";
import type { Camera } from "./camera.ts";
import type { Renderer } from "./renderer.ts";

/**
 * League champions' ability effects, rebuilt from their in-game particle systems
 * (DATA/Characters/<Champ>/Skins/Skin0 VfxSystemDefinitionData): each emitter becomes a layer of
 * sprites with the same texture, drawn additively like League does, at the cast, on the projectile,
 * behind it as a trail, and where it lands. Textures come from scripts/genLolChampionFx.py.
 */

const champFx = (file: string) => `img/champions/fx/${file}.png`;

interface Layer {
    tex: string;
    /** world units */
    size: number;
    life: number;
    count?: number;
    /** start/end size multipliers and alphas over its life */
    scale?: [number, number];
    alpha?: [number, number];
    /** turns per second */
    spin?: number;
    randomRot?: boolean;
    /** random distance from the spawn point */
    spread?: number;
    /** random outward speed, world units per second */
    speed?: [number, number];
    /** pick one cell of an n x n flipbook */
    flipbook?: number;
    /** drawn stretched along the direction: length / width */
    stretch?: number;
    /** behind the projectile, in world units (for boosters, trails) */
    back?: number;
    /** seconds before it appears */
    delay?: number;
    /** League draws glows additively; meshes and smoke normally */
    normal?: boolean;
    /** under players (scorch marks, ground glows) */
    ground?: boolean;
    /** flickers to a random angle every frame (lightning) */
    flicker?: boolean;
}

interface ProjectileFx {
    /** follow the projectile */
    head?: Layer[];
    /** spawned behind it every `every` seconds */
    trail?: { every: number; layers: Layer[] };
    /** where it lands */
    hit?: Layer[];
}

/** Jinx's W and R, from Jinx_Base_W_Cas / _W_Beam / _W_Mis / _W_Tar and Jinx_Base_R_Cas / _R_Mis / _R_Booster */
const ProjectileFxDefs: Record<string, ProjectileFx> = {
    bullet_champ_jinx_w: {
        head: [
            { tex: champFx("jinx/jinx_base_w_glow"), size: 6, life: 0, alpha: [0.9, 0.9] },
            { tex: champFx("jinx/jinx_lightning"), size: 4.5, life: 0, flicker: true },
            { tex: champFx("jinx/jinx_base_w_mis_bullet_rgb"), size: 1.4, life: 0, stretch: 6 },
            { tex: champFx("jinx/jinx_base_w_mis_groundlight"), size: 7, life: 0, ground: true, alpha: [0.6, 0.6] },
        ],
        trail: {
            every: 0.015,
            layers: [
                {
                    tex: champFx("jinx/jinx_base_w_blade_trail"),
                    size: 1.6,
                    life: 0.25,
                    stretch: 3,
                    alpha: [0.9, 0],
                    scale: [1, 0.4],
                },
                {
                    tex: champFx("jinx/jinx_base_w_sparks"),
                    size: 1.2,
                    life: 0.35,
                    spread: 0.8,
                    speed: [2, 6],
                    randomRot: true,
                    alpha: [1, 0],
                },
            ],
        },
        hit: [
            { tex: champFx("jinx/jinx_base_w_mis_flash"), size: 9, life: 0.25, scale: [0.6, 1.4], alpha: [1, 0] },
            { tex: champFx("jinx/jinx_lightning"), size: 7, life: 0.35, flicker: true, alpha: [1, 0] },
            {
                tex: champFx("jinx/jinx_w_hit_rgb"),
                size: 5,
                life: 0.3,
                scale: [0.5, 1.5],
                alpha: [1, 0],
                randomRot: true,
            },
            {
                tex: champFx("jinx/jinx_base_w_tar_sparks"),
                size: 1.4,
                life: 0.5,
                count: 10,
                speed: [8, 18],
                randomRot: true,
                alpha: [1, 0],
                scale: [1, 0.3],
            },
        ],
    },
    bullet_champ_jinx_r: {
        head: [
            { tex: champFx("jinx/jinx_r_shape"), size: 9, life: 0, ground: true, alpha: [0.5, 0.5] },
            {
                tex: champFx("jinx/jinx_base_r_rocketfire_revision"),
                size: 5,
                life: 0,
                back: 4.5,
                stretch: 1.6,
                flicker: true,
            },
            { tex: champFx("jinx/jinx_muzzle_flash"), size: 3.5, life: 0, back: 4, flicker: true },
            // the rocket itself: Jinx_R_Mis.scb with its texture, rendered top down
            { tex: champFx("jinx/jinx_r_mis_mesh"), size: 8, life: 0, normal: true },
        ],
        trail: {
            every: 0.03,
            layers: [
                {
                    tex: champFx("jinx/jinx_base_r_groundsmoke02"),
                    size: 4,
                    life: 0.9,
                    back: 4.5,
                    spread: 0.6,
                    scale: [0.6, 2.2],
                    alpha: [0.7, 0],
                    randomRot: true,
                    normal: true,
                },
                {
                    tex: champFx("jinx/jinx_base_r_mis_addsmoke"),
                    size: 3,
                    life: 0.4,
                    back: 4.5,
                    scale: [0.8, 1.6],
                    alpha: [0.8, 0],
                    randomRot: true,
                },
            ],
        },
        hit: [
            { tex: champFx("jinx/jinx_r_scorch"), size: 16, life: 3, ground: true, normal: true, alpha: [0.9, 0] },
            { tex: champFx("jinx/jinx_base_r_tar_groundcracks"), size: 14, life: 2.5, ground: true, alpha: [1, 0] },
            { tex: champFx("jinx/jinx_base_r_tar_firering"), size: 18, life: 0.6, scale: [0.3, 1.3], alpha: [1, 0] },
            {
                tex: champFx("jinx/jinx_base_r_tar_circlefire"),
                size: 14,
                life: 0.7,
                scale: [0.4, 1.1],
                alpha: [1, 0],
                spin: 0.3,
            },
            {
                tex: champFx("jinx/jinx_explosion_flat"),
                size: 12,
                life: 0.7,
                flipbook: 2,
                count: 4,
                spread: 3,
                scale: [0.5, 1.3],
                alpha: [1, 0],
                randomRot: true,
            },
            {
                tex: champFx("jinx/jinx_base_r_tar_firecloud"),
                size: 14,
                life: 1.1,
                scale: [0.6, 1.4],
                alpha: [0.9, 0],
                randomRot: true,
                normal: true,
            },
            {
                tex: champFx("jinx/jinx_base_r_tar_sparks"),
                size: 2,
                life: 0.8,
                count: 14,
                speed: [10, 26],
                randomRot: true,
                alpha: [1, 0],
                scale: [1, 0.3],
            },
        ],
    },
};

/** what plays at a cast, by champion and key; dir is where the champion faces */
const CastFxDefs: Record<string, Layer[]> = {
    // W's windup: the aiming beam for the 0.4 s before Zap! fires, then the muzzle flash
    jinx_w: [
        {
            tex: champFx("jinx/jinx_base_w_beam_reticle_rgb"),
            size: 2.2,
            life: 0.4,
            stretch: 40,
            back: -45,
            alpha: [0.2, 1],
            ground: true,
        },
        {
            tex: champFx("jinx/jinx_base_w_beam_glow_rgb"),
            size: 3.5,
            life: 0.4,
            stretch: 26,
            back: -45,
            alpha: [0, 0.8],
            ground: true,
        },
        {
            tex: champFx("jinx/jinx_base_w_cas_flash"),
            size: 6,
            life: 0.25,
            delay: 0.4,
            back: -2,
            scale: [0.6, 1.3],
            alpha: [1, 0],
        },
    ],
    jinx_r: [
        { tex: champFx("jinx/jinx_muzzle_flash"), size: 7, life: 0.3, back: -2.5, scale: [0.5, 1.5], alpha: [1, 0] },
        {
            tex: champFx("jinx/jinx_explosion_smoke"),
            size: 6,
            life: 1,
            back: -1.5,
            count: 3,
            spread: 1.5,
            speed: [1, 3],
            scale: [0.6, 1.6],
            alpha: [0.8, 0],
            randomRot: true,
            normal: true,
        },
    ],
};

interface Particle {
    sprite: PIXI.Sprite;
    layer: Layer;
    pos: Vec2;
    vel: Vec2;
    dir: Vec2;
    t: number;
    delay: number;
    rot: number;
    zLayer: number;
    /** follows a projectile until it lands */
    follow?: TrackedShot;
}

interface TrackedShot {
    shot: { alive: boolean; pos: Vec2; dir: Vec2; layer: number };
    fx: ProjectileFx;
    trailTicker: number;
    pos: Vec2;
    done: boolean;
}

class ChampionFxBarn {
    renderer?: Renderer;
    particles: Particle[] = [];
    pool: PIXI.Sprite[] = [];
    shots: TrackedShot[] = [];

    init(renderer: Renderer) {
        this.renderer = renderer;
    }

    hasProjectileFx(bulletType: string) {
        return !!ProjectileFxDefs[bulletType];
    }

    /** a champion's ability shot just appeared */
    trackShot(shot: TrackedShot["shot"], bulletType: string) {
        const fx = ProjectileFxDefs[bulletType];
        if (!fx) return;
        const tracked: TrackedShot = { shot, fx, trailTicker: 0, pos: v2.copy(shot.pos), done: false };
        this.shots.push(tracked);
        for (const layer of fx.head ?? []) this.spawn(layer, shot.pos, shot.dir, shot.layer, tracked);
    }

    /** the cast effect for champion + key (q, w, e, r) */
    cast(champion: string, key: string, pos: Vec2, dir: Vec2, layer: number) {
        for (const l of CastFxDefs[`${champion}_${key}`] ?? []) this.spawnAll(l, pos, dir, layer);
    }

    spawnAll(layer: Layer, pos: Vec2, dir: Vec2, zLayer: number) {
        for (let i = 0; i < (layer.count ?? 1); i++) this.spawn(layer, pos, dir, zLayer);
    }

    spawn(layer: Layer, pos: Vec2, dir: Vec2, zLayer: number, follow?: TrackedShot) {
        if (!this.renderer) return;
        const sprite = this.pool.pop() ?? new PIXI.Sprite();
        sprite.texture = PIXI.Texture.from(layer.tex);
        sprite.anchor.set(0.5, 0.5);
        sprite.blendMode = layer.normal ? PIXI.BLEND_MODES.NORMAL : PIXI.BLEND_MODES.ADD;
        sprite.visible = false;
        if (layer.flipbook) {
            // one random cell of the flipbook, as League picks a frame
            const base = PIXI.Texture.from(layer.tex).baseTexture;
            const n = layer.flipbook;
            const cell = Math.floor(Math.random() * n * n);
            const w = base.width / n;
            const h = base.height / n;
            if (base.valid) {
                sprite.texture = new PIXI.Texture(
                    base,
                    new PIXI.Rectangle((cell % n) * w, Math.floor(cell / n) * h, w, h),
                );
            }
        }
        const a = Math.random() * Math.PI * 2;
        const off = layer.spread
            ? v2.mul(v2.create(Math.cos(a), Math.sin(a)), Math.random() * layer.spread)
            : v2.create(0, 0);
        const speed = layer.speed ? util.random(layer.speed[0], layer.speed[1]) : 0;
        const p: Particle = {
            sprite,
            layer,
            pos: v2.add(v2.add(pos, off), v2.mul(dir, -(layer.back ?? 0))),
            vel: v2.mul(v2.create(Math.cos(a), Math.sin(a)), speed),
            dir: v2.copy(dir),
            t: 0,
            delay: layer.delay ?? 0,
            rot: layer.randomRot ? Math.random() * Math.PI * 2 : 0,
            zLayer,
            follow,
        };
        this.renderer.addPIXIObj(sprite, zLayer, layer.ground ? 12 : 22);
        this.particles.push(p);
    }

    m_update(dt: number) {
        for (const s of this.shots) {
            if (s.done) continue;
            if (!s.shot.alive) {
                s.done = true;
                for (const l of s.fx.hit ?? []) this.spawnAll(l, s.pos, s.shot.dir, s.shot.layer);
                continue;
            }
            s.pos = v2.copy(s.shot.pos);
            if (s.fx.trail) {
                s.trailTicker -= dt;
                while (s.trailTicker <= 0) {
                    s.trailTicker += s.fx.trail.every;
                    for (const l of s.fx.trail.layers) this.spawnAll(l, s.pos, s.shot.dir, s.shot.layer);
                }
            }
        }
        this.shots = this.shots.filter((s) => !s.done);

        for (let i = this.particles.length - 1; i >= 0; i--) {
            const p = this.particles[i];
            if (p.delay > 0) {
                p.delay -= dt;
                continue;
            }
            p.t += dt;
            if (p.follow) {
                p.pos = v2.sub(p.follow.pos, v2.mul(p.follow.shot.dir, p.layer.back ?? 0));
                p.dir = v2.copy(p.follow.shot.dir);
            } else {
                p.pos = v2.add(p.pos, v2.mul(p.vel, dt));
            }
            p.rot += (p.layer.spin ?? 0) * Math.PI * 2 * dt;
            if (p.layer.flicker) p.rot = Math.random() * Math.PI * 2;
            const dead = p.follow ? p.follow.done : p.t >= p.layer.life;
            if (dead) {
                p.sprite.visible = false;
                p.sprite.parent?.removeChild(p.sprite);
                this.pool.push(p.sprite);
                this.particles.splice(i, 1);
            }
        }
    }

    m_render(camera: Camera) {
        for (const p of this.particles) {
            if (p.delay > 0) continue;
            const l = p.layer;
            const k = l.life > 0 ? math.clamp(p.t / l.life, 0, 1) : 0;
            const scale = l.scale ? math.lerp(k, l.scale[0], l.scale[1]) : 1;
            const alpha = l.alpha ? math.lerp(k, l.alpha[0], l.alpha[1]) : 1;
            const tex = p.sprite.texture;
            const screen = camera.m_pointToScreen(p.pos);
            const px = camera.m_pixels(l.size * scale);
            p.sprite.position.set(screen.x, screen.y);
            if (l.stretch) {
                p.sprite.scale.set((px * l.stretch) / Math.max(tex.width, 1), px / Math.max(tex.height, 1));
            } else {
                const s = px / Math.max(tex.width, tex.height, 1);
                p.sprite.scale.set(s, s);
            }
            // along the shot (screen y points down)
            const along = Math.atan2(-p.dir.y, p.dir.x);
            p.sprite.rotation = l.stretch || !l.randomRot && !l.flicker && !l.spin ? along : p.rot;
            if (l.stretch && l.back !== undefined && l.back < 0) {
                // a beam from the champion outward: anchored at its start
                p.sprite.anchor.set(0, 0.5);
                const start = camera.m_pointToScreen(v2.add(p.pos, v2.mul(p.dir, l.back)));
                p.sprite.position.set(start.x, start.y);
            }
            p.sprite.alpha = alpha;
            p.sprite.visible = true;
        }
    }
}

export const championFx = new ChampionFxBarn();
