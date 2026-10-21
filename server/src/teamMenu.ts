import type { Hono } from "hono";
import { getCookie } from "hono/cookie";
import type { UpgradeWebSocket, WSContext } from "hono/ws";
import { randomUUID } from "node:crypto";
import { type MapDefKey, MapDefs } from "../../shared/defs/mapDefs.ts";
import {
    defaultBotSettings,
    defaultPrivateLoadout,
    type FindGamePrivateError,
    type PrivateBot,
} from "../../shared/types/api.ts";
import {
    type ClientRoomData,
    type ClientToServerTeamMsg,
    type RoomData,
    type ServerToClientTeamMsg,
    type TeamErrorMsg,
    type TeamMenuErrorType,
    type TeamMenuPlayer,
    type TeamPlayGameMsg,
    zTeamClientMsg,
} from "../../shared/types/team.ts";
import { type CustomMap, CustomMapLimits, parseCustomMap, summarizeCustomMap } from "../../shared/utils/customMap.ts";
import { assert, util } from "../../shared/utils/util.ts";
import { getFindGamePlayerData, getHonoIp, verifyTurnsStile } from "./api/apiHelpers.ts";
import type { ApiServer } from "./api/apiServer.ts";
import { validateSessionToken } from "./api/auth/index.ts";
import { hashIp, isBanned } from "./api/routes/private/ModerationRouter.ts";
import { Config } from "./config.ts";
import { validateUserName } from "./utils/badWords.ts";
import { ServerLogger } from "./utils/logger.ts";
import { isBehindProxy } from "./utils/proxyCheck.ts";
import { HTTPRateLimit, WebSocketRateLimit } from "./utils/rateLimit.ts";
import type { FindGamePrivateBody } from "./utils/types.ts";

interface SocketData {
    rateLimit: Record<symbol, number>;
    player: Player;
    ip: string;
}

class Player {
    room?: Room;

    name = "Player";

    inGame = false;

    /** private match side, 0 = Team A, 1 = Team B */
    team = 0;

    get isLeader() {
        // first player is always leader
        return !!this.room && this.room.players[0] == this;
    }

    get playerId() {
        return this.room ? this.room.players.indexOf(this) : -1;
    }

    get data(): TeamMenuPlayer {
        return {
            name: this.name,
            inGame: this.inGame,
            isLeader: this.isLeader,
            playerId: this.playerId,
            team: this.team,
        };
    }

    lastMsgTime = Date.now();

    disconnectTimeout: ReturnType<typeof setTimeout>;

    encodedIp: string;

    constructor(
        public socket: WSContext<SocketData>,
        public teamMenu: TeamMenu,
        public userId: string | null,
        public ip: string,
    ) {
        this.encodedIp = hashIp(ip);
        // disconnect if didn't join a room in 5 seconds
        this.disconnectTimeout = setTimeout(() => {
            if (!this.room) {
                this.socket.close();
            }
        }, 5000);
    }

    setName(name: string) {
        this.name = validateUserName(name).validName;
    }

    send<T extends ServerToClientTeamMsg["type"]>(
        type: T,
        data: (ServerToClientTeamMsg & { type: T })["data"],
    ) {
        this.socket.send(
            JSON.stringify({
                type,
                data,
            }),
        );
    }
}

class Room {
    players: Player[] = [];

    data: RoomData = {
        roomUrl: "",
        findingGame: false,
        lastError: undefined,
        region: "",
        autoFill: true,
        enabledGameModeIdxs: [],
        gameModeIdx: 1,
        maxPlayers: 4,
        captchaEnabled: false,
        privateMatch: false,
        privateMapName: "duel",
        privateTeamSize: 1,
        privateGodLoadout: true,
        privateSharedKit: true,
        privateAllyBotsSameKit: true,
        privateEnemyBotsSameKit: true,
        privateLoadout: { ...defaultPrivateLoadout },
        customMap: null,
        privateBots: [],
        privateVsBots: false,
        privateBotEnemy: "intermediate",
        privateBotAlly: "intermediate",
        privateBotFill: 0,
        privateBotSettings: defaultBotSettings(),
    };

