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

const ab = (name: string, cooldown: number, description: string): AbilityDef => ({ name, cooldown, description });

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
};

/** sound name for a champion's sound slot, as registered in the client's soundDefs */
export function championSound(champion: string, slot: string) {
    return `champ_${champion}_${slot}`;
}

export const ChampionIds = Object.keys(ChampionDefs);

/** the champion index sent to clients: 0 none, else 1 + its place in ChampionIds */
export function championIndex(kit: string) {
    return ChampionIds.indexOf(kit) + 1;
}
