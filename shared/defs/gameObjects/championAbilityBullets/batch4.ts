import type { BulletDef } from "../bulletDefs.ts";
import { type AbilityBullets, champFx } from "./types.ts";

/**
 * Ability projectiles for the champions in server/src/game/championKits/batch4.ts. Every one deals
 * no damage of its own: the kit sweeps the shot's path itself (so it can apply crowd control) and
 * these are what the player sees fly. Pierce shots keep going through players.
 */
const sprite = (file: string, size: number, speed: number, distance: number, extra: Partial<BulletDef> = {}) => ({
    damage: 0,
    speed,
    distance,
    sprite: champFx(file),
    spriteSize: size,
    noTracer: true,
    ...extra,
});

const pierce = { playerPierce: true, pierceLoss: 0 };
export const bullets: AbilityBullets = {
    nidalee_q: sprite("nidalee/nidalee_base_ba_mark_javeline", 44, 110, 50),
    nilah_q: sprite("nilah/nilah_base_q_swipe", 48, 120, 20, pierce),
    nocturne_q: sprite("nocturne/nocturne_base_q_missilehead", 48, 90, 38, pierce),
    nunu_w: sprite("nunu/nunu_base_e_snowball_v02", 64, 60, 25, pierce),
    nunu_e: sprite("nunu/nunu_base_e_snowball_v02", 36, 80, 21),
    olaf_q: sprite("olaf/olaf_base_q_glow_01", 44, 80, 33, pierce),
    orianna_q: sprite("orianna/orianna_base_e_orb_metalrims", 44, 70, 27, { ...pierce, spin: 1 }),
    orianna_e: sprite("orianna/orianna_base_e_orb_metalrims", 36, 90, 20, { ...pierce, spin: 1 }),
    ornn_q: sprite("ornn/ornn_base_q_pillar_spike", 48, 90, 27, pierce),
    ornn_r: sprite("ornn/ornn_base_r_bigglow02", 64, 55, 40, pierce),
    pantheon_q: sprite("pantheon/pantheon_base_q_tap_spearhead", 52, 150, 19, pierce),
    poppy_q: sprite("poppy/poppy_base_q_mis_streaks", 48, 100, 14, pierce),
    poppy_r: sprite("poppy/poppy_base_r_hammer", 56, 70, 17, pierce),
    pyke_q: sprite("pyke/pyke_base_q_hook_darkglow", 48, 110, 22),
    qiyana_q: sprite("qiyana/qiyana_base_q_mis_geo_tex_lines", 52, 120, 18, pierce),
    qiyana_r: sprite("qiyana/qiyana_base_r_cas_wave", 64, 90, 25, pierce),
    quinn_q: sprite("quinn/quinn_base_q_mis_valor", 40, 100, 34),
    rakan_q: sprite("rakan/rakan_base_q_feather", 44, 100, 28),
    reksai_q: sprite("reksai/reksai_base_q_sphere_mis", 40, 100, 25),
    renata_q: sprite("renata/renata_base_ba_bullet_glow", 44, 100, 30),
    renata_e: sprite("renata/renata_base_e_missile_head_2", 44, 95, 27, pierce),
    renata_r: sprite("renata/renata_base_r_wave", 64, 70, 40, pierce),
    renekton_e: sprite("renekton/renekton_base_q_cas_swipetrail", 48, 90, 15, pierce),
    rengar_e: sprite("rengar/rengar_base_e_bola", 40, 90, 33),
    riven_q3: sprite("riven/riven_base_q1_slashtext", 48, 60, 6, pierce),
    riven_r: sprite("riven/riven_base_r_slashtip", 56, 95, 30, pierce),
    rumble_e: sprite("rumble/rumble_base_taze_mis_missile", 40, 100, 28),
    rumble_r: sprite("rumble/rumble_base_r_rockettrail", 48, 70, 58, pierce),
    ryze_q: sprite("ryze/ryze_base_q_mis_trail", 44, 100, 33),
    ryze_e: sprite("ryze/ryze_base_missile_e_ba", 36, 120, 21, { homing: true }),
    samira_q: sprite("samira/samira_base_q_bullet_glow", 40, 120, 32),
    samira_r: sprite("samira/samira_base_r_bullet", 32, 150, 20, { homing: true }),
    sejuani_r: sprite("sejuani/sejuani_base_r_mis_bolablur", 56, 80, 43),
    senna_q: sprite("senna/senna_base_q_corebolt", 44, 160, 28, pierce),
    senna_w: sprite("senna/senna_base_w_tendrils", 44, 100, 42),
    senna_r: sprite("senna/senna_base_r_corebolt", 60, 300, 100, pierce),
    seraphine_q: sprite("seraphine/seraphine_base_q_rainbowmult", 48, 80, 30, pierce),
    seraphine_e: sprite("seraphine/seraphine_base_e_wave_alphablend", 56, 80, 43, pierce),
    seraphine_r: sprite("seraphine/seraphine_base_r_front_wave_soft", 64, 70, 55, pierce),
    shaco_e: sprite("shaco/shaco_base_e_bullet_front", 40, 100, 21),
};