    /** the full map file; data.customMap is just its summary for the menu */
    customMap: CustomMap | null = null;

    constructor(
        public teamMenu: TeamMenu,
        public id: string,
        initialData: ClientRoomData,
    ) {
        this.data.roomUrl = `#${id}`;
        this.data.enabledGameModeIdxs = teamMenu.allowedGameModeIdxs();
        this.data.captchaEnabled = teamMenu.server.captchaEnabled;

        this.setProps(initialData);
    }

    addPlayer(player: Player) {
        if (this.players.length >= this.data.maxPlayers) return;

        this.players.push(player);
        player.room = this;
        // keep private match sides even: join the smaller one
        const teamA = this.players.filter((p) => p !== player && p.team === 0).length;
        const teamB = this.players.filter((p) => p !== player && p.team === 1).length;
        player.team = teamB < teamA ? 1 : 0;

        clearTimeout(player.disconnectTimeout);

        this.sendState();
    }

    onMsg(player: Player, msg: ClientToServerTeamMsg) {
        if (player.room !== this) return;

        player.lastMsgTime = Date.now();
        switch (msg.type) {
            case "changeName": {
                player.setName(msg.data.name);
                this.sendState();
                break;
            }
            case "keepAlive": {
                player.send("keepAlive", {});
                break;
            }
            case "gameComplete": {
                player.inGame = false;
                this.sendState();
                break;
            }
            case "setRoomProps": {
                if (!player.isLeader) break;
                this.setProps(msg.data);
                break;
            }
            case "kick": {
                if (!player.isLeader) break;
                this.kick(msg.data.playerId);
                break;
            }
            case "setTeam": {
                // players pick their own side, the leader can move anyone
                const target = this.players[msg.data.playerId];
                if (!target) break;
                if (target !== player && !player.isLeader) break;
                target.team = msg.data.team === 1 ? 1 : 0;
                this.sendState();
                break;
            }
            case "playGame": {
                if (!player.isLeader) break;
                this.findGame(msg.data);
                break;
            }
            case "setCustomMap": {
                if (!player.isLeader || this.data.findingGame) break;
                if (msg.data.map === null) {
                    this.customMap = null;
                    this.data.customMap = null;
                } else {
                    const res = parseCustomMap(msg.data.map);
                    if ("error" in res) {
                        this.data.lastError = "custom_map_invalid";
                    } else {
                        this.customMap = res.map;
                        this.data.customMap = summarizeCustomMap(res.map);
                        this.data.lastError = undefined;
                    }
                }
                this.sendState();
                break;
            }
        }
    }

