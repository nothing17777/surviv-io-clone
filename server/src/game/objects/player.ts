import { type GameObjectDef, type LootDef, WeaponTypeToDefs } from "../../../../shared/defs/gameObjectDefs.ts";
import { ChampionDefs, ItemDefs } from "../../../../shared/defs/gameObjects/championDefs.ts";
import { EmotesDefs } from "../../../../shared/defs/gameObjects/emoteDefs.ts";
import {
    type BackpackDef,
    type BoostDef,
    type ChestDef,
    GEAR_TYPES,
    type HealDef,
    type HelmetDef,
    SCOPE_LEVELS,
} from "../../../../shared/defs/gameObjects/gearDefs.ts";
import type { GunDef } from "../../../../shared/defs/gameObjects/gunDefs.ts";
import {
    IronManCombo,
    IronManSpin,
    isKitItem,
    kitAura,
    KitDefs,
    SentryCharge,
    SentryNova,
    SpiderCombo,
    SummonerPotions,
    SummonerRod,
    UltronCombo,
    UltronComboTimes,
    UltronMinion,
    WizardCrystals,
    WizardWave,
    WolverineCombo,
    WolverineComboStep,
    WolverineDash,
} from "../../../../shared/defs/gameObjects/kitDefs.ts";
import type { MeleeDef } from "../../../../shared/defs/gameObjects/meleeDefs.ts";
import { PerkProperties } from "../../../../shared/defs/gameObjects/perkDefs.ts";
import type { RoleDef } from "../../../../shared/defs/gameObjects/roleDefs.ts";
import type { ThrowableDef } from "../../../../shared/defs/gameObjects/throwableDefs.ts";
import { UnlockDefs } from "../../../../shared/defs/gameObjects/unlockDefs.ts";
import { GameObjectDefs } from "../../../../shared/defs/register.ts";
import {
    type Action,
    type Anim,
    EmoteSlot,
    GameConfig,
    type HasteType,
    type Input,
    type InventoryItem,
} from "../../../../shared/gameConfig.ts";
import * as net from "../../../../shared/net/net.ts";
import { ObjectType } from "../../../../shared/net/objectSerializeFns.ts";
import { goodPerks, isHackerLevel, type PrivateLoadout } from "../../../../shared/types/api.ts";
import { type Circle, coldet } from "../../../../shared/utils/coldet.ts";
import { collider } from "../../../../shared/utils/collider.ts";
import { math } from "../../../../shared/utils/math.ts";
import { assert, util } from "../../../../shared/utils/util.ts";
import { v2, type Vec2 } from "../../../../shared/utils/v2.ts";
import { Config } from "../../config.ts";
import { validateUserName } from "../../utils/badWords.ts";
import { IDAllocator } from "../../utils/IDAllocator.ts";
import type { BotBrain } from "../bot.ts";
import { Champion, Debuffs } from "../champion.ts";
import { Client } from "../client.ts";
import type { Game, JoinTokenData } from "../game.ts";
import { Group, Team } from "../group.ts";
import { InventoryManager } from "../inventoryManager.ts";
import { QuestManager } from "../questManager.ts";
import { NoOpSocket } from "../socket.ts";
import { WeaponManager } from "../weaponManager.ts";
import type { Building } from "./building.ts";
import type { Bullet } from "./bullet.ts";
import { BaseGameObject, type DamageParams, type GameObject } from "./gameObject.ts";
import type { Loot } from "./loot.ts";
import type { MapIndicator } from "./mapIndicator.ts";
import type { Obstacle } from "./obstacle.ts";

type MoveObjsMode = {
    enabled: boolean;
    selectedObj?: Loot | Obstacle | Building;
    originalPos?: Vec2;
    selectPos?: Vec2;
};

interface Emote {
    playerId: number;
    pos: Vec2;
    type: string;
    isPing: boolean;
    /**
     * if type is "emote_loot", typestring of item goes here
     * "m870", "mosin", "1xscope", "762mm", etc
     */
    itemType: string;
}

type FabricateThrowable = keyof typeof PerkProperties["fabricate"]["weights"];

/** seconds a minimum adrenaline (Leadership) can't refill what Indomitable Spirit spent */
const LifelineDrainTime = 15;

const boostHeals: Array<{ maxBoost: number; heal: number }> = [];
{
    const boostBreakPoints = GameConfig.player.boostBreakpoints;
    const max = GameConfig.player.boostBreakpoints.reduce((a, b) => a + b, 0);

    for (let i = 0, boost = 0; i < boostBreakPoints.length; i++) {
        boost += (boostBreakPoints[i] / max) * 100;
        boostHeals.push({
            maxBoost: boost,
            heal: GameConfig.player.boostHealAmounts[i],
        });
    }
}

export class PlayerBarn {
    players: Player[] = [];
    livingPlayers: Player[] = [];
    newPlayers: Player[] = [];
    deletedPlayers: number[] = [];
    killedPlayers: Player[] = [];
    groupIdAllocator = new IDAllocator(65535);
    aliveCountDirty = false;

    emotes: Emote[] = [];

    killLeaderDirty = false;
    killLeader?: Player;

    aoeHealPlayers: Player[] = [];

    scheduledRoles: Array<{
        role: string;
        time: number;
    }> = [];

    sendWinEmoteTicker = 0;
    sentWinEmotes = false;

    teams: Team[] = [];
    groups: Group[] = [];
    groupsByHash = new Map<string, Group>();

    playerStatusTicker = 0;
    playerStatusRate = 0;

    defaultItems = util.mergeDeep<typeof GameConfig["player"]["defaultItems"]>(
        {},
        GameConfig.player.defaultItems,
        Config.defaultItems,
    );

    bagSizes: (typeof GameConfig)["bagSizes"];

    nextMatchDataId = 1;

    nextKilledNumber = 0;

    /**
     * Assigned once at game end
     */
    factionsMvp?: Player = undefined;

    constructor(readonly game: Game) {
        this.bagSizes = util.mergeDeep<typeof GameConfig["bagSizes"]>(
            {},
            GameConfig.bagSizes,
            this.game.map.mapDef.gameConfig.bagSizes,
        );

        this.playerStatusRate = net.getPlayerStatusUpdateRate(this.game.map.factionMode);
    }

    addPlayer(
        client: Client,
        joinMsg: net.JoinMsg,
        joinData: JoinTokenData,
    ) {
        const result = this.getGroupAndTeam(joinData.groupData);
        const group = result?.group;
        // remember each private side's group so bots can join it
        if (group && joinData.groupData.side !== undefined && !this.game.sideGroupHashes.has(joinData.groupData.side)) {
            this.game.sideGroupHashes.set(joinData.groupData.side, group.hash);
        }
        // solo 50v50 just chooses the smallest team everytime no matter what
        const team = this.game.map.factionMode && !this.game.isTeamMode
            ? this.getSideTeam(joinData.groupData.side)
            : result?.team;

        let pos: Vec2;
        let layer: number;
        if (this.game.map.perkMode && this.game.map.perkModeTwinsBunker) {
            // intermediate spawn point while the player chooses a role before theyre moved to their real spawn point
            const spawnBuilding = this.game.map.perkModeTwinsBunker;
            pos = spawnBuilding.pos;
            layer = spawnBuilding.layer;
        } else {
            // bots outside private matches each drop somewhere of their own
            const ownSpot = joinData.bot && !this.game.duelRules;
            pos = this.game.map.getSpawnPos(ownSpot ? undefined : group, team, joinData.groupData.side);
            if (group && !group.spawnPosition && !ownSpot) {
                group.spawnPosition = v2.copy(pos);
            }
            layer = 0;
        }

        const originalName = validateUserName(joinMsg.name).validName;
        let finalName = originalName;

        if (Config.uniqueInGameNames) {
            let count = 0;
            const loggedOutPlayers = this.game.playerBarn.players.filter(
                (p) => !p.client.userId,
            );
            while (loggedOutPlayers.find((p) => p.name === finalName)) {
                const postFix = `-${++count}`;
                const trimmed = originalName.substring(
                    0,
                    net.Constants.PlayerNameMaxLen - postFix.length,
                );
                finalName = trimmed + postFix;
            }
        }

        const player = new Player(
            this.game,
            pos,
            layer,
            client,
            finalName,
            joinMsg.bot,
            joinMsg.isMobile,
            joinData.quests,
        );

        player.privateSide = joinData.groupData.side;
        this.activatePlayer(player, group, team);
        // a side can hold more players than one group, so groups on the same side
        // still share a team id and can't hurt each other
        const side = joinData.groupData.side;
        if (side !== undefined && !this.game.map.factionMode) {
            const sideTeam = this.game.sideTeamIds.get(side);
            if (sideTeam === undefined) this.game.sideTeamIds.set(side, player.teamId);
            else player.teamId = sideTeam;
        }
        const godLoadout = this.game.godLoadout;
        player.setLoadout(
            joinData.loadout ? joinData.loadout : joinMsg.loadout,
            // god loadout maps let everyone use every skin / melee
            !joinData.loadout && !godLoadout,
        );
        if (godLoadout) {
            // in a private match the leader's kit wins over whatever the
            // client asks for, so everyone spawns identical
            const fixed = this.game.fixedLoadout;
            player.applyGodLoadout(fixed ?? joinMsg.godLoadout);
        }
        if (this.game.config.privateMatch?.emptyInventory) player.emptyInventory();

        return player;
    }

    activatePlayer(player: Player, group?: Group, team?: Team) {
        if (team && group) {
            team.addPlayer(player);
            group.addPlayer(player);
            player.setGroupStatuses();
        } else if (!team && group) {
            group.addPlayer(player);
            player.teamId = player.groupId;
            player.setGroupStatuses();
        } else if (team && !group) {
            team.addPlayer(player);
            player.groupId = this.groupIdAllocator.getNextId();
        } else {
            player.groupId = player.teamId = this.groupIdAllocator.getNextId();
        }

        if (player.game.map.perkMode) {
            /*
             * +5 because the client has its own timer
             * this timer is only a safety net in case a player modifies the client code
             * if this timer reaches 0, we know for a fact the client timer didn't end when it should've
             */
            player.roleMenuTicker = GameConfig.player.perkModeRoleSelectDuration + 5;
        }

        this.game.logger.info(`Player ${player.name} joined`);

        this.newPlayers.push(player);
        this.game.objectRegister.register(player);
        this.players.push(player);
        this.livingPlayers.push(player);
        this.livingPlayers.sort((a, b) => a.teamId - b.teamId);

        this.aliveCountDirty = true;

        this.game.updateData();
    }

    testPlayerCount = 0;
    addTestPlayer(params: {
        group?: Group;
        team?: Team;
        pos?: Vec2;
        name?: string;
        userId?: string;
    }): Player {
        let group = params.group;
        let team = params.team;

        if (!group && this.game.isTeamMode) {
            group = this.addGroup(false);
        }

        if (!team && this.game.map.factionMode) {
            team = this.getSmallestTeam();
        }

        const client = new Client(this.game, new NoOpSocket(), params.userId || null, "");
        this.game.clientBarn.clients.push(client);

        const player = new Player(
            this.game,
            params.pos ?? v2.create(this.game.map.width / 2, this.game.map.height / 2),
            0,
            client,
            params.name ?? `TEST-${String.fromCharCode(65 + this.testPlayerCount++)}`,
            false,
            false,
        );
        client.player = player;

        this.activatePlayer(player, group, team);

        return player;
    }

    update(dt: number) {
        let sendWinEmotes = false;
        if (this.game.over && !this.sentWinEmotes) {
            this.sendWinEmoteTicker -= dt;
            if (this.sendWinEmoteTicker <= 0) {
                sendWinEmotes = true;
                this.sentWinEmotes = true;
            }
        }

        if (this.game.isTeamMode || this.game.map.factionMode) {
            this.playerStatusTicker += dt;
        }

        for (let i = 0; i < this.players.length; i++) {
            const player = this.players[i];
            player.botBrain?.update(dt);
            player.update(dt);

            if (!player.dead && sendWinEmotes) {
                player.emoteFromSlot(EmoteSlot.Win);
            }

            if (this.game.over && !player.dead && !player.sentGameOverMsg) {
                player.addGameOverMsg();
            }
        }

        // doing this after updates ensures that gameover msgs sent are always accurate
        // if this was done in netsync, players could die while waiting for the next netsync call
        // then the gameover msgs would be inaccurate since theyre based on the current alive count
        for (let i = 0; i < this.killedPlayers.length; i++) {
            this.killedPlayers[i].addGameOverMsg();
        }
        this.killedPlayers.length = 0;

        // update scheduled roles
        for (let i = this.scheduledRoles.length - 1; i >= 0; i--) {
            const scheduledRole = this.scheduledRoles[i];
            scheduledRole.time -= dt;
            if (scheduledRole.time <= 0) {
                this.scheduledRoles.splice(i, 1);

                const fullAliveContext = this.game.modeManager.getAlivePlayersContext();
                for (let i = 0; i < fullAliveContext.length; i++) {
                    const promotablePlayers = fullAliveContext[i].filter(
                        (p) => !p.disconnected && !p.downed && !p.role,
                    );
                    if (promotablePlayers.length == 0) continue;

                    // logic to combat people joining with multiple tabs to role farm
                    const activePromotablePlayers = promotablePlayers.filter((player) => {
                        const total = player.movingTicker + player.stayingStillTicker;
                        if (total > 5) {
                            // for players alive for more than 5 seconds, filter out the ones that have stayed still
                            // for over 50% of the time
                            const timeAfk = player.stayingStillTicker / total;
                            if (timeAfk > 0.5) {
                                return false;
                            }
                        }
                        // also filter out players that haven't moved for the last 5 seconds
                        if (player.timeWithoutMoving > 5) {
                            return false;
                        }

                        // for people joining with the same account
                        // only count their first join thats still connected
                        if (player.userId) {
                            const playersWithThisAccount = this.livingPlayers.filter(otherPlayer => {
                                return !otherPlayer.disconnected && otherPlayer.userId === player.userId;
                            });
                            const thisIdx = playersWithThisAccount.indexOf(player);
                            if (thisIdx !== 0) return false;
                        }

                        return true;
                    });

                    // if we don't have any active player to be promoted
                    // then no harm in promoting possibly AFK players...
                    const finalPlayers = activePromotablePlayers.length === 0
                        ? promotablePlayers
                        : activePromotablePlayers;

                    if (!finalPlayers.length) continue;

                    const randomPlayer = util.randomItem(finalPlayers);
                    randomPlayer.promoteToRole(scheduledRole.role);
                }
            }
        }
    }

    removePlayer(player: Player) {
        util.removeFrom(this.players, player);

        if (util.removeFrom(this.livingPlayers, player)) {
            this.aliveCountDirty = true;
        }

        this.deletedPlayers.push(player.__id);
        player.destroy();
        if (player.team) {
            player.team.removePlayer(player);
        }
        if (player.group) {
            player.group.removePlayer(player);

            if (player.group.players.length <= 0) {
                util.removeFrom(this.groups, player.group);
                this.groupsByHash.delete(player.group.hash);
            }
        }
        if (this.game.isTeamMode) {
            this.livingPlayers.sort((a, b) => a.teamId - b.teamId);
        }

        for (const spectator of player.spectators) {
            spectator.spectating = spectator.getNewPlayerToSpectate();
        }

        player.obstacleOutfit?.destroy();

        this.game.checkGameOver();
        this.game.updateData();
    }

    flush() {
        this.newPlayers.length = 0;
        this.deletedPlayers.length = 0;
        this.emotes.length = 0;
        this.aliveCountDirty = false;
        this.killLeaderDirty = false;

        const flushPlayerStatus = this.playerStatusTicker > this.playerStatusRate;
        if (flushPlayerStatus) {
            this.playerStatusTicker = 0;
        }

        for (let i = 0; i < this.players.length; i++) {
            const player = this.players[i];
            player.healthDirty = false;
            player.boostDirty = false;
            player.zoomDirty = false;
            player.actionDirty = false;
            player.inventoryDirty = false;
            player.weapsDirty = false;
            player.spectatorCountDirty = false;
            player.groupStatusDirty = false;
            player.shieldDirty = false;
            player.energyDirty = false;
            if (flushPlayerStatus) {
                player.playerStatusDirty = false;
            }
        }
    }

    /**
     * called everytime gas.circleIdx is incremented for efficiency purposes
     * schedules all roles that need to be assigned for the respective circleIdx
     */
    scheduleRoleAssignments(): void {
        const roles = this.game.map.mapDef.gameConfig.roles;
        assert(
            roles,
            "\"roles\" property is undefined in chosen map definition, cannot call this function",
        );

        const rolesToSchedule = roles.timings.filter(
            (timing) => this.game.gas.circleIdx == timing.circleIdx,
        );

        for (let i = 0; i < rolesToSchedule.length; i++) {
            const roleObj = rolesToSchedule[i];
            const roleStr = roleObj.role instanceof Function ? roleObj.role() : roleObj.role;
            this.scheduledRoles.push({
                role: roleStr,
                time: roleObj.wait,
            });
        }
    }

    getAliveGroups(): Group[] {
        return [...this.groups.values()].filter(
            (group) => group.livingPlayers.length > 0,
        );
    }

    getAliveTeams(): Team[] {
        return this.teams.filter((team) => team.livingPlayers.length > 0);
    }

    /** private match sides map onto the two factions; everyone else balances */
    getSideTeam(side?: number) {
        if (side !== undefined && this.teams[side]) return this.teams[side];
        return this.getSmallestTeam();
    }

    getSmallestTeam() {
        return this.teams.reduce((smallest, current) => {
            if (current.livingPlayers.length < smallest.livingPlayers.length) {
                return current;
            }
            return smallest;
        }, this.teams[0]);
    }

    addTeam(teamId: number) {
        const team = new Team(this.game, teamId);
        this.teams.push(team);
        return team;
    }

    getGroupAndTeam(groupData: JoinTokenData["groupData"]):
        | {
            group?: Group;
            team?: Team;
        }
        | undefined
    {
        if (!this.game.isTeamMode) return undefined;

        let group = this.groupsByHash.get(groupData.groupHashToJoin);
        let team = this.game.map.factionMode ? this.getSideTeam(groupData.side) : undefined;

        if (!group && groupData.autoFill) {
            const groups = team ? team.getGroups() : this.groups;
            group = groups.find((group) => {
                return group.autoFill && group.canJoin(groupData.playerCount);
            });
        }

        // second condition should never happen
        // but keeping it just in case
        // since more than 4 players in a group crashes the client
        if (!group || group.players.length >= this.game.teamMode) {
            group = this.addGroup(groupData.autoFill);
        }

        // only reserve slots on the first time this join token is used
        // since the playerCount counts for other people from the team menu
        // using the same token
        if (group.hash !== groupData.groupHashToJoin) {
            group.reservedSlots += groupData.playerCount;
        }

        groupData.groupHashToJoin = group.hash;

        // pre-existing group not created during this function call
        // players who join from the same group need the same team
        if (this.game.map.factionMode && group.players.length > 0) {
            team = group.players[0].team;
        }

        return { group, team };
    }

    addGroup(autoFill: boolean) {
        // not using nodejs crypto because i want it to run in the browser too
        // and doesn't need to be cryptographically secure lol
        const hash = Math.random().toString(16).slice(2);
        const groupId = this.groupIdAllocator.getNextId();
        const group = new Group(hash, groupId, autoFill, this.game.teamMode);
        this.groups.push(group);
        this.groupsByHash.set(hash, group);
        return group;
    }

    getPlayerWithHighestKills(): Player | undefined {
        return this.game.playerBarn.livingPlayers
            .filter((p) => p.kills >= GameConfig.player.killLeaderMinKills)
            .sort((a, b) => b.kills - a.kills)[0];
    }

    addEmote(type: string, playerId: number, itemType = "") {
        this.emotes.push({
            isPing: false,
            playerId,
            pos: v2.create(0, 0),
            type,
            itemType,
        });
    }

    addMapPing(type: string, pos: Vec2, playerId = 0) {
        this.emotes.push({
            isPing: true,
            type,
            pos,
            playerId,
            itemType: "",
        });
    }
}

export class Player extends BaseGameObject {
    override readonly __type = ObjectType.Player;

    bounds = collider.createAabbExtents(
        v2.create(0, 0),
        v2.create(GameConfig.player.maxVisualRadius, GameConfig.player.maxVisualRadius),
    );

    scale = 1;

    get rad(): number {
        return GameConfig.player.radius * this.scale;
    }

    set rad(rad: number) {
        this.collider.rad = rad;
        this.rad = rad;
    }

    get playerId() {
        return this.__id;
    }

    dir = v2.create(1, 0);
    dirOld = v2.create(1, 0);
    // direction received from the last inputMsg
    dirNew = v2.create(1, 0);

    posOld = v2.create(0, 0);

    vel = v2.mul(v2.create(1, 0), 0);

    collider: Circle;

    healthDirty = true;
    boostDirty = true;
    zoomDirty = true;
    actionDirty = false;
    inventoryDirty = true;
    weapsDirty = true;
    spectatorCountDirty = false;
    hasFiredFlare = false;
    flareTimer = 0;

    sendDeathEmoteTicker = 0;
    sentDeathEmote = false;

    team: Team | undefined = undefined;
    group: Group | undefined = undefined;

    /**
     * set true if any member on the team changes health or disconnects
     */
    groupStatusDirty = false;

    setGroupStatuses() {
        if (!this.game.isTeamMode) return;

        const teammates = this.group!.players;
        for (const t of teammates) {
            t.groupStatusDirty = true;
        }
    }

    /**
     * for updating player and teammate locations in the minimap client UI
     */
    playerStatusDirty = false;

    maxHealth: number = GameConfig.player.health;
    private _health: number = GameConfig.player.health;

    get health(): number {
        return this._health;
    }

    /** the training dummy: every client sees its health bar, so it goes out with the full data */
    get dummy(): boolean {
        return this.botBrain?.level === "dummy";
    }

    get dummyHealth(): number {
        return math.clamp(this._health / this.maxHealth, 0, 1);
    }

    set health(health: number) {
        health = math.clamp(health, 0, this.maxHealth);
        if (this._health === health) return;
        this._health = health;
        this.healthDirty = true;
        this.setGroupStatuses();
        if (this.dummy) this.setDirty();

        if (this.obstacleOutfit) {
            const healthT = math.clamp(this._health / this.maxHealth, 0, 1);

            if (!math.eqAbs(this.obstacleOutfit.healthT, healthT, 0.01)) {
                this.obstacleOutfit.healthT = healthT;
                this.obstacleOutfit.setDirty();
            }
        }
    }

    // Bleed debuff
    bleedDotDuration = 0;
    bleedDotTicker = 0;
    bleedDotSource?: Player;

    // Poison debuff
    poisonDuration = 0;
    poisonTicker = 0;
    poisonSource?: Player;

    // Burn debuff
    burnDuration = 0;
    burnTicker = 0;
    burnSource?: Player;

    // Eclipse shield
    shield = 0;
    shieldDirty = false;

    /** KitDefs id */
    kit = "default";
    /** kit energy (Iron Man) */
    energy = 0;
    maxEnergy = 0;
    /** kit shield cap; 0 = none */
    maxShield = 0;
    energyDirty = false;
    /** seconds into the current 1 s energy interval: energy is gained at 0 and healing/shield cost billed at 0.5 */
    energyTick = 0;
    /** seconds Iron Man / Ultron healed or refilled shield since their energy cost was last billed */
    sustainHealTime = 0;
    sustainShieldTime = 0;
    /** Wizard: seconds left of the enhanced circle */
    kitEnhanceTime = 0;
    regenPulseTimer = 0;
    /** Summoner: his blade minions (see KitDef.daggers); phase 0 waits and drifts, 1 dashes at the target, 2 dashes back */
    daggerMinions: { pos: Vec2; phase: number; timer: number; hit: Set<number> }[] = [];
    daggerClock = 0;

    /** where each blade minion is, relative to the Summoner: what clients draw */
    get daggerOffsets(): Vec2[] {
        return this.dead ? [] : this.daggerMinions.map((m) => v2.sub(m.pos, this.pos));
    }
    /** Summoner: the enemy the whip last hit, which the daggers go after first */
    summonerFocusId = 0;
    /** Spider-Man: swinging to where the web hit */
    webPull?: { target: Vec2; speed: number; time: number; lastDist?: number };
    /** Spider-Man: seconds left of Sudden Dodge (untargetable, faster auto webs) */
    dodgeTime = 0;
    /** Spider-Man: seconds since he last took damage, and until his next auto web */
    calmTime = 0;
    autoFireTimer = 0;
    private wasCooling = false;
    /** Ultron minion: who summoned it and how long it has left */
    minionOwner?: Player;
    minionLife = 0;
    minions: Player[] = [];
    /** players this Wizard has marked (inside the enhanced circle) */
    wizardMarks = new Set<Player>();
    wizardMarked = false;
    /** Excalibur: true while actively firing it, halving damage taken */
    excaliburActive = false;
    /** Iron Man's flight: seconds left in the air, untargetable and through walls */
    flightTime = 0;
    /** the second rocket volley goes off when the flight is down to this many seconds */
    private flightWaveAt = 0;
    /** the gun that volley comes from (empty once it has gone, or if there is none) */
    private flightWaveGun = "";
    private flightSpeedBonus = 0;
    /** flight seconds left when he can be hit again */
    private flightHittableAt = 0;

    get flying() {
        return this.flightTime > 0 && !this.dead;
    }

    /** the start of Iron Man's flight (or Spider-Man's dodge, or Wolverine's Claw Combo), when nothing can hit or target him */
    get untargetable() {
        return (this.flying && this.flightTime > this.flightHittableAt) || (this.dodgeTime > 0 && !this.dead)
            || this.hidden;
    }

    /** Wolverine: the enemy in his mark (the nearest one within range), and every Wolverine that has this player marked */
    markTarget?: Player;
    markedBy = new Set<Player>();

    get wolverineMarked() {
        return this.markedBy.size > 0 && !this.dead;
    }

    /** Wolverine's Claw Combo while it runs (see startClawCombo) */
    clawCombo?: {
        target: Player;
        /** the skill that started it (the Claw Combo, or the one-claw dash), the side each claw comes from, and its damage */
        gun: string;
        offsets: Array<{ x: number; y: number }>;
        damage: number;
        /** which claw is out, and the seconds since it left */
        step: number;
        t: number;
        start: Vec2;
        dir: Vec2;
        /** the far end of the latest claw: where he comes out */
        end: Vec2;
        /** whoever the claw has hit, and who it is dragging along */
        shotHit: Set<number>;
        grabbed: Player[];
    };

    /** seconds left of a champion's Guardian Angel stasis (drawn as a yellow circle) */
    stasisTime = 0;

    get stasis() {
        return this.stasisTime > 0 && !this.dead;
    }

    /** seconds left of the web stun Spider-Man's Portal Combo put on this player (see `webbed`) */
    webStunTime = 0;

    /** stunned by the Wizard's Stun Wave: shown with a green outline while it lasts */
    wizardStunTime = 0;

    get wizardStunned() {
        return this.wizardStunTime > 0 && !this.dead;
    }

    get webbed() {
        return this.webStunTime > 0 && !this.dead;
    }

    /** Spider-Man's Portal Combo while it runs (see startSpiderCombo) */
    spiderCombo?: {
        target: Player;
        /** which portal is out, and the seconds since it opened */
        step: number;
        t: number;
        /** the portal, the way he dashes through it, and whether he is mid-dash (and the seconds into it) */
        portal: Vec2;
        dir: Vec2;
        dashing: boolean;
        entered: boolean;
        dashT: number;
        /** who this dash has already hurt */
        hit: Set<number>;
    };

    /** hidden for the whole Claw Combo: unseen by anyone but his team, and nothing can hit or target him */
    get hidden() {
        return !!this.clawCombo && !this.dead;
    }

    startFlight(flight: { duration: number; untargetable: number; waveAt: number; speedBonus: number }, gun: string) {
        this.flightTime = flight.duration;
        this.flightHittableAt = flight.duration - flight.untargetable;
        this.flightWaveAt = flight.duration - flight.waveAt;
        // waveAt 0: no second volley
        this.flightWaveGun = flight.waveAt > 0 ? gun : "";
        this.flightSpeedBonus = flight.speedBonus;
        this.setDirty();
    }

    updateFlight(dt: number) {
        if (this.flightTime <= 0) return;
        this.flightTime -= dt;
        // the second volley fires even if he has swapped to another weapon by then
        if (this.flightWaveGun && this.flightTime <= this.flightWaveAt) {
            const gun = this.flightWaveGun;
            this.flightWaveGun = "";
            this.weaponManager.fireRingWave(gun);
        }
        if (this.flightTime <= 0) {
            this.flightTime = 0;
            this.setDirty();
        }
    }

    /** League champion kits: abilities on keys 1-4, item passives (champion.ts) */
    champ?: Champion;
    /** crowd control from champions' abilities */
    debuffs = new Debuffs();

    /** synced to every client: which champion, and each cast for its sound */
    get championIndex() {
        return this.champ && !this.dead ? this.champ.index : 0;
    }
    get champCastSeq() {
        return this.champ?.castSeq ?? 0;
    }
    get champCastKey() {
        return this.champ?.castKey ?? 0;
    }
    get champCooldowns() {
        return this.champ?.cooldownList ?? [];
    }
    get champRooted() {
        return !this.dead && (this.debuffs.root > 0 || this.debuffs.airborne > 0);
    }

    get kitAura() {
        return this.dead ? 0 : kitAura(this.kit, this.kitEnhanceTime > 0);
    }

    /** seconds left on each ability slot (primary, secondary, melee) */
    get abilityCooldowns() {
        const energyKit = !!KitDefs[this.kit]?.energy;
        return [0, 1, 2].map((i) => {
            const slot =
                [GameConfig.WeaponSlot.Primary, GameConfig.WeaponSlot.Secondary, GameConfig.WeaponSlot.Melee][i];
            if (this.kit === "default") return 0;
            const left = Math.max(this.weapons[slot]?.cooldown ?? 0, 0);
            // kits without energy only show their long abilities (Wolverine's dash, Spider-Man's dodge),
            // not every claw swing or web shot
            const type = this.weapons[slot]?.type ?? "";
            const def = type ? (GameObjectDefs.typeToDef(type) as GunDef | MeleeDef) : undefined;
            const full = def?.type === "gun" ? def.fireDelay : def?.type === "melee" ? def.attack.cooldownTime : 0;
            return energyKit || full >= 2 ? left : 0;
        });
    }
    eclipseHitCount = 0;

    /** Sentry Charge's stun: seconds left with no movement and no actions */
    stunTime = 0;
    /** the perks a Sentry Charge took away, and the seconds until they come back */
    strippedPerks: Array<Player["_perks"][0]> = [];
    perkStripTime = 0;
    /** Sentry: his once-per-game revive has gone off */
    sentryReviveUsed = false;
    /** Sentry: seconds until he can remove a debuff again */
    cleanseCooldown = 0;

    /** kit items that fire when health is low (Sentry's Conquest and Rescue): seconds until each can fire again */
    itemCooldowns: Record<string, number> = {};
    /** max HP an item adds for a while (Conquest's +30%, as a share), and the seconds it has left */
    itemMaxHealthMult = 0;
    itemMaxHealthTime = 0;
    /** Conquest's Wall: the share of damage it cuts right now, the seconds left, and how it wears down */
    wallReduction = 0;
    wallTime = 0;
    wallRule?: { perHit: number; floor: number };
    /** Rescue's shield: how much it granted (what goes when it runs out) and the seconds left */
    itemShield = 0;
    itemShieldTime = 0;

    get stunned() {
        return this.stunTime > 0 && !this.dead;
    }

