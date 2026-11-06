/**
 * League of Legends champions, played as kits. Keys 1-4 cast Q, W, E, R (instead of switching weapon
 * slots), 5 uses the build's item active. The champion's build (its most popular one, patch 26.21) adds
 * each item's stats and passive. The basic attack is the champion's own weapon, drawn as an item from
 * that build. Ability logic lives in server/src/game/champion.ts.
 */

export type AbilityKey = "q" | "w" | "e" | "r";

export interface AbilityDef {
    name: string;
    /** seconds */
    cooldown: number;
    description: string;
}

export interface ChampionDef {
    name: string;
    title: string;
    health: number;
    /** added move speed */
    speedBonus: number;
    gun: boolean;
    /** basic attack: kit_<champion>_basic, a gun or a melee weapon */
    basic: { damage: number; cooldown: number; range?: number };
    passive: { name: string; description: string };
    abilities: Record<AbilityKey, AbilityDef>;
    /** item ids in ItemDefs, in build order */
    items: string[];
    outfit: { base: number; hands: number; backpack: number };
}

/** what an item gives in surviv terms */
export interface ItemDef {
    name: string;
    /** basic attack damage multiplier, added up across items */
    damage?: number;
    /** ability damage multiplier, added up across items */
    abilityPower?: number;
    /** basic attack speed, added up (0.25 = 25% shorter cooldown between attacks) */
    attackSpeed?: number;
    moveSpeed?: number;
    health?: number;
    /** chance a basic attack crits, added up and capped at 1 */
    crit?: number;
    /** crit damage on top of the base 1.75x */
    critDamage?: number;
    /** share of the target's armor ignored (helmet and vest), the biggest one counts */
    armorPen?: number;
    /** share of basic attack damage healed */
    lifesteal?: number;
    /** shorter ability cooldowns, added up */
    abilityHaste?: number;
    /** less damage taken from basic attacks */
    damageReduction?: number;
    /** passives with their own logic in server/src/game/champion.ts */
    passive?:
        | "runaan" // basic shots fire 2 extra bolts at 40% damage
        | "kraken" // every 3rd basic hit deals 35 bonus damage
        | "botrk" // basic hits deal 6% of the target's current health
        | "collector" // enemies below 5% health are executed
        | "guardian_angel" // revive once at half health
        | "shieldbow" // a 60 shield when dropping below 30% health, every 90 s
        | "spellblade" // the next basic attack after an ability deals 40% more
        | "lich_bane" // the next basic attack after an ability deals 75% more
        | "shadowflame" // abilities deal 20% more to enemies below 40% health
        | "stormsurge" // 40 bonus damage on the first ability hit every 20 s
        | "luden" // the first ability hit every 10 s deals 25 more
        | "malignance" // R recharges 20% faster
        | "bloodthirster" // lifesteal past full health becomes a shield up to 50
        | "dead_mans_plate" // move speed builds while walking, the next melee hit knocks back
        | "navori" // basic hits cut ability cooldowns by 15%
        | "guinsoo" // every other basic hit stacks 8% attack speed, up to 6
        | "sundered_sky" // the first hit on an enemy crits and heals 30
        | "deaths_dance"; // 30% of the damage taken is spread over 3 s instead
    /** item active, used with key 5 */
    active?: { kind: "stridebreaker" | "youmuu" | "zhonya"; cooldown: number };
}

export const ItemDefs: Record<string, ItemDef> = {
    hexoptics_c44: { name: "Hexoptics C44", damage: 0.1, crit: 0.25 },
    berserkers_greaves: { name: "Berserker's Greaves", attackSpeed: 0.25, moveSpeed: 0.5 },
    runaans_hurricane: { name: "Runaan's Hurricane", attackSpeed: 0.4, crit: 0.25, passive: "runaan" },
    infinity_edge: { name: "Infinity Edge", damage: 0.15, crit: 0.25, critDamage: 0.4 },
    lord_dominiks_regards: { name: "Lord Dominik's Regards", damage: 0.08, crit: 0.25, armorPen: 0.35 },
    guardian_angel: { name: "Guardian Angel", damage: 0.1, passive: "guardian_angel" },
    the_collector: { name: "The Collector", damage: 0.1, crit: 0.25, armorPen: 0.1, passive: "collector" },
    bloodthirster: { name: "Bloodthirster", damage: 0.15, lifesteal: 0.15, passive: "bloodthirster" },
    phantom_dancer: { name: "Phantom Dancer", attackSpeed: 0.4, moveSpeed: 0.5, crit: 0.25 },
    immortal_shieldbow: { name: "Immortal Shieldbow", damage: 0.1, crit: 0.25, passive: "shieldbow" },
    stridebreaker: {
        name: "Stridebreaker",
        damage: 0.1,
        attackSpeed: 0.2,
        health: 25,
        active: { kind: "stridebreaker", cooldown: 15 },
    },
    kraken_slayer: { name: "Kraken Slayer", damage: 0.1, attackSpeed: 0.35, passive: "kraken" },
    blade_of_the_ruined_king: {
        name: "Blade of The Ruined King",
        attackSpeed: 0.25,
        lifesteal: 0.08,
        passive: "botrk",
    },
    youmuus_ghostblade: {
        name: "Youmuu's Ghostblade",
        damage: 0.1,
        armorPen: 0.15,
        active: { kind: "youmuu", cooldown: 45 },
    },
    plated_steelcaps: { name: "Plated Steelcaps", moveSpeed: 0.5, damageReduction: 0.12 },
    dead_mans_plate: { name: "Dead Man's Plate", health: 40, passive: "dead_mans_plate" },
    ionian_boots_of_lucidity: { name: "Ionian Boots of Lucidity", abilityHaste: 0.1, moveSpeed: 0.5 },
    manamune: { name: "Manamune", damage: 0.1, abilityHaste: 0.05 },
    trinity_force: {
        name: "Trinity Force",
        damage: 0.1,
        attackSpeed: 0.3,
        health: 30,
        abilityHaste: 0.1,
        passive: "spellblade",
    },
    ludens_echo: { name: "Luden's Echo", abilityPower: 0.15, abilityHaste: 0.1, passive: "luden" },
    sorcerers_shoes: { name: "Sorcerer's Shoes", armorPen: 0.2, moveSpeed: 0.5 },
    stormsurge: { name: "Stormsurge", abilityPower: 0.15, passive: "stormsurge" },
    shadowflame: { name: "Shadowflame", abilityPower: 0.2, passive: "shadowflame" },
    rabadons_deathcap: { name: "Rabadon's Deathcap", abilityPower: 0.35 },
    zhonyas_hourglass: { name: "Zhonya's Hourglass", abilityPower: 0.15, active: { kind: "zhonya", cooldown: 120 } },
    spellslingers_shoes: { name: "Spellslinger's Shoes", armorPen: 0.12, moveSpeed: 0.5 },
    malignance: { name: "Malignance", abilityPower: 0.2, abilityHaste: 0.1, passive: "malignance" },
    essence_reaver: {
        name: "Essence Reaver",
        damage: 0.12,
        crit: 0.25,
        abilityHaste: 0.1,
        passive: "spellblade",
    },
    navori_flickerblade: { name: "Navori Flickerblade", attackSpeed: 0.4, crit: 0.25, passive: "navori" },
    seryldas_grudge: { name: "Serylda's Grudge", damage: 0.1, abilityHaste: 0.1, armorPen: 0.3 },
    deaths_dance: { name: "Death's Dance", damage: 0.12, health: 30, passive: "deaths_dance" },
    steraks_gage: { name: "Sterak's Gage", damage: 0.1, health: 50, passive: "shieldbow" },
    sundered_sky: { name: "Sundered Sky", damage: 0.1, health: 35, passive: "sundered_sky" },
    guinsoos_rageblade: { name: "Guinsoo's Rageblade", attackSpeed: 0.25, passive: "guinsoo" },
    wits_end: { name: "Wit's End", attackSpeed: 0.5, damage: 0.08, damageReduction: 0.1 },
    lich_bane: { name: "Lich Bane", abilityPower: 0.15, moveSpeed: 0.3, passive: "lich_bane" },
};

/**
 * How each ability reaches, drawn on the ground while its key is held, like League's own indicators.
 * `range` is League's cast range at 30 League units per surviv unit (the 1x scope shows about as much
 * of the world as League's camera does), from Data Dragon 16.21.1 champion data; `radius` is the area
 * it covers. 200 is League's "global" (25000), which crosses the whole screen and then some.
 */
export type Indicator =
    /** a skillshot down the aim line */
    | "line"
    /** a cone from the champion */
    | "cone"
    /** an area dropped at the cursor, inside `range` */
    | "circle"
    /** an area around the champion */
    | "self"
    /** a wall across the aim line, at `range` */
    | "wall";

export interface AbilityRange {
    range: number;
    indicator: Indicator;
    /** units: the area's radius, or a wall's half width */
    radius?: number;
}

export const AbilityRanges: Record<string, Record<AbilityKey, AbilityRange>> = {
    jinx: {
        q: { range: 20, indicator: "self" }, // Fishbones' 600 attack range
        w: { range: 48, indicator: "line" }, // 1450
        e: { range: 31, indicator: "circle", radius: 4 }, // 925
        r: { range: 200, indicator: "line", radius: 4.3 }, // global
    },
    caitlyn: {
        q: { range: 42, indicator: "line" }, // 1250
        w: { range: 27, indicator: "circle", radius: 1.5 }, // 800
        e: { range: 25, indicator: "line" }, // 750
        r: { range: 117, indicator: "self" }, // 3500, at the nearest enemy
    },
    ashe: {
        q: { range: 0, indicator: "self" }, // self-cast
        w: { range: 40, indicator: "cone", radius: 0.5 }, // 1200
        e: { range: 200, indicator: "self" }, // global scouting
        r: { range: 200, indicator: "line", radius: 4.3 }, // global
    },
    ezreal: {
        q: { range: 38, indicator: "line" }, // 1150
        w: { range: 38, indicator: "line" }, // 1150
        e: { range: 16, indicator: "circle", radius: 1 }, // 475, the blink
        r: { range: 200, indicator: "line", radius: 5.3 }, // global
    },
    lux: {
        q: { range: 39, indicator: "line" }, // 1175
        w: { range: 38, indicator: "self" }, // 1150, the shield travels through her
        e: { range: 37, indicator: "circle", radius: 10.6 }, // 1100, 320 area
        r: { range: 111, indicator: "line", radius: 3.5 }, // 3340
    },
    ahri: {
        q: { range: 32, indicator: "line" }, // 970
        w: { range: 23, indicator: "self" }, // 700, the fox-fires seek inside it
        e: { range: 33, indicator: "line" }, // 975
        r: { range: 15, indicator: "circle", radius: 1 }, // 450, each dash
    },
    yasuo: {
        q: { range: 16, indicator: "line" }, // 475
        w: { range: 13, indicator: "wall", radius: 5.3 }, // 400, 320 wide
        e: { range: 16, indicator: "self" }, // 475, dashes through an enemy in range
        r: { range: 47, indicator: "self" }, // 1400, to a knocked-up enemy
    },
    garen: {
        q: { range: 10, indicator: "self" }, // 300, his next attack
        w: { range: 0, indicator: "self" }, // self-cast
        e: { range: 11, indicator: "self", radius: 11 }, // 325 spin
        r: { range: 13, indicator: "circle", radius: 1.5 }, // 400
    },
    darius: {
        q: { range: 14, indicator: "self", radius: 14 }, // 425 blade radius
        w: { range: 10, indicator: "self" }, // 300, his next attack
        e: { range: 18, indicator: "cone", radius: 0.35 }, // 535
        r: { range: 15, indicator: "self" }, // 460, onto the nearest enemy
    },
    masteryi: {
        q: { range: 20, indicator: "self", radius: 20 }, // 600
        w: { range: 0, indicator: "self" }, // self-cast
        e: { range: 0, indicator: "self" }, // self-cast
        r: { range: 0, indicator: "self" }, // self-cast
    },
    aatrox: {
        q: { range: 200, indicator: "line", radius: 4 }, // global
        w: { range: 28, indicator: "circle", radius: 3 }, // 825
        e: { range: 200, indicator: "line", radius: 4 }, // global
        r: { range: 200, indicator: "self" }, // global
    },
    akali: {
        q: { range: 18, indicator: "line" }, // 550
        w: { range: 12, indicator: "line" }, // 350
        e: { range: 28, indicator: "line" }, // 825
        r: { range: 23, indicator: "line" }, // 675
    },
    akshan: {
        q: { range: 28, indicator: "line" }, // 850
        w: { range: 183, indicator: "self" }, // 5500
        e: { range: 27, indicator: "line" }, // 800
        r: { range: 83, indicator: "line" }, // 2500
    },
    alistar: {
        q: { range: 12, indicator: "self", radius: 12 }, // 365
        w: { range: 22, indicator: "line" }, // 650
        e: { range: 12, indicator: "self", radius: 12 }, // 350
        r: { range: 0, indicator: "self" }, // self-cast
    },
    ambessa: {
        q: { range: 22, indicator: "line" }, // 650
        w: { range: 11, indicator: "self", radius: 11 }, // 325
        e: { range: 11, indicator: "self", radius: 11 }, // 325
        r: { range: 42, indicator: "circle", radius: 3 }, // 1250
    },
    amumu: {
        q: { range: 37, indicator: "line" }, // 1100
        w: { range: 10, indicator: "self", radius: 10 }, // 300
        e: { range: 12, indicator: "self", radius: 12 }, // 350
        r: { range: 18, indicator: "line" }, // 550
    },
    anivia: {
        q: { range: 36, indicator: "circle", radius: 3 }, // 1075
        w: { range: 33, indicator: "wall", radius: 5 }, // 1000
        e: { range: 22, indicator: "circle", radius: 3 }, // 650
        r: { range: 25, indicator: "circle", radius: 3 }, // 750
    },
    annie: {
        q: { range: 21, indicator: "line" }, // 625
        w: { range: 20, indicator: "cone", radius: 0.5 }, // 600
        e: { range: 27, indicator: "self" }, // 800
        r: { range: 20, indicator: "circle", radius: 3 }, // 600
    },
    aphelios: {
        q: { range: 48, indicator: "cone", radius: 0.5 }, // 1450
        w: { range: 8, indicator: "line" }, // 250
        e: { range: 33, indicator: "line" }, // 1000
        r: { range: 43, indicator: "line" }, // 1300
    },
    aurelionsol: {
        q: { range: 25, indicator: "line" }, // 750
        w: { range: 50, indicator: "self" }, // 1500
        e: { range: 25, indicator: "self" }, // 750
        r: { range: 42, indicator: "circle", radius: 3 }, // 1250
    },
    aurora: {
        q: { range: 30, indicator: "line" }, // 900
        w: { range: 23, indicator: "line" }, // 700
        e: { range: 28, indicator: "line" }, // 825
        r: { range: 8, indicator: "self", radius: 8 }, // 250
    },
    azir: {
        q: { range: 25, indicator: "circle", radius: 3 }, // 740
        w: { range: 18, indicator: "circle", radius: 3 }, // 525
        e: { range: 37, indicator: "self" }, // 1100
        r: { range: 8, indicator: "wall", radius: 5 }, // 250
    },
    bard: {
        q: { range: 200, indicator: "line", radius: 4 }, // global
        w: { range: 27, indicator: "self" }, // 800
        e: { range: 30, indicator: "line" }, // 900
        r: { range: 113, indicator: "circle", radius: 3 }, // 3400
    },
    belveth: {
        q: { range: 15, indicator: "line" }, // 450
        w: { range: 24, indicator: "circle", radius: 3 }, // 715
        e: { range: 17, indicator: "self", radius: 17 }, // 500
        r: { range: 15, indicator: "circle", radius: 3 }, // 450
    },
    blitzcrank: {
        q: { range: 36, indicator: "line" }, // 1079
        w: { range: 0, indicator: "self" }, // self-cast
        e: { range: 10, indicator: "line" }, // 300
        r: { range: 20, indicator: "self" }, // 600
    },
    brand: {
        q: { range: 35, indicator: "line" }, // 1050
        w: { range: 30, indicator: "circle", radius: 3 }, // 900
        e: { range: 21, indicator: "line" }, // 625
        r: { range: 25, indicator: "line" }, // 750
    },
    braum: {
        q: { range: 33, indicator: "line" }, // 1000
        w: { range: 22, indicator: "self" }, // 650
        e: { range: 200, indicator: "line", radius: 4 }, // global
        r: { range: 42, indicator: "circle", radius: 3 }, // 1250
    },
    briar: {
        q: { range: 16, indicator: "line" }, // 475
        w: { range: 12, indicator: "self", radius: 12 }, // 350
        e: { range: 13, indicator: "wall", radius: 5 }, // 400
        r: { range: 200, indicator: "line" }, // 12000
    },
    camille: {
        q: { range: 11, indicator: "line" }, // 325
        w: { range: 20, indicator: "cone", radius: 0.5 }, // 610
        e: { range: 27, indicator: "wall", radius: 5 }, // 800
        r: { range: 16, indicator: "self" }, // 475
    },
    cassiopeia: {
        q: { range: 28, indicator: "self" }, // 850
        w: { range: 23, indicator: "line" }, // 700
        e: { range: 23, indicator: "line" }, // 700
        r: { range: 28, indicator: "line" }, // 825
    },
    chogath: {
        q: { range: 32, indicator: "circle", radius: 3 }, // 950
        w: { range: 10, indicator: "cone", radius: 0.5 }, // 300
        e: { range: 1, indicator: "self" }, // 40
        r: { range: 6, indicator: "self" }, // 175
    },
    corki: {
        q: { range: 28, indicator: "line" }, // 825
        w: { range: 20, indicator: "line" }, // 600
        e: { range: 20, indicator: "cone", radius: 0.5 }, // 600
        r: { range: 41, indicator: "line" }, // 1225
    },
    diana: {
        q: { range: 30, indicator: "cone", radius: 0.5 }, // 900
        w: { range: 27, indicator: "circle", radius: 3 }, // 800
        e: { range: 28, indicator: "line" }, // 825
        r: { range: 16, indicator: "self", radius: 16 }, // 475
    },
    drmundo: {
        q: { range: 33, indicator: "line" }, // 975
        w: { range: 11, indicator: "self", radius: 11 }, // 325
        e: { range: 0, indicator: "self" }, // self-cast
        r: { range: 1, indicator: "self" }, // 20
    },
    draven: {
        q: { range: 10, indicator: "self", radius: 10 }, // 300
        w: { range: 33, indicator: "line" }, // 1000
        e: { range: 35, indicator: "line" }, // 1050
        r: { range: 200, indicator: "line", radius: 4 }, // global
    },
    ekko: {
        q: { range: 36, indicator: "self" }, // 1075
        w: { range: 53, indicator: "line" }, // 1600
        e: { range: 11, indicator: "line" }, // 325
        r: { range: 28, indicator: "circle", radius: 3 }, // 850
    },
    elise: {
        q: { range: 21, indicator: "line" }, // 615
        w: { range: 32, indicator: "line" }, // 950
        e: { range: 36, indicator: "self" }, // 1075
        r: { range: 1, indicator: "self" }, // 20
    },
    evelynn: {
        q: { range: 27, indicator: "line" }, // 800
        w: { range: 53, indicator: "line" }, // 1600
        e: { range: 7, indicator: "line" }, // 210
        r: { range: 200, indicator: "self" }, // global
    },
    fiddlesticks: {
        q: { range: 19, indicator: "self" }, // 575
        w: { range: 22, indicator: "line" }, // 650
        e: { range: 28, indicator: "circle", radius: 3 }, // 850
        r: { range: 27, indicator: "circle", radius: 3 }, // 800
    },
    fiora: {
        q: { range: 13, indicator: "self", radius: 13 }, // 400
        w: { range: 25, indicator: "line" }, // 750
        e: { range: 14, indicator: "self" }, // 425
        r: { range: 17, indicator: "self" }, // 500
    },
    fizz: {
        q: { range: 18, indicator: "line" }, // 550
        w: { range: 20, indicator: "line" }, // 600
        e: { range: 13, indicator: "self", radius: 13 }, // 400
        r: { range: 43, indicator: "circle", radius: 3 }, // 1300
    },
    galio: {
        q: { range: 28, indicator: "line" }, // 825
        w: { range: 9, indicator: "self", radius: 9 }, // 275
        e: { range: 22, indicator: "line" }, // 650
        r: { range: 183, indicator: "self" }, // 5500
    },
    gangplank: {
        q: { range: 21, indicator: "line" }, // 625
        w: { range: 13, indicator: "line" }, // 400
        e: { range: 33, indicator: "circle", radius: 3 }, // 1000
        r: { range: 200, indicator: "self" }, // global
    },
    gnar: {
        q: { range: 37, indicator: "line" }, // 1100
        w: { range: 0, indicator: "self" }, // self-cast
        e: { range: 16, indicator: "self", radius: 16 }, // 475
        r: { range: 20, indicator: "wall", radius: 5 }, // 590
    },
    gragas: {
        q: { range: 28, indicator: "circle", radius: 3 }, // 850
        w: { range: 1, indicator: "self", radius: 1 }, // 20
        e: { range: 20, indicator: "circle", radius: 3 }, // 600
        r: { range: 33, indicator: "circle", radius: 3 }, // 1000
    },
    graves: {
        q: { range: 31, indicator: "line" }, // 925
        w: { range: 32, indicator: "line" }, // 950
        e: { range: 14, indicator: "self" }, // 425
        r: { range: 33, indicator: "cone", radius: 0.5 }, // 1000
    },
    gwen: {
        q: { range: 15, indicator: "cone", radius: 0.5 }, // 450
        w: { range: 0, indicator: "self" }, // self-cast
        e: { range: 13, indicator: "self" }, // 400
        r: { range: 40, indicator: "line" }, // 1200
    },
    hecarim: {
        q: { range: 12, indicator: "self", radius: 12 }, // 350
        w: { range: 18, indicator: "line" }, // 525
        e: { range: 10, indicator: "line" }, // 300
        r: { range: 200, indicator: "line", radius: 4 }, // global
    },
    heimerdinger: {
        q: { range: 12, indicator: "circle", radius: 3 }, // 350
        w: { range: 44, indicator: "line" }, // 1325
        e: { range: 32, indicator: "circle", radius: 3 }, // 970
        r: { range: 0, indicator: "self" }, // self-cast
    },
    hwei: {
        q: { range: 0, indicator: "self" }, // self-cast
        w: { range: 0, indicator: "self" }, // self-cast
        e: { range: 0, indicator: "self" }, // self-cast
        r: { range: 43, indicator: "line" }, // 1300
    },
    illaoi: {
        q: { range: 28, indicator: "line" }, // 850
        w: { range: 13, indicator: "self", radius: 13 }, // 400
        e: { range: 30, indicator: "line" }, // 900
        r: { range: 15, indicator: "self", radius: 15 }, // 450
    },
    irelia: {
        q: { range: 20, indicator: "self" }, // 600
        w: { range: 28, indicator: "line" }, // 825
        e: { range: 28, indicator: "self" }, // 850
        r: { range: 32, indicator: "wall", radius: 5 }, // 950
    },
    ivern: {
        q: { range: 38, indicator: "line" }, // 1125
        w: { range: 38, indicator: "line" }, // 1150
        e: { range: 25, indicator: "self" }, // 750
        r: { range: 20, indicator: "circle", radius: 3 }, // 600
    },
    janna: {
        q: { range: 36, indicator: "circle", radius: 3 }, // 1075
        w: { range: 200, indicator: "self" }, // global
        e: { range: 27, indicator: "self" }, // 800
        r: { range: 24, indicator: "circle", radius: 3 }, // 725
    },
    jarvaniv: {
        q: { range: 26, indicator: "self" }, // 770
        w: { range: 21, indicator: "line" }, // 625
        e: { range: 29, indicator: "self" }, // 860
        r: { range: 22, indicator: "self" }, // 650
    },
    jax: {
        q: { range: 23, indicator: "line" }, // 700
        w: { range: 10, indicator: "line" }, // 300
        e: { range: 10, indicator: "self", radius: 10 }, // 300
        r: { range: 9, indicator: "self", radius: 9 }, // 260
    },
    jayce: {
        q: { range: 20, indicator: "line" }, // 600
        w: { range: 10, indicator: "self", radius: 10 }, // 285
        e: { range: 8, indicator: "self" }, // 240
        r: { range: 20, indicator: "line" }, // 600
    },
    jhin: {
        q: { range: 18, indicator: "line" }, // 550
        w: { range: 100, indicator: "line" }, // 3000
        e: { range: 25, indicator: "self" }, // 750
        r: { range: 200, indicator: "line", radius: 4 }, // global
    },
    ksante: {
        q: { range: 15, indicator: "self", radius: 15 }, // 450
        w: { range: 20, indicator: "line" }, // 600
        e: { range: 18, indicator: "self" }, // 525
        r: { range: 8, indicator: "wall", radius: 5 }, // 250
    },
    kaisa: {
        q: { range: 20, indicator: "circle", radius: 3 }, // 600
        w: { range: 100, indicator: "line" }, // 3000
        e: { range: 0, indicator: "self" }, // self-cast
        r: { range: 100, indicator: "self" }, // 3000
    },
    kalista: {
        q: { range: 38, indicator: "line" }, // 1150
        w: { range: 167, indicator: "circle", radius: 3 }, // 5000
        e: { range: 33, indicator: "line" }, // 1000
        r: { range: 33, indicator: "self" }, // 1000
    },
    karma: {
        q: { range: 32, indicator: "self" }, // 950
        w: { range: 23, indicator: "self" }, // 675
        e: { range: 27, indicator: "self" }, // 800
        r: { range: 37, indicator: "line" }, // 1100
    },
    karthus: {
        q: { range: 29, indicator: "circle", radius: 3 }, // 875
        w: { range: 33, indicator: "line" }, // 1000
        e: { range: 18, indicator: "line" }, // 550
        r: { range: 200, indicator: "line" }, // 10000
    },
    kassadin: {
        q: { range: 22, indicator: "line" }, // 650
        w: { range: 0, indicator: "self" }, // self-cast
        e: { range: 13, indicator: "cone", radius: 0.5 }, // 400
        r: { range: 17, indicator: "self", radius: 17 }, // 500
    },
    katarina: {
        q: { range: 21, indicator: "circle", radius: 3 }, // 625
        w: { range: 200, indicator: "self" }, // global
        e: { range: 24, indicator: "self" }, // 725
        r: { range: 18, indicator: "self" }, // 550
    },
    kayle: {
        q: { range: 30, indicator: "circle", radius: 3 }, // 900
        w: { range: 30, indicator: "self" }, // 900
        e: { range: 18, indicator: "line" }, // 550
        r: { range: 30, indicator: "self" }, // 900
    },
    kayn: {
        q: { range: 12, indicator: "line" }, // 350
        w: { range: 23, indicator: "line" }, // 700
        e: { range: 13, indicator: "line" }, // 400
        r: { range: 18, indicator: "line" }, // 550
    },
    kennen: {
        q: { range: 32, indicator: "circle", radius: 3 }, // 950
        w: { range: 24, indicator: "self" }, // 725
        e: { range: 6, indicator: "circle", radius: 3 }, // 170
        r: { range: 18, indicator: "circle", radius: 3 }, // 550
    },
    khazix: {
        q: { range: 11, indicator: "line" }, // 325
        w: { range: 33, indicator: "cone", radius: 0.5 }, // 1000
        e: { range: 23, indicator: "circle", radius: 3 }, // 700
        r: { range: 200, indicator: "self" }, // global
    },
    kindred: {
        q: { range: 11, indicator: "self", radius: 11 }, // 340
        w: { range: 19, indicator: "line" }, // 560
        e: { range: 17, indicator: "line" }, // 500
        r: { range: 17, indicator: "circle", radius: 3 }, // 500
    },
    kled: {
        q: { range: 27, indicator: "self" }, // 800
        w: { range: 0, indicator: "self" }, // self-cast
        e: { range: 18, indicator: "line" }, // 550
        r: { range: 150, indicator: "circle", radius: 3 }, // 4500
    },
    kogmaw: {
        q: { range: 39, indicator: "line" }, // 1175
        w: { range: 18, indicator: "line" }, // 530
        e: { range: 40, indicator: "line" }, // 1200
        r: { range: 60, indicator: "line" }, // 1800
    },
    leblanc: {
        q: { range: 23, indicator: "self" }, // 700
        w: { range: 20, indicator: "circle", radius: 3 }, // 600
        e: { range: 31, indicator: "line" }, // 925
        r: { range: 200, indicator: "self" }, // global
    },
    leesin: {
        q: { range: 37, indicator: "line" }, // 1100
        w: { range: 23, indicator: "self" }, // 700
        e: { range: 15, indicator: "self", radius: 15 }, // 450
        r: { range: 13, indicator: "line" }, // 375
    },
    leona: {
        q: { range: 3, indicator: "self" }, // 100
        w: { range: 15, indicator: "self", radius: 15 }, // 450
        e: { range: 29, indicator: "line" }, // 875
        r: { range: 40, indicator: "circle", radius: 3 }, // 1200
    },
    lillia: {
        q: { range: 15, indicator: "self", radius: 15 }, // 450
        w: { range: 17, indicator: "self", radius: 17 }, // 500
        e: { range: 23, indicator: "wall", radius: 5 }, // 700
        r: { range: 53, indicator: "line" }, // 1600
    },
    lissandra: {
        q: { range: 24, indicator: "line" }, // 725
        w: { range: 15, indicator: "self", radius: 15 }, // 450
        e: { range: 35, indicator: "circle", radius: 3 }, // 1050
        r: { range: 18, indicator: "self" }, // 550
    },
    locke: {
        q: { range: 32, indicator: "line" }, // 950
        w: { range: 8, indicator: "line" }, // 250
        e: { range: 14, indicator: "circle", radius: 3 }, // 425
        r: { range: 33, indicator: "self" }, // 1000
    },
    lucian: {
        q: { range: 17, indicator: "line" }, // 500
        w: { range: 30, indicator: "self" }, // 900
        e: { range: 15, indicator: "line" }, // 445
        r: { range: 47, indicator: "line" }, // 1400
    },
    lulu: {
        q: { range: 31, indicator: "line" }, // 925
        w: { range: 22, indicator: "self" }, // 650
        e: { range: 22, indicator: "self" }, // 650
        r: { range: 30, indicator: "self" }, // 900
    },
    malphite: {
        q: { range: 21, indicator: "circle", radius: 3 }, // 625
        w: { range: 13, indicator: "line" }, // 400
        e: { range: 13, indicator: "self", radius: 13 }, // 400
        r: { range: 33, indicator: "circle", radius: 3 }, // 1000
    },
    malzahar: {
        q: { range: 30, indicator: "line" }, // 900
        w: { range: 5, indicator: "self", radius: 5 }, // 150
        e: { range: 22, indicator: "line" }, // 650
        r: { range: 23, indicator: "self" }, // 700
    },
    maokai: {
        q: { range: 20, indicator: "line" }, // 600
        w: { range: 18, indicator: "line" }, // 525
        e: { range: 37, indicator: "circle", radius: 3 }, // 1100
        r: { range: 100, indicator: "wall", radius: 5 }, // 3000
    },
    mel: {
        q: { range: 32, indicator: "line" }, // 950
        w: { range: 8, indicator: "self", radius: 8 }, // 250
        e: { range: 33, indicator: "line" }, // 1000
        r: { range: 200, indicator: "self" }, // global
    },
    milio: {
        q: { range: 40, indicator: "circle", radius: 3 }, // 1200
        w: { range: 12, indicator: "self" }, // 350
        e: { range: 22, indicator: "self" }, // 650
        r: { range: 23, indicator: "line" }, // 700
    },
    missfortune: {
        q: { range: 22, indicator: "line" }, // 650
        w: { range: 20, indicator: "line" }, // 600
        e: { range: 33, indicator: "circle", radius: 3 }, // 1000
        r: { range: 200, indicator: "self" }, // global
    },
    monkeyking: {
        q: { range: 12, indicator: "line" }, // 350
        w: { range: 9, indicator: "self", radius: 9 }, // 275
        e: { range: 22, indicator: "self" }, // 650
        r: { range: 11, indicator: "self", radius: 11 }, // 315
    },
    mordekaiser: {
        q: { range: 23, indicator: "circle", radius: 3 }, // 675
        w: { range: 200, indicator: "self" }, // global
        e: { range: 23, indicator: "circle", radius: 3 }, // 700
        r: { range: 22, indicator: "line" }, // 650
    },
    morgana: {
        q: { range: 42, indicator: "circle", radius: 3 }, // 1250
        w: { range: 30, indicator: "circle", radius: 3 }, // 900
        e: { range: 27, indicator: "line" }, // 800
        r: { range: 21, indicator: "circle", radius: 3 }, // 625
    },
    naafiri: {
        q: { range: 30, indicator: "line" }, // 900
        w: { range: 13, indicator: "line" }, // 400
        e: { range: 15, indicator: "self", radius: 15 }, // 450
        r: { range: 30, indicator: "line" }, // 900
    },
    nami: {
        q: { range: 29, indicator: "circle", radius: 3 }, // 875
        w: { range: 24, indicator: "line" }, // 725
        e: { range: 27, indicator: "self" }, // 800
        r: { range: 85, indicator: "circle", radius: 3 }, // 2550
    },
    nasus: {
        q: { range: 9, indicator: "line" }, // 255
        w: { range: 23, indicator: "self" }, // 700
        e: { range: 22, indicator: "circle", radius: 3 }, // 650
        r: { range: 13, indicator: "self", radius: 13 }, // 400
    },
    nautilus: {
        q: { range: 38, indicator: "line" }, // 1150
        w: { range: 12, indicator: "self", radius: 12 }, // 350
        e: { range: 20, indicator: "line" }, // 600
        r: { range: 28, indicator: "line" }, // 825
    },
    neeko: {
        q: { range: 27, indicator: "line" }, // 800
        w: { range: 30, indicator: "line" }, // 900
        e: { range: 33, indicator: "line" }, // 1000
        r: { range: 20, indicator: "line" }, // 600
    },
    nidalee: {
        q: { range: 50, indicator: "self" }, // 1500
        w: { range: 30, indicator: "circle", radius: 3 }, // 900
        e: { range: 30, indicator: "line" }, // 900
        r: { range: 1, indicator: "self" }, // 20
    },
    nilah: {
        q: { range: 20, indicator: "line" }, // 600
        w: { range: 5, indicator: "self" }, // 150
        e: { range: 18, indicator: "self" }, // 550
        r: { range: 13, indicator: "self", radius: 13 }, // 400
    },
    nocturne: {
        q: { range: 38, indicator: "line" }, // 1125
        w: { range: 1, indicator: "self" }, // 20
        e: { range: 14, indicator: "circle", radius: 3 }, // 425
        r: { range: 133, indicator: "self" }, // 4000
    },
    nunu: {
        q: { range: 4, indicator: "self" }, // 125
        w: { range: 200, indicator: "line" }, // 7500
        e: { range: 21, indicator: "line" }, // 625
        r: { range: 22, indicator: "circle", radius: 3 }, // 650
    },
    olaf: {
        q: { range: 33, indicator: "circle", radius: 3 }, // 1000
        w: { range: 23, indicator: "line" }, // 700
        e: { range: 11, indicator: "line" }, // 325
        r: { range: 13, indicator: "line" }, // 400
    },
    orianna: {
        q: { range: 27, indicator: "circle", radius: 3 }, // 815
        w: { range: 8, indicator: "self", radius: 8 }, // 225
        e: { range: 37, indicator: "self" }, // 1095
        r: { range: 14, indicator: "self", radius: 14 }, // 410
    },
    ornn: {
        q: { range: 27, indicator: "circle", radius: 3 }, // 800
        w: { range: 200, indicator: "line", radius: 4 }, // global
        e: { range: 15, indicator: "self", radius: 15 }, // 450
        r: { range: 83, indicator: "circle", radius: 3 }, // 2500
    },
    pantheon: {
        q: { range: 19, indicator: "line" }, // 575
        w: { range: 20, indicator: "line" }, // 600
        e: { range: 13, indicator: "line" }, // 400
        r: { range: 183, indicator: "circle", radius: 3 }, // 5500
    },
    poppy: {
        q: { range: 14, indicator: "circle", radius: 3 }, // 430
        w: { range: 13, indicator: "self", radius: 13 }, // 400
        e: { range: 16, indicator: "wall", radius: 5 }, // 475
        r: { range: 17, indicator: "line" }, // 500
    },
    pyke: {
        q: { range: 13, indicator: "line" }, // 400
        w: { range: 20, indicator: "line" }, // 600
        e: { range: 18, indicator: "line" }, // 550
        r: { range: 25, indicator: "self" }, // 750
    },
    qiyana: {
        q: { range: 18, indicator: "line" }, // 525
        w: { range: 37, indicator: "circle", radius: 3 }, // 1100
        e: { range: 22, indicator: "line" }, // 650
        r: { range: 32, indicator: "line" }, // 950
    },
    quinn: {
        q: { range: 34, indicator: "circle", radius: 3 }, // 1025
        w: { range: 70, indicator: "circle", radius: 3 }, // 2100
        e: { range: 23, indicator: "line" }, // 675
        r: { range: 23, indicator: "line" }, // 700
    },
    rakan: {
        q: { range: 28, indicator: "line" }, // 850
        w: { range: 20, indicator: "circle", radius: 3 }, // 600
        e: { range: 22, indicator: "self" }, // 650
        r: { range: 5, indicator: "self" }, // 150
    },
    rammus: {
        q: { range: 10, indicator: "line" }, // 300
        w: { range: 10, indicator: "line" }, // 300
        e: { range: 11, indicator: "self" }, // 325
        r: { range: 200, indicator: "self" }, // global
    },
    reksai: {
        q: { range: 11, indicator: "self", radius: 11 }, // 325
        w: { range: 55, indicator: "circle", radius: 3 }, // 1650
        e: { range: 8, indicator: "line" }, // 250
        r: { range: 50, indicator: "self" }, // 1500
    },
    rell: {
        q: { range: 20, indicator: "line" }, // 600
        w: { range: 15, indicator: "line" }, // 450
        e: { range: 40, indicator: "self" }, // 1200
        r: { range: 7, indicator: "self", radius: 7 }, // 200
    },
    renata: {
        q: { range: 30, indicator: "line" }, // 900
        w: { range: 27, indicator: "self" }, // 800
        e: { range: 27, indicator: "line" }, // 800
        r: { range: 67, indicator: "line" }, // 2000
    },
    renekton: {
        q: { range: 11, indicator: "self", radius: 11 }, // 325
        w: { range: 10, indicator: "line" }, // 300
        e: { range: 15, indicator: "line" }, // 450
        r: { range: 1, indicator: "self", radius: 1 }, // 20
    },
    rengar: {
        q: { range: 15, indicator: "self" }, // 450
        w: { range: 15, indicator: "self" }, // 450
        e: { range: 33, indicator: "line" }, // 1000
        r: { range: 117, indicator: "self" }, // 3500
    },
    riven: {
        q: { range: 9, indicator: "self", radius: 9 }, // 275
        w: { range: 9, indicator: "self", radius: 9 }, // 260
        e: { range: 8, indicator: "line" }, // 250
        r: { range: 7, indicator: "line" }, // 200
    },
    rumble: {
        q: { range: 20, indicator: "cone", radius: 0.5 }, // 600
        w: { range: 1, indicator: "circle", radius: 3 }, // 20
        e: { range: 28, indicator: "circle", radius: 3 }, // 850
        r: { range: 58, indicator: "wall", radius: 5 }, // 1750
    },
    ryze: {
        q: { range: 33, indicator: "line" }, // 1000
        w: { range: 21, indicator: "line" }, // 615
        e: { range: 21, indicator: "line" }, // 615
        r: { range: 100, indicator: "circle", radius: 3 }, // 3000
    },
    samira: {
        q: { range: 32, indicator: "line" }, // 950
        w: { range: 11, indicator: "self", radius: 11 }, // 325
        e: { range: 20, indicator: "self" }, // 600
        r: { range: 20, indicator: "line" }, // 600
    },
    sejuani: {
        q: { range: 22, indicator: "self" }, // 650
        w: { range: 20, indicator: "line" }, // 600
        e: { range: 19, indicator: "self" }, // 560
        r: { range: 43, indicator: "circle", radius: 3 }, // 1300
    },
    senna: {
        q: { range: 20, indicator: "line" }, // 600
        w: { range: 42, indicator: "line" }, // 1250
        e: { range: 13, indicator: "self", radius: 13 }, // 400
        r: { range: 200, indicator: "line", radius: 4 }, // global
    },
    seraphine: {
        q: { range: 30, indicator: "circle", radius: 3 }, // 900
        w: { range: 27, indicator: "line" }, // 800
        e: { range: 43, indicator: "line" }, // 1300
        r: { range: 200, indicator: "self" }, // global
    },
    sett: {
        q: { range: 0, indicator: "self" }, // self-cast
        w: { range: 200, indicator: "self" }, // global
        e: { range: 16, indicator: "line" }, // 490
        r: { range: 13, indicator: "self", radius: 13 }, // 400
    },
    shaco: {
        q: { range: 13, indicator: "self" }, // 400
        w: { range: 17, indicator: "self", radius: 17 }, // 500
        e: { range: 21, indicator: "line" }, // 625
        r: { range: 7, indicator: "self", radius: 7 }, // 200
    },
    shen: {
        q: { range: 13, indicator: "self" }, // 400
        w: { range: 13, indicator: "line" }, // 400
        e: { range: 20, indicator: "line" }, // 600
        r: { range: 200, indicator: "self" }, // global
    },
    shyvana: {
        q: { range: 200, indicator: "self" }, // global
        w: { range: 12, indicator: "self", radius: 12 }, // 350
        e: { range: 27, indicator: "line" }, // 800
        r: { range: 35, indicator: "line" }, // 1050
    },
    singed: {
        q: { range: 1, indicator: "self" }, // 20
        w: { range: 33, indicator: "circle", radius: 3 }, // 1000
        e: { range: 4, indicator: "self" }, // 125
        r: { range: 1, indicator: "self" }, // 20
    },
    sion: {
        q: { range: 200, indicator: "circle", radius: 3 }, // 10000
        w: { range: 17, indicator: "self", radius: 17 }, // 500
        e: { range: 27, indicator: "line" }, // 800
        r: { range: 200, indicator: "circle", radius: 3 }, // 7500
    },
    sivir: {
        q: { range: 40, indicator: "line" }, // 1200
        w: { range: 1, indicator: "self", radius: 1 }, // 20
        e: { range: 1, indicator: "self" }, // 20
        r: { range: 33, indicator: "line" }, // 1000
    },
    skarner: {
        q: { range: 13, indicator: "line" }, // 400
        w: { range: 23, indicator: "line" }, // 700
        e: { range: 57, indicator: "wall", radius: 5 }, // 1700
        r: { range: 21, indicator: "line" }, // 625
    },
    smolder: {
        q: { range: 18, indicator: "line" }, // 550
        w: { range: 50, indicator: "line" }, // 1500
        e: { range: 23, indicator: "circle", radius: 3 }, // 700
        r: { range: 140, indicator: "line" }, // 4200
    },
    sona: {
        q: { range: 28, indicator: "circle", radius: 3 }, // 825
        w: { range: 33, indicator: "self" }, // 1000
        e: { range: 14, indicator: "self", radius: 14 }, // 430
        r: { range: 30, indicator: "line" }, // 900
    },
    soraka: {
        q: { range: 27, indicator: "self" }, // 810
        w: { range: 18, indicator: "line" }, // 550
        e: { range: 31, indicator: "circle", radius: 3 }, // 925
        r: { range: 200, indicator: "self" }, // global
    },
    swain: {
        q: { range: 25, indicator: "line" }, // 750
        w: { range: 200, indicator: "line" }, // 7500
        e: { range: 28, indicator: "line" }, // 850
        r: { range: 22, indicator: "line" }, // 650
    },
    sylas: {
        q: { range: 26, indicator: "circle", radius: 3 }, // 775
        w: { range: 13, indicator: "line" }, // 400
        e: { range: 13, indicator: "circle", radius: 3 }, // 400
        r: { range: 32, indicator: "line" }, // 950
    },
    syndra: {
        q: { range: 27, indicator: "line" }, // 800
        w: { range: 31, indicator: "line" }, // 925
        e: { range: 22, indicator: "line" }, // 650
        r: { range: 23, indicator: "self" }, // 675
    },
    tahmkench: {
        q: { range: 30, indicator: "self" }, // 900
        w: { range: 40, indicator: "circle", radius: 3 }, // 1200
        e: { range: 80, indicator: "line" }, // 2400
        r: { range: 200, indicator: "self" }, // global
    },
    taliyah: {
        q: { range: 33, indicator: "circle", radius: 3 }, // 1000
        w: { range: 30, indicator: "circle", radius: 3 }, // 900
        e: { range: 32, indicator: "line" }, // 950
        r: { range: 200, indicator: "wall", radius: 5 }, // 6500
    },
    talon: {
        q: { range: 19, indicator: "self" }, // 575
        w: { range: 22, indicator: "line" }, // 650
        e: { range: 24, indicator: "line" }, // 725
        r: { range: 18, indicator: "circle", radius: 3 }, // 550
    },
    taric: {
        q: { range: 11, indicator: "self", radius: 11 }, // 325
        w: { range: 27, indicator: "self" }, // 800
        e: { range: 20, indicator: "line" }, // 610
        r: { range: 13, indicator: "self", radius: 13 }, // 400
    },
    teemo: {
        q: { range: 23, indicator: "self" }, // 680
        w: { range: 1, indicator: "self" }, // 20
        e: { range: 23, indicator: "line" }, // 680
        r: { range: 30, indicator: "circle", radius: 3 }, // 900
    },
    thresh: {
        q: { range: 36, indicator: "line" }, // 1075
        w: { range: 32, indicator: "self" }, // 950
        e: { range: 17, indicator: "line" }, // 500
        r: { range: 15, indicator: "line" }, // 450
    },
    tristana: {
        q: { range: 1, indicator: "self" }, // 20
        w: { range: 30, indicator: "line" }, // 900
        e: { range: 18, indicator: "self" }, // 550
        r: { range: 18, indicator: "line" }, // 550
    },
    trundle: {
        q: { range: 10, indicator: "line" }, // 300
        w: { range: 25, indicator: "circle", radius: 3 }, // 750
        e: { range: 33, indicator: "circle", radius: 3 }, // 1000
        r: { range: 22, indicator: "line" }, // 650
    },
    tryndamere: {
        q: { range: 13, indicator: "line" }, // 400
        w: { range: 28, indicator: "line" }, // 850
        e: { range: 22, indicator: "self" }, // 650
        r: { range: 13, indicator: "line" }, // 400
    },
    twistedfate: {
        q: { range: 200, indicator: "line" }, // 10000
        w: { range: 7, indicator: "line" }, // 200
        e: { range: 0, indicator: "self" }, // self-cast
        r: { range: 183, indicator: "circle", radius: 3 }, // 5500
    },
    twitch: {
        q: { range: 1, indicator: "self" }, // 20
        w: { range: 32, indicator: "circle", radius: 3 }, // 950
        e: { range: 40, indicator: "line" }, // 1200
        r: { range: 40, indicator: "line" }, // 1200
    },
    udyr: {
        q: { range: 20, indicator: "line" }, // 600
        w: { range: 0, indicator: "self" }, // self-cast
        e: { range: 20, indicator: "line" }, // 600
        r: { range: 12, indicator: "self", radius: 12 }, // 370
    },
    urgot: {
        q: { range: 27, indicator: "line" }, // 800
        w: { range: 16, indicator: "self", radius: 16 }, // 490
        e: { range: 16, indicator: "self" }, // 475
        r: { range: 83, indicator: "line" }, // 2500
    },
    varus: {
        q: { range: 31, indicator: "line" }, // 925
        w: { range: 25, indicator: "line" }, // 750
        e: { range: 31, indicator: "line" }, // 925
        r: { range: 43, indicator: "line" }, // 1300
    },
    vayne: {
        q: { range: 10, indicator: "circle", radius: 3 }, // 300
        w: { range: 25, indicator: "line" }, // 750
        e: { range: 18, indicator: "line" }, // 550
        r: { range: 0, indicator: "self" }, // self-cast
    },
    veigar: {
        q: { range: 33, indicator: "line" }, // 1000
        w: { range: 32, indicator: "circle", radius: 3 }, // 950
        e: { range: 24, indicator: "line" }, // 725
        r: { range: 22, indicator: "self" }, // 650
    },
    velkoz: {
        q: { range: 35, indicator: "line" }, // 1050
        w: { range: 35, indicator: "line" }, // 1050
        e: { range: 27, indicator: "circle", radius: 3 }, // 810
        r: { range: 53, indicator: "line" }, // 1575
    },
    vex: {
        q: { range: 40, indicator: "line" }, // 1200
        w: { range: 16, indicator: "self", radius: 16 }, // 475
        e: { range: 27, indicator: "circle", radius: 3 }, // 800
        r: { range: 100, indicator: "line" }, // 3000
    },
    vi: {
        q: { range: 8, indicator: "line" }, // 250
        w: { range: 25, indicator: "line" }, // 750
        e: { range: 13, indicator: "line" }, // 400
        r: { range: 27, indicator: "circle", radius: 3 }, // 800
    },
    viego: {
        q: { range: 20, indicator: "line" }, // 600
        w: { range: 13, indicator: "line" }, // 400
        e: { range: 25, indicator: "line" }, // 750
        r: { range: 17, indicator: "self", radius: 17 }, // 500
    },
    viktor: {
        q: { range: 20, indicator: "self" }, // 600
        w: { range: 27, indicator: "circle", radius: 3 }, // 800
        e: { range: 18, indicator: "line" }, // 525
        r: { range: 23, indicator: "self" }, // 700
    },
    vladimir: {
        q: { range: 20, indicator: "self" }, // 600
        w: { range: 12, indicator: "self" }, // 350
        e: { range: 20, indicator: "circle", radius: 3 }, // 600
        r: { range: 21, indicator: "circle", radius: 3 }, // 625
    },
    volibear: {
        q: { range: 10, indicator: "line" }, // 300
        w: { range: 11, indicator: "line" }, // 325
        e: { range: 40, indicator: "circle", radius: 3 }, // 1200
        r: { range: 18, indicator: "circle", radius: 3 }, // 550
    },
    warwick: {
        q: { range: 12, indicator: "line" }, // 365
        w: { range: 133, indicator: "line" }, // 4000
        e: { range: 13, indicator: "self", radius: 13 }, // 375
        r: { range: 200, indicator: "self" }, // global
    },
    xayah: {
        q: { range: 13, indicator: "line" }, // 400
        w: { range: 33, indicator: "circle", radius: 3 }, // 1000
        e: { range: 67, indicator: "line" }, // 2000
        r: { range: 15, indicator: "cone", radius: 0.5 }, // 450
    },
    xerath: {
        q: { range: 25, indicator: "line" }, // 750
        w: { range: 33, indicator: "circle", radius: 3 }, // 1000
        e: { range: 35, indicator: "line" }, // 1050
        r: { range: 167, indicator: "line" }, // 5000
    },
    xinzhao: {
        q: { range: 13, indicator: "line" }, // 375
        w: { range: 33, indicator: "line" }, // 1000
        e: { range: 22, indicator: "circle", radius: 3 }, // 650
        r: { range: 17, indicator: "self", radius: 17 }, // 500
    },
    yone: {
        q: { range: 15, indicator: "circle", radius: 3 }, // 450
        w: { range: 23, indicator: "cone", radius: 0.5 }, // 700
        e: { range: 200, indicator: "self" }, // global
        r: { range: 33, indicator: "line" }, // 1000
    },
    yorick: {
        q: { range: 0, indicator: "self" }, // self-cast
        w: { range: 20, indicator: "wall", radius: 5 }, // 600
        e: { range: 23, indicator: "self" }, // 700
        r: { range: 20, indicator: "self" }, // 600
    },
    yunara: {
        q: { range: 0, indicator: "self" }, // self-cast
        w: { range: 38, indicator: "line" }, // 1150
        e: { range: 0, indicator: "self" }, // self-cast
        r: { range: 0, indicator: "self" }, // self-cast
    },
    yuumi: {
        q: { range: 200, indicator: "line", radius: 4 }, // global
        w: { range: 200, indicator: "line", radius: 4 }, // global
        e: { range: 17, indicator: "self" }, // 500
        r: { range: 37, indicator: "line" }, // 1100
    },
    zaahen: {
        q: { range: 200, indicator: "line", radius: 4 }, // global
        w: { range: 28, indicator: "line" }, // 850
        e: { range: 200, indicator: "line", radius: 4 }, // global
        r: { range: 20, indicator: "line" }, // 600
    },
    zac: {
        q: { range: 27, indicator: "line" }, // 800
        w: { range: 12, indicator: "self", radius: 12 }, // 350
        e: { range: 10, indicator: "circle", radius: 3 }, // 300
        r: { range: 10, indicator: "line" }, // 300
    },
    zed: {
        q: { range: 30, indicator: "line" }, // 900
        w: { range: 22, indicator: "circle", radius: 3 }, // 650
        e: { range: 10, indicator: "self", radius: 10 }, // 290
        r: { range: 21, indicator: "self" }, // 625
    },
    zeri: {
        q: { range: 23, indicator: "line" }, // 700
        w: { range: 38, indicator: "wall", radius: 5 }, // 1150
        e: { range: 200, indicator: "line", radius: 4 }, // global
        r: { range: 27, indicator: "line" }, // 800
    },
    ziggs: {
        q: { range: 28, indicator: "line" }, // 850
        w: { range: 33, indicator: "line" }, // 1000
        e: { range: 30, indicator: "line" }, // 900
        r: { range: 167, indicator: "circle", radius: 3 }, // 5000
    },
    zilean: {
        q: { range: 30, indicator: "circle", radius: 3 }, // 900
        w: { range: 20, indicator: "line" }, // 600
        e: { range: 18, indicator: "self" }, // 550
        r: { range: 30, indicator: "self" }, // 900
    },
    zoe: {
        q: { range: 27, indicator: "line" }, // 800
        w: { range: 200, indicator: "line" }, // 6000
        e: { range: 27, indicator: "line" }, // 800
        r: { range: 19, indicator: "line" }, // 575
    },
    zyra: {
        q: { range: 27, indicator: "line" }, // 800
        w: { range: 28, indicator: "circle", radius: 3 }, // 850
        e: { range: 37, indicator: "circle", radius: 3 }, // 1100
        r: { range: 23, indicator: "circle", radius: 3 }, // 700
    },
};

/** item id -> loot/world image id, for the HUD */
export const ItemIcons: Record<string, string> = {
    infinity_edge: "lol_infinity_edge",
    lord_dominiks_regards: "lol_lord_dominiks_regards",
    the_collector: "lol_the_collector",
    phantom_dancer: "lol_phantom_dancer",
    kraken_slayer: "lol_kraken_slayer",
    trinity_force: "lol_trinity_force",
    stormsurge: "lol_stormsurge",
};

/** every spell is on this cooldown, whatever League's own number for it is */
const AbilityCooldown = 3;

const ab = (name: string, _leagueCooldown: number, description: string): AbilityDef => ({
    name,
    cooldown: AbilityCooldown,
    description,
});

// builds: METAsrc / Skill-Capped / Mobalytics / Blitz.gg most popular, patch 26.21
export const ChampionDefs: Record<string, ChampionDef> = {
    jinx: {
        name: "Jinx",
        title: "the Loose Cannon",
        health: 130,
        speedBonus: 0,
        gun: true,
        basic: { damage: 14, cooldown: 0.16 },
        passive: {
            name: "Get Excited!",
            description: "A kill or assist gives a big burst of move and attack speed for 6 s.",
        },
        abilities: {
            q: ab(
                "Switcheroo!",
                0.9,
                "Swap between Pow-Pow (fast minigun) and Fishbones (rockets that splash, more range).",
            ),
            w: ab("Zap!", 8, "A long shock blast that deals 50 and slows the first enemy hit."),
            e: ab("Flame Chompers!", 20, "Throws three chompers at the cursor that root and burn enemies who step in."),
            r: ab(
                "Super Mega Death Rocket!",
                10,
                "A rocket across the map that deals 80 + 25% missing health in a blast.",
            ),
        },
        items: [
            "hexoptics_c44",
            "berserkers_greaves",
            "runaans_hurricane",
            "infinity_edge",
            "lord_dominiks_regards",
            "guardian_angel",
        ],
        outfit: { base: 0x2b6fe0, hands: 0xe0359b, backpack: 0x1d4fa8 },
    },
    caitlyn: {
        name: "Caitlyn",
        title: "the Sheriff of Piltover",
        health: 125,
        speedBonus: 0,
        gun: true,
        basic: { damage: 30, cooldown: 0.75, range: 120 },
        passive: {
            name: "Headshot",
            description: "Every 6th basic attack, or the first on a trapped or netted enemy, deals 60% more.",
        },
        abilities: {
            q: ab("Piltover Peacemaker", 8, "A long piercing round, 60 to the first enemy and 40 to the rest."),
            w: ab("Yordle Snap Trap", 10, "Sets a trap at the cursor that roots for 1.5 s and sets up a Headshot."),
            e: ab("90 Caliber Net", 14, "Fires a net that slows and knocks Caitlyn back 6 tiles."),
            r: ab("Ace in the Hole", 10, "After 1 s, a homing shot at the nearest enemy within 80 tiles for 140."),
        },
        items: [
            "hexoptics_c44",
            "berserkers_greaves",
            "infinity_edge",
            "the_collector",
            "lord_dominiks_regards",
            "bloodthirster",
        ],
        outfit: { base: 0x6a3fa0, hands: 0x2b2b3a, backpack: 0xe8d9a8 },
    },
    ashe: {
        name: "Ashe",
        title: "the Frost Archer",
        health: 120,
        speedBonus: 0,
        gun: true,
        basic: { damage: 24, cooldown: 0.5 },
        passive: { name: "Frost Shot", description: "Basic attacks and abilities slow the enemies they hit." },
        abilities: {
            q: ab("Ranger's Focus", 10, "For 4 s, basic attacks are much faster and fire a flurry of 3 arrows."),
            w: ab("Volley", 7, "9 arrows in a cone, 25 each, that slow."),
            e: ab("Hawkshot", 30, "The hawk spirit scouts ahead: Ashe sees much further for 6 s."),
            r: ab(
                "Enchanted Crystal Arrow",
                10,
                "A huge arrow across the map that stuns the first enemy hit for up to 3.5 s and deals 100.",
            ),
        },
        items: [
            "hexoptics_c44",
            "berserkers_greaves",
            "phantom_dancer",
            "infinity_edge",
            "lord_dominiks_regards",
            "guardian_angel",
        ],
        outfit: { base: 0x7fb8e6, hands: 0x3d5f9a, backpack: 0xe9f3fb },
    },
    ezreal: {
        name: "Ezreal",
        title: "the Prodigal Explorer",
        health: 125,
        speedBonus: 0,
        gun: true,
        basic: { damage: 20, cooldown: 0.55 },
        passive: {
            name: "Rising Spell Force",
            description: "Each hit gives 10% attack speed for 6 s, up to 5 stacks.",
        },
        abilities: {
            q: ab("Mystic Shot", 4, "A fast bolt for 45 that cuts all his cooldowns by 1.5 s when it hits."),
            w: ab(
                "Essence Flux",
                9,
                "An orb that marks the first enemy; his next ability or attack on them detonates it for 50.",
            ),
            e: ab(
                "Arcane Shift",
                22,
                "Blinks 9 tiles toward the cursor and fires a homing bolt at the nearest enemy for 35.",
            ),
            r: ab("Trueshot Barrage", 10, "A huge beam across the map, through everything, for 110."),
        },
        items: [
            "ionian_boots_of_lucidity",
            "manamune",
            "trinity_force",
            "essence_reaver",
            "navori_flickerblade",
            "seryldas_grudge",
        ],
        outfit: { base: 0x3a5fb0, hands: 0xd9a441, backpack: 0x6b4a2b },
    },
    lux: {
        name: "Lux",
        title: "the Lady of Luminosity",
        health: 110,
        speedBonus: 0,
        gun: true,
        basic: { damage: 22, cooldown: 0.7 },
        passive: {
            name: "Illumination",
            description: "Abilities mark enemies; her next basic attack on a mark deals 30 more.",
        },
        abilities: {
            q: ab("Light Binding", 11, "A light orb that roots the first two enemies hit for 2 s and deals 50."),
            w: ab("Prismatic Barrier", 14, "A 60 shield for 3 s."),
            e: ab("Lucent Singularity", 10, "A zone at the cursor that slows, then bursts for 50."),
            r: ab("Final Spark", 10, "After 1 s, a giant laser across the map for 130."),
        },
        items: [
            "ludens_echo",
            "sorcerers_shoes",
            "stormsurge",
            "shadowflame",
            "rabadons_deathcap",
            "zhonyas_hourglass",
        ],
        outfit: { base: 0xf2f2f2, hands: 0x3a7bd5, backpack: 0xf2c94c },
    },
    ahri: {
        name: "Ahri",
        title: "the Nine-Tailed Fox",
        health: 115,
        speedBonus: 0.5,
        gun: true,
        basic: { damage: 20, cooldown: 0.6 },
        passive: { name: "Essence Theft", description: "Ability hits and kills heal her." },
        abilities: {
            q: ab(
                "Orb of Deception",
                6,
                "An orb out and back through enemies, 35 each way (the way back ignores armor).",
            ),
            w: ab("Fox-Fire", 8, "Three fox-fires seek the nearest enemies, 25 each, and a burst of speed."),
            e: ab("Charm", 12, "A kiss that charms the first enemy for 1.6 s and deals 45."),
            r: ab(
                "Spirit Rush",
                10,
                "Dashes toward the cursor, up to 3 times in 10 s, each firing 3 bolts at nearby enemies.",
            ),
        },
        items: [
            "spellslingers_shoes",
            "shadowflame",
            "zhonyas_hourglass",
            "malignance",
            "rabadons_deathcap",
            "lich_bane",
        ],
        outfit: { base: 0xc0395a, hands: 0xf4e1c1, backpack: 0x6c2bd9 },
    },
    yasuo: {
        name: "Yasuo",
        title: "the Unforgiven",
        health: 150,
        speedBonus: 1,
        gun: false,
        basic: { damage: 26, cooldown: 0.4 },
        passive: {
            name: "Way of the Wanderer",
            description: "Moving charges Flow, a 60 shield when hit by an enemy. Crit chance is doubled.",
        },
        abilities: {
            q: ab(
                "Steel Tempest",
                4,
                "Thrusts for 40. Two hits in a row ready a whirlwind that knocks enemies up for 1 s.",
            ),
            w: ab("Wind Wall", 22, "A wall of wind in front of him for 3 s that blocks enemy shots."),
            e: ab(
                "Sweeping Blade",
                0.5,
                "Dashes 6 tiles through the nearest enemy for 30. The same enemy only every 6 s.",
            ),
            r: ab(
                "Last Breath",
                10,
                "Blinks to a knocked-up enemy within 30 tiles, deals 110 and keeps them up 1 s more.",
            ),
        },
        items: [
            "berserkers_greaves",
            "immortal_shieldbow",
            "infinity_edge",
            "bloodthirster",
            "deaths_dance",
            "guardian_angel",
        ],
        outfit: { base: 0x2f5d8a, hands: 0xc9b27a, backpack: 0x1f3e5c },
    },
    garen: {
        name: "Garen",
        title: "the Might of Demacia",
        health: 220,
        speedBonus: 0.5,
        gun: false,
        basic: { damage: 28, cooldown: 0.6 },
        passive: { name: "Perseverance", description: "Out of combat for 4 s he heals quickly." },
        abilities: {
            q: ab(
                "Decisive Strike",
                8,
                "A burst of speed for 2 s; his next attack deals 40 more and silences (no abilities) for 1.5 s.",
            ),
            w: ab("Courage", 20, "For 4 s, takes 30% less damage, with a 50 shield."),
            e: ab("Judgment", 9, "Spins for 3 s, hitting everyone around him 12 times for 9."),
            r: ab(
                "Demacian Justice",
                10,
                "Calls down a sword on the enemy nearest the cursor: 70 + 30% of their missing health, ignoring armor.",
            ),
        },
        items: [
            "berserkers_greaves",
            "stridebreaker",
            "phantom_dancer",
            "dead_mans_plate",
            "steraks_gage",
            "deaths_dance",
        ],
        outfit: { base: 0x2f56c9, hands: 0xd8b44a, backpack: 0x8c96a8 },
    },
    darius: {
        name: "Darius",
        title: "the Hand of Noxus",
        health: 220,
        speedBonus: 0,
        gun: false,
        basic: { damage: 30, cooldown: 0.65 },
        passive: { name: "Hemorrhage", description: "Hits and abilities make enemies bleed." },
        abilities: {
            q: ab(
                "Decimate",
                9,
                "After 0.75 s, swings his axe around him: 50 to all in range (outer edge), heals 15 per enemy hit.",
            ),
            w: ab("Crippling Strike", 5, "His next attack deals 50% more and slows."),
            e: ab("Apprehend", 22, "Pulls enemies in front of him (12 tiles) to him and slows them."),
            r: ab(
                "Noxian Guillotine",
                10,
                "Leaps on the nearest enemy within 10 tiles for 75, more if they bleed. A kill resets it.",
            ),
        },
        items: [
            "youmuus_ghostblade",
            "plated_steelcaps",
            "dead_mans_plate",
            "steraks_gage",
            "sundered_sky",
            "deaths_dance",
        ],
        outfit: { base: 0x7a1f1f, hands: 0x2b2b2b, backpack: 0x4a4a4a },
    },
    masteryi: {
        name: "Master Yi",
        title: "the Wuju Bladesman",
        health: 170,
        speedBonus: 0.5,
        gun: false,
        basic: { damage: 24, cooldown: 0.5 },
        passive: { name: "Double Strike", description: "Every 4th basic attack strikes twice." },
        abilities: {
            q: ab(
                "Alpha Strike",
                18,
                "Vanishes and strikes up to 4 enemies within 10 tiles for 50 each, untargetable for 0.6 s.",
            ),
            w: ab("Meditate", 28, "Channels 3 s: heals 45% of missing health and takes 60% less damage."),
            e: ab("Wuju Style", 14, "For 5 s, basic attacks deal 15 true damage more."),
            r: ab(
                "Highlander",
                10,
                "For 7 s, much faster attacks and movement, and slows don't hold him. Kills extend it.",
            ),
        },
        items: [
            "kraken_slayer",
            "berserkers_greaves",
            "blade_of_the_ruined_king",
            "guinsoos_rageblade",
            "wits_end",
            "deaths_dance",
        ],
        outfit: { base: 0x3f7a3a, hands: 0xd4b23a, backpack: 0x2a2a2a },
    },
    aatrox: {
        name: "Aatrox",
        title: "the Darkin Blade",
        health: 175,
        speedBonus: 0.5,
        gun: false,
        basic: { damage: 33, cooldown: 0.55 },
        passive: {
            name: "Deathbringer Stance",
            description:
                "Periodically, Aatrox's next basic attack deals bonus magic damage and heals him, based on the target's max health.",
        },
        abilities: {
            q: ab(
                "The Darkin Blade",
                14,
                "Aatrox slams his greatsword down, dealing physical damage. He can swing three times, each with a different area of effect.",
            ),
            w: ab(
                "Infernal Chains",
                18,
                "Aatrox smashes the ground, dealing damage to the first enemy hit. Champions and large monsters have to leave the impact area quickly or they will be dragged to the center and take the damage again.",
            ),
            e: ab(
                "Umbral Dash",
                9,
                "Passively, Aatrox heals when damaging enemy champions. On activation, he dashes in a direction.",
            ),
            r: ab(
                "World Ender",
                120,
                "Aatrox unleashes his demonic form, fearing nearby enemy minions and gaining attack damage, increased healing, and Move Speed. If he gets a takedown, this effect is extended.",
            ),
        },
        items: [
            "berserkers_greaves",
            "stridebreaker",
            "phantom_dancer",
            "dead_mans_plate",
            "steraks_gage",
            "deaths_dance",
        ],
        outfit: { base: 0x5b4b19, hands: 0x995e3b, backpack: 0x51365b },
    },
    akali: {
        name: "Akali",
        title: "the Rogue Assassin",
        health: 162,
        speedBonus: 0.5,
        gun: false,
        basic: { damage: 34, cooldown: 0.45 },
        passive: {
            name: "Assassin's Mark",
            description:
                "Dealing spell damage to a champion creates a ring of energy around them. Exiting that ring empowers Akali's next Attack with bonus range and damage.",
        },
        abilities: {
            q: ab(
                "Five Point Strike",
                1.5,
                "Akali throws out five kunai, dealing damage based on her bonus Attack Damage and Ability Power and slowing.",
            ),
            w: ab(
                "Twilight Shroud",
                20,
                "Akali drops a cover of smoke and briefly gains Move Speed. While inside the shroud, Akali becomes invisible and unable to be selected by enemy spells and attacks. Attacking or using abilities will bri",
            ),
            e: ab(
                "Shuriken Flip",
                16,
                "Flip backward and fire a shuriken forward, dealing magic damage. The first enemy or smoke cloud hit is marked. Re-cast to dash to the marked target, dealing additional damage.",
            ),
            r: ab(
                "Perfect Execution",
                120,
                "Akali leaps in a direction, damaging enemies she strikes. Re-cast: Akali dashes in a direction, executing all enemies she strikes.",
            ),
        },
        items: [
            "youmuus_ghostblade",
            "plated_steelcaps",
            "the_collector",
            "infinity_edge",
            "lord_dominiks_regards",
            "bloodthirster",
        ],
        outfit: { base: 0x17daa9, hands: 0x245840, backpack: 0x2fdba0 },
    },
    akshan: {
        name: "Akshan",
        title: "the Rogue Sentinel",
        health: 165,
        speedBonus: 0,
        gun: true,
        basic: { damage: 29, cooldown: 0.5 },
        passive: {
            name: "Dirty Fighting",
            description:
                "Every three hits from Akshan's Attacks and Abilities deals bonus damage and grants him a Shield if the target was a champion.When Akshan Attacks, he fires an ad",
        },
        abilities: {
            q: ab(
                "Avengerang",
                9,
                "Akshan throws a boomerang that deals damage going out and coming back, extending its range each time it hits an enemy.",
            ),
            w: ab(
                "Going Rogue",
                18,
                "Akshan passively marks enemy champions as Scoundrels when they kill his ally champions. If Akshan kills a Scoundrel, he resurrects the allies they killed, gains bonus gold, and clears all marks.When a",
            ),
            e: ab(
                "Heroic Swing",
                18,
                "Akshan fires a grappling hook into terrain then swings around it, repeatedly firing at the nearest enemy while swinging. He can jump off early or gets knocked off when colliding with champions or terr",
            ),
            r: ab(
                "Comeuppance",
                100,
                "Akshan locks onto an enemy champion and starts storing bullets. When released, he fires all stored bullets, dealing damage based on missing health to the first champion, minion, or structure hit.",
            ),
        },
        items: [
            "hexoptics_c44",
            "berserkers_greaves",
            "runaans_hurricane",
            "infinity_edge",
            "lord_dominiks_regards",
            "guardian_angel",
        ],
        outfit: { base: 0x2e385b, hands: 0x272f3f, backpack: 0x388fc5 },
    },
    alistar: {
        name: "Alistar",
        title: "the Minotaur",
        health: 194,
        speedBonus: 0,
        gun: false,
        basic: { damage: 34, cooldown: 0.6 },
        passive: {
            name: "Triumphant Roar",
            description:
                "Alistar charges his roar by stunning or displacing enemy champions or when nearby enemies die. When fully charged he heals himself all nearby allied champions.",
        },
        abilities: {
            q: ab(
                "Pulverize",
                14,
                "Alistar smashes the ground, dealing damage to nearby enemies and tossing them into the air.",
            ),
            w: ab("Headbutt", 14, "Alistar rams a target with his head, dealing damage and knocking the target back."),
            e: ab(
                "Trample",
                12,
                "Alistar tramples nearby enemy units, ignoring unit collision and gaining stacks if he damages an enemy champion. At full stacks Alistar's next basic attack against an enemy champion deals additional m",
            ),
            r: ab(
                "Unbreakable Will",
                120,
                "Alistar lets out a wild roar, removing all crowd control effects on himself, and reducing incoming physical and magical damage for the duration.",
            ),
        },
        items: [
            "plated_steelcaps",
            "dead_mans_plate",
            "steraks_gage",
            "sundered_sky",
            "deaths_dance",
            "guardian_angel",
        ],
        outfit: { base: 0x397051, hands: 0x376796, backpack: 0x1d383b },
    },
    ambessa: {
        name: "Ambessa",
        title: "Matriarch of War",
        health: 170,
        speedBonus: 0.5,
        gun: false,
        basic: { damage: 34, cooldown: 0.55 },
        passive: {
            name: "Drakehound's Step",
            description:
                "Entering an attack or movement command while casting an ability will cause Ambessa to dash a short distance once the ability is cast, granting her next attack b",
        },
        abilities: {
            q: ab(
                "Cunning Sweep / Sundering Slam",
                14,
                "Ambessa sweeps her twin drakehounds in a semicircle in front of her, dealing bonus damage to enemies hit by the blades. Striking an enemy will transform the next cast of this ability for a short perio",
            ),
            w: ab(
                "Repudiation",
                18,
                "Ambessa gains a shield, briefly braces herself, and then slams the ground to damage nearby enemies. If she blocked any non-minion damage while bracing herself, this ability will deal increased damage.",
            ),
            e: ab(
                "Lacerate",
                13,
                "Ambessa whips her twin drakehounds around herself, damaging and slowing nearby enemies. Initiating Drakehound's Step from this ability causes her to strike a second time at the end of its dash.",
            ),
            r: ab(
                "Public Execution",
                130,
                "Ambessa blinks to the farthest enemy champion in a line of her choosing and suppresses them upon her arrival. She then slams the enemy into the ground where they take damage and are stunned.",
            ),
        },
        items: [
            "berserkers_greaves",
            "stridebreaker",
            "phantom_dancer",
            "dead_mans_plate",
            "steraks_gage",
            "deaths_dance",
        ],
        outfit: { base: 0x333d44, hands: 0x1c4226, backpack: 0x6dbc93 },
    },
    amumu: {
        name: "Amumu",
        title: "the Sad Mummy",
        health: 194,
        speedBonus: 0,
        gun: false,
        basic: { damage: 31, cooldown: 0.6 },
        passive: {
            name: "Cursed Touch",
            description:
                "Amumu's basic attacks Curse his enemies, causing them to take bonus true damage from incoming magic damage.",
        },
        abilities: {
            q: ab(
                "Bandage Toss",
                3,
                "Amumu tosses a sticky bandage at a target, stunning and damaging the target while he pulls himself to them.",
            ),
            w: ab(
                "Despair",
                1,
                "Overcome by anguish, nearby enemies lose a percentage of their maximum Health each second and have their Curses refreshed.",
            ),
            e: ab(
                "Tantrum",
                9,
                "Permanently reduces the physical damage Amumu would take. Amumu can unleash his rage, dealing damage to surrounding enemies. Each time Amumu is hit, the cooldown on Tantrum is reduced.",
            ),
            r: ab(
                "Curse of the Sad Mummy",
                150,
                "Amumu entangles surrounding enemy units in bandages, applying his Curse, damaging and stunning them.",
            ),
        },
        items: [
            "plated_steelcaps",
            "dead_mans_plate",
            "steraks_gage",
            "sundered_sky",
            "deaths_dance",
            "guardian_angel",
        ],
        outfit: { base: 0x2f79dc, hands: 0x1a701f, backpack: 0x473469 },
    },
    anivia: {
        name: "Anivia",
        title: "the Cryophoenix",
        health: 150,
        speedBonus: 0,
        gun: true,
        basic: { damage: 28, cooldown: 0.65 },
        passive: {
            name: "Rebirth",
            description: "Upon taking fatal damage, Anivia reverts to an egg and is reborn with full health.",
        },
        abilities: {
            q: ab(
                "Flash Frost",
                11,
                "Anivia brings her wings together and summons a sphere of ice that flies towards her opponents, chilling and damaging anyone in its path. When the sphere explodes it does moderate damage in a radius, s",
            ),
            w: ab(
                "Crystallize",
                17,
                "Anivia condenses the moisture in the air into an impassable wall of ice to block all movement. The wall only lasts a short duration before it melts.",
            ),
            e: ab(
                "Frostbite",
                4,
                "With a flap of her wings, Anivia blasts a freezing gust of wind at her target, dealing damage. If the target was recently hit by Flash Frost or damaged by a fully formed Glacial Storm, the damage they",
            ),
            r: ab(
                "Glacial Storm",
                4,
                "Anivia summons a driving rain of ice and hail to damage her enemies and slow their advance.",
            ),
        },
        items: [
            "ludens_echo",
            "sorcerers_shoes",
            "stormsurge",
            "shadowflame",
            "rabadons_deathcap",
            "zhonyas_hourglass",
        ],
        outfit: { base: 0x4a1e5d, hands: 0x5d90b3, backpack: 0xbcd91a },
    },
    annie: {
        name: "Annie",
        title: "the Dark Child",
        health: 137,
        speedBonus: 0,
        gun: true,
        basic: { damage: 28, cooldown: 0.65 },
        passive: {
            name: "Pyromania",
            description:
                "After casting 4 spells, Annie's next offensive spell will stun the target.Annie begins the game and respawns with Pyromania available.",
        },
        abilities: {
            q: ab(
                "Disintegrate",
                4,
                "Annie hurls a Mana infused fireball, dealing damage and refunding the Mana cost if it destroys the target.",
            ),
            w: ab("Incinerate", 7, "Annie casts a blazing cone of fire, dealing damage to all enemies in the area."),
            e: ab(
                "Molten Shield",
                10,
                "Grants Annie or an ally a shield, a burst of Move Speed, and damages enemies who strike her with attacks or spells.",
            ),
            r: ab(
                "Summon: Tibbers",
                130,
                "Annie wills her bear Tibbers to life, dealing damage to units in the area. Tibbers can attack and also burns enemies that stand near him.",
            ),
        },
        items: [
            "ludens_echo",
            "sorcerers_shoes",
            "stormsurge",
            "shadowflame",
            "rabadons_deathcap",
            "zhonyas_hourglass",
        ],
        outfit: { base: 0x62461f, hands: 0xbb9e2c, backpack: 0x298240 },
    },
    aphelios: {
        name: "Aphelios",
        title: "the Weapon of the Faithful",
        health: 162,
        speedBonus: 0,
        gun: true,
        basic: { damage: 30, cooldown: 0.5 },
        passive: {
            name: "The Hitman and the Seer",
            description:
                "Aphelios wields 5 Lunari Weapons made by his sister Alune. He has access to two at a time: one main-hand and one off-hand. Each weapon has a unique Basic Attack",
        },
        abilities: {
            q: ab(
                "Weapon Abilites",
                9,
                "Aphelios has 5 different activated abilities, based on his main-hand weapon:Calibrum (Rifle): Long range shot that marks its target for a long-range follow-up attack.Severum (Scythe Pistol): Run fast ",
            ),
            w: ab(
                "Phase",
                0.8,
                "Aphelios swaps his main-hand gun with his off-hand gun, replacing his basic attack and activated ability.",
            ),
            e: ab(
                "Weapon Queue System",
                0,
                "Aphelios has no third ability. This slot shows the next weapon Alune will give him. Weapon order begins fixed but may change over game time -- when a weapon is out of ammo it goes to the end of the or",
            ),
            r: ab(
                "Moonlight Vigil",
                120,
                "Fire a concentrated blast of moonlight that explodes on enemy champions. Applies the unique effect of Aphelios' main-hand gun.",
            ),
        },
        items: [
            "hexoptics_c44",
            "berserkers_greaves",
            "runaans_hurricane",
            "infinity_edge",
            "lord_dominiks_regards",
            "guardian_angel",
        ],
        outfit: { base: 0x4169bd, hands: 0x4258c6, backpack: 0x55a61d },
    },
    aurelionsol: {
        name: "Aurelion Sol",
        title: "The Star Forger",
        health: 162,
        speedBonus: 0,
        gun: true,
        basic: { damage: 32, cooldown: 0.65 },
        passive: {
            name: "Cosmic Creator",
            description:
                "Aurelion Sol's damaging Abilities break down enemies into stacks of Stardust, which permanently improves each of his abilities.",
        },
        abilities: {
            q: ab(
                "Breath of Light",
                3,
                "Aurelion Sol channels his dragon breath for a few seconds, damaging the first enemy hit and splashing reduced damage onto nearby enemies. Each second the breath is channeled directly at an enemy will ",
            ),
            w: ab(
                "Astral Flight",
                22,
                "Aurelion Sol flies over terrain in a targeted direction. While in this state, he can cast other abilities. Breath of Light no longer has a cooldown or maximum channel duration and deals increased dama",
            ),
            e: ab(
                "Singularity",
                12,
                "Aurelion Sol summons a black hole, damaging enemies and slowly pulling them toward its center. This ability grants Stardust each time an enemy dies within the black hole and for each second an enemy c",
            ),
            r: ab(
                "Falling Star / The Skies Descend",
                120,
                "Falling Star: Aurelion Sol crashes a star into the earth. This impact deals magic damage and stuns enemies while also granting Stardust for each enemy champion it hits. Gathering enough Stardust trans",
            ),
        },
        items: [
            "ludens_echo",
            "sorcerers_shoes",
            "stormsurge",
            "shadowflame",
            "rabadons_deathcap",
            "zhonyas_hourglass",
        ],
        outfit: { base: 0xd83c37, hands: 0x3fa654, backpack: 0x238b65 },
    },
    aurora: {
        name: "Aurora",
        title: "the Witch Between Worlds",
        health: 164,
        speedBonus: 0,
        gun: true,
        basic: { damage: 29, cooldown: 0.65 },
        passive: {
            name: "Spirit Abjuration",
            description:
                "Aurora's spells and attacks exorcise spirits from the enemies she damages. Exorcised spirits follow Aurora around and heal her.",
        },
        abilities: {
            q: ab(
                "Twofold Hex",
                9,
                "Aurora sends out a missile that curses any enemies it hits. She can then recast the ability to draw active curses back toward herself, damaging foes who are hit along the way.",
            ),
            w: ab(
                "Across the Veil",
                22,
                "Aurora leaps in a direction of her choosing, entering the spirit realm upon landing, becoming invisible, and gaining Move Speed for a short duration of time.",
            ),
            e: ab(
                "The Weirding",
                15,
                "Aurora converges the realms, sending out a blast of spirit magic that damages and slows enemies before Aurora hops backward to safety.",
            ),
            r: ab(
                "Between Worlds",
                140,
                "Aurora leaps in a direction of her choosing, releasing a shockwave that damages and slows any enemies it hits. Afterward, she creates an area that slows enemies within it and allows Aurora to teleport",
            ),
        },
        items: [
            "ludens_echo",
            "sorcerers_shoes",
            "stormsurge",
            "shadowflame",
            "rabadons_deathcap",
            "zhonyas_hourglass",
        ],
        outfit: { base: 0x2b9329, hands: 0x155b81, backpack: 0x7235bc },
    },
    azir: {
        name: "Azir",
        title: "the Emperor of the Sands",
        health: 156,
        speedBonus: 0,
        gun: true,
        basic: { damage: 31, cooldown: 0.65 },
        passive: {
            name: "Shurima's Legacy",
            description: "Azir can summon the Disc of the Sun from the ruins of allied or enemy turrets.",
        },
        abilities: {
            q: ab(
                "Conquering Sands",
                14,
                "Azir sends all Sand Soldiers towards a location. Sand Soldiers deal magic damage to enemies they pass through and apply a slow for 1 second.",
            ),
            w: ab(
                "Arise!",
                1.5,
                "Azir summons a Sand Soldier to attack nearby targets for him, replacing his basic attack against targets within the soldier's range. Their attacks deal magic damage to enemies in a line.",
            ),
            e: ab(
                "Shifting Sands",
                22,
                "Azir shields himself briefly and dashes to one of his Sand Soldiers, damaging enemies. If he hits an enemy champion, he instantly readies a new Sand Soldier for deployment and halts his dash.",
            ),
            r: ab(
                "Emperor's Divide",
                120,
                "Azir summons a wall of soldiers which charge forward, knocking back and damaging enemies.",
            ),
        },
        items: [
            "ludens_echo",
            "sorcerers_shoes",
            "stormsurge",
            "shadowflame",
            "rabadons_deathcap",
            "zhonyas_hourglass",
        ],
        outfit: { base: 0x20cc38, hands: 0x1c7122, backpack: 0x446e21 },
    },
    bard: {
        name: "Bard",
        title: "the Wandering Caretaker",
        health: 155,
        speedBonus: 0,
        gun: true,
        basic: { damage: 29, cooldown: 0.6 },
        passive: {
            name: "Traveler's Call",
            description:
                "Meeps: Bard attracts lesser spirits that assist with his basic attacks to deal extra magic damage. When Bard has collected enough Chimes, his meeps will also de",
        },
        abilities: {
            q: ab(
                "Cosmic Binding",
                11,
                "Bard fires a missile which will slow the first enemy struck, and continue onward. If it strikes a wall, it will stun the initial target; if it strikes another enemy, it will stun them both.",
            ),
            w: ab(
                "Caretaker's Shrine",
                0,
                "Reveals a Health shrine which powers up over a short time, disappearing after healing and speeding up the first ally that touches it.",
            ),
            e: ab(
                "Magical Journey",
                22,
                "Bard opens a portal in nearby terrain. Allies and enemies alike can take a one-way trip through that terrain by moving into the portal.",
            ),
            r: ab(
                "Tempered Fate",
                110,
                "Bard sends spirit energy arcing to a location, putting all champions, minions, monsters, and turrets hit into stasis for a brief time.",
            ),
        },
        items: [
            "ionian_boots_of_lucidity",
            "zhonyas_hourglass",
            "rabadons_deathcap",
            "malignance",
            "stormsurge",
            "shadowflame",
        ],
        outfit: { base: 0xaf5a3e, hands: 0x5916c0, backpack: 0xc41d42 },
    },
    belveth: {
        name: "Bel'Veth",
        title: "the Empress of the Void",
        health: 158,
        speedBonus: 0.5,
        gun: false,
        basic: { damage: 30, cooldown: 0.55 },
        passive: {
            name: "Death in Lavender ",
            description:
                "Bel'Veth gains permanent attack speed stacks after taking down large minions and monsters and champions. She also gains temporary bonus attack speed after using",
        },
        abilities: {
            q: ab("Void Surge", 4, "Bel'Veth dashes in a chosen direction and damages all enemies she passes through."),
            w: ab(
                "Above and Below",
                12,
                "Bel'Veth slams her tail to the ground, damaging, knocking up, and slowing her enemies.",
            ),
            e: ab(
                "Royal Maelstrom",
                24,
                "Bel'Veth roots herself in place, channeling a storm of slashes around her that targets the lowest-health enemy and grants her lifesteal and damage reduction.",
            ),
            r: ab(
                "Endless Banquet",
                1,
                "Bel'Veth consumes Void coral remnants, transforming into her true form and increasing her max health, attack range, and attack speed. Consuming the Void coral remnants of a Void epic monster will gran",
            ),
        },
        items: [
            "berserkers_greaves",
            "stridebreaker",
            "phantom_dancer",
            "dead_mans_plate",
            "steraks_gage",
            "deaths_dance",
        ],
        outfit: { base: 0x1eaf25, hands: 0x76242f, backpack: 0x392919 },
    },
    blitzcrank: {
        name: "Blitzcrank",
        title: "the Great Steam Golem",
        health: 172,
        speedBonus: 0,
        gun: false,
        basic: { damage: 34, cooldown: 0.6 },
        passive: {
            name: "Mana Barrier",
            description: "Blitzcrank gains a shield based on their mana when dropping to low health.",
        },
        abilities: {
            q: ab(
                "Rocket Grab",
                20,
                "Blitzcrank fires their right hand to grab an opponent on its path, dealing damage and dragging it back to them.",
            ),
            w: ab(
                "Overdrive",
                15,
                "Blitzcrank super charges themself to get dramatically increased Move and Attack Speed. They are temporarily slowed after the effect ends.",
            ),
            e: ab(
                "Power Fist",
                7,
                "Blitzcrank charges up their fist to make the next attack deal double damage and pop their target up in the air.",
            ),
            r: ab(
                "Static Field",
                60,
                "Enemies attacked by Blitzcrank are marked and take lightning damage after 1 second. Additionally, Blitzcrank can activate this ability to remove nearby enemies' shields, damage them, and silence them ",
            ),
        },
        items: [
            "plated_steelcaps",
            "dead_mans_plate",
            "steraks_gage",
            "sundered_sky",
            "deaths_dance",
            "guardian_angel",
        ],
        outfit: { base: 0xaddbdb, hands: 0x2ba3ac, backpack: 0xd31ed9 },
    },
    brand: {
        name: "Brand",
        title: "the Burning Vengeance",
        health: 140,
        speedBonus: 0,
        gun: true,
        basic: { damage: 31, cooldown: 0.65 },
        passive: {
            name: "Blaze",
            description:
                "Brand's spells light his targets ablaze, dealing damage over 4 seconds, stacking up to 3 times. If Brand kills an enemy while it is ablaze he regains mana. When",
        },
        abilities: {
            q: ab(
                "Sear",
                8,
                "Brand launches a ball of fire forward that deals magic damage. If the target is ablaze, Sear will stun the target.",
            ),
            w: ab(
                "Pillar of Flame",
                10,
                "After a short delay, Brand creates a Pillar of Flame at a target area, dealing magic damage to enemy units within the area. Units that are ablaze take an additional 25% damage.",
            ),
            e: ab(
                "Conflagration",
                13,
                "Brand conjures a powerful blast at his target that spreads to nearby enemies, dealing magic damage. If the target is ablaze, Conflagration's spread is doubled.",
            ),
            r: ab(
                "Pyroclasm",
                100,
                "Brand unleashes a devastating torrent of fire that bounces up to 5 times off of Brand and nearby enemies, dealing magic damage to enemies each time bounce. Bounces prioritize stacking Blaze to max on ",
            ),
        },
        items: [
            "ludens_echo",
            "sorcerers_shoes",
            "stormsurge",
            "shadowflame",
            "rabadons_deathcap",
            "zhonyas_hourglass",
        ],
        outfit: { base: 0x8147c3, hands: 0x4a3fbc, backpack: 0xc4a99c },
    },
    braum: {
        name: "Braum",
        title: "the Heart of the Freljord",
        health: 175,
        speedBonus: 0,
        gun: false,
        basic: { damage: 30, cooldown: 0.6 },
        passive: {
            name: "Concussive Blows",
            description:
                "Braum's basic attacks apply Concussive Blows. Once the first stack is applied, ally basic attacks also stack Concussive Blows. Upon reaching 4 stacks, the targe",
        },
        abilities: {
            q: ab(
                "Winter's Bite",
                8,
                "Braum propels freezing ice from his shield, slowing and dealing magic damage.Applies a stack of Concussive Blows.",
            ),
            w: ab(
                "Stand Behind Me",
                12,
                "Braum leaps to a target allied champion or minion. On arrival, Braum and the ally gain Armor and Magic Resist for a few seconds.",
            ),
            e: ab(
                "Unbreakable",
                16,
                "Braum raises his shield in a direction for several seconds, intercepting all projectiles causing them to hit him and be destroyed. He negates the damage of the first attack completely and reduces the ",
            ),
            r: ab(
                "Glacial Fissure",
                130,
                "Braum slams the ground, knocking up enemies nearby and in a line in front of him. A fissure is left along the line that slows enemies.",
            ),
        },
        items: [
            "plated_steelcaps",
            "dead_mans_plate",
            "steraks_gage",
            "sundered_sky",
            "deaths_dance",
            "guardian_angel",
        ],
        outfit: { base: 0x945dbd, hands: 0x79c931, backpack: 0x30296f },
    },
    briar: {
        name: "Briar",
        title: "the Restrained Hunger",
        health: 169,
        speedBonus: 0.5,
        gun: false,
        basic: { damage: 33, cooldown: 0.55 },
        passive: {
            name: "Crimson Curse",
            description:
                "Briar's attacks and abilities apply a stacking bleed that heals her for a portion of the damage it deals. Perpetually hungry, she gains increased healing based ",
        },
        abilities: {
            q: ab(
                "Head Rush",
                13,
                "Briar leaps to a unit and hits enemies with The Heel Wheel (of Pain), stunning them and breaking their Armor.",
            ),
            w: ab(
                "Blood Frenzy / Snack Attack",
                14,
                "Briar leaps forward and shatters her pillory, entering a Blood Frenzy that causes her to relentlessly pursue the nearest enemy (prioritizing champions). While frenzied, she gains increased Attack Spee",
            ),
            e: ab(
                "Chilling Scream",
                16,
                "Briar refocuses her mind, removing Blood Frenzy and channeling energy into a powerful scream that damages and slows enemies. While charging, she takes reduced damage and heals for a portion of her max",
            ),
            r: ab(
                "Certain Death",
                120,
                "Briar kicks her pillory's hemolith gemstone, marking the first champion it hits as her prey. She then beelines straight to them, fearing other surrounding enemies upon arriving at her target, and ente",
            ),
        },
        items: [
            "berserkers_greaves",
            "stridebreaker",
            "phantom_dancer",
            "dead_mans_plate",
            "steraks_gage",
            "deaths_dance",
        ],
        outfit: { base: 0x8f3f97, hands: 0x804267, backpack: 0xdabb1e },
    },
    camille: {
        name: "Camille",
        title: "the Steel Shadow",
        health: 175,
        speedBonus: 0.5,
        gun: false,
        basic: { damage: 34, cooldown: 0.55 },
        passive: {
            name: "Adaptive Defenses",
            description:
                "Basic attacks on champions grant a shield equal to a percentage of Camille's maximum health against their damage type (Physical or Magic) for a brief duration.",
        },
        abilities: {
            q: ab(
                "Precision Protocol",
                9,
                "Camille's next attack deals bonus damage and grants bonus Move Speed. This spell can be recast for a short period of time, doing significantly increased bonus damage if Camille delays a period of time",
            ),
            w: ab(
                "Tactical Sweep",
                12,
                "Camille blasts in a cone after a delay, dealing damage. Enemies in the outer half are slowed and take extra damage, while also healing Camille.",
            ),
            e: ab(
                "Hookshot",
                16,
                "Camille pulls herself to a wall, leaping off and knocking up enemy champions upon landing.",
            ),
            r: ab(
                "The Hextech Ultimatum",
                140,
                "Camille dashes to target champion, anchoring them to the area. She also deals bonus magic damage to the target with her basic attacks.",
            ),
        },
        items: [
            "berserkers_greaves",
            "stridebreaker",
            "phantom_dancer",
            "dead_mans_plate",
            "steraks_gage",
            "deaths_dance",
        ],
        outfit: { base: 0x31a2db, hands: 0x2530bc, backpack: 0x224657 },
    },
    cassiopeia: {
        name: "Cassiopeia",
        title: "the Serpent's Embrace",
        health: 165,
        speedBonus: 0,
        gun: true,
        basic: { damage: 29, cooldown: 0.65 },
        passive: { name: "Serpentine Grace", description: "All Move Speed bonuses are more effective on Cassiopeia." },
        abilities: {
            q: ab(
                "Noxious Blast",
                3.5,
                "Cassiopeia blasts an area with Poison after a brief delay, granting her increased Move Speed if she hits an enemy champion.",
            ),
            w: ab(
                "Miasma",
                24,
                "Cassiopeia releases several clouds of poison, slowing, grounding, and lightly damaging enemies that pass through them. Grounded enemies cannot use Movement abilities.",
            ),
            e: ab(
                "Twin Fang",
                0.75,
                "Cassiopeia lets loose an attack that deals increased damage to Poisoned targets and heals her for a percentage of the damage dealt. If the target dies from this attack, Cassiopeia regains Mana.",
            ),
            r: ab(
                "Petrifying Gaze",
                120,
                "Cassiopeia releases a swirl of magical energy from her eyes, stunning any enemies in front of her that are facing her and slowing any others with their back turned.",
            ),
        },
        items: [
            "ludens_echo",
            "sorcerers_shoes",
            "stormsurge",
            "shadowflame",
            "rabadons_deathcap",
            "zhonyas_hourglass",
        ],
        outfit: { base: 0x746135, hands: 0x313f57, backpack: 0x77a39a },
    },
    chogath: {
        name: "Cho'Gath",
        title: "the Terror of the Void",
        health: 199,
        speedBonus: 0,
        gun: false,
        basic: { damage: 34, cooldown: 0.6 },
        passive: {
            name: "Carnivore",
            description:
                "Whenever Cho'Gath kills a unit, he recovers Health and Mana. The values restored increase with Cho'Gath's level.",
        },
        abilities: {
            q: ab(
                "Rupture",
                6,
                "Ruptures the ground at target location, popping enemy units into the air, dealing damage and slowing them.",
            ),
            w: ab(
                "Feral Scream",
                11,
                "Cho'Gath unleashes a terrible scream at enemies in a cone, dealing magic damage and Silencing enemies for a few seconds.",
            ),
            e: ab(
                "Vorpal Spikes",
                8,
                "Cho'Gath's attacks release deadly spikes, dealing damage and slowing all enemy units in front of him.",
            ),
            r: ab(
                "Feast",
                80,
                "Devours an enemy unit, dealing a high amount of true damage. If the target is killed, Cho'Gath grows, gaining maximum Health.",
            ),
        },
        items: [
            "plated_steelcaps",
            "dead_mans_plate",
            "steraks_gage",
            "sundered_sky",
            "deaths_dance",
            "guardian_angel",
        ],
        outfit: { base: 0x2c1e6a, hands: 0x875c2e, backpack: 0xbe2537 },
    },
    corki: {
        name: "Corki",
        title: "the Daring Bombardier",
        health: 165,
        speedBonus: 0,
        gun: true,
        basic: { damage: 29, cooldown: 0.5 },
        passive: {
            name: "Hextech Munitions",
            description: "A percentage of Corki's basic attack damage is dealt as bonus true damage.",
        },
        abilities: {
            q: ab(
                "Phosphorus Bomb",
                9,
                "Corki fires a flash bomb at a target location, dealing magic damage to enemies in the area. This attack additionally reveals units in the area for a duration.",
            ),
            w: ab(
                "Valkyrie",
                20,
                "Corki flies a short distance, dropping bombs that create a trail of fire that damages opponents who remain in it.",
            ),
            e: ab(
                "Gatling Gun",
                12,
                "Corki's gatling gun rapidly fires in a cone in front of him, dealing damage and reducing enemy Armor and Magic Resist.",
            ),
            r: ab(
                "Missile Barrage",
                2,
                "Corki fires a missile toward his target location that explodes on impact, dealing damage to enemies in an area. Corki stores missiles over time, up to a maximum. Every 3rd missile fired will be a Big ",
            ),
        },
        items: [
            "hexoptics_c44",
            "berserkers_greaves",
            "runaans_hurricane",
            "infinity_edge",
            "lord_dominiks_regards",
            "guardian_angel",
        ],
        outfit: { base: 0xd24759, hands: 0x6b487f, backpack: 0xbea091 },
    },
    diana: {
        name: "Diana",
        title: "Scorn of the Moon",
        health: 172,
        speedBonus: 0.5,
        gun: false,
        basic: { damage: 31, cooldown: 0.55 },
        passive: {
            name: "Moonsilver Blade",
            description:
                "Every third strike cleaves nearby enemies for an additional magic damage. After casting a spell, Diana gains Attack Speed for 5 seconds.",
        },
        abilities: {
            q: ab(
                "Crescent Strike",
                8,
                "Unleashes a bolt of lunar energy in an arc dealing magic damage.Afflicts enemies struck with Moonlight, revealing them if they are not stealthed for 3 seconds.",
            ),
            w: ab(
                "Pale Cascade",
                15,
                "Diana creates three orbiting spheres that detonate on contact with enemies to deal damage in an area. She also gains a temporary shield that absorbs damage. If her third sphere detonates, the shield g",
            ),
            e: ab(
                "Lunar Rush",
                22,
                "Becomes the living embodiment of the vengeful moon, dashing to an enemy and dealing magic damage.Lunar Rush has no cooldown when used to dash to an enemy afflicted with Moonlight. All other enemies wi",
            ),
            r: ab(
                "Moonfall",
                100,
                "Diana reveals and draws in all nearby enemies and slows them.If Diana pulls in one or more enemy champions, the moonlight crashes down onto her after a short delay, dealing magic damage in an area aro",
            ),
        },
        items: [
            "berserkers_greaves",
            "stridebreaker",
            "phantom_dancer",
            "dead_mans_plate",
            "steraks_gage",
            "deaths_dance",
        ],
        outfit: { base: 0x441a2a, hands: 0xbdc929, backpack: 0x2cbc65 },
    },
    drmundo: {
        name: "Dr. Mundo",
        title: "the Madman of Zaun",
        health: 197,
        speedBonus: 0,
        gun: false,
        basic: { damage: 34, cooldown: 0.6 },
        passive: {
            name: "Goes Where He Pleases",
            description:
                "Dr. Mundo resists the first Immobilizing effect that hits him, instead losing Health and dropping a chemical cannister nearby. Dr. Mundo can pick it up by walki",
        },
        abilities: {
            q: ab(
                "Infected Bonesaw",
                4,
                "Dr. Mundo throws an infected bonesaw, dealing damage to the first enemy hit based on their current health and slowing them.",
            ),
            w: ab(
                "Heart Zapper",
                17,
                "Dr. Mundo electrocutes himself, dealing persistent damage to nearby enemies and storing a portion of damage he takes. At the end of the duration or on Recast, Dr. Mundo deals a burst of damage to near",
            ),
            e: ab(
                "Blunt Force Trauma",
                9,
                "Passive - Dr. Mundo gains bonus Attack Damage, increasing based on his max Health.Active - Dr. Mundo slams his “medical” bag into an enemy, dealing additional damage based on his missing Health. If th",
            ),
            r: ab(
                "Maximum Dosage",
                120,
                "Dr. Mundo pumps himself with chemicals, instantly healing a percent of his missing Health. He then gains Move Speed and regenerates a portion of his maximum Health over a long duration.",
            ),
        },
        items: [
            "plated_steelcaps",
            "dead_mans_plate",
            "steraks_gage",
            "sundered_sky",
            "deaths_dance",
            "guardian_angel",
        ],
        outfit: { base: 0x5e3e58, hands: 0xa23f8c, backpack: 0x4fb463 },
    },
    draven: {
        name: "Draven",
        title: "the Glorious Executioner",
        health: 181,
        speedBonus: 0,
        gun: true,
        basic: { damage: 34, cooldown: 0.5 },
        passive: {
            name: "League of Draven",
            description:
                "Draven gains his fans' Adoration when he catches a Spinning Axe or kills a minion, monster, or tower. Killing enemy champions grants Draven bonus gold based on ",
        },
        abilities: {
            q: ab(
                "Spinning Axe",
                12,
                "Draven's next attack will deal bonus physical damage. This axe will ricochet off the target high up into the air. If Draven catches it, he automatically readies another Spinning Axe. Draven can have t",
            ),
            w: ab(
                "Blood Rush",
                12,
                "Draven gains increased Move Speed and Attack Speed. The Move Speed bonus decreases rapidly over its duration. Catching a Spinning Axe will refresh the cooldown of Blood Rush.",
            ),
            e: ab(
                "Stand Aside",
                16,
                "Draven throws his axes, dealing physical damage to targets hit and knocking them aside. Targets hit are slowed.",
            ),
            r: ab(
                "Whirling Death",
                100,
                "Draven hurls two massive axes to deal physical damage to each unit struck. Whirling Death slowly reverses direction and returns to Draven after striking an enemy champion. Draven may also activate thi",
            ),
        },
        items: [
            "hexoptics_c44",
            "berserkers_greaves",
            "runaans_hurricane",
            "infinity_edge",
            "lord_dominiks_regards",
            "guardian_angel",
        ],
        outfit: { base: 0x97b817, hands: 0x435515, backpack: 0xaa1dbf },
    },
    ekko: {
        name: "Ekko",
        title: "the Boy Who Shattered Time",
        health: 176,
        speedBonus: 0.5,
        gun: false,
        basic: { damage: 32, cooldown: 0.45 },
        passive: {
            name: "Z-Drive Resonance",
            description:
                "Every third attack or damaging spell on the same target deals bonus magic damage, and grants Ekko a burst of speed if the target is a champion.",
        },
        abilities: {
            q: ab(
                "Timewinder",
                9,
                "Ekko throws a temporal grenade that expands into a time-distortion field upon hitting an enemy champion, slowing and damaging anyone caught inside. After a delay, the grenade rewinds back to Ekko, dea",
            ),
            w: ab(
                "Parallel Convergence",
                22,
                "Ekko's basic attacks deal bonus magic damage to low health enemies. He can cast Parallel Convergence to split the timeline, creating an anomaly after a few seconds that slows enemies caught inside. If",
            ),
            e: ab(
                "Phase Dive",
                9,
                "Ekko rolls evasively while charging up his Z-Drive. His next attack deals bonus damage and warps reality, teleporting him to his target.",
            ),
            r: ab(
                "Chronobreak",
                110,
                "Ekko shatters his timeline, becoming untargetable and rewinding to a more favorable point in time. He returns to whenever he was a few seconds ago, and heals for a percentage of the damage received in",
            ),
        },
        items: [
            "youmuus_ghostblade",
            "plated_steelcaps",
            "the_collector",
            "infinity_edge",
            "lord_dominiks_regards",
            "bloodthirster",
        ],
        outfit: { base: 0x1f99c0, hands: 0xb2413b, backpack: 0x42322d },
    },
    elise: {
        name: "Elise",
        title: "the Spider Queen",
        health: 168,
        speedBonus: 0.5,
        gun: true,
        basic: { damage: 30, cooldown: 0.45 },
        passive: {
            name: "Spider Queen",
            description:
                "Human Form: When Elise's abilities hit an enemy, she gains a dormant Spiderling.Spider Form: Basic attacks deal bonus magic damage and restore health to Elise.",
        },
        abilities: {
            q: ab(
                "Neurotoxin / Venomous Bite",
                6,
                "Human Form: Deals damage based upon how high the target's Health is.Spider Form: Lunges at an enemy and deals damage based upon how low their Health is.",
            ),
            w: ab(
                "Volatile Spiderling / Skittering Frenzy",
                12,
                "Human Form: Releases a venom-gorged Spiderling that explodes when it nears a target.Spider Form: Elise and her Spiderlings gain Attack Speed.",
            ),
            e: ab(
                "Cocoon / Rappel",
                12,
                "Human Form: Stuns the first enemy unit hit and reveals them if they are not stealthed.Spider Form: Elise and her Spiderlings ascend into the air and then descend upon target enemy. After descending on",
            ),
            r: ab(
                "Spider Form",
                3,
                "Transforms into a menacing spider, reducing her attack range in exchange for Move Speed, new abilities, and a Spiderling swarm that will attack her foes.",
            ),
        },
        items: [
            "youmuus_ghostblade",
            "plated_steelcaps",
            "the_collector",
            "infinity_edge",
            "lord_dominiks_regards",
            "bloodthirster",
        ],
        outfit: { base: 0x1cd397, hands: 0xc91938, backpack: 0x161c1c },
    },
    evelynn: {
        name: "Evelynn",
        title: "Agony's Embrace",
        health: 173,
        speedBonus: 0.5,
        gun: false,
        basic: { damage: 34, cooldown: 0.45 },
        passive: {
            name: "Demon Shade",
            description:
                "When out of combat, Evelynn enters Demon Shade. Demon Shade heals Evelynn when she is low on health and grants Camouflage after level 6.",
        },
        abilities: {
            q: ab(
                "Hate Spike",
                4,
                "Evelynn strikes out with her Lasher, dealing damage to the first unit hit. Then, Evelynn can shoot a line of spikes at nearby foes a few times.",
            ),
            w: ab(
                "Allure",
                15,
                "Evelynn curses her target, causing her next attack or spell after a delay to charm her target and reduce their magic resist.",
            ),
            e: ab(
                "Whiplash",
                8,
                "Evelynn whips her target with her Lasher, dealing damage. She then gains Move Speed for a short duration.",
            ),
            r: ab(
                "Last Caress",
                120,
                "Evelynn briefly goes untargetable and decimates the area in front of her before warping backwards a long distance.",
            ),
        },
        items: [
            "youmuus_ghostblade",
            "plated_steelcaps",
            "the_collector",
            "infinity_edge",
            "lord_dominiks_regards",
            "bloodthirster",
        ],
        outfit: { base: 0x9cd58a, hands: 0x23bc2f, backpack: 0x639b53 },
    },
    fiddlesticks: {
        name: "Fiddlesticks",
        title: "the Ancient Fear",
        health: 160,
        speedBonus: 0,
        gun: true,
        basic: { damage: 30, cooldown: 0.65 },
        passive: {
            name: "A Harmless Scarecrow",
            description: "Fiddlesticks' trinket is replaced by scarecrow effigies.",
        },
        abilities: {
            q: ab(
                "Terrify",
                15,
                "Fiddlesticks damaging enemies with spells while unseen or targeting an enemy with Terrify's activation strikes a target unit with fear, causing it to flee in terror for a duration.",
            ),
            w: ab(
                "Bountiful Harvest",
                10,
                "Fiddlesticks drains health from nearby enemies, dealing bonus execute damage at the end of the duration.",
            ),
            e: ab(
                "Reap",
                10,
                "Fiddlesticks slashes an area with its scythe, slowing all enemies hit and silencing enemies hit in the center of the slash.",
            ),
            r: ab(
                "Crowstorm",
                140,
                "A murder of crows flock wildly around Fiddlesticks, dealing damage per second to all enemy units in the area.",
            ),
        },
        items: [
            "ludens_echo",
            "sorcerers_shoes",
            "stormsurge",
            "shadowflame",
            "rabadons_deathcap",
            "zhonyas_hourglass",
        ],
        outfit: { base: 0x632e63, hands: 0x324041, backpack: 0x1a42a5 },
    },
    fiora: {
        name: "Fiora",
        title: "the Grand Duelist",
        health: 168,
        speedBonus: 0.5,
        gun: false,
        basic: { damage: 34, cooldown: 0.55 },
        passive: {
            name: "Duelist's Dance",
            description:
                "Fiora has revealed a Vital on this Champion. If she hits the Vital, she restores Health and gains Move Speed.",
        },
        abilities: {
            q: ab(
                "Lunge",
                13,
                "Fiora lunges in a direction and stabs a nearby enemy, dealing physical damage and applying on-hit effects.",
            ),
            w: ab(
                "Riposte",
                24,
                "Fiora parries all incoming damage and disables for a short time, then stabs in a direction. This stab slows the first enemy champion hit, or stuns them if Fiora blocked an immobilizing effect with thi",
            ),
            e: ab(
                "Bladework",
                11,
                "Fiora has increased attack speed for the next two attacks. The first attack slows the target, and the second attack will critically strike.",
            ),
            r: ab(
                "Grand Challenge",
                110,
                "Fiora reveals all four Vitals on an enemy champion and gains Move Speed while near them. If Fiora hits all four Vitals or if the target dies after she has hit at least one, Fiora and her allies in the",
            ),
        },
        items: [
            "berserkers_greaves",
            "stridebreaker",
            "phantom_dancer",
            "dead_mans_plate",
            "steraks_gage",
            "deaths_dance",
        ],
        outfit: { base: 0x9c80d1, hands: 0xbf8540, backpack: 0xafa1ad },
    },
    fizz: {
        name: "Fizz",
        title: "the Tidal Trickster",
        health: 172,
        speedBonus: 0.5,
        gun: false,
        basic: { damage: 32, cooldown: 0.45 },
        passive: {
            name: "Nimble Fighter",
            description: "Fizz can move through units and takes a flat amount of reduced damage from all sources",
        },
        abilities: {
            q: ab(
                "Urchin Strike",
                8,
                "Fizz dashes through his target, dealing magic damage and applying on hit effects.",
            ),
            w: ab(
                "Seastone Trident",
                7,
                "Fizz's attacks bleed his enemies, dealing magic damage over several seconds. Fizz can empower his next attack to deal bonus damage and empower his further attacks for a short time.",
            ),
            e: ab(
                "Playful / Trickster",
                16,
                "Fizz hops into the air, landing gracefully upon his spear and becoming untargetable. From this position, Fizz can either slam the ground or choose to jump again before smashing back down.",
            ),
            r: ab(
                "Chum the Waters",
                120,
                "Fizz tosses a fish in a direction that attaches to any champion that touches it, slowing the target. After a short delay, a shark erupts from the ground, knocking up the target and knocking any nearby",
            ),
        },
        items: [
            "youmuus_ghostblade",
            "plated_steelcaps",
            "the_collector",
            "infinity_edge",
            "lord_dominiks_regards",
            "bloodthirster",
        ],
        outfit: { base: 0x43989d, hands: 0x3325cc, backpack: 0xbd1eb6 },
    },
    galio: {
        name: "Galio",
        title: "the Colossus",
        health: 187,
        speedBonus: 0,
        gun: false,
        basic: { damage: 32, cooldown: 0.6 },
        passive: {
            name: "Colossal Smash",
            description: "Every few seconds, Galio's next basic attack deals bonus magic damage in an area.",
        },
        abilities: {
            q: ab(
                "Winds of War",
                11,
                "Galio fires two windblasts that converge into a large tornado that deals damage over time.",
            ),
            w: ab(
                "Shield of Durand",
                18,
                "Galio charges a defensive stance, moving slowly. Upon releasing the charge, Galio will taunt and damage nearby enemies.",
            ),
            e: ab(
                "Justice Punch",
                11,
                "Galio will briefly step back and charge, knocking up the first enemy champion he encounters.",
            ),
            r: ab(
                "Hero's Entrance",
                180,
                "Galio designates an ally's position as his landing spot, granting all allies in the area a magic shield. After a delay Galio smashes down location, knocking up nearby enemies.",
            ),
        },
        items: [
            "plated_steelcaps",
            "dead_mans_plate",
            "steraks_gage",
            "sundered_sky",
            "deaths_dance",
            "guardian_angel",
        ],
        outfit: { base: 0xba17c9, hands: 0x753dba, backpack: 0x26cf27 },
    },
    gangplank: {
        name: "Gangplank",
        title: "the Saltwater Scourge",
        health: 170,
        speedBonus: 0.5,
        gun: false,
        basic: { damage: 34, cooldown: 0.55 },
        passive: {
            name: "Trial by Fire",
            description: "Every few seconds, Gangplank's melee strike will set his opponent on fire.",
        },
        abilities: {
            q: ab("Parrrley", 4.5, "Shoots target, plundering Gold for each enemy unit killed."),
            w: ab("Remove Scurvy", 22, "Eats citrus to cure crowd control effects and restore Health."),
            e: ab(
                "Powder Keg",
                0,
                "Gangplank uncovers a powder keg at target location. If he attacks it, it explodes, spreading the attack's damage to enemies in the area, slowing them.",
            ),
            r: ab(
                "Cannon Barrage",
                160,
                "Gangplank signals his ship to bombard an area, slowing and damaging enemies.",
            ),
        },
        items: [
            "berserkers_greaves",
            "stridebreaker",
            "phantom_dancer",
            "dead_mans_plate",
            "steraks_gage",
            "deaths_dance",
        ],
        outfit: { base: 0xa92482, hands: 0x2b4854, backpack: 0x6e627d },
    },
    gnar: {
        name: "Gnar",
        title: "the Missing Link",
        health: 173,
        speedBonus: 0.5,
        gun: true,
        basic: { damage: 33, cooldown: 0.55 },
        passive: {
            name: "Rage Gene",
            description:
                "While in combat Gnar generates Rage. At maximum Rage his next ability will transform him into Mega Gnar, granting increased survivability and access to new spel",
        },
        abilities: {
            q: ab(
                "Boomerang Throw / Boulder Toss",
                16,
                "Gnar throws a boomerang that damages and slows enemies it hits before returning to him. If he catches the boomerang its cooldown is reduced.Mega Gnar instead throws a boulder that stops on the first u",
            ),
            w: ab(
                "Hyper / Wallop",
                7,
                "Gnar's attacks and spells hype him up, dealing bonus damage and granting him Move Speed.Mega Gnar is too enraged to be hyper and instead can rear up on his hind legs and smash down on the area in fron",
            ),
            e: ab(
                "Hop / Crunch",
                22,
                "Gnar leaps to a location and bounces off the head of any unit he lands on, traveling further.Mega Gnar is too large to bounce and instead lands with earth-shattering force, dealing damage in an area a",
            ),
            r: ab(
                "GNAR!",
                90,
                "Mega Gnar throws everything around him in a chosen direction, dealing damage and slowing them. Any enemy that hits a wall is stunned and takes bonus damage.",
            ),
        },
        items: [
            "berserkers_greaves",
            "stridebreaker",
            "phantom_dancer",
            "dead_mans_plate",
            "steraks_gage",
            "deaths_dance",
        ],
        outfit: { base: 0x4b4a3c, hands: 0x465087, backpack: 0x2438cb },
    },
    gragas: {
        name: "Gragas",
        title: "the Rabble Rouser",
        health: 172,
        speedBonus: 0.5,
        gun: false,
        basic: { damage: 34, cooldown: 0.55 },
        passive: { name: "Happy Hour", description: "Gragas periodically heals upon using a skill." },
        abilities: {
            q: ab(
                "Barrel Roll",
                10,
                "Gragas rolls his cask to a location, which can be activated to explode or will explode on its own after 4 seconds. The potency of the explosion increases over time. Enemies struck by the blast have th",
            ),
            w: ab(
                "Drunken Rage",
                5,
                "Gragas samples his latest brew for 1 second. After finishing, he becomes boisterous and belligerent, dealing magic damage to all nearby enemies on his next basic attack and reducing damage received.",
            ),
            e: ab(
                "Body Slam",
                14,
                "Gragas charges to a location and collides with the first enemy unit he comes across, dealing damage to all nearby enemy units and stunning them.",
            ),
            r: ab(
                "Explosive Cask",
                100,
                "Gragas hurls his cask to a location, dealing damage and knocking back enemies caught in the blast radius.",
            ),
        },
        items: [
            "berserkers_greaves",
            "stridebreaker",
            "phantom_dancer",
            "dead_mans_plate",
            "steraks_gage",
            "deaths_dance",
        ],
        outfit: { base: 0x29574d, hands: 0x9fceab, backpack: 0xaf5298 },
    },
    graves: {
        name: "Graves",
        title: "the Outlaw",
        health: 169,
        speedBonus: 0,
        gun: true,
        basic: { damage: 34, cooldown: 0.5 },
        passive: {
            name: "New Destiny",
            description:
                "Graves' shotgun has some unique properties. He must reload when he runs out of ammo. Attacks fire 4 bullets, which cannot pass through units. Non-champions stru",
        },
        abilities: {
            q: ab(
                "End of the Line",
                13,
                "Graves fires an explosive shell that detonates after 1 second, or after colliding with terrain.",
            ),
            w: ab(
                "Smoke Screen",
                26,
                "Graves fires a smoke canister at the target area creating a cloud of smoke that reduces sight range. Enemies caught in the initial impact are dealt magic damage and have their Move Speed reduced brief",
            ),
            e: ab(
                "Quickdraw",
                16,
                "Graves dashes forward gaining an Armor and Magic Resist boost for several seconds. If Graves dashes towards an enemy champion, gain two stacks of True Grit instead. Hitting enemies with basic attacks ",
            ),
            r: ab(
                "Collateral Damage",
                100,
                "Graves fires an explosive shell dealing heavy damage to the first champion it hits. After hitting a champion or reaching the end of its range, the shell explodes dealing damage in a cone.",
            ),
        },
        items: [
            "hexoptics_c44",
            "berserkers_greaves",
            "runaans_hurricane",
            "infinity_edge",
            "lord_dominiks_regards",
            "guardian_angel",
        ],
        outfit: { base: 0x2729d0, hands: 0x878593, backpack: 0xad44b2 },
    },
    gwen: {
        name: "Gwen",
        title: "The Hallowed Seamstress",
        health: 168,
        speedBonus: 0.5,
        gun: false,
        basic: { damage: 34, cooldown: 0.55 },
        passive: {
            name: "A Thousand Cuts",
            description:
                "Gwen's attacks deal bonus magic damage based on the targets health. She heals for a portion of the damage dealt to champions by this effect.",
        },
        abilities: {
            q: ab(
                "Snip Snip!",
                6.5,
                "Gwen snips her scissors in a cone up to 6 times dealing magic damage. Gwen deals true damage to units in the center and applies her passive to them on each snip.",
            ),
            w: ab(
                "Hallowed Mist",
                22,
                "Gwen summons mist that protects her from enemies outside of it. She can only be targeted by enemies who enter the mist.",
            ),
            e: ab(
                "Skip 'n Slash",
                13,
                "Gwen dashes a short distance then gains Attack Speed, attack range, and magic damage On-Hit for a few seconds. If she hits an enemy during that time, this Ability's cooldown is partially refunded.",
            ),
            r: ab(
                "Needlework",
                120,
                "Gwen hurls a needle that slows enemies hit, deals magic damage, and applies A Thousand Cuts to champions hit. This ability can be cast up to two more times, with each cast throwing additional needles ",
            ),
        },
        items: [
            "berserkers_greaves",
            "stridebreaker",
            "phantom_dancer",
            "dead_mans_plate",
            "steraks_gage",
            "deaths_dance",
        ],
        outfit: { base: 0x7f2865, hands: 0x4938a5, backpack: 0xa9378a },
    },
    hecarim: {
        name: "Hecarim",
        title: "the Shadow of War",
        health: 194,
        speedBonus: 0.5,
        gun: false,
        basic: { damage: 34, cooldown: 0.55 },
        passive: {
            name: "Warpath",
            description: "Hecarim gains Attack Damage equal to a percentage of his bonus Move Speed.",
        },
        abilities: {
            q: ab(
                "Rampage",
                4,
                "Hecarim cleaves nearby enemies dealing physical damage. If Hecarim damages at least one enemy, he increases the damage and lowers the cooldown of subsequent Rampages.",
            ),
            w: ab(
                "Spirit of Dread",
                14,
                "Hecarim gains Armor and Magic Resist. Hecarim deals magic damage to nearby enemies, and gains Health equal to a percentage of any damage those enemies suffer.",
            ),
            e: ab(
                "Devastating Charge",
                20,
                "Hecarim gains increasing Move Speed and can move through units for a short duration. His next attack knocks the target back and deals additional physical damage based on the distance he has traveled s",
            ),
            r: ab(
                "Onslaught of Shadows",
                140,
                "Hecarim summons spectral riders and charges forward, dealing magic damage in a line. Hecarim creates a shockwave when he finishes his charge, causing nearby enemies to flee in terror.",
            ),
        },
        items: [
            "berserkers_greaves",
            "stridebreaker",
            "phantom_dancer",
            "dead_mans_plate",
            "steraks_gage",
            "deaths_dance",
        ],
        outfit: { base: 0x9e4abe, hands: 0x9b3d2a, backpack: 0x253ba6 },
    },
    heimerdinger: {
        name: "Heimerdinger",
        title: "the Revered Inventor",
        health: 137,
        speedBonus: 0,
        gun: true,
        basic: { damage: 31, cooldown: 0.65 },
        passive: {
            name: "Hextech Affinity",
            description: "Gain Move Speed while near allied towers and turrets deployed by Heimerdinger.",
        },
        abilities: {
            q: ab(
                "H-28 G Evolution Turret",
                1,
                "Heimerdinger lays down a rapid-fire cannon turret equipped with a secondary pass-through beam attack (turrets deal half damage to towers).",
            ),
            w: ab("Hextech Micro-Rockets", 11, "Heimerdinger fires long-range rockets that converge on his cursor."),
            e: ab(
                "CH-2 Electron Storm Grenade",
                11,
                "Heimerdinger lobs a grenade at a location, dealing damage to enemy units, as well as stunning anyone directly hit and slowing surrounding units.",
            ),
            r: ab(
                "UPGRADE!!!",
                100,
                "Heimerdinger invents an upgrade, causing his next spell to have increased effects.",
            ),
        },
        items: [
            "ludens_echo",
            "sorcerers_shoes",
            "stormsurge",
            "shadowflame",
            "rabadons_deathcap",
            "zhonyas_hourglass",
        ],
        outfit: { base: 0xd8c88f, hands: 0x3e24dc, backpack: 0x4ad14d },
    },
    hwei: {
        name: "Hwei",
        title: "the Visionary",
        health: 143,
        speedBonus: 0,
        gun: true,
        basic: { damage: 30, cooldown: 0.65 },
        passive: {
            name: "Signature of the Visionary",
            description:
                "Hwei primes enemy champions he damages with his abilities for his signature finishing touch.Hitting an enemy with a second damaging spell completes his signatur",
        },
        abilities: {
            q: ab(
                "Subject: Disaster",
                10,
                "Hwei envisions a series of disasters, allowing him to paint a devastating blow.This ability replaces Hwei's abilities with damaging abilities: Devastating Fire, Severing Bolt, and Molten Fissure.",
            ),
            w: ab(
                "Subject: Serenity",
                18,
                "Hwei envisions a series of serenities, allowing him to paint invigorating settings.This ability replaces Hwei's abilities with utility abilities: Fleeting Current, Pool of Reflection, and Stirring Lig",
            ),
            e: ab(
                "Subject: Torment",
                12,
                "Hwei envisions a series of torments, allowing him to paint controlling visages.This ability replaces Hwei's abilities with crowd control abilities: Grim Visage, Gaze of the Abyss, and Crushing Maw.",
            ),
            r: ab(
                "Spiraling Despair",
                120,
                "Hwei paints a vision of pure despair. The first enemy champion struck becomes the center of an expanding painting that slows and damages nearby enemies. The vision explodes after reaching its maximum ",
            ),
        },
        items: [
            "ludens_echo",
            "sorcerers_shoes",
            "stormsurge",
            "shadowflame",
            "rabadons_deathcap",
            "zhonyas_hourglass",
        ],
        outfit: { base: 0xda17c1, hands: 0xa9cacc, backpack: 0x461882 },
    },
    illaoi: {
        name: "Illaoi",
        title: "the Kraken Priestess",
        health: 201,
        speedBonus: 0.5,
        gun: false,
        basic: { damage: 34, cooldown: 0.55 },
        passive: {
            name: "Prophet of an Elder God",
            description:
                "Illaoi and the Vessels she creates spawn Tentacles on nearby impassible terrain. Tentacles swing at spirits, Vessels, and victims of Illaoi's Harsh lesson. Tent",
        },
        abilities: {
            q: ab(
                "Tentacle Smash",
                10,
                "Increases the damage dealt by Tentacles. When activated, Illaoi smashes down a Tentacle that deals physical damage.",
            ),
            w: ab(
                "Harsh Lesson",
                4,
                "Illaoi leaps to her target, dealing physical damage and causing nearby Tentacles to also swing at the target.",
            ),
            e: ab(
                "Test of Spirit",
                16,
                "Illaoi rips the spirit from a foe's body, forcing it to stand before her. Spirits echo a percentage of the damage they take to the original target. If killed, or if the target gets too far from the sp",
            ),
            r: ab(
                "Leap of Faith",
                120,
                "Illaoi smashes her idol into the ground, dealing physical damage to nearby enemies. A Tentacle spawns for each enemy champion hit.",
            ),
        },
        items: [
            "berserkers_greaves",
            "stridebreaker",
            "phantom_dancer",
            "dead_mans_plate",
            "steraks_gage",
            "deaths_dance",
        ],
        outfit: { base: 0x7e1840, hands: 0x1d1560, backpack: 0xa32fac },
    },
    irelia: {
        name: "Irelia",
        title: "the Blade Dancer",
        health: 170,
        speedBonus: 0.5,
        gun: false,
        basic: { damage: 34, cooldown: 0.55 },
        passive: {
            name: "Ionian Fervor",
            description:
                "When Irelia strikes enemies with spells she gains stacking bonus Attack Speed. At maximum stacks she also gains bonus damage on hit.",
        },
        abilities: {
            q: ab(
                "Bladesurge",
                10,
                "Irelia dashes forward to strike her target, healing herself. If the target is Marked or dies to Bladesurge, its cooldown refreshes.",
            ),
            w: ab(
                "Defiant Dance",
                20,
                "Irelia charges a strike that deals more damage as she charges. She takes reduced physical damage during the charge.",
            ),
            e: ab(
                "Flawless Duet",
                16,
                "Irelia sends out two blades which converge on each other. Enemies caught in between are damaged, stunned and Marked.",
            ),
            r: ab(
                "Vanguard's Edge",
                125,
                "Irelia fires a massive number of blades that explode outward upon hitting an enemy champion. Enemies hit by the blades are damaged and Marked. Afterwards the blades form a wall that will damage and sl",
            ),
        },
        items: [
            "berserkers_greaves",
            "stridebreaker",
            "phantom_dancer",
            "dead_mans_plate",
            "steraks_gage",
            "deaths_dance",
        ],
        outfit: { base: 0x8a4b1d, hands: 0xb44e9a, backpack: 0x5b7149 },
    },
    ivern: {
        name: "Ivern",
        title: "the Green Father",
        health: 155,
        speedBonus: 0,
        gun: true,
        basic: { damage: 28, cooldown: 0.6 },
        passive: {
            name: "Friend of the Forest",
            description:
                "Ivern cannot attack or be attacked by non-epic monsters. Ivern can create magical groves on jungle camps which grow over time. When the grove is fully grown, Iv",
        },
        abilities: {
            q: ab(
                "Rootcaller",
                14,
                "Ivern conjures a vine, dealing damage and rooting enemy targets hit. Ivern's allies can dash to the rooted target.",
            ),
            w: ab(
                "Brushmaker",
                0.5,
                "In brush, Ivern and his nearby allies attacks deal bonus magic damage. Ivern can activate this ability to create a patch of brush.",
            ),
            e: ab(
                "Triggerseed",
                11,
                "Ivern places a shield on an ally which explodes after a short duration slowing and damaging enemies. The shield refreshes if it hits no enemies.",
            ),
            r: ab(
                "Daisy!",
                140,
                "Ivern summons his Sentinel friend Daisy to fight with him. Re-cast command Daisy to attack or move.",
            ),
        },
        items: [
            "ionian_boots_of_lucidity",
            "zhonyas_hourglass",
            "rabadons_deathcap",
            "malignance",
            "stormsurge",
            "shadowflame",
        ],
        outfit: { base: 0x8366c0, hands: 0x54cb27, backpack: 0xd1b9a6 },
    },
    janna: {
        name: "Janna",
        title: "the Storm's Fury",
        health: 140,
        speedBonus: 0,
        gun: true,
        basic: { damage: 26, cooldown: 0.6 },
        passive: {
            name: "Tailwind",
            description:
                "Janna's allies gain Move Speed moving towards her.Janna deals a portion of bonus Move Speed as bonus magic damage on hit and with Zephyr.",
        },
        abilities: {
            q: ab(
                "Howling Gale",
                14,
                "By creating a localized change in pressure and temperature, Janna is able to create a small storm that grows in size with time. She can activate the spell again to release the storm. On release this s",
            ),
            w: ab(
                "Zephyr",
                8,
                "Janna summons an air elemental that passively increases her Move Speed and enables her to pass through units. She may also activate this ability to deal damage and slow an enemy's Move Speed.",
            ),
            e: ab(
                "Eye Of The Storm",
                16,
                "Janna conjures a defensive gale that shields an ally champion or turret from incoming damage and increases their Attack Damage.",
            ),
            r: ab(
                "Monsoon",
                130,
                "Janna surrounds herself in a magical storm, throwing enemies back. After the storm has settled, soothing winds heal nearby allies while the ability is active.",
            ),
        },
        items: [
            "ionian_boots_of_lucidity",
            "zhonyas_hourglass",
            "rabadons_deathcap",
            "malignance",
            "stormsurge",
            "shadowflame",
        ],
        outfit: { base: 0xd828bc, hands: 0x902851, backpack: 0xc8aaab },
    },
    jarvaniv: {
        name: "Jarvan IV",
        title: "the Exemplar of Demacia",
        health: 197,
        speedBonus: 0.5,
        gun: false,
        basic: { damage: 34, cooldown: 0.55 },
        passive: {
            name: "Martial Cadence",
            description:
                "Jarvan's first basic attack on an enemy deals bonus physical damage based on their current Health. This effect cannot occur again on the same enemy for a few se",
        },
        abilities: {
            q: ab(
                "Dragon Strike",
                10,
                "Jarvan IV extends his lance, dealing physical damage and lowering the Armor of enemies in its path. Additionally, this will pull Jarvan to his Demacian Standard, knocking up enemies in his path.",
            ),
            w: ab(
                "Golden Aegis",
                9,
                "Jarvan IV calls upon the ancient kings of Demacia to shield him from harm and slow surrounding enemies.",
            ),
            e: ab(
                "Demacian Standard",
                12,
                "Jarvan IV carries the pride of Demacia, passively granting him bonus Attack Speed. Activating Demacian Standard allows Jarvan IV to place a Demacian flag that deals magic damage on impact and grants A",
            ),
            r: ab(
                "Cataclysm",
                120,
                "Jarvan IV heroically leaps into battle at a target with such force that he terraforms the surrounding area to create an arena around them. Nearby enemies are damaged at the moment of impact.",
            ),
        },
        items: [
            "berserkers_greaves",
            "stridebreaker",
            "phantom_dancer",
            "dead_mans_plate",
            "steraks_gage",
            "deaths_dance",
        ],
        outfit: { base: 0x874239, hands: 0x272387, backpack: 0x3c14be },
    },
    jax: {
        name: "Jax",
        title: "Grandmaster at Arms",
        health: 175,
        speedBonus: 0.5,
        gun: false,
        basic: { damage: 34, cooldown: 0.55 },
        passive: {
            name: "Relentless Assault",
            description: "Jax's consecutive basic attacks continuously increase his Attack Speed.",
        },
        abilities: {
            q: ab("Leap Strike", 8, "Jax leaps toward a unit. If they are an enemy, he strikes them with his weapon."),
            w: ab(
                "Empower",
                7,
                "Jax charges his weapon with energy, causing his next attack to deal additional damage.",
            ),
            e: ab(
                "Counter Strike",
                17,
                "Jax's combat prowess allows him to dodge all incoming attacks for a short duration and then quickly counterattack, stunning all surrounding enemies.",
            ),
            r: ab(
                "Grandmaster-at-Arms",
                110,
                "Every third consecutive attack deals additional Magic Damage. Additionally, Jax can activate this ability to deal damage around himself and strengthen his resolve, increasing his Armor and Magic Resis",
            ),
        },
        items: [
            "berserkers_greaves",
            "stridebreaker",
            "phantom_dancer",
            "dead_mans_plate",
            "steraks_gage",
            "deaths_dance",
        ],
        outfit: { base: 0x3464b5, hands: 0xc0251b, backpack: 0xa816d6 },
    },
    jayce: {
        name: "Jayce",
        title: "the Defender of Tomorrow",
        health: 160,
        speedBonus: 0.5,
        gun: true,
        basic: { damage: 32, cooldown: 0.55 },
        passive: {
            name: "Hextech Capacitor",
            description: "When Jayce swaps weapons he gains Move Speed for a short duration.",
        },
        abilities: {
            q: ab(
                "To the Skies! / Shock Blast",
                16,
                "Hammer Stance: Leaps to an enemy dealing physical damage and slowing enemies.Cannon Stance: Fires an orb of electricity that detonates upon hitting an enemy (or reaching the end of its path) dealing p",
            ),
            w: ab(
                "Lightning Field / Hyper Charge",
                10,
                "Hammer Stance: Passive: Restores Mana per strike. Active: Creates a field of lightning damaging nearby enemies for several seconds.Cannon Stance: Gains a burst of energy, increasing Attack Speed to ma",
            ),
            e: ab(
                "Thundering Blow / Acceleration Gate",
                20,
                "Hammer Stance: Deals magic damage to an enemy and knocks them back a short distance.Cannon Stance: Deploys an Acceleration Gate increasing the Move Speed of all allied champions who pass through it. I",
            ),
            r: ab(
                "Mercury Cannon / Mercury Hammer",
                6,
                "Hammer Stance: Transforms the Mercury Hammer into the Mercury Cannon gaining new abilities and increased range. The first attack in this form reduces the target's Armor and Magic Resist.Cannon Stance:",
            ),
        },
        items: [
            "berserkers_greaves",
            "stridebreaker",
            "phantom_dancer",
            "dead_mans_plate",
            "steraks_gage",
            "deaths_dance",
        ],
        outfit: { base: 0x882238, hands: 0x35a41d, backpack: 0x2fa3ab },
    },
    jhin: {
        name: "Jhin",
        title: "the Virtuoso",
        health: 176,
        speedBonus: 0,
        gun: true,
        basic: { damage: 34, cooldown: 0.5 },
        passive: {
            name: "Whisper",
            description:
                "Jhin's hand cannon, Whisper, is a precise instrument designed to deal superior damage. It fires at a fixed rate and carries only four shots. Jhin imbues the fin",
        },
        abilities: {
            q: ab(
                "Dancing Grenade",
                7,
                "Jhin launches a magical cartridge at an enemy. It can hit up to four targets and gains damage each time it kills.",
            ),
            w: ab(
                "Deadly Flourish",
                12,
                "Jhin brandishes his cane, firing a single shot with incredible range. It pierces through minions and monsters, but stops on the first champion hit. If the target was recently struck by Jhin's allies, ",
            ),
            e: ab(
                "Captive Audience",
                2,
                "Jhin places an invisible lotus trap that blooms when walked over. It slows nearby enemies before dealing damage with an explosion of serrated petals. Beauty in Death - When Jhin kills an enemy champio",
            ),
            r: ab(
                "Curtain Call",
                120,
                "Jhin channels, transforming Whisper into a shoulder-mounted mega-cannon. It is able to fire 4 super shots at extreme range that pierce through minions and monsters, but stop on the first champion impa",
            ),
        },
        items: [
            "hexoptics_c44",
            "berserkers_greaves",
            "runaans_hurricane",
            "infinity_edge",
            "lord_dominiks_regards",
            "guardian_angel",
        ],
        outfit: { base: 0x4744a4, hands: 0x17506d, backpack: 0x494435 },
    },
    ksante: {
        name: "K'Sante",
        title: "the Pride of Nazumah",
        health: 194,
        speedBonus: 0,
        gun: false,
        basic: { damage: 34, cooldown: 0.6 },
        passive: {
            name: "Dauntless Instinct",
            description:
                "K'Sante's Abilities mark targets to take more damage on his next Attack.When All Out, K'Sante deals more damage with all Attacks and Abilities.",
        },
        abilities: {
            q: ab(
                "Ntofo Strikes",
                3.5,
                "K'Sante strikes, damaging and slowing enemies in a short line.On hit, grants a stack of Ntofo Strikes. At 2 stacks, K'Sante fires a shockwave that pulls enemies in.When All Out, cooldown is reduced.",
            ),
            w: ab(
                "Path Maker",
                14,
                "K'Sante charges up, taking reduced damage, then dashes, knocking back and stunning enemies.When All Out, deals increased damage and no longer knocks back or stuns.",
            ),
            e: ab(
                "Footwork",
                10,
                "K'Sante dashes and gains a shield. If targeting an ally, K'Sante dashes to the ally with increased range and both gain a shield.When All Out, cooldown is reduced and speed is increased.",
            ),
            r: ab(
                "All Out",
                120,
                "K'Sante knocks an enemy back, launching them through any wall in their path. Then, K'Sante goes All Out and dashes after them, gaining increased damage, healing, and transformed abilities at the cost ",
            ),
        },
        items: [
            "plated_steelcaps",
            "dead_mans_plate",
            "steraks_gage",
            "sundered_sky",
            "deaths_dance",
            "guardian_angel",
        ],
        outfit: { base: 0x44d034, hands: 0x271c32, backpack: 0xb83397 },
    },
    kaisa: {
        name: "Kai'Sa",
        title: "Daughter of the Void",
        health: 172,
        speedBonus: 0,
        gun: true,
        basic: { damage: 32, cooldown: 0.5 },
        passive: {
            name: "Second Skin",
            description:
                "Kai'Sa's basic attacks stack Plasma, dealing increasing bonus magic damage. Allies' immobilizing effects help stack Plasma. Additionally, Kai'Sa's item purchase",
        },
        abilities: {
            q: ab(
                "Icathian Rain",
                10,
                "Kai'Sa shoots a swarm of missiles that seek out nearby targets.Living Weapon: Icathian Rain is upgraded to shoot more missiles.",
            ),
            w: ab(
                "Void Seeker",
                20,
                "Kai'Sa shoots a long range missile, marking enemies with her passive.Living Weapon: Void Seeker is upgraded to apply more passive marks and reduce cooldown on champion hit.",
            ),
            e: ab(
                "Supercharge",
                16,
                "Kai'Sa briefly increases her Move Speed, then increases her Attack Speed.Living Weapon: Supercharge is upgraded to briefly grant Invisibility.",
            ),
            r: ab("Killer Instinct", 130, "Kai'Sa dashes near an enemy champion."),
        },
        items: [
            "hexoptics_c44",
            "berserkers_greaves",
            "runaans_hurricane",
            "infinity_edge",
            "lord_dominiks_regards",
            "guardian_angel",
        ],
        outfit: { base: 0xa77043, hands: 0xa8613e, backpack: 0x641d74 },
    },
    kalista: {
        name: "Kalista",
        title: "the Spear of Vengeance",
        health: 152,
        speedBonus: 0,
        gun: true,
        basic: { damage: 31, cooldown: 0.5 },
        passive: {
            name: "Martial Poise",
            description:
                "Enter a movement command while winding up Kalista's basic attack or Pierce to lunge a short distance when she launches her attack.",
        },
        abilities: {
            q: ab("Pierce", 9, "Throw a fast moving spear that passes through enemies it kills."),
            w: ab(
                "Sentinel",
                30,
                "Gain bonus damage when Kalista and her Oathsworn strike the same target. Activate to send a soul to scout out the path, revealing the area in front of it.",
            ),
            e: ab(
                "Rend",
                0,
                "Attacks impale their targets with spears. Activate to rip the spears out, slowing and dealing escalating damage.",
            ),
            r: ab(
                "Fate's Call",
                160,
                "Kalista teleports the Oathsworn ally to herself. They gain the ability to dash toward a position, knocking enemy champions back.",
            ),
        },
        items: [
            "hexoptics_c44",
            "berserkers_greaves",
            "runaans_hurricane",
            "infinity_edge",
            "lord_dominiks_regards",
            "guardian_angel",
        ],
        outfit: { base: 0x1bd05b, hands: 0x2f1d19, backpack: 0x985b27 },
    },
    karma: {
        name: "Karma",
        title: "the Enlightened One",
        health: 155,
        speedBonus: 0,
        gun: true,
        basic: { damage: 27, cooldown: 0.65 },
        passive: {
            name: "Gathering Fire",
            description: "Karma's damaging abilities will reduce the cooldown of Mantra.",
        },
        abilities: {
            q: ab(
                "Inner Flame",
                9,
                "Karma sends forth a ball of spirit energy that explodes and deals damage upon hitting an enemy unit.Mantra Bonus: In addition to the explosion, Mantra increases the destructive power of her Inner Flam",
            ),
            w: ab(
                "Focused Resolve",
                12,
                "Karma creates a tether between herself and a targeted enemy, dealing damage and revealing them. If the tether is not broken, the enemy will be rooted and damaged again.Mantra Bonus: Karma strengthens ",
            ),
            e: ab(
                "Inspire",
                10,
                "Karma summons a protective shield that absorbs incoming damage and increases the Move Speed of the protected ally.Mantra Bonus: Energy radiates out from her target, strengthening the initial shield an",
            ),
            r: ab(
                "Mantra",
                40,
                "Karma empowers her next ability to do an additional effect. Mantra is available at level 1 and does not require a skill point.",
            ),
        },
        items: [
            "ludens_echo",
            "sorcerers_shoes",
            "stormsurge",
            "shadowflame",
            "rabadons_deathcap",
            "zhonyas_hourglass",
        ],
        outfit: { base: 0xa28d45, hands: 0xc08d81, backpack: 0x314287 },
    },
    karthus: {
        name: "Karthus",
        title: "the Deathsinger",
        health: 168,
        speedBonus: 0,
        gun: true,
        basic: { damage: 25, cooldown: 0.65 },
        passive: {
            name: "Death Defied",
            description: "Upon dying, Karthus enters a spirit form that allows him to continue casting spells.",
        },
        abilities: {
            q: ab(
                "Lay Waste",
                0,
                "Karthus unleashes a delayed blast at a location, dealing damage to nearby enemies. Deals increased damage to isolated enemies.",
            ),
            w: ab(
                "Wall of Pain",
                15,
                "Karthus creates a passable screen of leeching energy. Any enemy units that walk through the screen have their Move Speed and Magic Resist reduced for a period.",
            ),
            e: ab(
                "Defile",
                0.5,
                "Karthus passively steals energy from his victims, gaining Mana on each kill. Alternatively, Karthus can surround himself in the souls of his prey, dealing damage to nearby enemies, but quickly drainin",
            ),
            r: ab("Requiem", 200, "After channeling for 3 seconds, Karthus deals damage to all enemy champions."),
        },
        items: [
            "ludens_echo",
            "sorcerers_shoes",
            "stormsurge",
            "shadowflame",
            "rabadons_deathcap",
            "zhonyas_hourglass",
        ],
        outfit: { base: 0x8ed12e, hands: 0xdb347e, backpack: 0x8d282c },
    },
    kassadin: {
        name: "Kassadin",
        title: "the Void Walker",
        health: 174,
        speedBonus: 0.5,
        gun: false,
        basic: { damage: 32, cooldown: 0.45 },
        passive: { name: "Void Stone", description: "Kassadin takes reduced magic damage and ignores unit collision." },
        abilities: {
            q: ab(
                "Null Sphere",
                9,
                "Kassadin fires an orb of void energy at a target, dealing damage and interrupting channels. The excess energy forms around himself, granting a temporary shield that absorbs magic damage.",
            ),
            w: ab(
                "Nether Blade",
                7,
                "Passive: Kassadin's basic attacks deal bonus magic damage. Active: Kassadin's next basic attack deals significant bonus magic damage and restores Mana.",
            ),
            e: ab(
                "Force Pulse",
                21,
                "Kassadin draws energy from spells cast in his vicinity. Upon charging up, Kassadin can use Force Pulse to damage and slow enemies in a cone in front of him.",
            ),
            r: ab(
                "Riftwalk",
                5,
                "Kassadin teleports to a nearby location dealing damage to nearby enemy units. Multiple Riftwalks in a short period of time cost additional Mana but also deal additional damage.",
            ),
        },
        items: [
            "youmuus_ghostblade",
            "plated_steelcaps",
            "the_collector",
            "infinity_edge",
            "lord_dominiks_regards",
            "bloodthirster",
        ],
        outfit: { base: 0xa2ab99, hands: 0x21617a, backpack: 0x577f97 },
    },
    katarina: {
        name: "Katarina",
        title: "the Sinister Blade",
        health: 180,
        speedBonus: 0.5,
        gun: false,
        basic: { damage: 32, cooldown: 0.45 },
        passive: {
            name: "Voracity",
            description:
                "Whenever an enemy champion dies that Katarina has damaged recently, her remaining ability cooldowns are dramatically reduced.If Katarina picks up a Dagger, she ",
        },
        abilities: {
            q: ab(
                "Bouncing Blade",
                11,
                "Katarina throws a Dagger at the target that then bounces to nearby enemies before ricocheting onto the ground.",
            ),
            w: ab(
                "Preparation",
                15,
                "Katarina gains a burst of Move Speed, tossing a Dagger into the air directly above herself.",
            ),
            e: ab(
                "Shunpo",
                12,
                "Katarina blinks to the target, striking it if its an enemy, or striking the nearest enemy otherwise.",
            ),
            r: ab(
                "Death Lotus",
                75,
                "Katarina becomes a flurry of blades, dealing massive magic damage while she channels to the 3 nearest enemy champions.",
            ),
        },
        items: [
            "youmuus_ghostblade",
            "plated_steelcaps",
            "the_collector",
            "infinity_edge",
            "lord_dominiks_regards",
            "bloodthirster",
        ],
        outfit: { base: 0x22163e, hands: 0x61d02a, backpack: 0x17b654 },
    },
    kayle: {
        name: "Kayle",
        title: "the Righteous",
        health: 180,
        speedBonus: 0,
        gun: true,
        basic: { damage: 28, cooldown: 0.5 },
        passive: {
            name: "Divine Ascent",
            description:
                "Kayle's attacks are empowered by the heavens as she levels up and spends skill points. Her wings are lit aflame as she progressively gains Attack Speed, Move Sp",
        },
        abilities: {
            q: ab(
                "Radiant Blast",
                12,
                "Kayle conjures a portal, summoning a celestial sword that pierces through enemies, slowing, damaging, and reducing the resistances of all hit.",
            ),
            w: ab(
                "Celestial Blessing",
                15,
                "Blessed by the divine, Kayle heals and grants Move Speed to herself and the nearest ally.",
            ),
            e: ab(
                "Starfire Spellblade",
                8,
                "Passive: Kayle's celestial sword, Virtue, deals bonus magic damage to enemies she attacks.Active: Kayle's next attack smites her target with celestial fire, dealing bonus damage proportionate to their",
            ),
            r: ab(
                "Divine Judgment",
                160,
                "Kayle makes an ally invulnerable and calls upon former Aspects of Justice to purify the area around her target with a holy rain of swords.",
            ),
        },
        items: [
            "hexoptics_c44",
            "berserkers_greaves",
            "runaans_hurricane",
            "infinity_edge",
            "lord_dominiks_regards",
            "guardian_angel",
        ],
        outfit: { base: 0x4d1768, hands: 0x176657, backpack: 0x617c2a },
    },
    kayn: {
        name: "Kayn",
        title: "the Shadow Reaper",
        health: 176,
        speedBonus: 0.5,
        gun: false,
        basic: { damage: 34, cooldown: 0.55 },
        passive: {
            name: "The Darkin Scythe",
            description:
                "Kayn wields an ancient weapon and fights Rhaast, the darkin within it, for control. Either the Darkin will triumph, or Kayn will master Rhaast and become the Sh",
        },
        abilities: {
            q: ab("Reaping Slash", 7, "Kayn dashes, then slashes. Both deal damage."),
            w: ab("Blade's Reach", 13, "Kayn damages and slows targets in a line."),
            e: ab("Shadow Step", 21, "Kayn can walk through terrain."),
            r: ab("Umbral Trespass", 120, "Kayn hides in an enemy's body, dealing massive damage when he bursts out."),
        },
        items: [
            "berserkers_greaves",
            "stridebreaker",
            "phantom_dancer",
            "dead_mans_plate",
            "steraks_gage",
            "deaths_dance",
        ],
        outfit: { base: 0xbb24c0, hands: 0x64d165, backpack: 0xd03bda },
    },
    kennen: {
        name: "Kennen",
        title: "the Heart of the Tempest",
        health: 158,
        speedBonus: 0,
        gun: true,
        basic: { damage: 26, cooldown: 0.65 },
        passive: { name: "Mark of the Storm", description: "Kennen stuns enemies he hits 3 times with his abilities." },
        abilities: {
            q: ab(
                "Thundering Shuriken",
                7,
                "Kennen throws a fast moving shuriken towards a location, causing damage and adding a Mark of the Storm to any opponent that it hits.",
            ),
            w: ab(
                "Electrical Surge",
                13,
                "Kennen passively deals extra damage and adds a Mark of the Storm to his target every few attacks, and he can activate this ability to damage and add another Mark of the Storm to targets who are alread",
            ),
            e: ab(
                "Lightning Rush",
                10,
                "Kennen morphs into a lightning form, enabling him to pass through units and apply a Mark of the Storm. Kennen gains Move Speed when entering this form, and attack speed when leaving it.",
            ),
            r: ab(
                "Slicing Maelstrom",
                120,
                "Kennen summons a storm that strikes at nearby enemy champions for magical damage.",
            ),
        },
        items: [
            "ludens_echo",
            "sorcerers_shoes",
            "stormsurge",
            "shadowflame",
            "rabadons_deathcap",
            "zhonyas_hourglass",
        ],
        outfit: { base: 0x48b72c, hands: 0x432067, backpack: 0xcc2f37 },
    },
    khazix: {
        name: "Kha'Zix",
        title: "the Voidreaver",
        health: 173,
        speedBonus: 0.5,
        gun: false,
        basic: { damage: 33, cooldown: 0.45 },
        passive: {
            name: "Unseen Threat",
            description:
                "Nearby enemies that are Isolated from their allies are marked. Kha'Zix's abilities have interactions with Isolated targets.When Kha'Zix is not visible to the en",
        },
        abilities: {
            q: ab(
                "Taste Their Fear",
                4,
                "Deals physical damage to the target. Damage increased on Isolated targets. If he chooses to Evolve Reaper Claws, this refunds a percent of it's cooldown against Isolated targets. Kha'Zix also gains in",
            ),
            w: ab(
                "Void Spike",
                9,
                "Kha'Zix fires exploding spikes that deal physical damage to enemies hit. Kha'Zix is healed if he is also within the explosion radius. If he chooses to Evolve Spike Racks, Void Spike now fires three sp",
            ),
            e: ab(
                "Leap",
                20,
                "Kha'Zix leaps to an area, dealing physical damage upon landing. If he chooses to Evolve Wings, Leap's range increases and the cooldown resets on champion kill or assist.",
            ),
            r: ab(
                "Void Assault",
                100,
                "Each rank allows Kha'Zix to evolve one of his abilities, giving it a unique additional effect. When activated, Kha'Zix becomes Invisible, triggering Unseen Threat and increasing Move Speed. If he choo",
            ),
        },
        items: [
            "youmuus_ghostblade",
            "plated_steelcaps",
            "the_collector",
            "infinity_edge",
            "lord_dominiks_regards",
            "bloodthirster",
        ],
        outfit: { base: 0x26c177, hands: 0x5b9790, backpack: 0x1eb529 },
    },
    kindred: {
        name: "Kindred",
        title: "The Eternal Hunters",
        health: 161,
        speedBonus: 0,
        gun: true,
        basic: { damage: 34, cooldown: 0.5 },
        passive: {
            name: "Mark of the Kindred",
            description:
                "Kindred can mark targets to Hunt. Successfully completing a Hunt permanently empowers Kindred's basic abilities. Every 4 hunts completed also increases Kindred'",
        },
        abilities: {
            q: ab("Dance of Arrows", 9, "Kindred tumbles and shoots up to three arrows at nearby targets."),
            w: ab(
                "Wolf's Frenzy",
                18,
                "Wolf enrages and attacks enemies around him. Lamb passively gains stacks by moving and attacking. When fully charged, Lamb's next attack restores health.",
            ),
            e: ab(
                "Mounting Dread",
                14,
                "Lamb fires a carefully placed shot, slowing the target. If Lamb attacks the target two more times, her third attack instead directs Wolf to pounce on the enemy, savaging them for massive damage.",
            ),
            r: ab(
                "Lamb's Respite",
                160,
                "Lamb grants all living things inside a zone a respite from death. Until the effect ends, nothing can die. At the end, units are healed.",
            ),
        },
        items: [
            "hexoptics_c44",
            "berserkers_greaves",
            "runaans_hurricane",
            "infinity_edge",
            "lord_dominiks_regards",
            "guardian_angel",
        ],
        outfit: { base: 0x391c88, hands: 0x2f2e22, backpack: 0x39a947 },
    },
    kled: {
        name: "Kled",
        title: "the Cantankerous Cavalier",
        health: 115,
        speedBonus: 0.5,
        gun: false,
        basic: { damage: 34, cooldown: 0.55 },
        passive: {
            name: "Skaarl, the Cowardly Lizard",
            description:
                "Kled rides his trusty steed, Skaarl, who takes damage for him. When Skaarl's health depletes, Kled dismounts.While dismounted, Kled's abilities change and he de",
        },
        abilities: {
            q: ab(
                "Bear Trap on a Rope",
                11,
                "Kled throws a bear trap that damages and hooks an enemy champion. If shackled for a short duration, the target takes additional physical damage and is yanked toward Kled.When dismounted, this ability ",
            ),
            w: ab(
                "Violent Tendencies",
                13,
                "Kled gains massive attack speed for four attacks. The fourth attack deals more damage.",
            ),
            e: ab(
                "Jousting",
                13,
                "Kled dashes, dealing physical damage and gaining a short burst of speed. Kled can cast this ability again to dash back through his initial target, dealing the same damage.",
            ),
            r: ab(
                "Chaaaaaaaarge!!!",
                140,
                "Kled and Skaarl charge to a location, leaving a speed-granting trail behind them and gaining a shield. Skaarl locks onto and rams the first enemy champion encountered.",
            ),
        },
        items: [
            "berserkers_greaves",
            "stridebreaker",
            "phantom_dancer",
            "dead_mans_plate",
            "steraks_gage",
            "deaths_dance",
        ],
        outfit: { base: 0x6dc422, hands: 0x518764, backpack: 0xdc403e },
    },
    kogmaw: {
        name: "Kog'Maw",
        title: "the Mouth of the Abyss",
        health: 171,
        speedBonus: 0,
        gun: true,
        basic: { damage: 34, cooldown: 0.5 },
        passive: {
            name: "Icathian Surprise",
            description: "4 seconds after dying, Kogmaw explodes, dealing true damage to surrounding enemies.",
        },
        abilities: {
            q: ab(
                "Caustic Spittle",
                7,
                "Kog'Maw launches a corrosive projectile which deals magic damage and corrodes the target's armor and magic resist for a short time. Kog'Maw also gains additional attack speed.",
            ),
            w: ab(
                "Bio-Arcane Barrage",
                17,
                "Kog'Maw's attacks gain range and deal a percent of the target's maximum health as magic damage %i:OnHit% On-Hit.",
            ),
            e: ab(
                "Void Ooze",
                12,
                "Kog'Maw launches a peculiar ooze which damages all enemies it passes through and leaves a trail which slows enemies who stand on it.",
            ),
            r: ab(
                "Living Artillery",
                2,
                "Kog'Maw fires an artillery shell at a great distance dealing magic damage (increased significantly on low health enemies) and revealing non-stealthed targets. Additionally, multiple Living Artilleries",
            ),
        },
        items: [
            "hexoptics_c44",
            "berserkers_greaves",
            "runaans_hurricane",
            "infinity_edge",
            "lord_dominiks_regards",
            "guardian_angel",
        ],
        outfit: { base: 0x5776bf, hands: 0x4c739b, backpack: 0x8a374a },
    },
    leblanc: {
        name: "LeBlanc",
        title: "the Deceiver",
        health: 162,
        speedBonus: 0.5,
        gun: true,
        basic: { damage: 30, cooldown: 0.45 },
        passive: {
            name: "Mirror Image",
            description:
                "When LeBlanc drops below 40% Health, she becomes invisible for 1 second and creates a Mirror Image that deals no damage and lasts for up to 8 seconds.",
        },
        abilities: {
            q: ab(
                "Sigil of Malice",
                6,
                "LeBlanc projects a sigil, dealing damage and marking the target for 3.5 seconds. Damaging the marked target with an ability detonates the sigil, dealing additional damage. If either part kills the tar",
            ),
            w: ab(
                "Distortion",
                15,
                "LeBlanc dashes to a location, dealing damage to enemies near her destination. For the next 4 seconds, activate Distortion again to return LeBlanc to her starting location.",
            ),
            e: ab(
                "Ethereal Chains",
                14,
                "LeBlanc launches a chain that shackles the first enemy hit. If the target remains shackled for 1.5 seconds, LeBlanc roots them and deals additional damage.",
            ),
            r: ab("Mimic", 45, "LeBlanc casts a mimicked version of one of her basic spells."),
        },
        items: [
            "youmuus_ghostblade",
            "plated_steelcaps",
            "the_collector",
            "infinity_edge",
            "lord_dominiks_regards",
            "bloodthirster",
        ],
        outfit: { base: 0x181e5f, hands: 0xbc1b88, backpack: 0x7da65d },
    },
    leesin: {
        name: "Lee Sin",
        title: "the Blind Monk",
        health: 174,
        speedBonus: 0.5,
        gun: false,
        basic: { damage: 34, cooldown: 0.55 },
        passive: {
            name: "Flurry",
            description: "After Lee Sin uses an ability, his next 2 basic attacks gain Attack Speed and return Energy.",
        },
        abilities: {
            q: ab(
                "Sonic Wave / Resonating Strike",
                10,
                "Sonic Wave: Lee Sin projects a discordant wave of sound to locate his enemies, dealing physical damage to the first enemy it encounters. If Sonic Wave hits, Lee Sin can cast Resonating Strike for the ",
            ),
            w: ab(
                "Safeguard / Iron Will",
                8,
                "Safeguard: Lee Sin rushes to target ally, shielding himself from damage. If the ally is a champion, they are also shielded. After using Safeguard, Lee Sin can cast Iron Will.Iron Will: Lee Sin's inten",
            ),
            e: ab(
                "Tempest / Cripple",
                8,
                "Tempest: Lee Sin smashes the ground, sending out a shockwave that deals magic damage and reveals enemy units hit. If Tempest hits an enemy, Lee Sin can cast cripple.Cripple: Lee Sin cripples nearby en",
            ),
            r: ab(
                "Dragon's Rage",
                110,
                "Lee Sin performs a powerful roundhouse kick launching his target back, dealing physical damage to the target and any enemies they collide with. Enemies the target collides with are knocked into the ai",
            ),
        },
        items: [
            "berserkers_greaves",
            "stridebreaker",
            "phantom_dancer",
            "dead_mans_plate",
            "steraks_gage",
            "deaths_dance",
        ],
        outfit: { base: 0x259f36, hands: 0x3c23c0, backpack: 0xdaa596 },
    },
    leona: {
        name: "Leona",
        title: "the Radiant Dawn",
        health: 184,
        speedBonus: 0,
        gun: false,
        basic: { damage: 33, cooldown: 0.6 },
        passive: {
            name: "Sunlight",
            description:
                "Damaging spells afflict enemies with Sunlight for 1.5 seconds. When allied Champions deal damage to those targets, they consume the Sunlight to deal additional ",
        },
        abilities: {
            q: ab(
                "Shield of Daybreak",
                5,
                "Leona uses her shield to perform her next basic attack, dealing bonus magic damage and stunning the target.",
            ),
            w: ab(
                "Eclipse",
                14,
                "Leona raises her shield to gain Damage Reduction, Armor, and Magic Resist. When the duration first ends, if there are nearby enemies, she will deal magic damage to them and prolong the duration of the",
            ),
            e: ab(
                "Zenith Blade",
                12,
                "Leona projects a solar image of her sword, dealing magic damage to all enemies in a line. When the image fades, the last enemy champion struck will be briefly immobilized and Leona will dash to them.",
            ),
            r: ab(
                "Solar Flare",
                90,
                "Leona calls down a beam of solar energy, dealing damage to enemies in an area. Enemies in the center of the area are stunned, while enemies on the outside are slowed.",
            ),
        },
        items: [
            "plated_steelcaps",
            "dead_mans_plate",
            "steraks_gage",
            "sundered_sky",
            "deaths_dance",
            "guardian_angel",
        ],
        outfit: { base: 0x17313f, hands: 0xc1337f, backpack: 0x8fb09b },
    },
    lillia: {
        name: "Lillia",
        title: "the Bashful Bloom",
        health: 164,
        speedBonus: 0.5,
        gun: false,
        basic: { damage: 34, cooldown: 0.55 },
        passive: {
            name: "Dream-Laden Bough",
            description: "Hitting a champion or monster with a skill will deal additional max Health damage over time.",
        },
        abilities: {
            q: ab(
                "Blooming Blows",
                6,
                "Passively, Lillia gains stacking Move Speed when hitting enemies with spells. She can activate this to deal magic damage to nearby enemies, dealing extra true damage on the edge.",
            ),
            w: ab("Watch Out! Eep!", 14, "Lillia deals damage in a nearby area, dealing heavy damage in the center."),
            e: ab(
                "Swirlseed",
                12,
                "Lillia hurls a seed that damages and slows those it lands on. If it doesn't hit anything, it will continue rolling until it hits a wall or target.",
            ),
            r: ab(
                "Lilting Lullaby",
                150,
                "Lillia causes all enemies with Dream Dust on them to become Drowsy before falling asleep. Those enemies will take extra damage on being forcibly woken up.",
            ),
        },
        items: [
            "berserkers_greaves",
            "stridebreaker",
            "phantom_dancer",
            "dead_mans_plate",
            "steraks_gage",
            "deaths_dance",
        ],
        outfit: { base: 0xd92b31, hands: 0x211a42, backpack: 0xc3635f },
    },
    lissandra: {
        name: "Lissandra",
        title: "the Ice Witch",
        health: 168,
        speedBonus: 0,
        gun: true,
        basic: { damage: 30, cooldown: 0.65 },
        passive: {
            name: "Iceborn Subjugation",
            description:
                "When an enemy champion dies near Lissandra they become a Frozen Thrall. Frozen Thralls slow nearby enemies and then, after a delay, shatter from the intense col",
        },
        abilities: {
            q: ab(
                "Ice Shard",
                7,
                "Throws a spear of ice that shatters when it hits an enemy, dealing magic damage and slowing Move Speed. Shards pass through the target, dealing the same damage to other enemies hit.",
            ),
            w: ab("Ring of Frost", 10, "Freezes nearby enemies in ice, dealing magic damage and rooting them."),
            e: ab(
                "Glacial Path",
                24,
                "Lissandra creates an ice claw that deals magic damage. Reactivating this ability transports Lissandra to the claw's current location.",
            ),
            r: ab(
                "Frozen Tomb",
                120,
                "If cast on an enemy champion, the target is frozen solid, stunning it. If cast on Lissandra, she encases herself in dark ice, healing herself while becoming untargetable and invulnerable. Dark ice the",
            ),
        },
        items: [
            "ludens_echo",
            "sorcerers_shoes",
            "stormsurge",
            "shadowflame",
            "rabadons_deathcap",
            "zhonyas_hourglass",
        ],
        outfit: { base: 0x1c4822, hands: 0x474837, backpack: 0xa22acc },
    },
    locke: {
        name: "Locke",
        title: "the Ashen Exorcist",
        health: 168,
        speedBonus: 0.5,
        gun: false,
        basic: { damage: 32, cooldown: 0.45 },
        passive: {
            name: "Silver Stake",
            description:
                "Locke's attacks deal additional magic damage On-Hit, increased based on enemy missing Health.",
        },
        abilities: {
            q: ab(
                "Ritual Nails",
                10,
                "Locke readies a set of Soul Nails to throw, dealing damage to and marking enemies hit. Locke can consume the marks to deal bonus damage with his attacks.",
            ),
            w: ab(
                "Soul Ignition",
                18,
                "Locke ignites his soul, gaining Attack Speed and Move Speed, and dealing damage to himself. At the end of the duration, Locke will heal back a portion of the damage he takes during the effect.",
            ),
            e: ab(
                "Ashen Pursuit",
                10,
                "Locke teleports to a location before dashing to attack his next target, dealing damage to enemies passed through.",
            ),
            r: ab(
                "Purgatory",
                120,
                "Locke throws a binding artifact that deals damage and potentially executes enemies hit. Locke gains additional power for sealing away enemy champions.",
            ),
        },
        items: [
            "youmuus_ghostblade",
            "plated_steelcaps",
            "the_collector",
            "infinity_edge",
            "lord_dominiks_regards",
            "bloodthirster",
        ],
        outfit: { base: 0x217245, hands: 0xaa151d, backpack: 0x3ecfca },
    },
    lucian: {
        name: "Lucian",
        title: "the Purifier",
        health: 173,
        speedBonus: 0,
        gun: true,
        basic: { damage: 33, cooldown: 0.5 },
        passive: {
            name: "Lightslinger",
            description:
                "Whenever Lucian uses an ability, his next attack becomes a double-shot. When Lucian is healed or shielded by an ally, or when a nearby enemy Champion is immobil",
        },
        abilities: {
            q: ab("Piercing Light", 9, "Lucian shoots a bolt of piercing light through a target."),
            w: ab(
                "Ardent Blaze",
                14,
                "Lucian shoots a missile that explodes in a star shape, marking and briefly revealing enemies. Lucian gains Move Speed for attacking marked enemies.",
            ),
            e: ab(
                "Relentless Pursuit",
                16,
                "Lucian quickly dashes a short distance. Lightslinger attacks reduce Relentless Pursuit's cooldown.",
            ),
            r: ab("The Culling", 110, "Lucian unleashes a torrent of shots from his weapons."),
        },
        items: [
            "hexoptics_c44",
            "berserkers_greaves",
            "runaans_hurricane",
            "infinity_edge",
            "lord_dominiks_regards",
            "guardian_angel",
        ],
        outfit: { base: 0x317016, hands: 0x7e697d, backpack: 0xbbc746 },
    },
    lulu: {
        name: "Lulu",
        title: "the Fae Sorceress",
        health: 139,
        speedBonus: 0,
        gun: true,
        basic: { damage: 26, cooldown: 0.6 },
        passive: {
            name: "Pix, Faerie Companion",
            description:
                "Pix fires magical bolts of energy whenever the champion he's following attacks another enemy unit. These bolts are homing, but can be intercepted by other units",
        },
        abilities: {
            q: ab(
                "Glitterlance",
                7,
                "Pix and Lulu each fire a bolt of magical energy that damages and heavily slows all enemies it hits.",
            ),
            w: ab(
                "Whimsy",
                18,
                "If cast on an ally, grants them Attack Speed and Move Speed for a short time. If cast on an enemy, turns them into an adorable critter that can't attack or cast spells.",
            ),
            e: ab(
                "Help, Pix!",
                10,
                "If cast on an ally, commands Pix to jump to an ally and shield them. He then follows them and aids their attacks. If cast on an enemy, commands Pix to jump to an enemy and damage them. He then follows",
            ),
            r: ab(
                "Wild Growth",
                120,
                "Lulu enlarges an ally, knocking nearby enemies into the air and granting the ally a large amount of bonus health. For the next few seconds, that ally gains an aura that slows nearby enemies.",
            ),
        },
        items: [
            "ionian_boots_of_lucidity",
            "zhonyas_hourglass",
            "rabadons_deathcap",
            "malignance",
            "stormsurge",
            "shadowflame",
        ],
        outfit: { base: 0x6e9a3e, hands: 0x74d13a, backpack: 0x4a1615 },
    },
    malphite: {
        name: "Malphite",
        title: "Shard of the Monolith",
        health: 204,
        speedBonus: 0,
        gun: false,
        basic: { damage: 34, cooldown: 0.6 },
        passive: {
            name: "Granite Shield",
            description:
                "Malphite is shielded by a layer of rock which absorbs damage up to 10% of his maximum Health. If Malphite has not been hit for a few seconds, this effect rechar",
        },
        abilities: {
            q: ab(
                "Seismic Shard",
                8,
                "Malphite sends a shard of the earth through the ground at his foe, dealing damage upon impact and stealing Move Speed for 3 seconds.",
            ),
            w: ab(
                "Thunderclap",
                10,
                "Malphite attacks with such force that it creates a sonic boom. For the next few seconds, his attacks create aftershocks in front of him.",
            ),
            e: ab(
                "Ground Slam",
                7,
                "Malphite slams the ground, sending out a shockwave that deals magic damage based on his Armor and reduces the Attack Speed of enemies for a short duration.",
            ),
            r: ab(
                "Unstoppable Force",
                130,
                "Malphite launches himself to a location at high speed, damaging enemies and knocking them into the air.",
            ),
        },
        items: [
            "plated_steelcaps",
            "dead_mans_plate",
            "steraks_gage",
            "sundered_sky",
            "deaths_dance",
            "guardian_angel",
        ],
        outfit: { base: 0xb08d27, hands: 0x15578a, backpack: 0x1860c3 },
    },
    malzahar: {
        name: "Malzahar",
        title: "the Prophet of the Void",
        health: 158,
        speedBonus: 0,
        gun: true,
        basic: { damage: 30, cooldown: 0.65 },
        passive: {
            name: "Void Shift",
            description:
                "When he hasn't recently taken damage or been crowd controlled, Malzahar gains massive damage reduction and crowd control immunity, lingering for a short period ",
        },
        abilities: {
            q: ab(
                "Call of the Void",
                6,
                "Malzahar opens up two portals to the Void. After a short delay, they fire projectiles that deal Magic Damage and silence enemy champions.",
            ),
            w: ab("Void Swarm", 8, "Malzahar summons Voidlings to attack nearby enemies."),
            e: ab(
                "Malefic Visions",
                11,
                "Malzahar infects his target's mind with cruel visions of their demise, dealing damage over time. Using Malzahar's other spells on the target will refresh the visions.If the target dies while afflicted",
            ),
            r: ab(
                "Nether Grasp",
                140,
                "Malzahar channels the essence of the Void to suppress an enemy champion over a zone of damaging negative energy.",
            ),
        },
        items: [
            "ludens_echo",
            "sorcerers_shoes",
            "stormsurge",
            "shadowflame",
            "rabadons_deathcap",
            "zhonyas_hourglass",
        ],
        outfit: { base: 0xaf4636, hands: 0xb06687, backpack: 0x151544 },
    },
    maokai: {
        name: "Maokai",
        title: "the Twisted Treant",
        health: 189,
        speedBonus: 0,
        gun: false,
        basic: { damage: 34, cooldown: 0.6 },
        passive: {
            name: "Sap Magic",
            description:
                "Maokai's basic attack also heals him and deals additional damage on a moderate cooldown. Each time Maokai casts a spell or is struck by an enemy's spell, this c",
        },
        abilities: {
            q: ab(
                "Bramble Smash",
                7,
                "Maokai knocks back nearby enemies with a shockwave, dealing magic damage and slowing them.",
            ),
            w: ab(
                "Twisted Advance",
                14,
                "Maokai contorts into a mass of moving roots, becoming untargetable and dashing to the target. Upon arrival, he roots the target.",
            ),
            e: ab(
                "Sapling Toss",
                18,
                "Maokai flings a sapling to the target area to stand guard. More effective in brush.",
            ),
            r: ab(
                "Nature's Grasp",
                130,
                "Maokai summons a colossal wall of brambles and thorns that slowly advances forwards, damaging and rooting any enemies in the path.",
            ),
        },
        items: [
            "plated_steelcaps",
            "dead_mans_plate",
            "steraks_gage",
            "sundered_sky",
            "deaths_dance",
            "guardian_angel",
        ],
        outfit: { base: 0x1f763b, hands: 0x52753d, backpack: 0x2845cb },
    },
    mel: {
        name: "Mel",
        title: "the Soul's Reflection",
        health: 155,
        speedBonus: 0,
        gun: true,
        basic: { damage: 30, cooldown: 0.65 },
        passive: {
            name: "Searing Brilliance",
            description:
                "Whenever Mel uses an ability, she gains three bonus projectiles (up to nine maximum) on her next attack.When Mel deals damage through an ability or attack, she ",
        },
        abilities: {
            q: ab(
                "Radiant Volley",
                10,
                "Mel fires a barrage of projectiles that explode around a target location, dealing damage repeatedly to enemies within the area.",
            ),
            w: ab(
                "Rebuttal",
                38,
                "Mel forms a barrier around herself that reflects enemy projectiles back at the attacker, prevents her from taking damage, and grants her movement speed.",
            ),
            e: ab(
                "Solar Snare",
                11,
                "Mel fires a radiant orb forward, rooting those at its center while the area around it slows enemies and deals damage over time.",
            ),
            r: ab(
                "Golden Eclipse",
                120,
                "Mel strikes all enemies marked with Overwhelm regardless of their distance from her, dealing additional damage for each stack of Overwhelm.Ranks of Golden Eclipse increase Overwhelm's damage.",
            ),
        },
        items: [
            "ludens_echo",
            "sorcerers_shoes",
            "stormsurge",
            "shadowflame",
            "rabadons_deathcap",
            "zhonyas_hourglass",
        ],
        outfit: { base: 0x5eae4a, hands: 0x4115bb, backpack: 0x15b0b7 },
    },
    milio: {
        name: "Milio",
        title: "The Gentle Flame",
        health: 137,
        speedBonus: 0,
        gun: true,
        basic: { damage: 26, cooldown: 0.6 },
        passive: {
            name: "Fired Up!",
            description:
                "Milio's abilities enchant allies on touch, making their next damage deal a burst of extra damage and burn the target.",
        },
        abilities: {
            q: ab(
                "Ultra Mega Fire Kick",
                10,
                "Kick a ball that knocks back an enemy. The ball launches upward on hit and falls toward the enemy, damaging and slowing enemies in the area upon impact.",
            ),
            w: ab(
                "Cozy Campfire",
                29,
                "Create an empowering zone that heals allies and increases attack range to those inside. The zone follows the ally nearest to the cast point.",
            ),
            e: ab(
                "Warm Hugs",
                0.5,
                "Milio tosses a shield to an ally, temporarily increasing their movement speed. This ability has 2 charges.",
            ),
            r: ab(
                "Breath of Life",
                160,
                "Milio unleashes a wave of soothing flames that heal and remove crowd control effects from allies in range.",
            ),
        },
        items: [
            "ionian_boots_of_lucidity",
            "zhonyas_hourglass",
            "rabadons_deathcap",
            "malignance",
            "stormsurge",
            "shadowflame",
        ],
        outfit: { base: 0x311723, hands: 0x50482e, backpack: 0x3f2a96 },
    },
    missfortune: {
        name: "Miss Fortune",
        title: "the Bounty Hunter",
        health: 169,
        speedBonus: 0,
        gun: true,
        basic: { damage: 30, cooldown: 0.5 },
        passive: {
            name: "Love Tap",
            description: "Miss Fortune deals bonus physical damage whenever she basic attacks a new target.",
        },
        abilities: {
            q: ab(
                "Double Up",
                7,
                "Miss Fortune fires a bullet at an enemy, damaging them and a target behind them. Both strikes can also apply Love Tap.",
            ),
            w: ab(
                "Strut",
                12,
                "Miss Fortune passively gains Move Speed when not attacked. This ability can be activated to grant bonus Attack Speed for a short duration. While it's on cooldown, Love Taps reduce the remaining cooldo",
            ),
            e: ab(
                "Make It Rain",
                18,
                "Miss Fortune reveals an area with a flurry of bullets, dealing waves of damage to opponents and slowing them.",
            ),
            r: ab(
                "Bullet Time",
                120,
                "Miss Fortune channels a barrage of bullets into a cone in front of her, dealing large amounts of damage to enemies. Each wave of Bullet Time can critically strike",
            ),
        },
        items: [
            "hexoptics_c44",
            "berserkers_greaves",
            "runaans_hurricane",
            "infinity_edge",
            "lord_dominiks_regards",
            "guardian_angel",
        ],
        outfit: { base: 0x4536ca, hands: 0x6594ce, backpack: 0xd07714 },
    },
    monkeyking: {
        name: "Wukong",
        title: "the Monkey King",
        health: 190,
        speedBonus: 0.5,
        gun: false,
        basic: { damage: 34, cooldown: 0.55 },
        passive: {
            name: "Stone Skin",
            description:
                "Wukong gains stacking armor and max health regeneration while fighting champions and monsters.",
        },
        abilities: {
            q: ab(
                "Crushing Blow",
                8,
                "Wukong's next attack gains attack range, deals bonus damage, and reduces the target's armor for a few seconds.",
            ),
            w: ab(
                "Warrior Trickster",
                22,
                "Wukong becomes Invisible and dashes in a direction, leaving behind a clone that will attack nearby enemies.",
            ),
            e: ab(
                "Nimbus Strike",
                10,
                "Wukong dashes to a targeted enemy and sends out images to attack enemies near his target, dealing damage to each enemy struck.",
            ),
            r: ab(
                "Cyclone",
                130,
                "Wukong's extends his staff and spins it around repeatedly, gaining Move Speed.Enemies struck take damage and are knocked up.",
            ),
        },
        items: [
            "berserkers_greaves",
            "stridebreaker",
            "phantom_dancer",
            "dead_mans_plate",
            "steraks_gage",
            "deaths_dance",
        ],
        outfit: { base: 0x735a1e, hands: 0xc05942, backpack: 0x979363 },
    },
    mordekaiser: {
        name: "Mordekaiser",
        title: "the Iron Revenant",
        health: 174,
        speedBonus: 0.5,
        gun: false,
        basic: { damage: 34, cooldown: 0.55 },
        passive: {
            name: "Darkness Rise",
            description:
                "Mordekaiser gains a powerful damage aura and Move Speed after landing 3 attacks or spells against champions or monsters.",
        },
        abilities: {
            q: ab(
                "Obliterate",
                8,
                "Mordekaiser smashes the ground with his mace dealing damage to each enemy struck. Damage is increased when hitting a single enemy.",
            ),
            w: ab(
                "Indestructible",
                12,
                "Mordekaiser stores damage he deals and takes to create a shield. He may consume the shield to heal.",
            ),
            e: ab("Death's Grasp", 16, "Mordekaiser pulls all enemies in an area."),
            r: ab(
                "Realm of Death",
                120,
                "Mordekaiser drags his victim to a different dimension with him and steals a portion of their stats. If he kills them, he keeps the stats until the victim respawns.",
            ),
        },
        items: [
            "berserkers_greaves",
            "stridebreaker",
            "phantom_dancer",
            "dead_mans_plate",
            "steraks_gage",
            "deaths_dance",
        ],
        outfit: { base: 0x364629, hands: 0x59ba27, backpack: 0x425326 },
    },
    morgana: {
        name: "Morgana",
        title: "the Fallen",
        health: 155,
        speedBonus: 0,
        gun: true,
        basic: { damage: 31, cooldown: 0.6 },
        passive: {
            name: "Soul Siphon",
            description:
                "Morgana drains spirit from her enemies, healing as she deals damage to champions, large minions, and medium and larger jungler monsters.",
        },
        abilities: {
            q: ab(
                "Dark Binding",
                10,
                "Morgana binds an enemy in place with dark magic, forcing them to feel the pain they've caused and dealing magic damage.",
            ),
            w: ab(
                "Tormented Shadow",
                12,
                "Morgana casts a cursed shadow on an area, damaging enemies who dare stand in her dark circle. They receive magic damage over time, which increases the lower health they are.",
            ),
            e: ab(
                "Black Shield",
                26,
                "Morgana anoints an ally with a protective barrier of starfire, which absorbs magical damage and disabling effects until it is broken.",
            ),
            r: ab(
                "Soul Shackles",
                120,
                "Morgana unleashes the full force of her Celestial power as she unbinds her wings and hovers above the ground. She lashes chains of dark pain onto nearby enemy champions, gaining Move Speed. The chains",
            ),
        },
        items: [
            "ionian_boots_of_lucidity",
            "zhonyas_hourglass",
            "rabadons_deathcap",
            "malignance",
            "stormsurge",
            "shadowflame",
        ],
        outfit: { base: 0x56a8a3, hands: 0x721555, backpack: 0xbc7f19 },
    },
    naafiri: {
        name: "Naafiri",
        title: "the Hound of a Hundred Bites",
        health: 165,
        speedBonus: 0.5,
        gun: false,
        basic: { damage: 30, cooldown: 0.45 },
        passive: {
            name: "We Are More",
            description: "Naafiri spawns packmates that attack the targets of her attacks and abilities.",
        },
        abilities: {
            q: ab(
                "Darkin Daggers",
                9,
                "Naafiri hurls up to two daggers, each inflicting bleed, or each inflicting bonus damage if the target is already bleeding.Packmates leap to attack the first champion or monster hit by this skill.",
            ),
            w: ab(
                "The Call of the Pack",
                26,
                "Naafiri becomes Untargetable and empowers her pack, spawning additional packmates and gaining increased Move Speed and Attack Damage.",
            ),
            e: ab(
                "Eviscerate",
                11,
                "Naafiri dashes and damages enemies in an area around her, recalling her packmates and fully healing them.",
            ),
            r: ab(
                "Hounds' Pursuit",
                110,
                "Naafiri and her packmates dash at a champion, dealing damage. Naafiri reveals nearby enemies if she scores a takedown and can recast this Ability once. The second cast grants a shield.",
            ),
        },
        items: [
            "youmuus_ghostblade",
            "plated_steelcaps",
            "the_collector",
            "infinity_edge",
            "lord_dominiks_regards",
            "bloodthirster",
        ],
        outfit: { base: 0xa99d27, hands: 0x46551a, backpack: 0x142e24 },
    },
    nami: {
        name: "Nami",
        title: "the Tidecaller",
        health: 137,
        speedBonus: 0,
        gun: true,
        basic: { damage: 30, cooldown: 0.6 },
        passive: {
            name: "Surging Tides",
            description: "When Nami's Abilities hit allied champions they gain Move Speed for a short duration.",
        },
        abilities: {
            q: ab(
                "Aqua Prison",
                12,
                "Sends a bubble to a target area, dealing damage and stunning all enemies on impact.",
            ),
            w: ab(
                "Ebb and Flow",
                10,
                "Unleashes a stream of water that bounces back and forth between allied and enemy champions, healing allies and damaging enemies.",
            ),
            e: ab(
                "Tidecaller's Blessing",
                11,
                "Empowers an allied champion for a short duration. The ally's basic attacks and spells deal bonus magic damage and slow the target.",
            ),
            r: ab(
                "Tidal Wave",
                120,
                "Summons a massive Tidal Wave that knocks up, slows, and damages enemies. Allies hit gain double the effect of Surging Tides.",
            ),
        },
        items: [
            "ionian_boots_of_lucidity",
            "zhonyas_hourglass",
            "rabadons_deathcap",
            "malignance",
            "stormsurge",
            "shadowflame",
        ],
        outfit: { base: 0xa03b42, hands: 0xc16c4a, backpack: 0x2c2298 },
    },
    nasus: {
        name: "Nasus",
        title: "the Curator of the Sands",
        health: 200,
        speedBonus: 0.5,
        gun: false,
        basic: { damage: 34, cooldown: 0.55 },
        passive: {
            name: "Soul Eater",
            description: "Nasus drains his foe's spiritual energy, giving him bonus Life Steal.",
        },
        abilities: {
            q: ab(
                "Siphoning Strike",
                7.5,
                "Nasus strikes his foe, dealing damage and increasing the power of his future Siphoning Strikes if he slays his target.",
            ),
            w: ab(
                "Wither",
                15,
                "Nasus ages an enemy champion, decelerating their Move Speed and Attack Speed over time.",
            ),
            e: ab(
                "Spirit Fire",
                12,
                "Nasus unleashes a spirit flame at a location, dealing damage and reducing the Armor of enemies who stand on it.",
            ),
            r: ab(
                "Fury of the Sands",
                120,
                "Nasus unleashes a mighty sandstorm that batters nearby enemies. While the storm rages, he gains increased Health, Attack Range, damages nearby enemies, has a reduced cooldown on Siphoning Strike, and ",
            ),
        },
        items: [
            "berserkers_greaves",
            "stridebreaker",
            "phantom_dancer",
            "dead_mans_plate",
            "steraks_gage",
            "deaths_dance",
        ],
        outfit: { base: 0x82bf19, hands: 0x662147, backpack: 0x73ae52 },
    },
    nautilus: {
        name: "Nautilus",
        title: "the Titan of the Depths",
        health: 184,
        speedBonus: 0,
        gun: false,
        basic: { damage: 32, cooldown: 0.6 },
        passive: {
            name: "Staggering Blow",
            description:
                "Nautilus' first Attack against a target deals increased physical damage and roots them briefly.",
        },
        abilities: {
            q: ab(
                "Dredge Line",
                14,
                "Nautilus hurls his anchor forward. Colliding with an enemy pulls them and Nautilus together, dealing magic damage. Colliding with terrain pulls Nautilus towards it.",
            ),
            w: ab(
                "Titan's Wrath",
                12,
                "Nautilus gains a temporary Shield. While it persists, his Attacks deal damage over time to his target and surrounding enemies.",
            ),
            e: ab(
                "Riptide",
                7,
                "Nautilus creates three exploding waves around himself. Each explosion damages and slows enemies.",
            ),
            r: ab(
                "Depth Charge",
                120,
                "Nautilus fires a shockwave into the earth that chases an opponent. This shockwave rips up the earth above it, knocking enemies into the air. When it reaches the opponent, the shockwave erupts, knockin",
            ),
        },
        items: [
            "plated_steelcaps",
            "dead_mans_plate",
            "steraks_gage",
            "sundered_sky",
            "deaths_dance",
            "guardian_angel",
        ],
        outfit: { base: 0x80a2a9, hands: 0xa45330, backpack: 0x6a893e },
    },
    neeko: {
        name: "Neeko",
        title: "the Curious Chameleon",
        health: 150,
        speedBonus: 0,
        gun: true,
        basic: { damage: 26, cooldown: 0.65 },
        passive: {
            name: "Inherent Glamour",
            description:
                "Neeko can look like an ally champion or as other units on the map. Receiving immobilizing crowd control, casting damaging spells, damaging enemy towers as a non",
        },
        abilities: {
            q: ab(
                "Blooming Burst",
                9,
                "Neeko throws a seed dealing magic damage. The seed blooms again on hitting champions or killing units.",
            ),
            w: ab(
                "Shapesplitter",
                16,
                "Neeko passively deals bonus magic damage every third attack, briefly increasing her move speed. Neeko can activate to send a clone in a direction and recast to change the direction of the clone.",
            ),
            e: ab(
                "Tangle-Barbs",
                12,
                "Neeko slings a tangle that damages and roots everything it passes through. If the tangle kills an enemy or passes through a champion, it becomes larger, faster, and roots for longer.",
            ),
            r: ab(
                "Pop Blossom",
                120,
                "After a short preparation, Neeko leaps into the air, knocking up all nearby enemies. Upon landing, nearby enemies are damaged and stunned. The preparation is hidden if Neeko is disguised.",
            ),
        },
        items: [
            "ludens_echo",
            "sorcerers_shoes",
            "stormsurge",
            "shadowflame",
            "rabadons_deathcap",
            "zhonyas_hourglass",
        ],
        outfit: { base: 0x53227b, hands: 0xd69535, backpack: 0xbb5328 },
    },
    nidalee: {
        name: "Nidalee",
        title: "the Bestial Huntress",
        health: 165,
        speedBonus: 0.5,
        gun: true,
        basic: { damage: 32, cooldown: 0.45 },
        passive: {
            name: "Prowl",
            description:
                "Moving through brush increases Nidalee's Move Speed by 10% for 2 seconds, increased to 30% toward visible enemy champions within 1400 range.Hitting champions or",
        },
        abilities: {
            q: ab(
                "Javelin Toss / Takedown",
                6,
                "In human form, Nidalee throws a spiked javelin at her target that gains damage as it flies. As a cougar, her next attack will attempt to fatally wound her target, dealing more damage the less life the",
            ),
            w: ab(
                "Bushwhack / Pounce",
                13,
                "In human form, Nidalee lays a trap for unwary opponents that, when sprung, damages and reveals its target. As a cougar, she jumps in a direction, dealing damage in an area where she lands.",
            ),
            e: ab(
                "Primal Surge / Swipe",
                12,
                "In human form, Nidalee channels the spirit of the cougar to heal her allies and imbue them with Attack Speed for a short duration. As a cougar, she claws in a direction, dealing damage to enemies in f",
            ),
            r: ab("Aspect Of The Cougar", 3, "Nidalee transforms into a cougar, gaining new abilities."),
        },
        items: [
            "youmuus_ghostblade",
            "plated_steelcaps",
            "the_collector",
            "infinity_edge",
            "lord_dominiks_regards",
            "bloodthirster",
        ],
        outfit: { base: 0x393e1f, hands: 0x2a5b92, backpack: 0x8c9435 },
    },
    nilah: {
        name: "Nilah",
        title: "the Joy Unbound",
        health: 155,
        speedBonus: 0.5,
        gun: false,
        basic: { damage: 32, cooldown: 0.55 },
        passive: {
            name: "Joy Unending",
            description:
                "Nilah gains increased experience from last-hitting minions along with the ability to enhance and share nearby healing and shielding from her allies.",
        },
        abilities: {
            q: ab(
                "Formless Blade",
                4,
                "With a snap of her whip-blade, Nilah damages any enemies she hits in a straight line in her chosen direction. This action extends her attack range for a short duration.",
            ),
            w: ab(
                "Jubilant Veil",
                26,
                "Nilah envelops herself in mist, increasing her movement speed and allowing her to gracefully dodge all incoming attacks. Any allies she touches during the mist's duration will also gain this effect.",
            ),
            e: ab(
                "Slipstream",
                0.5,
                "Nilah enthusiastically dashes toward her target, dealing damage to any enemies she passes through on the way.",
            ),
            r: ab(
                "Apotheosis",
                110,
                "Twirling her whip-blade in joyful exuberance, Nilah deals damage to enemies around her before pulling them closer with her weapon.",
            ),
        },
        items: [
            "berserkers_greaves",
            "stridebreaker",
            "phantom_dancer",
            "dead_mans_plate",
            "steraks_gage",
            "deaths_dance",
        ],
        outfit: { base: 0xad1cb6, hands: 0x9d5da7, backpack: 0x421ebe },
    },
    nocturne: {
        name: "Nocturne",
        title: "the Eternal Nightmare",
        health: 172,
        speedBonus: 0.5,
        gun: false,
        basic: { damage: 34, cooldown: 0.55 },
        passive: {
            name: "Umbra Blades",
            description:
                "Every few seconds, Nocturne's next attack strikes surrounding enemies for bonus physical damage and heals himself. Nocturne's basic attacks reduce this cooldown",
        },
        abilities: {
            q: ab(
                "Duskbringer",
                8,
                "Nocturne throws a shadow blade that deals damage, leaves a Dusk Trail, and causes champions to leave a Dusk Trail. While on the trail, Nocturne can move through units and has increased Move Speed and ",
            ),
            w: ab(
                "Shroud of Darkness",
                20,
                "Nocturne empowers his blades, passively gaining Attack Speed. Activating Shroud of Darkness allows Nocturne to fade into the shadows, creating a magical barrier which blocks a single enemy ability and",
            ),
            e: ab(
                "Unspeakable Horror",
                15,
                "Nocturne plants a nightmare into his target's mind, dealing damage each second and applying fear to the target if they do not get out of range by the end of the duration.",
            ),
            r: ab(
                "Paranoia",
                160,
                "Nocturne reduces the sight radius of all enemy champions and removes their ally vision in the process. He can then launch himself at a nearby enemy champion.",
            ),
        },
        items: [
            "berserkers_greaves",
            "stridebreaker",
            "phantom_dancer",
            "dead_mans_plate",
            "steraks_gage",
            "deaths_dance",
        ],
        outfit: { base: 0xda2d8c, hands: 0xb6dc6b, backpack: 0x232865 },
    },
    nunu: {
        name: "Nunu & Willump",
        title: "the Boy and His Yeti",
        health: 190,
        speedBonus: 0,
        gun: false,
        basic: { damage: 34, cooldown: 0.6 },
        passive: {
            name: "Call of the Freljord",
            description:
                "Nunu increases the attack speed and Move Speed of Willump and a nearby ally, and causes Willump's basic attacks to damage enemies around the target.",
        },
        abilities: {
            q: ab(
                "Consume",
                13,
                "Willump takes a bite out of a minion, monster, or enemy champion, dealing damage and healing himself.",
            ),
            w: ab(
                "Biggest Snowball Ever!",
                14,
                "Willump creates a snowball that grows in size and speed as he rolls it. The snowball damages and knocks up enemies.",
            ),
            e: ab(
                "Snowball Barrage",
                14,
                "Nunu throws multiple snowballs that damage enemies. When he's finished, Willump roots any champions or large monsters that were hit by a snowball.",
            ),
            r: ab(
                "Absolute Zero",
                110,
                "Nunu & Willump create a powerful blizzard in an area that slows enemies and deals massive damage at the end.",
            ),
        },
        items: [
            "plated_steelcaps",
            "dead_mans_plate",
            "steraks_gage",
            "sundered_sky",
            "deaths_dance",
            "guardian_angel",
        ],
        outfit: { base: 0xaf1a56, hands: 0xaec846, backpack: 0xb64288 },
    },
    olaf: {
        name: "Olaf",
        title: "the Berserker",
        health: 199,
        speedBonus: 0.5,
        gun: false,
        basic: { damage: 34, cooldown: 0.55 },
        passive: {
            name: "Berserker Rage",
            description: "Olaf gains Attack Speed and Life Steal based on his missing Health.",
        },
        abilities: {
            q: ab(
                "Undertow",
                9,
                "Olaf throws an axe into the ground at a target location, dealing damage to enemies it passes through and reducing their Armor and Move Speed. If Olaf picks up the axe, the ability's cooldown is reset.",
            ),
            w: ab("Tough It Out", 16, "Olaf's Attack Speed is increased and he gains a Shield."),
            e: ab(
                "Reckless Swing",
                11,
                "Olaf attacks with such force that it deals true damage to his target and himself, refunding the Health cost if he destroys the target.",
            ),
            r: ab(
                "Ragnarok",
                100,
                "Olaf passively gains increased armor and magic resist. He can activate this ability to become immune to disables for as long as he keeps attacking.",
            ),
        },
        items: [
            "berserkers_greaves",
            "stridebreaker",
            "phantom_dancer",
            "dead_mans_plate",
            "steraks_gage",
            "deaths_dance",
        ],
        outfit: { base: 0x68795b, hands: 0xa02431, backpack: 0x501a20 },
    },
    orianna: {
        name: "Orianna",
        title: "the Lady of Clockwork",
        health: 139,
        speedBonus: 0,
        gun: true,
        basic: { damage: 24, cooldown: 0.65 },
        passive: {
            name: "Clockwork Windup",
            description:
                "Orianna's Attacks deal additional magic damage. This damage increases the more Orianna Attacks the same target.",
        },
        abilities: {
            q: ab(
                "Command: Attack",
                7,
                "Orianna commands her Ball to fire toward a target location, dealing magic damage to targets along the way (deals less damage to subsequent targets). Her Ball remains at the target location after.",
            ),
            w: ab(
                "Command: Dissonance",
                7,
                "Orianna commands her Ball to release a pulse of energy, dealing magic damage around it. This leaves a field behind that speeds up allies and slows enemies.",
            ),
            e: ab(
                "Command: Protect",
                9,
                "Orianna commands her Ball to attach to an allied champion, Shielding them and dealing magic damage to any enemies it passes through on the way. Additionally, the Ball grants additional Armor and Magic",
            ),
            r: ab(
                "Command: Shockwave",
                110,
                "Orianna commands her Ball to unleash a shockwave, dealing magic damage and launching nearby enemies towards the Ball after a short delay.",
            ),
        },
        items: [
            "ludens_echo",
            "sorcerers_shoes",
            "stormsurge",
            "shadowflame",
            "rabadons_deathcap",
            "zhonyas_hourglass",
        ],
        outfit: { base: 0x6b99d9, hands: 0xb72614, backpack: 0x4671b4 },
    },
    ornn: {
        name: "Ornn",
        title: "The Fire below the Mountain",
        health: 203,
        speedBonus: 0,
        gun: false,
        basic: { damage: 34, cooldown: 0.6 },
        passive: {
            name: "Living Forge",
            description:
                "Ornn gains an additional bonus Armor and Magic Resist from all sources.Ornn can spend gold to forge non-consumable items anywhere.Additionally, he can create ma",
        },
        abilities: {
            q: ab(
                "Volcanic Rupture",
                9,
                "Ornn slams the ground, sending out a fissure dealing damage and slowing enemies hit. After a small delay, a magma pillar forms at the end location.",
            ),
            w: ab(
                "Bellows Breath",
                12,
                "Ornn advances, breathing fire. Enemies hit by the final gout of flame become Brittle.",
            ),
            e: ab(
                "Searing Charge",
                14,
                "Ornn charges, dealing damage to enemies he passes through. If Ornn collides with terrain while charging, the impact creates a shockwave around him which deals damage and knocks up enemies.",
            ),
            r: ab(
                "Call of the Forge God",
                140,
                "Ornn summons a massive elemental at a location which travels toward him with increasing speed. Enemies run over by the elemental take damage, are slowed and are made Brittle. Ornn can recast the abili",
            ),
        },
        items: [
            "plated_steelcaps",
            "dead_mans_plate",
            "steraks_gage",
            "sundered_sky",
            "deaths_dance",
            "guardian_angel",
        ],
        outfit: { base: 0x5d45a8, hands: 0x40719c, backpack: 0xb06638 },
    },
    pantheon: {
        name: "Pantheon",
        title: "the Unbreakable Spear",
        health: 175,
        speedBonus: 0.5,
        gun: false,
        basic: { damage: 34, cooldown: 0.55 },
        passive: {
            name: "Mortal Will",
            description: "Every few spells or attacks, Pantheon's next spell is empowered.",
        },
        abilities: {
            q: ab("Comet Spear", 11, "Pantheon either thrusts his spear or throws his spear in the chosen direction."),
            w: ab("Shield Vault", 13, "Pantheon dashes to a target, damaging and stunning them."),
            e: ab(
                "Aegis Assault",
                22,
                "Pantheon sets his shield, becoming invulnerable to damage from the front and striking repeatedly with his spear.",
            ),
            r: ab(
                "Grand Starfall",
                180,
                "Pantheon composes himself and then leaps into the air, landing at a chosen location as a comet.",
            ),
        },
        items: [
            "berserkers_greaves",
            "stridebreaker",
            "phantom_dancer",
            "dead_mans_plate",
            "steraks_gage",
            "deaths_dance",
        ],
        outfit: { base: 0x214e87, hands: 0x543220, backpack: 0xaa6caf },
    },
    poppy: {
        name: "Poppy",
        title: "Keeper of the Hammer",
        health: 190,
        speedBonus: 0,
        gun: false,
        basic: { damage: 31, cooldown: 0.6 },
        passive: {
            name: "Iron Ambassador",
            description:
                "Poppy throws her buckler that bounces off the target. Poppy can pick it up to gain a temporary shield.",
        },
        abilities: {
            q: ab(
                "Hammer Shock",
                8,
                "Poppy swings her hammer, dealing damage and creating a zone that will slow enemies and explode after a delay.",
            ),
            w: ab(
                "Steadfast Presence",
                20,
                "Poppy passively gains Armor and Magic Resist. This bonus increases when she is low on Health. Poppy can activate Steadfast Presence to gain Move Speed and stop enemy dashes around her. If a dash is st",
            ),
            e: ab(
                "Heroic Charge",
                14,
                "Poppy dashes to the target and pushes it back. If the target is pushed into a wall, it is stunned.",
            ),
            r: ab("Keeper's Verdict", 140, "Poppy channels a hammer strike that knocks enemies very far away."),
        },
        items: [
            "plated_steelcaps",
            "dead_mans_plate",
            "steraks_gage",
            "sundered_sky",
            "deaths_dance",
            "guardian_angel",
        ],
        outfit: { base: 0x3ed71d, hands: 0x858e9c, backpack: 0x2b293f },
    },
    pyke: {
        name: "Pyke",
        title: "the Bloodharbor Ripper",
        health: 165,
        speedBonus: 0,
        gun: false,
        basic: { damage: 34, cooldown: 0.6 },
        passive: {
            name: "Gift of the Drowned Ones",
            description:
                "When Pyke is hidden from enemies, he regenerates damage that he has recently taken from champions. Pyke also cannot gain extra Maximum Health from any source, a",
        },
        abilities: {
            q: ab("Bone Skewer", 10, "Pyke either stabs an enemy in front of him or pulls an enemy towards him."),
            w: ab(
                "Ghostwater Dive",
                14,
                "Pyke enters Camouflage and gains significant Move Speed that decays over time.",
            ),
            e: ab(
                "Phantom Undertow",
                15,
                "Pyke dashes and leaves behind a phantom that will return to him, stunning enemy champions along its path.",
            ),
            r: ab(
                "Death From Below",
                100,
                "Pyke blinks to and executes low health enemies, allowing him to cast this spell again and granting additional gold to an ally who assists.",
            ),
        },
        items: [
            "ionian_boots_of_lucidity",
            "zhonyas_hourglass",
            "rabadons_deathcap",
            "malignance",
            "stormsurge",
            "shadowflame",
        ],
        outfit: { base: 0x1f432d, hands: 0x429c19, backpack: 0x7c3b76 },
    },
    qiyana: {
        name: "Qiyana",
        title: "Empress of the Elements",
        health: 160,
        speedBonus: 0.5,
        gun: false,
        basic: { damage: 34, cooldown: 0.45 },
        passive: {
            name: "Royal Privilege",
            description: "Qiyana's first basic attack or ability against each enemy deals bonus damage.",
        },
        abilities: {
            q: ab(
                "Elemental Wrath / Edge of Ixtal",
                7,
                "Qiyana swings her weapon, dealing damage with a bonus effect based on her element.",
            ),
            w: ab(
                "Terrashape",
                7,
                "Qiyana dashes to a location and enchants her weapon with an element. Her attacks and abilities deal bonus damage while her weapon is enchanted.",
            ),
            e: ab("Audacity", 11, "Qiyana dashes to an enemy, damaging them."),
            r: ab(
                "Supreme Display of Talent",
                120,
                "Qiyana sends out a shockwave that detonates whatever elements she hits with it, stunning and damaging nearby enemies.",
            ),
        },
        items: [
            "youmuus_ghostblade",
            "plated_steelcaps",
            "the_collector",
            "infinity_edge",
            "lord_dominiks_regards",
            "bloodthirster",
        ],
        outfit: { base: 0xb23145, hands: 0x251e98, backpack: 0x28ba41 },
    },
    quinn: {
        name: "Quinn",
        title: "Demacia's Wings",
        health: 154,
        speedBonus: 0,
        gun: true,
        basic: { damage: 32, cooldown: 0.5 },
        passive: {
            name: "Harrier",
            description:
                "Valor, Quinn's Demacian eagle, periodically marks enemies with Harrier. Quinn's first basic attack against Harrier targets will deal bonus physical damage.",
        },
        abilities: {
            q: ab(
                "Blinding Assault",
                11,
                "Quinn calls Valor to mark an enemy and hinder its vision before damaging all enemies in the immediate area.",
            ),
            w: ab(
                "Heightened Senses",
                50,
                "Passively grants Quinn Attack Speed and Move Speed after she attacks a Harrier target. Activate to have Valor reveal a large area nearby.",
            ),
            e: ab(
                "Vault",
                12,
                "Quinn dashes to an enemy, dealing physical damage and slowing the target's Move Speed. Upon reaching the target, she leaps off the target, briefly interrupting it, and lands near her maximum Attack Ra",
            ),
            r: ab(
                "Behind Enemy Lines",
                3,
                "Quinn and Valor team up to fly around at great speed. Ending the ability casts Skystrike, which deals damage to nearby enemies and marks champions with Harrier.",
            ),
        },
        items: [
            "hexoptics_c44",
            "berserkers_greaves",
            "runaans_hurricane",
            "infinity_edge",
            "lord_dominiks_regards",
            "guardian_angel",
        ],
        outfit: { base: 0x285848, hands: 0x901e5e, backpack: 0x953a4d },
    },
    rakan: {
        name: "Rakan",
        title: "The Charmer",
        health: 150,
        speedBonus: 0,
        gun: false,
        basic: { damage: 34, cooldown: 0.6 },
        passive: { name: "Fey Feathers", description: "Rakan periodically gains a shield." },
        abilities: {
            q: ab(
                "Gleaming Quill",
                11,
                "Flings a magical feather that deals magic damage. Striking a champion or epic monster enables Rakan to heal his allies.",
            ),
            w: ab("Grand Entrance", 14, "Dashes to a location, knocking up nearby enemies on arrival."),
            e: ab(
                "Battle Dance",
                0,
                "Flies to an allied champion granting them a shield. Can be re-cast for free for a short duration.",
            ),
            r: ab("The Quickness", 130, "Gains Move Speed, charming and dealing magic damage to enemies touched."),
        },
        items: [
            "ionian_boots_of_lucidity",
            "zhonyas_hourglass",
            "rabadons_deathcap",
            "malignance",
            "stormsurge",
            "shadowflame",
        ],
        outfit: { base: 0x147130, hands: 0x54d4cf, backpack: 0x37bf1c },
    },
    rammus: {
        name: "Rammus",
        title: "the Armordillo",
        health: 199,
        speedBonus: 0,
        gun: false,
        basic: { damage: 34, cooldown: 0.6 },
        passive: {
            name: "Spiked Shell",
            description: "Rammus gains bonus Attack Damage scaling with his Armor and Magic Resistance.",
        },
        abilities: {
            q: ab(
                "Powerball",
                12,
                "Rammus accelerates in a ball towards his enemies, dealing damage and slowing targets affected by the impact.",
            ),
            w: ab(
                "Defensive Ball Curl",
                7,
                "Rammus goes into a defensive formation, vastly increasing his Armor and Magic Resistance, and returning damage to enemies that attack him.",
            ),
            e: ab(
                "Frenzying Taunt",
                12,
                "Rammus taunts an enemy champion or monster into a reckless assault against him.",
            ),
            r: ab(
                "Soaring Slam",
                120,
                "Rammus hops into the air and slams down at a target area, dealing magic damage and slowing enemies. If cast while Rammus is in Powerball, Rammus knocks up enemies near the center as well.",
            ),
        },
        items: [
            "plated_steelcaps",
            "dead_mans_plate",
            "steraks_gage",
            "sundered_sky",
            "deaths_dance",
            "guardian_angel",
        ],
        outfit: { base: 0x2f4d47, hands: 0x90769f, backpack: 0x7c3c1e },
    },
    reksai: {
        name: "Rek'Sai",
        title: "the Void Burrower",
        health: 187,
        speedBonus: 0.5,
        gun: false,
        basic: { damage: 34, cooldown: 0.55 },
        passive: {
            name: "Fury of the Xer'Sai",
            description:
                "Rek'Sai generates Fury by Attacking and hitting with basic Abilities. She consumes this Fury while Burrowed to restore health.",
        },
        abilities: {
            q: ab(
                "Queen's Wrath / Prey Seeker",
                4,
                "Rek'Sai's next 3 basic attacks deal bonus Physical Damage to nearby enemies.While Burrowed, Rek'Sai launches a burst of void-charged earth that damages and reveals enemies hit.",
            ),
            w: ab(
                "Burrow / Un-burrow",
                4,
                "Rek'Sai burrows into the ground, gaining new abilities and increased Move Speed. Her vision range is reduced and she cannot use basic attacks.While Burrowed, Rek'Sai may cast Unburrow to knock up and ",
            ),
            e: ab(
                "Furious Bite / Tunnel",
                6,
                "Rek'Sai bites her target, dealing physical damage, or bonus true damage if she has max Fury.While Burrowed, Rek'Sai creates a re-usable, long lasting tunnel. Enemies can destroy it by standing on top ",
            ),
            r: ab(
                "Void Rush",
                120,
                "Rek'Sai passively marks targets by damaging them. She can activate this ability to become briefly untargetable and lunge at a marked target for heavy damage based on their maximum health.",
            ),
        },
        items: [
            "berserkers_greaves",
            "stridebreaker",
            "phantom_dancer",
            "dead_mans_plate",
            "steraks_gage",
            "deaths_dance",
        ],
        outfit: { base: 0x423143, hands: 0x5254d0, backpack: 0xab1434 },
    },
    rell: {
        name: "Rell",
        title: "the Iron Maiden",
        health: 178,
        speedBonus: 0,
        gun: false,
        basic: { damage: 30, cooldown: 0.6 },
        passive: {
            name: "Break the Mold",
            description:
                "Rell's Attacks and Abilities deal additional magic damage and steal Armor and Magic Resist on hit.",
        },
        abilities: {
            q: ab(
                "Shattering Strike",
                11,
                "Rell deals magic damage to units in a line, breaking their shields and stunning them.",
            ),
            w: ab(
                "Ferromancy: Crash Down",
                10,
                "Mounted: Rell Dismounts, crashing down in her armor, Knocking enemies up and gaining a large Shield. While dismounted, she gains Armor, Magic Resist, Attack Speed, and Attack Range, but is Slowed.Dism",
            ),
            e: ab(
                "Full Tilt",
                14,
                "Passive: Rell gains out of combat Move Speed.Active: Rell and an ally gain ramping Move Speed, doubled toward enemies and each other. Her next Attack explodes, dealing magic damage.",
            ),
            r: ab(
                "Magnet Storm",
                120,
                "Rell explodes in a magnetic fury, violently Pulling nearby enemies toward herself. Then Rell constantly Drags nearby enemies toward herself for a short while, dealing magic damage over time.",
            ),
        },
        items: [
            "plated_steelcaps",
            "dead_mans_plate",
            "steraks_gage",
            "sundered_sky",
            "deaths_dance",
            "guardian_angel",
        ],
        outfit: { base: 0x24a146, hands: 0x8e1628, backpack: 0x461b54 },
    },
    renata: {
        name: "Renata Glasc",
        title: "the Chem-Baroness",
        health: 134,
        speedBonus: 0,
        gun: true,
        basic: { damage: 27, cooldown: 0.6 },
        passive: {
            name: "Leverage",
            description:
                "Renata's Attacks deal bonus damage and mark enemies. Renata's allies can damage marked enemies to deal bonus damage.",
        },
        abilities: {
            q: ab(
                "Handshake",
                16,
                "Renata sends out a missile rooting the first enemy hit, and can recast the ability to throw the unit in a direction.",
            ),
            w: ab(
                "Bailout",
                28,
                "Renata buffs an allied champion to fight harder, delaying their death and potentially saving them if they get a takedown.",
            ),
            e: ab(
                "Loyalty Program",
                14,
                "Renata sends out a pair of chemtech missiles, shielding allies and damaging and slowing enemies hit.",
            ),
            r: ab(
                "Hostile Takeover",
                150,
                "Renata sends out a wave of chemicals, causing any enemies hit to go Berserk.",
            ),
        },
        items: [
            "ionian_boots_of_lucidity",
            "zhonyas_hourglass",
            "rabadons_deathcap",
            "malignance",
            "stormsurge",
            "shadowflame",
        ],
        outfit: { base: 0x3a2a29, hands: 0x172037, backpack: 0x9023a9 },
    },
    renekton: {
        name: "Renekton",
        title: "the Butcher of the Sands",
        health: 203,
        speedBonus: 0.5,
        gun: false,
        basic: { damage: 34, cooldown: 0.55 },
        passive: {
            name: "Reign of Anger",
            description:
                "Renekton's attacks generate Fury, increased when he is low on life. This Fury can empower his abilities with bonus effects.",
        },
        abilities: {
            q: ab(
                "Cull the Meek",
                7,
                "Renekton swings his blade, dealing moderate physical damage to all targets around him, and heals for a small portion of the damage dealt. If he has more than 50 Fury, his damage and heal are increased",
            ),
            w: ab(
                "Ruthless Predator",
                16,
                "Renekton slashes his target twice, dealing moderate physical damage and stuns them for 0.75 seconds. If Renekton has more than 50 Fury, he slashes his target three times, destroying damage shields on ",
            ),
            e: ab(
                "Slice and Dice",
                16,
                "Renekton dashes, dealing damage to units along the way. Empowered, Renekton deals bonus damage and reduces the Armor of units hit.",
            ),
            r: ab(
                "Dominus",
                120,
                "Renekton transforms into the Tyrant form, gaining bonus Health and dealing damage to enemies around him. While in this form, Renekton gains Fury periodically.",
            ),
        },
        items: [
            "berserkers_greaves",
            "stridebreaker",
            "phantom_dancer",
            "dead_mans_plate",
            "steraks_gage",
            "deaths_dance",
        ],
        outfit: { base: 0xa91b5f, hands: 0x1ddb36, backpack: 0x16a517 },
    },
    rengar: {
        name: "Rengar",
        title: "the Pridestalker",
        health: 160,
        speedBonus: 0.5,
        gun: false,
        basic: { damage: 34, cooldown: 0.45 },
        passive: {
            name: "Unseen Predator",
            description:
                "While in Brush, Rengar leaps at his target with his basic attack.Rengar generates Ferocity whenever he casts an ability. At Max Ferocity, his next ability is em",
        },
        abilities: {
            q: ab(
                "Savagery",
                0.25,
                "Rengar's next Attack brutally stabs his target for bonus damage.Ferocity effect: deals increased damage and grants Attack Speed.",
            ),
            w: ab(
                "Battle Roar",
                0.25,
                "Rengar lets out a battle roar, damaging enemies and healing for some of the recent damage he has taken.Ferocity effect: additionally breaks crowd control effects.",
            ),
            e: ab(
                "Bola Strike",
                0.25,
                "Rengar throws a bola, slowing the first target hit for a short duration.Ferocity effect: roots the target.",
            ),
            r: ab(
                "Thrill of the Hunt",
                100,
                "Rengar's predatory instincts take over, Camouflaging him and revealing the nearest enemy champion in a large radius around him. During Thrill of the Hunt, Rengar gains Move Speed and he can leap to th",
            ),
        },
        items: [
            "youmuus_ghostblade",
            "plated_steelcaps",
            "the_collector",
            "infinity_edge",
            "lord_dominiks_regards",
            "bloodthirster",
        ],
        outfit: { base: 0xc05117, hands: 0x155ebe, backpack: 0x3abe45 },
    },
    riven: {
        name: "Riven",
        title: "the Exile",
        health: 170,
        speedBonus: 0.5,
        gun: false,
        basic: { damage: 34, cooldown: 0.55 },
        passive: {
            name: "Runic Blade",
            description:
                "Riven's abilities charge her blade, and her basic attacks expend charges to deal an additional damage.",
        },
        abilities: {
            q: ab(
                "Broken Wings",
                13,
                "Riven lashes out in a series of strikes. This ability can be reactivated three times in a short time frame with the third hit knocking back nearby enemies.",
            ),
            w: ab("Ki Burst", 11, "Riven emits a Ki Burst, damaging and stunning nearby enemies."),
            e: ab("Valor", 10, "Riven steps forward a short distance and blocks incoming damage."),
            r: ab(
                "Blade of the Exile",
                120,
                "Riven empowers her keepsake weapon with energy, and gains Attack Damage and Range. During this time, she also gains the ability to use Wind Slash, a powerful ranged attack, once.",
            ),
        },
        items: [
            "berserkers_greaves",
            "stridebreaker",
            "phantom_dancer",
            "dead_mans_plate",
            "steraks_gage",
            "deaths_dance",
        ],
        outfit: { base: 0x404f8e, hands: 0x302c6a, backpack: 0x2ca67e },
    },
    rumble: {
        name: "Rumble",
        title: "the Mechanized Menace",
        health: 172,
        speedBonus: 0.5,
        gun: false,
        basic: { damage: 34, cooldown: 0.55 },
        passive: {
            name: "Junkyard Titan",
            description:
                "Every spell Rumble casts gives him Heat. When he reaches 50% Heat he reaches Danger Zone, granting all his basic abilities bonus effects. When he reaches 100% H",
        },
        abilities: {
            q: ab(
                "Flamespitter",
                10,
                "Rumble torches opponents in front of him, dealing magic damage in a cone for 3 seconds. While in Danger Zone this damage is increased.",
            ),
            w: ab(
                "Scrap Shield",
                6,
                "Rumble pulls up a shield, protecting him from damage and granting him a quick burst of speed. While in Danger Zone, the shield strength and speed bonus is increased.",
            ),
            e: ab(
                "Electro Harpoon",
                0.5,
                "Rumble launches a harpoon, electrocuting his target with magic damage, slowing their Move Speed, and reducing their Magic Resist. Rumble can carry 2 harpoons at a time. While in Danger Zone the damage",
            ),
            r: ab(
                "The Equalizer",
                130,
                "Rumble fires off a group of rockets, creating a wall of flames that damages and slows enemies.",
            ),
        },
        items: [
            "berserkers_greaves",
            "stridebreaker",
            "phantom_dancer",
            "dead_mans_plate",
            "steraks_gage",
            "deaths_dance",
        ],
        outfit: { base: 0x18ce16, hands: 0x504bd3, backpack: 0x332c2b },
    },
    ryze: {
        name: "Ryze",
        title: "the Rune Mage",
        health: 168,
        speedBonus: 0,
        gun: true,
        basic: { damage: 30, cooldown: 0.65 },
        passive: {
            name: "Arcane Mastery",
            description:
                "Ryze's spells deal extra damage based on his Bonus Mana, and he gains a percentage increase to his maximum Mana based on his Ability Power.",
        },
        abilities: {
            q: ab(
                "Overload",
                5,
                "Passively, Ryze's other basic abilities reset the cooldown of Overload and charge a rune. When Ryze casts Overload with 2 runes charged, he gains a brief burst of Move Speed.On cast, Ryze throws a cha",
            ),
            w: ab(
                "Rune Prison",
                11,
                "Ryze traps a target in a cage of runes, damaging them and slowing their movement. If the target has Flux on it, they are instead rooted.",
            ),
            e: ab(
                "Spell Flux",
                3.5,
                "Ryze releases an orb of pure magical power that damages an enemy and debuffs all nearby enemies. Ryze's spells have additional effects against the debuffed enemy.",
            ),
            r: ab(
                "Realm Warp",
                180,
                "Passively, Overload deals even more damage against targets with Flux.On cast, Ryze creates a portal to a nearby location. After a few seconds, allies standing near the portal are teleported to the tar",
            ),
        },
        items: [
            "ludens_echo",
            "sorcerers_shoes",
            "stormsurge",
            "shadowflame",
            "rabadons_deathcap",
            "zhonyas_hourglass",
        ],
        outfit: { base: 0x3c4f40, hands: 0x432b9a, backpack: 0x7a4734 },
    },
    samira: {
        name: "Samira",
        title: "the Desert Rose",
        health: 170,
        speedBonus: 0,
        gun: true,
        basic: { damage: 31, cooldown: 0.5 },
        passive: {
            name: "Daredevil Impulse",
            description:
                "Samira builds a combo by hitting attacks or abilities unique from the previous hit. Samira's attacks in melee range deal additional magic damage. Samira's attac",
        },
        abilities: {
            q: ab(
                "Flair",
                6,
                "Samira fires a shot or swings her sword, dealing damage. If cast during Wild Rush, strike all enemies in her path upon completion.",
            ),
            w: ab("Blade Whirl", 30, "Samira slashes around her, damaging enemies and destroying enemy missiles."),
            e: ab(
                "Wild Rush",
                20,
                "Samira dashes through an enemy (including structures), slashing enemies she passes through and gaining Attack Speed. Killing an enemy champion refreshes this ability's cooldown.",
            ),
            r: ab(
                "Inferno Trigger",
                5,
                "Samira unleashes a torrent of shots from her weapons, wildly shooting all enemies surrounding her.",
            ),
        },
        items: [
            "hexoptics_c44",
            "berserkers_greaves",
            "runaans_hurricane",
            "infinity_edge",
            "lord_dominiks_regards",
            "guardian_angel",
        ],
        outfit: { base: 0x179d73, hands: 0x238f31, backpack: 0xd4379d },
    },
    sejuani: {
        name: "Sejuani",
        title: "Fury of the North",
        health: 195,
        speedBonus: 0,
        gun: false,
        basic: { damage: 34, cooldown: 0.6 },
        passive: {
            name: "Fury of the North",
            description:
                "After being out of combat, Sejuani gains Frost Armor which grants Armor and Magic Resist and immunity to slows. Frost Armor persists for a short time after Seju",
        },
        abilities: {
            q: ab(
                "Arctic Assault",
                18,
                "Sejuani charges forward, knocking enemies into the air. The charge stops after hitting an enemy champion.",
            ),
            w: ab(
                "Winter's Wrath",
                9,
                "Sejuani swings her mace twice, dealing damage, slowing enemies and applying Frost stacks.",
            ),
            e: ab("Permafrost", 1.5, "Sejuani freezes and stuns an enemy champion that has maximum Frost stacks."),
            r: ab(
                "Glacial Prison",
                120,
                "Sejuani throws her bola that freezes and stuns the first champion hit and creates an ice storm that slows other enemies.",
            ),
        },
        items: [
            "plated_steelcaps",
            "dead_mans_plate",
            "steraks_gage",
            "sundered_sky",
            "deaths_dance",
            "guardian_angel",
        ],
        outfit: { base: 0xbc6b19, hands: 0x762946, backpack: 0x2e988e },
    },
    senna: {
        name: "Senna",
        title: "the Redeemer",
        health: 130,
        speedBonus: 0,
        gun: true,
        basic: { damage: 28, cooldown: 0.6 },
        passive: {
            name: "Absolution",
            description:
                "When units die near Senna, their souls are periodically trapped by the Black Mist. Senna can attack these souls to free them, absorbing the Mist that held them ",
        },
        abilities: {
            q: ab(
                "Piercing Darkness",
                15,
                "From the twin barrels of her Relic Cannon, Senna fires a unified beam of light and shadow through a target, healing allies and damaging enemies.",
            ),
            w: ab(
                "Last Embrace",
                11,
                "Senna sends forth a wave of Black Mist. If it hits an enemy it latches onto them hungrily, rooting them and everything nearby after a brief delay.",
            ),
            e: ab(
                "Curse of the Black Mist",
                26,
                "Senna draws the Mist she has stored in her weapon into a storm around her, embracing darkness and becoming a wraith within. Allies who enter the area are camouflaged and also appear as wraiths as the ",
            ),
            r: ab(
                "Dawning Shadow",
                140,
                "Senna calls upon the relic stones of fallen Sentinels, splitting her relic cannon into a holy array of shadow and light. She then fires a global beam that shields allies from harm, while damaging enem",
            ),
        },
        items: [
            "ionian_boots_of_lucidity",
            "zhonyas_hourglass",
            "rabadons_deathcap",
            "malignance",
            "stormsurge",
            "shadowflame",
        ],
        outfit: { base: 0x9537c3, hands: 0x472657, backpack: 0xbddbd1 },
    },
    seraphine: {
        name: "Seraphine",
        title: "the Starry-Eyed Songstress",
        health: 140,
        speedBonus: 0,
        gun: true,
        basic: { damage: 28, cooldown: 0.6 },
        passive: {
            name: "Stage Presence",
            description:
                "Every third basic spell will cast twice from Seraphine. Additionally, casting spells near allies grants her bonus magic damage and range on her next basic attac",
        },
        abilities: {
            q: ab("High Note", 8, "Seraphine deals damage in an area."),
            w: ab(
                "Surround Sound",
                22,
                "Seraphine Shields and Hastes nearby allies. If she is already Shielded she will Heal nearby allies as well.",
            ),
            e: ab("Beat Drop", 11, "Seraphine deals damage and impairs the movement of enemies in a line."),
            r: ab(
                "Encore",
                160,
                "Seraphine deals damage and charms enemies hit, refreshing the range with every allied or enemy champion hit.",
            ),
        },
        items: [
            "ionian_boots_of_lucidity",
            "zhonyas_hourglass",
            "rabadons_deathcap",
            "malignance",
            "stormsurge",
            "shadowflame",
        ],
        outfit: { base: 0xdc2d2b, hands: 0x7aa04a, backpack: 0xd21940 },
    },
    sett: {
        name: "Sett",
        title: "the Boss",
        health: 205,
        speedBonus: 0.5,
        gun: false,
        basic: { damage: 33, cooldown: 0.55 },
        passive: {
            name: "Pit Grit",
            description:
                "Sett's basic attacks alternate between left and right punch. Right punch is slightly stronger and faster. Sett also hates losing, gaining additional health rege",
        },
        abilities: {
            q: ab(
                "Knuckle Down",
                9,
                "Sett's next two attacks deal additional damage based off of the target's max health. Sett also gains Move Speed while moving towards enemy champions.",
            ),
            w: ab(
                "Haymaker",
                18,
                "Sett passively stores damage he takes as Grit. On cast, Sett expends all stored Grit to gain a shield and punch an area, dealing true damage in the center and physical damage on the sides.",
            ),
            e: ab(
                "Facebreaker",
                16,
                "Sett pulls in all enemies on opposite sides of him, dealing damage and stunning them. If enemies were only on one side, they are slowed instead of stunned.",
            ),
            r: ab(
                "The Show Stopper",
                120,
                "Sett carries an enemy champion through the air and slams them into the ground, dealing damage and slowing all enemies near where they land.",
            ),
        },
        items: [
            "berserkers_greaves",
            "stridebreaker",
            "phantom_dancer",
            "dead_mans_plate",
            "steraks_gage",
            "deaths_dance",
        ],
        outfit: { base: 0x19197e, hands: 0x50297d, backpack: 0xdc1723 },
    },
    shaco: {
        name: "Shaco",
        title: "the Demon Jester",
        health: 170,
        speedBonus: 0.5,
        gun: false,
        basic: { damage: 34, cooldown: 0.45 },
        passive: {
            name: "Backstab",
            description: "Shaco's basic attacks and Two-Shiv Poison deal additional damage when striking from behind.",
        },
        abilities: {
            q: ab(
                "Deceive",
                13,
                "Shaco becomes Invisible and teleports to target location.His first attack while Invisible is empowered, dealing bonus damage and critically striking if he attacks from behind.",
            ),
            w: ab(
                "Jack In The Box",
                15,
                "Shaco creates a hidden animated Jack-in-the-Box. When triggered, it will fear and attack nearby enemies.",
            ),
            e: ab(
                "Two-Shiv Poison",
                8,
                "Shaco's Shivs passively poison targets on hit, slowing their Move Speed. He can throw his Shivs to deal damage and poison the target. The thrown Shiv deals bonus damage if the target is below 30% heal",
            ),
            r: ab(
                "Hallucinate",
                100,
                "Shaco creates an illusion of himself near him, which can attack nearby enemies (Deals reduced damage to turrets). Upon death, it explodes, spawning three mini Jack in the Boxes and dealing damage to n",
            ),
        },
        items: [
            "youmuus_ghostblade",
            "plated_steelcaps",
            "the_collector",
            "infinity_edge",
            "lord_dominiks_regards",
            "bloodthirster",
        ],
        outfit: { base: 0x332e2d, hands: 0xa8979e, backpack: 0x7f812d },
    },
    shen: {
        name: "Shen",
        title: "the Eye of Twilight",
        health: 190,
        speedBonus: 0,
        gun: false,
        basic: { damage: 34, cooldown: 0.6 },
        passive: {
            name: "Ki Barrier",
            description:
                "After casting a spell, Shen gets a shield. Affecting other champions reduces the cooldown of this effect.",
        },
        abilities: {
            q: ab(
                "Twilight Assault",
                8,
                "Shen recalls his spirit blade to attack with it, dealing damage based on the target's max health. The attacks are greatly empowered if it collides with an enemy champion, and all collided enemies are ",
            ),
            w: ab(
                "Spirit's Refuge",
                16,
                "Attacks that would hit Shen or his allies near his spirit blade are blocked.",
            ),
            e: ab("Shadow Dash", 18, "Shen dashes in a direction, taunting enemies in his path."),
            r: ab(
                "Stand United",
                200,
                "Shen shields target allied champion from incoming damage, and soon after teleports to their location.",
            ),
        },
        items: [
            "plated_steelcaps",
            "dead_mans_plate",
            "steraks_gage",
            "sundered_sky",
            "deaths_dance",
            "guardian_angel",
        ],
        outfit: { base: 0x42bf90, hands: 0xb41abd, backpack: 0x712036 },
    },
    shyvana: {
        name: "Shyvana",
        title: "the Half-Dragon",
        health: 194,
        speedBonus: 0.5,
        gun: false,
        basic: { damage: 34, cooldown: 0.55 },
        passive: {
            name: "Scalemail",
            description:
                "Takedowns on enemy champions, large minions, and large monsters grant Shyvana Scalemail stacks, improving her defenses.",
        },
        abilities: {
            q: ab(
                "Emberstrike",
                10,
                "Shyvana's next attack strikes both the target and the surrounding area. This Ability can be recast. While in Dragon Form, it gains an additional recast, dealing massive damage to a single target.",
            ),
            w: ab(
                "Inferno Aegis",
                13,
                "Shyvana gains a shield, movement speed, and after a short delay, the area around her detonates. While in Dragon Form, the explosion will heal her if it strikes an enemy champion.",
            ),
            e: ab(
                "Molten Burst",
                12,
                "Shyvana launches a fireball that explodes upon striking a large target and slows them. In Dragon Form, it passes through and explodes upon striking large enemies, leaving behind a trail of fire.",
            ),
            r: ab(
                "Dragon's Descent",
                0,
                "Shyvana transforms into a Dragon and leaps forward causing enemies along her path to flee. While in Dragon form she becomes larger and her basic abilities are empowered.",
            ),
        },
        items: [
            "berserkers_greaves",
            "stridebreaker",
            "phantom_dancer",
            "dead_mans_plate",
            "steraks_gage",
            "deaths_dance",
        ],
        outfit: { base: 0xa04231, hands: 0xd24935, backpack: 0x92262e },
    },
    singed: {
        name: "Singed",
        title: "the Mad Chemist",
        health: 200,
        speedBonus: 0,
        gun: false,
        basic: { damage: 34, cooldown: 0.6 },
        passive: {
            name: "Noxious Slipstream",
            description: "Singed drafts off nearby champions, gaining a burst of Move Speed when passing them.",
        },
        abilities: {
            q: ab(
                "Poison Trail",
                0,
                "Leaves a trail of poison behind Singed, dealing damage to enemies caught in the path.",
            ),
            w: ab(
                "Mega Adhesive",
                17,
                "Throws a vial of mega adhesive on the ground, slowing and grounding enemies who walk on it.",
            ),
            e: ab(
                "Fling",
                10,
                "Damages target enemy unit and flings them into the air behind Singed. If the target Singed flings lands in his Mega Adhesive, they are also rooted.",
            ),
            r: ab(
                "Insanity Potion",
                100,
                "Singed drinks a potent brew of chemicals, granting him increased combat stats, and making his Poison Trail apply Grievous Wounds.",
            ),
        },
        items: [
            "plated_steelcaps",
            "dead_mans_plate",
            "steraks_gage",
            "sundered_sky",
            "deaths_dance",
            "guardian_angel",
        ],
        outfit: { base: 0xcf1c67, hands: 0x2cd4c7, backpack: 0x97a733 },
    },
    sion: {
        name: "Sion",
        title: "The Undead Juggernaut",
        health: 201,
        speedBonus: 0,
        gun: false,
        basic: { damage: 34, cooldown: 0.6 },
        passive: {
            name: "Glory in Death",
            description:
                "After being killed, Sion will temporarily reanimate with rapidly decaying Health. His attacks become very rapid, heal him, and deal bonus damage based on his ta",
        },
        abilities: {
            q: ab(
                "Decimating Smash",
                10,
                "Sion charges a powerful swing in an area in front of himself that will deal damage to enemies when released. If he charges for enough time, enemies hit by the swing will also be knocked up and stunned",
            ),
            w: ab(
                "Soul Furnace",
                15,
                "Sion shields himself and can reactivate after 3 seconds to deal Magic Damage to enemies nearby. When Sion kills enemies, he passively gains maximum Health.",
            ),
            e: ab(
                "Roar of the Slayer",
                12,
                "Sion fires a short range shockwave that damages and slows and reduces the Armor of the first enemy hit. If the shockwave hits a minion or monster, it will be knocked back, damaging, slowing, and reduc",
            ),
            r: ab(
                "Unstoppable Onslaught",
                140,
                "Sion charges in a direction, ramping up speed over time. He can steer his charge slightly with the mouse cursor location. When he collides with an enemy he deals damage and knocks them up based on the",
            ),
        },
        items: [
            "plated_steelcaps",
            "dead_mans_plate",
            "steraks_gage",
            "sundered_sky",
            "deaths_dance",
            "guardian_angel",
        ],
        outfit: { base: 0x69a333, hands: 0xcd3060, backpack: 0x192335 },
    },
    sivir: {
        name: "Sivir",
        title: "the Battle Mistress",
        health: 162,
        speedBonus: 0,
        gun: true,
        basic: { damage: 33, cooldown: 0.5 },
        passive: {
            name: "Fleet of Foot",
            description: "Sivir gains a short burst of Move Speed when she attacks an enemy champion.",
        },
        abilities: {
            q: ab("Boomerang Blade", 10, "Sivir hurls her crossblade like a boomerang, dealing damage each way."),
            w: ab(
                "Ricochet",
                12,
                "Sivir's next few basic attacks gain additional attack speed and bounce to nearby targets, dealing reduced damage while bouncing.",
            ),
            e: ab(
                "Spell Shield",
                24,
                "Creates a magical barrier that blocks a single enemy ability cast on Sivir. She receives health and a burst of movement speed if a spell is blocked.",
            ),
            r: ab(
                "On The Hunt",
                120,
                "Sivir leads her allies in battle, granting them a surge of Move Speed for a period of time. In addition, Sivir's attacks reduce her spell cooldowns.",
            ),
        },
        items: [
            "hexoptics_c44",
            "berserkers_greaves",
            "runaans_hurricane",
            "infinity_edge",
            "lord_dominiks_regards",
            "guardian_angel",
        ],
        outfit: { base: 0x292d24, hands: 0xd247cf, backpack: 0x56bea6 },
    },
    skarner: {
        name: "Skarner",
        title: "the Primordial Sovereign",
        health: 195,
        speedBonus: 0,
        gun: false,
        basic: { damage: 34, cooldown: 0.6 },
        passive: {
            name: "Threads of Vibration",
            description:
                "Skarner's Attacks, Shattered Earth, Upheaval, and Impale, apply Quaking. At max stacks of Quaking, enemies take max Health magic damage over its duration.",
        },
        abilities: {
            q: ab(
                "Shattered Earth / Upheaval",
                8,
                "Skarner rips a boulder from the earth that empowers his attacks and can be thrown as a powerful projectile.",
            ),
            w: ab(
                "Seismic Bastion",
                10,
                "Skarner gains a shield and creates an earthquake whose shockwave damages and slows foes.",
            ),
            e: ab(
                "Ixtal's Impact",
                22,
                "Skarner charges forward and passes through terrain. If he collides with a champion or large monster, he'll slam them into the next wall he hits to damage and stun them.",
            ),
            r: ab(
                "Impale",
                120,
                "Skarner's tails lash forward to suppress enemy champions. Once suppressed, the victims will be dragged along by Skarner as he moves around.",
            ),
        },
        items: [
            "plated_steelcaps",
            "dead_mans_plate",
            "steraks_gage",
            "sundered_sky",
            "deaths_dance",
            "guardian_angel",
        ],
        outfit: { base: 0x278270, hands: 0x6c2967, backpack: 0x369f40 },
    },
    smolder: {
        name: "Smolder",
        title: "the Fiery Fledgling",
        health: 156,
        speedBonus: 0,
        gun: true,
        basic: { damage: 32, cooldown: 0.5 },
        passive: {
            name: "Dragon Practice",
            description:
                "Hitting champions with Abilities and killing enemies with Super Scorcher Breath grants a stack of Dragon Practice. Stacks increase the damage of Smolders basic ",
        },
        abilities: {
            q: ab(
                "Super Scorcher Breath",
                5.5,
                "Smolder breathes fire on an enemy. As he gains more stacks, this ability becomes more powerful.",
            ),
            w: ab(
                "Achooo!",
                14,
                "Smolder lets out an adorable flaming sneeze that explodes when hitting enemy champions.",
            ),
            e: ab(
                "Flap, Flap, Flap",
                24,
                "Smolder takes flight ignoring terrain and bombarding the lowest health enemy.",
            ),
            r: ab(
                "MMOOOMMMM!",
                120,
                "Smolder calls his mom to breath fire from above, dealing extra damage and slowing enemies in the center of her fire.",
            ),
        },
        items: [
            "hexoptics_c44",
            "berserkers_greaves",
            "runaans_hurricane",
            "infinity_edge",
            "lord_dominiks_regards",
            "guardian_angel",
        ],
        outfit: { base: 0xbc7845, hands: 0x5f1ac1, backpack: 0x41b039 },
    },
    sona: {
        name: "Sona",
        title: "Maven of the Strings",
        health: 135,
        speedBonus: 0,
        gun: true,
        basic: { damage: 27, cooldown: 0.6 },
        passive: {
            name: "Power Chord",
            description:
                "Accelerando: Sona gains non-Ultimate ability haste permanently for her basic abilities as she uses her abilities well, up to a cap. Beyond that cap, further suc",
        },
        abilities: {
            q: ab(
                "Hymn of Valor",
                8,
                "Sona plays the Hymn of Valor, sends out bolts of sound, dealing magic damage to two nearby enemies, prioritizing champions and monsters. Sona gains a temporary aura that grants allies tagged by the zo",
            ),
            w: ab(
                "Aria of Perseverance",
                10,
                "Sona plays the Aria of Perseverance, sending out protective melodies, healing Sona and a nearby wounded ally. Sona gains a temporary aura that grants allies tagged by the zone a temporary shield.",
            ),
            e: ab(
                "Song of Celerity",
                14,
                "Sona plays the Song of Celerity, granting nearby allies bonus Move Speed. Sona gains a temporary aura that grants allied champions tagged by the zone bonus Move Speed.",
            ),
            r: ab(
                "Crescendo",
                140,
                "Sona plays her ultimate chord, stunning enemy champions and forcing them to dance and dealing magic damage to them.",
            ),
        },
        items: [
            "ionian_boots_of_lucidity",
            "zhonyas_hourglass",
            "rabadons_deathcap",
            "malignance",
            "stormsurge",
            "shadowflame",
        ],
        outfit: { base: 0x212c43, hands: 0x474747, backpack: 0x598114 },
    },
    soraka: {
        name: "Soraka",
        title: "the Starchild",
        health: 149,
        speedBonus: 0,
        gun: true,
        basic: { damage: 28, cooldown: 0.6 },
        passive: { name: "Salvation", description: "Soraka runs faster towards nearby low health allies." },
        abilities: {
            q: ab(
                "Starcall",
                8,
                "A star falls from the sky at the target location dealing magic damage and slowing enemies. If an enemy champion is hit by Starcall, Soraka recovers Health.",
            ),
            w: ab(
                "Astral Infusion",
                6,
                "Soraka sacrifices a portion of her own health to heal another friendly champion.",
            ),
            e: ab(
                "Equinox",
                20,
                "Creates a zone at a location that silences all enemies inside. When the zone expires, all enemies still inside are rooted.",
            ),
            r: ab(
                "Wish",
                150,
                "Soraka fills her allies with hope, instantly restoring health to herself and all allied champions.",
            ),
        },
        items: [
            "ionian_boots_of_lucidity",
            "zhonyas_hourglass",
            "rabadons_deathcap",
            "malignance",
            "stormsurge",
            "shadowflame",
        ],
        outfit: { base: 0xc01959, hands: 0x17d431, backpack: 0x1cd75e },
    },
    swain: {
        name: "Swain",
        title: "the Noxian Grand General",
        health: 146,
        speedBonus: 0,
        gun: true,
        basic: { damage: 32, cooldown: 0.65 },
        passive: {
            name: "Ravenous Flock",
            description:
                "Swain's ravens collect Soul Fragments that heal him and permanently increase his maximum health.",
        },
        abilities: {
            q: ab(
                "Death's Hand",
                7,
                "Swain unleashes several bolts of eldritch power that pierce through enemies. Enemies hit take more damage for each bolt they are struck by.",
            ),
            w: ab(
                "Vision of Empire",
                20,
                "Swain opens a demon eye that deals damage and slows enemies. Champions hit are revealed and also grant Swain a Soul Fragment.",
            ),
            e: ab(
                "Nevermove",
                12,
                "Swain launches a wave of demonic power forward. It then returns to Swain and roots enemies it hits. Swain can then choose to pull all rooted champions closer. This ability has a shorter cooldown durin",
            ),
            r: ab(
                "Demonic Ascension",
                120,
                "Swain transforms into a demon and drains health from nearby enemy champions, minions, and neutral monsters. Swain can cast Demonflare to decimate and slow nearby enemies with a nova of soulfire. This ",
            ),
        },
        items: [
            "ludens_echo",
            "sorcerers_shoes",
            "stormsurge",
            "shadowflame",
            "rabadons_deathcap",
            "zhonyas_hourglass",
        ],
        outfit: { base: 0x4c1a30, hands: 0x3c34aa, backpack: 0xca2a76 },
    },
    sylas: {
        name: "Sylas",
        title: "the Unshackled",
        health: 162,
        speedBonus: 0,
        gun: false,
        basic: { damage: 34, cooldown: 0.65 },
        passive: {
            name: "Petricite Burst",
            description:
                "After casting a spell, Sylas stores a charge of Petricite Burst. Sylas's basic attacks will expend a charge and whirl his energized chains around him dealing bo",
        },
        abilities: {
            q: ab(
                "Chain Lash",
                10,
                "Sylas lashes his chains out, intersecting at his targeted location dealing damage to and slowing enemies. After a delay, magical energy explodes from the intersection point dealing damage.",
            ),
            w: ab(
                "Kingslayer",
                12,
                "Sylas lunges at an enemy with magical force dealing damage and healing himself against enemy champions.",
            ),
            e: ab(
                "Abscond / Abduct",
                13,
                "Sylas dashes to a location. Sylas can recast the ability to throw his chains out, pulling himself to an enemy he hits.",
            ),
            r: ab("Hijack", 80, "Sylas steals the enemy's ultimate ability and can cast it freely."),
        },
        items: [
            "ludens_echo",
            "sorcerers_shoes",
            "stormsurge",
            "shadowflame",
            "rabadons_deathcap",
            "zhonyas_hourglass",
        ],
        outfit: { base: 0xba8018, hands: 0x15343d, backpack: 0x8ec9d6 },
    },
    syndra: {
        name: "Syndra",
        title: "the Dark Sovereign",
        health: 158,
        speedBonus: 0,
        gun: true,
        basic: { damage: 30, cooldown: 0.65 },
        passive: {
            name: "Transcendent",
            description:
                "Syndra collects Splinters of Wrath from gaining levels and damaging enemies which upgrade her abilities.Dark Sphere: Syndra can hold an additional chargeForce o",
        },
        abilities: {
            q: ab(
                "Dark Sphere",
                7,
                "Syndra conjures a Dark Sphere dealing magic damage. The sphere remains and can be manipulated by her other powers.",
            ),
            w: ab(
                "Force of Will",
                13,
                "Syndra picks up and throws a Dark Sphere or enemy minion dealing magic damage and slowing the Move Speed of enemies.",
            ),
            e: ab(
                "Scatter the Weak",
                15,
                "Syndra knocks enemies and Dark Spheres back dealing magic damage. Enemies hit by Dark Spheres become stunned.",
            ),
            r: ab("Unleashed Power", 120, "Syndra bombards an enemy Champion with all of her Dark Spheres."),
        },
        items: [
            "ludens_echo",
            "sorcerers_shoes",
            "stormsurge",
            "shadowflame",
            "rabadons_deathcap",
            "zhonyas_hourglass",
        ],
        outfit: { base: 0xa74728, hands: 0xdaa527, backpack: 0xbab93e },
    },
    tahmkench: {
        name: "Tahm Kench",
        title: "The River King",
        health: 182,
        speedBonus: 0,
        gun: false,
        basic: { damage: 31, cooldown: 0.6 },
        passive: {
            name: "An Acquired Taste",
            description:
                "Tahm Kench puts the heft of his immense body behind his attacks, gaining extra damage based on his total health. Damaging enemy champions builds stacks of An Ac",
        },
        abilities: {
            q: ab(
                "Tongue Lash",
                7,
                "Tahm Kench lashes out with his tongue, damaging and slowing the first unit hit and healing himself if he strikes an enemy champion.Applies a stack of An Acquired Taste to enemy champions. If the champ",
            ),
            w: ab(
                "Abyssal Dive",
                21,
                "Dive down and then re-appear at target location, damaging and knocking up all enemies in an area.",
            ),
            e: ab(
                "Thick Skin",
                3,
                "Passive: Tahm Kench stores a percent of the damage he takes and heals based on it while out of combat.Active: Convert all stored damage into a temporary shield.",
            ),
            r: ab(
                "Devour",
                0,
                "Tahm Kench devours a champion for a few seconds, dealing magic damage if they are an enemy, or shielding them if they are an ally.",
            ),
        },
        items: [
            "plated_steelcaps",
            "dead_mans_plate",
            "steraks_gage",
            "sundered_sky",
            "deaths_dance",
            "guardian_angel",
        ],
        outfit: { base: 0xb42d17, hands: 0x9c3d1b, backpack: 0x7c4573 },
    },
    taliyah: {
        name: "Taliyah",
        title: "the Stoneweaver",
        health: 135,
        speedBonus: 0,
        gun: true,
        basic: { damage: 32, cooldown: 0.65 },
        passive: { name: "Rock Surfing", description: "Taliyah gains Move Speed near walls." },
        abilities: {
            q: ab(
                "Threaded Volley",
                7,
                "Taliyah throws a volley of rocks in a target direction, moving freely as she casts. This creates Worked Ground below her. If Taliyah casts Threaded Volley on Worked Ground, she consumes the ground to ",
            ),
            w: ab(
                "Seismic Shove",
                14,
                "Taliyah causes an area of ground to erupt and throws enemies within it in a direction of her choosing.",
            ),
            e: ab(
                "Unraveled Earth",
                14,
                "Taliyah creates a slowing minefield. If enemies dash through it or are knocked through it, the mines explode and stun them.",
            ),
            r: ab("Weaver's Wall", 180, "Taliyah creates a very long wall and then surfs it."),
        },
        items: [
            "ludens_echo",
            "sorcerers_shoes",
            "stormsurge",
            "shadowflame",
            "rabadons_deathcap",
            "zhonyas_hourglass",
        ],
        outfit: { base: 0x46209a, hands: 0x42c8da, backpack: 0x884388 },
    },
    talon: {
        name: "Talon",
        title: "the Blade's Shadow",
        health: 177,
        speedBonus: 0.5,
        gun: false,
        basic: { damage: 34, cooldown: 0.45 },
        passive: {
            name: "Blade's End",
            description:
                "Talon's spells Wound champions and large monsters, stacking up to 3 times. When Talon attacks a champion with 3 stacks of Wound, they bleed for heavy damage ove",
        },
        abilities: {
            q: ab(
                "Noxian Diplomacy",
                8,
                "Talon stabs the target unit. If they are within melee range, this attack deals critical damage. If they are outside melee range, Talon will leap at his target before stabbing them. Talon refunds some ",
            ),
            w: ab(
                "Rake",
                9,
                "Talon sends out a volley of daggers that then return back to him, dealing physical damage every time it passes through an enemy. The returning blades deal bonus damage and slow units hit.",
            ),
            e: ab(
                "Assassin's Path",
                0,
                "Talon vaults over any terrain or structure, up to a max distance. This ability has a low cooldown, but puts the used terrain on a long cooldown.",
            ),
            r: ab(
                "Shadow Assault",
                100,
                "Talon disperses a ring of blades and becomes Invisible while gaining additional Move Speed. When Talon emerges from Invisibility, the blades converge on his location. Each time the blades move, Shadow",
            ),
        },
        items: [
            "youmuus_ghostblade",
            "plated_steelcaps",
            "the_collector",
            "infinity_edge",
            "lord_dominiks_regards",
            "bloodthirster",
        ],
        outfit: { base: 0x441a93, hands: 0x67c55a, backpack: 0x29ca43 },
    },
    taric: {
        name: "Taric",
        title: "the Shield of Valoran",
        health: 184,
        speedBonus: 0,
        gun: false,
        basic: { damage: 30, cooldown: 0.6 },
        passive: {
            name: "Bravado",
            description:
                "Spellcasts empower Taric's next 2 basic attacks to deal bonus magic damage, reduce his spell cooldowns, and attack in quick succession.",
        },
        abilities: {
            q: ab(
                "Starlight's Touch",
                3,
                "Heals nearby allied champions based on charges stored. Bravado-empowered attacks grant a charge of Starlight's Touch.",
            ),
            w: ab(
                "Bastion",
                15,
                "Passively increase the Armor of Taric and any allied champion with Bastion.Actively shields an ally and grants them Bastion for as long as they remain near Taric. Taric's spells also cast off the ally",
            ),
            e: ab(
                "Dazzle",
                16,
                "Taric readies a beam of starlight that, after a brief delay, deals magic damage and stuns enemies.",
            ),
            r: ab(
                "Cosmic Radiance",
                180,
                "Pulses cosmic energy onto nearby allied champions after a delay, making them invulnerable for a short duration.",
            ),
        },
        items: [
            "ionian_boots_of_lucidity",
            "zhonyas_hourglass",
            "rabadons_deathcap",
            "malignance",
            "stormsurge",
            "shadowflame",
        ],
        outfit: { base: 0x692c30, hands: 0x688e6d, backpack: 0x9937db },
    },
    teemo: {
        name: "Teemo",
        title: "the Swift Scout",
        health: 166,
        speedBonus: 0,
        gun: true,
        basic: { damage: 30, cooldown: 0.5 },
        passive: {
            name: "Guerrilla Warfare",
            description:
                "If Teemo stands still and takes no actions for a short duration, he becomes Invisible indefinitely. If he's in brush, Teemo can enter and maintain his Invisibil",
        },
        abilities: {
            q: ab(
                "Blinding Dart",
                7,
                "Obscures an enemy's vision with a powerful venom, dealing damage to the target unit and blinding it for the duration.",
            ),
            w: ab(
                "Move Quick",
                14,
                "Teemo scampers around, passively increasing his Move Speed until he is struck by an enemy champion or turret. Teemo can sprint to gain bonus Move Speed that isn't stopped by being struck for a short t",
            ),
            e: ab(
                "Toxic Shot",
                0,
                "Each of Teemo's attacks will poison the target %i:OnHit% On-Hit, dealing damage on impact and each second after for 4 seconds.",
            ),
            r: ab(
                "Noxious Trap",
                0.25,
                "Teemo throws an explosive poisonous trap using one of the mushrooms stored in his pack. If an enemy steps on the trap, it will release a poisonous cloud, slowing enemies and damaging them over time. I",
            ),
        },
        items: [
            "hexoptics_c44",
            "berserkers_greaves",
            "runaans_hurricane",
            "infinity_edge",
            "lord_dominiks_regards",
            "guardian_angel",
        ],
        outfit: { base: 0xd22b9a, hands: 0x82a072, backpack: 0x7d6f48 },
    },
    thresh: {
        name: "Thresh",
        title: "the Chain Warden",
        health: 178,
        speedBonus: 0,
        gun: true,
        basic: { damage: 31, cooldown: 0.6 },
        passive: {
            name: "Damnation",
            description:
                "Thresh can harvest the souls of enemies that die near him, permanently granting him Armor and Ability Power.",
        },
        abilities: {
            q: ab(
                "Death Sentence",
                19,
                "Thresh binds an enemy in chains and pulls them toward him. Activating this ability a second time pulls Thresh to the enemy.",
            ),
            w: ab(
                "Dark Passage",
                21,
                "Thresh throws out a lantern that shields nearby allied Champions from damage. Allies can click the lantern to dash to Thresh.",
            ),
            e: ab(
                "Flay",
                13,
                "Thresh's attacks wind up, dealing more damage the longer he waits between attacks. When activated, Thresh sweeps his chain, knocking all enemies hit in the direction of the blow.",
            ),
            r: ab("The Box", 120, "A prison of walls that slow and deal damage if broken."),
        },
        items: [
            "ionian_boots_of_lucidity",
            "zhonyas_hourglass",
            "rabadons_deathcap",
            "malignance",
            "stormsurge",
            "shadowflame",
        ],
        outfit: { base: 0x30d4d2, hands: 0x17739b, backpack: 0x32373a },
    },
    tristana: {
        name: "Tristana",
        title: "the Yordle Gunner",
        health: 172,
        speedBonus: 0,
        gun: true,
        basic: { damage: 33, cooldown: 0.5 },
        passive: { name: "Draw a Bead", description: "Increases Tristana's Attack Range as she levels." },
        abilities: {
            q: ab("Rapid Fire", 20, "Tristana fires her weapon rapidly, increasing her Attack Speed for a short time."),
            w: ab(
                "Rocket Jump",
                22,
                "Tristana fires at the ground to propel her to a distant location, dealing damage and slowing surrounding units for a brief period where she lands.",
            ),
            e: ab(
                "Explosive Charge",
                16,
                "When Tristana kills a unit, her cannonballs burst into shrapnel, dealing damage to surrounding enemies. Can be activated to place a bomb on a target enemy that explodes after a short duration dealing ",
            ),
            r: ab(
                "Buster Shot",
                100,
                "Tristana loads a massive cannonball into her weapon and fires it at an enemy unit. This deals Magic Damage and knocks the target back. If the target is carrying the Explosive Charge bomb, the bomb det",
            ),
        },
        items: [
            "hexoptics_c44",
            "berserkers_greaves",
            "runaans_hurricane",
            "infinity_edge",
            "lord_dominiks_regards",
            "guardian_angel",
        ],
        outfit: { base: 0x545ea3, hands: 0x4fcec3, backpack: 0x421c5c },
    },
    trundle: {
        name: "Trundle",
        title: "the Troll King",
        health: 200,
        speedBonus: 0.5,
        gun: false,
        basic: { damage: 34, cooldown: 0.55 },
        passive: {
            name: "King's Tribute",
            description: "When an enemy unit dies near Trundle, he heals for a percent of its maximum Health.",
        },
        abilities: {
            q: ab(
                "Chomp",
                3.5,
                "Trundle bites his opponent, dealing damage, briefly slowing and sapping some of their Attack Damage.",
            ),
            w: ab(
                "Frozen Domain",
                18,
                "Trundle turns target location into his domain, gaining Attack Speed, Move Speed, and increased healing from all sources while on it.",
            ),
            e: ab(
                "Pillar of Ice",
                21,
                "Trundle creates an ice pillar at target location, becoming impassable terrain and slowing all nearby enemy units.",
            ),
            r: ab(
                "Subjugate",
                120,
                "Trundle immediately steals a percent of his target's Health, Armor and Magic Resistance. Over the next 4 seconds the amount of Health, Armor, and Magic Resistance stolen is doubled.",
            ),
        },
        items: [
            "berserkers_greaves",
            "stridebreaker",
            "phantom_dancer",
            "dead_mans_plate",
            "steraks_gage",
            "deaths_dance",
        ],
        outfit: { base: 0x2f5d2f, hands: 0x802c49, backpack: 0x89acd6 },
    },
    tryndamere: {
        name: "Tryndamere",
        title: "the Barbarian King",
        health: 186,
        speedBonus: 0.5,
        gun: false,
        basic: { damage: 34, cooldown: 0.55 },
        passive: {
            name: "Battle Fury",
            description:
                "Tryndamere gains Fury for each attack, critical strike, and killing blow he makes. Fury passively increases his Critical Strike Chance and can be consumed with ",
        },
        abilities: {
            q: ab(
                "Bloodlust",
                12,
                "Tryndamere thrives on the thrills of combat, increasing his Attack Damage as he is more and more wounded. He can cast Bloodlust to consume his Fury and heal himself.",
            ),
            w: ab(
                "Mocking Shout",
                14,
                "Tryndamere lets out an insulting cry, decreasing surrounding champions' Attack Damage. Enemies with their backs turned to Tryndamere also have their Move Speed reduced.",
            ),
            e: ab(
                "Spinning Slash",
                12,
                "Tryndamere slices toward a target unit, dealing damage to enemies in his path.",
            ),
            r: ab(
                "Undying Rage",
                120,
                "Tryndamere's lust for battle becomes so strong that he is unable to die, no matter how wounded he becomes.",
            ),
        },
        items: [
            "berserkers_greaves",
            "stridebreaker",
            "phantom_dancer",
            "dead_mans_plate",
            "steraks_gage",
            "deaths_dance",
        ],
        outfit: { base: 0x382656, hands: 0x6cae2f, backpack: 0x768f1f },
    },
    twistedfate: {
        name: "Twisted Fate",
        title: "the Card Master",
        health: 164,
        speedBonus: 0,
        gun: true,
        basic: { damage: 29, cooldown: 0.65 },
        passive: {
            name: "Loaded Dice",
            description: "Upon killing a unit, Twisted Fate rolls his 'lucky' dice receiving 1 to 6 bonus gold.",
        },
        abilities: {
            q: ab(
                "Wild Cards",
                6,
                "Twisted Fate throws three cards, dealing damage to each enemy unit they pass through.",
            ),
            w: ab(
                "Pick a Card",
                6,
                "Twisted Fate chooses a magic card from his deck, and uses that for his next attack, causing bonus effects.",
            ),
            e: ab(
                "Stacked Deck",
                0,
                "Every 4 attacks, Twisted Fate deals bonus damage. In addition, his Attack Speed is increased.",
            ),
            r: ab(
                "Destiny",
                170,
                "Twisted Fate predicts the fortunes of his foes, revealing all enemy champions and enabling the use of Gate, which teleports Twisted Fate to any target location in 1.5 seconds.",
            ),
        },
        items: [
            "ludens_echo",
            "sorcerers_shoes",
            "stormsurge",
            "shadowflame",
            "rabadons_deathcap",
            "zhonyas_hourglass",
        ],
        outfit: { base: 0x3a4fa7, hands: 0xb24039, backpack: 0x38359b },
    },
    twitch: {
        name: "Twitch",
        title: "the Plague Rat",
        health: 170,
        speedBonus: 0,
        gun: true,
        basic: { damage: 32, cooldown: 0.5 },
        passive: {
            name: "Deadly Venom",
            description: "Twitch's basic attacks infect the target %i:OnHit% On-Hit, dealing true damage each second.",
        },
        abilities: {
            q: ab(
                "Ambush",
                16,
                "Twitch becomes Camouflaged for a short duration and gains Move Speed. When leaving Camouflage, Twitch gains Attack Speed for a short duration.When an enemy champion with Deadly Venom dies, Ambush's co",
            ),
            w: ab(
                "Venom Cask",
                13,
                "Twitch hurls a cask of venom that explodes in an area, slowing targets and applying deadly venom to the target.",
            ),
            e: ab(
                "Contaminate",
                12,
                "Twitch wreaks further havoc on poisoned enemies with a blast of his vile diseases.",
            ),
            r: ab(
                "Spray and Pray",
                90,
                "Twitch unleashes the full power of his crossbow, shooting bolts over a great distance that pierce all enemies caught in their path.",
            ),
        },
        items: [
            "hexoptics_c44",
            "berserkers_greaves",
            "runaans_hurricane",
            "infinity_edge",
            "lord_dominiks_regards",
            "guardian_angel",
        ],
        outfit: { base: 0xc5bf96, hands: 0x7c6a36, backpack: 0x928c6d },
    },
    udyr: {
        name: "Udyr",
        title: "the Spirit Walker",
        health: 203,
        speedBonus: 0.5,
        gun: false,
        basic: { damage: 34, cooldown: 0.55 },
        passive: {
            name: "Bridge Between",
            description:
                "Udyr has four basic Abilities that swap between Stances and can Recast an Ability to renew it with Ultimate benefits. Additionally, after using an Ability, Udyr",
        },
        abilities: {
            q: ab(
                "Wilding Claw",
                6,
                "Udyr gains attack speed and his next two attacks deal bonus physical damage. Recast: Gain even more attack speed, and the next two attacks call lightning to strike the target.",
            ),
            w: ab(
                "Iron Mantle",
                6,
                "Udyr gains a shield and his next two attacks heal him. Recast: Gain an even bigger shield and heal based on max health over the next couple seconds.",
            ),
            e: ab(
                "Blazing Stampede",
                6,
                "Udyr gains movement speed and his first attack against each target will Stun them. Recast: Gain even more movement speed and immunity to immobilizing effects for a couple seconds.",
            ),
            r: ab(
                "Wingborne Storm",
                6,
                "Udyr surrounds himself in a glacial storm, damaging and slowing nearby enemies. Recast: Empower and unleash the storm, causing it to track enemies and deal additional damage.",
            ),
        },
        items: [
            "berserkers_greaves",
            "stridebreaker",
            "phantom_dancer",
            "dead_mans_plate",
            "steraks_gage",
            "deaths_dance",
        ],
        outfit: { base: 0x882b2f, hands: 0x866937, backpack: 0x5e8b49 },
    },
    urgot: {
        name: "Urgot",
        title: "the Dreadnought",
        health: 201,
        speedBonus: 0.5,
        gun: true,
        basic: { damage: 34, cooldown: 0.55 },
        passive: {
            name: "Echoing Flames",
            description:
                "Urgot's basic attacks and Purge periodically trigger blasts of flame from his legs, dealing physical damage.",
        },
        abilities: {
            q: ab(
                "Corrosive Charge",
                10,
                "Fires an explosive charge at the target location, dealing physical damage and slowing enemies caught in the explosion.",
            ),
            w: ab(
                "Purge",
                12,
                "Urgot slows himself while he unloads his weapon on nearby enemies. Prioritizes enemy champions Urgot has recently struck with other abilities and triggers Echoing Flames.",
            ),
            e: ab(
                "Disdain",
                16,
                "Urgot charges in a direction, shielding himself and trampling non-champion enemies. If he catches an enemy champion, he will stop and hurl them out of his way.",
            ),
            r: ab(
                "Fear Beyond Death",
                100,
                "Urgot fires a chem-drill that impales the first enemy champion hit. If that champion falls below a health threshold, Urgot judges them weak and can execute them.",
            ),
        },
        items: [
            "berserkers_greaves",
            "stridebreaker",
            "phantom_dancer",
            "dead_mans_plate",
            "steraks_gage",
            "deaths_dance",
        ],
        outfit: { base: 0x446443, hands: 0x82bc83, backpack: 0x564965 },
    },
    varus: {
        name: "Varus",
        title: "the Arrow of Retribution",
        health: 162,
        speedBonus: 0,
        gun: true,
        basic: { damage: 32, cooldown: 0.5 },
        passive: {
            name: "Living Vengeance",
            description:
                "On kill or assist, Varus temporarily gains Attack Damage and Ability Power. This bonus is larger if the enemy is a champion.",
        },
        abilities: {
            q: ab(
                "Piercing Arrow",
                16,
                "Varus readies and then fires a powerful shot that gains extra range and damage the longer he spends preparing to fire.",
            ),
            w: ab(
                "Blighted Quiver",
                40,
                "Passive: Varus' basic attacks deal bonus magic damage and apply Blight. Varus' other abilities detonate Blight, dealing magic damage based on the target's maximum Health. Active: Varus empowers his ne",
            ),
            e: ab(
                "Hail of Arrows",
                18,
                "Varus fires a hail of arrows that deal physical damage and desecrate the ground. Desecrated ground slows enemies' Move Speed and reduces their self healing and regeneration.",
            ),
            r: ab(
                "Chain of Corruption",
                100,
                "Varus flings out a damaging tendril of corruption that immobilizes the first enemy champion hit and then spreads towards nearby uninfected champions, immobilizing them too on contact.",
            ),
        },
        items: [
            "hexoptics_c44",
            "berserkers_greaves",
            "runaans_hurricane",
            "infinity_edge",
            "lord_dominiks_regards",
            "guardian_angel",
        ],
        outfit: { base: 0x1ed9a8, hands: 0xadaf27, backpack: 0x522c2d },
    },
    vayne: {
        name: "Vayne",
        title: "the Night Hunter",
        health: 158,
        speedBonus: 0,
        gun: true,
        basic: { damage: 33, cooldown: 0.5 },
        passive: {
            name: "Night Hunter",
            description:
                "Vayne ruthlessly hunts evil-doers, gaining Move Speed when moving toward nearby enemy champions.",
        },
        abilities: {
            q: ab(
                "Tumble",
                6,
                "Vayne tumbles, maneuvering to carefully place her next shot. Her next attack deals bonus damage.",
            ),
            w: ab(
                "Silver Bolts",
                0,
                "Vayne tips her bolts with a rare metal, toxic to evil things. The third consecutive attack or ability against the same target deals a percentage of the target's max health as bonus true damage.",
            ),
            e: ab(
                "Condemn",
                20,
                "Vayne draws a heavy crossbow from her back, and fires a huge bolt at her target, knocking them back and dealing damage. If they collide with terrain, they are impaled, dealing bonus damage and stunnin",
            ),
            r: ab(
                "Final Hour",
                100,
                "Readying herself for an epic confrontation, Vayne gains increased Attack Damage, Invisibility during Tumble, reduced Tumble cooldown, and more bonus Move Speed from Night Hunter",
            ),
        },
        items: [
            "hexoptics_c44",
            "berserkers_greaves",
            "runaans_hurricane",
            "infinity_edge",
            "lord_dominiks_regards",
            "guardian_angel",
        ],
        outfit: { base: 0x715059, hands: 0x5a4958, backpack: 0xbdb224 },
    },
    veigar: {
        name: "Veigar",
        title: "the Tiny Master of Evil",
        health: 158,
        speedBonus: 0,
        gun: true,
        basic: { damage: 29, cooldown: 0.65 },
        passive: {
            name: "Phenomenal Evil Power",
            description:
                "Veigar is the greatest Evil to ever strike at the hearts of Runeterra - and he's only getting bigger! Striking an enemy Champion with a spell or scoring a taked",
        },
        abilities: {
            q: ab(
                "Baleful Strike",
                6,
                "Veigar unleashes a bolt of dark energy that deals magic damage to the first two enemies hit. Units killed by this bolt grant Veigar some ability power permanently.",
            ),
            w: ab(
                "Dark Matter",
                0,
                "Veigar calls a great mass of dark matter to fall from the sky to the target location, dealing magic damage when it lands. Stacks of Phenomenal Evil reduce Dark Matter's cooldown.",
            ),
            e: ab(
                "Event Horizon",
                20,
                "Veigar twists the edges of space, creating a cage that Stuns enemies that pass through.",
            ),
            r: ab(
                "Primordial Burst",
                120,
                "Blasts target enemy champion, dealing a large amount of magic damage, increasing based on the target's missing health.",
            ),
        },
        items: [
            "ludens_echo",
            "sorcerers_shoes",
            "stormsurge",
            "shadowflame",
            "rabadons_deathcap",
            "zhonyas_hourglass",
        ],
        outfit: { base: 0xb49f75, hands: 0x274537, backpack: 0xb87fae },
    },
    velkoz: {
        name: "Vel'Koz",
        title: "the Eye of the Void",
        health: 145,
        speedBonus: 0,
        gun: true,
        basic: { damage: 30, cooldown: 0.65 },
        passive: {
            name: "Organic Deconstruction",
            description:
                "Vel'Koz's abilities apply Organic Deconstruction to enemies on hit. If 3 stacks are accumulated, the enemy will take a burst of true damage.",
        },
        abilities: {
            q: ab(
                "Plasma Fission",
                7,
                "Vel'Koz shoots a bolt of plasma that splits in two on reactivation or upon hitting an enemy. The bolt slows and damages on hit.",
            ),
            w: ab(
                "Void Rift",
                1.5,
                "Vel'Koz opens a rift to the void that deals an initial burst of damage, then explodes for a second burst of damage after a delay.",
            ),
            e: ab(
                "Tectonic Disruption",
                12,
                "Vel'Koz causes an area to explode, knocking up enemies, and knocking close enemies slightly away.",
            ),
            r: ab(
                "Life Form Disintegration Ray",
                100,
                "Vel'Koz unleashes a channelled beam that follows the cursor for 2.5 seconds that deals magic damage. Organic Deconstruction Researches enemy champions causing them to take true damage instead.",
            ),
        },
        items: [
            "ludens_echo",
            "sorcerers_shoes",
            "stormsurge",
            "shadowflame",
            "rabadons_deathcap",
            "zhonyas_hourglass",
        ],
        outfit: { base: 0x5457da, hands: 0xa93a4a, backpack: 0x2a7716 },
    },
    vex: {
        name: "Vex",
        title: "the Gloomist",
        health: 160,
        speedBonus: 0,
        gun: true,
        basic: { damage: 30, cooldown: 0.65 },
        passive: {
            name: "Doom 'n Gloom",
            description:
                "Vex periodically becomes empowered, causing her next basic Ability to fear enemies and interrupt dashes. Whenever a nearby enemy dashes, Vex applies a mark that",
        },
        abilities: {
            q: ab("Mistral Bolt", 8, "Launch a damaging missile that accelerates mid-flight."),
            w: ab("Personal Space", 16, "Gain a shield and damage nearby enemies."),
            e: ab("Looming Darkness", 12, "Summon a damaging and slowing zone that applies Gloom to enemies."),
            r: ab(
                "Shadow Surge",
                140,
                "Fire a missile that marks an enemy champion. Recast to dash to them and deal damage.",
            ),
        },
        items: [
            "ludens_echo",
            "sorcerers_shoes",
            "stormsurge",
            "shadowflame",
            "rabadons_deathcap",
            "zhonyas_hourglass",
        ],
        outfit: { base: 0x197fd1, hands: 0xb72ba2, backpack: 0xb4233d },
    },
    vi: {
        name: "Vi",
        title: "the Piltover Enforcer",
        health: 176,
        speedBonus: 0.5,
        gun: false,
        basic: { damage: 34, cooldown: 0.55 },
        passive: {
            name: "Blast Shield",
            description:
                "Vi charges a shield over time. The shield can be activated by hitting an enemy with an ability.",
        },
        abilities: {
            q: ab(
                "Vault Breaker",
                12,
                "Vi charges her gauntlets and unleashes a vault shattering punch, carrying her forward. Enemies she hits are knocked back and receive a stack of Denting Blows.",
            ),
            w: ab(
                "Denting Blows",
                0,
                "Vi's punches break her opponent's Armor, dealing bonus damage and granting her Attack Speed.",
            ),
            e: ab(
                "Relentless Force",
                1,
                "Vi's next attack blasts through her target, dealing damage to enemies behind it.",
            ),
            r: ab(
                "Cease and Desist",
                140,
                "Vi runs down an enemy, knocking aside anyone in the way. When she reaches her target she knocks it into the air, jumps after it, and slams it back into the ground.",
            ),
        },
        items: [
            "berserkers_greaves",
            "stridebreaker",
            "phantom_dancer",
            "dead_mans_plate",
            "steraks_gage",
            "deaths_dance",
        ],
        outfit: { base: 0x2e2d8f, hands: 0x907d49, backpack: 0xc7327c },
    },
    viego: {
        name: "Viego",
        title: "The Ruined King",
        health: 170,
        speedBonus: 0.5,
        gun: false,
        basic: { damage: 31, cooldown: 0.55 },
        passive: {
            name: "Sovereign's Domination",
            description:
                "Enemies who fall before Viego become wraiths. By attacking a wraith, Viego temporarily seizes control of the dead enemy's body, healing for a percentage of his ",
        },
        abilities: {
            q: ab(
                "Blade of the Ruined King",
                5,
                "Viego's spectral blade passively deals bonus percent current Health damage On-Hit and strikes twice vs. enemies he recently hit with an Ability, stealing Health.Viego can activate this Ability to thru",
            ),
            w: ab(
                "Spectral Maw",
                8,
                "Viego charges up before dashing forward, releasing a ball of concentrated Black Mist that stuns the first enemy hit.",
            ),
            e: ab(
                "Harrowed Path",
                14,
                "Viego commands the Black Mist to haunt and surround a piece of terrain. Viego can hide in the Mist as a wraith, gaining camouflage, Move Speed, and Attack Speed.",
            ),
            r: ab(
                "Heartbreaker",
                120,
                "Viego teleports to a nearby location and executes an enemy champion on arrival, piercing their heart and causing a destructive shockwave around them that knocks away their allies.",
            ),
        },
        items: [
            "berserkers_greaves",
            "stridebreaker",
            "phantom_dancer",
            "dead_mans_plate",
            "steraks_gage",
            "deaths_dance",
        ],
        outfit: { base: 0x34d7c0, hands: 0xcc503b, backpack: 0x44a3b2 },
    },
    viktor: {
        name: "Viktor",
        title: "the Herald of the Arcane",
        health: 162,
        speedBonus: 0,
        gun: true,
        basic: { damage: 29, cooldown: 0.65 },
        passive: {
            name: "Glorious Evolution",
            description:
                "Viktor gains Hex Fragments whenever he kills an enemy. With every 100 Hex Fragments he obtains, Viktor permanently augments an active ability. After upgrading a",
        },
        abilities: {
            q: ab(
                "Siphon Power",
                9,
                "Viktor blasts an enemy unit with magic damage, which grants him a shield and empowers his next basic attack.Augment: Siphon Power's shield is increased by 60% and Viktor gains bonus move speed after c",
            ),
            w: ab(
                "Gravity Field",
                17,
                "Viktor conjures a heavy gravitational field that slows enemies caught within its radius. Enemies who stay in the field for too long become stunned.Augment: Viktor's spells apply a slow to enemies.",
            ),
            e: ab(
                "Hextech Ray",
                12,
                "Viktor uses his biomechanical arm to fire a Hextech Ray that cuts across the field in a line, dealing damage to all enemies in its path.Augment: An explosion follows in the Hextech Ray's wake, dealing",
            ),
            r: ab(
                "Arcane Storm",
                120,
                "Viktor conjures an Arcane Storm on the field, dealing magic damage and interrupting enemy channels. The storm periodically does magic damage to all nearby enemies and can be redirected by Viktor.Augme",
            ),
        },
        items: [
            "ludens_echo",
            "sorcerers_shoes",
            "stormsurge",
            "shadowflame",
            "rabadons_deathcap",
            "zhonyas_hourglass",
        ],
        outfit: { base: 0x513530, hands: 0x8a1870, backpack: 0x181554 },
    },
    vladimir: {
        name: "Vladimir",
        title: "the Crimson Reaper",
        health: 162,
        speedBonus: 0,
        gun: true,
        basic: { damage: 30, cooldown: 0.65 },
        passive: {
            name: "Crimson Pact",
            description:
                "Every 30 points of bonus Health gives Vladimir 1 Ability Power and every 1 point of Ability Power gives Vladimir 1.6 bonus Health (does not stack with itself).",
        },
        abilities: {
            q: ab(
                "Transfusion",
                9,
                "Vladimir steals life from the target enemy. When Vladimir's resource is full, Transfusion will benefit from massively increased damage and healing for a brief time.",
            ),
            w: ab(
                "Sanguine Pool",
                28,
                "Vladimir sinks into a pool of blood, becoming untargetable for 2 seconds. Additionally, enemies on the pool are slowed and Vladimir siphons life from them.",
            ),
            e: ab(
                "Tides of Blood",
                13,
                "Vladimir pays his own health to charge up a reservoir of blood which, when released, deals damage in the area around him but can be blocked by enemy units.",
            ),
            r: ab(
                "Hemoplague",
                120,
                "Vladimir infects an area with a virulent plague. Affected enemies take increased damage for the duration. After a few seconds, Hemoplague deals magic damage to infected enemies and heals Vladimir for ",
            ),
        },
        items: [
            "ludens_echo",
            "sorcerers_shoes",
            "stormsurge",
            "shadowflame",
            "rabadons_deathcap",
            "zhonyas_hourglass",
        ],
        outfit: { base: 0x746e97, hands: 0xcba841, backpack: 0x1e9a48 },
    },
    volibear: {
        name: "Volibear",
        title: "the Relentless Storm",
        health: 200,
        speedBonus: 0.5,
        gun: false,
        basic: { damage: 34, cooldown: 0.55 },
        passive: {
            name: "The Relentless Storm",
            description:
                "Volibear's Attacks and abilities grant Attack Speed, and eventually cause his Attacks to deal bonus magic damage to nearby enemies.",
        },
        abilities: {
            q: ab(
                "Thundering Smash",
                12,
                "Volibear gains speed towards enemies, Stunning and damaging the first one he Attacks.",
            ),
            w: ab(
                "Frenzied Maul",
                5,
                "Volibear damages an enemy, applying on-hit effects and marking them. Casting this ability again on the same target deals bonus damage and Heals Volibear.",
            ),
            e: ab(
                "Sky Splitter",
                16,
                "Volibear summons a lightning bolt at a location, dealing damage and Slowing enemies while granting Volibear a Shield if he's inside the blast radius.",
            ),
            r: ab(
                "Stormbringer",
                160,
                "Volibear leaps to a target location, Slowing and damaging enemies beneath him while gaining bonus Health. Enemy towers near his landing location become temporarily disabled.",
            ),
        },
        items: [
            "berserkers_greaves",
            "stridebreaker",
            "phantom_dancer",
            "dead_mans_plate",
            "steraks_gage",
            "deaths_dance",
        ],
        outfit: { base: 0xa18e25, hands: 0xd9ab53, backpack: 0x697e27 },
    },
    warwick: {
        name: "Warwick",
        title: "the Uncaged Wrath of Zaun",
        health: 193,
        speedBonus: 0.5,
        gun: false,
        basic: { damage: 34, cooldown: 0.55 },
        passive: {
            name: "Eternal Hunger",
            description:
                "Warwick's basic attacks deal bonus magic damage. If Warwick is below 50% health, he heals the same amount. If Warwick is below 25% health, this healing triples.",
        },
        abilities: {
            q: ab(
                "Jaws of the Beast",
                8,
                "Warwick lunges forward and bites his target, dealing damage based on their maximum health and healing for damage dealt.",
            ),
            w: ab(
                "Blood Hunt",
                80,
                "Warwick senses enemies below 50% health, gaining Move Speed toward and attack speed against them. When they fall below 25% health, he frenzies and these bonuses triple.",
            ),
            e: ab(
                "Primal Howl",
                15,
                "Warwick gains damage reduction for 2.5 seconds. At the end, or if re-activated, he howls, causing nearby enemies to flee for 1 second.",
            ),
            r: ab(
                "Infinite Duress",
                110,
                "Warwick leaps in a direction (scaling with his bonus Move Speed), suppressing the first champion he collides with for 1.5 seconds.",
            ),
        },
        items: [
            "berserkers_greaves",
            "stridebreaker",
            "phantom_dancer",
            "dead_mans_plate",
            "steraks_gage",
            "deaths_dance",
        ],
        outfit: { base: 0xdb1ba7, hands: 0x606fd3, backpack: 0xc9755d },
    },
    xayah: {
        name: "Xayah",
        title: "the Rebel",
        health: 170,
        speedBonus: 0,
        gun: true,
        basic: { damage: 33, cooldown: 0.5 },
        passive: {
            name: "Clean Cuts",
            description:
                "After using an ability, Xayah's next basic attacks will hit all targets along their path and leave a Feather.",
        },
        abilities: {
            q: ab("Double Daggers", 10, "Xayah throws two damaging daggers that also drop Feathers she can recall."),
            w: ab(
                "Deadly Plumage",
                18,
                "Xayah creates a storm of blades that increase her Attack Speed and damage while also granting her Move Speed if she attacks a champion.",
            ),
            e: ab("Bladecaller", 12, "Xayah calls back all her dropped Feathers dealing damage and rooting enemies."),
            r: ab(
                "Featherstorm",
                140,
                "Xayah leaps into the air becoming untargetable and throwing out a fan of daggers, dropping Feathers she can recall.",
            ),
        },
        items: [
            "hexoptics_c44",
            "berserkers_greaves",
            "runaans_hurricane",
            "infinity_edge",
            "lord_dominiks_regards",
            "guardian_angel",
        ],
        outfit: { base: 0x6e8176, hands: 0x9d3d4f, backpack: 0x7d193a },
    },
    xerath: {
        name: "Xerath",
        title: "the Magus Ascendant",
        health: 141,
        speedBonus: 0,
        gun: true,
        basic: { damage: 30, cooldown: 0.65 },
        passive: {
            name: "Mana Surge",
            description:
                "Xerath's basic attacks periodically restore Mana. Whenever Xerath kills a unit, this cooldown is reduced.",
        },
        abilities: {
            q: ab("Arcanopulse", 9, "Fires a long-range beam of energy, dealing magic damage to all targets hit."),
            w: ab(
                "Eye of Destruction",
                14,
                "Calls down a barrage of arcane energy, slowing and dealing magic damage to all enemies in an area. Targets in the middle receive additional damage and a stronger slow.",
            ),
            e: ab("Shocking Orb", 13, "Deals magic damage to an enemy and stuns them."),
            r: ab("Rite of the Arcane", 130, "Xerath immobilizes himself and gains numerous long-range barrages."),
        },
        items: [
            "ludens_echo",
            "sorcerers_shoes",
            "stormsurge",
            "shadowflame",
            "rabadons_deathcap",
            "zhonyas_hourglass",
        ],
        outfit: { base: 0x301ac9, hands: 0x234e3a, backpack: 0x83bb28 },
    },
    xinzhao: {
        name: "Xin Zhao",
        title: "the Seneschal of Demacia",
        health: 193,
        speedBonus: 0.5,
        gun: false,
        basic: { damage: 34, cooldown: 0.55 },
        passive: { name: "Determination", description: "Every third attack deals bonus damage and heals Xin Zhao." },
        abilities: {
            q: ab(
                "Three Talon Strike",
                7,
                "Xin Zhao's next 3 standard attacks deal increased damage with the third attack knocking an opponent into the air.",
            ),
            w: ab(
                "Wind Becomes Lightning",
                12,
                "Xin Zhao slashes in front of himself with his spear, then thrusts it forward, slowing affected enemies and marking them as Challenged.",
            ),
            e: ab(
                "Audacious Charge",
                11,
                "Xin Zhao charges to an enemy, gaining increased Attack Speed and dealing damage to all enemies in the area, slowing them briefly. This Ability gains increased range against Challenged targets.",
            ),
            r: ab(
                "Crescent Guard",
                120,
                "Xin Zhao passively challenges an enemy he damaged recently. When activated, Xin Zhao deals damage to nearby enemies based on their current Health and knocks non-challenged targets back, becoming imper",
            ),
        },
        items: [
            "berserkers_greaves",
            "stridebreaker",
            "phantom_dancer",
            "dead_mans_plate",
            "steraks_gage",
            "deaths_dance",
        ],
        outfit: { base: 0x1fd43e, hands: 0x9340c8, backpack: 0x3d9798 },
    },
    yone: {
        name: "Yone",
        title: "the Unforgotten",
        health: 168,
        speedBonus: 0.5,
        gun: false,
        basic: { damage: 34, cooldown: 0.55 },
        passive: {
            name: "Way of the Hunter",
            description:
                "Yone deals magic damage with every second Attack. In addition, his critical strike chance is increased.",
        },
        abilities: {
            q: ab(
                "Mortal Steel",
                4,
                "Thrusts forward, damaging all enemies in a line.On hit, grants a stack of Gathering Storm for a few seconds. At 2 stacks, Mortal Steel dashes Yone forward with a gust of wind knocking enemies Airborne",
            ),
            w: ab(
                "Spirit Cleave",
                14,
                "Cleaves forward, damaging all enemies in a cone. Grants a shield to Yone, the value is increased by the number of champions hit by the swipe.Spirit Cleave's cooldown and cast time scale with attack sp",
            ),
            e: ab(
                "Soul Unbound",
                22,
                "Yone's spirit leaves his body behind, gaining Move Speed. When this ability ends, Yone's spirit is forced back to his body and he repeats a portion of the damage he dealt as a spirit.",
            ),
            r: ab(
                "Fate Sealed",
                120,
                "Yone blinks behind the last champion in a line with a slash so powerful it pulls all enemies hit towards him.",
            ),
        },
        items: [
            "berserkers_greaves",
            "stridebreaker",
            "phantom_dancer",
            "dead_mans_plate",
            "steraks_gage",
            "deaths_dance",
        ],
        outfit: { base: 0xbf3234, hands: 0xd0a681, backpack: 0x5ca251 },
    },
    yorick: {
        name: "Yorick",
        title: "Shepherd of Souls",
        health: 200,
        speedBonus: 0.5,
        gun: false,
        basic: { damage: 34, cooldown: 0.55 },
        passive: {
            name: "Shepherd of Souls",
            description: "The Cursed Horde: Yorick can summon Mist Walkers to swarm and attack nearby enemies.",
        },
        abilities: {
            q: ab(
                "Last Rites",
                6,
                "Yorick deals bonus damage on his next attack and heals himself. If the target is a champion or large monster or if the target dies, a grave will be dug.",
            ),
            w: ab(
                "Dark Procession",
                20,
                "Yorick summons a destructible wall at target location that will block enemy movement.",
            ),
            e: ab(
                "Mourning Mist",
                12,
                "Yorick throws a globule of Black Mist that reduces armor, damages, slows and marks enemies. Summoned units gain move speed when moving towards marked targets.",
            ),
            r: ab(
                "Eulogy of the Isles",
                160,
                "Yorick summons the Maiden of the Mist that causes Yorick's attacks against the Maiden's target to deal bonus damage. The Maiden will also automatically raise Walkers from dead enemies.",
            ),
        },
        items: [
            "berserkers_greaves",
            "stridebreaker",
            "phantom_dancer",
            "dead_mans_plate",
            "steraks_gage",
            "deaths_dance",
        ],
        outfit: { base: 0x2425bd, hands: 0x16295e, backpack: 0x904585 },
    },
    yunara: {
        name: "Yunara",
        title: "the Unbroken Faith",
        health: 160,
        speedBonus: 0,
        gun: true,
        basic: { damage: 30, cooldown: 0.5 },
        passive: { name: "Vow of the First Lands", description: "Yunara's Critical Strikes deal bonus magic damage." },
        abilities: {
            q: ab(
                "Cultivation of Spirit",
                0,
                "Yunara gains Attack Speed, bonus damage On-Hit, and her Attacks spread to nearby enemies.",
            ),
            w: ab(
                "Arc of Judgment | Arc of Ruin",
                10,
                "Yunara fires a spinning prayer bead that deals damage and slows enemies. While in her Transcendent State she instead fires off a laser that deals damage and slows enemies.",
            ),
            e: ab(
                "Kanmei's Steps | Untouchable Shadow",
                9,
                "Yunara gains Move Speed and becomes Ghosted. While in her Transcendent State she instead dashes in a direction.",
            ),
            r: ab("Transcend One's Self", 100, "Yunara enters a Transcendent State that upgrades her basic Abilities."),
        },
        items: [
            "hexoptics_c44",
            "berserkers_greaves",
            "runaans_hurricane",
            "infinity_edge",
            "lord_dominiks_regards",
            "guardian_angel",
        ],
        outfit: { base: 0x954190, hands: 0x363f93, backpack: 0x3e56d3 },
    },
    yuumi: {
        name: "Yuumi",
        title: "the Magical Cat",
        health: 123,
        speedBonus: 0,
        gun: true,
        basic: { damage: 27, cooldown: 0.6 },
        passive: {
            name: "Feline Friendship",
            description:
                "Periodically, when Yuumi strikes a champion with an attack or ability, she restores health to herself and the next ally she Attaches to.While Attached, Yuumi ge",
        },
        abilities: {
            q: ab(
                "Prowling Projectile",
                6.5,
                "Yuumi fires a missile, dealing damage and slowing first target hit. It deals bonus damage and an enchanced slow if it takes at least 1.35 seconds to get to its target. While on her Best Friend, the sl",
            ),
            w: ab(
                "You and Me!",
                0,
                "Yuumi dashes to a target ally, becoming untargetable from everything except turrets. While on her Best Friend, she gains Heal & Shield Power and grants her Ally On-Hit healing.",
            ),
            e: ab(
                "Zoomies",
                10,
                "Shields Yuumi and boosts Move Speed and Attack Speed. If she's attached, she passes it to her ally instead.",
            ),
            r: ab(
                "Final Chapter",
                120,
                "Yuumi channels five waves that damage enemies and heal allies. Yuumi can move, attach, and cast Zoomies! while channeling. While on her Best Friend, this spell also follows her mouse.",
            ),
        },
        items: [
            "ionian_boots_of_lucidity",
            "zhonyas_hourglass",
            "rabadons_deathcap",
            "malignance",
            "stormsurge",
            "shadowflame",
        ],
        outfit: { base: 0xcb5c7f, hands: 0x546c63, backpack: 0x5e2a85 },
    },
    zaahen: {
        name: "Zaahen",
        title: "The Unsundered",
        health: 172,
        speedBonus: 0.5,
        gun: false,
        basic: { damage: 34, cooldown: 0.55 },
        passive: {
            name: "Cultivation of War",
            description:
                "Zaahen's attacks and abilities against enemy champions grant him stacks of Determination, gaining bonus Attack Damage per stack. When filled with Determination,",
        },
        abilities: {
            q: ab(
                "The Darkin Glaive",
                10,
                "Zaahen slashes twice on his next attack, dealing bonus damage and healing himself. Zaahen can recast this ability to have his next attack deal bonus damage and knock up his target.",
            ),
            w: ab(
                "Dreaded Return",
                14,
                "Zaahen stabs in a direction, damaging enemies hit, then pulls them toward him.",
            ),
            e: ab("Aureate Rush", 10, "Zaahen dashes to a location and slices around himself."),
            r: ab(
                "Grim Deliverance",
                110,
                "Zaahen rises then stabs downward, damaging enemies and healing for a portion of the damage dealt.",
            ),
        },
        items: [
            "berserkers_greaves",
            "stridebreaker",
            "phantom_dancer",
            "dead_mans_plate",
            "steraks_gage",
            "deaths_dance",
        ],
        outfit: { base: 0x233e39, hands: 0x621e63, backpack: 0xda34da },
    },
    zac: {
        name: "Zac",
        title: "the Secret Weapon",
        health: 209,
        speedBonus: 0,
        gun: false,
        basic: { damage: 33, cooldown: 0.6 },
        passive: {
            name: "Cell Division",
            description:
                "Each time Zac hits an enemy with an ability, he sheds a chunk of himself that can be reabsorbed to restore Health. Upon taking fatal damage, Zac splits into 4 b",
        },
        abilities: {
            q: ab(
                "Stretching Strikes",
                14,
                "Zac stretches an arm, grabbing an enemy. Attacking a different enemy will cause him to throw both targets towards each other.",
            ),
            w: ab(
                "Unstable Matter",
                5,
                "Zac explodes outward towards nearby enemies, dealing a percentage of their maximum health as magic damage.",
            ),
            e: ab(
                "Elastic Slingshot",
                21,
                "Zac attaches his arms to the ground and stretches back, launching himself forward.",
            ),
            r: ab("Let's Bounce!", 120, "Zac bounces four times, knocking up enemies hit and slowing them."),
        },
        items: [
            "plated_steelcaps",
            "dead_mans_plate",
            "steraks_gage",
            "sundered_sky",
            "deaths_dance",
            "guardian_angel",
        ],
        outfit: { base: 0x2ba547, hands: 0x2f21b3, backpack: 0x752c70 },
    },
    zed: {
        name: "Zed",
        title: "the Master of Shadows",
        health: 176,
        speedBonus: 0.5,
        gun: false,
        basic: { damage: 34, cooldown: 0.45 },
        passive: {
            name: "Contempt for the Weak",
            description:
                "Zed's basic attacks against low health targets deals bonus Magic Damage. This effect can only occur once every few seconds against the same enemy champion.",
        },
        abilities: {
            q: ab(
                "Razor Shuriken",
                6,
                "Zed and his shadows throw their shurikens.Each shuriken deals damage to every enemy hit.",
            ),
            w: ab(
                "Living Shadow",
                20,
                "Passive: Zed gains energy whenever he and his shadows strike an enemy with the same ability. Energy can only be gained once per cast ability.Active: Zed's shadow dashes forward, remaining in place for",
            ),
            e: ab(
                "Shadow Slash",
                5,
                "Zed and his Shadows slash, dealing damage to nearby enemies. Enemies hit by a Shadow's slash are slowed.",
            ),
            r: ab(
                "Death Mark",
                120,
                "Zed becomes untargetable and dashes to an enemy champion, marking them. After 3 seconds the mark triggers, repeating a portion of all the damage Zed dealt to the target while they were marked.",
            ),
        },
        items: [
            "youmuus_ghostblade",
            "plated_steelcaps",
            "the_collector",
            "infinity_edge",
            "lord_dominiks_regards",
            "bloodthirster",
        ],
        outfit: { base: 0xc969cb, hands: 0x163a69, backpack: 0x2fc4ce },
    },
    zeri: {
        name: "Zeri",
        title: "The Spark of Zaun",
        health: 162,
        speedBonus: 0,
        gun: true,
        basic: { damage: 31, cooldown: 0.5 },
        passive: {
            name: "Living Battery",
            description:
                "Zeri's Attacks deal magic damage and are treated as Abilities. Moving and casting Burst Fire stores up energy in Zeri's Sparkpack. When fully charged her next A",
        },
        abilities: {
            q: ab(
                "Burst Fire",
                0,
                "Burst Fire shoots a burst of 7 rounds that deal attack damage to the first enemy hit. This Ability is treated as an Attack.",
            ),
            w: ab(
                "Ultrashock Laser",
                12,
                "Zeri fires an electric pulse that slows and damages the first enemy hit. If the pulse hits a wall it expands into a long range laser.",
            ),
            e: ab(
                "Spark Surge",
                24,
                "Zeri dashes a short distance and energizes Burst Fire to pierce through enemies. She will vault and grind over any terrain she touches.",
            ),
            r: ab(
                "Lightning Crash",
                80,
                "Zeri discharges a nova of electricity and overcharges herself, gaining increased damage and stacking Move Speed that refreshes and gets stronger every time she hits an enemy champion. While overcharge",
            ),
        },
        items: [
            "hexoptics_c44",
            "berserkers_greaves",
            "runaans_hurricane",
            "infinity_edge",
            "lord_dominiks_regards",
            "guardian_angel",
        ],
        outfit: { base: 0x9a279a, hands: 0xac1a4e, backpack: 0x49ca66 },
    },
    ziggs: {
        name: "Ziggs",
        title: "the Hexplosives Expert",
        health: 164,
        speedBonus: 0,
        gun: true,
        basic: { damage: 30, cooldown: 0.65 },
        passive: {
            name: "Short Fuse",
            description:
                "Periodically, Ziggs' next basic attack deals bonus magic damage. This cooldown is reduced whenever Ziggs uses an ability.",
        },
        abilities: {
            q: ab("Bouncing Bomb", 6, "Ziggs throws a bouncing bomb that deals magic damage."),
            w: ab(
                "Satchel Charge",
                20,
                "Ziggs flings an explosive charge that detonates after a delay, or when this ability is activated again. The explosion deals magic damage to enemies, knocking them away. Ziggs is also knocked away, but",
            ),
            e: ab(
                "Hexplosive Minefield",
                16,
                "Ziggs scatters proximity mines that detonate on enemy contact, dealing magic damage and slowing. Successive mine detonations on the same target deal reduced damage.",
            ),
            r: ab(
                "Mega Inferno Bomb",
                120,
                "Ziggs deploys his ultimate creation, the Mega Inferno Bomb, hurling it an enormous distance. Enemies in the primary blast zone take more damage than those farther away.",
            ),
        },
        items: [
            "ludens_echo",
            "sorcerers_shoes",
            "stormsurge",
            "shadowflame",
            "rabadons_deathcap",
            "zhonyas_hourglass",
        ],
        outfit: { base: 0xa644d5, hands: 0x4871da, backpack: 0xac432a },
    },
    zilean: {
        name: "Zilean",
        title: "the Chronokeeper",
        health: 141,
        speedBonus: 0,
        gun: true,
        basic: { damage: 29, cooldown: 0.6 },
        passive: {
            name: "Time In A Bottle",
            description:
                "Zilean stores time as Experience and can grant it to his allies. When he has enough Experience to finish an ally's level up, he can right-click them to impart i",
        },
        abilities: {
            q: ab(
                "Time Bomb",
                10,
                "Tosses a bomb to target area that sticks to units that come near it (prioritizes Champions). It detonates after 3 seconds, dealing area of effect damage. If a Time Bomb is detonated early by another T",
            ),
            w: ab(
                "Rewind",
                14,
                "Zilean can prepare himself for future confrontations, reducing the cooldowns of his other basic abilities.",
            ),
            e: ab(
                "Time Warp",
                15,
                "Zilean bends time around any unit, decreasing an enemy's Move Speed or increasing an ally's Move Speed for a short time.",
            ),
            r: ab(
                "Chronoshift",
                120,
                "Zilean places a protective time rune on an allied champion, teleporting the champion back in time if they take lethal damage.",
            ),
        },
        items: [
            "ionian_boots_of_lucidity",
            "zhonyas_hourglass",
            "rabadons_deathcap",
            "malignance",
            "stormsurge",
            "shadowflame",
        ],
        outfit: { base: 0x1b1776, hands: 0xcb3ea3, backpack: 0x785bab },
    },
    zoe: {
        name: "Zoe",
        title: "the Aspect of Twilight",
        health: 170,
        speedBonus: 0,
        gun: true,
        basic: { damage: 32, cooldown: 0.65 },
        passive: {
            name: "More Sparkles!",
            description: "Zoe's next basic attack after casting a spell deals bonus magic damage.",
        },
        abilities: {
            q: ab(
                "Paddle Star!",
                8.5,
                "Zoe fires a missile that she can redirect in flight. Deals more damage the longer it flies in a straight line.",
            ),
            w: ab(
                "Spell Thief",
                0.25,
                "Zoe can pick up the remnants of enemy summoner spell and active item casts and cast them once herself. Whenever she casts a summoner spell, she gains 3 missiles that fire at the nearest target.",
            ),
            e: ab(
                "Sleepy Trouble Bubble",
                18,
                "Causes the target to become drowsy, then fall asleep. While asleep, the target's Magic Resist is reduced. The first source of damage that breaks the sleep is doubled, up to a cap.",
            ),
            r: ab("Portal Jump", 11, "Blink to a nearby position for 1 second. Then blink back."),
        },
        items: [
            "ludens_echo",
            "sorcerers_shoes",
            "stormsurge",
            "shadowflame",
            "rabadons_deathcap",
            "zhonyas_hourglass",
        ],
        outfit: { base: 0x27213e, hands: 0x622f42, backpack: 0x398da7 },
    },
    zyra: {
        name: "Zyra",
        title: "Rise of the Thorns",
        health: 141,
        speedBonus: 0,
        gun: true,
        basic: { damage: 29, cooldown: 0.65 },
        passive: {
            name: "Garden of Thorns",
            description:
                "Seeds spawn around Zyra periodically, becoming faster with level. Zyra can cast Deadly Spines or Grasping Roots near seeds to grow plants, who fight for Zyra.",
        },
        abilities: {
            q: ab(
                "Deadly Spines",
                7,
                "Thick vines spread through the ground and explode into spines, dealing magic damage to enemies within the area. If cast near a seed, Deadly Spines grows a Thorn Spitter plant, which fires at enemies f",
            ),
            w: ab(
                "Rampant Growth",
                0,
                "Zyra plants a seed, lasting up to 60 seconds. Deadly Spines and Grasping Roots cast near seeds will turn them into plants who fight for Zyra. Zyra can store multiple seeds at once, and killing enemies",
            ),
            e: ab(
                "Grasping Roots",
                11,
                "Zyra sends forth vines through the ground to ensnare her target, dealing damage and rooting enemies they come across. If cast near a seed, Grasping Roots grows a Vine Lasher, whose short range attacks",
            ),
            r: ab(
                "Stranglethorns",
                110,
                "Zyra summons a twisted thicket at her target location, dealing damage to enemies as it expands and knocking them airborne as it contracts. Plants within the thicket are enraged.",
            ),
        },
        items: [
            "ludens_echo",
            "sorcerers_shoes",
            "stormsurge",
            "shadowflame",
            "rabadons_deathcap",
            "zhonyas_hourglass",
        ],
        outfit: { base: 0x5b2d7f, hands: 0xaa8a18, backpack: 0x15a9b3 },
    },
};

/** each champion's own sounds (client/public/audio/champions/<champion>/<event>.ogg, from its Wwise events) */
export const ChampionSounds: Record<string, Partial<Record<AbilityKey | "basic" | "rockets" | "p", string>>> = {
    jinx: {
        q: "jinxq_onbuffactivate",
        w: "jinxw_oncast",
        e: "jinxe_oncast",
        r: "jinxr_oncast",
        basic: "jinxbasicattack_onmissilelaunch",
        rockets: "jinxqattack_onmissilelaunch",
        p: "jinxpassivekill_onbuffactivate",
    },
    caitlyn: {
        q: "caitlynq_oncast",
        w: "caitlynw_oncast",
        e: "caitlyne_oncast",
        r: "caitlynr_oncast",
        basic: "caitlynbasicattack_onmissilelaunch",
        p: "caitlynpassivemissile_onmissilelaunch",
    },
    ashe: {
        q: "asheqattack_onbuffcast",
        w: "volley_oncast",
        e: "ashespiritofthehawk_oncast",
        r: "enchantedcrystalarrow_oncast",
        basic: "ashebasicattack_onmissilelaunch",
    },
    ezreal: {
        q: "ezrealq_oncast",
        w: "ezrealw_oncast",
        e: "ezreale_oncast",
        r: "ezrealr_oncast",
        basic: "ezrealbasicattack_onmissilelaunch",
    },
    lux: {
        q: "luxlightbinding_oncast",
        w: "luxprismaticwave_oncast",
        e: "luxlightstrikekugel_oncast",
        r: "luxr_oncast",
        basic: "luxbasicattack_oncast",
    },
    ahri: {
        q: "ahriq_oncast",
        w: "ahriw_oncast",
        e: "ahrie_oncast",
        r: "ahrir_oncast",
        basic: "ahribasicattack_onmissilelaunch",
        p: "ahripassive_hit",
    },
    yasuo: {
        q: "yasuoq2_oncast",
        w: "yasuowmovingwall_oncast",
        e: "yasuodashwrapper_cast",
        r: "yasuordummyspell_oncast",
        basic: "yasuobasicattack_oncast",
        p: "yasuopassiveshield_onbuffactivate",
    },
    garen: {
        q: "garenq_oncast",
        w: "garenw_oncast",
        e: "garene_oncast",
        r: "garenr_oncast",
        basic: "garenbasicattack_oncast",
    },
    darius: {
        q: "dariuscleave_oncast",
        w: "dariusnoxiantacticsonhattack_onhit",
        e: "dariusaxegrabcone_oncast",
        r: "dariusexecute_oncast",
        basic: "dariusbasicattack_oncast",
    },
    masteryi: {
        q: "alphastrike_missilecast",
        w: "meditate_oncast",
        e: "wujustyle_oncast",
        r: "highlander_onbuffactivate",
        basic: "masteryibasicattack_oncast",
    },
    aatrox: {
        q: "aatroxq_oncast",
        w: "aatroxw_oncast",
        e: "aatroxe_oncast",
        r: "aatroxr_oncast",
        basic: "aatroxbasicattack_oncast",
    },
    akali: {
        q: "akaliq_oncast",
        e: "akalie_oncast",
        r: "akalir_oncast",
        basic: "akalibasicattack_oncast",
    },
    akshan: {
        q: "akshanq_oncast",
        w: "akshanw_oncast",
        e: "akshane_oncast",
        r: "akshanr_oncast",
        basic: "akshanbasicattack_onhit",
    },
    alistar: {
        basic: "alistarbasicattack_oncast",
    },
    ambessa: {
        w: "ambessaw_oncast",
        e: "ambessae_oncast",
        r: "ambessar_oncast",
        basic: "ambessabasicattack_oncast",
    },
    amumu: {
        basic: "amumubasicattack_oncast",
    },
    anivia: {
        basic: "aniviabasicattack_onmissilelaunch",
    },
    annie: {
        q: "annieq_oncast",
        w: "anniew_oncast",
        e: "anniee_oncast",
        r: "annier_oncast",
        basic: "anniebasicattack_onmissilelaunch",
    },
    aphelios: {
        r: "apheliosr_oncast",
    },
    aurelionsol: {
        q: "aurelionsolq_oncast",
        w: "aurelionsolw_oncast",
        e: "aurelionsole_oncast",
    },
    aurora: {
        q: "auroraq_oncast",
        w: "auroraw_oncast",
        e: "aurorae_oncast",
        r: "aurorar_oncast",
        basic: "aurorabasicattack_onmissilelaunch",
    },
    azir: {
        q: "azirq_oncast",
        basic: "azirbasicattack_oncast",
    },
    bard: {
        q: "bardq_oncast",
        e: "barde_oncast",
        r: "bardr_oncast",
        basic: "bardbasicattack_onmissilelaunch",
    },
    belveth: {
        w: "belvethw_oncast",
        e: "belvethe_oncast",
        r: "belvethr_oncast",
        basic: "belvethbasicattack_onhit",
    },
    blitzcrank: {
        basic: "blitzcrankbasicattack_oncast",
    },
    brand: {
        q: "brandq_oncast",
        w: "brandw_oncast",
        e: "brande_oncast",
        r: "brandr_oncast",
        basic: "brandbasicattack_onmissilelaunch",
    },
    braum: {
        q: "braumq_oncast",
        e: "braume_oncast",
        r: "braumrmissile_onmissilelaunch",
        basic: "braumbasicattack_oncast",
    },
    briar: {
        q: "briarq_oncast",
        w: "briarw_oncast",
        e: "briare_oncast",
        r: "briarr_oncast",
        basic: "briarbasicattack_oncast",
    },
    camille: {
        q: "camilleq_oncast",
        w: "camillew_oncast",
        basic: "camillebasicattack_oncast",
    },
    cassiopeia: {
        q: "cassiopeiaq_oncast",
        w: "cassiopeiaw_oncast",
        e: "cassiopeiae_oncast",
        basic: "cassiopeiabasicattack_onmissilelaunch",
    },
    chogath: {
        e: "chogatheattack_oncast",
        basic: "chogathbasicattack_oncast",
    },
    corki: {
        basic: "corkibasicattack_onmissilelaunch",
    },
    diana: {
        q: "dianaq_oncast",
        r: "dianar_oncast",
        basic: "dianabasicattack_oncast",
        p: "dianapassive_hit",
    },
    drmundo: {
        q: "drmundoq_oncast",
        w: "drmundow_oncast",
        e: "drmundoe_oncast",
        r: "drmundor_oncast",
        basic: "drmundobasicattack_oncast",
    },
    draven: {
        basic: "dravenbasicattack_oncast",
    },
    ekko: {
        q: "ekkoq_oncast",
        w: "ekkow_oncast",
        e: "ekkoe_oncast",
        r: "ekkor_oncast",
        basic: "ekkobasicattack_oncast",
        p: "ekkopassive_hit",
    },
    elise: {
        r: "eliser_oncast",
        basic: "elisebasicattack_onmissilelaunch",
    },
    evelynn: {
        q: "evelynnq_oncast",
        w: "evelynnw_oncast",
        e: "evelynne_oncast",
        r: "evelynnr_oncast",
        basic: "evelynnbasicattack_oncast",
    },
    fiddlesticks: {
        q: "fiddlesticksq_oncast",
        e: "fiddlestickse_oncast",
        r: "fiddlesticksr_oncast",
        basic: "fiddlesticksbasicattack_onmissilelaunch",
        p: "fiddlestickspassive_onbuffactivate",
    },
    fiora: {
        q: "fioraq_oncast",
        w: "fioraw_oncast",
        e: "fiorae_oncast",
        basic: "fiorabasicattack_oncast",
    },
    fizz: {
        w: "fizzw_oncast",
        r: "fizzr_oncast",
        basic: "fizzbasicattack_oncast",
    },
    galio: {
        q: "galioq_oncast",
        w: "galiow_oncast",
        e: "galioe_oncast",
        r: "galior_oncast",
        basic: "galiobasicattack_oncast",
        p: "galiopassivebuff_onbuffactivate",
    },
    gangplank: {
        w: "gangplankw_oncast",
        e: "gangplanke_oncast",
        r: "gangplankr_oncast",
        basic: "gangplankbasicattack_oncast",
    },
    gnar: {
        q: "gnarq_oncast",
        w: "gnarwbuff_onbuffactivate",
        e: "gnare_oncast",
        r: "gnarr_oncast",
        basic: "gnarbasicattack_onmissilelaunch",
    },
    gragas: {
        q: "gragasq_oncast",
        w: "gragasw_oncast",
        e: "gragase_oncast",
        r: "gragasr_oncast",
        basic: "gragasbasicattack_oncast",
    },
    graves: {
        basic: "gravesbasicattack_onmissilelaunch",
    },
    gwen: {
        q: "gwenq_oncast",
        e: "gwene_oncast",
        r: "gwenr_oncast",
    },
    hecarim: {
        w: "hecarimw_oncast",
        basic: "hecarimbasicattack_oncast",
    },
    heimerdinger: {
        q: "heimerdingerq_oncast",
        w: "heimerdingerw_oncast",
        e: "heimerdingere_oncast",
        r: "heimerdingerr_onbuffactivate",
        basic: "heimerdingerbasicattack_onmissilelaunch",
    },
    hwei: {
        r: "hweir_oncast",
        basic: "hweibasicattack_onmissilelaunch",
    },
    illaoi: {
        q: "illaoiq_oncast",
        w: "illaoiw_oncast",
        e: "illaoie_oncast",
        r: "illaoir_onbuffactivate",
        basic: "illaoibasicattack_oncast",
    },
    irelia: {
        q: "ireliaq_oncast",
        w: "ireliaw_oncast",
        e: "ireliaemissile_onmissilelaunch",
        r: "ireliar_oncast",
        basic: "ireliabasicattack_oncast",
    },
    ivern: {
        q: "ivernq_oncast",
        e: "iverne_oncast",
        r: "ivernr_oncast",
        basic: "ivernbasicattack_onhit",
    },
    janna: {
        basic: "jannabasicattack_onmissilelaunch",
    },
    jarvaniv: {
        basic: "jarvanivbasicattack_oncast",
    },
    jax: {
        w: "jaxw_oncast",
        e: "jaxe_onbuffactivate",
        r: "jaxr_oncast",
        basic: "jaxbasicattack_oncast",
    },
    jayce: {
        basic: "jaycebasicattack_oncast",
    },
    jhin: {
        q: "jhinq_oncast",
        w: "jhinw_oncast",
        e: "jhine_oncast",
        r: "jhinr_oncast",
        basic: "jhinbasicattack_onmissilelaunch",
    },
    ksante: {
        w: "ksantew_oncast",
        basic: "ksantebasicattack_oncast",
    },
    kaisa: {
        q: "kaisaq_oncast",
        w: "kaisaw_oncast",
        e: "kaisae_oncast",
        r: "kaisar_oncast",
        basic: "kaisabasicattack_onmissilelaunch",
    },
    kalista: {
        w: "kalistaw_oncast",
        basic: "kalistabasicattack_onmissilelaunch",
    },
    karma: {
        q: "karmaq_oncast",
        basic: "karmabasicattack_onmissilelaunch",
    },
    karthus: {
        basic: "karthusbasicattack_onmissilelaunch",
    },
    kassadin: {
        basic: "kassadinbasicattack_oncast",
    },
    katarina: {
        q: "katarinaq_oncast",
        w: "katarinaw_oncast",
        e: "katarinae_oncast",
        r: "katarinar_oncast",
        basic: "katarinabasicattack_oncast",
    },
    kayle: {
        q: "kayleq_oncast",
        e: "kaylee_oncast",
        r: "kayler_oncast",
        basic: "kaylebasicattack_oncast",
    },
    kayn: {
        q: "kaynq_oncast",
        w: "kaynw_oncast",
        e: "kayne_onbuffactivate",
        basic: "kaynbasicattack_oncast",
    },
    kennen: {
        basic: "kennenbasicattack_onmissilelaunch",
    },
    khazix: {
        q: "khazixq_oncast",
        w: "khazixw_oncast",
        e: "khazixe_oncast",
        r: "khazixr_oncast",
        basic: "khazixbasicattack_oncast",
    },
    kindred: {
        q: "kindredq_oncast",
        w: "kindredw_oncast",
        e: "kindrede_oncast",
        basic: "kindredbasicattack_onmissilelaunch",
    },
    kled: {
        q: "kledq_oncast",
        basic: "kledbasicattack_oncast",
    },
    kogmaw: {
        q: "kogmawq_oncast",
        basic: "kogmawbasicattack_onmissilelaunch",
    },
    leblanc: {
        q: "leblancq_oncast",
        e: "leblance_oncast",
        basic: "leblancbasicattack_onmissilelaunch",
    },
    leesin: {
        r: "leesinr_oncast",
        basic: "leesinbasicattack_oncast",
    },
    leona: {
        basic: "leonabasicattack_oncast",
    },
    lillia: {
        q: "lilliaq_oncast",
        w: "lilliaw_oncast",
        e: "lilliae_oncast",
        r: "lilliar_oncast",
    },
    lissandra: {
        q: "lissandraq_oncast",
        e: "lissandrae_oncast",
        basic: "lissandrabasicattack_onmissilelaunch",
    },
    locke: {
        q: "lockeqmissile_onmissilelaunch",
        w: "lockew_onbuffactivate",
        r: "locker_oncast",
        basic: "lockebasicattack_oncast",
    },
    lucian: {
        q: "lucianq_oncast",
        w: "lucianw_oncast",
        e: "luciane_oncast",
        r: "lucianr_oncast",
        basic: "lucianbasicattack_onmissilelaunch",
    },
    lulu: {
        q: "luluq_oncast",
        w: "luluw_oncast",
        r: "lulur_oncast",
        basic: "lulubasicattack_onmissilelaunch",
    },
    malphite: {
        basic: "malphitebasicattack_oncast",
    },
    malzahar: {
        q: "malzaharq_oncast",
        e: "malzahare_oncast",
        r: "malzaharr_onbuffactivate",
        basic: "malzaharbasicattack_onmissilelaunch",
    },
    maokai: {
        q: "maokaiq_oncast",
        w: "maokaiw_oncast",
        e: "maokaie_oncast",
        r: "maokair_oncast",
        basic: "maokaibasicattack_oncast",
    },
    mel: {
        q: "melq_oncast",
        w: "melw_oncast",
        e: "mele_oncast",
        r: "melr_oncast",
        basic: "melbasicattack_onmissilelaunch",
    },
    milio: {
        q: "milioq_oncast",
        r: "milior_oncast",
        basic: "miliobasicattack_onmissilelaunch",
    },
    missfortune: {
        basic: "missfortunebasicattack_onmissilelaunch",
    },
    monkeyking: {
        basic: "monkeykingbasicattack_oncast",
    },
    mordekaiser: {
        q: "mordekaiserq_oncast",
        e: "mordekaisere_oncast",
        r: "mordekaiserr_oncast",
        basic: "mordekaiserbasicattack_oncast",
    },
    morgana: {
        q: "morganaq_oncast",
        e: "morganae_onbuffactivate",
        basic: "morganabasicattack_onmissilelaunch",
    },
    naafiri: {
        q: "naafiriq_oncast",
        e: "naafirie_oncast",
        basic: "naafiribasicattack_oncast",
    },
    nami: {
        q: "namiq_oncast",
        w: "namiw_oncast",
        e: "namie_onbuffactivate",
        r: "namir_oncast",
        basic: "namibasicattack_onmissilelaunch",
    },
    nasus: {
        q: "nasusq_oncast",
        w: "nasusw_oncast",
        r: "nasusr_oncast",
        basic: "nasusbasicattack_oncast",
    },
    nautilus: {
        basic: "nautilusbasicattack_oncast",
    },
    neeko: {
        q: "neekoq_oncast",
        e: "neekoe_oncast",
        basic: "neekobasicattack_onmissilelaunch",
    },
    nidalee: {
        basic: "nidaleebasicattack_onmissilelaunch",
    },
    nilah: {
        q: "nilahq_oncast",
        e: "nilahe_oncast",
        r: "nilahr_oncast",
        basic: "nilahbasicattack_oncast",
    },
    nocturne: {
        basic: "nocturnebasicattack_oncast",
    },
    nunu: {
        q: "nunuq_oncast",
        w: "nunuw_oncast",
        e: "nunue_oncast",
        r: "nunur_oncast",
        basic: "nunubasicattack_oncast",
    },
    olaf: {
        q: "olafq_oncast",
        w: "olafw_oncast",
        e: "olafe_oncast",
        r: "olafr_oncast",
        basic: "olafbasicattack_oncast",
    },
    orianna: {
        basic: "oriannabasicattack_onmissilelaunch",
    },
    ornn: {
        q: "ornnq_oncast",
        w: "ornnw_oncast",
        e: "ornne_oncast",
        basic: "ornnbasicattack_oncast",
    },
    pantheon: {
        q: "pantheonq_oncast",
        w: "pantheonw_oncast",
        e: "pantheone_oncast",
        r: "pantheonr_oncast",
        basic: "pantheonbasicattack_oncast",
    },
    poppy: {
        w: "poppyw_oncast",
        e: "poppye_oncast",
        r: "poppyr_oncast",
        basic: "poppybasicattack_oncast",
        p: "poppypassivebuff_onbuffactivate",
    },
    pyke: {
        q: "pykeq_oncast",
        e: "pykee_oncast",
        basic: "pykebasicattack_oncast",
    },
    qiyana: {
        q: "qiyanaq_oncast",
        e: "qiyanae_oncast",
        r: "qiyanar_oncast",
        basic: "qiyanabasicattack_oncast",
    },
    quinn: {
        q: "quinnq_oncast",
        w: "quinnw_oncast",
        e: "quinne_oncast",
        r: "quinnr_oncast",
        basic: "quinnbasicattack_onmissilelaunch",
    },
    rakan: {
        w: "rakanw_oncast",
        r: "rakanr_oncast",
        basic: "rakanbasicattack_oncast",
        p: "rakanpassiveready_buffactivate",
    },
    rammus: {
        basic: "rammusbasicattack_oncast",
    },
    reksai: {
        q: "reksaiq_oncast",
        e: "reksaie_oncast",
        r: "reksair_oncast",
        basic: "reksaibasicattack_oncast",
    },
    rell: {
        q: "rellq_oncast",
        e: "relle_oncast",
        r: "rellr_oncast",
        basic: "rellbasicattack_oncast",
    },
    renata: {
        q: "renataq_oncast",
        w: "renataw_oncast",
        e: "renatae_oncast",
        r: "renatar_oncast",
        basic: "renatabasicattack_oncast",
        p: "renatapassive_hit",
    },
    renekton: {
        basic: "renektonbasicattack_oncast",
    },
    rengar: {
        q: "rengarq_oncast",
        w: "rengarw_oncast",
        e: "rengare_oncast",
        r: "rengarr_oncast",
        basic: "rengarbasicattack_oncast",
    },
    riven: {
        basic: "rivenbasicattack_oncast",
    },
    rumble: {
        q: "rumbleq_oncast",
        w: "rumblew_oncast",
        e: "rumblee_oncast",
        r: "rumbler_oncast",
        basic: "rumblebasicattack_oncast",
    },
    ryze: {
        q: "ryzeq_oncast",
        w: "ryzew_oncast",
        e: "ryzee_oncast",
        basic: "ryzebasicattack_onmissilelaunch",
    },
    samira: {
        w: "samiraw_oncast",
        r: "samirar_oncast",
        basic: "samirabasicattack_onmissilelaunch",
    },
    sejuani: {
        q: "sejuaniq_oncast",
        w: "sejuaniw_oncast",
        r: "sejuanir_oncast",
        basic: "sejuanibasicattack_oncast",
    },
    senna: {
        q: "sennaq_oncast",
        w: "sennaw_oncast",
        e: "sennae_oncast",
        r: "sennar_oncast",
        basic: "sennabasicattack_oncast",
    },
    seraphine: {
        q: "seraphineq_oncast",
        w: "seraphinew_oncast",
        e: "seraphinee_oncast",
        r: "seraphiner_oncast",
        basic: "seraphinebasicattack_onmissilelaunch",
    },
    sett: {
        q: "settq_onbuffactivate",
        basic: "settbasicattack_onhit",
    },
    shaco: {
        basic: "shacobasicattack_oncast",
    },
    shen: {
        q: "shenq_oncast",
        w: "shenw_oncast",
        e: "shene_oncast",
        r: "shenr_oncast",
        basic: "shenbasicattack_oncast",
    },
    shyvana: {
        e: "shyvanae_oncast",
        basic: "shyvanabasicattack_oncast",
    },
    singed: {
        basic: "singedbasicattack_oncast",
    },
    sion: {
        q: "sionq_onbuffactivate",
        e: "sione_oncast",
        basic: "sionbasicattack_oncast",
    },
    sivir: {
        q: "sivirq_oncast",
        w: "sivirw_oncast",
        e: "sivire_onbuffactivate",
        r: "sivirr_oncast",
        basic: "sivirbasicattack_onmissilelaunch",
    },
    skarner: {
        q: "skarnerq_oncast",
        w: "skarnerw_oncast",
        basic: "skarnerbasicattack_oncast",
    },
    smolder: {
        q: "smolderq_oncast",
        w: "smolderw_oncast",
        e: "smoldere_oncast",
        r: "smolderr_oncast",
        basic: "smolderbasicattack_onmissilelaunch",
    },
    sona: {
        q: "sonaq_oncast",
        w: "sonaw_oncast",
        e: "sonae_oncast",
        r: "sonar_oncast",
        basic: "sonabasicattack_onmissilelaunch",
    },
    soraka: {
        q: "sorakaq_oncast",
        w: "sorakaw_oncast",
        e: "sorakae_oncast",
        r: "sorakar_oncast",
        basic: "sorakabasicattack_onmissilelaunch",
        p: "sorakapassive_onbuffactivate",
    },
    swain: {
        q: "swainq_oncast",
        e: "swaine_oncast",
        r: "swainr_oncast",
        basic: "swainbasicattack_onmissilelaunch",
    },
    sylas: {
        q: "sylasq_oncast",
        w: "sylasw_oncast",
        e: "sylase_oncast",
        r: "sylasr_oncast",
        basic: "sylasbasicattack_oncast",
    },
    syndra: {
        w: "syndraw_onbuffactivate",
        e: "syndrae_oncast",
        r: "syndrar_oncast",
        basic: "syndrabasicattack_onmissilelaunch",
    },
    tahmkench: {
        q: "tahmkenchq_oncast",
        w: "tahmkenchw_oncast",
        basic: "tahmkenchbasicattack_oncast",
    },
    taliyah: {
        r: "taliyahr_oncast",
        basic: "taliyahbasicattack_onmissilelaunch",
    },
    talon: {
        w: "talonw_oncast",
        r: "talonr_oncast",
        basic: "talonbasicattack_oncast",
        p: "talonpassive_hit",
    },
    taric: {
        q: "taricq_oncast",
        r: "taricr_oncast",
        basic: "taricbasicattack_oncast",
    },
    teemo: {
        q: "teemoq_oncast",
        w: "teemow_oncast",
        e: "teemoeattack_oncast",
        r: "teemor_oncast",
        basic: "teemobasicattack_onmissilelaunch",
    },
    thresh: {
        q: "threshq_oncast",
        e: "threshe_oncast",
        basic: "threshbasicattack_oncast",
    },
    tristana: {
        q: "tristanaq_oncast",
        w: "tristanaw_oncast",
        e: "tristanae_oncast",
        r: "tristanar_oncast",
        basic: "tristanabasicattack_onmissilelaunch",
    },
    trundle: {
        q: "trundleq_oncast",
        basic: "trundlebasicattack_oncast",
    },
    tryndamere: {
        q: "tryndamereq_oncast",
        w: "tryndamerew_oncast",
        e: "tryndameree_oncast",
        basic: "tryndamerebasicattack_oncast",
    },
    twistedfate: {
        basic: "twistedfatebasicattack_onmissilelaunch",
    },
    twitch: {
        basic: "twitchbasicattack_onmissilelaunch",
    },
    udyr: {
        e: "udyreattack_oncast",
        basic: "udyrbasicattack_oncast",
    },
    urgot: {
        q: "urgotq_oncast",
        w: "urgotw_oncast",
        e: "urgote_oncast",
        r: "urgotr_oncast",
        basic: "urgotbasicattack_onmissilelaunch",
    },
    varus: {
        q: "varusq_oncast",
        w: "varusw_oncast",
        e: "varuse_oncast",
        r: "varusr_oncast",
        basic: "varusbasicattack_onmissilelaunch",
    },
    vayne: {
        basic: "vaynebasicattack_onmissilelaunch",
    },
    veigar: {
        r: "veigarr_oncast",
        basic: "veigarbasicattack_onmissilelaunch",
    },
    velkoz: {
        w: "velkozw_oncast",
        e: "velkoze_oncast",
        r: "velkozr_oncast",
        basic: "velkozbasicattack_oncast",
    },
    vex: {
        q: "vexq_oncast",
        e: "vexe_oncast",
        r: "vexr_oncast",
        basic: "vexbasicattack_oncast",
    },
    vi: {
        q: "viq_oncast",
        e: "vie_oncast",
        r: "vir_oncast",
        basic: "vibasicattack_oncast",
        p: "vipassivebuff_onbuffactivate",
    },
    viego: {
        q: "viegoq_oncast",
        e: "viegoe_oncast",
        basic: "viegobasicattack_oncast",
    },
    viktor: {
        q: "viktorq_oncast",
        w: "viktorw_oncast",
        e: "viktore_oncast",
        r: "viktorr_oncast",
        basic: "viktorbasicattack_oncast",
    },
    vladimir: {
        q: "vladimirq_oncast",
        e: "vladimire_oncast",
        basic: "vladimirbasicattack_onmissilelaunch",
    },
    volibear: {
        q: "volibearq_oncast",
        r: "volibearr_onbuffactivate",
        basic: "volibearbasicattack_oncast",
    },
    warwick: {
        q: "warwickq_oncast",
        e: "warwicke_oncast",
        r: "warwickr_oncast",
        basic: "warwickbasicattack_oncast",
    },
    xayah: {
        q: "xayahq_oncast",
        w: "xayahw_oncast",
        r: "xayahr_oncast",
        basic: "xayahbasicattack_onmissilelaunch",
    },
    xerath: {
        basic: "xerathbasicattack_onmissilelaunch",
    },
    xinzhao: {
        q: "xinzhaoq_oncast",
        w: "xinzhaow_oncast",
        r: "xinzhaor_oncast",
        basic: "xinzhaobasicattack_oncast",
    },
    yone: {
        q: "yoneq_oncast",
        w: "yonew_oncast",
        r: "yoner_oncast",
        basic: "yonebasicattack_oncast",
    },
    yorick: {
        q: "yorickq_oncast",
        w: "yorickw_oncast",
        e: "yoricke_oncast",
        r: "yorickr_oncast",
        basic: "yorickbasicattack_oncast",
    },
    yunara: {
        w: "yunaraw_oncast",
        r: "yunarar_onbuffactivate",
        basic: "yunarabasicattack_onmissilelaunch",
    },
    yuumi: {
        q: "yuumiq_oncast",
        r: "yuumir_oncast",
        basic: "yuumibasicattack_oncast",
    },
    zaahen: {
        q: "zaahenq_oncast",
        w: "zaahenw_oncast",
        e: "zaahene_oncast",
        r: "zaahenr_oncast",
        basic: "zaahenbasicattack_oncast",
    },
    zac: {
        q: "zacq_oncast",
        w: "zacw_oncast",
        e: "zace_oncast",
        r: "zacr_oncast",
        basic: "zacbasicattack_oncast",
    },
    zed: {
        q: "zedq_oncast",
        e: "zede_oncast",
        r: "zedr_oncast",
        basic: "zedbasicattack_oncast",
    },
    zeri: {
        q: "zeriq_oncast",
        w: "zeriw_oncast",
        r: "zerir_oncast",
        basic: "zeribasicattack_oncast",
        p: "zeripassive_hit",
    },
    ziggs: {
        q: "ziggsq_oncast",
        w: "ziggsw_oncast",
        e: "ziggse_oncast",
        r: "ziggsr_oncast",
        basic: "ziggsbasicattack_onmissilelaunch",
    },
    zilean: {
        q: "zileanq_oncast",
        basic: "zileanbasicattack_onmissilelaunch",
    },
    zoe: {
        q: "zoeq_oncast",
        e: "zoee_oncast",
        r: "zoer_oncast",
        basic: "zoebasicattack_onmissilelaunch",
    },
    zyra: {
        q: "zyraq_oncast",
        w: "zyraw_oncast",
        e: "zyrae_oncast",
        r: "zyrar_oncast",
        basic: "zyrabasicattack_onmissilelaunch",
    },
};

/** sound name for a champion's sound slot, as registered in the client's soundDefs */
export function championSound(champion: string, slot: string) {
    return `champ_${champion}_${slot}`;
}

export const ChampionIds = Object.keys(ChampionDefs);

/** championIndex is 9 bits on the wire (objectSerializeFns.ts), so 511 ids is the limit */
if (ChampionIds.length > 511) {
    throw new Error(`too many champions for the 9 bit championIndex field: ${ChampionIds.length}`);
}

/** the champion index sent to clients: 0 none, else 1 + its place in ChampionIds */
export function championIndex(kit: string) {
    return ChampionIds.indexOf(kit) + 1;
}
