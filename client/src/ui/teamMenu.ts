import $ from "jquery";
import { GameConfig } from "../../../shared/gameConfig.ts";
import * as net from "../../../shared/net/net.ts";
import {
    type BotLevel,
    BotLevels,
    type BotSettingsByLevel,
    defaultBotSettings,
    defaultPrivateLoadout,
    type FindGameMatchData,
    MaxPrivateBots,
    type PrivateBot,
    type PrivateLoadout,
    zBotSettingsByLevel,
} from "../../../shared/types/api.ts";
import type {
    RoomData,
    ServerToClientTeamMsg,
    TeamErrorMsg,
    TeamMenuErrorType,
    TeamPlayGameMsg,
    TeamStateMsg,
} from "../../../shared/types/team.ts";
import { type CustomMap, customMapBiomes, parseCustomMap } from "../../../shared/utils/customMap.ts";
import { api } from "../api.ts";
import type { AudioManager } from "../audioManager.ts";
import type { ConfigManager } from "../config.ts";
import { device } from "../device.ts";
import { helpers } from "../helpers.ts";
import type { PingTest } from "../pingTest.ts";
import { SDK } from "../sdk/sdk.ts";
import type { SiteInfo } from "../siteInfo.ts";
import type { Localization } from "./localization.ts";
import { setMapMakerPartyHook } from "./mapMaker.ts";
import {
    fillItemPicker,
    fillMapSelect,
    getModeMaps,
    loadGodLoadout,
    modeLabel,
    pickerSlotType,
    saveGodLoadout,
    syncGodLoadoutPickers,
} from "./modePicker.ts";

/** how many of a throwable a level 3 backpack holds */
function throwableMax(throwable: string) {
    const sizes = (GameConfig.bagSizes as Record<string, number[]>)[throwable];
    return sizes ? sizes[sizes.length - 2] : 12;
}

function errorTypeToString(type: TeamMenuErrorType, localization: Localization) {
    const typeMap = {
        join_full: localization.translate("index-team-is-full"),
        join_not_found: localization.translate("index-failed-joining-team"),
        create_failed: localization.translate("index-failed-creating-team"),
        join_failed: localization.translate("index-failed-joining-team"),
        join_game_failed: localization.translate("index-failed-joining-game"),
        lost_conn: localization.translate("index-lost-connection"),
        find_game_error: localization.translate("index-failed-finding-game"),
        find_game_full: localization.translate("index-failed-finding-game"),
        find_game_invalid_protocol: localization.translate("index-invalid-protocol"),
        find_game_invalid_captcha: localization.translate("index-invalid-captcha"),
        kicked: localization.translate("index-team-kicked"),
        private_teams_invalid: "Too many players on one side for this team size",
        custom_map_invalid: "That map file couldn't be used",
        banned: localization.translate("index-ip-banned"),
        behind_proxy: "behind_proxy", // this will get passed to the main app to show a modal
    } as Record<TeamMenuErrorType, string>;
    return typeMap[type as keyof typeof typeMap] || typeMap.lost_conn;
}

const botSettingsKey = "survev_bot_settings";

/** the bot settings this browser last used, or the defaults */
function loadSavedBotSettings(): BotSettingsByLevel {
    try {
        const parsed = zBotSettingsByLevel.safeParse(JSON.parse(localStorage.getItem(botSettingsKey) || "null"));
        if (parsed.success) return parsed.data;
    } catch {}
    return defaultBotSettings();
}

/** highlight a toggle-style button without touching its enabled state */
function setButtonClass(el: JQuery<HTMLElement>, selected: boolean) {
    el.toggleClass("btn-hollow-selected", selected);
}

export class TeamMenu {
    // Jquery elems
    playBtn = $("#btn-start-team");
    serverWarning = $("#server-warning");
    teamOptions = $(
        "#btn-team-fill-auto, #btn-team-fill-none",
    );

    serverSelect = $("#team-server-select");
    mapSelect = $("#team-map-select");
    queueModes = $("#team-queue-modes");
    typeQueue = $("#btn-team-type-queue");
    typePrivate = $("#btn-team-type-private");
    privateMapSelect = $("#team-private-map-select");
    privateSizes = $("#team-private-sizes");
    godPickers = $("#team-god-primary, #team-god-secondary, #team-god-melee, #team-god-throwable, #team-god-armor");
    godHeals = $(
        "#team-god-throwable-count, #team-god-bandage, #team-god-healthkit, #team-god-soda, #team-god-painkiller",
    );
    kitShared = $("#btn-team-kit-shared");
    kitOn = $("#btn-team-kit-on");
    kitOff = $("#btn-team-kit-off");
    fillAuto = $("#btn-team-fill-auto");
    fillNone = $("#btn-team-fill-none");

    active = false;
    joined = false;
    create = false;
    joiningGame = false;
    ws: WebSocket | null = null;
    keepAliveTimeout = 0;

    gameError: string | undefined = undefined;

    // Ui state
    playerData = {};
    roomData = {} as RoomData;
    players: Array<{
        playerId: number;
        inGame: boolean;
        name: string;
        isLeader: boolean;
        team: number;
    }> = [];

    prevPlayerCount = 0;
    localPlayerId = 0;
    isLeader = true;
    editingName = false;
    displayedInvalidProtocolModal = false;

    hideUrl!: boolean;

