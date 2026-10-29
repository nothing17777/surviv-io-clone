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
    /** stays on the champion who cast it */
    onCaster?: boolean;
    /** turned across the direction (walls) */
    perp?: boolean;
    /** lobbed: grows toward the middle of its flight, like it's high up */
    arc?: boolean;
    /** lets a later hit remove it (a chomper that went off) */
    tag?: string;
}

interface ProjectileFx {
    /** follow the projectile */
    head?: Layer[];
    /** spawned behind it every `every` seconds */
    trail?: { every: number; layers: Layer[] };
    /** where it lands */
    hit?: Layer[];
    /** what it removes where it lands: tagged effects within radius */
    clear?: { tag: string; radius: number };
}

/** a layer: texture (champion/file), size in world units, life in seconds (0 = as long as its shot) */
const L = (tex: string, size: number, life: number, more: Partial<Layer> = {}): Layer => ({
    tex: champFx(tex),
    size,
    life,
    ...more,
});
const fade = { alpha: [1, 0] as [number, number] };
const burst = (tex: string, size: number, life = 0.3, more: Partial<Layer> = {}) =>
    L(tex, size, life, { scale: [0.5, 1.3], ...fade, ...more });
const sparks = (tex: string, size: number, count = 10, more: Partial<Layer> = {}) =>
    L(tex, size, 0.5, { count, speed: [6, 16], randomRot: true, scale: [1, 0.3], ...fade, ...more });
const smoke = (tex: string, size: number, life = 0.8, more: Partial<Layer> = {}) =>
    L(tex, size, life, { scale: [0.6, 1.8], alpha: [0.7, 0], randomRot: true, normal: true, spread: 0.3, ...more });

/**
 * Each champion's projectiles, from their base skin's particle systems (<Champ>_Base_<Spell>_mis /
 * _tar / _cas): head layers ride on the shot, trail layers drop behind it, hit layers play where it lands.
 * The 3D missiles (Jinx's rocket, Ashe's arrows, Caitlyn's net) are their meshes rendered from above.
 */