    /** anything the Sentry's cleanse takes off him */
    get hasDebuff() {
        const d = this.debuffs;
        return this.burnDuration > 0 || this.bleedDotDuration > 0 || this.poisonDuration > 0
            || this.charmDuration > 0 || this.vulnerable || this.stunTime > 0
            || this.strippedPerks.length > 0 || d.root > 0 || d.slow > 0 || d.silence > 0 || d.airborne > 0;
    }

    /** Sentry Charge: seconds of dash left, which way he is going, who it has hit and who it is carrying along */
    sentryDashTime = 0;
    sentryDashDir = v2.create(1, 0);
    sentryDashHit = new Set<number>();
    sentryDashGrabbed: Player[] = [];

    startSentryDash(dir: Vec2, time: number) {
        this.sentryDashTime = time;
        v2.set(this.sentryDashDir, v2.normalizeSafe(dir, v2.create(1, 0)));
        this.sentryDashHit.clear();
        this.sentryDashGrabbed = [];
    }

    endSentryDash() {
        this.sentryDashTime = 0;
        this.sentryDashGrabbed = [];
    }

    /**
     * Sentry Charge, every tick of the dash: his body hits anyone it runs into (the crescent ahead of him does
     * the same with a wider reach, and nobody is hit twice), and everyone hit is reeled in to just in front of
     * him and carried along until the dash is over. Walls stop whoever is being carried, and one that gets
     * stuck behind a wall is let go
     */
    updateSentryDash(dt: number) {
        if (this.sentryDashTime <= 0) return;
        if (this.dead || this.stunTime > 0) {
            this.endSentryDash();
            return;
        }
        this.sentryDashTime -= dt;

        // sweep along the path he just ran, so a long tick can't skip someone
        const ran = v2.distance(this.posOld, this.pos);
        for (const p of this.enemiesWithin(SentryCharge.bodyRadius + 3 + ran)) {
            if (this.sentryDashHit.has(p.__id)) continue;
            if (math.distToSegmentSq(p.pos, this.posOld, this.pos) > (SentryCharge.bodyRadius + p.rad) ** 2) continue;
            // the guard in damage() records the hit, so the crescent can't hit this player again
            p.damage({
                amount: SentryCharge.damage,
                damageType: GameConfig.DamageType.Player,
                gameSourceType: "kit_sentry_charge",
                weaponSourceType: "kit_sentry_charge",
                source: this,
                dir: this.sentryDashDir,
                armorPenetration: SentryCharge.armorPen,
                hitsFlying: true,
            });
        }

        const pull = SentryCharge.speed * SentryCharge.pullSpeedMult * dt;
        this.sentryDashGrabbed = this.sentryDashGrabbed.filter((p) => {
            if (p.dead || p.stunTime <= 0) return false;
            const hold = v2.add(this.pos, v2.mul(this.sentryDashDir, this.rad + p.rad + 0.3));
            const to = v2.sub(hold, p.pos);
            const dist = v2.length(to);
            if (dist > 0.001) {
                v2.set(p.pos, v2.add(p.pos, v2.mul(to, Math.min(dist, pull) / dist)));
            }
            const objs = this.game.grid.intersectCollider(
                collider.createCircle(p.pos, p.rad + 1),
            );
            for (const obj of objs) {
                if (obj.__type !== ObjectType.Obstacle || !obj.collidable || obj.dead) continue;
                if (!util.sameLayer(obj.layer, p.layer)) continue;
                const hit = collider.intersectCircle(obj.collider, p.pos, p.rad);
                if (hit) v2.set(p.pos, v2.add(p.pos, v2.mul(hit.dir, hit.pen + 0.001)));
            }
            p.mapIndicator?.updatePosition(p.pos);
            p.setPartDirty();
            // pinned behind a wall while the Sentry flies on: let go
            return v2.length(v2.sub(hold, p.pos)) <= 4;
        });

        if (this.sentryDashTime <= 0) this.endSentryDash();
    }

    sentryNovaRadius = 0;
    sentryNovaActive = false;
    sentryNovaHits = new Map<number, { n: number; t: number }>();
    sentryNovaGrabbed: Player[] = [];
    /** counts casts so clients can start the ring; wraps in 3 bits */
    solarCasts = 0;
    penGuardTime = 0;

    get solarCast(): number {
        return this.solarCasts & 7;
    }

    startSentryNova() {
        this.sentryNovaActive = true;
        this.sentryNovaRadius = 0;
        this.sentryNovaHits.clear();
        this.sentryNovaGrabbed = [];
        this.penGuardTime = SentryNova.penGuardTime;
        this.solarCasts++;
        this.setDirty();
    }

    /**
     * Sentry Solar Explosion, every tick: the ring grows; anyone inside it is hit (up to 5 times, 100 each) and,
     * once hit, dragged outward on the wave front, walls stopping them
     */
    updateSentryNova(dt: number) {
        if (this.penGuardTime > 0) this.penGuardTime -= dt;
        if (!this.sentryNovaActive) return;
        if (this.dead) {
            this.sentryNovaActive = false;
            return;
        }
        this.sentryNovaRadius = Math.min(SentryNova.radius, this.sentryNovaRadius + SentryNova.speed * dt);
        const r = this.sentryNovaRadius;
        for (const p of this.enemiesWithin(r)) {
            let h = this.sentryNovaHits.get(p.__id);
            if (!h) {
                h = { n: 0, t: 0 };
                this.sentryNovaHits.set(p.__id, h);
                this.sentryNovaGrabbed.push(p);
            }
            h.t -= dt;
            if (h.n >= SentryNova.hits || h.t > 0) continue;
            h.n++;
            h.t = SentryNova.hitEvery;
            p.damage({
                amount: SentryNova.damage,
                damageType: GameConfig.DamageType.Player,
                gameSourceType: "kit_sentry_solar",
                weaponSourceType: "kit_sentry_solar",
                source: this,
                dir: v2.normalizeSafe(v2.sub(p.pos, this.pos), v2.create(1, 0)),
            });
        }
        this.sentryNovaGrabbed = this.sentryNovaGrabbed.filter((p) => {
            if (p.dead) return false;
            const h = this.sentryNovaHits.get(p.__id)!;
            if (h.n >= SentryNova.hits && h.t <= 0) return false;
            const away = v2.normalizeSafe(v2.sub(p.pos, this.pos), v2.create(1, 0));
            const want = r - p.rad;
            if (want > v2.distance(p.pos, this.pos)) {
                v2.set(p.pos, v2.add(this.pos, v2.mul(away, want)));
                const objs = this.game.grid.intersectCollider(collider.createCircle(p.pos, p.rad + 1));
                for (const obj of objs) {
                    if (obj.__type !== ObjectType.Obstacle || !obj.collidable || obj.dead) continue;
                    if (!util.sameLayer(obj.layer, p.layer)) continue;
                    const hit = collider.intersectCircle(obj.collider, p.pos, p.rad);
                    if (hit) v2.set(p.pos, v2.add(p.pos, v2.mul(hit.dir, hit.pen + 0.001)));
                }
                p.mapIndicator?.updatePosition(p.pos);
                p.setPartDirty();
            }
            return true;
        });
        const spent = this.sentryNovaGrabbed.every(
            (p) => (this.sentryNovaHits.get(p.__id)?.n ?? 0) >= SentryNova.hits,
        );
        if (r >= SentryNova.radius && spent) this.sentryNovaActive = false;
    }

    /** Iron Man's Laser Spin while it runs (see IronManSpin): the angle of the first laser and who each has hit */
    ironSpin?: { time: number; angle: number; hit: Set<string> };
    /** Iron Man's Blast Combo while it runs (see IronManCombo) */
    ironCombo?: { time: number; target: Player; fired: boolean; drones: Vec2[] };

    /** a sprite shot of Iron Man's that hurts no one: a streak of the spin, or a drone parked for `life` s */
    fireIronFx(kind: "drone", pos: Vec2, dir: Vec2, life?: number) {
        const type = `bullet_kit_ironman_fx_${kind}`;
        const maxLife = GameObjectDefs.typeToDef(type, "bullet").lifetime ?? 0;
        this.game.bulletBarn.fireBullet(
            {
                playerId: this.__id,
                bulletType: type,
                gameSourceType: "kit_ironman_combo_laser",
                damageType: GameConfig.DamageType.Player,
                pos,
                dir,
                layer: this.layer,
                damageMult: 1,
                shotFx: false,
                reflectCount: 0,
                ghost: true,
                age: life === undefined ? 0 : maxLife - Math.max(life, 0.02),
            } as Parameters<typeof this.game.bulletBarn.fireBullet>[0],
        );
    }

    /** counts Laser Spin casts so clients can draw the beams; wraps in 3 bits */
    ironSpinCasts = 0;

    get ironSpinCast(): number {
        return this.ironSpinCasts & 7;
    }

    /** the sound of one of Iron Man's skills: a shot with nothing in it, so clients play the gun's `shoot` sound */
    fireIronSound(gun: string) {
        this.game.bulletBarn.fireBullet(
            {
                playerId: this.__id,
                bulletType: "bullet_kit_ironman_fx_sound",
                gameSourceType: gun,
                damageType: GameConfig.DamageType.Player,
                pos: v2.copy(this.pos),
                dir: v2.copy(this.dir),
                layer: this.layer,
                damageMult: 1,
                shotFx: true,
                reflectCount: 0,
                ghost: true,
            } as Parameters<typeof this.game.bulletBarn.fireBullet>[0],
        );
    }

    startIronSpin() {
        this.fireIronSound("kit_ironman_spin");
        this.ironSpinCasts++;
        this.setDirty();
        this.ironSpin = { time: 0, angle: Math.atan2(this.dir.y, this.dir.x) + Math.PI / 2, hit: new Set() };
    }

    /**
     * Laser Spin, every tick: the two lasers turn, and everything they pass over is hit; enemies once per laser
     * (30 and burning), every obstacle destroyed. The sweep is sampled every 1.5 degrees so a long tick can't
     * skip anyone
     */
    updateIronSpin(dt: number) {
        const s = this.ironSpin;
        if (!s) return;
        const step = Math.min(dt, IronManSpin.time - s.time);
        if (this.dead || step <= 0) {
            this.ironSpin = undefined;
            return;
        }
        const sweep = (Math.PI * 2 / IronManSpin.time) * step;
        const samples = Math.max(1, Math.ceil(sweep / (Math.PI / 120)));
        const enemies = this.enemiesWithin(IronManSpin.range + 3);
        const objs = this.game.grid.intersectCollider(collider.createCircle(this.pos, IronManSpin.range + 2));
        for (let k = 1; k <= samples; k++) {
            const angle = s.angle + sweep * (k / samples);
            for (let beam = 0; beam < 2; beam++) {
                const a = angle + beam * Math.PI;
                const dir = v2.create(Math.cos(a), Math.sin(a));
                const end = v2.add(this.pos, v2.mul(dir, IronManSpin.range));
                for (const p of enemies) {
                    const key = `${p.__id}:${beam}`;
                    if (s.hit.has(key) || p.dead) continue;
                    if (math.distToSegmentSq(p.pos, this.pos, end) > (p.rad + IronManSpin.beamRadius) ** 2) continue;
                    s.hit.add(key);
                    p.damage({
                        amount: IronManSpin.damage,
                        damageType: GameConfig.DamageType.Player,
                        gameSourceType: "kit_ironman_spin",
                        weaponSourceType: "kit_ironman_spin",
                        source: this,
                        dir,
                        hitsFlying: true,
                    });
                }
                for (const obj of objs) {
                    if (obj.__type !== ObjectType.Obstacle || obj.dead || !obj.destructible) continue;
                    if (!util.sameLayer(obj.layer, this.layer)) continue;
                    if (!collider.intersectSegment(obj.collider, this.pos, end)) continue;
                    obj.kill({
                        amount: obj.health,
                        damageType: GameConfig.DamageType.Player,
                        gameSourceType: "kit_ironman_spin",
                        weaponSourceType: "kit_ironman_spin",
                        source: this,
                        dir,
                    });
                }
            }
        }
        s.angle += sweep;
        s.time += step;
        if (s.time >= IronManSpin.time) this.ironSpin = undefined;
    }

    /** the Blast Combo needs a marked enemy who can be hit, and only one runs at a time */
    canStartIronCombo() {
        const t = this.markTarget;
        return !this.dead && !this.ironCombo && !!t && !t.dead && !t.untargetable;
    }

    startIronCombo() {
        const target = this.markTarget!;
        const C = IronManCombo;
        const toward = v2.normalizeSafe(v2.sub(target.pos, this.pos), this.dir);
        const side = v2.perp(toward);
        const drones = C.drones.map((d) => v2.add(this.pos, v2.add(v2.mul(side, d.side), v2.mul(toward, d.fwd))));
        target.stunTime = Math.max(target.stunTime, C.duration);
        target.webPull = undefined;
        target.setDirty();
        this.ironCombo = { time: 0, target, fired: false, drones };
        for (const d of drones) this.fireIronFx("drone", v2.copy(d), toward, C.droneEnd);
    }

    endIronCombo(done = false) {
        const c = this.ironCombo;
        if (!c) return;
        this.ironCombo = undefined;
        if (done) return;
        // cut short (he died, the target went): the target is let go of what is left of its stun
        const left = IronManCombo.duration - c.time;
        if (left > 0 && !c.target.dead) {
            c.target.stunTime = Math.max(0, c.target.stunTime - left);
            c.target.setDirty();
        }
    }

    updateIronCombo(dt: number) {
        const c = this.ironCombo;
        if (!c) return;
        if (this.dead || c.target.dead) {
            this.endIronCombo();
            return;
        }
        const C = IronManCombo;
        c.time += dt;
        if (!c.fired && c.time + 1e-6 >= C.fireAt) {
            c.fired = true;
            const shoot = (type: string, from: Vec2, shotFx = false) =>
                this.game.bulletBarn.fireBullet(
                    {
                        playerId: this.__id,
                        bulletType: type,
                        gameSourceType: "kit_ironman_combo_laser",
                        damageType: GameConfig.DamageType.Player,
                        pos: v2.copy(from),
                        dir: v2.normalizeSafe(v2.sub(c.target.pos, from), this.dir),
                        layer: this.layer,
                        damageMult: 1,
                        shotFx,
                        reflectCount: 0,
                        ghost: true,
                    } as Parameters<typeof this.game.bulletBarn.fireBullet>[0],
                );
            for (const d of c.drones) shoot("bullet_kit_ironman_combo_small", d);
            shoot("bullet_kit_ironman_combo_main", this.pos, true);
        }
        // he is free once the drones are gone; the target stays stunned for the full `duration`
        if (c.time >= C.droneEnd) this.endIronCombo(true);
    }

    /** Ultron's Combo: the one being run, if any (see UltronCombo) */
    ultronCombo?: {
        /** seconds since the cast */
        time: number;
        /** how far the ring has spread */
        ring: number;
        /** who the ring has hit, and the shots it has deleted (for the cap) */
        hit: Set<number>;
        deleted: number;
        /** the marked enemy: the closest one the ring hit */
        target?: Player;
        /** the steps already done */
        done: Set<string>;
        /** where the red orbs hang round the marked enemy, then go off, and where the portals open */
        spots: Vec2[];
    };
    /** marked by an Ultron's Combo: an orange target under them */
    ultronMarked = false;

    startUltronCombo() {
        if (this.ultronCombo) return;
        // the skill costs all his energy
        this.energy = 0;
        this.energyDirty = true;
        const duration = UltronComboTimes.end + 0.05;
        // he hangs in the air, untargetable, until it is over
        this.startFlight({ duration, untargetable: duration, waveAt: 0, speedBonus: 0 }, "kit_ultron_blast");
        this.ultronCombo = {
            time: 0,
            ring: 0,
            hit: new Set(),
            deleted: 0,
            done: new Set(),
            spots: [],
        };
        // the green ring: a circle of shots that spread as fast as the ring does
        const n = UltronCombo.ring.bullets;
        for (let i = 0; i < n; i++) {
            const a = (i / n) * Math.PI * 2;
            this.fireComboFx("ring", v2.copy(this.pos), v2.create(Math.cos(a), Math.sin(a)));
        }
        this.setDirty();
    }

    endUltronCombo() {
        const c = this.ultronCombo;
        if (!c) return;
        this.ultronCombo = undefined;
        if (c.target?.ultronMarked) {
            c.target.ultronMarked = false;
            c.target.setDirty();
        }
        // an early end (the ring found no one, he died, the target is gone) lets him down at once
        if (this.flightTime > 0) {
            this.flightTime = 0;
            this.setDirty();
        }
    }

    /**
     * a sprite shot of Ultron's Combo that hurts no one: the ring, the orbs, the portals. `life` is how long it
     * stays up, in seconds
     */
    fireComboFx(kind: "ring" | "red" | "blue" | "portal", pos: Vec2, dir: Vec2, life?: number) {
        const type = `bullet_kit_ultron_fx_${kind}`;
        const maxLife = GameObjectDefs.typeToDef(type, "bullet").lifetime ?? 0;
        this.game.bulletBarn.fireBullet(
            {
                playerId: this.__id,
                bulletType: type,
                gameSourceType: "kit_ultron_blast",
                damageType: GameConfig.DamageType.Player,
                pos,
                dir,
                layer: this.layer,
                damageMult: 1,
                shotFx: false,
                reflectCount: 0,
                ghost: true,
                // the parked shots live `lifetime` s less the age they are born with
                age: life === undefined ? 0 : maxLife - Math.max(life, 0.02),
            } as Parameters<typeof this.game.bulletBarn.fireBullet>[0],
        );
    }

    /** a real shot of Ultron's Combo, from a portal at the marked enemy; it flies through walls so it always lands */
    fireComboShot(type: string, from: Vec2, at: Vec2) {
        this.game.bulletBarn.fireBullet(
            {
                playerId: this.__id,
                bulletType: type,
                gameSourceType: "kit_ultron_blast",
                damageType: GameConfig.DamageType.Player,
                pos: v2.copy(from),
                dir: v2.normalizeSafe(v2.sub(at, from), this.dir),
                layer: this.layer,
                damageMult: 1,
                shotFx: false,
                reflectCount: 0,
                ghost: true,
            } as Parameters<typeof this.game.bulletBarn.fireBullet>[0],
        );
    }

    /** Ultron's Combo, every tick: the ring, then the orbs, then the three portals, on the times UltronComboTimes gives */
    updateUltronCombo(dt: number) {
        const c = this.ultronCombo;
        if (!c) return;
        if (this.dead) {
            this.endUltronCombo();
            return;
        }
        const T = UltronComboTimes;
        c.time += dt;
        const due = (key: string, at: number) => {
            // a hair of slack, so 0.1 s ticks adding up to 0.7999999 still count as 0.8
            if (c.done.has(key) || c.time + 1e-6 < at) return false;
            c.done.add(key);
            return true;
        };

        // the ring
        if (c.ring < UltronCombo.ring.radius) {
            c.ring = Math.min(UltronCombo.ring.radius, c.time * UltronCombo.ring.speed);
            this.updateUltronRing(c);
        }
        if (c.time < T.ringEnd) return;

        // no one in the ring: nothing to chase
        const target = c.target;
        if (!target || target.dead) {
            this.endUltronCombo();
            return;
        }

        const count = UltronCombo.orbs.count;
        if (due("orbs", T.ringEnd)) {
            // red orbs drop in a circle round the marked enemy; one of them is on Ultron's side of them
            const back = v2.normalizeSafe(v2.sub(this.pos, target.pos), this.dir);
            const turn = Math.atan2(back.y, back.x);
            for (let i = 0; i < count; i++) {
                const a = turn + (i / count) * Math.PI * 2;
                const way = v2.create(Math.cos(a), Math.sin(a));
                c.spots.push(v2.add(target.pos, v2.mul(way, UltronCombo.orbs.radius)));
                this.fireComboFx("red", c.spots[i], way, T.blueAt - c.time);
            }
        }
        if (due("blue", T.blueAt)) {
            // the blue outline: they go off when it has been up for orbs.blue s
            for (const spot of c.spots) this.fireComboFx("blue", spot, v2.copy(this.dir), T.boomAt - c.time);
        }
        if (due("boom", T.boomAt)) {
            for (let i = 0; i < count; i++) {
                this.game.explosionBarn.addExplosion("explosion_kit_ultron_orb", v2.copy(c.spots[i]), this.layer, {
                    source: this,
                    gameSourceType: "kit_ultron_blast",
                    weaponSourceType: "kit_ultron_blast",
                    damageType: GameConfig.DamageType.Player,
                });
                // a portal opens where each one went off, and closes as its laser has left
                this.fireComboFx(
                    "portal",
                    c.spots[i],
                    v2.normalizeSafe(v2.sub(target.pos, c.spots[i]), this.dir),
                    T.laserAt(i) + 0.03 - c.time,
                );
            }
        }
        // the portals fire in turn: a blast, then a laser
        for (let i = 0; i < count; i++) {
            if (due(`blast${i}`, T.fireAt(i))) {
                this.fireComboShot("bullet_kit_ultron_combo_blast", c.spots[i], target.pos);
            }
            if (due(`laser${i}`, T.laserAt(i))) {
                this.fireComboShot("bullet_kit_ultron_combo_laser", c.spots[i], target.pos);
            }
        }
        if (c.time >= T.end) this.endUltronCombo();
    }

    /** the combo's ring this tick: damage, stun and mark whoever it has reached, and delete enemy projectiles in it */
    updateUltronRing(c: NonNullable<Player["ultronCombo"]>) {
        const T = UltronComboTimes;
        let nearest: Player | undefined;
        let nearestDist = Infinity;
        for (const p of this.game.playerBarn.livingPlayers) {
            if (p === this || p.dead || p.teamId === this.teamId || !util.sameLayer(p.layer, this.layer)) continue;
            if (c.hit.has(p.__id)) continue;
            const dist = v2.length(v2.sub(p.pos, this.pos));
            if (dist > c.ring + p.rad) continue;
            c.hit.add(p.__id);
            // stunned until the combo is over (and a moment after), before the damage so nothing knocks them back
            p.stunTime = Math.max(p.stunTime, T.end + UltronCombo.stunAfter - c.time);
            p.webPull = undefined;
            p.setDirty();
            p.damage({
                amount: UltronCombo.ring.damage,
                damageType: GameConfig.DamageType.Player,
                gameSourceType: "kit_ultron_blast",
                weaponSourceType: "kit_ultron_blast",
                source: this,
                dir: v2.normalizeSafe(v2.sub(p.pos, this.pos), this.dir),
                hitsFlying: true,
            });
            if (dist < nearestDist) {
                nearest = p;
                nearestDist = dist;
            }
        }
        // the ring spreads outward, so the first enemy it reaches is the closest one
        if (nearest && !c.target) {
            c.target = nearest;
            nearest.ultronMarked = true;
            nearest.setDirty();
        }
        // enemy projectiles inside it are deleted (clients end the shots near the pop)
        for (const b of this.game.bulletBarn.bullets) {
            if (!b.active || !b.alive) continue;
            if (b.player === this || b.player?.teamId === this.teamId) continue;
            if (b.bulletType.startsWith("bullet_kit_ultron_fx_")) continue;
            if (v2.length(v2.sub(b.pos, this.pos)) > c.ring) continue;
            b.alive = false;
            b.active = false;
            b.onHitFx = "";
            if (c.deleted++ < 24) {
                this.game.explosionBarn.addExplosion("explosion_kit_pop", v2.copy(b.pos), b.layer, {
                    source: this,
                    gameSourceType: "kit_ultron_blast",
                    weaponSourceType: "kit_ultron_blast",
                    damageType: GameConfig.DamageType.Player,
                });
            }
        }
    }

    /** Wizard's Crystal Burst: the mini crystals lying on the field, and the parked sprite showing each */
    wizardShards: { pos: Vec2; time: number; layer: number; bullet?: Bullet }[] = [];
    /** Wizard's Stun Wave while it spreads: how far it has got and who it has hit */
    wizardWave?: { r: number; hit: Set<number>; deleted: number };
    /** counts Stun Wave casts so clients can draw the ring; wraps in 3 bits */
    wizardWaveCasts = 0;

    get wizardWaveCast(): number {
        return this.wizardWaveCasts & 7;
    }

    /** the crystal hit something at `at`: mini crystals go down round it, `shardRadius` tiles out */
    burstWizardCrystal(at: Vec2, layer: number) {
        const C = WizardCrystals;
        this.game.explosionBarn.addExplosion("explosion_kit_pop", v2.copy(at), layer, {
            source: this,
            gameSourceType: "kit_wizard_crystals",
            weaponSourceType: "kit_wizard_crystals",
            damageType: GameConfig.DamageType.Player,
        });
        const start = Math.random() * Math.PI * 2;
        for (let i = 0; i < C.shards; i++) {
            const a = start + (i * Math.PI * 2) / C.shards;
            const pos = v2.add(at, v2.create(Math.cos(a) * C.shardRadius, Math.sin(a) * C.shardRadius));
            this.game.map.clampToMapBounds(pos);
            const type = "bullet_kit_wizard_fx_shard";
            const maxLife = GameObjectDefs.typeToDef(type, "bullet").lifetime ?? 0;
            const bullet = this.game.bulletBarn.fireBullet(
                {
                    playerId: this.__id,
                    bulletType: type,
                    gameSourceType: "kit_wizard_crystals",
                    damageType: GameConfig.DamageType.Player,
                    pos: v2.copy(pos),
                    dir: v2.create(1, 0),
                    layer,
                    damageMult: 1,
                    shotFx: false,
                    reflectCount: 0,
                    ghost: true,
                    age: maxLife - C.shardLife,
                } as Parameters<typeof this.game.bulletBarn.fireBullet>[0],
            );
            this.wizardShards.push({ pos, time: C.shardLife, layer, bullet });
        }
    }

    /** every tick: a shard goes off on the first enemy to touch it, or just goes when its time is up */
    updateWizardShards(dt: number) {
        const C = WizardCrystals;
        this.wizardShards = this.wizardShards.filter((sh) => {
            sh.time -= dt;
            const hitter = this.dead || sh.time <= 0
                ? undefined
                : this.game.playerBarn.livingPlayers.find((p) =>
                    !p.dead && p !== this && p.teamId !== this.teamId && !p.untargetable
                    && util.sameLayer(p.layer, sh.layer)
                    && v2.length(v2.sub(p.pos, sh.pos)) <= C.shardTouch + p.rad
                );
            if (!hitter && sh.time > 0 && !this.dead) return true;
            // the sprite goes with it (its slot may have been reused by now, so check it is still this one)
            const b = sh.bullet;
            const same = b && b.active && b.player === this && b.bulletType === "bullet_kit_wizard_fx_shard"
                && v2.length(v2.sub(b.pos, sh.pos)) < 0.5;
            if (b && same) {
                b.alive = false;
                b.active = false;
            }
            if (hitter) {
                this.game.explosionBarn.addExplosion("explosion_kit_wizard_shard", v2.copy(sh.pos), sh.layer, {
                    source: this,
                    gameSourceType: "kit_wizard_crystals",
                    weaponSourceType: "bullet_kit_wizard_crystal_shard",
                    damageType: GameConfig.DamageType.Player,
                });
            }
            return false;
        });
    }

    startWizardWave() {
        this.fireIronSound("kit_wizard_crystals");
        this.wizardWave = { r: 0, hit: new Set(), deleted: 0 };
        this.wizardWaveCasts++;
        this.setDirty();
    }

    /**
     * Stun Wave, every tick: the ring grows to the radius of his circle; each enemy it reaches takes 30 and is
     * stunned 3 s, and enemy shots inside it are deleted (clients end them near the pop)
     */
    updateWizardWave(dt: number) {
        const w = this.wizardWave;
        if (!w) return;
        if (this.dead) {
            this.wizardWave = undefined;
            return;
        }
        const max = KitDefs.wizard.aura!.radius;
        w.r = Math.min(max, w.r + WizardWave.speed * dt);
        for (const p of this.game.playerBarn.livingPlayers) {
            if (
                p === this || p.dead || p.teamId === this.teamId || w.hit.has(p.__id)
                || !util.sameLayer(p.layer, this.layer) || v2.length(v2.sub(p.pos, this.pos)) > w.r
            ) continue;
            w.hit.add(p.__id);
            p.damage({
                amount: WizardWave.damage,
                damageType: GameConfig.DamageType.Player,
                gameSourceType: "kit_wizard_wave",
                weaponSourceType: "kit_wizard_wave",
                source: this,
                dir: v2.normalizeSafe(v2.sub(p.pos, this.pos), v2.create(1, 0)),
                hitsFlying: true,
            });
            p.stunTime = Math.max(p.stunTime, WizardWave.stun);
            p.wizardStunTime = Math.max(p.wizardStunTime, WizardWave.stun);
            p.webPull = undefined;
            p.setDirty();
        }
        for (const b of this.game.bulletBarn.bullets) {
            if (!b.active || !b.alive) continue;
            if (b.player === this || b.player?.teamId === this.teamId) continue;
            if (b.bulletType.includes("_fx_")) continue;
            if (v2.length(v2.sub(b.pos, this.pos)) > w.r) continue;
            b.alive = false;
            b.active = false;
            b.onHitFx = "";
            if (w.deleted++ < 24) {
                this.game.explosionBarn.addExplosion("explosion_kit_pop", v2.copy(b.pos), b.layer, {
                    source: this,
                    gameSourceType: "kit_wizard_wave",
                    weaponSourceType: "kit_wizard_wave",
                    damageType: GameConfig.DamageType.Player,
                });
            }
        }
        if (w.r >= max) this.wizardWave = undefined;
    }

    /** a Sentry Charge hit: burn, bleed and stun, and every perk gone for a while */
    applySentryHit(source: Player) {
        this.applyBurn(SentryCharge.debuff, source, "kit_sentry_charge");
        this.applyBleed(SentryCharge.debuff, source);
        this.stunTime = Math.max(this.stunTime, SentryCharge.debuff);
        this.webPull = undefined;
        this.stripPerks(SentryCharge.perkStrip);
        // mid-dash, whoever is hit is carried along with him
        if (source.sentryDashTime > 0 && !source.sentryDashGrabbed.includes(this)) {
            source.sentryDashGrabbed.push(this);
        }
        this.setDirty();
    }

    stripPerks(time: number) {
        for (const perk of [...this.perks]) {
            this.strippedPerks.push({ ...perk });
            this.removePerk(perk.type);
        }
        this.perkStripTime = Math.max(this.perkStripTime, time);
    }

    restorePerks() {
        for (const perk of this.strippedPerks) {
            if (!this.hasPerk(perk.type)) {
                this.addPerk(perk.type, perk.droppable, perk.replaceOnDeath, perk.isFromRole);
            }
        }
        this.strippedPerks = [];
        this.perkStripTime = 0;
        this.setDirty();
    }

    // Judge rocket
    activeJudgeRocket?: any;

    get bleeding() {
        return this.bleedDotDuration > 0;
    }

    get poisoned() {
        return this.poisonDuration > 0;
    }

    // Charm (Aphrodite Crossbow): attacks half as fast
    charmDuration = 0;

    /** Summoner's whips: seconds left of each whip's mark (index = its place in KitDefs.summoner.whips.list) */
    whipMarks: number[] = [0, 0, 0];
    /** the whip fired next, and seconds until it is */
    whipIdx = 0;
    whipTimer = 0;

    get vulnerable() {
        return this.whipMarks.some((t) => t > 0);
    }

    /** Summoner's Bundle of Potions: seconds left of its buffs (see SummonerPotions) */
    potionTime = 0;

    get potions() {
        return this.potionTime > 0;
    }

    /** Summoner's Rod of Discord: pay hp, appear where the cursor is (kept inside the map) */
    teleportToCursor() {
        this.health -= SummonerRod.cost;
        const to = v2.add(this.pos, v2.mul(this.dir, this.toMouseLen));
        this.game.map.clampToMapBounds(to, this.rad);
        v2.set(this.pos, to);
        this.setPartDirty();
        this.game.grid.updateObject(this);
        this.setDirty();
    }