    constructor(
        public config: ConfigManager,
        public pingTest: PingTest,
        public siteInfo: SiteInfo,
        public localization: Localization,
        public audioManager: AudioManager,
        public joinGameCb: (data: FindGameMatchData) => void,
        public leaveCb: (err?: string) => void,
    ) {
        // Listen for ui modifications
        this.serverSelect.on("change", () => {
            const e = this.serverSelect.find(":selected").val() as string;
            this.pingTest.start([e]);
            this.setRoomProperty("region", e);
        });
        this.queueModes.on("click", ".btn-team-queue", (e) => {
            const idx = Number($(e.currentTarget).attr("data-mode-idx"));
            this.setRoomProperty("gameModeIdx", idx);
        });
        this.mapSelect.on("change", () => {
            // switch to the first allowed mode on the picked map
            const mapName = this.mapSelect.val() as string;
            const modes = this.siteInfo.info.modes || [];
            const idx = this.roomData.enabledGameModeIdxs.find((i) => modes[i]?.mapName === mapName);
            if (idx !== undefined) this.setRoomProperty("gameModeIdx", idx);
        });
        // private match: leader picks map, side size and kit, players pick sides
        this.typeQueue.on("click", () => this.setRoomProperty("privateMatch", false));
        this.typePrivate.on("click", () => this.setRoomProperty("privateMatch", true));
        this.privateMapSelect.on("change", () => {
            this.setRoomProperty("privateMapName", this.privateMapSelect.val() as string);
        });
        this.privateSizes.on("click", ".btn-team-private-size", (e) => {
            this.setRoomProperty("privateTeamSize", Number($(e.currentTarget).attr("data-size")));
        });
        // Same Kit edits the room's shared kit, God Kit edits your own saved one
        this.godPickers.add(this.godHeals).on("change", () => {
            if (this.sharedKitActive()) {
                this.sendPrivateLoadout();
            } else {
                const own = loadGodLoadout();
                for (const slot of Object.keys(pickerSlotType) as Array<keyof typeof pickerSlotType>) {
                    own[slot] = $(`#team-god-${slot}`).val() as string;
                }
                saveGodLoadout(own);
                syncGodLoadoutPickers();
                this.refreshUi();
            }
        });
        // Same Kit = the god kit, but one the leader picks for everyone
        this.kitShared.on("click", () => {
            this.setRoomProperty("privateSharedKit", true);
            this.setRoomProperty("privateGodLoadout", true);
        });
        this.kitOn.on("click", () => {
            this.setRoomProperty("privateSharedKit", false);
            this.setRoomProperty("privateGodLoadout", true);
        });
        this.kitOff.on("click", () => this.setRoomProperty("privateGodLoadout", false));
        // Vs Bots: pick the opponent bots, and bot teammates for 2v2 and up
        $("#btn-team-bots-custom").on("click", () => this.setRoomProperty("privateVsBots", false));
        $("#btn-team-bots-vs").on("click", () => this.setRoomProperty("privateVsBots", true));
        $("#btn-team-bot-settings").on("click", () => {
            this.botSettingsOpen = !this.botSettingsOpen;
            this.refreshUi();
        });
        $("#team-bot-enemy").on("change", () => {
            this.setRoomProperty("privateBotEnemy", $("#team-bot-enemy").val() as BotLevel);
        });
        $("#team-bot-ally").on("change", () => {
            this.setRoomProperty("privateBotAlly", $("#team-bot-ally").val() as BotLevel);
        });
        // custom maps from the map maker
        $("#btn-team-map-upload").on("click", () => {
            if (this.isLeader) $("#team-map-file").trigger("click");
        });
        $("#team-map-file").on("change", async (e) => {
            const input = e.currentTarget as HTMLInputElement;
            const file = input.files?.[0];
            input.value = "";
            if (!file) return;
            const res = parseCustomMap(await file.text());
            if ("error" in res) {
                this.customMapError = res.error;
                this.refreshUi();
                return;
            }
            this.customMapError = "";
            this.sendMessage("setCustomMap", { map: res.map });
        });
        $("#btn-team-map-clear").on("click", () => {
            if (this.isLeader) this.sendMessage("setCustomMap", { map: null });
        });
        // player side tags only; bot tags have their own handler and no player id
        $("#team-menu-member-list").on("click", ".team-side.can-switch:not(.bot-side)", (e) => {
            const el = $(e.currentTarget);
            this.sendMessage("setTeam", {
                playerId: Number(el.attr("data-playerid")),
                team: Number(el.attr("data-team")) === 0 ? 1 : 0,
            });
        });

        this.fillAuto.on("click", () => {
            this.setRoomProperty("autoFill", true);
        });
        this.fillNone.on("click", () => {
            this.setRoomProperty("autoFill", false);
        });
        this.playBtn.on("click", () => {
            SDK.requestMidGameAd(() => {
                this.tryStartGame();
            });
        });
        $("#team-copy-url, #team-desc-text").on("click", (e) => {
            const t = $("<div/>", {
                class: "copy-toast",
                html: "Copied!",
            });
            $("#start-menu-wrapper").append(t);
            t.css({
                left: e.pageX - parseInt(t.css("width")) / 2,
                top: $("#team-copy-url").offset()!.top,
            });
            t.animate(
                {
                    top: "-=20",
                    opacity: 1,
                },
                {
                    queue: false,
                    duration: 300,
                    complete: function() {
                        $(this).fadeOut(250, function() {
                            $(this).remove();
                        });
                    },
                },
            );
            let codeToCopy = $("#team-url").text();
            // if running on an iframe
            if (window !== window.top) {
                codeToCopy = this.roomData.roomUrl.substring(1);
            }
            helpers.copyTextToClipboard(codeToCopy);
        });

        if (window !== window.top) {
            $("#team-desc-text").hide();
        }

        if (!device.mobile) {
            // Hide invite link
            this.hideUrl = false;
            $("#team-hide-url").on("click", (e) => {
                const el = e.currentTarget;
                this.hideUrl = !this.hideUrl;
                $("#team-desc-text, #team-code-text").css({
                    opacity: this.hideUrl ? 0 : 1,
                });
                $(el).css({
                    "background-image": this.hideUrl
                        ? "url(../img/gui/hide.svg)"
                        : "url(../img/gui/eye.svg)",
                });
            });
        }

        setInterval(() => {
            if (this.joined) {
                this.sendMessage("keepAlive", {});
            }
        }, 10 * 1000);
    }

