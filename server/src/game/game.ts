import { getModeMaxPlayers, type MapDefKey, MapDefs } from "../../../shared/defs/mapDefs.ts";
import { TeamMode } from "../../../shared/gameConfig.ts";
import type { PrivateLoadout } from "../../../shared/types/api.ts";
import type { CustomMap } from "../../../shared/utils/customMap.ts";
import type { Loadout } from "../../../shared/utils/loadout.ts";
import { math } from "../../../shared/utils/math.ts";
import { Config } from "../config.ts";
import { ServerLogger } from "../utils/logger.ts";
import { type FindGamePrivateBody, type ServerGameConfig } from "../utils/types.ts";
import { addBot, addPrivateBots, addVsBots, BotFiller } from "./bot.ts";
import { ClientBarn } from "./client.ts";
import { GameModeManager } from "./gameModeManager.ts";
import { Grid } from "./grid.ts";
import { GameMap } from "./map.ts";
import { AirdropBarn } from "./objects/airdrop.ts";
import { BulletBarn } from "./objects/bullet.ts";
import { DeadBodyBarn } from "./objects/deadBody.ts";
import { DecalBarn } from "./objects/decal.ts";
import { ExplosionBarn } from "./objects/explosion.ts";
import { type GameObject, ObjectRegister } from "./objects/gameObject.ts";
import { Gas } from "./objects/gas.ts";
import { LootBarn } from "./objects/loot.ts";
import { MapIndicatorBarn } from "./objects/mapIndicator.ts";
import { PlaneBarn } from "./objects/plane.ts";
import { type Player, PlayerBarn } from "./objects/player.ts";
import { ProjectileBarn } from "./objects/projectile.ts";
import { SmokeBarn } from "./objects/smoke.ts";
import { Profiler } from "./profiler.ts";

export interface JoinTokenData {
    userId: string | null;
    findGameIp: string;
    loadout?: Loadout;
    quests?: string[];
    /** server-side bot: spawns on its own spot instead of next to its group */
    bot?: boolean;
    groupData: {
        /** private match side, 0 = Team A, 1 = Team B */
        side?: number;
        autoFill: boolean;
        playerCount: number;
        groupHashToJoin: string;
    };
}

export interface SpectateTokenData {
    playerId: number;
    specAnon: boolean;
    noSpecCooldown: boolean;
}

type JoinToken = {
    type: "join";
    expiresAt: number;
    data: JoinTokenData;
} | {
    type: "spectate";
    expiresAt: number;
    data: SpectateTokenData;
};

export class Game {
    started = false;
    stopped = false;
    over = false;
    winningTeamId = 0;
    startedTime = 0;
    stopTicker = 0;
    timeRunning = 0;
    // used to stop the game if theres no connected players
    noPlayersTicker = 0;

    id: string;
    teamMode: TeamMode;
    mapName: MapDefKey;
    isTeamMode: boolean;
    /** spawn everyone with the duel kit (duel maps, or a private match with it on) */
    godLoadout: boolean;

    /** two sides on one small arena: duel maps, and any private match */
    duelRules: boolean;

    /** private match: the one kit every player spawns with */
    fixedLoadout?: PrivateLoadout;
    /** built from the map maker instead of generated */
    customMap?: CustomMap;
    /** no loot from the map, obstacles or airdrops */
    noLoot: boolean;
    config: ServerGameConfig;
    modeManager: GameModeManager;

    now!: number;
    profiler = new Profiler();
    perfTicker = 0;
    tickTimes: number[] = [];

    tickTimeWarnThreshold = (1000 / Config.gameTps) * 4;
    gameTickWarnings = 0;

    netSyncWarnThreshold = (1000 / Config.netSyncTps) * 4;
    netSyncWarnings = 0;

    joinTokens = new Map<string, JoinToken>();

    /** private match side -> that side's group hash, so bots can join it */
    sideGroupHashes = new Map<number, string>();
    /** private sides outgrow one group: everyone on a side shares this team id */
    sideTeamIds = new Map<number, number>();
    /** public games: fills empty slots with bots once a real player is in */
    botFiller?: BotFiller;
    private _botsAdded = false;
    private _watched = false;

    get aliveCount(): number {
        return this.playerBarn.livingPlayers.length;
    }