    startPotions() {
        const p = SummonerPotions;
        if (!this.potions) this.setDirty();
        this.potionTime = p.duration;
        this.burnDuration = 0;
        this.health = math.min(this.health + p.heal, this.maxHealth);
        this.setDirty();
    }

    /** the extra damage a Summoner's minion hit does to this enemy, from all the whips that marked it */
    whipExtraDamage() {
        const list = KitDefs.summoner.whips!.list;
        return this.whipMarks.reduce((sum, t, i) => sum + (t > 0 ? list[i].extra ?? 0 : 0), 0);
    }

    get charmed() {
        return this.charmDuration > 0;
    }

    get burning() {
        return this.burnDuration > 0;
    }

    applyBleed(duration: number, source?: Player) {
        if (this.bleedDotDuration <= 0) this.setDirty();
        this.bleedDotDuration = Math.max(this.bleedDotDuration, duration);
        if (source) this.bleedDotSource = source;
    }

    applyPoison(duration: number, source?: Player) {
        if (this.poisonDuration <= 0) this.setDirty();
        this.poisonDuration = Math.max(this.poisonDuration, duration);
        if (source) this.poisonSource = source;
    }

    burnWeapon = "pg_frozen_dragon";

    applyBurn(duration: number, source?: Player, weapon = "pg_frozen_dragon") {
        // the potions make him immune to fire
        if (this.potionTime > 0) return;
        if (this.burnDuration <= 0) this.setDirty();
        this.burnWeapon = weapon;
        this.burnDuration = Math.max(this.burnDuration, duration);
        if (source) this.burnSource = source;
    }

    minBoost = 0;
    /** seconds left that minBoost doesn't refill what Indomitable Spirit used */
    lifelineDrainTicker = 0;
    lastBoost = 0;

    private _boost = 0;
    get boost() {
        return this._boost;
    }
    set boost(boost: number) {
        this._boost = math.clamp(boost, 0, 100);
    }

    speed: number = 0;
    moveVel = v2.create(0, 0);

    // used to filter out AFK players on 50v50 role promotions
    movingTicker = 0;
    stayingStillTicker = 0;
    timeWithoutMoving = 0;

    shotSlowdownTimer: number = 0;

    freeSwitchTimer: number = 0;

    indoors = false;
    /** private kit option: throwing never uses one up */
    unlimitedThrowables = false;
    insideZoomRegion = false;

    _zoom: number = 0;

    get zoom(): number {
        return this._zoom;
    }

    set zoom(zoom: number) {
        if (zoom === this._zoom) return;
        assert(zoom !== 0);
        this._zoom = zoom;
        this.zoomDirty = true;
    }

    scopeZoomRadius: Record<string, number>;

    scope = "1xscope";

    get inventory() {
        return this.invManager.items;
    }
    invManager = new InventoryManager(this);

    get curWeapIdx() {
        return this.weaponManager.curWeapIdx;
    }

    weapons: WeaponManager["weapons"];

    get activeWeapon() {
        return this.weaponManager.activeWeapon;
    }

    private _spectatorCount = 0;

    recalculateSpectatorCount() {
        const newCount = [...this.spectators].filter(c => !c.specAnon).length;
        if (this._spectatorCount !== newCount) {
            this._spectatorCount = newCount;
            this.spectatorCountDirty = true;
        }
    }

    get spectatorCount(): number {
        return this._spectatorCount;
    }

    spectators = new Set<Client>();

    outfit = "outfitBase";

    setOutfit(outfit: string) {
        if (this.outfit === outfit) return;
        const def = GameObjectDefs.typeToDef(outfit, "outfit");
        if (this.game.map.factionMode) {
            if (def.teamId && this.teamId !== def.teamId) {
                return;
            }
        }
        this.outfit = outfit;

        this.obstacleOutfit?.destroy();
        this.obstacleOutfit = undefined;

        if (def.obstacleType) {
            this.obstacleOutfit = this.game.map.genOutfitObstacle(def.obstacleType, this, def.baseScale);
        }
        this.setDirty();
    }

    /** "backpack00" is no backpack, "backpack03" is the max level backpack */
    backpack: string;
    /** "" is no helmet, "helmet03" is the max level helmet */
    helmet: string;
    /** "" is no chest, "chest03" is the max level chest */
    chest: string;

    getGearLevel(type: string): number {
        if (!type) {
            // not wearing any armor, level 0
            return 0;
        }
        return (GameObjectDefs.typeToDef(type) as BackpackDef | HelmetDef | ChestDef).level;
    }

    /**
     * Handles knowing if a gear item is better or worse, to show the "better item equipped" toast
     */
    getGearQuality(type: string) {
        if (!type) {
            return 0;
        }

        const def = GameObjectDefs.typeToDef(type) as BackpackDef | HelmetDef | ChestDef;
        let level = def.level * 10;
        if (def.type === "helmet") {
            if (def.perk) {
                level += 1;
            }
            if (def.role) {
                level += 1;
            }
        } else if (def.type === "backpack") {
            level += def.maxPerks ?? 1;
        }
        return level;
    }

    layer: number;
    aimLayer = 0;
    dead = false;
    downed = false;

    downedCount = 0;
    /**
     * players have a buffer where they can't take damage immediately after being downed
     * this is mostly so players dont get knocked AND killed by the same airstrike
     */
    downedDamageTicker = 0;
    bleedTicker = 0;
    playerBeingRevived: Player | undefined;
    revivedBy: Player | undefined;

    animType: Anim = GameConfig.Anim.None;
    animSeq = 0;
    private _animTicker = 0;

    distSinceLastCrawl = 0;

    actionType: Action = GameConfig.Action.None;
    actionSeq = 0;
    action = { time: 0, duration: 0, targetId: 0 };

    timeUntilHidden = -1; // for showing on enemy minimap in 50v50

    /**
     * specifically for reloading single shot guns to keep reloading until maxClip is reached
     */
    reloadAgain = false;

    visionObscured = false;
    visionRecoveryTicker = 0;
    wearingPan = false;

    /** the hacker's pan blocks and draws twice as big */
    get bigPan() {
        return isHackerLevel(this.botBrain?.level);
    }
    healEffect = false;
    healEffectTicker = 0;

    lastStandEffect = false;
    lastStandEffectTicker = 0;

    // if hit by snowball, potato, or coconut: slowed down for "x" seconds
    frozenTicker = 0;
    frozen = false;
    frozenOri = 0;
    frozenType = "";

    private _hasteTicker = 0;
    hasteType: HasteType = GameConfig.HasteType.None;
    hasteSeq = 0;

    actionItem = "";

    hasRoleHelmet = false;
    role = "";
    isKillLeader = false;

    /** for cobalt mode role menu, will spawn the player by force if timer runs out */
    roleMenuTicker = 0;

    /** for the perk fabricate, fills inventory with frags every 12 seconds */
    fabricateRefillTicker = 0;
    fabricateGiveTicker = 0;
    fabricateThrowablesLeft: Array<FabricateThrowable> = [];

    // "Gabby Ghost" perk random emojis
    chattyTicker = 0;

    mapIndicator?: MapIndicator;

    // spud gun variables

    fatModifier = 0;
    fatTicker = 0;

    viewDistModifier = 0;
    viewDistTicker = 0;

    timeInsideGas = 0;

    promoteToRole(role: string) {
        let roleDef = GameObjectDefs.typeToDef(role, "role");

        const roleOverride = this.game.map.mapDef.gameConfig.roles?.roleOverrides?.[role];
        if (roleOverride) {
            roleDef = util.mergeDeep<RoleDef>({}, roleDef, roleOverride);
        }

        if (role === "leader") {
            this.hasFiredFlare = false;
            this.flareTimer = 15;
        }

        if (this.role === role) return;

        // switching from one role to another
        // need to delete any non-droppables so they can be overwritten
        if (this.role) {
            if (this.helmet && GameObjectDefs.typeToDef(this.helmet, "helmet").noDrop) {
                this.helmet = "";
            }
            if (this.chest && GameObjectDefs.typeToDef(this.chest, "chest").noDrop) {
                this.chest = "";
            }
        }

        this.role = role;
        this.inventoryDirty = true;
        this.setDirty();

        // for savannah the hunted indicator
        if (roleDef.mapIndicator) {
            this.mapIndicator?.kill();
            this.mapIndicator = this.game.mapIndicatorBarn.allocIndicator(role, true);
        }

        const msg = new net.RoleAnnouncementMsg();
        msg.role = role;
        msg.assigned = true;
        msg.playerId = this.__id;
        this.game.clientBarn.broadcastMsg(net.MsgType.RoleAnnouncement, msg);

        switch (role) {
            case "leader":
                if (this.game.map.factionMode && !this.team!.leader) {
                    this.team!.leader = this;
                }
                break;
            case "last_man":
                this.health = 100;
                this.boost = 100;
                this.giveHaste(GameConfig.HasteType.Windwalk, 5);
                break;
        }

        // A list of the new perks to add must be built first
        const newPerks = new Set<string>();

        // Random perk addition logiic
        if (role === "classless") {
            const perkPool = PerkProperties.classless.perkPool;
            const candidatePerks = perkPool.filter((perk) => !this.hasPerk(perk));
            const newPerk = util.randomItem(candidatePerks);

            if (newPerk) {
                newPerks.add(newPerk);
            }
        } else if (roleDef.perks) {
            // client can only show 4 perks in the UI
            // if this role has 4 or more perks, drop all our droppable perks
            if (roleDef.perks.length >= 4) {
                for (const perk of this.perks) {
                    if (perk.droppable) {
                        this.dropLoot(perk.type);
                        this.removePerk(perk.type);
                    }
                }
            }
            for (let i = 0; i < roleDef.perks.length; i++) {
                const perkOrPerkFunc = roleDef.perks[i];
                const perkType = typeof perkOrPerkFunc === "string"
                    ? perkOrPerkFunc
                    : perkOrPerkFunc();

                newPerks.add(perkType);
            }
        }
        // Then, remove perks from the old role
        // But skip perks that are going to be readded to avoid double adding them or removing / readding pointlessly.
        for (let i = 0; i < this.perks.length; i++) {
            const perkType = this.perks[i].type;
            if (this.perks[i].isFromRole) {
                if (role != "classless" && !newPerks.has(perkType)) {
                    this.removePerk(perkType);
                    i--;
                } else {
                    newPerks.delete(perkType);
                }
            } else if (this.perks[i].droppable && newPerks.has(perkType)) {
                this.dropLoot(perkType);
                this.removePerk(perkType);
                i--;
            }
        }

        for (const perk of newPerks) {
            this.addPerk(perk, false, undefined, true);
        }

        if (roleDef.defaultItems) {
            // for non faction modes where teamId > 2, just cycles between blue and red teamId
            const clampedTeamId = ((this.teamId - 1) % 2) + 1;

            // give backpack before heals/ammos
            if (roleDef.defaultItems.backpack) {
                if (this.backpack) {
                    this.dropBackPackCopy(this.backpack);
                }
                this.backpack = roleDef.defaultItems.backpack;
            }

            // inventory and scope
            for (const [key, value] of Object.entries(roleDef.defaultItems.inventory)) {
                this.invManager.giveAndDrop(key as InventoryItem, value);
            }

            // outfit
            const oldOutfit = GameObjectDefs.typeToDef(this.outfit, "outfit");
            let newOutfit = roleDef.defaultItems.outfit;

            if (newOutfit instanceof Function) {
                newOutfit = newOutfit(clampedTeamId);
            }
            if (newOutfit) {
                if (!oldOutfit.noDropOnDeath && !oldOutfit.noDrop && this.outfit !== this.loadout.outfit) {
                    this.dropLoot(this.outfit);
                }
                this.setOutfit(newOutfit);
            }

            const roleHelmet = roleDef.defaultItems.helmet instanceof Function
                ? roleDef.defaultItems.helmet(clampedTeamId)
                : roleDef.defaultItems.helmet;

            if (roleHelmet) {
                // armor
                if (this.helmet && !this.hasRoleHelmet) {
                    this.dropArmor(this.helmet);
                }

                this.helmet = roleHelmet;
                this.hasRoleHelmet = true;
            } else if (this.hasRoleHelmet) {
                this.helmet = "";
                this.hasRoleHelmet = false;
            }

            if (roleDef.defaultItems.chest) {
                if (this.chest) {
                    this.dropArmor(this.chest);
                }
                this.chest = roleDef.defaultItems.chest;
            }

            // weapons (a locked film kit keeps its own: a pan-only hacker stays pan-only as leader)
            for (let i = 0; i < (this.lockedKit ? 0 : roleDef.defaultItems.weapons.length); i++) {
                const weaponOrWeaponFunc = roleDef.defaultItems.weapons[i];
                const trueWeapon = weaponOrWeaponFunc instanceof Function
                    ? weaponOrWeaponFunc(clampedTeamId)
                    : weaponOrWeaponFunc;

                if (!trueWeapon.type) {
                    // prevents overwriting existing weapons
                    if (!this.weapons[i].type) {
                        continue;
                    }

                    const curWeapDef = GameObjectDefs.typeToDef(this.weapons[i].type);
                    if (curWeapDef.type == "gun") {
                        // refills the ammo of the existing weapon
                        this.weaponManager.reload(i, true);
                    }
                    continue;
                }

                const trueWeapDef = GameObjectDefs.typeToDefSafe(trueWeapon.type);
                if (trueWeapDef && trueWeapDef.type == "gun") {
                    if (this.weapons[i].type) this.weaponManager.dropGun(i);

                    if (trueWeapon.fillInv) {
                        const ammoType = trueWeapDef.ammo as InventoryItem;
                        const maxSize = this.invManager.getMaxCapacity(ammoType);
                        this.invManager.set(ammoType, maxSize);
                    }
                } else if (trueWeapDef && trueWeapDef.type == "melee") {
                    if (this.weapons[i].type) {
                        const curMelee = GameObjectDefs.typeToDef(this.weapons[i].type, "melee");
                        if (!curMelee.noDropOnDeath) {
                            this.weaponManager.dropMelee();
                        }
                    }
                }
                this.weaponManager.setWeapon(i, trueWeapon.type, trueWeapon.ammo);
            }
        }

        this.questManager.trackEvent("promote", { role });
    }

    roleSelect(role: string): void {
        if (!this.game.map.perkModeTwinsBunker || this.role) return;

        // so the client can't be manipulated to send lone survivr or something
        if (!this.game.map.mapDef.gameMode.perkModeRoles!.includes(role)) return;

        this.roleMenuTicker = 0;
        this.promoteToRole(role);
        // v2.set() necessary since this.collider.pos is linked to this.pos by reference
        v2.set(this.pos, this.game.map.getSpawnPos(this.group, this.team));
        if (this.group && !this.group.spawnPosition) {
            this.group.spawnPosition = v2.copy(this.pos);
        }
        this.layer = 0; // player was underground before this

        this.game.grid.updateObject(this);
        this.setDirty();
    }

    removeRole(): void {
        if (!this.role) return;
        this.role = "";
        if (this.hasRoleHelmet) {
            this.hasRoleHelmet = false;
            this.helmet = "";
        }

        this.mapIndicator?.kill();
        for (let i = 0; i < this.perks.length; i++) {
            const perk = this.perks[i];
            if (perk.isFromRole) {
                this.removePerk(perk.type);
                i--;
            }
        }
        this.setDirty();
    }

    promoteToKillLeader() {
        if (this.isKillLeader) return;

        this.isKillLeader = true;
        if (this.game.playerBarn.killLeader) {
            this.game.playerBarn.killLeader.isKillLeader = false;
        }

        this.game.playerBarn.killLeader = this;
        this.game.playerBarn.killLeaderDirty = true;

        if (this.game.map.sniperMode) {
            // promote to the role on savannah
            this.promoteToRole("the_hunted");
        } else {
            // else just send a RoleAnnouncementMsg
            const msg = new net.RoleAnnouncementMsg();
            msg.role = "kill_leader";
            msg.assigned = true;
            msg.playerId = this.__id;
            this.game.clientBarn.broadcastMsg(net.MsgType.RoleAnnouncement, msg);
        }
    }

    combatStimsActive = false;
    private _combatStimsTicker = 0;

    lastBreathActive = false;
    private _lastBreathTicker = 0;

    bugleTickerActive = false;
    private _bugleTicker = 0;

    private _perks: Array<{
        type: string;
        droppable: boolean;
        replaceOnDeath?: string;
        isFromRole?: boolean;
    }> = [];

    get perks(): ReadonlyArray<Player["_perks"][0]> {
        return this._perks;
    }

    private _perkTypes: string[] = [];

    addPerk(
        type: string,
        droppable = false,
        replaceOnDeath?: string,
        isFromRole?: boolean,
    ) {
        this._perks.push({
            type,
            droppable,
            replaceOnDeath,
            isFromRole,
        });
        this._perkTypes.push(type);

        switch (type) {
            case "trick_m9": {
                const ammo = this.weaponManager.getAmmoStats(
                    GameObjectDefs.typeToDef("m9_cursed", "gun"),
                );
                this.weaponManager.setWeapon(
                    GameConfig.WeaponSlot.Secondary,
                    "m9_cursed",
                    ammo.maxClip,
                );
                break;
            }
            case "fabricate":
                this.fabricateRefillTicker = PerkProperties.fabricate.refillInterval;
                break;
            case "aoe_heal":
                this.game.playerBarn.aoeHealPlayers.push(this);
                break;
        }

        this.recalculateScale();
        this.recalculateMinBoost();
    }

    removePerk(type: string): void {
        const idx = this._perks.findIndex((perk) => perk.type === type);
        if (idx === -1) return;
        this._perks.splice(idx, 1);
        this._perkTypes.splice(this._perkTypes.indexOf(type), 1);

        switch (type) {
            case "trick_m9": {
                const slot = this.weapons.findIndex((weap) => {
                    return weap.type === "m9_cursed";
                });
                if (slot !== -1) {
                    this.weaponManager.setWeapon(slot, "", 0);
                }
                break;
            }
            case "inspiration": {
                const slot = this.weapons.findIndex((weap) => {
                    return weap.type === "bugle";
                });
                if (slot !== -1) {
                    this.weaponManager.setWeapon(slot, "", 0);
                }
                break;
            }
            case "fabricate":
                this.fabricateRefillTicker = 0;
                this.fabricateThrowablesLeft = [];
                break;
            case "firepower":
                this.weaponManager.clampGunsAmmo();
                break;
            case "aoe_heal": {
                util.removeFrom(this.game.playerBarn.aoeHealPlayers, this);
                break;
            }
            case "flak_jacket": {
                this.invManager.enforceMaxCapacity("frag");
                this.invManager.enforceMaxCapacity("mirv");
            }
        }

        this.recalculateScale();
        this.recalculateMinBoost();
    }

    hasPerk(type: string) {
        return this._perkTypes.includes(type);
    }

    hasActivePan() {
        return (
            this.wearingPan
            || (this.activeWeapon == "pan" && this.animType !== GameConfig.Anim.Melee)
        );
    }

    getPanSegment() {
        const panSurface = this.wearingPan ? "unequipped" : "equipped";
        let surface = GameObjectDefs.typeToDef("pan", "melee").reflectSurface![panSurface];

        const scale = this.scale;

        if (scale !== 1) {
            if (panSurface === "unequipped") {
                surface = {
                    p0: v2.mul(surface.p0, scale),
                    p1: v2.mul(surface.p1, scale),
                };
            } else {
                const s = (scale - 1) * 0.75;
                const off = v2.create(s, -s);
                surface = {
                    p0: v2.add(surface.p0, off),
                    p1: v2.add(surface.p1, off),
                };
            }
        }

        // the hacker's pan is twice as long, grown from its middle so it still sits in the same spot
        if (this.bigPan) {
            const mid = v2.mul(v2.add(surface.p0, surface.p1), 0.5);
            surface = {
                p0: v2.add(mid, v2.mul(v2.sub(surface.p0, mid), 2)),
                p1: v2.add(mid, v2.mul(v2.sub(surface.p1, mid), 2)),
            };
        }

        return surface;
    }

    client: Client;

    get userId() {
        return this.client.userId;
    }
    get disconnected() {
        return this.client.disconnected;
    }

    name: string;
    isMobile: boolean;

    bot: boolean;

    /** set on server-side AI players */
    botBrain?: BotBrain;
    /** keeps the weapons it spawned with (film episodes with a fixed kit) */
    lockedKit = false;
    /** private match side, 0 = Team A, 1 = Team B */
    privateSide?: number;

    debug = {
        zoomEnabled: false,
        zoom: 1,

        speedEnabled: false,
        speed: 1,

        noClip: false,
        teleportToPings: false,
        godMode: false,

        /** drag and drop loot, obstacles, and buildings */
        moveObjMode: <MoveObjsMode> {
            enabled: false,
            /** object you're currently dragging */
            selectedObj: undefined,
            /** original position of the selected obj */
            originalPos: undefined,
            /** mouse position when obj first selected */
            selectPos: undefined,
        },
    };

    teamId = 1;
    groupId = 0;

    loadout = {
        outfit: "outfitBase",
        heal: "heal_basic",
        boost: "boost_basic",
        emotes: [...GameConfig.defaultEmoteLoadout],
    };

    emoteSoftTicker = 0;
    emoteHardTicker = 0;
    emoteCounter = 0;

    damageTaken = 0;
    damageDealt = 0;
    questManager = new QuestManager(this);

    // infinity since we aren't dead yet ;)
    // this is used for sorting and getting player ranks
    // first player to die is 0, second is 1 etc
    killedIndex = Infinity;

    kills = 0;
    timeAlive = 0;

    weaponManager = new WeaponManager(this);
    recoilTicker = 0;

    // to disable auto pickup for some seconds after dropping something
    mobileDropTicker = 0;

    obstacleOutfit?: Obstacle;

    /**
     * Only used for match data saving!
     * __id is for the game itself, __id can be reused when a player despawns
     * which can break the matchData
     */
    matchDataId: number;

    constructor(
        game: Game,
        pos: Vec2,
        layer: number,
        client: Client,
        name: string,
        isBot: boolean,
        isMobile: boolean,
        questIds?: string[],
    ) {
        super(game, pos);

        this.layer = layer;
        this.name = name;
        this.client = client;
        this.isMobile = isMobile;
        this.bot = Config.debug.allowBots && isBot;

        this.questManager.quests = (questIds ?? []).map((id) => ({
            id,
            delta: 0,
            totalDelta: 0,
        }));

        this.matchDataId = game.playerBarn.nextMatchDataId++;

        this.weapons = this.weaponManager.weapons;

        let defaultItems = GameConfig.player.defaultItems;

        if (!this.bot) {
            defaultItems = this.game.playerBarn.defaultItems;
        }

        // createCircle clones the position
        // so set it manually to link both
        this.collider = collider.createCircle(this.pos, this.rad);
        this.collider.pos = this.pos;

        this.scopeZoomRadius = GameConfig.scopeZoomRadius[this.isMobile ? "mobile" : "desktop"];

        this.zoom = this.scopeZoomRadius[this.scope];

        function assertType(type: string, category: GameObjectDef["type"], acceptNoItem: boolean) {
            if (!type && acceptNoItem) return;
            GameObjectDefs.typeToDef(type, category);
        }

        for (let i = 0; i < GameConfig.WeaponSlot.Count; i++) {
            const weap = defaultItems.weapons[i];
            let type = weap.type || this.weapons[i].type;
            if (!type) continue;
            assertType(type, GameConfig.WeaponType[i], true);
            this.weaponManager.setWeapon(i, type, weap.ammo ?? 0);
        }

        this.chest = defaultItems.chest;
        assertType(this.chest, "chest", true);

        this.scope = defaultItems.scope;
        assertType(this.scope, "scope", false);
        this.invManager.set(this.scope as InventoryItem, 1);

        this.helmet = defaultItems.helmet;
        assertType(this.helmet, "helmet", true);

        this.backpack = defaultItems.backpack;
        assertType(this.backpack, "backpack", false);

        this.outfit = defaultItems.outfit;
        assertType(this.outfit, "outfit", false);

        for (const perk of defaultItems.perks) {
            assertType(perk.type, "perk", false);
            this.addPerk(perk.type, perk.droppable);
        }

        for (const [item, amount] of Object.entries(defaultItems.inventory)) {
            this.invManager.set(item as InventoryItem, amount);
        }

        if (this.game.map.sniperMode) {
            this.invManager.give("2xscope", 1);
        }

        this.weaponManager.showNextThrowable();
        this.recalculateScale();
    }