    getPlayerById(playerId: number) {
        return this.players.find((x) => {
            return x.playerId == playerId;
        });
    }

    /** start the match as soon as the room exists (Duel (Bots) from the main menu) */
    autoStart = false;
    /** custom map to send to the new room before auto-starting */
    pendingCustomMap?: CustomMap;

    connect(create: boolean, roomUrl: string, roomPreset?: Partial<RoomData>, autoStart = false) {
        if (!this.active || roomUrl !== this.roomData.roomUrl) {
            const roomHost = api.resolveRoomHost();
            const url = `w${window.location.protocol === "https:" ? "ss" : "s"}://${roomHost}/team_v2`;
            this.active = true;
            this.joined = false;
            this.create = create;
            this.autoStart = autoStart;
            this.joiningGame = false;
            this.editingName = false;
            this.gameError = undefined;

            // Load properties from config
            this.playerData = {
                name: this.config.get("playerName"),
            };
            this.roomData = {
                roomUrl,
                region: this.config.get("region")!,
                gameModeIdx: this.config.get("gameModeIdx")!,
                autoFill: this.config.get("teamAutoFill")!,
                findingGame: false,
                lastError: undefined,
                privateLoadout: { ...defaultPrivateLoadout },
                // the leader's saved bot settings come along to every party they make
                privateBotSettings: loadSavedBotSettings(),
                ...roomPreset,
            } as RoomData;
            this.displayedInvalidProtocolModal = false;

            this.refreshUi();

            if (this.ws) {
                this.ws.onclose = function() {};
                this.ws.close();
                this.ws = null;
            }

            try {
                this.ws = new WebSocket(url);
                this.ws.onerror = (_e) => {
                    this.ws?.close();
                };
                this.ws.onclose = () => {
                    let errMsg: TeamMenuErrorType | undefined = undefined;
                    if (!this.joiningGame) {
                        errMsg = this.joined
                            ? "lost_conn"
                            : this.create
                            ? "create_failed"
                            : "join_failed";
                    }
                    this.leave(errMsg);
                };
                this.ws.onopen = () => {
                    if (this.create) {
                        this.sendMessage("create", {
                            roomData: this.roomData,
                            playerData: this.playerData,
                        });
                    } else {
                        this.sendMessage("join", {
                            roomUrl: this.roomData.roomUrl,
                            playerData: this.playerData,
                        });
                    }
                };
                this.ws.onmessage = (e) => {
                    if (this.active) {
                        const msg = JSON.parse(e.data);
                        this.onMessage(msg.type, msg.data);
                    }
                };
            } catch (_e) {
                this.leave(this.create ? "create_failed" : "join_failed");
            }
        }
    }

    leave(errType?: TeamMenuErrorType) {
        if (this.active) {
            this.ws?.close();
            this.ws = null;
            this.active = false;
            this.joined = false;
            this.joiningGame = false;
            this.refreshUi();

            // Save state to config for the menu
            this.config.set("gameModeIdx", this.roomData.gameModeIdx);
            this.config.set("teamAutoFill", this.roomData.autoFill);
            if (this.isLeader) {
                this.config.set("region", this.roomData.region);
            }
            let errTxt = "";
            if (errType) {
                errTxt = errorTypeToString(errType, this.localization);
            }
            this.leaveCb(errTxt);

            SDK.hideInviteButton();
        }
    }

    onGameComplete(errMessage?: string) {
        if (this.active) {
            this.joiningGame = false;
            this.sendMessage("gameComplete");

            this.gameError = errMessage;
        }
    }

    onMessage<T extends ServerToClientTeamMsg["type"]>(
        type: T,
        data: ServerToClientTeamMsg["data"],
    ) {
        switch (type) {
            case "state": {
                let stateData = data as TeamStateMsg["data"];
                this.joined = true;
                const ourRoomData = this.roomData;
                this.roomData = stateData.room;
                this.players = stateData.players;
                this.localPlayerId = stateData.localPlayerId;
                this.isLeader = this.getPlayerById(this.localPlayerId)!.isLeader;

                // Override room properties with local values if we're
                // the leader; otherwise, the server may override a
                // recent change.
                //
                // A better solution here would be just a sequence
                // number and we can ignore updates that don't include our
                // most recent change request.
                if (this.isLeader) {
                    this.roomData.region = ourRoomData.region;
                    if (ourRoomData.privateLoadout) {
                        this.roomData.privateLoadout = ourRoomData.privateLoadout;
                    }
                    if (ourRoomData.privateBotSettings) {
                        this.roomData.privateBotSettings = ourRoomData.privateBotSettings;
                    }
                    this.roomData.autoFill = ourRoomData.autoFill;
                }
                this.refreshUi();
                if (this.autoStart && this.isLeader) {
                    if (this.pendingCustomMap) {
                        // start once the server echoes the map back
                        this.sendMessage("setCustomMap", { map: this.pendingCustomMap });
                        this.pendingCustomMap = undefined;
                    } else {
                        this.autoStart = false;
                        this.tryStartGame();
                    }
                }
                // Since the only way to get the roomID (ig?) is from state, each time receiving state, we can show the invite button
                SDK.showInviteButton(stateData.room.roomUrl.replace("#", ""));
                break;
            }
            case "joinGame":
                this.joiningGame = true;
                this.joinGameCb(data as FindGameMatchData);
                break;
            case "keepAlive":
                break;
            case "kicked":
                this.leave("kicked");
                break;
            case "error":
                this.leave((data as TeamErrorMsg["data"]).type);
        }
    }

    sendMessage(type: string, data?: unknown) {
        if (this.ws) {
            if (this.ws.readyState === this.ws.OPEN) {
                const msg = JSON.stringify({
                    type,
                    data,
                });
                this.ws.send(msg);
            } else {
                this.ws.close();
            }
        }
    }