    setProps(props: ClientRoomData) {
        let region = props.region;
        if (!(region in Config.regions)) {
            region = Object.keys(Config.regions)[0];
        }
        this.data.region = region;

        let gameModeIdx = props.gameModeIdx;

        const modes = this.teamMenu.server.modes;

        if (!this.data.enabledGameModeIdxs.includes(gameModeIdx)) {
            // we don't allow creating teams if there's no valid team mode
            // so this will never be -1
            gameModeIdx = modes.findIndex((mode) => isPartyMode(mode));
        }

        this.data.gameModeIdx = gameModeIdx;

        this.data.autoFill = props.autoFill;

        this.data.privateMatch = !!props.privateMatch;
        const mapNames = this.teamMenu.privateMapNames();
        if (props.privateMapName && mapNames.includes(props.privateMapName)) {
            this.data.privateMapName = props.privateMapName;
        } else if (!mapNames.includes(this.data.privateMapName)) {
            this.data.privateMapName = mapNames[0];
        }
        this.data.privateTeamSize = Math.min(
            4,
            Math.max(1, Math.round(props.privateTeamSize ?? this.data.privateTeamSize)),
        );
        this.data.privateGodLoadout = props.privateGodLoadout ?? this.data.privateGodLoadout;
        this.data.privateSharedKit = props.privateSharedKit ?? this.data.privateSharedKit;
        this.data.privateAllyBotsSameKit = props.privateAllyBotsSameKit ?? this.data.privateAllyBotsSameKit;
        this.data.privateEnemyBotsSameKit = props.privateEnemyBotsSameKit ?? this.data.privateEnemyBotsSameKit;
        this.data.privateBotAllyKit = props.privateBotAllyKit ?? this.data.privateBotAllyKit;
        this.data.privateBotEnemyKit = props.privateBotEnemyKit ?? this.data.privateBotEnemyKit;
        // the leader owns the kit; zod already clamped the numbers
        if (props.privateLoadout) {
            this.data.privateLoadout = props.privateLoadout;
        }
        // zod already capped the list at the max bot count
        if (props.privateBots) this.data.privateBots = props.privateBots;
        this.data.privateVsBots = props.privateVsBots ?? this.data.privateVsBots;
        this.data.privateBotEnemy = props.privateBotEnemy ?? this.data.privateBotEnemy;
        this.data.privateBotAlly = props.privateBotAlly ?? this.data.privateBotAlly;
        this.data.privateBotFill = props.privateBotFill ?? this.data.privateBotFill;
        this.data.privateBotSettings = props.privateBotSettings ?? this.data.privateBotSettings;

        // a private match holds both sides, so up to 8 players
        this.data.maxPlayers = this.data.privateMatch ? 8 : modes[gameModeIdx].teamMode;

        // kick players that don't fit on the new max players
        while (this.players.length > this.data.maxPlayers) {
            this.kick(this.players.length - 1);
        }

        this.sendState();
    }

    kick(playerId: number) {
        const player = this.players[playerId];
        if (!player) return;

        player.send("kicked", {});

        this.removePlayer(player);
    }

    removePlayer(player: Player) {
        if (!util.removeFrom(this.players, player)) {
            return;
        }

        player.room = undefined;
        player.socket.close();

        this.sendState();

        if (!this.players.length) {
            this.teamMenu.removeRoom(this);
        }
    }

    /** 50v50 maps: the leader's bot count, alternating sides */
    botFill(customMap: CustomMap | null): PrivateBot[] {
        const def = MapDefs[this.data.privateMapName as MapDefKey];
        if (customMap || !def?.gameMode.factionMode) return [];
        return Array.from({ length: this.data.privateBotFill }, (_, i) => ({ level: "intermediate", team: i % 2 }));
    }

    findGameCooldown = 0;