    grid: Grid<GameObject>;
    map: GameMap;
    gas: Gas;
    objectRegister: ObjectRegister;

    clientBarn: ClientBarn;
    playerBarn: PlayerBarn;
    lootBarn: LootBarn;
    deadBodyBarn: DeadBodyBarn;
    decalBarn: DecalBarn;
    projectileBarn: ProjectileBarn;
    bulletBarn: BulletBarn;
    smokeBarn: SmokeBarn;
    airdropBarn: AirdropBarn;
    explosionBarn: ExplosionBarn;
    planeBarn: PlaneBarn;
    mapIndicatorBarn: MapIndicatorBarn;

    logger: ServerLogger;

    // for debug
    preventStart = false;
    debugSpeedMulti = 1;

    /** an Ultron minion: a beginner bot on its summoner's side */
    addMinion(owner: Player, level: Parameters<typeof addBot>[1]): Player {
        return addBot(this, level, owner.privateSide, true);
    }

    constructor(id: string, config: ServerGameConfig) {
        const start = Date.now();
        this.id = id;
        this.logger = new ServerLogger(`Game #${this.id.substring(0, 4)}`);
        this.logger.info("Creating");

        this.config = config;

        this.teamMode = config.teamMode;
        this.mapName = config.mapName;
        this.isTeamMode = this.teamMode !== TeamMode.Solo;
        const mapGameMode = MapDefs[this.mapName].gameMode;
        this.godLoadout = config.privateMatch
            ? config.privateMatch.godLoadout
            : !!mapGameMode.godLoadout;
        // private matches force the party leader's kit on everyone
        this.fixedLoadout = config.privateMatch?.loadout;
        this.duelRules = !!config.privateMatch || !!mapGameMode.duelMode;
        this.customMap = config.privateMatch?.customMap;
        this.noLoot = !!this.customMap?.noLoot;

        this.map = new GameMap(this);
        this.grid = new Grid(this.map.width, this.map.height);
        this.objectRegister = new ObjectRegister(this.grid);

        this.clientBarn = new ClientBarn(this);
        this.playerBarn = new PlayerBarn(this);
        this.lootBarn = new LootBarn(this);
        this.deadBodyBarn = new DeadBodyBarn(this);
        this.decalBarn = new DecalBarn(this);
        this.projectileBarn = new ProjectileBarn(this);
        this.bulletBarn = new BulletBarn(this);
        this.smokeBarn = new SmokeBarn(this);
        this.airdropBarn = new AirdropBarn(this);
        this.explosionBarn = new ExplosionBarn(this);
        this.planeBarn = new PlaneBarn(this);
        this.mapIndicatorBarn = new MapIndicatorBarn();

        this.gas = new Gas(this);

        this.modeManager = new GameModeManager(this);

        if (this.map.factionMode) {
            for (let i = 1; i <= this.map.mapDef.gameMode.factions!; i++) {
                this.playerBarn.addTeam(i);
            }
        }

        this.map.init();

        // free for all fills itself with bots even as a party's private match
        if (!config.privateMatch || this.map.mapDef.gameMode.ffaMode) {
            this.botFiller = new BotFiller(this, getModeMaxPlayers(this.map.mapDef, this.teamMode));
        }

        this.logger.info(`Created in ${Date.now() - start} ms`);

        this.updateData();
    }