    setRoomProperty<T extends keyof RoomData>(prop: T, val: RoomData[T]) {
        if (this.isLeader && this.roomData[prop] != val) {
            this.roomData[prop] = val;
            this.sendMessage("setRoomProps", this.roomData);
        }
    }

    /** Bot Settings panel open, and which level it's editing */
    botSettingsOpen = false;
    botSettingsLevel: BotLevel = "beginner";

    /** this room's bot settings, or the defaults */
    botSettings(): BotSettingsByLevel {
        return this.roomData.privateBotSettings ?? defaultBotSettings();
    }

    /**
     * Builds the Bot Settings panel once; refreshes only fill in values, so a
     * room update never steals focus from a field being typed in.
     */
    buildBotSettingsPanel() {
        const panel = $("#team-bot-settings");
        if (panel.children().length) return;

        const tabs = $("<div/>", { class: "botset-tabs" });
        for (const level of BotLevels) {
            const tab = $("<a/>", {
                class: "btn-hollow btn-darken team-menu-option botset-tab",
                text: `${level[0].toUpperCase()}${level.slice(1)}`,
                "data-level": level,
            });
            tab.on("click", () => {
                this.botSettingsLevel = level;
                this.refreshUi();
            });
            tabs.append(tab);
        }
        panel.append(tabs);
        panel.append($("<div/>", { class: "botset-hint", text: "Each bot level has its own settings." }));

        const check = (key: string, label: string) =>
            $("<label/>", { class: "god-heal" }).append(
                $("<span/>", { text: label }),
                $("<input/>", { type: "checkbox", class: "botset-field", "data-key": key }),
            );
        const number = (key: string, label: string, max: number) =>
            $("<label/>", { class: "god-heal" }).append(
                $("<span/>", { text: label }),
                $("<input/>", { type: "number", min: 0, max, class: "menu-option botset-field", "data-key": key }),
            );

        panel.append(
            $("<div/>", { class: "botset-grid" }).append(
                check("chase", "Chase players"),
                check("loot", "Loot"),
                check("heal", "Heal"),
                check("boost", "Pills / soda"),
                check("throwables", "Throwables"),
                check("melee", "Melee up close"),
                number("accuracy", "Hit %", 100),
                number("dodge", "Dodge %", 100),
            ),
        );

        // optional exact kit, same pickers as the party kit
        panel.append($("<div/>", { class: "botset-grid" }).append(check("kit", "Custom kit")));
        const kit = $("<div/>", { id: "team-botset-kit" });
        for (const slot of Object.keys(pickerSlotType)) {
            kit.append(
                $("<select/>", {
                    id: `team-botset-${slot}`,
                    class: "server-select menu-option btn-hollow btn-hollow-selected botset-field",
                    "data-kit": slot,
                }),
            );
        }
        const armor = $("<select/>", {
            class: "server-select menu-option btn-hollow btn-hollow-selected botset-field",
            "data-kit": "armor",
        });
        for (let i = 0; i <= 3; i++) {
            armor.append($("<option/>", { value: i, text: i ? `Level ${i} armor` : "No armor" }));
        }
        kit.append(armor);
        const counts = $("<div/>", { class: "botset-grid" });
        for (
            const [key, label, max] of [
                ["throwableCount", "Throwables", 40],
                ["bandage", "Bandages", 30],
                ["healthkit", "Med Kits", 4],
                ["soda", "Sodas", 15],
                ["painkiller", "Pills", 4],
            ] as const
        ) {
            counts.append(
                $("<label/>", { class: "god-heal" }).append(
                    $("<span/>", { text: label }),
                    $("<input/>", { type: "number", min: 0, max, class: "menu-option botset-field", "data-kit": key }),
                ),
            );
        }
        kit.append(counts);
        panel.append(kit);

        panel.on("change", ".botset-field", () => this.saveBotSettingsFromPanel());
    }

    /** reads the panel into the room's settings for the level being edited */
    saveBotSettingsFromPanel() {
        if (!this.isLeader) return;
        const panel = $("#team-bot-settings");
        const all = structuredClone(this.botSettings());
        const s = all[this.botSettingsLevel];
        // the kit pickers only hold real values once the kit is showing
        const kitWasOn = !!s.kit;
        const num = (el: JQuery<HTMLElement>, max: number) =>
            Math.max(0, Math.min(max, Math.round(Number(el.val())) || 0));
        panel.find("[data-key]").each((_i, e) => {
            const el = $(e);
            const key = el.attr("data-key")!;
            if (key === "accuracy" || key === "dodge") {
                s[key] = num(el, 100);
            } else if (key === "kit") {
                const on = el.prop("checked") as boolean;
                if (on && !s.kit) s.kit = { ...defaultPrivateLoadout };
                if (!on) s.kit = null;
            } else {
                (s as unknown as Record<string, boolean>)[key] = el.prop("checked") as boolean;
            }
        });
        if (s.kit && kitWasOn) {
            const kit = s.kit;
            panel.find("[data-kit]").each((_i, e) => {
                const el = $(e);
                const key = el.attr("data-kit") as keyof PrivateLoadout;
                const max = Number(el.attr("max") ?? 3);
                if (key in pickerSlotType) {
                    (kit as Record<string, unknown>)[key] = el.val() as string;
                } else {
                    (kit as Record<string, unknown>)[key] = num(el, max);
                }
            });
        }
        try {
            localStorage.setItem(botSettingsKey, JSON.stringify(all));
        } catch {}
        this.setRoomProperty("privateBotSettings", all);
    }

