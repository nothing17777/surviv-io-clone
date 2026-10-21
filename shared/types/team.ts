// /api/team_v2 websocket msgs typing

import { z } from "zod";
import type { CustomMapSummary } from "../utils/customMap.ts";
import { type BotCounts, type FindGameMatchData, type PrivateLoadout, zBotCounts, zPrivateLoadout } from "./api.ts";

export type TeamMenuErrorType =
    | "join_full"
    | "join_not_found"
    | "join_failed"
    | "create_failed"
    | "lost_conn"
    | "join_game_failed"
    | "find_game_error"
    | "find_game_full"
    | "find_game_invalid_protocol"
    | "find_game_invalid_captcha"
    | "private_teams_invalid"
    | "custom_map_invalid"
    | "kicked"
    | "banned"
    | "behind_proxy"
    | "rate_limited";

export interface RoomData {
    roomUrl: string;
    findingGame: boolean;
    lastError: TeamMenuErrorType | undefined;
    region: string;
    autoFill: boolean;
    enabledGameModeIdxs: number[];
    gameModeIdx: number;
    maxPlayers: number;
    captchaEnabled: boolean;
    /** private party match: only this party, split into Team A / Team B */
    privateMatch: boolean;
    privateMapName: string;
    /** players per side, 1-4 (1v1 .. 4v4) */
    privateTeamSize: number;
    privateGodLoadout: boolean;
    /** god kit, but one kit chosen by the leader instead of each player's own */
    privateSharedKit: boolean;
    /** the one kit everyone spawns with when privateGodLoadout is on */
    privateLoadout: PrivateLoadout;
    /** map uploaded from the map maker; when set it replaces privateMapName */
    customMap: CustomMapSummary | null;
    /** bots of each level added to the private match, all 0 = no bots */
    privateBots: BotCounts;
}

//
// Team msgs that the server sends to clients
//

/**
 * send by the server to all clients to make them join the game
 */
export interface TeamJoinGameMsg {
    readonly type: "joinGame";
    data: FindGameMatchData;
}

export interface TeamMenuPlayer {
    name: string;
    playerId: number;
    isLeader: boolean;
    inGame: boolean;
    /** private match side, 0 = Team A, 1 = Team B */
    team: number;
}

/**
 * Send by the server to update the client team ui
 */
export interface TeamStateMsg {
    readonly type: "state";
    data: {
        localPlayerId: number; // always -1 by default since it can only be set when the socket is actually sending state to each individual client
        room: RoomData;
        players: TeamMenuPlayer[];
    };
}

/**
 * Send by the server when the player gets kicked from the team room
 */
export interface TeamKickedMsg {
    readonly type: "kicked";
    data: {};
}

export interface TeamErrorMsg {
    readonly type: "error";
    data: {
        type: TeamMenuErrorType;
    };
}

export type ServerToClientTeamMsg =
    | TeamJoinGameMsg
    | TeamStateMsg
    | TeamKeepAliveMsg
    | TeamKickedMsg
    | TeamErrorMsg;

//
// Team Msgs that the client sends to the server
//

export const zClientRoomData = z.object({
    roomUrl: z.string(),
    findingGame: z.boolean(),
    lastError: z.string().optional(),
    region: z.string(),
    autoFill: z.boolean(),
    gameModeIdx: z.number(),
    privateMatch: z.boolean().optional(),
    privateSharedKit: z.boolean().optional(),
    privateLoadout: zPrivateLoadout.optional(),
    privateMapName: z.string().optional(),
    privateTeamSize: z.number().optional(),
    privateGodLoadout: z.boolean().optional(),
    privateBots: zBotCounts.optional(),
});

export type ClientRoomData = z.infer<typeof zClientRoomData>;

export const zKeepAliveMsg = z.object({
    type: z.literal("keepAlive"),
    data: z.object({}).optional(),
});
export type TeamKeepAliveMsg = z.infer<typeof zKeepAliveMsg>;

export const zTeamJoinMsg = z.object({
    type: z.literal("join"),
    data: z.object({
        roomUrl: z.string(),
        playerData: z.object({
            name: z.string(),
        }),
    }),
});
export type TeamJoinMsg = z.infer<typeof zTeamJoinMsg>;

export const zTeamChangeNameMsg = z.object({
    type: z.literal("changeName"),
    data: z.object({
        name: z.string(),
    }),
});

export type TeamChangeNameMsg = z.infer<typeof zTeamChangeNameMsg>;

export const zTeamSetRoomPropsMsg = z.object({
    type: z.literal("setRoomProps"),
    data: zClientRoomData,
});

export type TeamSetRoomPropsMsg = z.infer<typeof zTeamSetRoomPropsMsg>;

export const zTeamCreateMsg = z.object({
    type: z.literal("create"),
    data: z.object({
        roomData: zClientRoomData,
        playerData: z.object({
            name: z.string(),
        }),
    }),
});

export type TeamCreateMsg = z.infer<typeof zTeamCreateMsg>;

export const zTeamKickMsg = z.object({
    type: z.literal("kick"),
    data: z.object({
        playerId: z.number(),
    }),
});

export type TeamKickMsg = z.infer<typeof zTeamKickMsg>;

export const zTeamPlayGameMsg = z.object({
    type: z.literal("playGame"),
    data: z.object({
        version: z.number(),
        region: z.string(),
        zones: z.array(z.string()),
        turnstileToken: z.string().optional(),
    }),
});

export type TeamPlayGameMsg = z.infer<typeof zTeamPlayGameMsg>;

export const zTeamSetTeamMsg = z.object({
    type: z.literal("setTeam"),
    data: z.object({
        playerId: z.number(),
        team: z.number(),
    }),
});

export type TeamSetTeamMsg = z.infer<typeof zTeamSetTeamMsg>;

/** the whole map file, or null to go back to the normal maps */
export const zTeamSetCustomMapMsg = z.object({
    type: z.literal("setCustomMap"),
    data: z.object({
        map: z.unknown(),
    }),
});

export type TeamSetCustomMapMsg = z.infer<typeof zTeamSetCustomMapMsg>;

export const zGameCompleteMsg = z.object({
    type: z.literal("gameComplete"),
    data: z.object({}).optional(),
});

export type TeamGameCompleteMsg = z.infer<typeof zGameCompleteMsg>;

export const zTeamClientMsg = z.discriminatedUnion("type", [
    zTeamCreateMsg,
    zTeamSetRoomPropsMsg,
    zTeamJoinMsg,
    zTeamPlayGameMsg,
    zTeamKickMsg,
    zTeamChangeNameMsg,
    zTeamSetTeamMsg,
    zTeamSetCustomMapMsg,
    zGameCompleteMsg,
    zKeepAliveMsg,
]);

export type ClientToServerTeamMsg =
    | TeamKeepAliveMsg
    | TeamJoinMsg
    | TeamChangeNameMsg
    | TeamSetRoomPropsMsg
    | TeamCreateMsg
    | TeamKickMsg
    | TeamSetTeamMsg
    | TeamSetCustomMapMsg
    | TeamGameCompleteMsg
    | TeamPlayGameMsg;
