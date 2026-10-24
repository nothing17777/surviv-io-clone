import $ from "jquery";
import { CustomGuns, CustomMelees } from "../../../shared/defs/gameObjects/customWeaponDefs.ts";
import { SwingShots } from "../../../shared/defs/gameObjects/customWeaponEffects.ts";
import { GameObjectDefs } from "../../../shared/defs/register.ts";

/** what each effect does, in a sentence */
const GunEffectText: Record<string, string> = {
    plain: "Fires regular bullets.",
    laser: "Instant laser beam that goes through players and walls.",
    rail: "Instant heavy beam through everything, 1.6x damage.",
    prism: "Six rainbow beams that close into one beam doing 3x damage after 3 s of firing.",
    minigun: "Minigun: starts slow and spins up to full fire rate.",
    sniper_pierce: "Shots go through players, losing 25% damage on each.",
    shock: "Slow electric orbs that blow up in a shock.",
    flame: "Short range stream of fire.",
    frost: "Freezes whoever it hits for a moment.",
    poison: "Toxic splash that slows.",
    magic: "Slow shots that curve onto enemies.",
    void: "Exploding dark matter orbs that leave a damaging vortex.",
    arrow: "Slow, heavy arrows.",
    bubble: "Slow water shots.",
    rocket: "Rocket that blows up like a frag. One shot per reload.",
    nanobots: "Nanobot swarms that home in on enemies and burst.",
};

/** what each sword does beyond its swing */
const SwordText: Record<string, string> = {
    tr_terra_blade: "Fires a big curved green wave that cuts through enemies and stops at walls.",
    tr_night_s_edge: "Wide purple aura swing.",
    tr_excalibur: "Huge golden aura swing, twice the blade's reach.",
    tr_meowmere: "Throws a rainbow cat that bounces 4 times, blowing up bigger each bounce.",
    tr_star_wrath: "Calls three stars down onto your cursor.",
    tr_zenith: "Sends spinning swords out to your cursor and back.",
};

/** per weapon notes from its wiki page, where the effect alone doesn't say it */
const Notes: Record<string, string> = {
    pg_ultimatum: "Shotgun pellets go through walls and enemies. Never reloads.",
    pg_double_barreled_shotgun: "Two big blasts, then reload.",
    pg_napalmcannon: "Rocket that leaves fire burning for 3 s.",
    tr_sdmg: "Insanely fast, glowing shots.",
};

interface Card {
    id: string;
    name: string;
    game: string;
    desc: string;
    stats: string;
}

function round(n: number, places = 0) {
    const m = 10 ** places;
    return Math.round(n * m) / m;
}

function cards(): Card[] {
    const out: Card[] = [];
    for (const [id, name, game, , effect] of CustomGuns) {
        const def = GameObjectDefs.typeToDef(id, "gun");
        const bullet = GameObjectDefs.typeToDef(def.bulletType, "bullet");
        const dmg = def.bulletCount > 1 ? `${round(bullet.damage)} x${def.bulletCount}` : `${round(bullet.damage)}`;
        out.push({
            id,
            name,
            game,
            desc: [GunEffectText[effect] ?? "", Notes[id] ?? ""].filter(Boolean).join(" "),
            stats: `Gun - ${dmg} dmg - ${round(1 / def.fireDelay, 1)}/s - ${def.maxClip} clip - range ${round(bullet.distance)}`,
        });
    }
    for (const [id, name, game] of CustomMelees) {
        const def = GameObjectDefs.typeToDef(id, "melee");
        out.push({
            id,
            name,
            game,
            desc: SwordText[id] ?? (SwingShots[id] ? "Fires a projectile each swing." : "Swings hard and wide."),
            stats: `Melee - ${def.damage} dmg - ${round(def.attack.cooldownTime, 2)} s/swing`,
        });
    }
    return out;
}

/** The catalog of Terraria and Pixel Gun 3D weapons, opened from the icon next to the Armory. */
export function initCrossoverCatalog() {
    const modal = $("#modal-crossover");
    if (!modal.length) return;
    const all = cards();
    let game = "";

    function render() {
        const q = (($("#crossover-search").val() as string) || "").toLowerCase();
        const shown = all.filter((c) => (!game || c.game === game) && (!q || c.name.toLowerCase().includes(q)));
        const grid = $("#crossover-grid").empty();
        for (const c of shown) {
            const def = GameObjectDefs.typeToDef(c.id) as { lootImg: { sprite: string } };
            grid.append(
                $("<div>", { class: "crossover-card" }).append(
                    $("<img>", { src: def.lootImg.sprite, alt: "" }),
                    $("<div>").append(
                        $("<div>", { class: "crossover-name", text: c.name }),
                        $("<div>", { class: "crossover-game", text: c.game }),
                        $("<div>", { class: "crossover-desc", text: c.desc }),
                        $("<div>", { class: "crossover-stats", text: c.stats }),
                    ),
                ),
            );
        }
        $("#crossover-count").text(`${shown.length} weapons`);
    }

    $("#crossover-controls").on("click", ".armory-tab", (e) => {
        $("#crossover-controls .armory-tab").removeClass("armory-tab-selected");
        $(e.currentTarget).addClass("armory-tab-selected");
        game = $(e.currentTarget).data("game") || "";
        render();
    });
    $("#crossover-search").on("input", render);
    render();
}
