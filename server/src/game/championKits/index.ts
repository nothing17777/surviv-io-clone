import { kits as batch1 } from "./batch1.ts";
import { kits as batch2 } from "./batch2.ts";
import { kits as batch3 } from "./batch3.ts";
import { kits as batch4 } from "./batch4.ts";
import { kits as batch5 } from "./batch5.ts";
import { kits as batch6 } from "./batch6.ts";
import type { ChampionKitMap } from "./types.ts";

/** every hand-written kit outside champion.ts, by champion id */
export const ChampionKits: ChampionKitMap = {
    ...batch1,
    ...batch2,
    ...batch3,
    ...batch4,
    ...batch5,
    ...batch6,
};