    async findGame(data: TeamPlayGameMsg["data"]) {
        if (this.data.findingGame) return;
        if (this.players.some((p) => p.inGame)) return;
        const roomLeader = this.players[0];
        if (!roomLeader) return;

        this.data.findingGame = true;
        this.sendState();

        let region = data.region;
        if (!(region in Config.regions)) {
            region = Object.keys(Config.regions)[0];
        }
        this.data.region = region;

        const tokenMap = new Map<Player, string>();

        const playerData = await getFindGamePlayerData(
            this.players.map((player) => {
                const joinToken = randomUUID();
                tokenMap.set(player, joinToken);
                return {
                    joinToken,
                    userId: player.userId,
                    ip: player.ip,
                } satisfies FindGamePrivateBody["playerData"][0];
            }),
        );

        const mode = this.teamMenu.server.modes[this.data.gameModeIdx];
        if (!this.data.privateMatch && (!mode || !mode.enabled)) {
            return;
        }

        if (this.data.privateMatch) {
            const size = this.data.privateTeamSize;
            const sideA = this.data.privateVsBots
                ? this.players.length
                : this.players.filter((p) => p.team === 0).length;
            const sideB = this.players.length - sideA;
            if (sideA > size || sideB > size) {
                this.data.lastError = "private_teams_invalid";
                this.data.findingGame = false;
                this.sendState();
                return;
            }
            playerData.forEach((data, i) => {
                // vs bots: the whole party is Team A
                data.team = this.data.privateVsBots ? 0 : this.players[i].team;
            });
        }

        if (this.data.captchaEnabled) {
            if (!data.turnstileToken) {
                this.data.lastError = "find_game_invalid_captcha";
                this.sendState();
                return;
            }

            try {
                if (!(await verifyTurnsStile(data.turnstileToken, roomLeader.ip))) {
                    this.data.lastError = "find_game_invalid_captcha";
                    this.sendState();
                    return;
                }
            } catch (err) {
                this.teamMenu.logger.error("Failed verifying turnstile:", err);
                this.data.lastError = "find_game_error";
                this.sendState();
                return;
            }
        }

        const customMap = this.data.privateMatch ? this.customMap : null;
        const res = await this.teamMenu.server.findGame({
            mapName: customMap ? customMap.biome : this.data.privateMatch ? this.data.privateMapName : mode.mapName,
            teamMode: this.data.privateMatch ? this.data.privateTeamSize : mode.teamMode,
            privateMatch: this.data.privateMatch
                ? {
                    godLoadout: this.data.privateGodLoadout,
                    // without this every player keeps their own picks
                    loadout: this.data.privateSharedKit ? this.data.privateLoadout : undefined,
                    // vs bots puts the party on side 0
                    leaderSide: this.data.privateVsBots ? 0 : (this.players[0]?.team ?? 0),
                    allyBotsSameKit: this.data.privateAllyBotsSameKit,
                    enemyBotsSameKit: this.data.privateEnemyBotsSameKit,
                    allyBotKit: this.data.privateBotAllyKit,
                    enemyBotKit: this.data.privateBotEnemyKit,
                    customMap: customMap ?? undefined,
                    bots: this.data.privateVsBots ? undefined : [...this.data.privateBots, ...this.botFill(customMap)],
                    botSettings: this.data.privateBotSettings,
                    vsBots: this.data.privateVsBots
                        ? {
                            ally: this.data.privateBotAlly,
                            allies: Math.max(0, this.data.privateTeamSize - this.players.length),
                            enemy: this.data.privateBotEnemy,
                            enemies: this.data.privateTeamSize,
                        }
                        : undefined,
                }
                : undefined,
            autoFill: this.data.privateMatch ? false : this.data.autoFill,
            region: region,
            version: data.version,
            playerData,
        });

        if ("error" in res) {
            const errMap: Partial<Record<FindGamePrivateError, TeamMenuErrorType>> = {
                full: "find_game_full",
                invalid_protocol: "find_game_invalid_protocol",
            };

            this.data.lastError = errMap[res.error] || "find_game_error";
            this.sendState();
            // 1 second cooldown on error
            this.findGameCooldown = Date.now() + 1000;
            return;
        }

        this.findGameCooldown = Date.now() + 5000;

        const joinData = res;
        if (!joinData) return;

        this.data.lastError = undefined;

        for (const player of this.players) {
            player.inGame = true;
            const token = tokenMap.get(player);

            if (!token) {
                this.teamMenu.logger.warn(`Missing token for player ${player.name}`);
                continue;
            }

            player.send("joinGame", {
                joinToken: token,
                urls: res.urls,
            });
        }

        this.sendState();
    }

    sendState() {
        const players = this.players.map((p) => p.data);
        // all players must be logged in to disable it
        this.data.captchaEnabled = this.teamMenu.server.captchaEnabled && !this.players.every((p) => !!p.userId);
        for (const player of this.players) {
            player.send("state", {
                localPlayerId: player.playerId,
                room: this.data,
                players,
            });
        }
    }
}

const teamCodeCharacters = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz123456789";
function generateTeamCode(): string {
    let str = "";
    for (let i = 0; i < 4; i++) {
        str += teamCodeCharacters.charAt(
            Math.floor(Math.random() * teamCodeCharacters.length),
        );
    }
    return `${str}`;
}

