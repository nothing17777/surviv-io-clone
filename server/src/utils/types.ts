import { z } from "zod";
import type { MapDefKey } from "../../../shared/defs/mapDefs.ts";
import { TeamMode } from "../../../shared/gameConfig.ts";
import {
    type BotSettingsByLevel,
    type FindGameMatchData,
    type FindGamePrivateError,
    loadoutSchema,
    MaxBotFill,
    MaxPrivateBots,
    type PrivateBot,
    type PrivateLoadout,
    type VsBots,
    zBotSettingsByLevel,
    zPrivateBot,
    zPrivateLoadout,
    zVsBots,
} from "../../../shared/types/api.ts";
import { zSpectateFilter } from "../../../shared/types/moderation.ts";
import { type CustomMap, zCustomMap } from "../../../shared/utils/customMap.ts";
import type { MatchDataTable } from "../api/db/schema.ts";

export const zUpdateRegionBody = z.object({
    regionId: z.string(),
    data: z.object({
        playerCount: z.number(),
    }),
});
export type UpdateRegionBody = z.infer<typeof zUpdateRegionBody>;

export const zSetGameModeBody = z.object({
    index: z.number(),
    team_mode: z.enum(TeamMode).optional(),
    map_name: z.string().optional(),
    enabled: z.boolean().optional(),
});

export const zSetClientThemeBody = z.object({
    theme: z.string(),
});

export interface SaveGameBody {
    matchData: (MatchDataTable & { ip: string; findGameIp: string })[];
}

export interface ServerGameConfig {
    readonly mapName: MapDefKey;
    readonly teamMode: TeamMode;
    /** set for a party's private match: duel rules (two sides) on any map */
    readonly privateMatch?: {
        godLoadout: boolean;
        /** the one kit every player spawns with */
        loadout?: PrivateLoadout;
        /** the party leader's side, so bots know whether they're teammates */
        leaderSide?: number;
        /** Same Kit: whether bots on the leader's side / the other side get it */
        allyBotsSameKit?: boolean;
        enemyBotsSameKit?: boolean;
        /** killed players drop nothing */
        noKillLoot?: boolean;
        /** everyone (bots too) spawns with fists and nothing else */
        emptyInventory?: boolean;
        /** weapons for bots on the leader's side / the other side, over their level's kit */
        allyBotKit?: PrivateLoadout;
        enemyBotKit?: PrivateLoadout;
        /** a map made in the map maker; mapName is then its biome */
        customMap?: CustomMap;
        /** bots the party leader added */
        bots?: PrivateBot[];
        vsBots?: VsBots;
        botSettings?: BotSettingsByLevel;
        /** recorded for a video: bots come in without waiting for a human, who only spectates */
        film?: boolean;
        /** film matches: name for the first non-hacker bot on side 0, so the camera can follow it */
        filmStar?: string;
        /** bots with a side kit keep it: no picking up weapons (melee-only and one-gun episodes) */
        lockedKits?: boolean;
    };
}

export const zFindGamePrivateBody = z.object({
    region: z.string(),
    version: z.number(),
    autoFill: z.boolean(),
    mapName: z.string(),
    teamMode: z.number(),
    playerData: z.array(
        z.object({
            joinToken: z.string(),
            userId: z.string().nullable(),
            ip: z.string(),
            loadout: loadoutSchema.optional(),
            quests: z.array(z.string()).optional(),
            /** private match side */
            team: z.number().optional(),
        }),
    ),
    privateMatch: z
        .object({
            godLoadout: z.boolean(),
            loadout: zPrivateLoadout.optional(),
            leaderSide: z.number().int().min(0).max(1).optional(),
            allyBotsSameKit: z.boolean().optional(),
            enemyBotsSameKit: z.boolean().optional(),
            noKillLoot: z.boolean().optional(),
            emptyInventory: z.boolean().optional(),
            allyBotKit: zPrivateLoadout.optional(),
            enemyBotKit: zPrivateLoadout.optional(),
            customMap: zCustomMap.optional(),
            // custom bots plus the 50v50 fill
            bots: z.array(zPrivateBot).max(MaxPrivateBots + MaxBotFill).optional(),
            vsBots: zVsBots.optional(),
            botSettings: zBotSettingsByLevel.optional(),
            film: z.boolean().optional(),
            filmStar: z.string().max(32).optional(),
            lockedKits: z.boolean().optional(),
        })
        .optional(),
});

export type FindGamePrivateBody = z.infer<typeof zFindGamePrivateBody>;

export type FindGamePrivateRes =
    | {
        urls: string[];
    }
    | { error: FindGamePrivateError };

export type SpectateGamePrivateRes = {
    players: Array<{
        gameId: string;
        mapName: MapDefKey;
        teamMode: TeamMode;
        data: FindGameMatchData;
    }>;
};

export type ModRouterSpectateGameRes = SpectateGamePrivateRes & {
    region: string;
    done: boolean;
};

export const zSpectateGamePrivateBody = z.object({
    filter: zSpectateFilter,
});

export type SpectateGamePrivateBody = z.infer<typeof zSpectateGamePrivateBody>;