    update(dt: number): void {
        if (this.dead) {
            if (!this.sentDeathEmote) {
                this.sendDeathEmoteTicker -= dt;
                if (this.sendDeathEmoteTicker <= 0) {
                    this.emoteFromSlot(EmoteSlot.Death);
                    this.sentDeathEmote = true;
                }
            }
            return;
        }

        this.timeAlive += dt;

        if (this.game.map.factionMode && this.timeUntilHidden > 0) {
            this.timeUntilHidden -= dt;
            if (this.timeUntilHidden < 0) {
                this.playerStatusDirty = true;
            }
        }

        if (this.role === "leader" && !this.hasFiredFlare && this.flareTimer > 0) {
            this.flareTimer -= dt;
            if (this.flareTimer <= 0) {
                const flareGunIndex = this.weapons.findIndex(
                    (w) => w.type === "flare_gun" || w.type === "flare_gun_dual",
                );
                this.hasFiredFlare = true;
                this.flareTimer = 0;
                if (flareGunIndex !== -1) {
                    this.weaponManager.setCurWeapIndex(flareGunIndex);
                    this.weaponManager.fireWeapon(false, true);
                    // go back to melee if we fired while downed lol
                    if (this.downed) {
                        this.weaponManager.setCurWeapIndex(GameConfig.WeaponSlot.Melee);
                    }
                }
            }
        }

        if (this.roleMenuTicker > 0) {
            this.roleMenuTicker -= dt;
            if (this.roleMenuTicker <= 0) {
                this.roleMenuTicker = 0;
                const roleChoices = this.game.map.mapDef.gameMode.perkModeRoles!;
                this.roleSelect(util.randomItem(roleChoices));
            }
        }

        // players are still choosing a perk from the perk select menu
        if (this.game.map.perkMode && !this.role) return;

        //
        // Direction
        //
        this.dirOld = v2.copy(this.dir);

        if (!v2.eq(this.dir, this.dirNew)) {
            this.dir = this.dirNew;
            this.setPartDirty();
        }
        this.mousePos = v2.add(this.pos, v2.mul(this.dir, this.toMouseLen));

        //
        // Boost logic
        //
        if (!this.downed) {
            // adrenaline spent by Indomitable Spirit stays spent for a while, even under a minimum like Leadership's
            this.lifelineDrainTicker -= dt;
            const boostFloor = this.lifelineDrainTicker > 0 ? 0 : this.minBoost;
            this.boost = math.clamp(this.boost, boostFloor, 100);

            if (this.boost > 0) {
                let healAmount = boostHeals.findLast((b, i) => {
                    const prev = boostHeals[i - 1]?.maxBoost ?? 0;
                    return this.boost >= prev && this.boost <= b.maxBoost;
                });

                this.health += healAmount!.heal * dt;

                if (this.boost > boostFloor) {
                    if (this.hasPerk("lifeline")) {
                        this.boost -= GameConfig.player.boostDecay
                            * PerkProperties.lifeline.decayMult
                            * dt;
                    } else {
                        this.boost -= GameConfig.player.boostDecay * dt;
                    }
                }
            }
        } else {
            this.boost = 0;
        }

        // only set to dirty if it changed enough from last time we sent it
        // since it only uses 8 bits the precision is really low and sending it every tick is a waste
        if (!math.eqAbs(this.lastBoost, this.boost, 0.1)) {
            this.lastBoost = this.boost;
            this.boostDirty = true;
        }

        if (this.hasPerk("gotw")) {
            this.health += PerkProperties.gotw.healthRegen * dt;
        }

        //
        // Action logic
        //
        if (this.isReviving() || this.isBeingRevived()) {
            // cancel revive if either player goes out of range or if player being revived dies
            if (
                this.playerBeingRevived
                && (v2.distance(this.pos, this.playerBeingRevived.pos)
                        > GameConfig.player.reviveRange
                    || this.playerBeingRevived.dead)
            ) {
                this.cancelAction();
            }
        }

        if (this.downedDamageTicker > 0) {
            this.downedDamageTicker -= dt;

            if (this.downedDamageTicker <= 0) {
                this.downedDamageTicker = 0;
            }
        }

        //
        // Emote cooldown
        //

        this.emoteSoftTicker -= dt;
        if (
            this.emoteCounter >= GameConfig.player.emoteThreshold
            && this.emoteHardTicker > 0.0
        ) {
            this.emoteHardTicker -= dt;
            if (this.emoteHardTicker < 0.0) {
                this.emoteCounter = 0;
            }
        } else if (this.emoteSoftTicker < 0.0 && this.emoteCounter > 0) {
            this.emoteCounter--;
            this.emoteSoftTicker = GameConfig.player.emoteSoftCooldown * 1.5;
        }

        // Take bleeding damage
        this.bleedTicker -= dt;
        if (
            ((this.downed && this.actionType == GameConfig.Action.None)
                || this.hasPerk("trick_drain"))
            && this.bleedTicker < 0
        ) {
            const hasDrain = this.hasPerk("trick_drain");
            this.bleedTicker = GameConfig.player.bleedTickRate;

            if (hasDrain) {
                this.bleedTicker *= PerkProperties.trick_drain.bleedTickRateMult;
            }

            const mapConfig = this.game.map.mapDef.gameConfig;

            const bleedDamageMult = mapConfig.bleedDamageMult;

            const multiplier = bleedDamageMult != 1 ? this.downedCount * bleedDamageMult : 1;

            let damage = hasDrain ? 1 : mapConfig.bleedDamage * multiplier;
            this.damage({
                amount: damage,
                damageType: GameConfig.DamageType.Bleeding,
                dir: this.dir,
            });
            // don't continue the update if we died
            if (this.dead) {
                return;
            }
        }

        this.chattyTicker -= dt;

        if (this.hasPerk("trick_chatty") && this.chattyTicker < 0) {
            this.chattyTicker = util.random(
                PerkProperties.trick_chatty.minInterval,
                PerkProperties.trick_chatty.maxInterval,
            );

            const emotes = Object.keys(EmotesDefs);

            this.game.playerBarn.addEmote(
                util.randomItem(emotes),
                this.__id,
            );
        }

        if (this.game.gas.isInGas(this.pos)) {
            if (this.game.gas.circleIdx > 2) {
                this.timeInsideGas += dt;
            }

            if (this.game.gas.doDamage) {
                let damage = this.disconnected ? 22 : this.game.gas.damage;
                const damageMulti = 1 + this.timeInsideGas * 0.025;

                this.damage({
                    amount: damage * damageMulti,
                    damageType: GameConfig.DamageType.Gas,
                    dir: this.dir,
                });
                // don't continue the update if we died
                if (this.dead) {
                    return;
                }
            }
        } else {
            this.timeInsideGas = 0;
        }

        if (this.reloadAgain && this.actionType !== GameConfig.Action.Revive) {
            this.reloadAgain = false;
            this.weaponManager.scheduledReload = true;
        }

        // handle heal and boost actions

        if (this.actionType !== GameConfig.Action.None) {
            this.action.time += dt;
            this.action.time = math.clamp(
                this.action.time,
                0,
                net.Constants.ActionMaxDuration,
            );

            if (this.action.time >= this.action.duration) {
                if (this.actionType === GameConfig.Action.UseItem) {
                    const itemDef = GameObjectDefs.typeToDef(this.actionItem) as HealDef | BoostDef;
                    if ("heal" in itemDef) {
                        this.applyActionFunc((target: Player) => {
                            target.health += itemDef.heal;
                            if (this.hasPerk("combat_stims")) {
                                this.combatStimsActive = true;
                                this._combatStimsTicker = PerkProperties.combat_stims.effectDuration;
                            }
                        });
                    }
                    if ("boost" in itemDef) {
                        this.applyActionFunc((target: Player) => {
                            target.boost += itemDef.boost;
                            if (this.hasPerk("combat_stims")) {
                                this.combatStimsActive = true;
                                this._combatStimsTicker = PerkProperties.combat_stims.effectDuration;
                            }
                        });
                    }
                    this.invManager.take(this.actionItem as InventoryItem, 1);
                    this.questManager.trackEvent("item_used", {
                        itemType: this.actionItem,
                        mode: this.game.teamMode,
                        role: this.role,
                        itemCategory: itemDef.type,
                    });
                } else if (this.isReloading()) {
                    this.weaponManager.reload();
                } else if (
                    this.actionType === GameConfig.Action.Revive
                    && this.playerBeingRevived
                ) {
                    this.applyActionFunc((target: Player) => {
                        if (!target.downed) return;
                        target.downed = false;
                        target.downedBy = undefined;
                        target.downedDamageTicker = 0;
                        target.health = GameConfig.player.reviveHealth;

                        // checks 2 conditions in one, player has pan AND has it selected
                        if (target.weapons[target.curWeapIdx].type === "pan") {
                            target.wearingPan = false;
                        }

                        target.setDirty();
                        target.setGroupStatuses();
                    });
                }

                // Prevent cancelAction from being called by revived players at the end of revive
                if (!this.revivedBy || this.playerBeingRevived == this.revivedBy) {
                    this.cancelAction();
                }

                if (
                    (this.curWeapIdx == GameConfig.WeaponSlot.Primary
                        || this.curWeapIdx == GameConfig.WeaponSlot.Secondary)
                    && this.weapons[this.curWeapIdx].ammo == 0
                    && this.actionType !== GameConfig.Action.Revive
                ) {
                    this.weaponManager.scheduledReload = true;
                }
            }
        }

        //
        // Animation logic
        //
        if (this.animType !== GameConfig.Anim.None) {
            this._animTicker -= dt;

            if (this._animTicker <= 0) {
                this.animType = GameConfig.Anim.None;
                this._animTicker = 0;
                this.animSeq++;
                this.setDirty();
            }
        }

        //
        // Projectile slowdown logic
        //
        if (this.frozen) {
            this.frozenTicker -= dt;

            if (this.frozenTicker <= 0) {
                this.frozenTicker = 0;
                this.frozen = false;
                this.setDirty();
            }
        }

        //
        // DoT Debuffs & Custom Kit Effects
        //
        if (!this.dead) {
            // Bleed: 10 dmg per sec for 4s
            if (this.bleedDotDuration > 0) {
                this.bleedDotDuration -= dt;
                this.bleedDotTicker += dt;
                if (this.bleedDotTicker >= 0.25) {
                    this.bleedDotTicker -= 0.25;
                    this.damage({
                        amount: 2.5,
                        damageType: GameConfig.DamageType.Bleeding,
                        source: this.bleedDotSource,
                        gameSourceType: "pg_nanobots_rifle",
                        weaponSourceType: "pg_nanobots_rifle",
                        dir: this.dir,
                    });
                }
                if (this.bleedDotDuration <= 0) this.setDirty();
            } else {
                this.bleedDotTicker = 0;
            }

            // Poison: 10 dmg per sec for 4s
            if (this.poisonDuration > 0) {
                this.poisonDuration -= dt;
                this.poisonTicker += dt;
                if (this.poisonTicker >= 0.25) {
                    this.poisonTicker -= 0.25;
                    this.damage({
                        amount: 2.5,
                        damageType: GameConfig.DamageType.Bleeding,
                        source: this.poisonSource,
                        gameSourceType: "pg_acid_shotgun",
                        weaponSourceType: "pg_acid_shotgun",
                        dir: this.dir,
                    });
                }
                if (this.poisonDuration <= 0) this.setDirty();
            } else {
                this.poisonTicker = 0;
            }

            // Burn (Frozen Dragon): 2s burn
            if (this.burnDuration > 0) {
                this.burnDuration -= dt;
                this.burnTicker += dt;
                if (this.burnTicker >= 0.25) {
                    this.burnTicker -= 0.25;
                    this.damage({
                        amount: 2.5,
                        damageType: GameConfig.DamageType.Bleeding,
                        source: this.burnSource,
                        gameSourceType: this.burnWeapon,
                        weaponSourceType: this.burnWeapon,
                        dir: this.dir,
                    });
                }
                if (this.burnDuration <= 0) this.setDirty();
            } else {
                this.burnTicker = 0;
            }

            this.updateKit(dt);
            this.debuffs.tick(dt);
            this.champ?.update(dt);
            this.updateFlight(dt);

            if (this.charmDuration > 0) {
                this.charmDuration -= dt;
                if (this.charmDuration <= 0) this.setDirty();
            }

            if (this.vulnerable) {
                this.whipMarks = this.whipMarks.map((t) => Math.max(t - dt, 0));
                if (!this.vulnerable) this.setDirty();
            }

            if (this.wizardStunTime > 0) {
                this.wizardStunTime -= dt;
                if (this.wizardStunTime <= 0) {
                    this.wizardStunTime = 0;
                    this.setDirty();
                }
            }

            if (this.stunTime > 0) {
                this.stunTime -= dt;
                if (this.stunTime <= 0) {
                    this.stunTime = 0;
                    this.setDirty();
                }
            }

            if (this.stasisTime > 0) {
                this.stasisTime -= dt;
                if (this.stasisTime <= 0) {
                    this.stasisTime = 0;
                    this.setDirty();
                }
            }

            // the web Spider-Man's Portal Combo put on them goes with the stun (they need not be a kit player)
            if (this.webStunTime > 0) {
                this.webStunTime -= dt;
                if (this.webStunTime <= 0) {
                    this.webStunTime = 0;
                    this.setDirty();
                }
            }

            if (this.perkStripTime > 0) {
                this.perkStripTime -= dt;
                if (this.perkStripTime <= 0) this.restorePerks();
            }

            // Power Fists: 10 shield per second while held, up to 200
            const shieldCap = this.maxShield || 200;
            if (this.weapons[this.curWeapIdx]?.type === "pg_power_fists" && this.shield < shieldCap) {
                this.shield = Math.min(this.shield + 10 * dt, shieldCap);
                this.shieldDirty = true;
            }

            // Excalibur: 50% less damage taken while actively firing it
            const excaliburActive = this.weapons[this.curWeapIdx]?.type === "pg_excalibur" && this.shootHold;
            if (excaliburActive !== this.excaliburActive) {
                this.excaliburActive = excaliburActive;
                this.setDirty();
            }

            // Heroic Epee: heal 12 hp per second while holding
            if (this.weapons[this.curWeapIdx]?.type === "pg_heroic_epee") {
                if (this.health < this.maxHealth) {
                    this.health = Math.min(this.health + 12 * dt, this.maxHealth);
                    this.setDirty();
                }
            }
        } else {
            this.activeJudgeRocket = undefined;
        }

        //
        // Haste logic
        //
        if (this.hasteType != GameConfig.HasteType.None) {
            this._hasteTicker -= dt;

            if (this._hasteTicker <= 0) {
                this.hasteType = GameConfig.HasteType.None;
                this._hasteTicker = 0;
                this.hasteSeq++;
                this.setDirty();
            }
        }

        //
        // Combat Stimulants Logic
        //
        if (this.combatStimsActive) {
            this._combatStimsTicker -= dt;

            if (this._combatStimsTicker <= 0) {
                this.combatStimsActive = false;
                this._lastBreathTicker = 0;
            }
        }

        //
        // Last breath logic
        //
        if (this.lastBreathActive) {
            this._lastBreathTicker -= dt;

            if (this._lastBreathTicker <= 0) {
                this.lastBreathActive = false;
                this._lastBreathTicker = 0;

                this.recalculateScale();
            }
        }

        //
        // Bugler logic
        //
        if (this.bugleTickerActive) {
            this._bugleTicker -= dt;

            if (this._bugleTicker <= 0) {
                this.bugleTickerActive = false;
                this._bugleTicker = 0;

                const bugle = this.weapons.find((w) => w.type == "bugle");
                if (bugle) {
                    bugle.ammo++;
                    if (
                        bugle.ammo
                            < this.weaponManager.getAmmoStats(GameObjectDefs.typeToDef("bugle", "gun"))
                                .maxClip
                    ) {
                        this.bugleTickerActive = true;
                        this._bugleTicker = 8;
                    }
                }
                this.weapsDirty = true;
            }
        }

        if (this.hasPerk("fabricate")) {
            if (this.fabricateThrowablesLeft.length > 0) {
                this.fabricateGiveTicker -= dt;
                if (this.fabricateGiveTicker < 0) {
                    this.fabricateGiveTicker = PerkProperties.fabricate.giveInterval;

                    const item = this.fabricateThrowablesLeft.shift()!;
                    this.invManager.give(item, 1);

                    const msg = new net.PickupMsg();
                    msg.type = net.PickupMsgType.Success;
                    msg.item = item;
                    msg.count = 1;
                    if (
                        !this.weaponManager.weapons[GameConfig.WeaponSlot.Throwable].type
                    ) {
                        this.weaponManager.showNextThrowable();
                    }

                    this.client.sendMsg(net.MsgType.Pickup, msg);
                }
            }

            this.fabricateRefillTicker -= dt;
            if (this.fabricateRefillTicker <= 0) {
                const counts: Record<FabricateThrowable, number> = {
                    frag: 0,
                    mirv: 0,
                    strobe: 0,
                };

                let remaining = 8;
                while (remaining > 0) {
                    const item = util.weightedRandomObject(PerkProperties.fabricate.weights) as FabricateThrowable;
                    counts[item]++;
                    remaining--;
                }

                const nextQueue: Array<FabricateThrowable> = [];
                for (const item of Object.keys(PerkProperties.fabricate.weights) as FabricateThrowable[]) {
                    const canGive = math.max(
                        this.invManager.getMaxCapacity(item) - this.invManager.get(item),
                        0,
                    );
                    const giveCount = math.min(counts[item], canGive);
                    for (let i = 0; i < giveCount; i++) {
                        nextQueue.push(item);
                    }
                }

                this.fabricateThrowablesLeft = nextQueue;
                this.fabricateGiveTicker = PerkProperties.fabricate.giveInterval;
                this.fabricateRefillTicker = PerkProperties.fabricate.refillInterval;
            }
        }

        if (this.fatModifier > 0) {
            this.fatTicker -= dt;
            if (this.fatTicker < 0) {
                this.fatModifier -= 0.2 * dt;
                this.fatModifier = math.max(0, this.fatModifier);
                this.recalculateScale();
            }
        }

        if (this.viewDistModifier > 0) {
            this.viewDistTicker -= dt;
            if (this.viewDistTicker <= 0) {
                this.viewDistModifier = 0;
                this.viewDistTicker = 0;
                this.zoomDirty = true;
            }
        }

        //
        // Calculate new speed, position and check for collision with obstacles
        //
        const movement = v2.create(0, 0);

        if (this.touchMoveActive && this.touchMoveLen) {
            movement.x = this.touchMoveDir.x;
            movement.y = this.touchMoveDir.y;
        } else {
            if (this.moveUp) movement.y++;
            if (this.moveDown) movement.y--;
            if (this.moveLeft) movement.x--;
            if (this.moveRight) movement.x++;

            if (movement.x * movement.y !== 0) {
                // If the product is non-zero, then both of the components must be non-zero
                movement.x *= Math.SQRT1_2;
                movement.y *= Math.SQRT1_2;
            }
        }

        v2.set(this.posOld, this.pos);

        if (!v2.eq(this.vel, v2.create(0, 0), 0.01)) {
            v2.set(this.vel, v2.mul(this.vel, 1 / (1 + dt * 4)));
            v2.set(this.pos, v2.add(this.pos, v2.mul(this.vel, dt)));
        }

        // Judge: you stand still while steering its rocket
        const rocket = this.activeJudgeRocket;
        if (
            rocket
            && !(rocket.active && rocket.alive && rocket.bulletType === "bullet_pg_judge" && rocket.player === this)
        ) {
            this.activeJudgeRocket = undefined;
        }
        if (this.activeJudgeRocket) v2.set(movement, v2.create(0, 0));

        // Ultron's Combo roots him
        if (this.ultronCombo) {
            v2.set(movement, v2.create(0, 0));
            this.webPull = undefined;
        }

        // Sentry Charge's stun (and Wolverine's Claw Combo): no moving, and any slide he was on stops
        if (this.stunTime > 0 || this.clawCombo || this.spiderCombo || this.ironCombo) {
            v2.set(movement, v2.create(0, 0));
            this.webPull = undefined;
        }

        // Spider-Man swinging to where his web hit
        if (this.webPull) {
            const to = v2.sub(this.webPull.target, this.pos);
            const dist = v2.length(to);
            this.webPull.time -= dt;
            // the hit point is on a wall's surface, so stop once the body reaches it (or a wall stops it)
            const stuck = this.webPull.lastDist !== undefined
                && this.webPull.lastDist - dist < this.webPull.speed * dt * 0.25;
            if (dist < this.rad + 0.5 || stuck || this.webPull.time <= 0 || this.dead) this.webPull = undefined;
            else {
                this.webPull.lastDist = dist;
                v2.set(movement, v2.normalize(to));
            }
        }

        const hasTreeClimbing = this.hasPerk("tree_climbing");

        let steps: number;

        if (!v2.eq(movement, v2.create(0, 0))) {
            this.recalculateSpeed(hasTreeClimbing);
            if (this.webPull) this.speed = this.webPull.speed;
            steps = Math.round(math.max(this.speed * dt + 5, 5));

            this.movingTicker += dt;
            this.timeWithoutMoving = 0;
        } else {
            this.timeWithoutMoving += dt;
            this.stayingStillTicker += dt;

            this.speed = 0;
            steps = 1;
        }
        v2.set(this.moveVel, v2.mul(movement, this.speed));

        const speedToAdd = (this.speed / steps) * dt;

        const circle = collider.createCircle(
            this.pos,
            GameConfig.player.maxVisualRadius * this.scale + this.speed * dt,
        );

        const objs = this.game.grid.intersectCollider(circle);

        for (let i = 0; i < steps; i++) {
            v2.set(this.pos, v2.add(this.pos, v2.mul(movement, speedToAdd)));

            for (let j = 0; j < objs.length && !this.debug.noClip && !this.flying; j++) {
                const obj = objs[j];
                if (obj.__type !== ObjectType.Obstacle) continue;
                if (!obj.collidable) continue;
                if (obj.dead) continue;
                if (!util.sameLayer(obj.layer, this.layer)) continue;
                if (obj.isTree && hasTreeClimbing) continue;

                const collision = collider.intersectCircle(
                    obj.collider,
                    this.pos,
                    this.rad,
                );
                if (collision) {
                    v2.set(
                        this.pos,
                        v2.add(this.pos, v2.mul(collision.dir, collision.pen + 0.001)),
                    );
                }
            }
        }

        this.mapIndicator?.updatePosition(this.pos);
        this.updateSentryDash(dt);
        this.updateClawCombo(dt);
        this.updateSpiderCombo(dt);
        this.updateSentryNova(dt);

        // if we are the group leader and new players can still join the group
        // update the group spawn position to our current position every 1 second
        // if we are in a valid spawn position (not on water, inside a building, etc)
        if (
            this.group?.players[0] === this
            && this.game.canJoin
            && this.group.players.length < this.group.maxPlayers
        ) {
            this.group.spawnPositionTicker -= dt;

            if (this.group.spawnPositionTicker <= 0) {
                this.group.spawnPositionTicker = 1;

                if (this.game.map.canPlayerSpawn(this.pos)) {
                    this.group.spawnPosition = v2.copy(this.pos);
                }
            }
        }

        this.pickupTicker -= dt;

        //
        // Auto pickup and door opening on touch, for every player
        //
        this.mobileDropTicker -= dt;
        if (this.mobileDropTicker <= 0 && !this.downed && !this.dead) {
            const closestLoot = this.getClosestLoot();

            if (closestLoot) {
                const itemDef = GameObjectDefs.typeToDef(closestLoot.type);
                switch (itemDef.type) {
                    case "gun":
                        const freeSlot = this.getFreeGunSlot(closestLoot);
                        // slot 0 is the primary, so check for null rather than falsy;
                        // a full slot is left alone (F swaps)
                        if (
                            freeSlot.slot != null
                            && freeSlot.slot !== this.curWeapIdx
                            && !this.weapons[freeSlot.slot].type
                        ) {
                            this.pickupLoot(closestLoot);
                        }
                        break;
                    case "melee": {
                        if (this.weapons[GameConfig.WeaponSlot.Melee].type === "fists") {
                            this.pickupLoot(closestLoot);
                        }
                        break;
                    }
                    case "perk": {
                        /**
                         * Prevents mobile players from automatically picking up
                         * halloween perks. Additionally prevents them from auto-picking
                         * up perks if they already have a droppable perk.
                         *
                         * NOTE: This is a poor solution (idString checking) and should
                         * not be used as a precedent to allow more idString checking.
                         */
                        if (
                            closestLoot.type !== "halloween_mystery"
                            && !this.perks.find((perk) => perk.droppable)
                        ) {
                            this.pickupLoot(closestLoot);
                        }
                        break;
                    }
                    case "outfit": {
                        break;
                    }
                    case "helmet":
                    case "chest":
                    case "backpack": {
                        const thisQuality = this.getGearQuality(this[itemDef.type]);
                        const thatQuality = this.getGearQuality(closestLoot.type);
                        if (thisQuality < thatQuality) {
                            this.pickupLoot(closestLoot);
                        }
                        break;
                    }
                    default:
                        if (
                            this.invManager.isValid(closestLoot.type)
                            && this.invManager.get(closestLoot.type)
                                >= this.invManager.getMaxCapacity(closestLoot.type)
                        ) {
                            break;
                        }
                        this.pickupLoot(closestLoot);
                        break;
                }
            }

            const obstacles = this.autoOpenDoors ? this.getInteractableObstacles() : [];
            for (let i = 0; i < obstacles.length; i++) {
                const obstacle = obstacles[i];
                if (obstacle.isDoor && obstacle.door && !obstacle.door.open) {
                    obstacle.interact(this);
                }
            }
        }

        //
        // Scope zoom, heal regions and and auto open doors logic
        //

        let finalZoom = this.scopeZoomRadius[this.scope];
        const lowestZoom = this.scopeZoomRadius["1xscope"];
        finalZoom -= this.viewDistModifier;
        finalZoom = math.max(lowestZoom, finalZoom);

        this.indoors = false;

        /*
         * checking when a player leaves a heal region is a pain,
         * so we just set healEffect to false by default and set it to true when theyre inside a heal region
         */
        const oldHealEffect = this.healEffect;
        this.healEffect = false;

        // Special handling for short ticker for throwable healing
        this.healEffectTicker -= dt;
        if (this.healEffectTicker > 0) {
            this.healEffect = true;
        }

        const oldLastStandEffect = this.lastStandEffect;

        if (this.lastStandEffectTicker > 0) {
            this.lastStandEffect = true;
            this.lastStandEffectTicker -= dt;
        } else {
            this.lastStandEffect = false;
        }

        let zoomRegionZoom = lowestZoom;
        let insideNoZoomRegion = true;
        let insideSmoke = false;
        // building player is currently inside of
        let occupiedBuilding: Building | undefined;

        for (let i = 0; i < objs.length; i++) {
            const obj = objs[i];
            if (obj.__type === ObjectType.Building) {
                if (
                    !this.downed
                    && obj.healRegions
                    && util.sameLayer(this.layer, obj.layer)
                    && !this.game.gas.isInGas(this.pos) // heal regions don't work in gas
                ) {
                    let totalHeal = 0;
                    const c = collider.createCircle(this.pos, 0.1);

                    for (let j = 0; j < obj.healRegions.length; j++) {
                        const hr = obj.healRegions[j];
                        if (coldet.test(c, hr.collision)) {
                            totalHeal += hr.healRate;
                        }
                    }

                    if (totalHeal) {
                        this.health += totalHeal * dt;
                        this.healEffect = true;
                    }
                }

                if (obj.ceilingDead) continue;

                // only check if layer is the same when not on stairs!
                if (this.layer < 2 && this.layer !== obj.layer) continue;

                for (let i = 0; i < obj.zoomRegions.length; i++) {
                    const zoomRegion = obj.zoomRegions[i];

                    if (
                        zoomRegion.zoomIn
                        && coldet.testCircleAabb(
                            this.collider.pos,
                            this.collider.rad,
                            zoomRegion.zoomIn.min,
                            zoomRegion.zoomIn.max,
                        )
                    ) {
                        this.indoors = true;
                        this.insideZoomRegion = !zoomRegion.noZoom;
                        occupiedBuilding = obj;
                        insideNoZoomRegion = false;
                        if (zoomRegion.zoom) {
                            zoomRegionZoom = zoomRegion.zoom;
                        }
                    }

                    if (
                        zoomRegion.zoomOut
                        && coldet.testCircleAabb(
                            this.collider.pos,
                            this.collider.rad,
                            zoomRegion.zoomOut.min,
                            zoomRegion.zoomOut.max,
                        )
                    ) {
                        insideNoZoomRegion = false;
                        if (this.insideZoomRegion) {
                            if (zoomRegion.zoom) {
                                zoomRegionZoom = zoomRegion.zoom;
                            }
                        }
                    }
                }
            } else if (obj.__type === ObjectType.Obstacle) {
                if (!util.sameLayer(this.layer, obj.layer)) continue;
                if (!obj.door || !obj.isDoor) continue;
                if (obj.door.locked) continue;
                if (!obj.door.autoOpen) continue;
                if (obj.door.open) continue;
                if (
                    obj.door.openOneWay
                    && obj.getPlayerSide(this) !== obj.door.openOneWay
                ) {
                    continue;
                }

                const res = collider.intersectCircle(
                    obj.collider,
                    this.pos,
                    this.rad + obj.interactionRad,
                );
                if (res) {
                    obj.interact(this, true);
                }
            } else if (obj.__type === ObjectType.Smoke) {
                if (!util.sameLayer(this.layer, obj.layer)) continue;
                if (coldet.testCircleCircle(this.pos, this.rad, obj.pos, obj.rad)) {
                    this.visionObscured = true;
                    this.visionRecoveryTicker = 0;
                    insideSmoke = true;
                }
            }
        }

        // only dirty if healEffect changed from last tick to current tick (leaving or entering a heal region)
        if (oldHealEffect != this.healEffect) {
            this.setDirty();
        }

        if (oldLastStandEffect != this.lastStandEffect) {
            this.setDirty();
        }

        if (!insideSmoke) {
            this.visionRecoveryTicker += dt;
            if (this.visionRecoveryTicker >= 0.5) {
                this.visionObscured = false;
            }
        }

        if (this.insideZoomRegion) {
            finalZoom = zoomRegionZoom;
        }
        if (this.visionObscured || this.downed) {
            finalZoom = lowestZoom;
        }

        if (this.debug.zoomEnabled) {
            this.zoom = this.debug.zoom;
        } else {
            this.zoom = finalZoom;
        }

        if (insideNoZoomRegion) {
            this.insideZoomRegion = false;
        }

        //
        // Calculate layer
        //
        const originalLayer = this.layer;
        const rot = Math.atan2(this.dir.y, this.dir.x);
        const ori = math.radToOri(rot);
        const stair = this.checkStairs(objs!, this.rad);
        if (stair) {
            if (ori === stair.downOri) {
                this.aimLayer = 3;
            } else if (ori === stair.upOri) {
                this.aimLayer = 2;
            } else {
                this.aimLayer = this.layer;
            }
        } else {
            this.aimLayer = this.layer;
        }
        if (this.layer !== originalLayer) {
            this.setDirty();

            if (this.obstacleOutfit) {
                this.obstacleOutfit.layer = this.layer;
                this.obstacleOutfit.setDirty();
            }
        }

        //
        // Final position calculation: clamp to map bounds and set dirty if changed
        //
        this.game.map.clampToMapBounds(this.pos, this.rad);

        if (!v2.eq(this.pos, this.posOld)) {
            this.setPartDirty();
            this.game.grid.updateObject(this);

            //
            // Halloween obstacle skin
            //
            if (this.obstacleOutfit) {
                this.obstacleOutfit.pos = v2.copy(this.pos);
                this.obstacleOutfit.updateCollider();
                this.obstacleOutfit.setPartDirty();
            }
        }

        //
        // Downed logic
        //
        if (this.downed) {
            this.distSinceLastCrawl += v2.distance(this.posOld, this.pos);

            if (this.animType === GameConfig.Anim.None && this.distSinceLastCrawl > 3) {
                let anim: number = GameConfig.Anim.CrawlForward;

                if (!v2.eq(this.dir, movement, 1)) {
                    anim = GameConfig.Anim.CrawlBackward;
                }

                this.playAnim(anim, GameConfig.player.crawlTime);
                this.distSinceLastCrawl = 0;
            }
        }

        if (this.debug.moveObjMode.enabled) this.moveObjUpdate(occupiedBuilding);

        //
        // Weapon stuff
        //
        // stunned (or mid Claw Combo): no shooting, swinging, reloading or item use
        if (this.stunTime > 0 || this.clawCombo || this.spiderCombo || this.ironCombo) {
            this.shootStart = false;
            this.shootHold = false;
            this.cancelAction();
        }
        this.weaponManager.update(dt);

        this.shotSlowdownTimer -= dt;
        if (this.shotSlowdownTimer <= 0) {
            this.shotSlowdownTimer = 0;
        }
    }

    moveObjUpdate(occupiedBuilding?: Building): void {
        if (!this.debug.moveObjMode.enabled) return;
        const mouseCollider = collider.createCircle(this.mousePos, 1);
        const childIds = occupiedBuilding
            ? new Set(occupiedBuilding.childObjects.map((o) => o.__id))
            : undefined;
        const hoveredObj = this.game.grid
            .intersectCollider(mouseCollider)
            .filter((o): o is Loot | Obstacle | Building => {
                if (
                    o.__type != ObjectType.Loot
                    && o.__type != ObjectType.Obstacle
                    && o.__type != ObjectType.Building
                ) {
                    return false;
                }

                if (!util.sameLayer(o.layer, this.layer)) return false;
                if (o.__type == ObjectType.Obstacle && o.dead) return false;
                // if inside building, can only select one of its children
                if (this.indoors && !childIds?.has(o.__id)) return false;
                return true;
            })
            .find((o) => {
                const transformedBounds = collider.transform(o.bounds, o.pos, 0, 1);
                const aabb = collider.toAabb(transformedBounds);
                return coldet.testPointAabb(this.mousePos, aabb.min, aabb.max);
            });

        if (hoveredObj && this.shootStart) {
            this.debug.moveObjMode.selectedObj = hoveredObj;
            this.debug.moveObjMode.originalPos = v2.copy(
                this.debug.moveObjMode.selectedObj.pos,
            );
            this.debug.moveObjMode.selectPos = v2.copy(this.mousePos);
        }

        if (
            this.debug.moveObjMode.selectedObj
            && this.debug.moveObjMode.selectPos
            && this.debug.moveObjMode.originalPos
        ) {
            if (this.shootHold) {
                const deltaPos = v2.sub(this.mousePos, this.debug.moveObjMode.selectPos);
                const newPos = v2.add(this.debug.moveObjMode.originalPos, deltaPos);
                this.debug.moveObjMode.selectedObj.updatePos(newPos);
            } else {
                this.debug.moveObjMode.selectedObj.refresh();
                this.debug.moveObjMode.selectedObj = undefined;
                this.debug.moveObjMode.selectPos = undefined;
                this.debug.moveObjMode.originalPos = undefined;
            }
        }
    }

    /**
     * doesn't care about kill credit or anything, simply the last player to damage you (excludes yourself)
     */
    lastDamagedBy: Player | undefined;

