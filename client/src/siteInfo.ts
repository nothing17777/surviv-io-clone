import $ from "jquery";
import { type MapDefKey, MapDefs } from "../../shared/defs/mapDefs.ts";
import { GameConfig } from "../../shared/gameConfig.ts";
import type { SiteInfoRes } from "../../shared/types/api.ts";
import { api } from "./api.ts";
import type { ConfigManager } from "./config.ts";
import { device } from "./device.ts";
import type { Localization } from "./ui/localization.ts";
import { type BotLevel, BotLevels } from "../../shared/types/api.ts";
import { fillMapSelect, getModeMaps, isDuelMap, isGodLoadoutMap, modeLabel } from "./ui/modePicker.ts";

/** value of the "Duel (Bots)" entry in the main menu map dropdown */
export const BotDuelOption = "__bot_duel";
/** Duel (Bots) map picker value that asks for a map maker file */
export const BotDuelCustomMap = "__custom";

export class SiteInfo {
    info = {} as SiteInfoRes;
    loaded = false;

    constructor(
        public config: ConfigManager,
        public localization: Localization,
    ) {
    }

    load() {
        const locale = this.localization.getLocale();

        const mainSelector = $("#server-opts");
        const teamSelector = $("#team-server-opts");

        for (const region in GAME_REGIONS) {
            const data = GAME_REGIONS[region];
            const name = this.localization.translate(data.l10n);
            const elm = `<option value='${region}' data-l10n='${data.l10n}' data-label='${name}'>${name}</option>`;
            mainSelector.append(elm);
            teamSelector.append(elm);
        }

        const siteInfoUrl = api.resolveUrl(`/api/site_info?language=${locale}`);
        fetch(siteInfoUrl).then(res => res.json()).then((data: SiteInfoRes) => {
            this.info = data || {};
            this.loaded = true;
            this.updatePageFromInfo();
        });
    }

    getGameModeStyles() {
        const availableModes = [];
        const modes = this.info.modes || [];
        for (let i = 0; i < modes.length; i++) {
            const mode = modes[i];
            const mapDef = (MapDefs[mode.mapName as MapDefKey] || MapDefs.main)
                .desc;
            const buttonText = mapDef.buttonText
                ? mapDef.buttonText
                : GameConfig.TeamModeToString[mode.teamMode];
            availableModes.push({
                icon: mapDef.icon,
                buttonCss: mapDef.buttonCss,
                buttonText,
                enabled: mode.enabled,
            });
        }
        return availableModes;
    }

    /** map picked in the main menu map dropdown */
    selectedMap = "";

    /**
     * Builds one play button per mode (btn-start-mode-<modeIdx>), shown only
     * for the map picked in #mode-map-select.
     */
    renderModeButtons() {
        const modes = this.info.modes || [];
        const maps = getModeMaps(modes);
        // "Duel (Bots)": not a server mode, it starts a private Vs Bots match
        const botDuelMap = maps.find((m) => isDuelMap(m));
        if (botDuelMap) maps.unshift(BotDuelOption);
        if (!maps.includes(this.selectedMap)) {
            let saved = "";
            try {
                saved = localStorage.getItem("survev_mode_map") || "";
            } catch {}
            this.selectedMap = maps.includes(saved) ? saved : maps[0] || "main";
        }


        const select = $("#mode-map-select");
        fillMapSelect(select, maps, this.selectedMap);
        select.find(`option[value="${BotDuelOption}"]`).text("Duel (Bots)");
        select.off("change").on("change", () => {
            this.selectedMap = select.val() as string;
            try {
                localStorage.setItem("survev_mode_map", this.selectedMap);
            } catch {}
            this.renderModeButtons();
        });

        const container = $("#btns-quick-start");
        container.empty();
        if (this.selectedMap === BotDuelOption) {
            this.renderBotDuel(container, botDuelMap!, maps.filter((m) => m !== BotDuelOption));
            this.showLoadout("botDuel");
            return;
        }
        for (let i = 0; i < modes.length; i++) {
            const mode = modes[i];
            if (!mode.enabled || mode.mapName !== this.selectedMap) continue;
            const label = `Play ${modeLabel(mode)}`;
            const btn = $("<a>", {
                id: `btn-start-mode-${i}`,
                class: "btn-green btn-darken menu-option btn-start-mode",
                text: label,
            });
            btn.attr("data-label", label);
            btn.attr("data-mode-idx", i);
            container.append(btn);
        }

        this.showLoadout(isGodLoadoutMap(this.selectedMap) ? "god" : "locked");
    }

    /** left panel: your picks or the locked spawn kit; Duel (Bots) adds the bots' panel on the right */
    showLoadout(kind: "god" | "botDuel" | "locked") {
        $("#god-loadout-picker").toggle(kind !== "locked");
        $("#bot-loadout-column").toggle(kind === "botDuel");
        $("#you-counts").toggle(kind === "botDuel");
        $("#locked-loadout").toggle(kind === "locked");
    }