const ProjectileFxDefs: Record<string, ProjectileFx> = {
    // ---- Jinx
    bullet_kit_jinx_basic: {
        head: [L("jinx/jinx_basic_bullet", 0.5, 0, { stretch: 5 })],
        hit: [burst("jinx/jinx_muzzle_flash", 1.6, 0.15)],
    },
    bullet_kit_jinx_fishbones: {
        head: [
            L("jinx/jinx_muzzle_flash", 1.8, 0, { back: 1.3, flicker: true }),
            L("jinx/jinx_base_e_tar_firering", 2.2, 0),
        ],
        trail: { every: 0.04, layers: [smoke("jinx/jinx_explosion_smoke", 1.6, 0.5, { back: 1 })] },
        hit: [
            L("jinx/jinx_explosion_flat", 4.5, 0.45, { flipbook: 2, scale: [0.5, 1.3], ...fade, randomRot: true }),
            smoke("jinx/jinx_explosion_smoke", 4, 0.8),
        ],
    },
    bullet_champ_jinx_w: {
        head: [
            L("jinx/jinx_base_w_glow", 4, 0, { alpha: [0.9, 0.9] }),
            L("jinx/jinx_lightning", 3, 0, { flicker: true }),
            L("jinx/jinx_base_w_mis_bullet_rgb", 1, 0, { stretch: 6 }),
            L("jinx/jinx_base_w_mis_groundlight", 5, 0, { ground: true, alpha: [0.6, 0.6] }),
        ],
        trail: {
            every: 0.015,
            layers: [
                L("jinx/jinx_base_w_blade_trail", 1.2, 0.25, { stretch: 3, alpha: [0.9, 0], scale: [1, 0.4] }),
                L("jinx/jinx_base_w_sparks", 0.9, 0.35, { spread: 0.6, speed: [2, 6], randomRot: true, ...fade }),
            ],
        },
        hit: [
            burst("jinx/jinx_base_w_mis_flash", 6, 0.25),
            L("jinx/jinx_lightning", 5, 0.35, { flicker: true, ...fade }),
            burst("jinx/jinx_w_hit_rgb", 3.5, 0.3, { randomRot: true }),
            sparks("jinx/jinx_base_w_tar_sparks", 1),
        ],
    },
    // Flame Chompers!: lobbed grenades (Jinx_Base_E_Mis) that land as chompers (the JinxMine model) and snap
    // shut in Jinx_Base_E_Mine_Set's burst
    bullet_champ_jinx_e: {
        head: [
            L("jinx/jinx_base_e_mis_grenade", 1.6, 0, { normal: true, spin: 2, arc: true }),
            L("jinx/jinx_base_e_mis_trail", 1.2, 0, { back: 0.8, stretch: 2, arc: true }),
        ],
        trail: { every: 0.04, layers: [smoke("jinx/jinx_explosion_smoke", 0.8, 0.4)] },
        hit: [
            smoke("jinx/jinx_explosion_smoke", 2.2, 0.5),
            L("jinx/jinx_base_e_tar_firering", 2.4, 5, { ground: true, alpha: [0.7, 0.3], tag: "jinx_chomper" }),
            L("jinx/jinxmine_mesh", 2.6, 5, { normal: true, tag: "jinx_chomper" }),
        ],
    },
    bullet_champ_jinx_e_pop: {
        clear: { tag: "jinx_chomper", radius: 1.5 },
        hit: [
            L("jinx/jinx_base_e_splat_01", 4, 1.5, { ground: true, normal: true, ...fade, randomRot: true }),
            L("jinx/jinx_base_e_splats_02", 5, 1.2, { ground: true, ...fade, randomRot: true }),
            burst("jinx/jinx_base_e_tar_flash", 4, 0.25),
            burst("jinx/jinx_base_e_tar_firering", 5, 0.5),
            L("jinx/jinx_base_e_tar_circlefire", 3.5, 1.5, { spin: 0.4, alpha: [1, 0] }),
            smoke("jinx/jinx_base_e_tar_firecloud", 4, 0.9),
            smoke("jinx/jinx_explosion_smoke", 3.5, 0.8),
            sparks("jinx/jinx_base_e_tar_sparks", 0.8, 10),
        ],
    },
    bullet_champ_jinx_r: {
        head: [
            L("jinx/jinx_r_shape", 6, 0, { ground: true, alpha: [0.5, 0.5] }),
            L("jinx/jinx_base_r_rocketfire_revision", 3.5, 0, { back: 3.2, stretch: 1.6, flicker: true }),
            L("jinx/jinx_muzzle_flash", 2.5, 0, { back: 2.8, flicker: true }),
            // Jinx_R_Mis.scb, the shark rocket, with its texture
            L("jinx/jinx_r_mis_mesh", 6, 0, { normal: true }),
        ],
        trail: {
            every: 0.03,
            layers: [
                smoke("jinx/jinx_base_r_groundsmoke02", 3, 0.9, { back: 3.2, scale: [0.6, 2.2] }),
                L("jinx/jinx_base_r_mis_addsmoke", 2.2, 0.4, {
                    back: 3.2,
                    scale: [0.8, 1.6],
                    alpha: [0.8, 0],
                    randomRot: true,
                }),
            ],
        },
        hit: [
            L("jinx/jinx_r_scorch", 12, 3, { ground: true, normal: true, ...fade }),
            L("jinx/jinx_base_r_tar_groundcracks", 10, 2.5, { ground: true, ...fade }),
            burst("jinx/jinx_base_r_tar_firering", 13, 0.6, { scale: [0.3, 1.3] }),
            burst("jinx/jinx_base_r_tar_circlefire", 10, 0.7, { spin: 0.3 }),
            L("jinx/jinx_explosion_flat", 8, 0.7, {
                flipbook: 2,
                count: 4,
                spread: 2.2,
                scale: [0.5, 1.3],
                ...fade,
                randomRot: true,
            }),
            smoke("jinx/jinx_base_r_tar_firecloud", 10, 1.1),
            sparks("jinx/jinx_base_r_tar_sparks", 1.4, 14, { speed: [10, 26] }),
        ],
    },
    // ---- Caitlyn
    bullet_kit_caitlyn_basic: {
        head: [L("caitlyn/caitlyn_base_proj", 1.2, 0), L("caitlyn/caitlyn_base_mis_add", 1.6, 0)],
        trail: { every: 0.02, layers: [L("caitlyn/caitlyn_base_glowtrail", 0.6, 0.2, { stretch: 4, ...fade })] },
        hit: [burst("caitlyn/caitlyn_base_flash_01", 2.2)],
    },
    bullet_champ_caitlyn_q: {
        head: [
            L("caitlyn/caitlyn_base_q2_bullet_head_glow", 3, 0),
            L("caitlyn/caitlyn_base_q_flamehead", 2.4, 0, { stretch: 2 }),
        ],
        trail: {
            every: 0.02,
            layers: [
                L("caitlyn/caitlyn_base_q_trail", 1.4, 0.35, { stretch: 4, ...fade }),
                smoke("caitlyn/caitlyn_base_smoketraill", 1.6, 0.6),
            ],
        },
        hit: [burst("caitlyn/caitlyn_base_impactglow", 4), burst("caitlyn/caitlyn_base_flash_sharp", 3, 0.2)],
    },
    bullet_champ_caitlyn_w: {
        head: [L("caitlyn/caitlyn_base_w_trap_gadget", 1.6, 0, { normal: true })],
        hit: [
            L("caitlyn/caitlyn_base_w_trap_gadget", 1.8, 30, { normal: true, ground: true }),
            L("caitlyn/caitlyn_base_w_indicator_ring", 3.6, 30, { ground: true, alpha: [0.8, 0.5] }),
        ],
    },
    bullet_champ_caitlyn_e: {
        // caitlyn_net_02.scb with the hex net texture
        head: [L("caitlyn/caitlyn_net_02_mesh", 3.5, 0, { spin: 0.6 })],
        trail: { every: 0.03, layers: [L("caitlyn/caitlyn_base_glowtrail", 1, 0.25, { stretch: 3, ...fade })] },
        hit: [burst("caitlyn/caitlyn_base_e_waves", 4.5, 0.4)],
    },
    bullet_champ_caitlyn_r: {
        head: [L("caitlyn/caitlyn_base_proj", 2, 0), L("caitlyn/caitlyn_base_mis_add", 3, 0)],
        trail: {
            every: 0.015,
            layers: [L("caitlyn/caitlyn_base_mis_shootingstars_smooth", 1.4, 0.4, { stretch: 5, ...fade })],
        },
        hit: [
            L("caitlyn/caitlyn_base_r_decal_01", 6, 1.5, { ground: true, ...fade }),
            burst("caitlyn/caitlyn_base_impactglow", 6),
            burst("caitlyn/caitlyn_base_r_hit_flash", 5, 0.25),
        ],
    },
    // ---- Ashe
    bullet_kit_ashe_basic: {
        // Ashe_Base_AA_Arrow.scb
        head: [L("ashe/ashe_base_aa_arrow_mesh", 2.4, 0, { normal: true })],
        trail: { every: 0.03, layers: [smoke("ashe/ashe_base_ba_mist_trail", 1, 0.4, { normal: false })] },
        hit: [burst("ashe/ashe_base_ba_glow", 2), sparks("ashe/irelia_skin06_shards", 0.5, 5)],
    },
    bullet_champ_ashe_flurry: {
        head: [L("ashe/ashe_base_aa_arrow_mesh", 2, 0, { normal: true })],
        hit: [burst("ashe/ashe_base_ba_glow", 1.6)],
    },
    bullet_champ_ashe_w: {
        head: [L("ashe/ashe_base_aa_arrow_mesh", 2.2, 0, { normal: true }), L("ashe/ashe_base_q_mis_core", 1.2, 0)],
        trail: { every: 0.03, layers: [smoke("ashe/common_frost_cloud_01", 1.2, 0.5, { normal: false })] },
        hit: [burst("ashe/ashe_base_ba_glow", 2.4), sparks("ashe/irelia_skin06_shards", 0.5, 6)],
    },
    bullet_champ_ashe_e: {
        head: [L("ashe/ashe_base_q_mis_star", 2.4, 0, { spin: 1 }), L("ashe/ashe_base_ba_glow", 3, 0)],
        trail: { every: 0.04, layers: [smoke("ashe/ashe_base_e_wispysmoke01", 1.6, 0.7, { normal: false })] },
    },
    bullet_champ_ashe_r: {
        head: [
            L("ashe/ashe_base_ba_glow", 7, 0, { alpha: [0.8, 0.8] }),
            // Ashe_Base_R_Arrow.scb, the crystal arrow
            L("ashe/ashe_base_r_arrow_mesh", 6, 0, { normal: true }),
        ],
        trail: {
            every: 0.03,
            layers: [
                smoke("ashe/ashe_base_e_wispysmoke01", 3, 0.9, { back: 2.5, normal: false }),
                L("ashe/ashe_base_q_mis_core", 2, 0.4, { back: 2, stretch: 3, ...fade }),
            ],
        },
        hit: [
            burst("ashe/ashe_base_ba_glow", 10, 0.5),
            smoke("ashe/common_frost_cloud_01", 8, 1.2, { normal: false }),
            sparks("ashe/irelia_skin06_shards", 1, 14),
        ],
    },
    // ---- Ezreal
    bullet_kit_ezreal_basic: {
        head: [L("ezreal/ezreal_base_ba_mis", 1.8, 0, { stretch: 1.6 }), L("ezreal/ezreal_base_z_ball01", 1.4, 0)],
        hit: [burst("ezreal/ezreal_base_z_flare-sun", 2.4, 0.2)],
    },
    bullet_champ_ezreal_q: {
        head: [L("ezreal/ezreal_base_z_flare-sun", 3, 0), L("ezreal/ezreal_base_ba_mis", 2.4, 0, { stretch: 2 })],
        trail: { every: 0.02, layers: [L("ezreal/ezreal_base_r_trail", 1.2, 0.3, { stretch: 4, ...fade })] },
        hit: [burst("ezreal/ezreal_base_z_flare-sun", 4.5)],
    },
    bullet_champ_ezreal_w: {
        head: [L("ezreal/ezreal_base_w_orb", 3, 0), L("ezreal/ezreal_base_w_ringglow", 4, 0, { spin: 1.5 })],
        hit: [burst("ezreal/ezreal_base_z_sliver", 4), sparks("ezreal/ezreal_base_q_hit_spark", 0.8, 8)],
    },
    bullet_champ_ezreal_e: {
        head: [L("ezreal/ezreal_base_z_ball01", 2, 0), L("ezreal/ezreal_base_z_solar_tag", 2.6, 0, { spin: 2 })],
        trail: { every: 0.03, layers: [L("ezreal/ezreal_base_ba_whisps", 1, 0.3, { stretch: 3, ...fade })] },
        hit: [burst("ezreal/ezreal_base_z_flare-sun", 3)],
    },
    bullet_champ_ezreal_r: {
        head: [L("ezreal/ezreal_base_r_mis_glow", 9, 0), L("ezreal/ezreal_base_z_flare-sun", 6, 0)],
        trail: { every: 0.02, layers: [L("ezreal/ezreal_base_r_tail_tex", 5, 0.4, { stretch: 2, ...fade })] },
        hit: [burst("ezreal/ezreal_base_z_flare-sun", 8, 0.4)],
    },
    // ---- Lux
    bullet_kit_lux_basic: {
        head: [L("lux/lux_base_e_small_mote", 1.4, 0), L("lux/lux_base_soft-glow", 2, 0)],
        hit: [burst("lux/lux_base_light_sparks", 2)],
    },
    bullet_champ_lux_q: {
        head: [L("lux/lux_base_e_flare", 3, 0), L("lux/lux_base_e_flame_ring", 2.6, 0, { spin: 1 })],
        trail: { every: 0.02, layers: [L("lux/lux_base_q_trail", 1.4, 0.35, { stretch: 4, ...fade })] },
        hit: [
            L("lux/lux_base_e_circle_normal", 3, 2, { ground: true, ...fade }),
            burst("lux/lux_base_light_sparks", 3.5),
        ],
    },
    bullet_champ_lux_w: {
        head: [L("lux/lux_base_w_bw_shield_2d", 3, 0), L("lux/lux_base_w_glow_outer", 4, 0)],
    },
    bullet_champ_lux_e: {
        head: [L("lux/lux_base_e_flare", 2.6, 0), L("lux/lux_base_e_small_mote", 1.6, 0)],
        hit: [
            L("lux/lux_base_e_circle_normal", 10, 3, { ground: true, alpha: [0.8, 0.6] }),
            L("lux/lux_base_e_flame_ring", 10, 3, { spin: 0.2, alpha: [0.9, 0.7] }),
            burst("lux/lux_base_e_flash", 11, 0.5, { delay: 2.7 }),
            burst("lux/lux_base_ring_00_erosion", 11, 0.5, { delay: 2.7 }),
        ],
    },
    // ---- Ahri
    bullet_kit_ahri_basic: {
        head: [L("ahri/ahri_base_q_orbbackground", 1.4, 0), L("ahri/ahri_base_mote_01", 1, 0)],
        hit: [burst("ahri/ahri_base_ba_ringflare", 2)],
    },
    bullet_champ_ahri_q: {
        head: [
            L("ahri/ahri_base_q_orbbackground", 3.5, 0, { alpha: [0.8, 0.8] }),
            L("ahri/ahri_base_orb_fox_01", 3, 0, { spin: 2 }),
        ],
        trail: {
            every: 0.02,
            layers: [
                L("ahri/ahri_base_q_trail_01", 1.6, 0.35, { stretch: 3, ...fade }),
                L("ahri/ahri_base_mote_01", 0.7, 0.5, { spread: 0.8, speed: [1, 3], ...fade }),
            ],
        },
        hit: [burst("ahri/ahri_base_blastring", 3)],
    },
    bullet_champ_ahri_w: {
        head: [L("ahri/ahri_base_w_fire2x2", 2, 0, { flipbook: 2, flicker: true }), L("ahri/ahrifirelight", 2.6, 0)],
        trail: { every: 0.03, layers: [L("ahri/ahri_base_firetrail", 1, 0.3, { stretch: 3, ...fade })] },
        hit: [burst("ahri/ahri_base_blastring_2", 2.6)],
    },
    bullet_champ_ahri_e: {
        head: [L("ahri/ahri_e_heart", 2.4, 0), L("ahri/ahri_base_e_heart_02", 3, 0, { alpha: [0.7, 0.7] })],
        trail: { every: 0.04, layers: [L("ahri/ahri_base_mote_01", 0.8, 0.5, { spread: 0.6, ...fade })] },
        hit: [burst("ahri/ahri_e_rays_mult", 4), burst("ahri/ahri_e_heart", 3, 0.6, { scale: [1, 2] })],
    },
    bullet_champ_ahri_r: {
        head: [L("ahri/ahri_base_q_orbbackground", 1.6, 0), L("ahri/ahri_base_mote_01", 1.2, 0)],
        trail: { every: 0.03, layers: [L("ahri/ahri_base_firetrail", 0.8, 0.25, { stretch: 3, ...fade })] },
        hit: [burst("ahri/ahri_base_blastring", 2)],
    },
    // ---- Yasuo
    bullet_champ_yasuo_q3: {
        head: [
            L("yasuo/yasuo_q_tornado_blast", 5, 0, { spin: 3 }),
            L("yasuo/yasuo_q_tornado_buff", 4, 0, { spin: -2 }),
        ],
        trail: { every: 0.04, layers: [smoke("yasuo/yasuo_base_q_ground_dirt_mis", 2.2, 0.6)] },
    },
    bullet_champ_runaan: {
        head: [L("jinx/jinx_basic_bullet", 0.4, 0, { stretch: 4 })],
    },
};