    /** shows the panel's values for the level being edited */
    refreshBotSettingsPanel() {
        const panel = $("#team-bot-settings");
        panel.toggle(this.botSettingsOpen);
        setButtonClass($("#btn-team-bot-settings"), this.botSettingsOpen);
        if (!this.botSettingsOpen) return;
        this.buildBotSettingsPanel();
        const s = this.botSettings()[this.botSettingsLevel];
        panel.find(".botset-tab").each((_i, e) => {
            setButtonClass($(e), $(e).attr("data-level") === this.botSettingsLevel);
        });
        panel.find("[data-key]").each((_i, e) => {
            const el = $(e);
            if (el.is(":focus")) return;
            const key = el.attr("data-key")!;
            if (key === "kit") el.prop("checked", !!s.kit);
            else if (key === "accuracy" || key === "dodge") el.val(s[key]);
            else el.prop("checked", !!(s as unknown as Record<string, boolean>)[key]);
        });
        $("#team-botset-kit").toggle(!!s.kit);
        if (s.kit) {
            for (const [slot, type] of Object.entries(pickerSlotType)) {
                if (!$(`#team-botset-${slot}`).is(":focus")) {
                    fillItemPicker("team-botset", slot, type, s.kit[slot as keyof typeof pickerSlotType]);
                }
            }
            panel.find("[data-kit]").each((_i, e) => {
                const el = $(e);
                const key = el.attr("data-kit")! as keyof PrivateLoadout;
                if (key in pickerSlotType || el.is(":focus")) return;
                el.val(s.kit![key]);
            });
        }
        panel.find("input, select").prop("disabled", !this.isLeader);
    }

    /** level picked in the party's "add bot" row */
    addBotLevel: BotLevel = "intermediate";

    /**
     * Private match bots, listed under the players like party members.
     * Vs Bots shows the bots it will add; otherwise the leader adds,
     * removes and switches the side of each bot.
     */
    renderBotRows(list: JQuery<HTMLElement>) {
        if (!this.roomData.privateMatch) return;
        const levelName = (l: BotLevel) => `${l[0].toUpperCase()}${l.slice(1)}`;
        const row = (level: BotLevel, team: number, idx: number, editable: boolean) => {
            const member = $("<div/>", { class: "team-menu-member" });
            member.append($("<div/>", { class: `icon ${editable ? "icon-bot-remove" : "icon-bot"}`, "data-bot": idx }));
            member.append(
                $("<div/>", {
                    class: `team-side ${team === 1 ? "side-b" : "side-a"} bot-side${editable ? " can-switch" : ""}`,
                    text: team === 1 ? "B" : "A",
                    title: editable ? "Switch side" : "",
                    "data-bot": idx,
                }),
            );
            member.append(
                $("<div/>", { class: "name menu-option name-text name-bot", text: `Bot · ${levelName(level)}` }),
            );
            list.append(member);
        };

        // Vs Bots lists the bots it will add; editing one turns it into a custom list
        const vsBots = !!this.roomData.privateVsBots;
        let bots: PrivateBot[] = this.roomData.privateBots ?? [];
        if (vsBots) {
            const size = this.roomData.privateTeamSize;
            bots = [];
            for (let i = this.players.length; i < size; i++) {
                bots.push({ level: this.roomData.privateBotAlly, team: 0 });
            }
            for (let i = 0; i < size; i++) bots.push({ level: this.roomData.privateBotEnemy, team: 1 });
        }
        bots.forEach((bot, i) => row(bot.level, bot.team, i, this.isLeader));
        if (!this.isLeader) return;

        const setBots = (next: PrivateBot[]) => {
            this.setRoomProperty("privateBots", next);
            if (vsBots) this.setRoomProperty("privateVsBots", false);
        };
        list.find(".icon-bot-remove").on("click", (e) => {
            const idx = Number($(e.currentTarget).attr("data-bot"));
            setBots(bots.filter((_b, i) => i !== idx));
        });
        list.find(".bot-side.can-switch").on("click", (e) => {
            const idx = Number($(e.currentTarget).attr("data-bot"));
            setBots(bots.map((b, i) => (i === idx ? { ...b, team: b.team === 0 ? 1 : 0 } : b)));
        });
        if (vsBots) return;

        if (bots.length >= MaxPrivateBots) return;
        const add = $("<div/>", { class: "team-menu-member team-bot-add" });
        const select = $("<select/>", { class: "server-select menu-option btn-hollow btn-hollow-selected" });
        for (const level of BotLevels) {
            select.append($("<option/>", { value: level, text: `Bot · ${levelName(level)}` }));
        }
        select.val(this.addBotLevel);
        select.on("change", () => {
            this.addBotLevel = select.val() as BotLevel;
        });
        const btn = $("<a/>", { class: "btn-hollow btn-darken team-menu-option", text: "+ Add Bot" });
        btn.on("click", () => {
            // new bots go to whichever side is smaller
            const count = (team: number) =>
                this.players.filter((p) => p.team === team).length + bots.filter((b) => b.team === team).length;
            const team = count(0) <= count(1) ? 0 : 1;
            this.setRoomProperty("privateBots", [...bots, { level: this.addBotLevel, team }]);
        });
        add.append(select, btn);
        list.append(add);
    }

    /** true when the leader's one kit is what everyone spawns with */
    /** shown under the map buttons when a picked file isn't a valid map */
    customMapError = "";

    sharedKitActive() {
        return !!this.roomData.privateGodLoadout && !!this.roomData.privateSharedKit;
    }

    /** reads the kit pickers and pushes them to the room (leader only) */
    sendPrivateLoadout() {
        if (!this.isLeader) return;

        const num = (id: string, max: number) => {
            const val = Math.round(Number($(id).val()));
            return Number.isFinite(val) ? Math.min(max, Math.max(0, val)) : 0;
        };
        const loadout: PrivateLoadout = {
            primary: $("#team-god-primary").val() as string,
            secondary: $("#team-god-secondary").val() as string,
            melee: $("#team-god-melee").val() as string,
            throwable: $("#team-god-throwable").val() as string,
            throwableCount: num("#team-god-throwable-count", throwableMax($("#team-god-throwable").val() as string)),
            armor: num("#team-god-armor", 3),
            bandage: num("#team-god-bandage", 30),
            healthkit: num("#team-god-healthkit", 4),
            soda: num("#team-god-soda", 15),
            painkiller: num("#team-god-painkiller", 4),
        };

        this.roomData.privateLoadout = loadout;
        this.sendMessage("setRoomProps", this.roomData);
        this.refreshUi();
    }