    damage(params: DamageParams) {
        if (this.debug.godMode) return;
        if (this._health < 0) this._health = 0;
        if (this.dead) return;
        // a champion held in stasis by Guardian Angel takes nothing at all: not the gas, a burn or a bleed either
        if (this.stasis) return;
        // at the start of his flight Iron Man can't be hit; the gas, damage over time and the Wizard's circle
        // still get through
        if (
            this.untargetable && params.damageType !== GameConfig.DamageType.Gas
            && params.damageType !== GameConfig.DamageType.Bleeding && !params.hitsFlying
        ) return;
        if (this.downed && this.downedDamageTicker > 0) return;
        // cobalt players on role picker menu
        if (this.game.map.perkMode && !this.role) return;

        const playerSource = params.source?.__type === ObjectType.Player
            ? (params.source as Player)
            : undefined;

        // Sentry Charge hits each player once per dash, whether the crescent or his body gets there first
        if (params.gameSourceType === "kit_sentry_charge" && playerSource && playerSource !== this) {
            if (playerSource.sentryDashHit.has(this.__id)) return;
            playerSource.sentryDashHit.add(this.__id);
        }

        // teammates can't deal damage to each other
        if (playerSource && params.source !== this) {
            if (playerSource.teamId === this.teamId && !this.disconnected) {
                // Combat Stimulants Healing
                const gameSourceDef = GameObjectDefs.typeToDefSafe(params.gameSourceType ?? "");
                if (
                    playerSource._combatStimsTicker > 0
                    && gameSourceDef?.type === "gun"
                ) {
                    const healAmount = params.amount! * PerkProperties.combat_stims.healPercent;
                    if (healAmount > 0) {
                        this.health = math.min(
                            this.health + healAmount,
                            GameConfig.player.health,
                        );
                        this.healEffectTicker = 0.5;
                        this.setDirty();
                    }
                }
                return;
            }
        }

        let finalDamage = params.amount!;
        // a champion's items and passives on what it deals (armor pen goes in params)
        if (playerSource?.champ && playerSource !== this) {
            finalDamage = playerSource.champ.onDealDamage(this, params, finalDamage);
        }
        // a kit's items on all the damage it deals (Sentry Artifact)
        if (playerSource && playerSource !== this) finalDamage *= KitDefs[playerSource.kit]?.damageMult ?? 1;

        // vulnerable to the Summoner (marked by the whip): each minion dash lands harder
        const trueHit = params.gameSourceType === "kit_summoner_dagger";
        if (this.vulnerable && trueHit) finalDamage += this.whipExtraDamage();

        // Excalibur: 50% less damage taken while actively firing it
        if (this.excaliburActive && !trueHit) finalDamage *= 0.5;

        // a kit's items can ignore part of the target's damage reduction, on top of the hit's own armor
        // penetration (Jeff: 10%, so a Sentry Charge that ignores 80% ignores 90%)
        const ignore = playerSource && playerSource !== this ? KitDefs[playerSource.kit]?.armorIgnore ?? 0 : 0;
        let armorPen = ignore ? Math.max(0, (params.armorPenetration ?? 1) - ignore) : params.armorPenetration;
        // Solar Explosion: half of whatever armor the attacker ignores is given back
        if (this.penGuardTime > 0 && armorPen !== undefined && armorPen < 1) {
            armorPen = 1 - (1 - armorPen) * SentryNova.penGuard;
        }

        // a minion's dash ignores every armor and damage reduction
        if (trueHit) armorPen = 0;

        const reduceDamage = (multi: number) => {
            if (armorPen !== undefined) {
                multi *= armorPen;
            }
            finalDamage -= finalDamage * multi;
        };

        // Sentry: less damage from everything, and an armor-ignoring hit cuts that too
        const sentryReduction = KitDefs[this.kit]?.damageReduction;
        if (sentryReduction) reduceDamage(sentryReduction);

        // Summoner's potions: 10% less, then 4 less from each hit (not from the gas or a bleed's ticks)
        if (this.potionTime > 0) {
            reduceDamage(SummonerPotions.reduction);
            if (
                finalDamage > 0 && params.damageType !== GameConfig.DamageType.Bleeding
                && params.damageType !== GameConfig.DamageType.Gas
            ) finalDamage = Math.max(finalDamage - SummonerPotions.flat, 0);
        }

        // Conquest's Wall is a layer of its own on top of that; every hit that comes in (not the gas or a bleed)
        // wears it down
        if (this.wallTime > 0) {
            reduceDamage(this.wallReduction);
            if (
                this.wallRule && (params.amount ?? 0) > 0
                && params.damageType !== GameConfig.DamageType.Bleeding
                && params.damageType !== GameConfig.DamageType.Gas
            ) {
                this.wallReduction = Math.max(this.wallRule.floor, this.wallReduction - this.wallRule.perHit);
            }
        }

        // ignore armor for gas and bleeding damage
        if (
            params.damageType !== GameConfig.DamageType.Gas
            && params.damageType !== GameConfig.DamageType.Bleeding
        ) {
            const gameSourceDef = GameObjectDefs.typeToDefSafe(params.gameSourceType ?? "");
            let isHeadShot = false;

            if (gameSourceDef && "headshotMult" in gameSourceDef && !params.isExplosion) {
                isHeadShot = Math.random() < GameConfig.player.headshotChance;

                if (isHeadShot) {
                    finalDamage *= gameSourceDef.headshotMult;
                }
            }

            if (this.hasPerk("flak_jacket")) {
                reduceDamage(
                    params.isExplosion
                        ? PerkProperties.flak_jacket.explosionDamageReduction
                        : PerkProperties.flak_jacket.damageReduction,
                );
            }

            if (this.hasPerk("steelskin")) {
                reduceDamage(PerkProperties.steelskin.damageReduction);
            }

            const chest = GameObjectDefs.typeToDefSafe(this.chest) as ChestDef | undefined;
            if (chest && !isHeadShot) {
                reduceDamage(chest.damageReduction);
            }

            const helmet = GameObjectDefs.typeToDefSafe(this.helmet) as HelmetDef | undefined;
            if (helmet) {
                reduceDamage(helmet.damageReduction * (isHeadShot ? 1 : 0.3));
            }
        }

        if (this.champ && !trueHit) finalDamage = this.champ.onTakeDamage(params, finalDamage, playerSource);

        // the super hacker has 10,000 health: kept as 100 (the network only sends 0-100), everything hits it for 1%
        if (this.botBrain?.level === "super_hacker") finalDamage *= GameConfig.player.health / 10000;

        // any hit ends the calm, even one the shield soaks up
        if (finalDamage > 0) this.calmTime = 0;

        // Shield absorbs damage first
        if (this.shield > 0 && finalDamage > 0) {
            if (this.shield >= finalDamage) {
                this.shield -= finalDamage;
                finalDamage = 0;
            } else {
                finalDamage -= this.shield;
                this.shield = 0;
            }
            this.shieldDirty = true;
            this.setDirty();
        }

        // Sentry: the hit that would take him to 0 leaves him at full health instead, once per game
        if (finalDamage > 0 && this._health - finalDamage <= 0 && KitDefs[this.kit]?.revive && !this.sentryReviveUsed) {
            this.sentryReviveUsed = true;
            this.health = this.maxHealth;
            finalDamage = 0;
            this.setDirty();
        }

        if (this._health - finalDamage < 0) {
            if (this.hasPerk("lifeline")) {
                // Checks to see if the perk can mitigate the damage
                const excessDamage = finalDamage - this._health + 1; // Amount to mitigate to survive on 1 health.
                if (this.boost / PerkProperties.lifeline.conversionRate >= excessDamage) {
                    this.boost -= excessDamage * PerkProperties.lifeline.conversionRate;
                    this.lifelineDrainTicker = LifelineDrainTime;
                    finalDamage = this._health - 1;
                    this.lastStandEffect = true;
                    this.lastStandEffectTicker = 1;
                    this.setDirty();
                } else {
                    // If the perk cannot mitigate, kill the player
                    finalDamage = this.health;
                }
            } else {
                // If the player lacks the perk, kill the player
                finalDamage = this.health;
            }
        }

        this.damageTaken += finalDamage;
        if (playerSource && params.source !== this) {
            if (playerSource.groupId !== this.groupId) {
                playerSource.damageDealt += finalDamage;
                playerSource.questManager.trackEvent("damage", {
                    amount: finalDamage,
                    weaponType: params.weaponSourceType ?? params.gameSourceType ?? "",
                    mode: this.game.teamMode,
                    role: playerSource.role,
                });
            }
            this.lastDamagedBy = playerSource;
        }

        this.health -= finalDamage;
        if (playerSource?.champ && playerSource !== this) playerSource.champ.afterDealDamage(this, finalDamage, params);

        // debuff weapons (the debuff's own ticks are Bleeding damage, so they don't refresh it);
        // Frozen Dragon's slow comes from its explosion's freezeDuration
        if (playerSource && params.source !== this && params.damageType !== GameConfig.DamageType.Bleeding) {
            const src = params.gameSourceType;
            const weap = params.weaponSourceType ?? "";
            if (src === "pg_nanobots_rifle" || src === "kit_wolverine_claws" || src === "kit_wolverine_dash") {
                this.applyBleed(4, playerSource);
            } // Wolverine's Claw Combo: every claw bleeds
            else if (src === "kit_wolverine_combo") {
                this.applyBleed(WolverineCombo.bleed, playerSource);
            } // Iron Man: rockets burn, the repulsor blast bleeds
            else if (src === "kit_ironman_rockets" || src === "kit_ironman_spin") {
                this.applyBurn(4, playerSource, src);
            } else if (src === "kit_ironman_blast") this.applyBleed(4, playerSource);
            // Ultron's orb lasers: orange burns, red bleeds, purple poisons, 3s each
            else if (weap === "bullet_kit_ultron_orb_laser_orange") this.applyBurn(3, playerSource, src);
            else if (weap === "bullet_kit_ultron_orb_laser_red") this.applyBleed(3, playerSource);
            // Wizard's crystal, circles and mini crystals all bleed (their hits arrive as the gun, `kit_wizard_crystals`;
            // the burst's own pop deals nothing and doesn't)
            else if (src === "kit_wizard_crystals" && (params.amount ?? 0) > 0) {
                this.applyBleed(WizardCrystals.bleed, playerSource);
            } else if (weap === "bullet_kit_ultron_orb_laser_purple") this.applyPoison(3, playerSource);
            else if ((src === "kit_ultron_blast" || src === "kit_wizard_stars") && params.dir && !this.webPull) {
                // slight knockback, moved like a short slide so walls still stop it
                this.webPull = {
                    target: v2.add(this.pos, v2.mul(v2.normalizeSafe(params.dir), 1.5)),
                    speed: 20,
                    time: 0.12,
                };
            } else if (KitDefs.summoner.whips!.list.some((w) => w.gun === src)) {
                // a whip's lash sets the minions' target and marks it, each whip its own mark (they stack)
                const w = KitDefs.summoner.whips!;
                playerSource.summonerFocusId = this.__id;
                if (!this.vulnerable) this.setDirty();
                this.whipMarks[w.list.findIndex((x) => x.gun === src)] = w.duration;
            } else if (src === "kit_summoner_dagger") {
                // a minion hit on an enemy a fire whip marked sets them burning
                const w = KitDefs.summoner.whips!;
                w.list.forEach((x, i) => {
                    if (x.burn && this.whipMarks[i] > 0) this.applyBurn(x.burn, playerSource, x.gun);
                });
            } else if (src === "pg_acid_shotgun") this.applyPoison(4, playerSource);
            else if (src === "pg_frozen_dragon") this.applyBurn(2, playerSource);
            else if (src === "pg_photon_sniper_rifle") this.applyBurn(4, playerSource, src);
            else if (src === "pg_mercenary") this.applyBurn(2, playerSource, src);
            else if (src === "pg_fake_pistol") this.applyBleed(3, playerSource);
            else if (src === "pg_goo_substance_rifle") this.applyPoison(2, playerSource);
            else if (src === "pg_aphrodite_crossbow") {
                if (this.charmDuration <= 0) this.setDirty();
                this.charmDuration = Math.max(this.charmDuration, 4);
            }
            // Ultron's laser: every hit on an enemy gives him 4 energy
            if (src === "kit_ultron_laser" && playerSource !== this && playerSource.maxEnergy > 0) {
                playerSource.energy = Math.min(playerSource.energy + 4, playerSource.maxEnergy);
                playerSource.energyDirty = true;
            }
            // Sentry Charge: burn, bleed, stun and no perks for the target
            if (src === "kit_sentry_charge") {
                this.applySentryHit(playerSource);
            }
            // Engineer Exoskeleton heals its user the damage it deals
            if (src === "pg_engineer_exoskeleton" && !playerSource.dead) {
                playerSource.health = Math.min(playerSource.health + finalDamage, playerSource.maxHealth);
            }
        }

        if (this.game.isTeamMode) {
            this.setGroupStatuses();
        }

        if (this._health === 0) {
            if (!this.downed && this.hasPerk("self_revive")) {
                this.down(params);
            } else {
                this.game.modeManager.handlePlayerDeath(this, params);
            }
        }
    }

    sentGameOverMsg = false;
    /**
     * adds gameover message to "this.msgsToSend" for the player and all their spectators
     */
    addGameOverMsg(): void {
        if (this.sentGameOverMsg) return;

        const winningTeamId = this.game.winningTeamId;

        this.questManager.flushProgress(winningTeamId);

        const aliveCount = this.game.modeManager.aliveCount();
        const teamRank = winningTeamId == this.teamId ? 1 : aliveCount + 1;

        if (this.game.modeManager.showStatsMsg(this)) {
            const statsMsg = new net.PlayerStatsMsg();
            statsMsg.playerStats = this;
            this.client.sendMsg(net.MsgType.PlayerStats, statsMsg);
        } else {
            this.sentGameOverMsg = true;

            const gameOverMsg = new net.GameOverMsg();

            const statsArr: net.PlayerStatsMsg["playerStats"][] = this.game.modeManager.getGameoverPlayers(this);
            gameOverMsg.playerStats = statsArr;
            gameOverMsg.teamRank = teamRank; // gameover msg sent after alive count updated
            gameOverMsg.teamId = this.teamId;
            gameOverMsg.winningTeamId = winningTeamId;
            gameOverMsg.gameOver = !!winningTeamId;
            this.client.sendMsg(net.MsgType.GameOver, gameOverMsg);

            for (const spectator of this.spectators) {
                spectator.sendMsg(net.MsgType.GameOver, gameOverMsg);
            }
        }
    }

    downedBy: Player | undefined;
    /** downs a player */
    down(params: DamageParams): void {
        this.downed = true;
        this.downedCount++;
        this.downedDamageTicker = GameConfig.player.downedDamageBuffer;
        this.boost = 0;
        this.health = 100;

        v2.set(this.vel, v2.mul(params.dir, 10));

        if (this.game.gas.currentRad <= 0.1) {
            this.health = 50;
        }

        if (this.weaponManager.cookingThrowable) {
            this.weaponManager.throwThrowable(true);
        }

        this.animType = GameConfig.Anim.None;
        this.setDirty();

        this.shootStart = false;
        this.shootHold = false;
        this.cancelAction();

        this.weaponManager.throwThrowable();
        this.weaponManager.setCurWeapIndex(GameConfig.WeaponSlot.Melee, true);

        if (this.weapons[GameConfig.WeaponSlot.Melee].type === "pan") {
            this.wearingPan = true;
        }

        //
        // Send downed msg
        //
        const downedMsg = new net.KillMsg();
        downedMsg.damageType = params.damageType;
        downedMsg.itemSourceType = params.gameSourceType ?? "";
        downedMsg.mapSourceType = params.mapSourceType ?? "";
        downedMsg.targetId = this.__id;
        downedMsg.downed = true;

        if (params.source?.__type === ObjectType.Player) {
            this.downedBy = params.source;
            downedMsg.killerId = params.source.__id;
            downedMsg.killCreditId = params.source.__id;
        }

        this.game.clientBarn.broadcastMsg(net.MsgType.Kill, downedMsg);

        // lone survivr can be given on knock or kill
        if (this.game.map.factionMode) {
            this.team!.checkAndApplyLastMan();
            this.team!.checkAndApplyCaptain();
        }
    }

    killedBy: Player | undefined;
    killedIds: number[] = [];

    kill(params: DamageParams): void {
        if (this.dead) return;
        // Ultron minions blow up when destroyed
        if (this.minionOwner) {
            this.game.explosionBarn.addExplosion(UltronMinion.explosion, v2.copy(this.pos), this.layer, {
                source: this.minionOwner,
                gameSourceType: "kit_ultron_minions",
                weaponSourceType: "kit_ultron_minions",
                damageType: GameConfig.DamageType.Player,
            });
        }
        this.endUltronCombo();
        this.endIronCombo();
        this.ironSpin = undefined;
        this.wizardWave = undefined;
        this.wizardShards = [];
        this.daggerMinions = [];
        // a Wizard's marks go when the Wizard does
        for (const p of this.wizardMarks) {
            p.wizardMarked = false;
            p.setDirty();
        }
        this.wizardMarks.clear();
        // a Wolverine's mark and combo end with either of them
        this.endClawCombo();
        this.spiderCombo = undefined;
        this.webStunTime = 0;
        this.stasisTime = 0;
        this.setMarkTarget(undefined);
        for (const w of [...this.markedBy]) w.setMarkTarget(undefined);
        this.flightTime = 0;
        this.dodgeTime = 0;
        if (this.downed) this.downed = false;
        this.dead = true;
        this.killedIndex = this.game.playerBarn.nextKilledNumber++;
        this.boost = 0;
        this.actionType = GameConfig.Action.None;
        this.actionSeq++;
        this.hasteType = GameConfig.HasteType.None;
        this.hasteSeq++;

        if (this.weaponManager.cookingThrowable) {
            this.weaponManager.throwThrowable(true);
        }
        this.animType = GameConfig.Anim.None;
        this.animSeq++;

        this.healEffect = false;
        this.lastStandEffect = false;
        this.boostDirty = true;
        this.inventoryDirty = true;
        this.setDirty();

        this.shootHold = false;

        this.mapIndicator?.kill();

        this.game.playerBarn.aliveCountDirty = true;

        util.removeFrom(this.game.playerBarn.livingPlayers, this);

        this.game.playerBarn.killedPlayers.push(this);

        this.group?.checkPlayers();

        if (this.team) {
            util.removeFrom(this.team.livingPlayers, this);
        }

        if (this.weaponManager.cookingThrowable) {
            this.weaponManager.throwThrowable(true);
        }

        //
        // Send kill msg
        //
        const killMsg = new net.KillMsg();
        killMsg.damageType = params.damageType;
        killMsg.itemSourceType = params.gameSourceType ?? "";
        killMsg.mapSourceType = params.mapSourceType ?? "";
        killMsg.targetId = this.__id;
        killMsg.killed = true;

        const killCreditSource = params.killCreditSource
            ? params.killCreditSource
            : params.source;
        if (killCreditSource?.__type === ObjectType.Player) {
            this.killedBy = killCreditSource;

            if (killCreditSource !== this && killCreditSource.teamId !== this.teamId) {
                killCreditSource.champ?.onKill(this);
                killCreditSource.killedIds.push(this.matchDataId);
                killCreditSource.kills++;

                let buildingType: Set<string> = new Set();
                const wantsBuilding = killCreditSource.questManager.hasQuestWithFilter("building");
                if (wantsBuilding) {
                    // if no quests are interested in filtering by building, then don't calculate them
                    buildingType = this.getIntersectingBuildings();
                }

                killCreditSource.questManager.trackEvent("kill", {
                    weaponType: params.weaponSourceType ?? params.gameSourceType ?? "",
                    intersectingBuildings: [...buildingType],
                    mode: this.game.teamMode,
                    role: killCreditSource.role,
                });

                if (killCreditSource.isKillLeader) {
                    this.game.playerBarn.killLeaderDirty = true;
                }

                if (killCreditSource.hasPerk("takedown")) {
                    killCreditSource.health += PerkProperties.takedown.hpReward;
                    killCreditSource.boost += PerkProperties.takedown.boostReward;
                    killCreditSource.giveHaste(GameConfig.HasteType.Takedown, PerkProperties.takedown.hasteDuration);
                }

                // Pirate's Bounty (Cutlass-specific)
                const weaponDef = GameObjectDefs.typeToDefSafe(params.gameSourceType || "");
                if (killCreditSource.hasPerk("pirate") && weaponDef?.type == "melee") {
                    const count = util.randomInt(PerkProperties.pirate.minCount, PerkProperties.pirate.maxCount);
                    for (let i = 0; i < count; i++) {
                        const item = this.game.lootBarn.getLootTable(PerkProperties.pirate.tier);
                        if (!item) continue;

                        this.game.lootBarn.addLoot(
                            item.name,
                            this.pos,
                            this.layer,
                            item.count,
                            {
                                pushSpeed: util.random(7.5, 11),
                                dir: v2.randomUnit(),
                            },
                        );
                    }

                    // rare gun
                    if (Math.random() < PerkProperties.pirate.rareChance) {
                        const item = this.game.lootBarn.getLootTable(PerkProperties.pirate.rareTier);
                        if (item) {
                            this.game.lootBarn.addLoot(
                                item.name,
                                this.pos,
                                this.layer,
                                item.count,
                                {
                                    pushSpeed: util.random(7.5, 11),
                                    dir: v2.randomUnit(),
                                },
                            );
                        }
                    }
                }

                if (killCreditSource.role === "woods_king") {
                    this.game.playerBarn.addMapPing("ping_woodsking", this.pos);
                }
            }

            // "secret" interaction: when all 4 lone perks are equipped, don't swap anymore
            const lonePerks = killCreditSource.hasPerk("takedown")
                && killCreditSource.hasPerk("steelskin")
                && killCreditSource.hasPerk("field_medic")
                && killCreditSource.hasPerk("splinter");

            if (killCreditSource.role === "classless") {
                const rolePerks = killCreditSource.perks.filter(
                    (perk) => perk.isFromRole,
                );
                const perkPool = PerkProperties.classless.perkPool;

                if (!lonePerks) {
                    if (rolePerks.length > 0 && perkPool.length > 0) {
                        const perkToReplace = util.randomItem(rolePerks).type;
                        const candidatePerks = perkPool.filter(
                            (p) => !killCreditSource.hasPerk(p),
                        );
                        const newPerk = util.randomItem(candidatePerks);

                        if (newPerk) {
                            killCreditSource.removePerk(perkToReplace);
                            killCreditSource.addPerk(newPerk, false, undefined, true);
                            killCreditSource.setDirty();
                        }
                    }
                }
            }
            killMsg.killCreditId = killCreditSource.__id;
            killMsg.killerKills = killCreditSource.kills;
        }

        if (params.damageType !== GameConfig.DamageType.Bleeding && params.source?.__type === ObjectType.Player) {
            killMsg.killerId = params.source.__id;
        }

        if (this.hasPerk("final_bugle")) {
            this.initLastBreath();
        }

        if (
            this.hasPerk("martyrdom")
            || this.role == "grenadier"
            || this.role == "demo"
        ) {
            this.game.projectileBarn.addSplitProjectiles(
                this.__id,
                "martyr_nade",
                this.pos,
                this.layer,
                v2.create(0, 0),
                PerkProperties.martyrdom.projectileCount,
                PerkProperties.martyrdom.projectileMaxVel,
            );
        }

        if (this.game.map.factionMode) {
            // lone survivr can be given on knock or kill
            this.team!.checkAndApplyLastMan();
            this.team!.checkAndApplyCaptain();

            // golden airdrops depend on alive counts, so we only do this logic on kill
            if (this.game.planeBarn.isOneTeamWinning()) {
                this.game.planeBarn.helpLosingTeam();
            }
        }

        // params.gameSourceType check ensures player didnt die by bleeding out
        if (
            this.game.map.potatoMode
            && this.lastDamagedBy
            && params.damageType === GameConfig.DamageType.Player
            && params.source !== this
        ) {
            this.lastDamagedBy.randomWeaponSwap(params);
        }

        this.game.clientBarn.broadcastMsg(net.MsgType.Kill, killMsg);

        if (this.role) {
            const roleMsg = new net.RoleAnnouncementMsg();
            roleMsg.role = this.role;
            roleMsg.assigned = false;
            roleMsg.killed = true;
            roleMsg.playerId = this.__id;
            roleMsg.killerId = params.source?.__id ?? 0;
            this.game.clientBarn.broadcastMsg(net.MsgType.RoleAnnouncement, roleMsg);
        }

        if (this.isKillLeader && this.role !== "the_hunted") {
            const roleMsg = new net.RoleAnnouncementMsg();
            roleMsg.role = "kill_leader";
            roleMsg.assigned = false;
            roleMsg.killed = true;
            roleMsg.playerId = this.__id;
            roleMsg.killerId = params.source?.__id ?? 0;
            this.game.clientBarn.broadcastMsg(net.MsgType.RoleAnnouncement, roleMsg);
        }

        if (this.game.map.mapDef.gameMode.killLeaderEnabled) {
            const killLeader = this.game.playerBarn.killLeader;

            let killLeaderKills = 0;

            if (killLeader && !killLeader.dead) {
                killLeaderKills = killLeader.kills;
            }

            const newKillLeader = this.game.playerBarn.getPlayerWithHighestKills();
            if (
                killLeader !== newKillLeader
                && killCreditSource
                && newKillLeader === killCreditSource
                && newKillLeader.kills > killLeaderKills
            ) {
                if (killLeader && killLeader.role === "the_hunted") {
                    killLeader.removeRole();
                }

                killCreditSource.promoteToKillLeader();
            }
        }

        if (this.isKillLeader) {
            this.game.playerBarn.killLeader = undefined;
            this.game.playerBarn.killLeaderDirty = true;
            this.isKillLeader = false;

            // remove the role on savannah
            if (this.role === "the_hunted") {
                this.removeRole();
            }
        }

        this.game.deadBodyBarn.addDeadBody(this.pos, this.__id, this.layer, params.dir);

        //
        // Kill outfit obstacle
        //
        if (this.obstacleOutfit) {
            this.obstacleOutfit.kill(params);
        }

        //
        // drop loot
        //
        const lootBefore = this.game.lootBarn.loots.length;

        for (let i = 0; i < GameConfig.WeaponSlot.Count; i++) {
            const weap = this.weapons[i];
            if (!weap.type) continue;
            // kit weapons never drop
            if (isKitItem(weap.type)) {
                weap.type = i === GameConfig.WeaponSlot.Melee ? "fists" : "";
                continue;
            }
            const def = GameObjectDefs.typeToDef(weap.type);
            switch (def.type) {
                case "gun":
                    this.weaponManager.dropGun(i);
                    weap.type = "";
                    break;
                case "melee":
                    if (def.noDropOnDeath || weap.type === "fists") break;
                    this.game.lootBarn.addLoot(weap.type, this.pos, this.layer, 1, {
                        pushSpeed: util.random(7.5, 11),
                        dir: v2.randomUnit(),
                    });
                    weap.type = "fists";
                    break;
                case "throwable":
                    weap.type = "";
                    break;
            }
        }
        this.weaponManager.setCurWeapIndex(GameConfig.WeaponSlot.Melee);

        for (const item of Object.keys(this.invManager.items) as InventoryItem[]) {
            // const def = GameObjectDefs[item] as AmmoDef | HealDef;
            if (item == "1xscope" || (this.game.map.sniperMode && item == "2xscope")) {
                continue;
            }

            const amount = this.invManager.get(item);
            if (amount > 0) {
                this.game.lootBarn.addLoot(item, this.pos, this.layer, amount, {
                    pushSpeed: util.random(7.5, 11),
                    dir: v2.randomUnit(),
                });
            }
        }

        for (const item of GEAR_TYPES) {
            const type = this[item];
            if (!type || this.kit !== "default") continue;
            const def = GameObjectDefs.typeToDef(type) as HelmetDef | ChestDef | BackpackDef;
            if (!!(def as ChestDef).noDrop || def.level < 1) continue;
            this.game.lootBarn.addLoot(type, this.pos, this.layer, 1, {
                pushSpeed: util.random(7.5, 11),
                dir: v2.randomUnit(),
            });
        }

        if (this.outfit) {
            const def = GameObjectDefs.typeToDef(this.outfit, "outfit");
            if (!def.noDropOnDeath && !def.noDrop && this.outfit !== this.loadout.outfit) {
                this.game.lootBarn.addLoot(this.outfit, this.pos, this.layer, 1, {
                    pushSpeed: util.random(7.5, 11),
                    dir: v2.randomUnit(),
                });
            }
        }

        for (let i = this.perks.length - 1; i >= 0; i--) {
            const perk = this.perks[i];
            if (perk.droppable || perk.replaceOnDeath) {
                this.game.lootBarn.addLoot(
                    perk.replaceOnDeath || perk.type,
                    this.pos,
                    this.layer,
                    1,
                    {
                        pushSpeed: util.random(7.5, 11),
                        dir: v2.randomUnit(),
                    },
                );
            }
        }
        this._perks.length = 0;
        this._perkTypes.length = 0;

        // private match "No kill loot": take back everything that just dropped
        if (this.game.config.privateMatch?.noKillLoot) {
            const barn = this.game.lootBarn;
            for (const loot of barn.loots.splice(lootBefore)) {
                loot.destroy();
                const i = barn.newLoots.indexOf(loot);
                if (i >= 0) barn.newLoots.splice(i, 1);
            }
        }

        // Wipe inventory
        this.invManager.wipeInventory();
        this.chest = "";
        this.helmet = "";
        this.backpack = "backpack00";
        this.weaponManager.showNextThrowable();

        // death emote
        this.sendDeathEmoteTicker = 0.3;

        // Building gore region (club pool)
        const objs = this.game.grid.intersectGameObject(this);
        for (const obj of objs) {
            if (
                obj.__type === ObjectType.Building
                && obj.goreRegion
                && util.sameLayer(this.layer, obj.layer)
                && coldet.testCircleAabb(
                    this.pos,
                    this.rad,
                    obj.goreRegion.min,
                    obj.goreRegion.max,
                )
            ) {
                obj.onGoreRegionKill();
            }
        }

        // Check for game over
        this.game.checkGameOver();

        // send data to parent process
        this.game.updateData();

        this.questManager.flushProgress();
    }

    getIntersectingBuildings(): Set<string> {
        const objs = this.game.grid.intersectGameObject(this);
        const buildings = new Set<Building>();

        objLoop:
        for (let i = 0; i < objs.length; i++) {
            const obj = objs[i];
            if (obj.__type !== ObjectType.Building) continue;
            if (
                this.layer < 2
                && !util.sameLayer(obj.layer, this.layer)
            ) continue;

            for (let j = 0; j < obj.zoomRegions.length; j++) {
                const zoomIn = obj.zoomRegions[j].zoomIn;
                if (!zoomIn) continue;
                if (coldet.test(zoomIn, this.collider)) {
                    buildings.add(obj);
                    continue objLoop;
                }
            }

            for (let j = 0; j < obj.surfaces.length; j++) {
                const colliders = obj.surfaces[j].colliders;
                for (let k = 0; k < colliders.length; k++) {
                    if (coldet.test(colliders[k], this.collider)) {
                        buildings.add(obj);
                        continue objLoop;
                    }
                }
            }

            if (obj.groundPatches !== undefined) {
                for (let j = 0; j < obj.groundPatches.length; j++) {
                    const groundPatch = obj.groundPatches[j];
                    if (coldet.test(groundPatch.bound, this.collider)) {
                        buildings.add(obj);
                        continue objLoop;
                    }
                }
            }
            if (obj.goreRegion) {
                if (coldet.test(obj.goreRegion, this.collider)) {
                    buildings.add(obj);
                    continue objLoop;
                }
            }
        }

        function withAllParents(building: Building): string[] {
            const hierarchy: string[] = [];
            let current: Building | undefined = building;
            do {
                hierarchy.push(current.type);
                current = current.parentBuilding;
            } while (current !== undefined);

            if (building.parentStructure?.parentBuilding !== undefined) {
                hierarchy.push(...withAllParents(building.parentStructure.parentBuilding));
            }

            return hierarchy;
        }

        return new Set([...buildings].flatMap(withAllParents));
    }

    getAliveKiller(): Player | undefined {
        let aliveKiller: Player | undefined = this.killedBy;
        const checkedPlayers = new Set<Player>();

        for (let i = 0; i < 80; i++) {
            if (!aliveKiller) return undefined;
            if (aliveKiller === this) return undefined;
            if (aliveKiller.killedBy === aliveKiller) return undefined;
            if (checkedPlayers.has(aliveKiller)) return undefined;

            if (!aliveKiller.dead) return aliveKiller;
            checkedPlayers.add(aliveKiller);

            aliveKiller = aliveKiller.killedBy;
        }
    }

    canDespawn() {
        // special check for 50v50
        // we dont want eg leaders to despawn a second after being promoted :p
        if (this.game.map.factionMode && this.role) return false;

        return (
            this.timeAlive < GameConfig.player.minActiveTime && !this.dead && !this.downed
        );
    }

    isReloading() {
        return (
            this.actionType == GameConfig.Action.Reload
            || this.actionType == GameConfig.Action.ReloadAlt
        );
    }

    isReviving() {
        return this.actionType == GameConfig.Action.Revive && !!this.action.targetId;
    }

    isBeingRevived() {
        if (!this.downed) return false;

        const normalRevive = this.actionType == GameConfig.Action.Revive && this.action.targetId == 0;
        if (normalRevive) return true;

        const numMedics = this.game.playerBarn.aoeHealPlayers.length;
        if (numMedics) {
            return this.game.playerBarn.aoeHealPlayers.some((medic) => {
                return medic != this && medic.isReviving() && this.isAffectedByAOE(medic);
            });
        }
        return false;
    }

    /** returns player to revive if can revive */
    getPlayerToRevive(): Player | undefined {
        if (this.actionType != GameConfig.Action.None) return undefined; // action in progress already

        if (this.downed && this.hasPerk("self_revive")) return this;

        if (!this.game.isTeamMode) return undefined; // no revives in solos
        if (this.downed) return undefined; // can't revive players while downed

        const nearbyDownedTeammates = this.game.grid
            .intersectCollider(
                collider.createCircle(this.pos, GameConfig.player.reviveRange),
            )
            .filter(
                (obj): obj is Player =>
                    obj.__type == ObjectType.Player
                    && obj.teamId == this.teamId
                    && obj.downed
                    // can't revive someone already being revived or self reviving (medic)
                    && obj.actionType != GameConfig.Action.Revive,
            );

        let playerToRevive: Player | undefined;
        let closestDist = Number.MAX_VALUE;
        for (const teammate of nearbyDownedTeammates) {
            if (!util.sameLayer(this.layer, teammate.layer)) {
                continue;
            }
            const dist = v2.distance(this.pos, teammate.pos);
            if (dist <= GameConfig.player.reviveRange && dist < closestDist) {
                playerToRevive = teammate;
                closestDist = dist;
            }
        }

        return playerToRevive;
    }

    revive(playerToRevive: Player | undefined) {
        if (!playerToRevive) return;

        this.playerBeingRevived = playerToRevive;
        playerToRevive.revivedBy = this;
        if (this.downed && this.hasPerk("self_revive")) {
            this.doAction(
                "",
                GameConfig.Action.Revive,
                GameConfig.player.reviveDuration,
                this.__id,
            );
        } else {
            playerToRevive.doAction(
                "",
                GameConfig.Action.Revive,
                GameConfig.player.reviveDuration,
            );
            this.doAction(
                "",
                GameConfig.Action.Revive,
                GameConfig.player.reviveDuration,
                playerToRevive.__id,
            );

            if (this.weaponManager.cookingThrowable) {
                this.weaponManager.throwThrowable(true);
            }
            this.playAnim(GameConfig.Anim.Revive, GameConfig.player.reviveDuration);
        }
    }