    /** opponent / teammate level pickers and Play 1v1-4v4 for Duel (Bots) */
    renderBotDuel(container: JQuery<HTMLElement>, defaultMap: string, maps: string[]) {
        // any map works: two sides on it, bots on the other side
        let savedMap = "";
        try {
            savedMap = localStorage.getItem("survev_bot-duel-map") || "";
        } catch {}
        const mapSel = $("<select>", {
            id: "bot-duel-map",
            class: "server-select menu-option btn-hollow btn-hollow-selected",
        });
        fillMapSelect(mapSel, maps, maps.includes(savedMap) ? savedMap : defaultMap);
        mapSel.find("option").each((_i, o) => {
            $(o).text(`Map: ${$(o).text()}`);
        });
        // a map file from the map maker, picked when Play is pressed
        mapSel.append($("<option>", { value: BotDuelCustomMap, text: "Map: Custom map (upload)" }));
        if (savedMap === BotDuelCustomMap) mapSel.val(BotDuelCustomMap);
        mapSel.on("change", () => {
            try {
                localStorage.setItem("survev_bot-duel-map", mapSel.val() as string);
            } catch {}
        });
        container.append(mapSel);
        const levelSelect = (id: string, label: string) => {
            let saved = "";
            try {
                saved = localStorage.getItem(`survev_${id}`) || "";
            } catch {}
            const sel = $("<select>", {
                id,
                class: "server-select menu-option btn-hollow btn-hollow-selected",
            });
            for (const level of BotLevels) {
                const text = `${label}: ${level[0].toUpperCase()}${level.slice(1)}`;
                sel.append($("<option>", { value: level, text }));
            }
            sel.val(BotLevels.includes(saved as BotLevel) ? saved : "intermediate");
            sel.on("change", () => {
                try {
                    localStorage.setItem(`survev_${id}`, sel.val() as string);
                } catch {}
            });
            container.append(sel);
        };
        levelSelect("bot-duel-enemy", "Opponents");
        levelSelect("bot-duel-ally", "Teammates");
        for (let size = 1; size <= 4; size++) {
            const label = `Play ${size}v${size}`;
            const btn = $("<a>", {
                class: "btn-green btn-darken menu-option btn-start-vs-bots",
                text: label,
            });
            btn.attr("data-size", size);
            container.append(btn);
        }
    }

    updatePageFromInfo() {
        if (this.loaded) {
            this.renderModeButtons();
            const supportsTeam = this.info.modes.some((s) =>
                s.enabled && (s.teamMode > 1 || !!MapDefs[s.mapName as MapDefKey]?.gameMode.duelMode)
            );
            $("#btn-join-team, #btn-create-team").toggle(supportsTeam);

            // Region pops
            const pops = this.info.pops;
            if (pops) {
                const regions = Object.keys(pops);

                for (let i = 0; i < regions.length; i++) {
                    const region = regions[i];
                    const data = pops[region];
                    const sel = $("#server-opts").children(`option[value="${region}"]`);
                    const players = this.localization.translate("index-players");
                    sel.text(`${sel.data("label")} [${data.playerCount} ${players}]`);
                }
            }
            let hasTwitchStreamers = false;
            const featuredStreamersElem = $("#featured-streamers");
            const streamerList = $(".streamer-list");
            if (!device.mobile && this.info.twitch) {
                streamerList.empty();
                for (let i = 0; i < this.info.twitch.length; i++) {
                    const streamer = this.info.twitch[i];
                    const template = $("#featured-streamer-template").clone();
                    template
                        .attr("class", "featured-streamer streamer-tooltip")
                        .attr("id", "");
                    const link = template.find("a");
                    const text = this.localization.translate(
                        streamer.viewers == 1 ? "index-viewer" : "index-viewers",
                    );
                    link.html(
                        `${streamer.name} <span>${streamer.viewers} ${text}</span>`,
                    );
                    link.css("background-image", `url(${streamer.img})`);
                    link.attr("href", streamer.url);
                    streamerList.append(template);
                    hasTwitchStreamers = true;
                }
            }
            featuredStreamersElem.css(
                "visibility",
                hasTwitchStreamers ? "visible" : "hidden",
            );

            const featuredYoutuberElem = $("#featured-youtuber");
            const displayYoutuber = this.info.youtube;
            if (displayYoutuber) {
                $(".btn-youtuber")
                    .attr("href", this.info.youtube.link)
                    .html(this.info.youtube.name);
            }
            featuredYoutuberElem.css("display", displayYoutuber ? "block" : "none");

            const mapDef = MapDefs[this.info.clientTheme];
            if (mapDef) {
                this.config.set("clientTheme", this.info.clientTheme);
                this.config.set("cachedBgImg", mapDef.desc.backgroundImg);
                const bg = document.getElementById("background");
                if (bg) {
                    bg.style.backgroundImage = `url(${mapDef.desc.backgroundImg})`;
                }
            }
        }
    }
}