/** what plays at a cast, by champion and key, in the champion's facing direction */
const CastFxDefs: Record<string, Layer[]> = {
    // Jinx: W's 0.4 s aiming beam then the muzzle flash; R's launch blast
    jinx_w: [
        L("jinx/jinx_base_w_beam_reticle_rgb", 1.6, 0.4, {
            stretch: 56,
            back: -45,
            alpha: [0.2, 1],
            ground: true,
            onCaster: true,
        }),
        L("jinx/jinx_base_w_beam_glow_rgb", 2.6, 0.4, {
            stretch: 35,
            back: -45,
            alpha: [0, 0.8],
            ground: true,
            onCaster: true,
        }),
        burst("jinx/jinx_base_w_cas_flash", 4, 0.25, { delay: 0.4, back: -1.5 }),
    ],
    jinx_e: [burst("jinx/jinx_muzzle_flash", 2, 0.2, { back: -1.2 })],
    jinx_r: [
        burst("jinx/jinx_muzzle_flash", 5, 0.3, { back: -2 }),
        smoke("jinx/jinx_explosion_smoke", 4, 1, { back: -1, count: 3, spread: 1.2, speed: [1, 3] }),
    ],
    // Caitlyn: Q's 0.6 s windup flash, R's sniper sight while she aims
    caitlyn_q: [burst("caitlyn/caitlyn_base_flash_01", 3.5, 0.3, { delay: 0.6, back: -1.5 })],
    caitlyn_e: [burst("caitlyn/caitlyn_base_flash_sharp", 3, 0.25, { back: -1.2 })],
    caitlyn_r: [
        L("caitlyn/caitlyn_r_snipersight", 3, 1, { onCaster: true, back: -6, alpha: [0.4, 1], spin: 0.5 }),
        burst("caitlyn/caitlyn_base_flash_01", 5, 0.35, { delay: 1, back: -1.5 }),
    ],
    // Ashe: Ranger's Focus glow on her, Volley's frost burst
    ashe_q: [L("ashe/ashe_base_q_ready_firelines", 4, 4, { onCaster: true, spin: 0.4, alpha: [0.9, 0.3] })],
    ashe_w: [burst("ashe/ashe_base_ba_glow", 4, 0.3, { back: -1.5 })],
    ashe_r: [burst("ashe/ashe_base_ba_glow", 6, 0.4, { back: -2 })],
    // Ezreal: the Arcane Shift flash where he leaves, Trueshot's charge
    ezreal_e: [
        burst("ezreal/ezreal_base_z_flare-sun", 5, 0.35),
        L("ezreal/ezreal_ashe_base_ground_cracknoise_mult", 5, 1, { ground: true, ...fade }),
    ],
    ezreal_r: [
        L("ezreal/ezreal_base_z_flare-sun", 6, 1, { onCaster: true, back: -1.5, scale: [0.3, 1.2], alpha: [0.6, 1] }),
    ],
    // Lux: the shield on her, Final Spark's 1 s charge and the beam
    lux_w: [L("lux/lux_base_w_bw_shield_2d", 3.5, 3, { onCaster: true, alpha: [0.8, 0.3] })],
    lux_r: [
        L("lux/lux_base_r_lazurbeamglow", 2, 1, {
            onCaster: true,
            stretch: 60,
            back: -60,
            ground: true,
            alpha: [0.1, 0.6],
        }),
        L("lux/lux_base_r_lazurbeam01", 5, 0.6, { delay: 1, stretch: 24, back: -60, alpha: [1, 0] }),
        L("lux/lux_base_r_lazurbeamglow", 9, 0.6, { delay: 1, stretch: 13, back: -60, alpha: [1, 0] }),
        L("lux/lux_base_r_heart_beam_glow", 6, 0.6, { delay: 1, back: -1.5, ...fade }),
    ],
    // Ahri: Fox-Fire circling her, Spirit Rush's dash ring
    ahri_w: [
        L("ahri/ahri_base_w_fire2x2", 2, 1.5, { onCaster: true, flipbook: 2, count: 3, spread: 2, spin: 1.5, ...fade }),
    ],
    ahri_r: [
        burst("ahri/ahri_base_blastring", 5, 0.4),
        L("ahri/ahri_base_mote_01", 1, 0.6, { count: 8, speed: [3, 8], ...fade }),
    ],
    // Yasuo: the Steel Tempest thrust, Wind Wall, the dash ring, Last Breath's slam
    yasuo_q: [L("yasuo/yasuo_q_sword", 2, 0.2, { stretch: 3, back: -3, ...fade })],
    yasuo_w: [
        L("yasuo/yasuo_base_z_wind_blow_mis_01", 2.5, 3, { stretch: 3.2, back: -3, perp: true, alpha: [1, 0.6] }),
        L("yasuo/yasuo_basic_attack_wind_ring_02", 4, 3, { back: -3, spin: 1, alpha: [0.8, 0.3] }),
    ],
    yasuo_e: [burst("yasuo/yasuo_base_e_dash_ring", 4, 0.4)],
    yasuo_r: [
        burst("yasuo/yasuo_base_r_land_exp_ring_af", 9, 0.6, { delay: 0.3 }),
        L("yasuo/yasuo_base_r_sword_shape", 5, 0.5, { delay: 0.3, ...fade, randomRot: true }),
    ],
    // Garen: Decisive Strike's ring, Courage's wave, Judgment's spin, the Demacian Justice sword
    garen_q: [burst("garen/garen_base_q_tar_ring", 4, 0.4)],
    garen_w: [L("garen/garen_base_w_energy_wave", 4, 4, { onCaster: true, spin: 0.5, alpha: [0.9, 0.3] })],
    garen_e: [
        L("garen/garen_base_e_spin_topdown", 8, 3, { onCaster: true, spin: 3, alpha: [1, 0.7] }),
        L("garen/garen_base_e_spin_edge", 8, 3, { onCaster: true, spin: 3, alpha: [0.8, 0.5] }),
    ],
    garen_r: [
        L("garen/garen_base_r_sword_plane_fire", 4, 0.8, { back: -10, stretch: 0.4, delay: 0.1, ...fade }),
        L("garen/garen_base_r_sword_plane", 3, 0.8, { back: -10, stretch: 0.4, delay: 0.1, ...fade }),
        burst("garen/garen_base_q_tar_ring", 6, 0.4, { back: -10, delay: 0.4 }),
    ],
    // Darius: Decimate's axe sweep after its windup, the Apprehend pull, the Guillotine
    darius_q: [
        L("darius/darius_base_q_darius_axe_spin_trail", 12, 0.5, { onCaster: true, delay: 0.75, spin: 2, ...fade }),
        L("darius/darius_base_q_outterring_blur", 12, 0.5, { onCaster: true, delay: 0.75, ...fade }),
    ],
    darius_w: [L("darius/darius_base_p_axe_tip_flare", 2.5, 1, { onCaster: true, back: -1.5, alpha: [1, 0.4] })],
    darius_e: [L("darius/darius_q_axe_blur_05", 4, 0.4, { back: -6, stretch: 3, ...fade })],
    darius_r: [
        burst("darius/darius_base_p_axe_tip_flare", 6, 0.5, { delay: 0.25 }),
        L("darius/darius_q_axe_blur_05", 6, 0.4, { delay: 0.2, randomRot: true, ...fade }),
    ],
    // Master Yi: Alpha Strike's flash, Meditate's rings, Wuju's blade glow, Highlander
    masteryi_q: [
        burst("masteryi/masteryi_base_z_ring", 6, 0.5),
        L("masteryi/masteryi_base_r_boltline", 4, 0.6, { count: 4, randomRot: true, spread: 3, ...fade }),
    ],
    masteryi_w: [
        L("masteryi/masteryi_base_w_rings", 5, 3, { onCaster: true, spin: 0.5, alpha: [0.9, 0.4] }),
        L("masteryi/masteryi_base_w_heal_bolts", 1, 1, { onCaster: true, count: 6, spread: 2, alpha: [1, 0] }),
    ],
    masteryi_e: [L("masteryi/masteryi_e_wuju_beam", 2, 5, { onCaster: true, back: -1.5, stretch: 2, alpha: [1, 0.6] })],
    masteryi_r: [
        burst("masteryi/masteryi_base_r_blastwave_ring", 8, 0.5),
        L("masteryi/masteryi_base_r_fireball", 3, 7, { onCaster: true, spin: 1, alpha: [0.8, 0.4] }),
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
    caster?: Caster;
}

interface Caster {
    m_pos: Vec2;
    m_netData: { m_dir: Vec2 };
}

interface TrackedShot {
    shot: { alive: boolean; pos: Vec2; dir: Vec2; layer: number; startPos: Vec2; distance: number };
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
    cast(champion: string, key: string, caster: Caster, layer: number) {
        for (const l of CastFxDefs[`${champion}_${key}`] ?? []) {
            this.spawnAll(l, caster.m_pos, caster.m_netData.m_dir, layer, l.onCaster ? caster : undefined);
        }
    }

    spawnAll(layer: Layer, pos: Vec2, dir: Vec2, zLayer: number, caster?: Caster) {
        for (let i = 0; i < (layer.count ?? 1); i++) this.spawn(layer, pos, dir, zLayer, undefined, caster);
    }

    spawn(layer: Layer, pos: Vec2, dir: Vec2, zLayer: number, follow?: TrackedShot, caster?: Caster) {
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
            caster,
        };
        this.renderer.addPIXIObj(sprite, zLayer, layer.ground ? 12 : 22);
        this.particles.push(p);
    }

    m_update(dt: number) {
        for (const s of this.shots) {
            if (s.done) continue;
            if (!s.shot.alive) {
                s.done = true;
                const clear = s.fx.clear;
                if (clear) {
                    for (const p of this.particles) {
                        if (p.layer.tag === clear.tag && v2.distance(p.pos, s.pos) <= clear.radius) p.t = p.layer.life;
                    }
                }
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
            } else if (p.caster) {
                p.dir = v2.copy(p.caster.m_netData.m_dir);
                p.pos = v2.sub(p.caster.m_pos, v2.mul(p.dir, p.layer.back ?? 0));
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
            let scale = l.scale ? math.lerp(k, l.scale[0], l.scale[1]) : 1;
            if (l.arc && p.follow) {
                const shot = p.follow.shot;
                const flown = math.clamp(
                    v2.distance(p.follow.pos, shot.startPos) / Math.max(shot.distance, 0.01),
                    0,
                    1,
                );
                scale *= 1 + 0.8 * Math.sin(Math.PI * flown);
            }
            const alpha = l.alpha ? math.lerp(k, l.alpha[0], l.alpha[1]) : 1;
            const tex = p.sprite.texture;
            const screen = camera.m_pointToScreen(p.pos);
            // sizes are world units (a player is 2 across); m_pixels takes screen px at zoom 1, like the
            // custom projectiles' spriteSize (the Christmas Ultimatum tree is 80 px = 5 units)
            const px = camera.m_pixels(l.size * scale * camera.m_ppu);
            p.sprite.position.set(screen.x, screen.y);
            if (l.stretch) {
                p.sprite.scale.set((px * l.stretch) / Math.max(tex.width, 1), px / Math.max(tex.height, 1));
            } else {
                const s = px / Math.max(tex.width, tex.height, 1);
                p.sprite.scale.set(s, s);
            }
            // along the shot (screen y points down)
            const along = Math.atan2(-p.dir.y, p.dir.x) + (l.perp ? Math.PI / 2 : 0);
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
