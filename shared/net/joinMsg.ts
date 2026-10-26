import { math } from "../utils/math.ts";
import { type AbstractMsg, type BitStream, Constants } from "./net.ts";

export class JoinMsg implements AbstractMsg {
    protocol = 0;
    joinToken = "";
    name = "";
    useTouch = false;
    isMobile = false;
    bot = false;
    loadout = {
        outfit: "",
        melee: "",
        heal: "",
        boost: "",
        emotes: [] as string[],
    };
    /** kit picked in the menu, only used on god loadout (duel) maps */
    godLoadout = {
        primary: "",
        secondary: "",
        throwable: "",
        melee: "",
        /** "" = none */
        helmet: "",
        chest: "",
        backpack: "",
        perks: [] as string[],
        extraThrowables: [] as string[],
        /** consumable counts; left out = a full bag */
        throwableCount: undefined as number | undefined,
        bandage: undefined as number | undefined,
        healthkit: undefined as number | undefined,
        soda: undefined as number | undefined,
        painkiller: undefined as number | undefined,
        throwablesUnlimited: false,
        allGoodPerks: false,
        /** KitDefs id; "" or "default" = the normal game */
        kit: "",
    };

    serialize(s: BitStream) {
        // NEVER PUT THIS ANYWHERE ELSE OR CHANGE ITS SIZE!!
        // PROTOCOL VERSION SHOULD ALWAYS BE THE FIRST WITH THE SAME SIZE TO NOT BREAK OLD CLIENTS!!
        s.writeUint32(this.protocol);
        s.writeString(this.joinToken);

        s.writeString(this.name, Constants.PlayerNameMaxLen);
        s.writeBoolean(this.useTouch);
        s.writeBoolean(this.isMobile);
        s.writeBoolean(this.bot);

        s.writeGameType(this.loadout.outfit);
        s.writeGameType(this.loadout.melee);
        s.writeGameType(this.loadout.heal);
        s.writeGameType(this.loadout.boost);

        s.writeArray(this.loadout.emotes, 8, (emote) => {
            s.writeGameType(emote);
        });

        s.writeGameType(this.godLoadout.primary);
        s.writeGameType(this.godLoadout.secondary);
        s.writeGameType(this.godLoadout.throwable);
        s.writeGameType(this.godLoadout.melee);
        s.writeGameType(this.godLoadout.helmet);
        s.writeGameType(this.godLoadout.chest);
        s.writeGameType(this.godLoadout.backpack);
        s.writeArray(this.godLoadout.perks.slice(0, 3), 2, (perk) => {
            s.writeGameType(perk);
        });
        s.writeArray(this.godLoadout.extraThrowables.slice(0, 2), 2, (t) => {
            s.writeGameType(t);
        });
        const g = this.godLoadout;
        const hasCounts = g.throwableCount !== undefined;
        s.writeBoolean(hasCounts);
        if (hasCounts) {
            s.writeUint8(g.throwableCount ?? 0);
            s.writeUint8(g.bandage ?? 0);
            s.writeUint8(g.healthkit ?? 0);
            s.writeUint8(g.soda ?? 0);
            s.writeUint8(g.painkiller ?? 0);
        }
        s.writeBoolean(g.throwablesUnlimited);
        s.writeBoolean(g.allGoodPerks);
        s.writeString(g.kit ?? "", 16);
    }

    deserialize(s: BitStream) {
        this.protocol = s.readUint32();
        this.joinToken = s.readString();

        this.name = s.readString(Constants.PlayerNameMaxLen);
        this.useTouch = s.readBoolean();
        this.isMobile = s.readBoolean();
        this.bot = s.readBoolean();

        this.loadout.outfit = s.readGameType();
        this.loadout.melee = s.readGameType();
        this.loadout.heal = s.readGameType();
        this.loadout.boost = s.readGameType();

        this.loadout.emotes = s.readArray(8, () => {
            return s.readGameType();
        });

        this.godLoadout.primary = s.readGameType();
        this.godLoadout.secondary = s.readGameType();
        this.godLoadout.throwable = s.readGameType();
        this.godLoadout.melee = s.readGameType();
        this.godLoadout.helmet = s.readGameType();
        this.godLoadout.chest = s.readGameType();
        this.godLoadout.backpack = s.readGameType();
        this.godLoadout.perks = s.readArray(2, () => s.readGameType());
        this.godLoadout.extraThrowables = s.readArray(2, () => s.readGameType());
        if (s.readBoolean()) {
            this.godLoadout.throwableCount = math.min(s.readUint8(), 40);
            this.godLoadout.bandage = math.min(s.readUint8(), 30);
            this.godLoadout.healthkit = math.min(s.readUint8(), 4);
            this.godLoadout.soda = math.min(s.readUint8(), 15);
            this.godLoadout.painkiller = math.min(s.readUint8(), 4);
        }
        this.godLoadout.throwablesUnlimited = s.readBoolean();
        this.godLoadout.allGoodPerks = s.readBoolean();
        this.godLoadout.kit = s.readString(16);
    }
}
