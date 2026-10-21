import { z } from "zod";
import type { MapDefKey } from "../defs/mapDefs.ts";
import type { TeamMode } from "../gameConfig.ts";

export const zFindGameBody = z.object({
    region: z.string(),
    zones: z.array(z.string()),
    version: z.number(),
    playerCount: z.number(),
    autoFill: z.boolean(),
    gameModeIdx: z.number(),
    turnstileToken: z.string().optional(),
});

export type FindGameBody = z.infer<typeof zFindGameBody>;

export interface FindGameMatchData {
    urls: string[];
    joinToken: string;
}

/**
 * The single kit a party leader forces on everyone in a private match.
 * Heal counts are capped at what a level 3 backpack holds.
 */
export const zPrivateLoadout = z.object({
    primary: z.string().max(32),
    secondary: z.string().max(32),
    melee: z.string().max(32),
    throwable: z.string().max(32),
    /** how many of that throwable; capped by what the bag holds */
    throwableCount: z.number().int().min(0).max(40),
    /** 0 = no armor, 1-3 = helmet / chest tier */
    armor: z.number().int().min(0).max(3),
    bandage: z.number().int().min(0).max(30),
    healthkit: z.number().int().min(0).max(4),
    soda: z.number().int().min(0).max(15),
    painkiller: z.number().int().min(0).max(4),
});

export type PrivateLoadout = z.infer<typeof zPrivateLoadout>;

export const defaultPrivateLoadout: PrivateLoadout = {
    primary: "m4a1",
    secondary: "mp220",
    melee: "fists",
    throwable: "frag",
    throwableCount: 12,
    armor: 3,
    bandage: 30,
    healthkit: 4,
    soda: 15,
    painkiller: 4,
};

export const BotLevels = ["beginner", "intermediate", "advanced", "hacker"] as const;
export type BotLevel = (typeof BotLevels)[number];

export const MaxPrivateBots = 16;

/** one bot the party leader added to a private match, shown as a party row */
export const zPrivateBot = z.object({
    level: z.enum(BotLevels),
    /** 0 = Team A, 1 = Team B */
    team: z.number().int().min(0).max(1),
});
export type PrivateBot = z.infer<typeof zPrivateBot>;
export const zPrivateBots = z.array(zPrivateBot).max(MaxPrivateBots);
/** 50v50 maps: how many extra bots the leader can fill the match with */
export const MaxBotFill = 98;
export const BotFillCounts = [0, 10, 20, 30, 40, 50, 60, 70, 80, 90, MaxBotFill];

/** what a party leader can change about each bot level */
export const zBotSettings = z.object({
    /** go after enemies, including where they were last seen; off = hold ground */
    chase: z.boolean(),
    loot: z.boolean(),
    /** bandages and med kits */
    heal: z.boolean(),
    /** soda and pills */
    boost: z.boolean(),
    throwables: z.boolean(),
    /** switch to melee when the target is within reach */
    melee: z.boolean(),
    /** percent of shots aimed on target */
    accuracy: z.number().int().min(0).max(100),
    /** percent of bullets and grenades dodged */
    dodge: z.number().int().min(0).max(100),
    /** spawn with this exact kit; null = the match's normal kit or loot */
    kit: zPrivateLoadout.nullable(),
});
export type BotSettings = z.infer<typeof zBotSettings>;

export const zBotSettingsByLevel = z.object({
    beginner: zBotSettings,
    intermediate: zBotSettings,
    advanced: zBotSettings,
    hacker: zBotSettings,
});
export type BotSettingsByLevel = z.infer<typeof zBotSettingsByLevel>;

/** the out-of-the-box numbers for each level (the server's bot skills match these) */
const levelAimDodge: Record<BotLevel, [number, number]> = {
    beginner: [35, 20],
    intermediate: [50, 35],
    advanced: [75, 70],
    hacker: [100, 90],
};

export function defaultBotSettings(): BotSettingsByLevel {
    const settings = {} as BotSettingsByLevel;
    for (const level of BotLevels) {
        const [accuracy, dodge] = levelAimDodge[level];
        settings[level] = {
            chase: true,
            loot: true,
            heal: true,
            boost: true,
            throwables: true,
            melee: true,
            accuracy,
            dodge,
            kit: null,
        };
    }
    // hackers come with a pair of AWM-S
    settings.hacker.kit = { ...defaultPrivateLoadout, primary: "awc", secondary: "awc" };
    return settings;
}

/** private match against bots: bot teammates fill your side, the other side is all bots */
export const zVsBots = z.object({
    ally: z.enum(BotLevels),
    allies: z.number().int().min(0).max(4),
    enemy: z.enum(BotLevels),
    enemies: z.number().int().min(1).max(4),
});
export type VsBots = z.infer<typeof zVsBots>;

export const loadoutSchema = z.object({
    outfit: z.string(),
    melee: z.string(),
    heal: z.string(),
    boost: z.string(),
    player_icon: z.string(),
    crosshair: z.object({
        type: z.string(),
        color: z.number(),
        size: z.string(),
        stroke: z.string(),
    }),
    emotes: z.array(z.string()).length(6),
});

export type FindGameError =
    | "banned"
    | "behind_proxy"
    | "find_game_failed"
    | "full"
    | "invalid_captcha"
    | "invalid_ip"
    | "invalid_protocol"
    | "invalid_region"
    | "join_game_failed"
    | "mode_disabled"
    | "rate_limited";

export type FindGamePrivateError =
    | "find_game_failed"
    | "full"
    | "invalid_protocol"
    | "invalid_region";

export type GameWsDisconnectReason =
    | "behind_proxy"
    | "full"
    | "host_closed"
    | "invalid_packet"
    | "invalid_protocol"
    | "invalid_token"
    | "ip_banned"
    | "player_not_found"
    | "rate_limited"
    | "server_crashed"
    | "server_restart";

export type FindGameResponse =
    | {
        type: "success";
        res: FindGameMatchData;
    }
    | {
        type: "error";
        error: FindGameError;
    }
    | {
        type: "banned";
        reason: string;
        permanent: boolean;
        expiresIn: Date | string;
    };

export interface SiteInfoRes {
    country: string;
    gitRevision: string;
    captchaEnabled: boolean;
    modes: Array<{
        mapName: string;
        teamMode: TeamMode;
        enabled: boolean;
    }>;
    clientTheme: MapDefKey;
    pops: Record<
        string,
        {
            playerCount: number;
            l10n: string;
        }
    >;
    youtube: {
        name: string;
        link: string;
    };
    twitch: Array<{
        name: string;
        viewers: number;
        url: string;
        img: string;
    }>;
}

export interface ProxyDef {
    apiUrl?: string;
    google?: boolean;
    discord?: boolean;
    mock?: boolean;
    all?: boolean;
}
