// Episode ideas: each one is a bots-only 50v50-map match the recorder can start by itself.
// side 0 is the star (the camera follows `focus`), side 1 is everyone they have to beat.
import type { BotLevel } from "../shared/types/api.ts";

export interface Recipe {
    title: string;
    /** bot name the camera follows; extra hackers are "austrian painter 2", "3", ... */
    focus: string;
    /** what the arrow at the start calls the star (default HACKER) */
    label?: string;
    sides: [Partial<Record<BotLevel, number>>, Partial<Record<BotLevel, number>>];
    map?: string;
}

export const recipes: Record<string, Recipe> = {
    "hacker-vs-50-noobs": { title: "1 HACKER vs 50 NOOBS", focus: "austrian painter", sides: [{ hacker: 1 }, { beginner: 50 }] },
    "hacker-vs-100-noobs": { title: "1 HACKER vs 100 NOOBS", focus: "austrian painter", sides: [{ hacker: 1 }, { beginner: 100 }] },
    "hacker-vs-200-noobs": { title: "1 HACKER vs 200 NOOBS", focus: "austrian painter", sides: [{ hacker: 1 }, { beginner: 200 }] },
    "hacker-vs-30-pros": { title: "1 HACKER vs 30 PROS", focus: "austrian painter", sides: [{ hacker: 1 }, { advanced: 30 }] },
    "hacker-vs-hacker": { title: "HACKER vs HACKER", focus: "austrian painter", sides: [{ hacker: 1 }, { hacker: 1 }] },
    "hacker-vs-scripter": { title: "HACKER vs SCRIPTER", focus: "austrian painter", sides: [{ hacker: 1 }, { scripter: 1 }] },
    "hacker-vs-5-scripters": { title: "1 HACKER vs 5 SCRIPTERS", focus: "austrian painter", sides: [{ hacker: 1 }, { scripter: 5 }] },
    "5-hackers-vs-300-noobs": { title: "5 HACKERS vs 300 NOOBS", focus: "austrian painter", sides: [{ hacker: 5 }, { beginner: 300 }] },
    "hacker-squad-vs-hacker-squad": { title: "4 HACKERS vs 4 HACKERS", focus: "austrian painter", sides: [{ hacker: 4 }, { hacker: 4 }] },
    "hacker-vs-every-rank": {
        title: "1 HACKER vs EVERY RANK",
        focus: "austrian painter",
        sides: [{ hacker: 1 }, { beginner: 40, intermediate: 25, advanced: 10, scripter: 1 }],
    },
};