    update(dt?: number) {
        if (this.stopped) return;
        this.profiler.flush();

        const now = performance.now();
        if (!this.now) this.now = now;
        dt ??= math.clamp((now - this.now) / 1000, 0.001, 1 / 8);

        this.timeRunning += dt;

        dt *= this.debugSpeedMulti;

        this.now = now;

        if (this.over) {
            this.stopTicker -= dt;
            if (this.stopTicker <= 0) {
                this.stop();
                return;
            }
        }

        // film matches have no human to wait for
        if (this.config.privateMatch?.film) this.onHumanJoined();

        if (!this.started && !this.preventStart) {
            this.started = this.modeManager.isGameStarted();
            if (this.started) {
                this.gas.advanceGasStage();
            } else {
                const connected = this.playerBarn.players.reduce((a, b) => {
                    return a + (b.disconnected ? 0 : 1);
                }, 0);
                if (connected === 0) {
                    this.noPlayersTicker += dt;
                } else {
                    this.noPlayersTicker = 0;
                }
                // after 30 seconds of no connected players on a game that didn't start
                // we just force stop the game so it doesn't run forever...
                if (this.noPlayersTicker > 30) {
                    this.over = true;
                    this.stop();
                    return;
                }
            }
        }

        if (this.started) this.startedTime += dt;

        // bots only play alongside real people: once the last one leaves, end it
        // (a film match starts with nobody watching, so only once its camera has left)
        if (this.hasHumans()) this._watched = true;
        const filmWaiting = this.config.privateMatch?.film && !this._watched;
        if (this._botsAdded && !this.over && !filmWaiting && !this.hasHumans()) {
            this.logger.info("No real players left, ending game");
            this.over = true;
            this.stop();
            return;
        }
        this.botFiller?.update(dt);

        //
        // Update modules
        //
        this.profiler.addSample("gas");
        this.gas.update(dt);
        this.profiler.endSample();

        this.profiler.addSample("players");
        this.playerBarn.update(dt);
        this.profiler.endSample();

        this.profiler.addSample("clients");
        this.clientBarn.update(dt);
        this.profiler.endSample();

        this.profiler.addSample("map");
        this.map.update(dt);
        this.profiler.endSample();

        this.profiler.addSample("loot");
        this.lootBarn.update(dt);
        this.profiler.endSample();

        this.profiler.addSample("bullets");
        this.bulletBarn.update(dt);
        this.profiler.endSample();

        this.profiler.addSample("projectiles");
        this.projectileBarn.update(dt);
        this.profiler.endSample();

        this.profiler.addSample("explosions");
        this.explosionBarn.update();
        this.profiler.endSample();

        this.profiler.addSample("smoke");
        this.smokeBarn.update(dt);
        this.profiler.endSample();

        this.profiler.addSample("airdrops");
        this.airdropBarn.update(dt);
        this.profiler.endSample();

        this.profiler.addSample("deadBodies");
        this.deadBodyBarn.update(dt);
        this.profiler.endSample();

        this.profiler.addSample("decals");
        this.decalBarn.update(dt);
        this.profiler.endSample();

        this.profiler.addSample("planes");
        this.planeBarn.update(dt);
        this.profiler.endSample();

        const tickTime = performance.now() - this.now;

        if (tickTime > 1000) {
            let errString = `Tick took over 1 second! ${tickTime.toFixed(2)}ms\n`;
            errString += "Profiler stats:\n";
            errString += this.profiler.getStats();
            this.logger.error(errString);
        } else if (tickTime > this.tickTimeWarnThreshold) {
            this.logger.warn(
                `Tick took over ${this.tickTimeWarnThreshold}ms! ${tickTime.toFixed(2)}ms`,
            );
            this.gameTickWarnings++;

            if (this.gameTickWarnings > 20) {
                let errString = `Server is overloaded! Increasing tickTimeWarnThreshold.\n`;
                errString += "Profiler stats:\n";
                errString += this.profiler.getStats();
                this.logger.warn(errString);

                this.gameTickWarnings = 0;
                this.tickTimeWarnThreshold *= 2;
            }
        }

        if (Config.logging.debugLogs) {
            this.tickTimes.push(tickTime);

            this.perfTicker += dt;
            if (this.perfTicker >= 15) {
                this.perfTicker = 0;
                const mspt = this.tickTimes.reduce((a, b) => a + b) / this.tickTimes.length;

                this.logger.debug(
                    `Avg ms/tick: ${mspt.toFixed(2)} | Load: ${((mspt / (1000 / Config.gameTps)) * 100).toFixed(1)}%`,
                );
                this.tickTimes = [];
            }
        }
    }

