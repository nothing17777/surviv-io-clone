import { bullets as batch1 } from "./batch1.ts";
import { bullets as batch2 } from "./batch2.ts";
import { bullets as batch3 } from "./batch3.ts";
import { bullets as batch4 } from "./batch4.ts";
import { bullets as batch5 } from "./batch5.ts";
import { bullets as batch6 } from "./batch6.ts";
import type { AbilityBullets } from "./types.ts";

/** every champion ability projectile outside gunDefs.ts, by the id passed to Champion.shoot() */
export const ChampionAbilityBullets: AbilityBullets = {
    ...batch1,
    ...batch2,
    ...batch3,
    ...batch4,
    ...batch5,
    ...batch6,
};
