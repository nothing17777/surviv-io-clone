import type { AbstractMsg, BitStream } from "./net.ts";
import { PlayerStatsMsg } from "./playerStatsMsg.ts";

export class GameOverMsg implements AbstractMsg {
    teamId = 0;
    teamRank = 0;
    gameOver = false;
    winningTeamId = 0;
    playerStats: Array<PlayerStatsMsg["playerStats"]> = [];

    serialize(s: BitStream) {
        /* STRIP_FROM_PROD_CLIENT:START */
        s.writeUint16(this.teamId);
        s.writeUint8(this.teamRank);
        s.writeUint8(this.gameOver ? 1 : 0);
        s.writeUint16(this.winningTeamId);

        s.writeArray(this.playerStats, 8, (stats) => {
            const statsMsg = new PlayerStatsMsg();
            statsMsg.playerStats = stats;
            statsMsg.serialize(s);
        });
        /* STRIP_FROM_PROD_CLIENT:END */
    }

    deserialize(s: BitStream) {
        this.teamId = s.readUint16();
        this.teamRank = s.readUint8();
        this.gameOver = !!s.readUint8();
        this.winningTeamId = s.readUint16();

        this.playerStats = s.readArray(8, () => {
            const statsMsg = new PlayerStatsMsg();
            statsMsg.deserialize(s);
            return statsMsg.playerStats;
        });
    }
}