    isAffectedByAOE(medic: Player): boolean {
        const effectRange = medic.actionType == GameConfig.Action.Revive
            ? GameConfig.player.medicReviveRange
            : GameConfig.player.medicHealRange;

        return (
            medic.teamId == this.teamId
            && !!util.sameLayer(medic.layer, this.layer)
            && v2.lengthSqr(v2.sub(medic.pos, this.pos)) <= effectRange * effectRange
        );
    }

    /** for the medic role in 50v50 */
    getAOEPlayers(): Player[] {
        const effectRange = this.actionType == GameConfig.Action.Revive
            ? GameConfig.player.medicReviveRange
            : GameConfig.player.medicHealRange;

        return this.game.grid
            .intersectCollider(
                // includes self
                collider.createCircle(this.pos, effectRange),
            )
            .filter(
                (obj): obj is Player => obj.__type == ObjectType.Player && obj.isAffectedByAOE(this),
            );
    }

    useHealingItem(item: InventoryItem): void {
        const itemDef = GameObjectDefs.typeToDef(item, "heal");

        const hasAoeHeal = this.hasPerk("aoe_heal");
        if (
            (!hasAoeHeal && this.health == itemDef.maxHeal)
            || this.actionType == GameConfig.Action.UseItem
            || this.actionType == GameConfig.Action.Revive
            || this.weaponManager.cookingThrowable
        ) {
            return;
        }
        if (!this.invManager.has(item)) {
            return;
        }

        // medics always emote the healing/boost item they're using
        if (hasAoeHeal) {
            this.game.playerBarn.addEmote("emote_loot", this.__id, item);
        }

        this.cancelAction();
        this.doAction(
            item,
            GameConfig.Action.UseItem,
            (hasAoeHeal ? 0.75 : 1) * itemDef.useTime,
        );
    }

    applyActionFunc(actionFunc: (target: Player) => void): void {
        const hasAoeHeal = this.hasPerk("aoe_heal");

        if (hasAoeHeal) {
            let aoePlayers = this.getAOEPlayers();

            // aoe doesnt heal/give boost to downed players
            if (this.actionType == GameConfig.Action.UseItem) {
                aoePlayers = aoePlayers.filter((p) => !p.downed);
            }

            for (let i = 0; i < aoePlayers.length; i++) {
                const aoePlayer = aoePlayers[i];
                actionFunc(aoePlayer);
            }
        } else {
            const target = this.actionType === GameConfig.Action.Revive && this.playerBeingRevived
                ? this.playerBeingRevived
                : this;
            actionFunc(target);
        }
    }

    useBoostItem(item: InventoryItem): void {
        const itemDef = GameObjectDefs.typeToDef(item, "boost");

        if (
            this.actionType == GameConfig.Action.UseItem
            || this.actionType == GameConfig.Action.Revive
            || this.weaponManager.cookingThrowable
        ) {
            return;
        }
        if (!this.invManager.has(item)) {
            return;
        }
        const hasAoeHeal = this.hasPerk("aoe_heal");

        // medics always emote the healing/boost item they're using
        if (hasAoeHeal) {
            this.game.playerBarn.addEmote("emote_loot", this.__id, item);
        }

        this.cancelAction();
        this.doAction(
            item,
            GameConfig.Action.UseItem,
            (hasAoeHeal ? 0.75 : 1) * itemDef.useTime,
        );
    }

    moveLeft = false;
    moveRight = false;
    moveUp = false;
    moveDown = false;
    shootStart = false;
    shootHold = false;
    portrait = false;
    autoOpenDoors = true;

    touchMoveActive = false;
    touchMoveDir = v2.create(1, 0);
    touchMoveLen = 255;
    toMouseDir = v2.create(1, 0);
    toMouseLen = 0;
    mousePos = v2.create(1, 0);

    shouldAcceptInput(input: Input): boolean {
        return (
            !this.downed
            || input === GameConfig.Input.Interact // Players can interact with obstacles while downed.
            || input === GameConfig.Input.Use // Players can interact with doors while downed.
            || (input === GameConfig.Input.Revive && this.hasPerk("self_revive")) // Players can revive themselves if they have the self-revive perk.
            || (input === GameConfig.Input.Cancel
                && (!this.revivedBy?.hasPerk("aoe_heal") // Players can cancel their own revives if they are not revived by aoe heal.
                    || this.revivedBy === this.playerBeingRevived)) // Players can cancel their own revives if they are reviving themselves.
        );
    }

    handleInput(msg: net.InputMsg): void {
        if (this.dead) return;
        if (this.game.map.perkMode && !this.role) return;

        this.dirNew = v2.normalizeSafe(msg.toMouseDir);

        this.moveLeft = msg.moveLeft;
        this.moveRight = msg.moveRight;
        this.moveUp = msg.moveUp;
        this.moveDown = msg.moveDown;

        this.touchMoveActive = msg.touchMoveActive;
        this.touchMoveDir = v2.normalizeSafe(msg.touchMoveDir);
        this.touchMoveLen = msg.touchMoveLen;
        this.autoOpenDoors = msg.autoOpenDoors;
        this.toMouseLen = msg.toMouseLen;

        this.shootHold = msg.shootHold;

        if (msg.shootStart) {
            this.shootStart = true;
        }

        // HACK? client for some reason sends Interact followed by Cancel on mobile
        // so we ignore the cancel request when reviving a player
        let ignoreCancel = false;

        for (let i = 0; i < msg.inputs.length; i++) {
            const input = msg.inputs[i];
            if (!this.shouldAcceptInput(input)) continue;
            // champions keep their one basic attack in hand: no scrolling or swapping to other slots
            if (
                this.champ && (
                    input === GameConfig.Input.EquipNextWeap || input === GameConfig.Input.EquipPrevWeap
                    || input === GameConfig.Input.EquipLastWeap || input === GameConfig.Input.EquipOtherGun
                    || input === GameConfig.Input.StowWeapons || input === GameConfig.Input.SwapWeapSlots
                )
            ) continue;
            switch (input) {
                case GameConfig.Input.EquipFragGrenade:
                    this.champ?.useItem();
                    break;
                case GameConfig.Input.StowWeapons:
                case GameConfig.Input.EquipMelee:
                    if (this.champ && input === GameConfig.Input.EquipMelee) {
                        this.champ.cast(2);
                        break;
                    }
                    this.weaponManager.playMeleeIdleAnim();
                    this.weaponManager.setCurWeapIndex(GameConfig.WeaponSlot.Melee);
                    break;
                case GameConfig.Input.EquipPrimary:
                    if (this.champ) {
                        this.champ.cast(0);
                        break;
                    }
                    this.weaponManager.setCurWeapIndex(GameConfig.WeaponSlot.Primary);
                    break;
                case GameConfig.Input.EquipSecondary:
                    if (this.champ) {
                        this.champ.cast(1);
                        break;
                    }
                    this.weaponManager.setCurWeapIndex(GameConfig.WeaponSlot.Secondary);
                    break;
                case GameConfig.Input.EquipThrowable:
                    if (this.champ) {
                        this.champ.cast(3);
                        break;
                    }
                    if (this.curWeapIdx === GameConfig.WeaponSlot.Throwable) {
                        this.weaponManager.throwThrowable(true);
                        if (this.animType === GameConfig.Anim.Cook) {
                            this.cancelAnim();
                        }
                        this.weaponManager.showNextThrowable();
                    } else {
                        this.weaponManager.setCurWeapIndex(
                            GameConfig.WeaponSlot.Throwable,
                        );
                    }
                    break;
                case GameConfig.Input.EquipPrevWeap:
                case GameConfig.Input.EquipNextWeap:
                    {
                        function absMod(a: number, n: number): number {
                            return a >= 0 ? a % n : ((a % n) + n) % n;
                        }

                        const toAdd = input === GameConfig.Input.EquipNextWeap ? 1 : -1;

                        let iterations = 0;
                        let idx = this.curWeapIdx;
                        while (iterations < GameConfig.WeaponSlot.Count * 2) {
                            idx = absMod(idx + toAdd, GameConfig.WeaponSlot.Count);
                            if (this.weapons[idx].type) {
                                break;
                            }
                        }
                        this.weaponManager.setCurWeapIndex(idx);
                    }
                    break;
                case GameConfig.Input.EquipLastWeap:
                    this.weaponManager.setCurWeapIndex(this.weaponManager.lastWeaponIdx);
                    break;
                case GameConfig.Input.EquipOtherGun:
                    // priority list of slots to swap to
                    const slotTargets = [
                        GameConfig.WeaponSlot.Primary,
                        GameConfig.WeaponSlot.Secondary,
                        GameConfig.WeaponSlot.Melee,
                    ];

                    util.removeFrom(slotTargets, this.curWeapIdx);

                    for (let i = 0; i < slotTargets.length; i++) {
                        const slot = slotTargets[i];
                        if (this.weapons[slot].type) {
                            this.weaponManager.setCurWeapIndex(slot);
                            break;
                        }
                    }
                    break;
                case GameConfig.Input.Interact: {
                    const loot = this.getClosestLoot();
                    const obstacles = this.getInteractableObstacles();
                    const playerToRevive = this.getPlayerToRevive();

                    const canRevive = !this.downed || (this.downed && this.hasPerk("self_revive"));

                    const interactables = [
                        playerToRevive,
                        !this.downed && loot,
                        ...obstacles,
                    ];

                    for (let i = 0; i < interactables.length; i++) {
                        const interactable = interactables[i];
                        if (!interactable) continue;
                        if (interactable.__type === ObjectType.Player && canRevive) {
                            this.revive(playerToRevive);
                            ignoreCancel = true;
                        } else if (
                            interactable.__type === ObjectType.Loot
                            && !this.downed
                        ) {
                            this.interactWith(interactable);
                        } else {
                            this.interactWith(interactable);
                        }
                    }
                    break;
                }
                case GameConfig.Input.Revive: {
                    const playerToRevive = this.getPlayerToRevive();
                    this.revive(playerToRevive);
                    break;
                }
                case GameConfig.Input.Loot: {
                    const loot = this.getClosestLoot();
                    if (loot) {
                        this.interactWith(loot);
                    }
                    break;
                }
                case GameConfig.Input.Use: {
                    const obstacles = this.getInteractableObstacles();
                    for (let i = 0; i < obstacles.length; i++) {
                        obstacles[i].interact(this);
                    }
                    break;
                }
                case GameConfig.Input.Reload:
                    if (this.actionType !== GameConfig.Action.Revive) {
                        this.weaponManager.scheduledReload = true;
                    }
                    break;
                case GameConfig.Input.Cancel:
                    if (ignoreCancel) {
                        break;
                    }
                    this.cancelAction();
                    break;
                case GameConfig.Input.EquipNextScope: {
                    const scopeIdx = SCOPE_LEVELS.indexOf(this.scope);

                    for (let i = scopeIdx + 1; i < SCOPE_LEVELS.length; i++) {
                        const nextScope = SCOPE_LEVELS[i];

                        if (!this.invManager.has(nextScope as InventoryItem)) continue;
                        this.scope = nextScope;
                        this.inventoryDirty = true;
                        break;
                    }
                    break;
                }
                case GameConfig.Input.EquipPrevScope: {
                    const scopeIdx = SCOPE_LEVELS.indexOf(this.scope);

                    for (let i = scopeIdx - 1; i >= 0; i--) {
                        const prevScope = SCOPE_LEVELS[i];

                        if (!this.invManager.has(prevScope as InventoryItem)) continue;
                        this.scope = prevScope;
                        this.inventoryDirty = true;
                        break;
                    }
                    break;
                }
                case GameConfig.Input.SwapWeapSlots: {
                    this.weaponManager.swapWeaponSlots();
                    break;
                }
            }
        }

        // no exceptions for any perks or roles
        if (this.downed) return;

        if (!this.invManager.isValid(msg.useItem) || !this.invManager.has(msg.useItem)) {
            return;
        }
        const def = GameObjectDefs.typeToDef(msg.useItem);
        switch (def.type) {
            case "heal":
                this.useHealingItem(msg.useItem);
                break;
            case "boost":
                this.useBoostItem(msg.useItem);
                break;
            case "scope":
                if (this.invManager.has(msg.useItem)) {
                    this.scope = msg.useItem;
                    this.inventoryDirty = true;
                }
                break;
        }
    }

    getClosestLoot(): Loot | undefined {
        const objs = this.game.grid.intersectCollider(
            collider.createCircle(this.pos, this.rad + 5),
        );

        let closestLoot: Loot | undefined;
        let closestDist = Number.MAX_VALUE;

        for (let i = 0; i < objs.length; i++) {
            const loot = objs[i];
            if (loot.__type !== ObjectType.Loot) continue;
            if (loot.destroyed) continue;
            if (
                util.sameLayer(loot.layer, this.layer)
                && (loot.ownerId == 0 || loot.ownerId == this.__id)
            ) {
                const pos = loot.pos;
                const rad = this.isMobile
                    ? this.rad + loot.rad * GameConfig.player.touchLootRadMult
                    : this.rad + loot.rad;
                const toPlayer = v2.sub(this.pos, pos);
                const distSq = v2.lengthSqr(toPlayer);
                if (distSq < rad * rad && distSq < closestDist) {
                    closestDist = distSq;
                    closestLoot = loot;
                }
            }
        }

        return closestLoot;
    }

    getInteractableObstacles(): Obstacle[] {
        const objs = this.game.grid.intersectCollider(
            collider.createCircle(this.pos, this.rad + 5),
        );

        let obstacles: Array<{ pen: number; obstacle: Obstacle }> = [];

        for (let i = 0; i < objs.length; i++) {
            const obstacle = objs[i];
            if (obstacle.__type !== ObjectType.Obstacle) continue;
            if (!obstacle.dead && util.sameLayer(obstacle.layer, this.layer)) {
                if (obstacle.isButton && obstacle.button!.isVat) {
                    const distance = v2.distance(this.pos, obstacle.pos);
                    if (distance + this.rad < obstacle.interactionRad * obstacle.scale) {
                        obstacles.push({
                            pen: 0,
                            obstacle,
                        });
                    }
                    continue;
                }

                if (obstacle.interactionRad > 0) {
                    const res = collider.intersectCircle(
                        obstacle.collider,
                        this.pos,
                        obstacle.interactionRad + this.rad,
                    );
                    if (res) {
                        obstacles.push({
                            pen: res.pen,
                            obstacle,
                        });
                    }
                }
            }
        }
        return obstacles.sort((a, b) => a.pen - b.pen).map((o) => o.obstacle);
    }

    interactWith(obj: GameObject): void {
        switch (obj.__type) {
            case ObjectType.Loot:
                this.pickupLoot(obj);
                break;
            case ObjectType.Obstacle:
                obj.interact(this);
                break;
        }
    }

    getPlayerStatus() {
        const players: Player[] = this.game.modeManager.getPlayerStatusPlayers(this)!;
        return players.map((p) => {
            const visible = p.teamId === this.teamId || p.timeUntilHidden > 0;
            return {
                hasData: visible || p.playerStatusDirty,
                pos: p.pos,
                visible,
                dead: p.dead,
                downed: p.downed,
                role: p.role,
            };
        });
    }

    getFreeGunSlot(obj: Loot) {
        const gunSlots = [GameConfig.WeaponSlot.Primary, GameConfig.WeaponSlot.Secondary];

        // first loop to find dual wieldable guns
        for (const slot of gunSlots) {
            const slotDef = GameObjectDefs.typeToDefSafe(this.weapons[slot].type) as GunDef | undefined;

            if (slotDef?.dualWieldType && obj.type === this.weapons[slot].type) {
                return {
                    slot,
                    isDual: true,
                    cause: net.PickupMsgType.Success,
                };
            }
        }

        // second loop to find empty slots
        for (const slot of gunSlots) {
            if (this.weapons[slot].type === "") {
                return {
                    slot,
                    isDual: false,
                    cause: net.PickupMsgType.Success,
                };
            }
        }

        // if none are found use active weapon if its a gun
        if (GameConfig.WeaponType[this.curWeapIdx] === "gun") {
            const newGunDef = GameObjectDefs.typeToDef(obj.type, "gun");
            return {
                slot: this.curWeapIdx,
                isDual: false,
                cause: this.activeWeapon === obj.type
                        || newGunDef.dualWieldType === this.weapons[this.curWeapIdx].type
                    ? net.PickupMsgType.AlreadyOwned
                    : net.PickupMsgType.Success,
            };
        }

        return {
            slot: null,
            isDual: false,
            cause: net.PickupMsgType.Full,
        };
    }

    pickupTicker = 0;
    pickupLoot(obj: Loot) {
        if (obj.destroyed) return;

        const def = GameObjectDefs.typeToDef(obj.type);
        if (this.lockedKit && (def.type === "gun" || def.type === "melee" || def.type === "throwable")) return;
        // League champions still pick up consumables and perks, so they can heal and build up
        const championPickup = !!this.champ
            && (def.type === "heal" || def.type === "boost" || def.type === "perk");
        // other kits pick nothing up: no normal weapons, gear, perks or consumables
        if (this.kit !== "default" && !championPickup) return;
        if (
            (this.actionType == GameConfig.Action.UseItem && def.type != "gun")
            || this.actionType == GameConfig.Action.Revive
        ) {
            return;
        }

        if (this.pickupTicker > 0) return;
        this.pickupTicker = 0.1;
        let amountLeft = 0;
        let lootToAdd = obj.type;
        const pickupMsg = new net.PickupMsg();
        pickupMsg.item = obj.type;
        pickupMsg.type = net.PickupMsgType.Success;

        switch (def.type) {
            case "ammo":
            case "scope":
            case "heal":
            case "boost":
            case "throwable":
                {
                    const itemType = obj.type;
                    if (!this.invManager.isValid(itemType)) break;

                    const result = this.invManager.give(itemType, obj.count);

                    if (result.added <= 0) {
                        if (def.type === "scope") {
                            pickupMsg.type = net.PickupMsgType.AlreadyOwned;
                        } else {
                            pickupMsg.type = net.PickupMsgType.Full;
                        }
                    }

                    amountLeft = result.remaining;
                }
                break;
            case "melee":
                if (this.weapons[GameConfig.WeaponSlot.Melee].type === obj.type) {
                    pickupMsg.type = net.PickupMsgType.AlreadyEquipped;
                    amountLeft = 1;
                    break;
                }
                this.weaponManager.dropMelee();
                this.weaponManager.setWeapon(GameConfig.WeaponSlot.Melee, obj.type, 0);
                break;
            case "gun":
                {
                    amountLeft = 0;

                    const freeGunSlot = this.getFreeGunSlot(obj);
                    pickupMsg.type = freeGunSlot.cause;
                    let newGunIdx = freeGunSlot.slot;

                    if (newGunIdx === null) {
                        this.pickupTicker = 0;
                        return;
                    }

                    const oldWeapDef = GameObjectDefs.typeToDefSafe(this.weapons[newGunIdx].type) as
                        | GunDef
                        | undefined;
                    if (
                        oldWeapDef
                        && (oldWeapDef.noDrop || !this.weaponManager.canDropFlare(newGunIdx))
                    ) {
                        this.pickupTicker = 0;
                        return;
                    }

                    // if "preloaded" gun add ammo to inventory
                    if (obj.isPreloadedGun) {
                        this.invManager.giveAndDrop(
                            def.ammo as InventoryItem,
                            def.ammoSpawnCount,
                        );
                    }

                    if (freeGunSlot.cause === net.PickupMsgType.AlreadyOwned) {
                        amountLeft = 1;
                        break;
                    }

                    this.pickupTicker = 0.2;

                    let gunType = obj.type;

                    if (def.dualWieldType && freeGunSlot.isDual) {
                        gunType = def.dualWieldType;

                        // cancel reload when going from single to dual
                        if (this.curWeapIdx === newGunIdx && this.isReloading()) {
                            this.cancelAction();

                            if (this.weapons[newGunIdx].ammo <= 0) {
                                this.weaponManager.scheduledReload = true;
                            }
                        }
                    }

                    // replaces the gun

                    let newAmmo = 0;

                    if (oldWeapDef) {
                        newAmmo = oldWeapDef.dualWieldType === gunType
                            ? this.weapons[newGunIdx].ammo
                            : 0;

                        // inverted logic, there is only 1 case where the old gun should not drop
                        // when youre holding a pistol, and you pick up the same single pistol from the ground
                        // it should turn it into its dual pistol version and drop nothing
                        const shouldDrop = !(
                            oldWeapDef.dualWieldType // verifies it's a dual wieldable pistol
                            && this.weapons[newGunIdx].type == obj.type // verifies the old gun and new gun are the same
                        );
                        if (shouldDrop) {
                            this.weaponManager.dropGun(newGunIdx);
                        }
                    }

                    this.weaponManager.setWeapon(newGunIdx, gunType, newAmmo);

                    // always select primary slot if melee is selected
                    if (
                        !freeGunSlot.isDual
                        && this.curWeapIdx === GameConfig.WeaponSlot.Melee
                    ) {
                        this.weaponManager.setCurWeapIndex(newGunIdx); // primary
                    }
                }
                break;
            case "helmet":
            case "chest":
            case "backpack":
                {
                    const objQuality = this.getGearQuality(obj.type);
                    const thisType = this[def.type];
                    const thisDef = GameObjectDefs.typeToDefSafe(thisType);
                    const thisQuality = this.getGearQuality(thisType);
                    amountLeft = 1;

                    if ((def.type == "helmet" && this.hasRoleHelmet) || thisQuality > objQuality) {
                        lootToAdd = obj.type;
                        pickupMsg.type = net.PickupMsgType.BetterItemEquipped;
                        break;
                    }

                    if (thisType === obj.type) {
                        lootToAdd = obj.type;
                        pickupMsg.type = net.PickupMsgType.AlreadyEquipped;
                    } else {
                        lootToAdd = thisType;
                        this[def.type] = obj.type;
                        pickupMsg.type = net.PickupMsgType.Success;

                        // removes roles/perks associated with the dropped role/perk helmet
                        if (thisDef && thisDef.type == "helmet" && thisDef.perk) {
                            this.removePerk(thisDef.perk);
                        }

                        if (thisDef && thisDef.type == "helmet" && thisDef.role) {
                            this.removeRole();
                        }

                        // adds roles/perks associated with the picked up role/perk helmet
                        if (def.type == "helmet" && def.role) {
                            this.promoteToRole(def.role);
                        }

                        if (def.type == "helmet" && def.perk) {
                            this.addPerk(def.perk);
                        }

                        this.setDirty();
                    }
                    if (this.getGearLevel(lootToAdd) === 0) lootToAdd = "";
                }
                break;
            case "outfit":
                if (this.game.map.factionMode) {
                    if (def.teamId && this.teamId !== def.teamId) {
                        return;
                    }
                }
                if (this.role) {
                    const roleDef = GameObjectDefs.typeToDef(this.role, "role");
                    if (roleDef.defaultItems?.noDropOutfit) {
                        amountLeft = 1;
                        pickupMsg.type = net.PickupMsgType.BetterItemEquipped;
                        break;
                    }
                }

                if (this.outfit === obj.type) {
                    pickupMsg.type = net.PickupMsgType.AlreadyEquipped;
                    amountLeft = 1;
                    break;
                }

                amountLeft = 1;
                lootToAdd = this.outfit;
                pickupMsg.type = net.PickupMsgType.Success;
                this.setOutfit(obj.type);
                break;
            case "perk":
                let type = obj.type;

                const isMistery = type === "halloween_mystery";

                if (isMistery) {
                    type = this.game.lootBarn.getLootTable("tier_halloween_mystery_perks")
                        ?.name || type;
                }

                pickupMsg.item = type;

                if (this.hasPerk(obj.type)) {
                    amountLeft = 1;
                    pickupMsg.type = net.PickupMsgType.AlreadyEquipped;
                    break;
                }

                const emoteType = `emote_${type}`;
                if (GameObjectDefs.typeExists(`emote_${type}`)) {
                    this.game.playerBarn.addEmote(emoteType, this.__id);
                }

                const perkSlots = this.perks.filter(
                    (p) => p.droppable || p.replaceOnDeath === "halloween_mystery",
                );
                const perkSlotType = perkSlots[0]?.type;

                // The client can only show 4 perks in the UI.
                // If the player already has 4 or more perks, they cannot pick up a new one.
                if (!perkSlotType && this.perks.length >= 4) {
                    amountLeft = 1;
                    pickupMsg.type = net.PickupMsgType.MaxPerks;
                    break;
                }
                if (
                    perkSlotType
                    && perkSlots.length >= (GameObjectDefs.typeToDef(this.backpack, "backpack").maxPerks ?? 1)
                ) {
                    amountLeft = 1;
                    lootToAdd = isMistery ? "" : perkSlotType;
                    this.removePerk(perkSlotType);
                    this.addPerk(
                        type,
                        !isMistery,
                        isMistery ? "halloween_mystery" : undefined,
                    );
                } else {
                    this.addPerk(
                        type,
                        !isMistery,
                        isMistery ? "halloween_mystery" : undefined,
                    );
                }
                this.setDirty();
                break;
        }

        const lootToAddDef = GameObjectDefs.typeToDefSafe(lootToAdd) as LootDef;
        if (
            amountLeft > 0
            && lootToAdd !== ""
            // if obj you tried picking up can't be picked up and needs to be dropped, "noDrop" is irrelevant
            && (obj.type == lootToAdd || !(lootToAddDef as ChestDef).noDrop)
        ) {
            this.game.lootBarn.addLoot(lootToAdd, obj.pos, obj.layer, amountLeft, {
                pushSpeed: util.random(4, 4.5),
                dir: v2.neg(this.dir),
                noSideAmmo: true,
            });
        }

        obj.destroy();
        this.client.sendMsg(net.MsgType.Pickup, pickupMsg);
    }

    // in original game, only called on snowball or potato collision
    dropRandomLoot(): void {
        // all possible droppable loot held by the player
        // 4 categories: inventory, weapons, armor, perks
        const playerLootTypes: string[] = [];

        for (const [type, count] of Object.entries(this.inventory)) {
            if (count == 0) continue;
            if (type == "1xscope") continue;
            playerLootTypes.push(type);
        }

        for (let i = 0; i < this.weapons.length; i++) {
            if (GameConfig.WeaponType[i] == "throwable") continue;
            const weapon = this.weapons[i];
            if (!weapon.type) continue;
            if (weapon.type == "fists") continue;
            const def = GameObjectDefs.typeToDef(weapon.type) as GunDef;
            if (def.noDrop) continue;
            playerLootTypes.push(weapon.type);
        }

        for (let i = 0; i < this.perks.length; i++) {
            const perk = this.perks[i];
            if (!perk.droppable) continue;
            playerLootTypes.push(perk.type);
        }

        for (const armor of [this.helmet, this.chest] as const) {
            if (!armor) continue;
            if ((GameObjectDefs.typeToDef(armor) as ChestDef | HelmetDef).noDrop) continue;
            playerLootTypes.push(armor);
        }

        if (playerLootTypes.length == 0) return;

        const item = util.randomItem(playerLootTypes);
        const weapIdx = this.weapons.findIndex((w) => w.type == item);

        const dropMsg = new net.DropItemMsg();
        dropMsg.item = item;
        dropMsg.weapIdx = weapIdx;
        this.dropItem(dropMsg);
    }

    /** just used in potato mode, swaps oldWeapon with a random weapon of the same type (mosin -> m9) */
    randomWeaponSwap(params: DamageParams): void {
        if (this.dead) return;
        if (this.role === "last_man") return;
        const oldWeapon = params.weaponSourceType || params.gameSourceType;
        if (!oldWeapon) return;

        const oldWeaponDef = GameObjectDefs.typeToDefSafe(oldWeapon) as
            | GunDef
            | ThrowableDef
            | MeleeDef
            | undefined;

        if (!oldWeaponDef || oldWeaponDef.noPotatoSwap) return;
        // kit and champion abilities, explosions etc. are not weapons with a pool to swap from
        const weaponDefs = WeaponTypeToDefs[oldWeaponDef.type];
        if (!weaponDefs) return;

        // necessary for type safety since Object.entries() is not type safe and just returns "any"
        const enumerableDefs = Object.entries(weaponDefs) as [string, GunDef | ThrowableDef | MeleeDef][];
        const hasRarePotato = this.hasPerk("rare_potato");
        const weaponChoices = enumerableDefs.filter(([type, def]) => {
            if (def.noPotatoSwap) return false;
            if (!this.game.map.factionMode && type === "tomato") return false;
            if (hasRarePotato && def.quality !== PerkProperties.rare_potato.quality) return false;
            return true;
        });
        const [chosenWeaponType, chosenWeaponDef] = util.randomItem(weaponChoices);

        let index;
        if (this.activeWeapon === oldWeapon) {
            index = this.curWeapIdx;
        } else {
            index = this.weaponManager.weapons.findIndex((w) => w.type == oldWeapon);
        }

        if (index == -1) {
            // defaults if we can't figure out what slot was used to "trigger" the weapon swap
            switch (oldWeaponDef.type) {
                case "gun":
                    // arbitrary choice
                    index = GameConfig.WeaponSlot.Primary;
                    break;
                case "melee":
                    index = GameConfig.WeaponSlot.Melee;
                    break;
                case "throwable":
                    index = GameConfig.WeaponSlot.Throwable;
                    break;
            }
        }

        const slotDef = GameObjectDefs.typeToDefSafe(this.weapons[index].type) as
            | GunDef
            | MeleeDef
            | ThrowableDef;
        if (slotDef && slotDef.noPotatoSwap) return;

        if (index === this.curWeapIdx && this.isReloading()) {
            this.cancelAction();
        }

        switch (chosenWeaponDef.type) {
            case "gun":
                this.weaponManager.setWeapon(
                    index,
                    chosenWeaponType,
                    this.weaponManager.getAmmoStats(chosenWeaponDef).maxClip,
                );
                break;
            case "melee":
                this.weaponManager.setWeapon(index, chosenWeaponType, 0);
                break;
            case "throwable":
                if (!this.weaponManager.cookingThrowable) {
                    this.weaponManager.setWeapon(index, chosenWeaponType, 0);
                }
                break;
        }

        if ("switchDelay" in chosenWeaponDef) {
            this.weaponManager.weapons[index].cooldown = chosenWeaponDef.switchDelay;
        }

        if (chosenWeaponDef.type == "gun") {
            const ammo = math.max(
                chosenWeaponDef.ammoSpawnCount - chosenWeaponDef.maxClip,
                0,
            );

            this.invManager.give(chosenWeaponDef.ammo as InventoryItem, ammo);

            if (index === this.curWeapIdx) {
                this.shotSlowdownTimer = 0;
            }
        } else if (
            chosenWeaponDef.type == "throwable"
            && this.invManager.isValid(chosenWeaponType)
        ) {
            const bagSpace = this.invManager.getMaxCapacity(chosenWeaponType) ?? 0;

            this.invManager.give(chosenWeaponType, math.max(Math.floor(bagSpace / 3), 1));
            this.inventoryDirty = true;
        }

        this.setDirty();

        this.game.playerBarn.addEmote("emote_loot", this.__id, chosenWeaponType);
    }

    dropLoot(type: string, count = 1, useCountForAmmo?: boolean) {
        this.mobileDropTicker = 0.3;
        this.game.lootBarn.addLoot(type, this.pos, this.layer, count, {
            useCountForAmmo,
            pushSpeed: util.random(7.5, 11),
            dir: v2.neg(this.dir),
            source: "player",
        });
    }