/** team modes, plus 1v1 duels so a party leader can host those too */
function isPartyMode(mode: { mapName: MapDefKey; teamMode: number; enabled: boolean }) {
    return mode.enabled && (mode.teamMode > 1 || !!MapDefs[mode.mapName]?.gameMode.duelMode);
}

export class TeamMenu {
    rooms = new Map<string, Room>();

    logger = new ServerLogger("TeamMenu");

    playersByIp = new Map<string, Set<Player>>();

    constructor(public server: ApiServer) {
        setInterval(() => {
            for (const room of this.rooms.values()) {
                // just making sure ig
                if (!room.players.length) {
                    this.removeRoom(room);
                    continue;
                }
                if (room.data.findingGame && room.findGameCooldown < Date.now()) {
                    room.data.findingGame = false;
                    room.sendState();
                }

                // kick players that haven't sent a keep alive msg in over a minute
                // client sends it every 45 seconds
                for (const player of room.players) {
                    if (player.lastMsgTime < Date.now() - 8 * 60 * 1000) {
                        player.send("error", { type: "lost_conn" });
                        room.removePlayer(player);
                    }
                }
            }
        }, 1000);
    }

    /** maps a private match can use: every map that has a mode in the config */
    privateMapNames() {
        const names: string[] = [];
        for (const mode of this.server.modes) {
            if (mode.enabled && !names.includes(mode.mapName)) names.push(mode.mapName);
        }
        return names;
    }

    allowedGameModeIdxs() {
        return this.server.modes
            .map((_, i) => i)
            .filter((i) => {
                return isPartyMode(this.server.modes[i]);
            });
    }

    init(app: Hono, upgradeWebSocket: UpgradeWebSocket) {
        const teamMenu = this;

        const httpRateLimit = new HTTPRateLimit(5, 2000);
        const wsRateLimit = new WebSocketRateLimit(50, 1000, 5);

        app.get(
            "/team_v2",
            upgradeWebSocket(async (c) => {
                const ip = getHonoIp(c, Config.apiServer.proxyIPHeader);

                let closeReason: TeamMenuErrorType | undefined;
                if (
                    !ip
                    || httpRateLimit.isRateLimited(ip)
                    || wsRateLimit.isIpRateLimited(ip)
                ) {
                    closeReason = "rate_limited";
                }

                if (await isBanned(ip!)) {
                    closeReason = "banned";
                }

                wsRateLimit.ipConnected(ip!);

                let userId: string | null = null;
                const sessionId = getCookie(c, "session") ?? null;

                if (sessionId) {
                    try {
                        const account = await validateSessionToken(sessionId);
                        userId = account.user?.id || null;

                        if (account.user?.banned) {
                            userId = null;
                        }
                    } catch (err) {
                        this.logger.error(`Failed to validate session:`, err);
                        userId = null;
                    }
                }

                if (!closeReason && (await isBehindProxy(ip!, !userId))) {
                    closeReason = "behind_proxy";
                }

                return {
                    onOpen(_event, ws) {
                        ws.raw = {
                            ip,
                            rateLimit: {},
                            player: undefined,
                        };

                        if (closeReason) {
                            ws.send(
                                JSON.stringify(
                                    {
                                        type: "error",
                                        data: {
                                            type: closeReason as TeamMenuErrorType,
                                        },
                                    } satisfies TeamErrorMsg,
                                ),
                            );
                            teamMenu.logger.warn(`closed socket for ${closeReason}`);
                            ws.close();
                            return;
                        }
                        teamMenu.onOpen(ws as WSContext<SocketData>, userId, ip!);
                    },

                    onMessage(event, ws) {
                        const data = ws.raw! as SocketData;

                        if (wsRateLimit.isRateLimited(data.rateLimit)) {
                            teamMenu.logger.warn("Rate limited, closing socket.");
                            ws.close();
                            return;
                        }

                        try {
                            teamMenu.onMsg(
                                ws as WSContext<SocketData>,
                                event.data as string,
                            );
                        } catch (err) {
                            teamMenu.logger.error("Error processing message:", err);
                            ws.close();
                        }
                    },

                    onClose(_event, ws) {
                        teamMenu.onClose(ws as WSContext<SocketData>);

                        const data = ws.raw! as SocketData;
                        wsRateLimit.ipDisconnected(data.ip);
                    },
                };
            }),
        );
    }