    netSync() {
        if (this.stopped) return;

        const start = performance.now();

        // serialize objects and send msgs
        this.objectRegister.serializeObjs();
        this.clientBarn.sendMsgs();

        //
        // reset stuff
        //
        this.clientBarn.flush();
        this.playerBarn.flush();
        this.lootBarn.flush();
        this.planeBarn.flush();
        this.bulletBarn.flush();
        this.objectRegister.flush();
        this.explosionBarn.flush();
        this.gas.flush();
        this.mapIndicatorBarn.flush();

        const syncTime = performance.now() - start;
        if (syncTime > 1000) {
            this.logger.error(`Tick took over 1 second! ${syncTime.toFixed(2)}ms`);
        } else if (syncTime > this.netSyncWarnThreshold) {
            this.logger.warn(
                `Tick took over ${this.netSyncWarnThreshold}ms! ${syncTime.toFixed(2)}ms`,
            );
            this.netSyncWarnings++;

            if (this.netSyncWarnings > 20) {
                this.logger.warn(
                    `Server is overloaded! Increasing netSyncWarnThreshold.`,
                );

                this.netSyncWarnings = 0;
                this.netSyncWarnThreshold *= 2;
            }
        }
    }

    /** a real (non bot) client still connected, playing or spectating */
    hasHumans() {
        return this.clientBarn.clients.length > 0;
    }

    /** called when a real player joins: bring in the bots */
    onHumanJoined() {
        if (this._botsAdded) return;
        this._botsAdded = true;
        const bots = this.config.privateMatch?.bots;
        const vsBots = this.config.privateMatch?.vsBots;
        if (vsBots) {
            addVsBots(this, vsBots);
        } else if (bots) {
            addPrivateBots(this, bots);
        } else {
            this.botFiller?.start();
        }
    }

    get canJoin(): boolean {
        return (
            this.aliveCount < getModeMaxPlayers(this.map.mapDef, this.teamMode)
            && !this.over
            && this.startedTime < 60
        );
    }

    checkGameOver() {
        if (this.over) return;

        const didGameEnd = this.started && this.modeManager.aliveCount() <= 1;

        if (didGameEnd) {
            this.over = true;

            // send win emoji after 1 second
            this.playerBarn.sendWinEmoteTicker = 1;
            // stop game after 1.8s
            this.stopTicker = 1.8;

            const mvp = this.modeManager.getFactionMvp();
            this.playerBarn.factionsMvp = mvp;
            mvp?.questManager.trackEvent("be_mvp", { role: mvp.role });

            this.winningTeamId = this.modeManager.getWinningTeamId();
            // forcefully flush progress, because after this point, any unsynced updates are lost
            for (const player of this.playerBarn.players) {
                player.questManager.flushProgress(this.winningTeamId);
            }
            this.updateData();
        }
    }

    addJoinTokens(tokens: FindGamePrivateBody["playerData"], autoFill: boolean) {
        // solo free for all: a party splits up, everyone on their own
        const ffa = !!this.map.mapDef.gameMode.ffaMode && this.teamMode === 1;
        const sharedGroup = {
            side: tokens[0]?.team,
            playerCount: tokens.length,
            groupHashToJoin: "",
            autoFill,
        };

        for (const token of tokens) {
            const groupData = ffa
                ? { side: undefined, playerCount: 1, groupHashToJoin: "", autoFill: false }
                : sharedGroup;
            this.joinTokens.set(token.joinToken, {
                type: "join",
                expiresAt: Date.now() + 60000,
                data: {
                    userId: token.userId,
                    groupData,
                    findGameIp: token.ip,
                    loadout: token.loadout,
                    quests: token.quests,
                },
            });
        }
    }

    addSpectateToken(token: string, data: SpectateTokenData) {
        this.joinTokens.set(token, {
            type: "spectate",
            expiresAt: Date.now() + 60000,
            data,
        });
    }

    stop() {
        if (this.stopped) return;
        this.stopped = true;
        for (const client of this.clientBarn.clients) {
            client.disconnect();
        }
        this.logger.info("Game Ended");
        this._saveGameToDatabase();
        this.updateData();
    }

    // implementation of those is on gameProcess.ts
    // this keeps the base Game class free of nodejs imports and the ability to make network requests
    // to make offline mode and unit tests easier to maintain

    updateData() {}
    protected _saveGameToDatabase() {}
    sendQuestProgress(_userId: string, _progress: Array<{ id: string; delta: number }>) {}

    /**
     * Steps the game X seconds in the future
     * This is done in smaller steps of 0.1 seconds
     * To make sure everything updates properly
     *
     * Used for unit tests, don't call this on actual game code :p
     */
    step(seconds: number) {
        for (let i = 0, steps = seconds * 10; i < steps; i++) {
            this.update(0.1);
        }
    }
}