    dropArmor(item: string): boolean {
        const armorDef = GameObjectDefs.typeToDef(item);
        if (armorDef.type != "chest" && armorDef.type != "helmet") return false;
        if (this[armorDef.type] !== item) return false;
        if (armorDef.noDrop) return false;

        if (armorDef.type == "helmet" && armorDef.role && this.role == armorDef.role) {
            this.removeRole();
        }

        if (armorDef.type == "helmet" && armorDef.perk && this.hasPerk(armorDef.perk)) {
            this.removePerk(armorDef.perk);
        }

        this.dropLoot(item, 1);
        this[armorDef.type] = "";
        this.setDirty();
        return true;
    }

    dropBackPackCopy(item: string): boolean {
        const armorDef = GameObjectDefs.typeToDef(item);
        if (armorDef.type != "backpack") return false;
        if (this[armorDef.type] !== item) return false;
        if (armorDef.level == 0) return false;

        this.dropLoot(item, 1);
        return true;
    }

    splitUpLoot(item: string, amount: number) {
        const dropCount = Math.floor(amount / 60);
        for (let i = 0; i < dropCount; i++) {
            this.dropLoot(item, 60);
        }
        if (amount % 60 !== 0) {
            this.dropLoot(item, amount % 60);
        }
    }

    dropItem(dropMsg: net.DropItemMsg): void {
        if (this.dead) return;
        if (this.game.map.perkMode && !this.role) return;

        const itemDef = GameObjectDefs.typeToDefSafe(dropMsg.item) as LootDef | undefined;
        if (!itemDef) return;

        dropMsg.weapIdx = math.clamp(dropMsg.weapIdx, 0, GameConfig.WeaponSlot.Count - 1);

        switch (itemDef.type) {
            case "chest":
            case "helmet": {
                this.dropArmor(dropMsg.item);
                break;
            }
            case "gun":
                if (this.weaponManager.canDropFlare(dropMsg.weapIdx)) {
                    this.weaponManager.dropGun(dropMsg.weapIdx);
                }
                break;
            case "melee":
                this.weaponManager.dropMelee();
                break;
            case "perk": {
                const perkSlotType = this.perks.find(
                    (p) => p.droppable && p.type === dropMsg.item,
                )?.type;
                if (perkSlotType && perkSlotType === dropMsg.item) {
                    this.dropLoot(dropMsg.item);
                    this.removePerk(dropMsg.item);
                    this.setDirty();
                }
                break;
            }
        }

        if (this.invManager.isValid(dropMsg.item)) {
            this.dropInventoryItem(dropMsg.item);
        }

        const reloading = this.isReloading();
        this.cancelAction();

        if (reloading && this.weapons[this.curWeapIdx].ammo === 0) {
            this.weaponManager.scheduledReload = true;
        }
    }

    dropInventoryItem(item: InventoryItem) {
        if (!this.invManager.has(item)) return;
        const inventoryCount = this.invManager.get(item);

        const itemDef = GameObjectDefs.typeToDef(item);
        switch (itemDef.type) {
            case "ammo": {
                let amountToDrop = math.max(1, Math.floor(inventoryCount / 2));

                if (itemDef.minStackSize && inventoryCount <= itemDef.minStackSize) {
                    amountToDrop = math.min(itemDef.minStackSize, inventoryCount);
                } else if (inventoryCount <= 5) {
                    amountToDrop = math.min(5, inventoryCount);
                }

                this.splitUpLoot(item, amountToDrop);
                this.invManager.take(item, amountToDrop);
                break;
            }
            case "scope": {
                this.dropLoot(item, 1);
                this.invManager.take(item, 1);
                break;
            }
            case "heal":
            case "boost": {
                let amountToDrop = math.max(1, Math.floor(inventoryCount / 2));

                this.invManager.take(item, amountToDrop);

                this.dropLoot(item, amountToDrop);
                break;
            }
            case "throwable": {
                if (this.weaponManager.cookingThrowable) break;

                const amountToDrop = Math.max(1, Math.floor(inventoryCount / 2));
                this.splitUpLoot(item, amountToDrop);

                this.invManager.take(item, amountToDrop);
                break;
            }
        }
    }

    setLoadout(loadout: net.JoinMsg["loadout"], useDefaultUnlocks?: boolean) {
        const defaltUnlocks = UnlockDefs.unlock_default.unlocks;
        /**
         * Checks if an item is present in the player's loadout
         */
        const isItemInLoadout = (item: string, category: string) => {
            if (useDefaultUnlocks && !defaltUnlocks.includes(item)) return false;

            const def = GameObjectDefs.typeToDefSafe(item);
            if (!def || def.type !== category) return false;

            return true;
        };

        if (
            isItemInLoadout(loadout.outfit, "outfit")
            && loadout.outfit !== "outfitBase"
        ) {
            this.setOutfit(loadout.outfit);
            this.loadout.outfit = this.outfit;
        }

        if (isItemInLoadout(loadout.melee, "melee") && loadout.melee != "fists") {
            this.weapons[GameConfig.WeaponSlot.Melee].type = loadout.melee;
        }

        if (isItemInLoadout(loadout.heal, "heal_effect")) {
            this.loadout.heal = loadout.heal;
        }
        if (isItemInLoadout(loadout.boost, "boost_effect")) {
            this.loadout.boost = loadout.boost;
        }

        const emotes = loadout.emotes;
        for (let i = 0; i < emotes.length; i++) {
            const emote = emotes[i];
            if (i > GameConfig.EmoteSlot.Count) break;

            if (emote === "" || !isItemInLoadout(emote, "emote")) {
                continue;
            }

            this.loadout.emotes[i] = emote;
        }
    }

    /**
     * Duel "god" kit: armor, backpack and scope, full ammo and heals, plus the
     * guns / melee / throwable that were picked. In a private match every field
     * comes from the party leader instead of the joining player.
     */
    /** private match "empty inventory": fists, no gear, nothing in the bag */
    emptyInventory() {
        this.helmet = "";
        this.chest = "";
        this.backpack = "backpack00";
        for (const item of Object.keys(GameConfig.bagSizes) as InventoryItem[]) {
            this.invManager.set(item, item === "1xscope" ? 1 : 0);
        }
        this.scope = "1xscope";
        this.zoom = this.scopeZoomRadius[this.scope];
        this.unlimitedThrowables = false;
        this.weaponManager.setWeapon(GameConfig.WeaponSlot.Primary, "", 0);
        this.weaponManager.setWeapon(GameConfig.WeaponSlot.Secondary, "", 0);
        this.weaponManager.setWeapon(GameConfig.WeaponSlot.Throwable, "", 0);
        this.weaponManager.setWeapon(GameConfig.WeaponSlot.Melee, "fists", 0);
        this.weaponManager.setCurWeapIndex(GameConfig.WeaponSlot.Melee);
    }

    applyGodLoadout(
        godLoadout:
            & Pick<net.JoinMsg["godLoadout"], "primary" | "secondary" | "throwable" | "melee">
            & Partial<PrivateLoadout>,
    ) {
        const kitId = godLoadout.kit;
        if (kitId && kitId !== "default" && KitDefs[kitId]) {
            this.applyKit(kitId);
            // champions keep perks and pick consumables up, so the kit panel's perks and
            // heals still apply to them; every other kit is only what its def says it is
            if (this.champ) {
                this.givePickedPerks(godLoadout);
                this.givePickedHeals(godLoadout);
            }
            return;
        }
        // a bot handed the leader's kit first, then the default one, drops that kit's skills
        if (this.kit !== "default") this.clearKit();
        // kit weapons stay in their kit
        godLoadout = { ...godLoadout };
        for (const slot of ["primary", "secondary", "melee"] as const) {
            if (isKitItem(godLoadout[slot] ?? "")) godLoadout[slot] = "";
        }
        // exact gear when picked ("" = none), else the armor tier
        const gear = (id: string | undefined, type: string) =>
            id !== undefined && (id === "" || GameObjectDefs.typeToDefSafe(id)?.type === type) ? id : undefined;
        const armor = godLoadout.armor ?? 3;
        this.helmet = gear(godLoadout.helmet, "helmet") ?? (armor > 0 ? `helmet0${armor}` : "");
        this.chest = gear(godLoadout.chest, "chest") ?? (armor > 0 ? `chest0${armor}` : "");
        this.backpack = gear(godLoadout.backpack, "backpack") || "backpack03";

        for (const item of Object.keys(GameConfig.bagSizes) as InventoryItem[]) {
            this.invManager.set(item, this.invManager.getMaxCapacity(item));
        }

        this.givePickedHeals(godLoadout);
        // the biggest scope in the bag, 8x at least
        this.scope = (["15xscope", "8xscope"] as const).find((s) => this.invManager.has(s)) ?? "8xscope";
        this.zoom = this.scopeZoomRadius[this.scope];

        const guns: Array<[number, string, string]> = [
            [GameConfig.WeaponSlot.Primary, godLoadout.primary, "m4a1"],
            [GameConfig.WeaponSlot.Secondary, godLoadout.secondary, "mp220"],
        ];
        for (const [slot, picked, fallback] of guns) {
            // "" = an empty slot (melee-only kits)
            if (picked === "") {
                this.weaponManager.setWeapon(slot, "", 0);
                continue;
            }
            const def = GameObjectDefs.typeToDefSafe(picked);
            const type = def?.type === "gun" ? picked : fallback;
            const gunDef = GameObjectDefs.typeToDef(type, "gun");
            this.weaponManager.setWeapon(slot, type, gunDef.maxClip);
        }

        // only throwables with an inventory slot; others (bomb_iron, mirv_mini...) have no bag size
        const isBagThrowable = (t: string) =>
            t in GameConfig.bagSizes && GameObjectDefs.typeToDefSafe(t)?.type === "throwable";
        const throwable = isBagThrowable(godLoadout.throwable) ? godLoadout.throwable : "frag";
        // only the picked throwables; the full bag would hand out every kind
        const carried = [
            throwable,
            ...(godLoadout.extraThrowables ?? []).filter(isBagThrowable),
        ];
        for (const item of Object.keys(GameConfig.bagSizes) as InventoryItem[]) {
            if (!carried.includes(item) && GameObjectDefs.typeToDefSafe(item)?.type === "throwable") {
                this.invManager.set(item, 0);
            }
        }
        this.unlimitedThrowables = !!godLoadout.throwablesUnlimited;
        if (godLoadout.throwableCount !== undefined) {
            for (const item of carried as InventoryItem[]) {
                this.invManager.set(item, math.min(godLoadout.throwableCount, this.invManager.getMaxCapacity(item)));
            }
        }
        this.weaponManager.setWeapon(GameConfig.WeaponSlot.Throwable, throwable, 0);

        // any melee weapon, no unlock needed (empty keeps the normal loadout melee)
        const meleeDef = GameObjectDefs.typeToDefSafe(godLoadout.melee);
        if (meleeDef?.type === "melee") {
            this.weaponManager.setWeapon(GameConfig.WeaponSlot.Melee, godLoadout.melee, 0);
        }

        this.givePickedPerks(godLoadout);

        // the main pick stays in hand unless there are none of it
        if (!this.invManager.has(throwable as InventoryItem)) this.weaponManager.showNextThrowable();
        this.recalculateScale();
        this.setDirty();
    }

    emoteFromMsg(msg: net.EmoteMsg) {
        if (this.dead) return;
        if (this.game.map.perkMode && !this.role) return;
        if (this.emoteHardTicker > 0) return;

        const emoteMsg = msg as net.EmoteMsg;

        const emoteIdx = this.loadout.emotes.indexOf(emoteMsg.type);
        const emoteDef = GameObjectDefs.typeToDefSafe(emoteMsg.type);
        if (!emoteDef) return;

        if (emoteMsg.isPing) {
            if (this.debug.teleportToPings) {
                v2.set(this.pos, msg.pos);
                this.setPartDirty();
                this.game.grid.updateObject(this);
            }

            if (emoteDef.type !== "ping") {
                return;
            }
            if (emoteDef.mapEvent) {
                return;
            }

            this.game.playerBarn.addMapPing(emoteMsg.type, emoteMsg.pos, this.__id);
        } else {
            if (emoteDef.type !== "emote") {
                return;
            }

            if (!emoteDef.teamOnly && (emoteIdx < 0 || emoteIdx > 3)) {
                return;
            }

            if (emoteDef.teamOnly) {
                this.game.playerBarn.addEmote(emoteMsg.type, this.__id);
            } else {
                this.emoteFromSlot(emoteIdx);
            }
        }

        this.emoteCounter++;
        if (this.emoteCounter >= GameConfig.player.emoteThreshold) {
            this.emoteHardTicker = this.emoteHardTicker > 0
                ? this.emoteHardTicker
                : GameConfig.player.emoteHardCooldown * 1.5;
        }
    }

    processEditMsg(msg: net.EditMsg) {
        if (!Config.debug.allowEditMsg) return;

        if (msg.loadNewMap) {
            this.game.map.regenerate(msg.newMapSeed);
        }

        this.debug.zoomEnabled = msg.zoomEnabled;

        this.debug.zoom = msg.zoom;

        this.debug.speedEnabled = msg.speedEnabled;
        this.debug.speed = math.clamp(msg.speed, 1, 10000);

        this.game.debugSpeedMulti = msg.gameSpeedEnabled ? msg.gameSpeed : 1;

        // only accept ground or underground
        if (msg.toggleLayer) {
            this.layer = this.layer > 0 ? 0 : 1;
            this.setDirty();
        }

        this.debug.noClip = msg.noClip;
        this.debug.teleportToPings = msg.teleportToPings;
        this.debug.godMode = msg.godMode;

        this.debug.moveObjMode.enabled = msg.moveObjs;

        this.game.preventStart = msg.preventGameStart;

        if (msg.spawnLootType) {
            const def = GameObjectDefs.typeToDefSafe(msg.spawnLootType);
            if (def && "lootImg" in def) {
                let count = 1;
                if (this.invManager.isValid(msg.spawnLootType)) {
                    count = this.invManager.getMaxCapacity(msg.spawnLootType);
                }
                this.game.lootBarn.addLoot(
                    msg.spawnLootType,
                    this.pos,
                    this.layer,
                    count,
                    {
                        useCountForAmmo: false,
                        pushSpeed: 0,
                    },
                );
            }
        }

        if (msg.promoteToRole) {
            if (msg.promoteToRoleType) {
                const def = GameObjectDefs.typeToDefSafe(msg.promoteToRoleType);
                if (def?.type === "role") {
                    this.promoteToRole(msg.promoteToRoleType);
                }
            } else if (this.role) {
                this.removeRole();
            }
        }

        if (msg.godMode) {
            this.health = 100;
            this.setDirty();
        }
    }

    doAction(
        actionItem: string,
        actionType: number,
        duration: number,
        targetId: number = 0,
    ) {
        if (this.actionDirty) {
            // action already in progress
            return;
        }

        this.action.targetId = targetId;
        this.action.duration = duration;
        this.action.time = 0;

        this.actionDirty = true;
        this.actionItem = actionItem;
        this.actionType = actionType;
        this.actionSeq++;
        this.setDirty();
    }

    cancelAction(): void {
        if (this.actionType === GameConfig.Action.None) {
            return;
        }

        // If player is reviving a player and this is called, cancel their action
        if (this.playerBeingRevived) {
            const revivedPlayer = this.playerBeingRevived;
            this.playerBeingRevived = undefined;
            if (revivedPlayer == this.revivedBy) {
                this.revivedBy = undefined;
            } else {
                revivedPlayer.revivedBy = undefined;
                revivedPlayer.cancelAction();
                this.cancelAnim();
            }
        }

        // If player is being revived and this is called, cancel the reviver's action
        if (this.revivedBy) {
            const revivingPlayer = this.revivedBy;
            this.revivedBy = undefined;
            if (revivingPlayer.playerBeingRevived) {
                revivingPlayer.playerBeingRevived = undefined;
                revivingPlayer.cancelAction();
                revivingPlayer.cancelAnim();
            }
        }

        this.action.duration = 0;
        this.action.targetId = 0;
        this.action.time = 0;

        this.actionItem = "";
        this.actionType = GameConfig.Action.None;
        this.actionSeq++;
        this.actionDirty = false;
        this.setDirty();
    }

    freeze(type: string, frozenOri: number, duration: number): void {
        this.frozenTicker = duration;
        this.frozen = true;
        this.frozenType = type;
        this.frozenOri = frozenOri;
        this.setDirty();
    }

    initLastBreath(): void {
        this.game.bulletBarn.fireBullet({
            dir: this.dir,
            pos: this.pos,
            bulletType: "bullet_invis",
            gameSourceType: "bugle",
            layer: this.layer,
            damageMult: 1,
            damageType: GameConfig.DamageType.Player,
            playerId: this.__id,
            shotAlt: true,
            shotFx: true,
        });

        const affectedPlayers = this.game.modeManager.getNearbyAlivePlayersContext(
            this,
            PerkProperties.final_bugle.effectRange,
        );

        for (const player of affectedPlayers) {
            player.lastBreathActive = true;
            player._lastBreathTicker = 5;

            player.giveHaste(GameConfig.HasteType.Inspire, PerkProperties.final_bugle.hasteDuration);
            if (player.teamId == GameConfig.FactionTeam.Red && player.__id != this.__id) {
                this.game.playerBarn.addEmote("emote_bugle_final_red", player.__id);
            }
            if (player.teamId == GameConfig.FactionTeam.Blue && player.__id != this.__id) {
                this.game.playerBarn.addEmote("emote_bugle_final_blue", player.__id);
            }
            player.recalculateScale();
        }
    }

    playBugle(): void {
        this.bugleTickerActive = true;
        this._bugleTicker = 8;

        const affectedPlayers = this.game.modeManager.getNearbyAlivePlayersContext(
            this,
            30,
        );

        for (const player of affectedPlayers) {
            player.giveHaste(GameConfig.HasteType.Inspire, 3);
            if (player.teamId == GameConfig.FactionTeam.Red && player.__id != this.__id) {
                this.game.playerBarn.addEmote("emote_bugle_inspiration_red", player.__id);
            }
            if (player.teamId == GameConfig.FactionTeam.Blue && player.__id != this.__id) {
                this.game.playerBarn.addEmote(
                    "emote_bugle_inspiration_blue",
                    player.__id,
                );
            }
        }
    }

    incrementFat() {
        this.fatTicker = 2.5;
        if (this.fatModifier > 0.6) return;
        this.fatModifier += 0.06;
        this.recalculateScale();
    }

    decrementViewDistance() {
        this.viewDistModifier += 1.5;
        this.viewDistModifier = math.min(this.viewDistModifier, 32);
        this.viewDistTicker = 2.5;
        this.zoomDirty = true;
    }

    giveHaste(type: HasteType, duration: number): void {
        this.hasteType = type;
        this.hasteSeq++;
        this._hasteTicker = duration;
        this.setDirty();
    }

    playAnim(type: Anim, duration: number): void {
        this.animType = type;
        this.animSeq++;
        this.setDirty();
        this._animTicker = duration;
    }

    cancelAnim(): void {
        this.animType = GameConfig.Anim.None;
        this.animSeq++;
        this._animTicker = 0;
        this.setDirty();
    }

    emoteFromSlot(slot: EmoteSlot) {
        let emote = this.loadout.emotes[slot];

        if (!emote) return;

        if (this.game.map.potatoMode) {
            emote = "emote_potato";
        }

        if (this.game.map.potatoMode && this.game.map.factionMode) {
            if (this.teamId === GameConfig.FactionTeam.Red) {
                emote = "emote_tomato";
            } else if (this.teamId === GameConfig.FactionTeam.Blue) {
                emote = "emote_potato";
            }
        }

        this.game.playerBarn.addEmote(emote, this.__id);
    }

    recalculateScale() {
        let scale = 1;
        for (let i = 0; i < this.perks.length; i++) {
            const perk = this.perks[i].type;
            const perkProps = PerkProperties[perk as keyof typeof PerkProperties];
            if (typeof perkProps === "object" && "scale" in perkProps) {
                scale += perkProps.scale as number;
            }
        }

        if (this.lastBreathActive) {
            scale += PerkProperties.final_bugle.scaleOnDeath;
        }

        scale += this.fatModifier;

        scale = math.clamp(
            scale,
            net.Constants.PlayerMinScale,
            net.Constants.PlayerMaxScale,
        );

        if (scale === this.scale) return;

        this.scale = scale;

        this.collider.rad = this.rad;

        this.bounds = collider.createAabbExtents(
            v2.create(0, 0),
            v2.create(
                GameConfig.player.maxVisualRadius * this.scale,
                GameConfig.player.maxVisualRadius * this.scale,
            ),
        );

        this.setDirty();
    }

    recalculateMinBoost() {
        // a League champion always runs on full adrenaline, like having mana to spend
        this.minBoost = this.champ ? 100 : 0;
        for (let i = 0; i < this.perks.length; i++) {
            const perk = this.perks[i].type;
            const perkProps = PerkProperties[perk as keyof typeof PerkProperties];
            if (typeof perkProps === "object" && "minBoost" in perkProps) {
                this.minBoost = math.max(perkProps.minBoost as number, this.minBoost);
            }
        }
    }

    /** the kit panel's picked perks, plus every good one when the leader asked for them */
    private givePickedPerks(godLoadout: Partial<PrivateLoadout>) {
        for (const perk of [...(godLoadout.perks ?? []), ...(godLoadout.allGoodPerks ? goodPerks : [])]) {
            // past this the full update overflows its buffer
            if (this.perks.length >= net.Constants.MaxPerks - 1) break;
            if (GameObjectDefs.typeToDefSafe(perk)?.type === "perk" && !this.hasPerk(perk)) this.addPerk(perk, false);
        }
    }

    /** a private match leader can hand out fewer heals than a full bag */
    private givePickedHeals(godLoadout: Partial<PrivateLoadout>) {
        for (const item of ["bandage", "healthkit", "soda", "painkiller"] as const) {
            const count = godLoadout[item];
            if (count === undefined) continue;
            this.invManager.set(item, math.min(count, this.invManager.getMaxCapacity(item)));
        }
    }

    /** turns this player into a kit character: its stats, gear and locked weapons, nothing else */
    applyKit(kitId: string) {
        const kit = KitDefs[kitId];
        this.kit = kitId;
        this.lockedKit = true;
        this.maxHealth = kit.health;
        this.health = kit.health;
        this.helmet = kit.helmet;
        this.chest = kit.chest;
        this.backpack = kit.backpack ?? "backpack00";
        this.outfit = kit.outfit;
        for (const item of Object.keys(this.invManager.items) as InventoryItem[]) this.invManager.set(item, 0);
        this.inventoryDirty = true;
        // champions keep their perks; every other kit drops them
        if (!ChampionDefs[kitId]) {
            for (let i = this.perks.length - 1; i >= 0; i--) this.removePerk(this.perks[i].type);
        }
        this.weaponManager.setWeapon(GameConfig.WeaponSlot.Primary, kit.primary ?? "", 0);
        this.weaponManager.setWeapon(GameConfig.WeaponSlot.Secondary, kit.secondary ?? "", 0);
        this.weaponManager.setWeapon(GameConfig.WeaponSlot.Throwable, "", 0);
        this.weaponManager.setWeapon(GameConfig.WeaponSlot.Melee, kit.melee, 0);
        for (const slot of [GameConfig.WeaponSlot.Primary, GameConfig.WeaponSlot.Secondary]) {
            const type = this.weapons[slot].type;
            if (type) this.weapons[slot].ammo = GameObjectDefs.typeToDef(type, "gun").maxClip;
        }
        this.weaponManager.setCurWeapIndex(
            kit.primary ? GameConfig.WeaponSlot.Primary : GameConfig.WeaponSlot.Melee,
            true,
        );
        this.maxShield = kit.shield ?? 0;
        this.shield = this.maxShield;
        this.shieldDirty = true;
        this.maxEnergy = kit.energy?.max ?? 0;
        this.energy = this.maxEnergy;
        this.energyTick = 0;
        this.sustainHealTime = 0;
        this.sustainShieldTime = 0;
        this.energyDirty = true;
        if (kit.fullBoost) this.boost = 100;
        this.endSentryDash();
        this.endUltronCombo();
        this.endIronCombo();
        this.ironSpin = undefined;
        this.wizardWave = undefined;
        this.wizardShards = [];
        this.daggerMinions = [];
        this.kitEnhanceTime = 0;
        this.sentryReviveUsed = false;
        this.cleanseCooldown = 0;
        this.resetItemTriggers();
        this.champ = ChampionDefs[kitId] ? new Champion(this, kitId) : undefined;
        // a champion's adrenaline is pinned full, so recheck the floor now it is one
        this.recalculateMinBoost();
        if (this.champ) this.boost = 100;
        // kits zoom out like a 15x scope
        this.invManager.set("15xscope", 1);
        this.scope = "15xscope";
        this.zoom = this.scopeZoomRadius[this.scope];
        this.weapsDirty = true;
        this.setDirty();
    }

    /** back to a normal player: no kit stats, shield, energy or locked weapons */
    clearKit() {
        this.kit = "default";
        this.champ = undefined;
        this.recalculateMinBoost();
        this.lockedKit = false;
        this.maxHealth = GameConfig.player.health;
        this.health = this.maxHealth;
        this.maxShield = 0;
        this.shield = 0;
        this.shieldDirty = true;
        this.maxEnergy = 0;
        this.energy = 0;
        this.energyTick = 0;
        this.sustainHealTime = 0;
        this.sustainShieldTime = 0;
        this.energyDirty = true;
        this.kitEnhanceTime = 0;
        this.endClawCombo();
        this.spiderCombo = undefined;
        this.setMarkTarget(undefined);
        this.resetItemTriggers();
        this.outfit = this.loadout.outfit;
        for (
            const slot of [GameConfig.WeaponSlot.Primary, GameConfig.WeaponSlot.Secondary, GameConfig.WeaponSlot.Melee]
        ) {
            if (isKitItem(this.weapons[slot].type)) {
                this.weaponManager.setWeapon(slot, slot === GameConfig.WeaponSlot.Melee ? "fists" : "", 0);
            }
        }
        this.setDirty();
    }

    /** a kit's per-second effects: regen, full adrenaline, energy */
    updateKit(dt: number) {
        const kit = KitDefs[this.kit];
        if (this.minionOwner) this.updateMinion(dt);
        if (this.ultronCombo) this.updateUltronCombo(dt);
        if (this.ironCombo) this.updateIronCombo(dt);
        if (this.ironSpin) this.updateIronSpin(dt);
        if (this.wizardWave) this.updateWizardWave(dt);
        if (this.wizardShards.length) this.updateWizardShards(dt);
        if (this.kit === "default" || !kit || this.dead) return;
        if (kit.fullBoost && this.boost < 100) this.boost = 100;
        this.calmTime += dt;
        // out of combat the calm rate replaces the base regen (and Iron Man's energy healing)
        const calmHealing = !!kit.calmRegen && this.calmTime >= kit.calmRegen.after && this.health < this.maxHealth;
        if ((kit.regen || calmHealing) && this.health < this.maxHealth) {
            let rate = this.health < (kit.lowHealth ?? 0) ? (kit.regen ?? 0) * 2 : (kit.regen ?? 0);
            if (calmHealing) rate = kit.calmRegen!.rate;
            this.health = math.min(this.health + rate * dt, this.maxHealth);
        }
        const e = kit.energy;
        if (e) {
            const before = Math.round(this.energy);
            // healing (or, at full health, shield) runs smoothly while there is energy; the time it ran is
            // billed in one lump below
            if (this.energy > 0) {
                if (e.heal > 0 && this.health < this.maxHealth && !calmHealing) {
                    this.health = math.min(this.health + e.heal * dt, this.maxHealth);
                    this.sustainHealTime += dt;
                } else if (e.shieldRegen > 0 && this.shield < this.maxShield) {
                    this.shield = math.min(this.shield + e.shieldRegen * dt, this.maxShield);
                    this.shieldDirty = true;
                    this.sustainShieldTime += dt;
                }
            }
            // energy is gained in 1 s steps, and the healing/shield cost is charged half a second after each
            // one so the bar shows the gain and then the cost instead of the gain hiding it
            const eps = 1e-6;
            const prevTick = this.energyTick;
            this.energyTick += dt;
            if (prevTick < 0.5 - eps && this.energyTick >= 0.5 - eps) {
                const bill = e.healCost * this.sustainHealTime + e.shieldCost * this.sustainShieldTime;
                this.energy = Math.max(0, this.energy - bill);
                this.sustainHealTime = 0;
                this.sustainShieldTime = 0;
            }
            if (this.energyTick >= 1 - eps) {
                this.energyTick = Math.max(0, this.energyTick - 1);
                this.energy = math.min(this.energy + e.perSecond, e.max);
            }
            if (Math.round(this.energy) !== before) this.energyDirty = true;
        }
        // ability kits show their cooldowns, which change every tick (and once more when they hit 0)
        const cooling = this.abilityCooldowns.some((c) => c > 0) || this.champCooldowns.some((c) => c > 0);
        if (cooling || this.wasCooling) this.energyDirty = true;
        this.wasCooling = cooling;
        if (this.potionTime > 0) {
            this.potionTime = Math.max(this.potionTime - dt, 0);
            this.health = math.min(this.health + SummonerPotions.regen * dt, this.maxHealth);
            if (this.potionTime === 0) this.setDirty();
        }
        if (kit.regenPulse) {
            this.regenPulseTimer += dt;
            if (this.regenPulseTimer >= kit.regenPulse.every) {
                this.regenPulseTimer -= kit.regenPulse.every;
                this.health = math.min(this.health + kit.regenPulse.amount, this.maxHealth);
            }
        }
        if (this.dodgeTime > 0) {
            this.dodgeTime = Math.max(0, this.dodgeTime - dt);
            if (this.dodgeTime === 0) this.setDirty();
        }
        if (kit.mark) this.updateMark(kit.mark);
        if (kit.autoFire) this.updateAutoFire(dt, kit.autoFire);
        if (kit.daggers) this.updateDaggers(dt, kit.daggers);
        if (kit.whips) this.updateWhips(dt, kit.whips);
        if (kit.aura) this.updateAura(dt, kit.aura);
        if (kit.cleanse) this.updateCleanse(dt, kit.cleanse);
        if (kit.items?.length) this.updateItemTriggers(dt, kit);
    }

    /** every item effect off and every cooldown ready, for a fresh kit (max HP and shield are set by the caller) */
    resetItemTriggers() {
        this.itemCooldowns = {};
        this.itemMaxHealthMult = 0;
        this.itemMaxHealthTime = 0;
        this.wallReduction = 0;
        this.wallTime = 0;
        this.wallRule = undefined;
        this.itemShield = 0;
        this.itemShieldTime = 0;
    }

    /** max HP from the kit's build plus whatever an item adds for now; health can't stay above it */
    updateKitMaxHealth(kit: (typeof KitDefs)[string]) {
        const base = kit.healthBase ?? kit.health;
        this.maxHealth = Math.round(base * (1 + (kit.healthMult ?? 0) + this.itemMaxHealthMult));
        this.health = Math.min(this._health, this.maxHealth);
        this.healthDirty = true;
    }

    /** Rescue's shield is over: what it granted and hasn't been spent goes, and the bar goes back to the kit's own */
    endItemShield(kit: (typeof KitDefs)[string]) {
        this.shield = Math.max(0, this.shield - this.itemShield);
        this.itemShield = 0;
        this.itemShieldTime = 0;
        this.maxShield = kit.shield ?? 0;
        this.shieldDirty = true;
        this.energyDirty = true;
        this.setDirty();
    }