    onOpen(ws: WSContext<SocketData>, userId: string | null, ip: string) {
        const player = new Player(ws, this, userId, ip);
        ws.raw!.player = player;

        let players = this.playersByIp.get(player.encodedIp);
        if (!players) {
            players = new Set();
            this.playersByIp.set(player.encodedIp, players);
        }
        players.add(player);
    }

    onMsg(ws: WSContext<SocketData>, data: string) {
        let msg: ClientToServerTeamMsg;
        try {
            // map uploads are the one big message; everything else stays tiny
            assert(data.length < CustomMapLimits.maxBytes + 1024);
            msg = JSON.parse(data);
            zTeamClientMsg.parse(msg);
            // room data carries the bot list and per-level bot settings; zod bounds every field
            assert(msg.type === "setCustomMap" || data.length < 8192);
        } catch (e) {
            this.logger.warn("Failed to parse message, closing socket.", e);
            ws.close();
            return;
        }

        const player = ws.raw?.player;
        // i really don't think this is necessary but /shrug
        if (!player) {
            this.logger.warn("Player not found, closing socket.");
            ws.close();
            return;
        }

        // handle creation and joining messages
        // other messages are handled on the player class
        if (!player.room) {
            switch (msg.type) {
                case "create": {
                    // don't allow creating a team if there's no team mode enabled
                    if (!this.allowedGameModeIdxs().length) {
                        player.send("error", { type: "create_failed" });
                        break;
                    }

                    player.setName(msg.data.playerData.name);

                    const room = this.createRoom(msg.data.roomData);
                    room.addPlayer(player);

                    break;
                }
                case "join": {
                    const room = this.rooms.get(msg.data.roomUrl);
                    if (!room) {
                        player.send("error", { type: "join_not_found" });
                        break;
                    }

                    if (room.players.length >= room.data.maxPlayers) {
                        player.send("error", { type: "join_full" });
                        break;
                    }
                    player.setName(msg.data.playerData.name);

                    room.addPlayer(player);
                }
            }
        }

        // player.room is set on room.addPlayer
        // if we don't have a room at this point it meant both creation and joining failed
        // so close the socket
        if (!player.room) {
            this.logger.debug("Player not in room, closing socket.");
            ws.close();
            return;
        }

        // handle messages for when the player is already inside a room
        player.room.onMsg(player, msg);
    }

    onClose(ws: WSContext<SocketData>) {
        const player = ws.raw?.player;

        if (!player) {
            this.logger.debug("Player not found, closing socket.");
            ws.close();
            return;
        }

        const byIp = this.playersByIp.get(player.encodedIp);
        if (byIp) {
            byIp.delete(player);
            if (byIp.size === 0) {
                this.playersByIp.delete(player.encodedIp);
            }
        }

        // meh just to make sure we dont keep timeouts with references hanging
        // not like it matters because its 5 seconds...
        clearTimeout(player.disconnectTimeout);

        if (player.room) {
            player.room.removePlayer(player);
        }
    }

    createRoom(data: ClientRoomData) {
        let roomUrl = generateTeamCode();
        while (this.rooms.has(roomUrl)) {
            roomUrl = generateTeamCode();
        }

        const room = new Room(this, roomUrl, data);
        this.rooms.set(roomUrl, room);
        return room;
    }

    removeRoom(room: Room) {
        this.rooms.delete(room.id);
    }

    disconnectPlayers(encodedIp: string) {
        const players = this.playersByIp.get(encodedIp);
        if (!players) return;

        for (const player of players) {
            player.socket.close();
        }
        players.clear();
        this.playersByIp.delete(encodedIp);
    }
}