    tryStartGame() {
        if (this.isLeader && !this.roomData.findingGame) {
            const version = GameConfig.protocolVersion;
            let region = this.roomData.region;
            const paramRegion = helpers.getParameterByName("region");
            if (paramRegion !== undefined && paramRegion.length > 0) {
                region = paramRegion;
            }
            let zones = this.pingTest.getZones(region);
            const paramZone = helpers.getParameterByName("zone");
            if (paramZone !== undefined && paramZone.length > 0) {
                zones = [paramZone];
            }
            const matchArgs: TeamPlayGameMsg["data"] = {
                version,
                region,
                zones,
            };

            helpers.verifyTurnstile(this.roomData.captchaEnabled, (token) => {
                matchArgs.turnstileToken = token;
                this.sendMessage("playGame", matchArgs);
            });
            this.roomData.findingGame = true;
            this.gameError = undefined;
            this.refreshUi();
        }
    }

    refreshUi() {
        const setButtonState = function(
            el: JQuery<HTMLElement>,
            selected: boolean,
            enabled: boolean,
        ) {
            el.removeClass("btn-darken btn-disabled btn-opaque btn-hollow-selected");
            if (enabled) {
                el.addClass("btn-darken");
            } else {
                el.addClass("btn-disabled");
                if (!selected) {
                    el.addClass("btn-opaque");
                }
            }
            if (selected) {
                el.addClass("btn-hollow-selected");
            }
            el.prop("disabled", !enabled);
        };
        setMapMakerPartyHook(
            this.active && this.isLeader && !!this.roomData.privateMatch
                ? (map) => {
                    this.customMapError = "";
                    this.sendMessage("setCustomMap", { map });
                }
                : null,
        );
        $("#team-menu").css("display", this.active ? "block" : "none");
        $("#start-menu").css("display", this.active ? "none" : "block");
        $("#right-column").css("display", this.active ? "none" : "block");
        $("#social-share-block").css("display", this.active ? "none" : "block");

        // Error text
        const errorTxt = this.roomData.lastError
            ? errorTypeToString(this.roomData.lastError!, this.localization)
            : this.gameError;
        this.serverWarning.css("opacity", errorTxt ? 1 : 0);
        this.serverWarning.html(errorTxt || "");

        if (
            this.roomData.lastError == "find_game_invalid_protocol"
            && !this.displayedInvalidProtocolModal
        ) {
            $("#modal-refresh").fadeIn(200);
            this.displayedInvalidProtocolModal = true;
        }

        // Set captcha to enabled if we fail the captcha
        // This can happen if it was disabled when the page loaded which would meant it was sending an empty token
        // And we only fetch the state when the page loads...
        if (this.roomData.lastError === "find_game_invalid_captcha") {
            this.siteInfo.info.captchaEnabled = true;
        }

        // Show/hide team connecting/contents
        if (this.active) {
            $("#team-menu-joining-text").css("display", this.create ? "none" : "block");
            $("#team-menu-creating-text").css("display", this.create ? "block" : "none");
            $("#team-menu-connecting").css("display", this.joined ? "none" : "block");
            $("#team-menu-contents").css("display", this.joined ? "block" : "none");
            $("#btn-team-leave").css("display", this.joined ? "block" : "none");
        }

        if (this.joined) {
            // Regions
            const regionPops = this.siteInfo.info.pops || {};
            const regions = Object.keys(regionPops);
            for (let i = 0; i < regions.length; i++) {
                const region = regions[i];
                const count = regionPops[region].playerCount;
                const players = this.localization.translate("index-players");
                const sel = $("#team-server-opts").children(`option[value="${region}"]`);
                sel.html(`${sel.attr("data-label")} [${count} ${players}]`);
            }

            this.serverSelect.find("option").each((_idx, ele) => {
                ele.selected = ele.value == this.roomData.region;
            });

            // Modes btns
            const modes = this.siteInfo.info.modes || [];
            const allowed = this.roomData.enabledGameModeIdxs || [];
            const curMap = modes[this.roomData.gameModeIdx]?.mapName || "main";
            fillMapSelect(
                this.mapSelect,
                getModeMaps(modes, (m) => allowed.includes(modes.indexOf(m))),
                curMap,
            );
            this.mapSelect.prop("disabled", !this.isLeader);
            this.queueModes.empty();
            for (const i of allowed) {
                const mode = modes[i];
                if (!mode || mode.mapName !== curMap) continue;
                const btn = $("<a>", {
                    class: "btn-hollow btn-hollow-selected btn-darken team-menu-option btn-team-queue",
                    text: modeLabel(mode),
                    "data-mode-idx": i,
                });
                this.queueModes.append(btn);
                setButtonState(btn, this.roomData.gameModeIdx == i, this.isLeader);
            }

            // Queue vs private match
            const isPrivate = !!this.roomData.privateMatch;
            setButtonState(this.typeQueue, !isPrivate, this.isLeader);
            setButtonState(this.typePrivate, isPrivate, this.isLeader);
            $("#team-queue-options").toggle(!isPrivate);
            $("#team-private-options").toggle(isPrivate);
            if (isPrivate) {
                fillMapSelect(this.privateMapSelect, getModeMaps(modes), this.roomData.privateMapName);
                this.privateMapSelect.prop("disabled", !this.isLeader);

                // an uploaded map replaces the map picker
                const custom = this.roomData.customMap;
                this.privateMapSelect.toggle(!custom);
                $("#team-custom-map-info").toggle(!!custom || !!this.customMapError);
                $("#team-custom-map-name").text(custom ? `Custom map: ${custom.name}` : "");
                $("#team-custom-map-desc")
                    .toggleClass("team-custom-map-error", !!this.customMapError)
                    .text(
                        this.customMapError
                            || (custom
                                ? `${
                                    customMapBiomes[custom.biome] ?? custom.biome
                                } · ${custom.width}×${custom.height} · `
                                    + `${custom.objects} objects${custom.noLoot ? " · no loot" : ""}`
                                : ""),
                    );
                $("#btn-team-map-upload").toggle(this.isLeader).text(custom ? "Replace" : "Upload Map");
                $("#btn-team-map-clear").toggle(this.isLeader && !!custom);
                this.privateSizes.empty();
                for (let size = 1; size <= 4; size++) {
                    const btn = $("<a>", {
                        class: "btn-hollow btn-hollow-selected btn-darken team-menu-option btn-team-private-size",
                        text: `${size}v${size}`,
                        "data-size": size,
                    });
                    this.privateSizes.append(btn);
                    setButtonState(btn, this.roomData.privateTeamSize == size, this.isLeader);
                }
                this.refreshBotSettingsPanel();
                const vsBots = !!this.roomData.privateVsBots;
                setButtonState($("#btn-team-bots-custom"), !vsBots, this.isLeader);
                setButtonState($("#btn-team-bots-vs"), vsBots, this.isLeader);
                $("#team-vs-bots").toggle(vsBots);
                // teammates only matter when the party doesn't already fill the side
                $("#team-bot-ally").closest("label").toggle(
                    this.roomData.privateTeamSize > this.players.length,
                );
                $("#team-bot-enemy")
                    .val(this.roomData.privateBotEnemy ?? "intermediate")
                    .prop("disabled", !this.isLeader);
                $("#team-bot-ally")
                    .val(this.roomData.privateBotAlly ?? "intermediate")
                    .prop("disabled", !this.isLeader);
                $("#team-private-hint").toggle(!vsBots);
                // Same Kit / God Kit / Loot
                const god = !!this.roomData.privateGodLoadout;
                const shared = god && !!this.roomData.privateSharedKit;
                setButtonState(this.kitShared, shared, this.isLeader);
                setButtonState(this.kitOn, god && !shared, this.isLeader);
                setButtonState(this.kitOff, !god, this.isLeader);
                // Pickers show the shared kit under Same Kit, and your own
                // saved kit under God Kit. Loot has no kit to show.
                $("#team-god-loadout").toggle(god);
                $("#team-god-shared-only").toggle(shared);
                if (god) {
                    const kit = shared
                        ? this.roomData.privateLoadout || defaultPrivateLoadout
                        : { ...defaultPrivateLoadout, ...loadGodLoadout() };

                    $("#team-god-title").text(shared ? "Everyone's Kit" : "Your Kit");
                    for (const [slot, type] of Object.entries(pickerSlotType)) {
                        fillItemPicker("team-god", slot, type, kit[slot as keyof typeof pickerSlotType]);
                    }

                    if (shared) {
                        $("#team-god-armor").val(String(kit.armor));
                        // the cap depends on which throwable is picked
                        const throwMax = throwableMax(kit.throwable);
                        $("#team-god-throwable-count").attr("max", throwMax).val(
                            Math.min(kit.throwableCount, throwMax),
                        );
                        $("#team-god-bandage").val(kit.bandage);
                        $("#team-god-healthkit").val(kit.healthkit);
                        $("#team-god-soda").val(kit.soda);
                        $("#team-god-painkiller").val(kit.painkiller);
                    }

                    // the shared kit is the leader's to set; your own always is
                    this.godPickers.prop("disabled", shared && !this.isLeader);
                    this.godHeals.prop("disabled", !this.isLeader);
                }
            }

            // Fill mode
            setButtonState(this.fillAuto, this.roomData.autoFill, this.isLeader);
            setButtonState(this.fillNone, !this.roomData.autoFill, this.isLeader);
            this.serverSelect.prop("disabled", !this.isLeader);

            // Invite link
            if (this.roomData.roomUrl) {
                const roomCode = this.roomData.roomUrl.substring(1);
                $("#team-code").text(roomCode);

                if (SDK.supportsInviteLink()) {
                    SDK.getInviteLink(roomCode).then((sdkUrl) => {
                        $("#team-url").text(sdkUrl!);
                    });
                } else {
                    const roomUrl = new URL(window.location.href);
                    roomUrl.search = ""; // removes ?t=<timestamp> that is set when the client receives an invalid protocol error
                    roomUrl.hash = this.roomData.roomUrl;

                    const url = new URL(window.location.href);
                    url.search = "";
                    url.hash = this.roomData.roomUrl;

                    $("#team-url").text(url.toString());

                    if (window.history) {
                        window.history.replaceState("", "", this.roomData.roomUrl);
                    }
                }
            }

            // Play button
            this.playBtn.html(
                this.roomData.findingGame || this.joiningGame
                    ? "<div class=\"ui-spinner\"></div>"
                    : this.playBtn.attr("data-label")!,
            );

            const gameModeStyles = this.siteInfo.getGameModeStyles();
            for (let i = 0; i < gameModeStyles.length; i++) {
                this.playBtn.removeClass(gameModeStyles[i].buttonCss);
            }
            const style = gameModeStyles[this.roomData.gameModeIdx];
            if (style) {
                this.playBtn.addClass("btn-custom-mode-no-indent");
                this.playBtn.addClass(style.buttonCss);
                this.playBtn.css({
                    "background-image": `url(${style.icon})`,
                });
            } else {
                this.playBtn.css({
                    "background-image": "",
                });
            }
            let playersInGame = false;
            for (let i = 0; i < this.players.length; i++) {
                playersInGame = playersInGame || this.players[i].inGame;
            }

            const waitReason = $("#msg-wait-reason");

            if (this.isLeader) {
                waitReason.html(
                    `${
                        this.localization.translate(
                            "index-game-in-progress",
                        )
                    }<span> ...</span>`,
                );

                const showWaitMessage = playersInGame && !this.joiningGame;
                waitReason.css("display", showWaitMessage ? "block" : "none");
                this.playBtn.css("display", showWaitMessage ? "none" : "block");
            } else {
                if (this.roomData.findingGame || this.joiningGame) {
                    waitReason.html(
                        `<div class="ui-spinner" style="margin-right:16px"></div>${
                            this.localization.translate(
                                "index-joining-game",
                            )
                        }<span> ...</span>`,
                    );
                } else if (playersInGame) {
                    waitReason.html(
                        `${
                            this.localization.translate(
                                "index-game-in-progress",
                            )
                        }<span> ...</span>`,
                    );
                } else {
                    waitReason.html(
                        `${
                            this.localization.translate(
                                "index-waiting-for-leader",
                            )
                        }<span> ...</span>`,
                    );
                }
                waitReason.css("display", "block");
                this.playBtn.css("display", "none");
            }

            // Player properties
            const teamMembers = $("#team-menu-member-list");
            teamMembers.empty();
            // private matches list the players, then the bots, with no empty slots between
            const slots = this.roomData.privateMatch ? this.players.length : this.roomData.maxPlayers;
            for (let t = 0; t < slots; t++) {
                let playerStatus = {
                    name: "",
                    playerId: 0,
                    isLeader: false,
                    inGame: false,
                    self: false,
                    team: -1,
                };
                if (t < this.players.length) {
                    const player = this.players[t];
                    playerStatus = {
                        name: player.name,
                        playerId: player.playerId,
                        isLeader: player.isLeader,
                        inGame: player.inGame,
                        self: player.playerId == this.localPlayerId,
                        team: player.team,
                    };
                }

                const member = $("<div/>", {
                    class: "team-menu-member",
                });

                // Left-side icon
                let iconClass = "";
                if (playerStatus.isLeader) {
                    iconClass = " icon-leader";
                } else if (this.isLeader && playerStatus.playerId != 0) {
                    iconClass = " icon-kick";
                }

                member.append(
                    $("<div/>", {
                        class: `icon${iconClass}`,
                        "data-playerid": playerStatus.playerId,
                    }),
                );
                // private match side tag, click to switch (own row, or any row for the leader)
                if (this.roomData.privateMatch && playerStatus.team >= 0) {
                    const canSwitch = playerStatus.self || this.isLeader;
                    member.append(
                        $("<div/>", {
                            class: `team-side ${playerStatus.team === 1 ? "side-b" : "side-a"}${
                                canSwitch ? " can-switch" : ""
                            }`,
                            text: playerStatus.team === 1 ? "B" : "A",
                            title: canSwitch ? "Switch side" : "",
                            "data-playerid": playerStatus.playerId,
                            "data-team": playerStatus.team,
                        }),
                    );
                }
                let nameInput: JQuery<HTMLInputElement> | null = null;
                let submitButton: JQuery<HTMLDivElement> | null = null;
                if (this.editingName && playerStatus.self) {
                    nameInput = $("<input/>", {
                        type: "text",
                        tabindex: 0,
                        class: "name menu-option name-text name-self-input",
                        maxLength: net.Constants.PlayerNameMaxLen,
                    });
                    nameInput.val(playerStatus.name);
                    const submit = () => {
                        const name = helpers.sanitizeNameInput(nameInput!.val() as string);
                        playerStatus.name = name;
                        this.config.set("playerName", name);
                        this.sendMessage("changeName", {
                            name,
                        });
                        this.editingName = false;
                        this.refreshUi();
                    };
                    const abortEditing = () => {
                        this.editingName = false;
                        this.refreshUi();
                    };
                    nameInput.on("keydown", (e) => {
                        if (e.which === 13) {
                            submit();
                            return false;
                        }
                    });
                    nameInput.on("blur", abortEditing);
                    member.append(nameInput);
                    submitButton = $("<div/>", {
                        class: "icon icon-submit-name-change",
                    });
                    submitButton.on("click", submit);
                    submitButton.on("mousedown", (e) => {
                        e.preventDefault();
                        e.stopPropagation();
                    });
                } else {
                    // Name
                    let nameClass = "name-text";

                    if (playerStatus.self) {
                        nameClass += " name-self";
                    }
                    if (playerStatus.inGame) {
                        nameClass += " name-in-game";
                    }
                    const nameDiv = $("<div/>", {
                        class: `name menu-option ${nameClass}`,
                        html: helpers.htmlEscape(playerStatus.name),
                    });
                    if (playerStatus.self) {
                        nameDiv.on("click", () => {
                            this.editingName = true;
                            this.refreshUi();
                        });
                    }
                    member.append(nameDiv);
                }
                if (submitButton) {
                    member.append(submitButton);
                } else {
                    member.append(
                        $("<div/>", {
                            class: `icon ${playerStatus.inGame ? "icon-in-game" : ""}`,
                        }),
                    );
                }
                teamMembers.append(member);
                nameInput?.trigger("focus");
            }

            this.renderBotRows(teamMembers);

            $(".icon-kick", teamMembers).on("click", (e) => {
                const playerId = Number($(e.currentTarget).attr("data-playerid"));
                this.sendMessage("kick", {
                    playerId,
                });
            });

            // Play a sound if player count has increased
            const localPlayer = this.players.find((player) => {
                return player.playerId == this.localPlayerId;
            });
            const playJoinSound = localPlayer && !localPlayer.inGame;
            if (
                !document.hasFocus()
                && this.prevPlayerCount < this.players.length
                && this.players.length > 1
                && playJoinSound
            ) {
                this.audioManager.playSound("notification_join_01", {
                    channel: "ui",
                });
            }
            this.prevPlayerCount = this.players.length;
        }
    }
}
