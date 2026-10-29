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
    /** extra turn, for a mesh drawn facing the other way */
    turn?: number;
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
const ribbon = (tex: string, width: number, life = 0.3, more: Partial<Layer> = {}) =>
    L(tex, width, life, { stretch: 4, scale: [1, 0.4], ...fade, ...more });

/**
 * Each champion's projectiles, from their base skin's particle systems (named in the comments): head layers
 * ride on the shot, trail layers drop behind it, hit layers play where it lands. Meshes (…_mesh) are the 3D
 * missiles rendered from above by scripts/genLolChampionFx.py.
 */
const ProjectileFxDefs: Record<string, ProjectileFx> = {
    // ---- Jinx
    // Jinx_Base_Q_Minigun_Mis / _Tar
    bullet_kit_jinx_basic: {
        head: [L("jinx/jinx_basic_bullet", 0.5, 0, { stretch: 5 }), L("jinx/jinx_base_q_glow", 1, 0)],
        trail: { every: 0.02, layers: [ribbon("jinx/jinx_base_q_trail01", 0.35, 0.15)] },
        hit: [burst("jinx/jinx_q_gun_hit", 1.8, 0.2), sparks("jinx/jinx_base_q_sparks", 0.5, 4)],
    },
    // Jinx_Base_Q_Rocket_mis (Jinx_Q_Rocket.scb) / _Rocket_tar / _Rocket_GroundAOE
    bullet_kit_jinx_fishbones: {
        head: [
            L("jinx/jinx_base_q_cas_flash_rgb", 1.6, 0, { back: 1.3, flicker: true }),
            L("jinx/jinx_q_rocket_mesh", 2.4, 0, { normal: true, turn: Math.PI }),
        ],
        trail: { every: 0.04, layers: [smoke("jinx/jinx_explosion_smoke", 1.4, 0.5, { back: 1.2 })] },
        hit: [
            L("jinx/jinx_base_q_circle", 5, 0.5, { ground: true, scale: [0.6, 1], ...fade }),
            L("jinx/jinx_explosion_flat", 4.5, 0.45, { flipbook: 2, scale: [0.5, 1.3], ...fade, randomRot: true }),
            burst("jinx/jinx_muzzle_flash", 3, 0.2),
            burst("jinx/jinx_base_q_blastshapes", 4, 0.4, { randomRot: true }),
            smoke("jinx/jinx_explosion_smoke", 4, 0.8),
        ],
    },
    // Jinx_Base_W_Mis / _W_Tar
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
                ribbon("jinx/jinx_base_w_blade_trail", 1.2, 0.25),
                ribbon("jinx/jinx_base_w_trail02", 0.8, 0.3),
                L("jinx/jinx_base_w_sparks", 0.9, 0.35, { spread: 0.6, speed: [2, 6], randomRot: true, ...fade }),
            ],
        },
        hit: [
            burst("jinx/jinx_base_w_mis_flash", 6, 0.25),
            L("jinx/jinx_lightning", 5, 0.35, { flicker: true, ...fade }),
            burst("jinx/jinx_w_hit_rgb", 3.5, 0.3, { randomRot: true }),
            sparks("jinx/jinx_base_w_tar_sparks", 1),
            L("jinx/jinx_base_w_bitsdissolve_01", 3, 2, { ...fade, spin: 0.5 }),
        ],
    },
    // Flame Chompers!: Jinx_Base_E_Mis lobbed grenades that land as chompers (the JinxMine model)
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
    // a chomper snapping shut: Jinx_Base_E_Mine_Set and _E_Mine_Explosion
    "bullet_champ_mark:jinx": {
        clear: { tag: "jinx_chomper", radius: 1.5 },
        hit: [
            L("jinx/jinx_base_e_tar_scorch", 4, 2, { ground: true, normal: true, ...fade }),
            L("jinx/jinx_base_e_splat_01", 4, 1.5, { ground: true, normal: true, ...fade, randomRot: true }),
            L("jinx/jinx_base_e_splats_02", 5, 1.2, { ground: true, ...fade, randomRot: true }),
            burst("jinx/jinx_base_e_tar_centerflare", 4, 0.25),
            burst("jinx/jinx_base_e_tar_firering", 5, 0.5),
            smoke("jinx/jinx_base_e_tar_firecloud", 4, 0.9),
            smoke("jinx/jinx_explosion_smoke", 3.5, 0.8),
            sparks("jinx/jinx_base_e_tar_sparks", 0.8, 10),
        ],
    },
    // Jinx_Base_R_Mis (Jinx_R_Mis.scb) with _R_Booster / _R_Rocket_Child, landing in _R_Tar
    bullet_champ_jinx_r: {
        head: [
            L("jinx/jinx_r_shape", 6, 0, { ground: true, alpha: [0.5, 0.5] }),
            L("jinx/jinx_base_r_rocketfire_revision", 3.5, 0, { back: 3.2, stretch: 1.6, flicker: true }),
            L("jinx/jinx_r_rocket_flare", 2.5, 0, { back: 2.8, flicker: true }),
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
            burst("jinx/jinx_base_r_tar_fireline", 12, 0.5, { randomRot: true }),
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
    // Caitlyn_Base_BA_mis / _BA_tar
    bullet_kit_caitlyn_basic: {
        head: [
            L("caitlyn/caitlyn_base_proj", 1.2, 0),
            L("caitlyn/caitlyn_base_glow_03", 1.8, 0),
            L("caitlyn/caitlyn_base_mis_add", 1.2, 0),
        ],
        trail: {
            every: 0.02,
            layers: [
                ribbon("caitlyn/caitlyn_base_smoketraill", 0.6, 0.3),
                L("caitlyn/caitlyn_base_wisps_01", 0.6, 0.3, { spread: 0.3, ...fade }),
            ],
        },
        hit: [
            burst("caitlyn/hit_spark_blue", 2.2),
            burst("caitlyn/bolts_crit", 2.4, 0.2, { randomRot: true }),
            burst("caitlyn/hiteffect", 2, 0.2),
        ],
    },
    // caitlyn_Base_Q_mis (Caitlyn_Base_QVFX_RG.skn, the opened shell) / _Q_2_tar
    bullet_champ_caitlyn_q: {
        head: [L("caitlyn/caitlyn_base_glow_03", 3, 0), L("caitlyn/caitlyn_base_qvfx_rg_mesh", 3, 0, { normal: true })],
        trail: {
            every: 0.02,
            layers: [
                ribbon("caitlyn/caitlyn_base_q_trail", 1.4, 0.35),
                ribbon("caitlyn/caitlyn_base_wisplayertrail", 1, 0.4),
                smoke("caitlyn/caitlyn_base_smoketraill", 1.6, 0.6, { normal: false }),
            ],
        },
        hit: [
            burst("caitlyn/hit_spark_blue", 4),
            burst("caitlyn/radial_crit", 4.5, 0.3),
            burst("caitlyn/bolts_crit", 4, 0.25, { randomRot: true }),
        ],
    },
    // the trap and Caitlyn_Base_W_tar_slow's gear rings
    bullet_champ_caitlyn_w: {
        head: [L("caitlyn/caitlyn_base_w_trap_gadget", 1.6, 0, { normal: true, arc: true })],
        hit: [
            L("caitlyn/caitlyn_base_w_trap_gadget", 1.8, 30, { normal: true, ground: true }),
            L("caitlyn/caitlyn_gear_glow_3", 3.6, 30, { ground: true, spin: 0.15, alpha: [0.8, 0.5] }),
            L("caitlyn/caitlyn_gear_05", 2.6, 30, { ground: true, spin: -0.2, alpha: [0.8, 0.5] }),
        ],
    },
    // Caitlyn_Base_E_mis (the net, Caitlyn_Base_Entrapment_Mis_Net.skn) / _E_tar
    bullet_champ_caitlyn_e: {
        head: [L("caitlyn/caitlyn_base_entrapment_mis_net_mesh", 3.5, 0, { normal: true, spin: 0.6 })],
        trail: {
            every: 0.03,
            layers: [
                ribbon("caitlyn/caitlyn_base_glowtrail", 1, 0.25),
                ribbon("caitlyn/caitlyn_base_smoketraill", 0.8, 0.4),
            ],
        },
        hit: [
            burst("caitlyn/caitlyn_base_voidslash", 4, 0.3, { randomRot: true }),
            L("caitlyn/caitlyn_base_entrapment_mis_net_mesh", 3.5, 1, { normal: true, ...fade }),
        ],
    },
    // Caitlyn_Base_R_mis (Caitlyn_Base_Mesh_01.scb) with _R_mis_child, hitting with _P_headshot_tar
    bullet_champ_caitlyn_r: {
        head: [
            L("caitlyn/caitlyn_base_impactglow", 4, 0),
            L("caitlyn/caitlyn_base_mis_shootingstars_smooth", 2, 0, { stretch: 3 }),
            L("caitlyn/caitlyn_base_mesh_01_mesh", 3, 0, { normal: true }),
        ],
        trail: {
            every: 0.015,
            layers: [
                ribbon("caitlyn/caitlyn_base_trail", 1.2, 0.4),
                ribbon("caitlyn/caitlyn_base_ult_mis_mult", 1.6, 0.5),
            ],
        },
        hit: [
            burst("caitlyn/radial_headshot", 6),
            burst("caitlyn/bolts_headshot", 6, 0.3, { randomRot: true }),
            burst("caitlyn/hit_spark_blue", 5, 0.25),
        ],
    },
    // ---- Ashe
    // Ashe_Base_W_mis's ice arrow (Ashe_Base_AA_Arrow.scb) / _BA_tar
    bullet_kit_ashe_basic: {
        head: [L("ashe/ashe_base_ba_glow", 1.6, 0), L("ashe/ashe_base_aa_arrow_mesh", 2.4, 0, { normal: true })],
        trail: { every: 0.03, layers: [ribbon("ashe/ashe_base_ba_mist_trail", 0.8, 0.4)] },
        hit: [
            burst("ashe/flare-rainbow_lightblue", 2.2),
            smoke("ashe/common_smoke_02", 1.6, 0.5, { normal: false }),
            sparks("ashe/ashe_base_q_flying_shards", 0.5, 5),
        ],
    },
    // Ashe_Base_Q_mis / _Q_tar
    bullet_champ_ashe_flurry: {
        head: [
            L("ashe/ashe_base_q_mis_star", 1.4, 0, { spin: 2 }),
            L("ashe/ashe_base_q_mis_core", 1.6, 0, { stretch: 2 }),
        ],
        trail: { every: 0.03, layers: [ribbon("ashe/ashe_base_ba_mist_trail", 0.7, 0.35)] },
        hit: [
            sparks("ashe/ashe_base_q_flying_shards", 0.5, 4),
            smoke("ashe/ashe_base_q_buff_ice_smoke", 1.4, 0.5, { normal: false }),
        ],
    },
    // Ashe_Base_W_mis / _W_tar
    bullet_champ_ashe_w: {
        head: [L("ashe/ashe_base_ba_glow", 1.8, 0), L("ashe/ashe_base_aa_arrow_mesh", 2.2, 0, { normal: true })],
        trail: { every: 0.03, layers: [smoke("ashe/ashe_base_e_smokeerosion", 1.2, 0.5, { normal: false })] },
        hit: [
            burst("ashe/flare-rainbow_lightblue", 2.4),
            smoke("ashe/common_smoke_02", 1.8, 0.6, { normal: false }),
            sparks("ashe/ashe_base_q_flying_shards", 0.5, 6),
        ],
    },
    // the hawk spirit: Ashe_Base_E_tar_explode
    bullet_champ_ashe_e: {
        head: [L("ashe/ashe_base_q_mis_core", 2.6, 0, { stretch: 1.5 }), L("ashe/ashe_base_ba_glow", 3, 0)],
        trail: { every: 0.04, layers: [smoke("ashe/ashe_base_e_wispysmoke01", 1.6, 0.7, { normal: false })] },
        hit: [
            burst("ashe/ashe_base_ba_glow", 6, 0.5),
            smoke("ashe/ashe_base_ba_erosionpack01", 4, 1, { normal: false }),
        ],
    },
    // Ashe_Base_R_mis (Ashe_Base_R_Arrow.scb)
    bullet_champ_ashe_r: {
        head: [
            L("ashe/ashe_base_ba_glow", 7, 0, { alpha: [0.8, 0.8] }),
            L("ashe/ashe_base_q_mis_core", 4, 0, { back: 2, stretch: 2 }),
            L("ashe/ashe_base_r_arrow_mesh", 6, 0, { normal: true }),
        ],
        trail: {
            every: 0.03,
            layers: [
                smoke("ashe/ashe_base_e_wispysmoke01", 3, 0.9, { back: 2.5, normal: false }),
                smoke("ashe/ashe_base_ba_erosionpack01", 2.4, 0.7, { back: 2.5, normal: false }),
            ],
        },
        hit: [
            burst("ashe/ashe_base_ba_glow", 10, 0.5),
            burst("ashe/flare-rainbow_lightblue", 8, 0.4),
            smoke("ashe/ashe_base_q_buff_ice_smoke", 8, 1.2, { normal: false }),
            sparks("ashe/ashe_base_q_flying_shards", 1, 14),
        ],
    },
    // ---- Ezreal
    // Ezreal_Base_BA_mis / _BA_tar
    bullet_kit_ezreal_basic: {
        head: [L("ezreal/ezreal_base_ba_glow", 1.8, 0), L("ezreal/ezreal_base_ba_mis", 1.6, 0, { stretch: 1.6 })],
        trail: { every: 0.03, layers: [ribbon("ezreal/ezreal_base_ba_whisps", 0.6, 0.3)] },
        hit: [
            burst("ezreal/ezreal_base_z_solar_tag", 2.4, 0.25, { spin: 1 }),
            burst("ezreal/ezreal_base_ba_glow", 2, 0.2),
        ],
    },
    // Mystic Shot: the attack's bolt, bigger, landing in Ezreal_Base_Q_tar
    bullet_champ_ezreal_q: {
        head: [L("ezreal/ezreal_base_z_flare-sun", 3, 0), L("ezreal/ezreal_base_ba_mis", 2.4, 0, { stretch: 2 })],
        trail: {
            every: 0.02,
            layers: [ribbon("ezreal/ezreal_base_r_trail", 1.2, 0.3), ribbon("ezreal/ezreal_base_ba_whisps", 0.8, 0.3)],
        },
        hit: [
            burst("ezreal/common_flare-rainbow_blue_green_02", 4.5),
            burst("ezreal/ezreal_base_z_sliver", 4, 0.3, { randomRot: true }),
            sparks("ezreal/ezreal_base_q_hit_spark", 0.8, 8),
        ],
    },
    // Essence Flux: Ezreal_Base_W_Cas's spinning orb
    bullet_champ_ezreal_w: {
        head: [L("ezreal/ezreal_base_w_cas_tex", 3.2, 0, { spin: 1.5 }), L("ezreal/ezreal_base_w_orb", 2.4, 0)],
        trail: { every: 0.04, layers: [L("ezreal/ezreal_base_z_flare-sun", 0.8, 0.4, { spread: 0.6, ...fade })] },
        hit: [
            burst("ezreal/ezreal_base_w_cas_tex", 4, 0.4, { spin: 2 }),
            sparks("ezreal/ezreal_base_z_flare-sun", 0.8, 8),
        ],
    },
    // Arcane Shift's bolt: Ezreal_Base_BA_crit_mis
    bullet_champ_ezreal_e: {
        head: [L("ezreal/ezreal_base_z_ball01", 2, 0), L("ezreal/ezreal_base_z_solar_tag", 2.6, 0, { spin: 2 })],
        trail: { every: 0.03, layers: [ribbon("ezreal/ezreal_base_ba_whisps", 1, 0.3)] },
        hit: [burst("ezreal/ezreal_base_z_flare-sun", 3), burst("ezreal/ezreal_base_z_solar_tag", 3, 0.3)],
    },
    // Ezreal_Base_R_mis: a wide golden arc (its glow turned to face forward) leaving a soft trail, / _R_tar
    bullet_champ_ezreal_r: {
        head: [
            L("ezreal/ezreal_base_r_mis_glow", 10, 0, { turn: Math.PI / 2, alpha: [0.95, 0.95] }),
            L("ezreal/ezreal_base_z_flare-sun", 4, 0, { flicker: true, alpha: [0.8, 0.8] }),
        ],
        trail: {
            every: 0.03,
            layers: [
                L("ezreal/ezreal_base_r_trail", 6, 0.35, {
                    back: 1,
                    stretch: 1.4,
                    perp: true,
                    scale: [1, 0.6],
                    alpha: [0.5, 0],
                }),
                L("ezreal/ezreal_base_z_flare-sun", 0.9, 0.5, { spread: 4, speed: [1, 3], ...fade }),
            ],
        },
        hit: [burst("ezreal/ezreal_base_z_flare-sun", 7, 0.4), sparks("ezreal/ezreal_base_z_flare-sun", 1, 10)],
    },
    // ---- Lux
    // Lux_Base_BA_mis / _BA_tar
    bullet_kit_lux_basic: {
        head: [L("lux/lux_base_r_mote", 1.4, 0), L("lux/lux_base_e_small_mote", 1, 0)],
        trail: { every: 0.02, layers: [ribbon("lux/lux_base_q_trail", 0.6, 0.3)] },
        hit: [burst("lux/starfilter", 2.4, 0.25, { spin: 1 }), burst("lux/globaltargethit01", 2.2, 0.25)],
    },
    // Lux_Base_Q_mis, holding its target in Lux_Base_Q_tar's rune prison
    bullet_champ_lux_q: {
        head: [
            L("lux/lux_base_e_flare", 3, 0),
            L("lux/lux_base_e_flash", 2.4, 0),
            L("lux/lux_base_e_small_mote", 1.6, 0, { spin: 2 }),
        ],
        trail: {
            every: 0.02,
            layers: [
                ribbon("lux/lux_base_q_trail", 1.4, 0.35),
                L("lux/lux_base_light_sparks", 0.8, 0.4, { spread: 0.5, speed: [1, 3], ...fade }),
            ],
        },
        hit: [
            L("lux/runeprison", 3.5, 2, { ground: true, spin: 0.3, alpha: [1, 0.3] }),
            L("lux/lux_base_q_tar_cap", 3, 2, { spin: -0.5, alpha: [1, 0.3] }),
            burst("lux/lux_base_light_sparks", 3.5),
        ],
    },
    // Lux_Base_W_mis and its child sparkles
    bullet_champ_lux_w: {
        head: [
            L("lux/lux_base_w_star_flash", 3, 0, { spin: 1 }),
            L("lux/lux_base_w_glow", 3.5, 0),
            L("lux/lux_q_shape", 2.5, 0),
        ],
        trail: {
            every: 0.03,
            layers: [
                ribbon("lux/lux_base_q_trail", 1.2, 0.35),
                L("lux/lux_base_w_spark", 0.8, 0.4, { spread: 0.6, ...fade }),
            ],
        },
    },
    // Lux_Base_E_mis, then the zone, bursting in _E_tar_nova
    bullet_champ_lux_e: {
        head: [L("lux/lux_base_e_flash", 2.6, 0), L("lux/flare-rainbow_orange_03", 2.4, 0, { spin: 1 })],
        hit: [
            L("lux/lux_base_e_circle_normal", 10, 3, { ground: true, alpha: [0.8, 0.6] }),
            L("lux/lux_base_e_flame_ring", 10, 3, { spin: 0.2, alpha: [0.9, 0.7] }),
            burst("lux/lux_base_e_flash", 11, 0.5, { delay: 2.7 }),
            burst("lux/lux_base_ring_00_erosion", 11, 0.5, { delay: 2.7 }),
            burst("lux/sphere_e_01", 9, 0.5, { delay: 2.7 }),
        ],
    },
    // ---- Ahri
    // Ahri_Base_BA_mis / _BA_tar
    bullet_kit_ahri_basic: {
        head: [L("ahri/ahri_base_q_orbbackground", 1.4, 0), L("ahri/ahri_base_mote_01", 1, 0)],
        trail: { every: 0.03, layers: [ribbon("ahri/ahri_base_q_trail_01", 0.6, 0.3)] },
        hit: [
            burst("ahri/ahrifirelight", 2.4),
            burst("ahri/ahri_base_ba_glow_corona", 2, 0.25),
            burst("ahri/ahri_base_ba_ringflare", 2.2, 0.25),
        ],
    },
    // the fox orb (Ahri_Base_Q_cas's Ahri_Base_Orb_Fox), landing in Ahri_Base_Q_tar
    bullet_champ_ahri_q: {
        head: [
            L("ahri/ahri_base_q_orbbackground", 3.5, 0, { alpha: [0.8, 0.8] }),
            L("ahri/ahri_base_orb_fox_01", 3, 0, { spin: 2 }),
            L("ahri/ahri_base_q_orbedge", 3.2, 0, { spin: -1 }),
        ],
        trail: {
            every: 0.02,
            layers: [
                ribbon("ahri/ahri_base_q_trail_01", 1.6, 0.35),
                L("ahri/ahri_base_mote_01", 0.7, 0.5, { spread: 0.8, speed: [1, 3], ...fade }),
            ],
        },
        hit: [
            burst("ahri/common_bigradialhalo", 3.5),
            burst("ahri/ahri_base_fireshapes_00", 3, 0.35, { randomRot: true }),
            smoke("ahri/ahri_base_primary_q_tar_02_exit_smoke", 2.4, 0.6, { normal: false }),
        ],
    },
    // Ahri_Base_W_mis / _W_tar
    bullet_champ_ahri_w: {
        head: [
            L("ahri/ahri_base_fireshapes_00", 2, 0, { flicker: true }),
            L("ahri/ahri_e_rays_mult", 2.6, 0, { spin: 1 }),
        ],
        trail: { every: 0.03, layers: [ribbon("ahri/ahri_base_firetrail", 1, 0.3)] },
        hit: [burst("ahri/common_flareblue", 2.6), smoke("ahri/sion_base_sl_dust_01", 2, 0.5, { normal: false })],
    },
    // Ahri_Base_E_mis (the heart) / _E_tar
    bullet_champ_ahri_e: {
        head: [L("ahri/ahri_base_e_heart_01", 2.6, 0), L("ahri/ahri_base_e_heart_02", 3.2, 0, { alpha: [0.7, 0.7] })],
        trail: { every: 0.04, layers: [L("ahri/ahri_base_mote_01", 0.8, 0.5, { spread: 0.6, ...fade })] },
        hit: [
            burst("ahri/common_flare-omnimax_purp", 4),
            burst("ahri/ahri_base_fireshapes_01", 3.5, 0.4, { randomRot: true }),
            smoke("ahri/ahri_base_smokepuff_02", 3, 0.7, { normal: false }),
            // Ahri_Base_E_buf: hearts over the charmed enemy
            L("ahri/ahri_e_heart", 1.4, 1.6, { count: 3, spread: 1.2, speed: [0.5, 1.5], ...fade }),
        ],
    },
    // Spirit Rush's bolts, landing in Ahri_Base_R_tar
    bullet_champ_ahri_r: {
        head: [L("ahri/ahri_base_q_orbbackground", 1.6, 0), L("ahri/ahri_base_mote_01", 1.2, 0)],
        trail: { every: 0.03, layers: [ribbon("ahri/ahri_base_firetrail", 0.8, 0.25)] },
        hit: [burst("ahri/common_bigradialhalo", 2.6), burst("ahri/common_flareblue", 2, 0.25)],
    },
    // ---- Yasuo
    // Yasuo_Base_Q_wind_mis (the whirlwind), knocking up in _Q_wind_hit_tar
    bullet_champ_yasuo_q3: {
        head: [
            L("yasuo/yasuo_base_q_tonado_wind_cas", 5, 0, { spin: 3 }),
            L("yasuo/yasuo_q_tornado_blast", 4.5, 0, { spin: -2 }),
            L("yasuo/color_yasuo_w_windwall_dust", 4, 0, { spin: 1.5, alpha: [0.6, 0.6] }),
        ],
        trail: { every: 0.04, layers: [smoke("yasuo/yasuo_q_smoke", 2.2, 0.6, { normal: false })] },
        hit: [
            burst("yasuo/yasuo_base_q_wind_hit_tar", 4, 0.5, { spin: 2 }),
            burst("yasuo/yasuo_base_q_wind_hit_flash", 3, 0.3),
        ],
    },
    // ability hits on a target, from each champion's hit particles (<Champ>_Base_<Spell>_tar)
    "bullet_champ_mark:caitlyn": {
        hit: [burst("caitlyn/hit_spark_blue", 3), burst("caitlyn/bolts_crit", 3, 0.25, { randomRot: true })],
    },
    "bullet_champ_mark:ashe": {
        hit: [burst("ashe/flare-rainbow_lightblue", 3), sparks("ashe/ashe_base_q_flying_shards", 0.6, 6)],
    },
    "bullet_champ_mark:ezreal": {
        hit: [burst("ezreal/ezreal_base_z_flare-sun", 3.5), burst("ezreal/ezreal_base_z_solar_tag", 3, 0.3)],
    },
    "bullet_champ_mark:lux": {
        hit: [burst("lux/starfilter", 3.5, 0.3, { spin: 1 }), burst("lux/lux_base_light_sparks", 3)],
    },
    "bullet_champ_mark:ahri": {
        hit: [
            burst("ahri/common_bigradialhalo", 3),
            burst("ahri/ahri_base_fireshapes_00", 2.6, 0.3, { randomRot: true }),
        ],
    },
    // Yasuo_Base_Q_hit_tar / _E_dash_hit / _R_impact_tar: a wind slash, the blast and a blood spray
    "bullet_champ_mark:yasuo": {
        hit: [
            burst("yasuo/yasuo_basic_attack_impact_slash", 4.5, 0.3, { randomRot: true }),
            burst("yasuo/yasuo_q_tornado_blast", 4, 0.35, { spin: 2 }),
            burst("yasuo/yasuo_base_r_land_exp_ring_af", 4, 0.4),
            L("yasuo/yasuo_base_blood", 2.6, 0.6, { ...fade, randomRot: true, normal: true }),
        ],
    },
    // Garen_Base_Q_Tar / _E_Tar
    "bullet_champ_mark:garen": {
        hit: [
            burst("garen/garen_base_q_tar_impact", 3.5, 0.3),
            burst("garen/garen_base_q_hit_flash", 2.6, 0.25),
            sparks("garen/garen_base_z_slash_sparks", 0.6, 5),
        ],
    },
    // darius_Base_Q_tar / _R_tar
    "bullet_champ_mark:darius": {
        hit: [
            burst("darius/red_flash_01", 3.5, 0.3),
            burst("darius/darius_shadow_step_08", 3.5, 0.35, { randomRot: true }),
            L("darius/blurdrops", 2.4, 0.5, { ...fade, randomRot: true }),
        ],
    },
    // MasterYi_Base_Q_Tar
    "bullet_champ_mark:masteryi": {
        hit: [
            burst("masteryi/masteryi_base_x_hit_flare", 3.5, 0.3),
            burst("masteryi/masteryi_base_q_slash_scroll_tar", 4, 0.35, { randomRot: true }),
        ],
    },
    bullet_champ_runaan: {
        head: [L("jinx/jinx_basic_bullet", 0.4, 0, { stretch: 4 })],
    },
};

/** what plays at a cast, by champion and key (ba = a basic attack landing), in the champion's facing direction */
const CastFxDefs: Record<string, Layer[]> = {
    // Jinx_Base_W_Beam (the 0.4 s aim) then _W_Cas; _R_Cas
    jinx_q: [burst("jinx/jinx_base_q_cas_flash_rgb", 2.5, 0.25, { back: -1.2 })],
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
    // Get Excited! (Jinx_Base_Passive_Buff_OnKill)
    jinx_p: [L("jinx/jinx_base_p_buf", 3.5, 6, { onCaster: true, spin: 0.5, alpha: [1, 0.2] })],
    // caitlyn_Base_Q_cas muzzle after the 0.6 s windup; _E_cas; _R_targetting_beam while she aims
    caitlyn_q: [burst("caitlyn/caitlyn_base_ba_hit_tar_muzzle", 3.5, 0.3, { delay: 0.6, back: -1.5 })],
    caitlyn_e: [burst("caitlyn/caitlyn_base_ba_hit_tar_muzzle", 3, 0.25, { back: -1.2 })],
    caitlyn_r: [
        L("caitlyn/caitlyn_lasersight_beam", 0.6, 1, {
            onCaster: true,
            stretch: 120,
            back: -36,
            ground: true,
            alpha: [0.3, 1],
        }),
        L("caitlyn/caitlyn_base_r_decal_01", 3, 1, { onCaster: true, back: -6, alpha: [0.4, 1], spin: 0.5 }),
        burst("caitlyn/caitlyn_base_ba_hit_tar_muzzle", 5, 0.35, { delay: 1, back: -1.5 }),
    ],
    // Ashe_Base_Q_buf (the glowing bow) and _Q_ready; Volley and R's release
    ashe_q: [
        L("ashe/ashe_base_q_ready_firelines", 3, 4, { onCaster: true, back: -1, alpha: [0.9, 0.3] }),
        L("ashe/ashe_base_q_buf", 3.5, 4, { onCaster: true, spin: 0.4, alpha: [0.9, 0.3] }),
        smoke("ashe/ashe_base_q_buff_ice_smoke", 2.5, 0.8, { normal: false }),
    ],
    ashe_w: [burst("ashe/ashe_base_ba_glow", 4, 0.3, { back: -1.5 })],
    ashe_r: [
        burst("ashe/ashe_base_ba_glow", 6, 0.4, { back: -2 }),
        burst("ashe/flare-rainbow_lightblue", 5, 0.4, { back: -2 }),
    ],
    // Ezreal_Base_E_cas where he leaves (and _E_end where he lands); _R gauntlet charge
    ezreal_w: [burst("ezreal/ezreal_base_w_cas_tex", 3, 0.3, { back: -1.2, spin: 2 })],
    ezreal_e: [
        burst("ezreal/ezreal_base_z_flare-sun", 5, 0.35),
        sparks("ezreal/ezreal_base_z_flare-sun", 0.8, 8),
        burst("ezreal/ezreal_base_z_flare-sun", 5, 0.35, { delay: 0.12, back: -9 }),
    ],
    ezreal_r: [L("ezreal/common_glow-soft", 4, 1, { onCaster: true, back: -1.5, scale: [0.3, 1.2], alpha: [0.6, 1] })],
    // Lux's shield (Lux_Base_W_tar_shield) on her; Final Spark's 1 s charge, beam and Lux_Base_R_tar flare
    lux_w: [
        L("lux/lux_base_w_bw_shield_2d", 3.5, 3, { onCaster: true, alpha: [0.8, 0.3] }),
        L("lux/lux_base_light_sparks", 1, 0.6, { onCaster: true, count: 6, spread: 1.5, ...fade }),
    ],
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
        burst("lux/lux_base_r_flash", 6, 0.4, { delay: 1, back: -2 }),
    ],
    // Ahri_Base_Q_cas, _W_cas (fire circling her), _E_cas, _R_cas
    ahri_q: [burst("ahri/ahri_base_blastring", 3, 0.3, { back: -1 })],
    ahri_w: [
        L("ahri/ahri_base_fireshapes_00", 1.8, 1.5, { onCaster: true, count: 3, spread: 2, spin: 1.5, ...fade }),
        burst("ahri/common_bigradialhalo", 4, 0.3),
    ],
    ahri_e: [burst("ahri/ahri_base_e_heart_01", 2.4, 0.3, { back: -1 })],
    ahri_r: [
        burst("ahri/common_flarebuilding", 5, 0.4),
        smoke("ahri/ahri_base_w_smoke_2x2", 3, 0.6, { flipbook: 2, count: 3, spread: 1.5, normal: false }),
    ],
    // Yasuo: Steel Tempest's thrust (_EQ_cas blade), Wind Wall, Sweeping Blade (_E_Dash), Last Breath (_R_land_tar)
    // Steel Tempest: the thrust (Yasuo_Base_EQ_cas's blade and wind) along its 5 tile reach
    yasuo_q: [
        L("yasuo/yasuo_q_sword", 2.6, 0.3, { stretch: 2.4, back: -3.2, ...fade }),
        L("yasuo/color_yasuo_q_wind", 2.4, 0.3, { stretch: 2.6, back: -3, ...fade }),
        burst("yasuo/yasuo_base_q_wind_hit_flash", 3.5, 0.25, { back: -5 }),
    ],
    yasuo_w: [
        L("yasuo/yasuo_wind_blow_01_redraw", 3, 3, { stretch: 2.8, back: -3, perp: true, alpha: [1, 0.6] }),
        L("yasuo/yasuo_w_windwall_main_02", 2.4, 3, { stretch: 3.4, back: -3, perp: true, alpha: [0.8, 0.4] }),
    ],
    yasuo_e: [
        burst("yasuo/yasuo_e_dash_flash", 3, 0.3),
        L("yasuo/yasuo_base_e_dash_afterimage", 2.4, 0.4, { ...fade }),
    ],
    yasuo_r: [
        smoke("yasuo/yasuo_base_r_dash_smoke_fill", 3, 0.6, { normal: false }),
        L("yasuo/yasuo_base_r_ground_crack", 8, 1.5, { delay: 0.3, ground: true, ...fade }),
        burst("yasuo/yasuo_base_r_land_impact_string", 8, 0.6, { delay: 0.3, randomRot: true }),
        burst("yasuo/yasuo_base_r_land_exp_ring_af", 9, 0.6, { delay: 0.3 }),
        L("yasuo/yasuo_base_r_sword_shape", 5, 0.5, { delay: 0.3, ...fade, randomRot: true }),
    ],
    // Way of the Wanderer's shield (_Passive_Burst)
    yasuo_p: [burst("yasuo/yasuo_base_passive_wind", 4, 0.6, { onCaster: true, spin: 1 })],
    yasuo_ba: [burst("yasuo/yasuo_basic_attack_impact_slash", 2.6, 0.2, { back: -2.4, randomRot: true })],
    // Garen: Garen_Base_Q_Cas (flare), _W, _E_Spin (the spin ring mesh), _R_Cas and the sword
    garen_q: [burst("garen/garen_base_q_cas_flare", 3.5, 0.4), burst("garen/garen_base_q_cas_bubble", 3, 0.4)],
    garen_w: [L("garen/garen_base_w_ground_glow", 4, 4, { onCaster: true, ground: true, alpha: [0.9, 0.3] })],
    garen_e: [
        L("garen/garen_base_e_spin_mesh", 8, 3, { onCaster: true, spin: 3, alpha: [1, 0.7] }),
        L("garen/garen_base_e_sword_trail", 7, 3, { onCaster: true, spin: 3, alpha: [0.8, 0.5] }),
    ],
    garen_r: [
        burst("garen/garen_base_z_slash_flare", 4, 0.4),
        L("garen/garen_base_r_sword_plane_fire", 4, 0.8, { back: -10, stretch: 0.4, delay: 0.1, ...fade }),
        L("garen/garen_base_r_sword_plane", 3, 0.8, { back: -10, stretch: 0.4, delay: 0.1, ...fade }),
        burst("garen/garen_base_r_tar_wings", 6, 0.6, { back: -10, delay: 0.4 }),
        burst("garen/garen_base_q_land_nova", 6, 0.5, { back: -10, delay: 0.4 }),
    ],
    garen_ba: [
        burst("garen/garen_base_aa_slash", 3, 0.25, { back: -2.4, randomRot: true }),
        sparks("garen/garen_sparks-orange", 0.5, 5, { back: -2.4 }),
    ],
    // Darius: _Q_Ring_Windup then _Q_Ring; _W_weapon; _E weapon trigger; _R_tar
    darius_q: [
        L("darius/darius_base_q_innerring_blur", 6, 0.75, { onCaster: true, alpha: [0.3, 0.9] }),
        L("darius/darius_base_q_darius_axe_spin_trail", 12, 0.5, { onCaster: true, delay: 0.75, spin: 2, ...fade }),
        L("darius/darius_base_q_darius_q_axe_blur_05", 12, 0.5, { onCaster: true, delay: 0.75, spin: 2, ...fade }),
    ],
    darius_w: [L("darius/darius_w_buff_weapon_03", 2.5, 1, { onCaster: true, back: -1.5, spin: 2, alpha: [1, 0.4] })],
    darius_e: [
        burst("darius/red_flash_01", 3, 0.3, { back: -1 }),
        L("darius/darius_q_axe_blur_05", 4, 0.4, { back: -6, stretch: 3, ...fade }),
    ],
    darius_r: [
        burst("darius/red_flash_01", 6, 0.5, { delay: 0.25 }),
        burst("darius/darius_shadow_step_08", 6, 0.5, { delay: 0.25, randomRot: true }),
        L("darius/darius_blurdrops_deep_red", 5, 0.8, { delay: 0.25, ...fade, randomRot: true }),
    ],
    darius_ba: [
        burst("darius/darius_hiteffect", 2.6, 0.25, { back: -2.4 }),
        burst("darius/blurdrops", 2, 0.4, { back: -2.4, randomRot: true }),
    ],
    // Master Yi: _Q_Cas (he vanishes), _Q_Tar slashes, Meditate, Wuju (_E_buff), Highlander (_R_Buf)
    masteryi_q: [
        burst("masteryi/masteryi_base_q_disappear", 4, 0.4),
        burst("masteryi/masteryi_base_q_cas_bubble", 3, 0.4),
        L("masteryi/masteryi_base_q_slash_scroll_tar", 5, 0.5, {
            delay: 0.15,
            back: -6,
            count: 3,
            spread: 2,
            randomRot: true,
            ...fade,
        }),
        burst("masteryi/masteryi_base_x_hit_flare", 5, 0.4, { delay: 0.15, back: -6 }),
    ],
    masteryi_w: [
        L("masteryi/masteryi_base_w_rings", 5, 3, { onCaster: true, spin: 0.5, alpha: [0.9, 0.4] }),
        L("masteryi/masteryi_base_w_heal_bolts", 1, 1, { onCaster: true, count: 6, spread: 2, alpha: [1, 0] }),
    ],
    masteryi_e: [
        L("masteryi/masteryi_e_wuju_beam", 2, 5, { onCaster: true, back: -1.5, stretch: 2, alpha: [1, 0.6] }),
        L("masteryi/masteryi_e_wuju_beam_mult", 1.5, 5, { onCaster: true, back: -1.5, stretch: 2, alpha: [1, 0.6] }),
    ],
    masteryi_r: [
        burst("masteryi/masteryi_base_r_blastwave_ring", 8, 0.5),
        L("masteryi/masteryi_base_r_buf_lines", 3, 7, { onCaster: true, spin: 1, alpha: [0.8, 0.4] }),
        L("masteryi/masteryi_base_r_boltline", 2, 7, { onCaster: true, back: 1.5, stretch: 2, alpha: [0.8, 0.3] }),
    ],
    masteryi_ba: [
        burst("masteryi/masteryi_base_z_hit_impact1", 2.6, 0.25, { back: -2.4, randomRot: true }),
        burst("masteryi/masteryi_base_z_hit_flash", 2, 0.2, { back: -2.4 }),
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
        return !!ProjectileFxDefs[bulletType] || bulletType === "bullet_champ_mark";
    }

    /** a champion's ability shot just appeared */
    trackShot(shot: TrackedShot["shot"], bulletType: string, champion?: string) {
        // the shared hit marker plays the shooting champion's own hit effect
        const fx = ProjectileFxDefs[bulletType === "bullet_champ_mark" ? `${bulletType}:${champion}` : bulletType];
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
            const along = Math.atan2(-p.dir.y, p.dir.x) + (l.perp ? Math.PI / 2 : 0) + (l.turn ?? 0);
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