    /** the kit's items that fire by themselves when health is low: Conquest and Rescue */
    updateItemTriggers(dt: number, kit: (typeof KitDefs)[string]) {
        for (const id of Object.keys(this.itemCooldowns)) {
            this.itemCooldowns[id] = Math.max(0, this.itemCooldowns[id] - dt);
        }
        if (this.itemMaxHealthTime > 0) {
            this.itemMaxHealthTime -= dt;
            if (this.itemMaxHealthTime <= 0) {
                this.itemMaxHealthMult = 0;
                this.itemMaxHealthTime = 0;
                this.updateKitMaxHealth(kit);
                this.setDirty();
            }
        }
        if (this.wallTime > 0) {
            this.wallTime -= dt;
            if (this.wallTime <= 0) {
                this.wallTime = 0;
                this.wallReduction = 0;
                this.wallRule = undefined;
            }
        }
        if (this.itemShieldTime > 0) {
            this.itemShieldTime -= dt;
            if (this.itemShieldTime <= 0) this.endItemShield(kit);
        }

        for (const id of kit.items ?? []) {
            const t = ItemDefs[id]?.trigger;
            if (!t || (this.itemCooldowns[id] ?? 0) > 0 || this.health >= this.maxHealth * t.below) continue;
            this.itemCooldowns[id] = t.cooldown;
            // max HP first, so the heal and the shield are shares of the bigger number
            if (t.maxHealthMult) {
                this.itemMaxHealthMult = t.maxHealthMult;
                this.itemMaxHealthTime = t.duration;
                this.updateKitMaxHealth(kit);
            }
            if (t.heal) this.health = Math.min(this._health + t.heal * this.maxHealth, this.maxHealth);
            if (t.shield) {
                const granted = t.shield * this.maxHealth;
                this.shield += granted;
                this.itemShield += granted;
                this.itemShieldTime = t.duration;
                // the shield bar is full when it comes up
                this.maxShield = Math.max(this.maxShield, this.shield);
                this.shieldDirty = true;
                this.energyDirty = true;
            }
            if (t.wall) {
                this.wallReduction = t.wall.start;
                this.wallTime = t.duration;
                this.wallRule = { perHit: t.wall.perHit, floor: t.wall.floor };
            }
            this.setDirty();
        }
    }

    /** Sentry: any debuff on him comes off at once, then the next removal waits out the cooldown */
    updateCleanse(dt: number, c: NonNullable<(typeof KitDefs)[string]["cleanse"]>) {
        this.cleanseCooldown = Math.max(0, this.cleanseCooldown - dt);
        if (this.cleanseCooldown > 0 || !this.hasDebuff) return;
        this.cleanseCooldown = c.cooldown;
        this.burnDuration = 0;
        this.bleedDotDuration = 0;
        this.poisonDuration = 0;
        this.charmDuration = 0;
        this.whipMarks = [0, 0, 0];
        this.potionTime = 0;
        this.stunTime = 0;
        const d = this.debuffs;
        d.root =
            d.slow =
            d.silence =
            d.airborne =
                0;
        this.restorePerks();
        this.setDirty();
    }

    /** Spider-Man: a web ball at the nearest enemy in range, every 1/rate seconds */
    updateAutoFire(dt: number, a: NonNullable<(typeof KitDefs)[string]["autoFire"]>) {
        this.autoFireTimer -= dt;
        if (this.autoFireTimer > 0) return;
        const near = this.enemiesWithin(a.range);
        if (!near.length) return;
        // carry the leftover so the rate holds at the 0.1 s test tick too
        this.autoFireTimer = Math.max(this.autoFireTimer + 1 / (this.dodgeTime > 0 ? a.dodgeRate : a.rate), 0);
        const target = near.reduce((x, y) =>
            v2.length(v2.sub(x.pos, this.pos)) < v2.length(v2.sub(y.pos, this.pos)) ? x : y
        );
        this.game.bulletBarn.fireBullet(
            {
                playerId: this.__id,
                bulletType: a.bullet,
                gameSourceType: "kit_spider_auto",
                damageType: GameConfig.DamageType.Player,
                pos: v2.copy(this.pos),
                dir: v2.normalizeSafe(v2.sub(target.pos, this.pos), this.dir),
                layer: this.layer,
                damageMult: 1,
                // the shot sound of kit_spider_auto
                shotFx: true,
                reflectCount: 0,
            } as Parameters<typeof this.game.bulletBarn.fireBullet>[0],
        );
    }

    /** Summoner: the next of his whips at the nearest enemy in range, every 1/rate seconds */
    updateWhips(dt: number, w: NonNullable<(typeof KitDefs)[string]["whips"]>) {
        this.whipTimer -= dt;
        if (this.whipTimer > 0) return;
        const near = this.enemiesWithin(w.range);
        if (!near.length) return;
        // carry the leftover so the rate holds at the 0.1 s test tick too
        this.whipTimer = Math.max(this.whipTimer + 1 / w.rate, 0);
        const target = near.reduce((x, y) =>
            v2.length(v2.sub(x.pos, this.pos)) < v2.length(v2.sub(y.pos, this.pos)) ? x : y
        );
        const gun = w.list[this.whipIdx % w.list.length].gun;
        this.whipIdx = (this.whipIdx + 1) % w.list.length;
        this.game.bulletBarn.fireBullet(
            {
                playerId: this.__id,
                bulletType: `bullet_${gun}`,
                gameSourceType: gun,
                damageType: GameConfig.DamageType.Player,
                pos: v2.copy(this.pos),
                dir: v2.normalizeSafe(v2.sub(target.pos, this.pos), this.dir),
                layer: this.layer,
                damageMult: 1,
                shotFx: true,
                reflectCount: 0,
            } as Parameters<typeof this.game.bulletBarn.fireBullet>[0],
        );
    }

    enemiesWithin(rad: number): Player[] {
        return this.game.playerBarn.livingPlayers.filter(
            (p) =>
                p !== this && !p.dead && !p.untargetable && p.teamId !== this.teamId
                && util.sameLayer(p.layer, this.layer)
                && v2.length(v2.sub(p.pos, this.pos)) <= rad,
        );
    }

    /** Wolverine: the nearest enemy within range is marked; during a Claw Combo it stays on whoever it is hitting */
    updateMark(m: NonNullable<(typeof KitDefs)[string]["mark"]>) {
        const locked = this.clawCombo?.target ?? this.spiderCombo?.target ?? this.ironCombo?.target;
        if (locked) {
            this.setMarkTarget(locked);
            return;
        }
        const near = this.enemiesWithin(m.range);
        this.setMarkTarget(
            near.length
                ? near.reduce((a, b) => (v2.distance(a.pos, this.pos) <= v2.distance(b.pos, this.pos) ? a : b))
                : undefined,
        );
    }

    setMarkTarget(next?: Player) {
        if (next === this.markTarget) return;
        if (this.markTarget) {
            this.markTarget.markedBy.delete(this);
            this.markTarget.setDirty();
        }
        this.markTarget = next;
        if (next) {
            next.markedBy.add(this);
            next.setDirty();
        }
    }

    /** the Claw Combo needs a marked enemy who can be hit, and only one runs at a time */
    canStartClawCombo() {
        const t = this.markTarget;
        return !this.dead && !this.clawCombo && !!t && !t.dead && !t.untargetable;
    }

    /** `gun` is kit_wolverine_combo (ten claws) or kit_wolverine_dash (one claw, from below) */
    startClawCombo(gun: string) {
        const target = this.markTarget!;
        const dash = gun === "kit_wolverine_dash";
        this.clawCombo = {
            target,
            gun,
            offsets: dash ? WolverineDash.offsets : WolverineCombo.offsets,
            damage: dash ? WolverineDash.damage : WolverineCombo.damage,
            step: 0,
            t: 0,
            start: v2.copy(this.pos),
            dir: v2.create(0, -1),
            end: v2.copy(this.pos),
            shotHit: new Set(),
            grabbed: [],
        };
        this.webPull = undefined;
        this.beginClawShot();
        this.setDirty();
    }

    private fireClawBullet(c: NonNullable<Player["clawCombo"]>, bulletType: string, pos: Vec2, extra: object) {
        return this.game.bulletBarn.fireBullet(
            {
                playerId: this.__id,
                bulletType,
                gameSourceType: c.gun,
                damageType: GameConfig.DamageType.Player,
                pos: v2.copy(pos),
                dir: c.dir,
                layer: c.target.layer,
                damageMult: 1,
                shotFx: false,
                reflectCount: 0,
                ...extra,
            } as Parameters<typeof this.game.bulletBarn.fireBullet>[0],
        );
    }

    /**
     * The claw at `step`: it starts off to one side of the mark and is aimed straight through it, so it hits
     * and drags the mark to its far end. Its shot sound alternates between the two the gun has (shotAlt)
     */
    beginClawShot() {
        const c = this.clawCombo!;
        const o = c.offsets[c.step];
        c.dir = v2.normalizeSafe(v2.create(-o.x, -o.y), v2.create(0, -1));
        c.start = v2.sub(c.target.pos, v2.mul(c.dir, WolverineCombo.startDist));
        c.end = v2.add(c.start, v2.mul(c.dir, WolverineCombo.distance));
        c.t = 0;
        c.shotHit = new Set();
        c.grabbed = [];
        this.fireClawBullet(c, "bullet_kit_wolverine_claw", c.start, { shotFx: true, shotAlt: c.step % 2 === 1 });
    }

    /** the claw has flown its length: it stays where it ended for a moment (for show, it hurts nobody) */
    leaveClaw() {
        const c = this.clawCombo!;
        this.fireClawBullet(c, "bullet_kit_wolverine_claw_rest", c.end, {
            clipDistance: true,
            distance: WolverineCombo.clawSpeed * WolverineCombo.linger,
        });
    }

    /** a claw lands: the skill's damage and its bleed (via damage()), and the mark is stunned for the rest of it */
    clawHit(c: NonNullable<Player["clawCombo"]>, p: Player, stunFor: number) {
        p.damage({
            amount: c.damage,
            damageType: GameConfig.DamageType.Player,
            gameSourceType: c.gun,
            weaponSourceType: c.gun,
            source: this,
            dir: c.dir,
        });
        if (stunFor > 0) {
            p.stunTime = Math.max(p.stunTime, stunFor);
            p.webPull = undefined;
            p.setDirty();
        }
    }

    /** an enemy a Claw Combo can hit: alive, not hidden or dodging, on the same layer as the mark */
    private clawVictims(c: NonNullable<Player["clawCombo"]>): Player[] {
        return this.game.playerBarn.livingPlayers.filter(
            (p) =>
                p !== this && !p.dead && !p.untargetable && p.teamId !== this.teamId
                && util.sameLayer(p.layer, c.target.layer),
        );
    }

    /**
     * Every tick of a Claw Combo: the claw in flight hits everyone its path crosses, once, and drags them along
     * to its far end (they are only ever pushed forward, so the mark stays put until the claw gets to it); and
     * when a claw has flown its length it stays a moment and the next one is called down around wherever the
     * mark now is. If the mark dies the combo is over
     */
    updateClawCombo(dt: number) {
        const c = this.clawCombo;
        if (!c) return;
        if (this.dead || c.target.dead) {
            this.endClawCombo();
            return;
        }
        const prevProg = Math.min(c.t * WolverineCombo.speed, WolverineCombo.distance);
        c.t += dt;
        const prog = Math.min(c.t * WolverineCombo.speed, WolverineCombo.distance);
        const before = v2.add(c.start, v2.mul(c.dir, prevProg));
        const head = v2.add(c.start, v2.mul(c.dir, prog));
        const left = Math.max((c.offsets.length - c.step) * WolverineComboStep - c.t, 0);

        const victims = this.clawVictims(c);
        for (const p of victims) {
            if (c.shotHit.has(p.__id)) continue;
            if (math.distToSegmentSq(p.pos, before, head) > (WolverineCombo.hitRadius + p.rad) ** 2) continue;
            c.shotHit.add(p.__id);
            this.clawHit(c, p, left + 0.15);
            c.grabbed.push(p);
        }

        // drag: whoever the claw has hit is reeled in to just ahead of it, and walls stop them
        const pull = WolverineCombo.speed * 2 * dt;
        c.grabbed = c.grabbed.filter((p) => {
            if (p.dead) return false;
            const hold = v2.add(head, v2.mul(c.dir, this.rad + p.rad + 0.3));
            const to = v2.sub(hold, p.pos);
            const dist = v2.length(to);
            if (dist > 0.001 && v2.dot(to, c.dir) > 0) {
                v2.set(p.pos, v2.add(p.pos, v2.mul(to, Math.min(dist, pull) / dist)));
            }
            this.pushOutOfWalls(p);
            this.game.map.clampToMapBounds(p.pos, p.rad);
            p.mapIndicator?.updatePosition(p.pos);
            p.setPartDirty();
            return true;
        });

        if (c.t >= WolverineComboStep - 1e-6) {
            this.leaveClaw();
            if (c.step >= c.offsets.length - 1) {
                this.endClawCombo();
                return;
            }
            c.step++;
            this.beginClawShot();
        }
    }

    private pushOutOfWalls(p: Player) {
        const objs = this.game.grid.intersectCollider(collider.createCircle(p.pos, p.rad + 1));
        for (const obj of objs) {
            if (obj.__type !== ObjectType.Obstacle || !obj.collidable || obj.dead) continue;
            if (!util.sameLayer(obj.layer, p.layer)) continue;
            const hit = collider.intersectCircle(obj.collider, p.pos, p.rad);
            if (hit) v2.set(p.pos, v2.add(p.pos, v2.mul(hit.dir, hit.pen + 0.001)));
        }
    }

    /** the combo is over (or its mark died, or he did): he comes out at the far end of the last claw */
    endClawCombo() {
        const c = this.clawCombo;
        if (!c) return;
        this.clawCombo = undefined;
        if (!this.dead) {
            const to = v2.copy(c.end);
            this.game.map.clampToMapBounds(to, this.rad);
            v2.set(this.pos, to);
            this.pushOutOfWalls(this);
            v2.set(this.posOld, this.pos);
            this.mapIndicator?.updatePosition(this.pos);
            this.setPartDirty();
            this.game.grid.updateObject(this);
        }
        this.setDirty();
    }

    /** the Portal Combo needs a marked enemy who can be hit, and Spider-Man can't be in another combo */
    canStartSpiderCombo() {
        const t = this.markTarget;
        return !this.dead && !this.spiderCombo && !this.clawCombo && !!t && !t.dead && !t.untargetable;
    }

    /** the mark is webbed up and stunned for the whole combo, and the first portal opens around it */
    startSpiderCombo() {
        const target = this.markTarget!;
        this.spiderCombo = {
            target,
            step: 0,
            t: 0,
            portal: v2.copy(target.pos),
            dir: v2.create(1, 0),
            dashing: false,
            entered: false,
            dashT: 0,
            hit: new Set(),
        };
        this.webPull = undefined;
        target.stunTime = Math.max(target.stunTime, SpiderCombo.stun);
        target.webStunTime = SpiderCombo.stun;
        target.webPull = undefined;
        target.setDirty();
        this.beginSpiderPortal();
        this.setDirty();
    }

    private fireSpiderBullet(bulletType: string, pos: Vec2, dir: Vec2, extra: object) {
        const c = this.spiderCombo!;
        return this.game.bulletBarn.fireBullet(
            {
                playerId: this.__id,
                bulletType,
                gameSourceType: "kit_spider_web",
                damageType: GameConfig.DamageType.Player,
                pos: v2.copy(pos),
                dir,
                layer: c.target.layer,
                damageMult: 1,
                shotFx: false,
                reflectCount: 0,
                ...extra,
            } as Parameters<typeof this.game.bulletBarn.fireBullet>[0],
        );
    }

    /** the portal at `step` opens beside the mark; it is only the picture, and goes away by itself */
    private beginSpiderPortal() {
        const c = this.spiderCombo!;
        const o = SpiderCombo.offsets[c.step];
        c.dir = v2.normalizeSafe(v2.create(-o.x, -o.y), v2.create(-1, 0));
        c.portal = v2.add(c.target.pos, v2.mul(v2.create(o.x, o.y), SpiderCombo.startDist));
        this.game.map.clampToMapBounds(c.portal, this.rad);
        c.t = 0;
        c.entered = false;
        c.dashing = false;
        c.dashT = 0;
        c.hit = new Set();
        this.fireSpiderBullet("bullet_kit_spider_portal", c.portal, c.dir, {
            clipDistance: true,
            distance: SpiderCombo.parkSpeed * SpiderCombo.portalLife,
        });
    }

    /** he is put at `to` (the portal or the end of the dash), the way a Claw Combo ends */
    private warpTo(to: Vec2) {
        const pos = v2.copy(to);
        this.game.map.clampToMapBounds(pos, this.rad);
        v2.set(this.pos, pos);
        this.pushOutOfWalls(this);
        v2.set(this.posOld, this.pos);
        this.mapIndicator?.updatePosition(this.pos);
        this.setPartDirty();
        this.game.grid.updateObject(this);
    }

    /**
     * Every tick of a Portal Combo: a portal opens every second; shortly after, he steps through and dashes
     * across the mark, hurting everyone the dash crosses once. If the mark or he dies the combo is over
     */
    updateSpiderCombo(dt: number) {
        const c = this.spiderCombo;
        if (!c) return;
        if (this.dead || c.target.dead) {
            this.spiderCombo = undefined;
            return;
        }
        c.t += dt;
        if (!c.entered && c.t >= SpiderCombo.enter) {
            c.entered = true;
            c.dashing = true;
            c.dashT = 0;
            this.warpTo(c.portal);
            const horizontal = Math.abs(c.dir.x) > Math.abs(c.dir.y);
            const dirName = horizontal ? (c.dir.x > 0 ? "r" : "l") : (c.dir.y > 0 ? "t" : "b");
            this.fireSpiderBullet(`bullet_kit_spider_slash_${dirName}`, c.portal, c.dir, {});
        }
        if (c.dashing) {
            const prevProg = Math.min(c.dashT * SpiderCombo.speed, SpiderCombo.distance);
            c.dashT += dt;
            const prog = Math.min(c.dashT * SpiderCombo.speed, SpiderCombo.distance);
            const before = v2.add(c.portal, v2.mul(c.dir, prevProg));
            const head = v2.add(c.portal, v2.mul(c.dir, prog));
            for (const p of this.game.playerBarn.livingPlayers) {
                if (p === this || p.dead || p.untargetable || p.teamId === this.teamId) continue;
                if (!util.sameLayer(p.layer, c.target.layer) || c.hit.has(p.__id)) continue;
                if (math.distToSegmentSq(p.pos, before, head) > (SpiderCombo.hitRadius + p.rad) ** 2) continue;
                c.hit.add(p.__id);
                p.damage({
                    amount: SpiderCombo.damage,
                    damageType: GameConfig.DamageType.Player,
                    gameSourceType: "kit_spider_web",
                    weaponSourceType: "kit_spider_web",
                    source: this,
                    dir: c.dir,
                });
            }
            this.warpTo(head);
            if (prog >= SpiderCombo.distance) c.dashing = false;
        }
        if (c.t >= SpiderCombo.interval - 1e-6) {
            if (c.step >= SpiderCombo.offsets.length - 1) {
                this.spiderCombo = undefined;
                this.setDirty();
                return;
            }
            c.step++;
            this.beginSpiderPortal();
        }
    }

    /** the sound of a minion's dash landing: a shot with nothing in it, so clients play the gun's `shoot` sound */
    fireDashSound(at: Vec2) {
        this.game.bulletBarn.fireBullet(
            {
                playerId: this.__id,
                bulletType: "bullet_kit_ironman_fx_sound",
                gameSourceType: "kit_summoner_dagger",
                damageType: GameConfig.DamageType.Player,
                pos: v2.copy(at),
                dir: v2.copy(this.dir),
                layer: this.layer,
                damageMult: 1,
                shotFx: true,
                reflectCount: 0,
                ghost: true,
            } as Parameters<typeof this.game.bulletBarn.fireBullet>[0],
        );
    }

    /**
     * Summoner: the blade minions. They circle him until an enemy he can see (the whip's mark first, else the
     * nearest) is there; then each hovers `dashFrom` from it, and once a second (they take turns, a quarter second
     * apart) runs at it and straight back. A dash hurts every enemy it crosses once, for true damage
     */
    updateDaggers(dt: number, d: NonNullable<(typeof KitDefs)[string]["daggers"]>) {
        if (this.daggerMinions.length !== d.count) {
            this.daggerMinions = Array.from({ length: d.count }, (_, i) => ({
                pos: v2.copy(this.pos),
                phase: 0,
                timer: (i * d.dashEvery) / d.count,
                hit: new Set<number>(),
            }));
        }
        this.daggerClock += dt;
        // they only go after what is inside the radius they are allowed to roam (the leash)
        const near = this.enemiesWithin(d.leash);
        const focus = near.find((p) => p.__id === this.summonerFocusId);
        const target = focus
            ?? (near.length
                ? near.reduce((
                    a,
                    b,
                ) => (v2.length(v2.sub(a.pos, this.pos)) < v2.length(v2.sub(b.pos, this.pos)) ? a : b))
                : undefined);
        const foes = this.enemiesWithin(d.leash + d.dashFrom + 4);
        const toTarget = target ? v2.normalizeSafe(v2.sub(target.pos, this.pos), this.dir) : this.dir;

        this.daggerMinions.forEach((m, i) => {
            // where it waits: round the Summoner, or `dashFrom` from the target on its own side of it
            let home: Vec2;
            if (target) {
                // spread right round it, so they dash in from every side
                const away = v2.rotate(v2.mul(toTarget, -1), ((i + 0.5) / d.count) * Math.PI * 2);
                home = v2.add(target.pos, v2.mul(away, d.dashFrom));
            } else {
                const ang = (i / d.count) * Math.PI * 2 + this.daggerClock * 2;
                home = v2.add(this.pos, v2.create(Math.cos(ang) * 4, Math.sin(ang) * 4));
            }
            // never further from him than the leash
            const out = v2.sub(home, this.pos);
            if (v2.length(out) > d.leash) home = v2.add(this.pos, v2.mul(v2.normalizeSafe(out), d.leash));
            const step = (to: Vec2, speed: number) => {
                const delta = v2.sub(to, m.pos);
                const dist = v2.length(delta);
                const move = Math.min(dist, speed * dt);
                if (dist > 1e-6) m.pos = v2.add(m.pos, v2.mul(delta, move / dist));
                return dist - move;
            };

            m.timer -= dt;
            if (m.phase === 0) {
                // it drifts after its spot, or is simply there if the Summoner has outrun it
                if (v2.length(v2.sub(m.pos, this.pos)) > d.leash) m.pos = v2.copy(home);
                const left = step(home, target ? d.dashSpeed * 1.3 : 40);
                if (target && m.timer <= 0 && left < 2.5) {
                    m.phase = 1;
                    m.hit.clear();
                    m.timer = d.dashEvery;
                }
            } else if (m.phase === 1) {
                if (!target || target.dead) {
                    m.phase = 2;
                } else {
                    const dir = v2.normalizeSafe(v2.sub(target.pos, m.pos), toTarget);
                    const from = v2.copy(m.pos);
                    // it runs at them, and back as soon as it connects
                    let goal = v2.copy(target.pos);
                    // (a goal past the leash is cut back to it, or the dash could never finish)
                    const rel = v2.sub(goal, this.pos);
                    if (v2.length(rel) > d.leash) goal = v2.add(this.pos, v2.mul(v2.normalizeSafe(rel), d.leash));
                    const left = step(goal, d.dashSpeed);
                    for (const p of foes) {
                        if (m.hit.has(p.__id) || p.dead) continue;
                        // (a minion that didn't move this tick is a point, which distToSegmentSq can't take)
                        const reach = v2.length(v2.sub(m.pos, from)) > 1e-6
                            ? math.distToSegmentSq(p.pos, from, m.pos)
                            : v2.lengthSqr(v2.sub(p.pos, m.pos));
                        if (!(reach <= (p.rad + d.hitRadius) ** 2)) continue;
                        m.hit.add(p.__id);
                        p.damage({
                            amount: d.damage,
                            damageType: GameConfig.DamageType.Player,
                            gameSourceType: "kit_summoner_dagger",
                            weaponSourceType: "kit_summoner_dagger",
                            source: this,
                            dir,
                        });
                        this.fireDashSound(m.pos);
                        m.phase = 2;
                    }
                    if (left < 0.05) m.phase = 2;
                }
            } else if (step(home, d.dashSpeed) < 0.5) {
                m.phase = 0;
            }
            // and never past the leash
            const rel = v2.sub(m.pos, this.pos);
            if (v2.length(rel) > d.leash) m.pos = v2.add(this.pos, v2.mul(v2.normalizeSafe(rel), d.leash));
        });
        this.setDirty();
    }

    /** Wizard: each enemy in the circle feeds energy, shield and health; enhanced, it marks them */
    updateAura(dt: number, a: NonNullable<(typeof KitDefs)[string]["aura"]>) {
        // it burns everyone inside, Iron Man in flight too
        for (const p of this.game.playerBarn.livingPlayers) {
            if (
                p === this || p.dead || p.teamId === this.teamId || !util.sameLayer(p.layer, this.layer)
                || v2.length(v2.sub(p.pos, this.pos)) > a.radius
            ) continue;
            p.damage({
                amount: a.damage * dt,
                damageType: GameConfig.DamageType.Player,
                gameSourceType: "kit_wizard_enhance",
                source: this,
                dir: v2.normalizeSafe(v2.sub(p.pos, this.pos)),
                hitsFlying: true,
            });
        }
        const inside = this.enemiesWithin(a.radius);
        if (inside.length) {
            const n = inside.length;
            this.energy = math.min(this.energy + a.energy * n * dt, this.maxEnergy);
            this.shield = math.min(this.shield + a.shield * n * dt, this.maxShield);
            this.health = math.min(this.health + a.health * n * dt, this.maxHealth);
            this.shieldDirty = true;
            this.energyDirty = true;
        }
        const wasEnhanced = this.kitEnhanceTime > 0;
        if (this.kitEnhanceTime > 0) this.kitEnhanceTime -= dt;
        if (wasEnhanced !== this.kitEnhanceTime > 0) this.setDirty();
        const marks = new Set(this.kitEnhanceTime > 0 ? inside : []);
        for (const p of this.wizardMarks) {
            if (!marks.has(p)) {
                p.wizardMarked = false;
                p.setDirty();
            }
        }
        for (const p of marks) {
            if (!p.wizardMarked) {
                p.wizardMarked = true;
                p.setDirty();
            }
        }
        this.wizardMarks = marks;
    }

    /** Ultron: up to 5 minions round the player; using it again only tops them back up to 5 */
    spawnMinions() {
        this.minions = this.minions.filter((m) => !m.dead);
        const missing = UltronMinion.count - this.minions.length;
        for (let i = 0; i < missing; i++) {
            const m = this.game.addMinion(this, "beginner");
            const ang = (i / Math.max(missing, 1)) * Math.PI * 2;
            m.pos = v2.add(this.pos, v2.create(Math.cos(ang) * 3, Math.sin(ang) * 3));
            m.layer = this.layer;
            m.teamId = this.teamId;
            m.minionOwner = this;
            m.minionLife = UltronMinion.life;
            m.kit = "minion";
            m.lockedKit = true;
            m.maxHealth = UltronMinion.health;
            m.health = UltronMinion.health;
            m.helmet = "helmet04";
            m.chest = "chest04";
            m.backpack = "backpack00";
            m.outfit = "outfitKitMinion";
            for (const item of Object.keys(m.invManager.items) as InventoryItem[]) m.invManager.set(item, 0);
            for (let p = m.perks.length - 1; p >= 0; p--) m.removePerk(m.perks[p].type);
            m.weaponManager.setWeapon(GameConfig.WeaponSlot.Primary, "", 0);
            m.weaponManager.setWeapon(GameConfig.WeaponSlot.Secondary, "", 0);
            m.weaponManager.setWeapon(GameConfig.WeaponSlot.Throwable, "", 0);
            m.weaponManager.setWeapon(GameConfig.WeaponSlot.Melee, "fists", 0);
            m.weaponManager.setCurWeapIndex(GameConfig.WeaponSlot.Melee, true);
            m.weapsDirty = true;
            m.setDirty();
            this.minions.push(m);
        }
    }

    /** an Ultron minion's timer: it blows up after 20 s, or when its summoner is gone */
    updateMinion(dt: number) {
        if (!this.minionOwner || this.dead) return;
        this.minionLife -= dt;
        if (this.minionLife <= 0 || this.minionOwner.dead) {
            this.kill({
                damageType: GameConfig.DamageType.Player,
                source: this.minionOwner,
                gameSourceType: "kit_ultron_minions",
                dir: this.dir,
            } as DamageParams);
        }
    }

    recalculateSpeed(hasTreeClimbing: boolean): void {
        if (this.debug.speedEnabled) {
            this.speed = this.debug.speed;
        } else if (this.actionType == GameConfig.Action.Revive) {
            // prevents self reviving players from getting an unnecessary speed boost
            if (this.action.targetId && !(this.downed && this.hasPerk("self_revive"))) {
                // player reviving
                this.speed = GameConfig.player.downedMoveSpeed + 2; // not specified in game config so i just estimated
            } else {
                // player being revived
                this.speed = GameConfig.player.downedRezMoveSpeed;
            }
        } else if (this.downed) {
            this.speed = GameConfig.player.downedMoveSpeed;
        } else {
            this.speed = GameConfig.player.moveSpeed;
        }

        // if melee is selected increase speed
        const weaponDef = GameObjectDefs.typeToDef(this.activeWeapon) as
            | GunDef
            | MeleeDef
            | ThrowableDef;
        if (this.weaponManager.meleeAttacks.length == 0) {
            let equipSpeed = weaponDef.speed.equip;
            if (this.hasPerk("small_arms") && weaponDef.type == "gun") {
                equipSpeed = PerkProperties.small_arms.gunEquipSpeed;
            }

            this.speed += equipSpeed;
        }

        if (this.shotSlowdownTimer > 0 && weaponDef.speed.attack !== undefined) {
            this.speed += weaponDef.speed.attack;
        }

        // if player is on water decrease speed
        const isOnWater = this.game.map.isOnWater(this.pos, this.layer);
        if (isOnWater) {
            this.speed -= hasTreeClimbing
                ? -PerkProperties.tree_climbing.waterSpeedBoost
                : GameConfig.player.waterSpeedPenalty;
        }

        // increase speed when adrenaline is above 50%
        if (this.boost >= 50) {
            this.speed += GameConfig.player.boostMoveSpeed;
        }

        if (this.animType === GameConfig.Anim.Cook) {
            this.speed -= GameConfig.player.cookSpeedPenalty;
        }

        if (this.hasteType != GameConfig.HasteType.None) {
            this.speed += GameConfig.player.hasteSpeedBonus;
        }

        if (this.frozen) {
            this.speed -= GameConfig.player.frozenSpeedPenalty;
        }

        const hasFieldMedic = this.hasPerk("field_medic");
        // decrease speed if shooting or popping adren or heals
        // field_medic perk doesn't slow you down while you heal
        if (
            this.shotSlowdownTimer > 0
            || (!hasFieldMedic && this.actionType == GameConfig.Action.UseItem)
        ) {
            this.speed *= 0.5;
        }

        if (hasFieldMedic && this.actionType == GameConfig.Action.UseItem) {
            this.speed += PerkProperties.field_medic.speedBoost;
        }

        // the hacker bot moves at double speed, the scripter at 1.3x
        if (isHackerLevel(this.botBrain?.level)) this.speed *= 2;
        else if (this.botBrain?.level === "scripter") this.speed *= 1.3;

        this.speed += KitDefs[this.kit]?.speedBonus ?? 0;
        if (this.potionTime > 0) this.speed += SummonerPotions.speed;
        if (this.champ) this.speed = this.champ.speed(this.speed);
        this.speed = this.debuffs.speed(this.speed, !!this.champ?.buff("highlander"));
        if (this.minionOwner) this.speed *= UltronMinion.speedMult;
        if (this.flying) this.speed += this.flightSpeedBonus;
        this.speed = math.clamp(this.speed, 1, 10000);
    }
}
