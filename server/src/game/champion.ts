import {
    type AbilityKey,
    AbilityRanges,
    ChampionDefs,
    championIndex,
    type ItemDef,
    ItemDefs,
} from "../../../shared/defs/gameObjects/championDefs.ts";
import { GameConfig } from "../../../shared/gameConfig.ts";
import { math } from "../../../shared/utils/math.ts";
import { util } from "../../../shared/utils/util.ts";
import { v2, type Vec2 } from "../../../shared/utils/v2.ts";
import type { DamageParams } from "./objects/gameObject.ts";
import type { Player } from "./objects/player.ts";

export const AbilityKeys: AbilityKey[] = ["q", "w", "e", "r"];
/** Jinx's chompers fly at bullet_champ_jinx_e's speed */
const ChomperSpeed = 50;
/** what a cast sends to clients (for its sound and flash): 0-3 Q-R, 4 item active, 5 passive */
export const CastItem = 4;
export const CastPassive = 5;
/** a melee champion's basic attack landing, for its hit effect */
export const CastBasicHit = 6;

/** crowd control any player can be under, from a champion's ability */
export class Debuffs {
    root = 0;
    slow = 0;
    slowAmount = 0;
    silence = 0;
    /** knocked up (Yasuo): rooted and a target for Last Breath */
    airborne = 0;

    tick(dt: number) {
        this.root = Math.max(0, this.root - dt);
        this.slow = Math.max(0, this.slow - dt);
        this.silence = Math.max(0, this.silence - dt);
        this.airborne = Math.max(0, this.airborne - dt);
    }

    applySlow(amount: number, time: number) {
        this.slowAmount = this.slow > 0 ? Math.max(this.slowAmount, amount) : amount;
        this.slow = Math.max(this.slow, time);
    }

    /** move speed after crowd control */
    speed(speed: number, unstoppable: boolean) {
        if (unstoppable) return speed;
        if (this.root > 0 || this.airborne > 0) return 1;
        if (this.slow > 0) return speed * (1 - this.slowAmount);
        return speed;
    }
}

interface Trap {
    pos: Vec2;
    arm: number;
    life: number;
    kind: "chomper" | "snap";
}

interface Zone {
    pos: Vec2;
    time: number;
    kind: "singularity" | "windwall";
    dir: Vec2;
}

/** a champion's state: cooldowns, buffs, item passives */
export class Champion {
    def;
    cooldowns = [0, 0, 0, 0];
    itemCooldown = 0;
    items: ItemDef[];
    stats = {
        damage: 1,
        abilityPower: 1,
        attackSpeed: 0,
        moveSpeed: 0,
        crit: 0,
        critDamage: 1.75,
        armorPen: 0,
        lifesteal: 0,
        abilityHaste: 0,
        damageReduction: 0,
    };
    passives = new Set<string>();
    active?: ItemDef["active"];

    // per champion state
    basicHits = 0;
    /** Guinsoo's Rageblade stacks, and who Sundered Sky has already struck */
    rageStacks = 0;
    struck = new Set<number>();
    /** Death's Dance: damage put off, still to be taken */
    deferredDamage = 0;
    buffs: Record<string, number> = {};
    stacks = 0;
    jinxRockets = false;
    yasuoQStacks = 0;
    yasuoFlow = 0;
    yasuoDashed = new Map<number, number>();
    ahriCharges = 0;
    markedIds = new Map<number, number>();
    /** when each enemy's hit effect may show again (ms), so a fast ability doesn't flood them */
    lastMark = new Map<number, number>();
    traps: Trap[] = [];
    zones: Zone[] = [];
    pending: Array<{ time: number; run: () => void }> = [];
    guardianAngelUsed = false;
    shieldbowCooldown = 0;
    ludenCooldown = 0;
    stormsurgeCooldown = 0;
    nextAttackBonus = 0;
    nextAttackSlow = false;
    nextAttackSilence = false;

    castSeq = 0;
    castKey = 0;

    constructor(public player: Player, public id: string) {
        this.def = ChampionDefs[id];
        this.items = this.def.items.map((item) => ItemDefs[item]);
        const s = this.stats;
        for (const item of this.items) {
            s.damage += item.damage ?? 0;
            s.abilityPower += item.abilityPower ?? 0;
            s.attackSpeed += item.attackSpeed ?? 0;
            s.moveSpeed += item.moveSpeed ?? 0;
            s.crit += item.crit ?? 0;
            s.critDamage += item.critDamage ?? 0;
            s.armorPen = Math.max(s.armorPen, item.armorPen ?? 0);
            s.lifesteal += item.lifesteal ?? 0;
            s.abilityHaste += item.abilityHaste ?? 0;
            s.damageReduction += item.damageReduction ?? 0;
            if (item.passive) this.passives.add(item.passive);
            if (item.active) this.active = item.active;
        }
        // Yasuo's crit chance is doubled
        if (id === "yasuo") s.crit *= 2;
        s.crit = Math.min(s.crit, 1);
    }

    get index() {
        return championIndex(this.id);
    }

    get basic() {
        return `kit_${this.id}_basic`;
    }

    /** abilities hit as the champion's basic weapon (in the kill feed), marked in weaponSourceType */
    sourceOf(_key: AbilityKey | "item") {
        return this.basic;
    }

    buff(name: string) {
        return (this.buffs[name] ?? 0) > 0;
    }

    /** sent to the owner's HUD: Q, W, E, R and the item active */
    get cooldownList() {
        return [...this.cooldowns, this.active ? this.itemCooldown : 0];
    }

    // ---- input

    cast(i: number) {
        const p = this.player;
        if (p.dead || p.downed || p.debuffs.silence > 0 || p.debuffs.airborne > 0 || this.buff("zhonya")) return;
        const key = AbilityKeys[i];
        // Spirit Rush: the second and third dash are free while it lasts
        if (this.id === "ahri" && key === "r" && this.ahriCharges > 0 && this.buff("ahri_r")) {
            this.ahriCharges--;
            this.ahriDash();
            this.announce(i);
            return;
        }
        if (this.cooldowns[i] > 0) return;
        const cast = this.abilities[this.id]?.[key];
        if (!cast || cast() === false) return;
        let cd = this.def.abilities[key].cooldown * (1 - this.stats.abilityHaste);
        if (key === "r" && this.passives.has("malignance")) cd *= 0.8;
        this.cooldowns[i] = cd;
        this.announce(i);
        if (this.passives.has("lich_bane")) this.nextAttackBonus = Math.max(this.nextAttackBonus, 0.75);
        else if (this.passives.has("spellblade")) this.nextAttackBonus = Math.max(this.nextAttackBonus, 0.4);
    }

    useItem() {
        const p = this.player;
        if (!this.active || this.itemCooldown > 0 || p.dead) return;
        if (this.active.kind === "stridebreaker") {
            for (const e of p.enemiesWithin(5)) {
                this.hit(e, 40, "item");
                e.debuffs.applySlow(0.5, 2);
            }
            this.buffs.stridebreaker = 2;
        } else if (this.active.kind === "youmuu") {
            this.buffs.youmuu = 6;
        } else if (this.active.kind === "zhonya") {
            // stasis: can't be hit, can't move or act
            this.buffs.zhonya = 2.5;
            p.dodgeTime = 2.5;
            p.debuffs.root = 2.5;
        }
        this.itemCooldown = this.active.cooldown;
        this.announce(CastItem);
    }

    announce(key: number) {
        this.castKey = key;
        this.castSeq = (this.castSeq + 1) & 7;
        this.player.setDirty();
    }

    // ---- helpers

    get aim(): Vec2 {
        return v2.normalizeSafe(this.player.dir, v2.create(1, 0));
    }

    /** how far an ability reaches, in units: League's own range (see AbilityRanges) */
    reach(key: AbilityKey): number {
        return AbilityRanges[this.id]?.[key].range ?? 30;
    }

    /** where the ability lands: the cursor, pulled back to the edge of its range */
    at(key: AbilityKey): Vec2 {
        return this.cursor(this.reach(key));
    }

    cursor(maxRange: number): Vec2 {
        const p = this.player;
        return v2.add(p.pos, v2.mul(this.aim, math.clamp(p.toMouseLen, 1, maxRange)));
    }

    enemies(range: number, from = this.player.pos): Player[] {
        const p = this.player;
        return p.game.playerBarn.livingPlayers.filter(
            (e) =>
                e !== p && !e.dead && !e.untargetable && e.teamId !== p.teamId && util.sameLayer(e.layer, p.layer)
                && v2.distance(e.pos, from) <= range,
        );
    }

    nearest(range: number, from = this.player.pos): Player | undefined {
        let best: Player | undefined;
        let bestDist = Infinity;
        for (const e of this.enemies(range, from)) {
            const d = v2.distance(e.pos, from);
            if (d < bestDist) [best, bestDist] = [e, d];
        }
        return best;
    }

    /** ability damage: scaled by ability power, bypasses the basic attack's crit */
    hit(target: Player, amount: number, key: AbilityKey | "item", trueDamage = false) {
        target.damage({
            amount,
            damageType: GameConfig.DamageType.Player,
            gameSourceType: this.sourceOf(key),
            weaponSourceType: `champ_ability_${key}`,
            source: this.player,
            dir: v2.normalizeSafe(v2.sub(target.pos, this.player.pos)),
            armorPenetration: trueDamage ? 0 : undefined,
        });
        // show the hit on the target (Jinx's only direct hits are her chompers, which mark their own spot)
        const now = this.player.game.now;
        if (this.id !== "jinx" && (this.lastMark.get(target.__id) ?? 0) <= now) {
            this.lastMark.set(target.__id, now + 150);
            this.shoot("mark", key === "item" ? "q" : key, v2.sub(target.pos, this.player.pos), {
                from: target.pos,
                distance: 0.1,
            });
        }
    }

    shoot(
        bullet: string,
        key: AbilityKey,
        dir = this.aim,
        opts: { homing?: Player; from?: Vec2; mult?: number; distance?: number } = {},
    ) {
        const p = this.player;
        p.game.bulletBarn.fireBullet(
            {
                playerId: p.__id,
                bulletType: `bullet_champ_${bullet}`,
                gameSourceType: this.sourceOf(key),
                damageType: GameConfig.DamageType.Player,
                pos: v2.copy(opts.from ?? p.pos),
                dir: v2.normalizeSafe(dir),
                layer: p.layer,
                damageMult: opts.mult ?? 1,
                shotFx: false,
                reflectCount: 0,
                homingTargetId: opts.homing?.__id,
                distance: opts.distance,
            } as Parameters<typeof p.game.bulletBarn.fireBullet>[0],
        );
    }

    dash(to: Vec2, speed: number) {
        const p = this.player;
        p.webPull = { target: to, speed, time: v2.distance(to, p.pos) / speed + 0.1 };
    }

    later(time: number, run: () => void) {
        this.pending.push({ time, run });
    }

    heal(amount: number) {
        const p = this.player;
        p.health = Math.min(p.health + amount, p.maxHealth);
        p.setDirty();
    }

    addShield(amount: number, cap = 150) {
        const p = this.player;
        p.shield = Math.min(p.shield + amount, Math.max(cap, p.shield));
        p.shieldDirty = true;
        p.setDirty();
    }

    // ---- abilities, by champion: return false to not cast (no target)

    abilities: Record<string, Partial<Record<AbilityKey, () => boolean | void>>> = {
        jinx: {
            q: () => {
                // Switcheroo!: Pow-Pow <-> Fishbones
                this.jinxRockets = !this.jinxRockets;
                const p = this.player;
                p.weaponManager.setWeapon(
                    GameConfig.WeaponSlot.Primary,
                    this.jinxRockets ? "kit_jinx_fishbones" : this.basic,
                    250,
                );
                p.weaponManager.setCurWeapIndex(GameConfig.WeaponSlot.Primary, true);
                p.weapsDirty = true;
            },
            w: () => this.later(0.4, () => this.shoot("jinx_w", "w")),
            // Flame Chompers!: three chompers lobbed into a line across where she aims; each arms 0.5 s
            // after it lands and lasts 5 s
            e: () => {
                const c = this.at("e");
                const side = v2.perp(this.aim);
                for (const o of [-2.6, 0, 2.6]) {
                    const pos = v2.add(c, v2.mul(side, o));
                    const to = v2.sub(pos, this.player.pos);
                    const flight = v2.length(to) / ChomperSpeed;
                    this.shoot("jinx_e", "e", to, { distance: v2.length(to) });
                    this.traps.push({ pos, arm: flight + 0.5, life: flight + 5, kind: "chomper" });
                }
            },
            r: () => this.shoot("jinx_r", "r"),
        },
        caitlyn: {
            q: () => this.later(0.6, () => this.shoot("caitlyn_q", "q")),
            w: () => {
                const pos = this.at("w");
                this.shoot("caitlyn_w", "w", v2.sub(pos, this.player.pos));
                this.traps.push({ pos, arm: 0.5, life: 30, kind: "snap" });
                // only 3 traps out at once
                const snaps = this.traps.filter((t) => t.kind === "snap");
                if (snaps.length > 3) this.traps.splice(this.traps.indexOf(snaps[0]), 1);
            },
            e: () => {
                this.shoot("caitlyn_e", "e");
                this.dash(v2.sub(this.player.pos, v2.mul(this.aim, 6)), 60);
            },
            r: () => {
                const target = this.nearest(this.reach("r"));
                if (!target) return false;
                this.later(1, () => {
                    if (!target.dead) {
                        this.shoot("caitlyn_r", "r", v2.sub(target.pos, this.player.pos), { homing: target });
                    }
                });
            },
        },
        ashe: {
            q: () => {
                this.buffs.ashe_q = 4;
            },
            w: () => {
                for (let i = -4; i <= 4; i++) this.shoot("ashe_w", "w", v2.rotate(this.aim, (i * 6 * Math.PI) / 180));
            },
            e: () => {
                this.buffs.hawkshot = 6;
                this.shoot("ashe_e", "e");
            },
            r: () => this.shoot("ashe_r", "r"),
        },
        ezreal: {
            q: () => this.shoot("ezreal_q", "q"),
            w: () => this.shoot("ezreal_w", "w"),
            e: () => {
                const to = this.at("e");
                this.dash(to, 120);
                this.later(0.15, () => {
                    const target = this.nearest(25);
                    if (target) this.shoot("ezreal_e", "e", v2.sub(target.pos, this.player.pos), { homing: target });
                });
            },
            r: () => this.later(1, () => this.shoot("ezreal_r", "r")),
        },
        lux: {
            q: () => this.shoot("lux_q", "q"),
            w: () => {
                this.shoot("lux_w", "w");
                this.addShield(60);
                this.buffs.lux_w = 3;
            },
            e: () => {
                const pos = this.at("e");
                this.shoot("lux_e", "e", v2.sub(pos, this.player.pos));
                this.zones.push({ pos, time: 3, kind: "singularity", dir: this.aim });
            },
            r: () => this.later(1, () => this.shoot("lux_r", "r")),
        },
        ahri: {
            // the orb flies out and back (a boomerang shot), hitting on both ways
            q: () => this.shoot("ahri_q", "q"),
            w: () => {
                this.buffs.ahri_w = 1.5;
                const targets = this.enemies(this.reach("w")).sort((a, b) =>
                    v2.distance(a.pos, this.player.pos) - v2.distance(b.pos, this.player.pos)
                );
                for (let i = 0; i < 3; i++) {
                    const t = targets[i % Math.max(targets.length, 1)];
                    const dir = t ? v2.sub(t.pos, this.player.pos) : v2.rotate(this.aim, (i - 1) * 0.5);
                    this.shoot("ahri_w", "w", dir, { homing: t });
                }
            },
            e: () => this.shoot("ahri_e", "e"),
            r: () => {
                // Spirit Rush: three dashes in 10 s on one cooldown
                this.ahriCharges = 2;
                this.buffs.ahri_r = 10;
                this.ahriDash();
            },
        },
        yasuo: {
            q: () => {
                if (this.yasuoQStacks >= 2) {
                    this.yasuoQStacks = 0;
                    this.shoot("yasuo_q3", "q");
                    return;
                }
                const hits = this.lineHit(5, 1.5);
                for (const e of hits) this.hit(e, 40, "q");
                if (hits.length) this.yasuoQStacks++;
            },
            w: () => {
                this.zones.push({
                    pos: v2.add(this.player.pos, v2.mul(this.aim, 3)),
                    time: 3,
                    kind: "windwall",
                    dir: this.aim,
                });
            },
            e: () => {
                const now = this.player.game.now;
                const target = this.enemies(this.reach("e")).find((e) => (this.yasuoDashed.get(e.__id) ?? 0) <= now);
                if (!target) return false;
                this.yasuoDashed.set(target.__id, now + 6000);
                const dir = v2.normalizeSafe(v2.sub(target.pos, this.player.pos));
                this.dash(v2.add(this.player.pos, v2.mul(dir, 6)), 50);
                this.hit(target, 30, "e");
            },
            r: () => {
                const target = this.enemies(this.reach("r")).find((e) => e.debuffs.airborne > 0);
                if (!target) return false;
                this.dash(v2.sub(target.pos, v2.mul(v2.normalizeSafe(v2.sub(target.pos, this.player.pos)), 1.5)), 200);
                target.debuffs.airborne += 1;
                this.later(0.3, () => this.hit(target, 110, "r"));
            },
        },
        garen: {
            q: () => {
                this.buffs.garen_q = 2;
                this.nextAttackBonus = Math.max(this.nextAttackBonus, 40 / this.def.basic.damage);
                this.nextAttackSilence = true;
            },
            w: () => {
                this.buffs.garen_w = 4;
                this.addShield(50);
            },
            e: () => {
                this.buffs.garen_e = 3;
                this.stacks = 0;
            },
            r: () => {
                const target = this.nearest(8, this.at("r")) ?? this.nearest(this.reach("r"));
                if (!target) return false;
                this.later(0.4, () => {
                    if (!target.dead) this.hit(target, 70 + (target.maxHealth - target.health) * 0.3, "r", true);
                });
            },
        },
        darius: {
            q: () => {
                this.later(0.75, () => {
                    let healed = 0;
                    for (const e of this.enemies(this.reach("q"))) {
                        // the blade (outer edge) hits full, the handle less
                        const blade = v2.distance(e.pos, this.player.pos) > this.reach("q") * 0.47;
                        this.hit(e, blade ? 50 : 18, "q");
                        if (blade) healed++;
                    }
                    this.heal(15 * healed);
                });
            },
            w: () => {
                this.nextAttackBonus = Math.max(this.nextAttackBonus, 0.5);
                this.nextAttackSlow = true;
            },
            e: () => {
                for (const e of this.enemies(this.reach("e"))) {
                    const to = v2.normalizeSafe(v2.sub(e.pos, this.player.pos));
                    if (v2.dot(to, this.aim) < Math.cos(Math.PI / 4)) continue;
                    e.webPull = { target: v2.add(this.player.pos, v2.mul(to, 2)), speed: 40, time: 0.4 };
                    e.debuffs.applySlow(0.4, 1);
                }
            },
            r: () => {
                const target = this.nearest(this.reach("r"));
                if (!target) return false;
                this.dash(target.pos, 80);
                this.later(0.25, () => {
                    if (target.dead) return;
                    const bleeds = target.bleeding ? 5 : 0;
                    this.hit(target, 75 * (1 + bleeds * 0.2), "r", true);
                    if (target.dead) this.cooldowns[3] = 0;
                });
            },
        },
        masteryi: {
            q: () => {
                const targets = this.enemies(this.reach("q")).slice(0, 4);
                if (!targets.length) return false;
                this.player.dodgeTime = 0.6;
                for (const t of targets) this.hit(t, 50, "q");
                this.dash(v2.add(targets[0].pos, v2.mul(this.aim, 1.5)), 200);
            },
            w: () => {
                this.buffs.meditate = 3;
            },
            e: () => {
                this.buffs.wuju = 5;
            },
            r: () => {
                this.buffs.highlander = 7;
            },
        },
    };

    ahriDash() {
        this.dash(this.at("r"), 80);
        this.later(0.15, () => {
            const targets = this.enemies(15).slice(0, 3);
            for (const t of targets) this.shoot("ahri_r", "r", v2.sub(t.pos, this.player.pos), { homing: t });
        });
    }

    /** enemies in a line in front of the player */
    lineHit(length: number, width: number): Player[] {
        const p = this.player;
        return this.enemies(length + 1).filter((e) => {
            const to = v2.sub(e.pos, p.pos);
            const along = v2.dot(to, this.aim);
            return along > 0 && along < length + e.rad && Math.abs(v2.dot(to, v2.perp(this.aim))) < width + e.rad;
        });
    }

    // ---- hooks from Player / WeaponManager

    /** basic attack cooldown multiplier */
    attackCooldownMult() {
        let speed = this.stats.attackSpeed + this.stacks * (this.id === "ezreal" ? 0.1 : 0);
        speed += this.rageStacks * 0.08;
        if (this.buff("excited")) speed += 1;
        if (this.buff("ashe_q")) speed += 1;
        if (this.buff("highlander")) speed += 0.8;
        return 1 / (1 + speed);
    }

    speed(speed: number) {
        speed += this.stats.moveSpeed;
        if (this.buff("excited")) speed += 3;
        if (this.buff("garen_q")) speed += 3;
        if (this.buff("ahri_w")) speed += 2;
        if (this.buff("youmuu")) speed += 3;
        if (this.buff("highlander")) speed += 3;
        if (this.passives.has("dead_mans_plate")) speed += Math.min(this.stacks, 2);
        if (this.buff("meditate") || this.buff("zhonya")) return 1;
        return speed;
    }

    /** a basic gun shot just went out */
    onBasicShot(dir: Vec2) {
        if (this.passives.has("runaan")) {
            for (const t of this.enemies(30).slice(0, 2)) {
                this.shoot("runaan", "q", v2.sub(t.pos, this.player.pos), { homing: t, mult: this.stats.damage });
            }
        }
        if (this.buff("ashe_q")) {
            for (const a of [-0.12, 0.12]) this.shoot("ashe_flurry", "q", v2.rotate(dir, a));
        }
    }

    /** damage this champion deals, before the target's armor */
    onDealDamage(target: Player, params: DamageParams, amount: number): number {
        const src = params.gameSourceType ?? "";
        const weap = params.weaponSourceType ?? "";
        if (src !== this.basic && src !== "kit_jinx_fishbones") return amount;
        const isAbility = params.isExplosion
            || (weap.startsWith("bullet_champ_") && weap !== "bullet_champ_runaan"
                && weap !== "bullet_champ_ashe_flurry")
            || weap.startsWith("champ_ability_");
        const isBasic = !isAbility;
        if (params.armorPenetration === undefined && this.stats.armorPen > 0) {
            params.armorPenetration = 1 - this.stats.armorPen;
        }
        // Ezreal's Essence Flux mark: the next hit detonates it
        if (this.markedIds.has(target.__id) && params.weaponSourceType !== "bullet_champ_ezreal_w") {
            this.markedIds.delete(target.__id);
            amount += 50 * this.stats.abilityPower;
            if (this.id === "ezreal") this.cooldowns = this.cooldowns.map((c) => Math.max(0, c - 1.5));
        }
        if (isBasic) {
            if (!this.def.gun) this.announce(CastBasicHit);
            amount *= this.stats.damage;
            if (Math.random() < this.stats.crit) amount *= this.stats.critDamage;
            this.basicHits++;
            if (this.nextAttackBonus > 0) {
                amount *= 1 + this.nextAttackBonus;
                this.nextAttackBonus = 0;
            }
            if (this.nextAttackSlow) {
                target.debuffs.applySlow(0.9, 1);
                this.nextAttackSlow = false;
            }
            if (this.nextAttackSilence) {
                target.debuffs.silence = 1.5;
                this.nextAttackSilence = false;
            }
            if (this.passives.has("kraken") && this.basicHits % 3 === 0) amount += 35;
            if (this.passives.has("botrk")) amount += target.health * 0.06;
            if (this.buff("wuju")) amount += 15;
            if (this.id === "caitlyn" && (this.basicHits % 6 === 0 || target.debuffs.root > 0)) amount *= 1.6;
            if (this.id === "ashe") target.debuffs.applySlow(0.25, 2);
            if (this.id === "darius") target.applyBleed(5, this.player);
            if (this.id === "ezreal") {
                this.stacks = Math.min(this.stacks + 1, 5);
                this.buffs.ezreal_p = 6;
            }
            if (this.id === "masteryi" && this.basicHits % 4 === 0) amount *= 2;
            // Lux's Illumination: abilities mark, the next basic attack detonates
            if (this.id === "lux" && this.markedIds.has(-target.__id)) {
                this.markedIds.delete(-target.__id);
                amount += 30;
            }
            if (this.passives.has("guinsoo") && this.basicHits % 2 === 0) {
                this.rageStacks = Math.min(this.rageStacks + 1, 6);
            }
            if (this.passives.has("sundered_sky") && !this.struck.has(target.__id)) {
                this.struck.add(target.__id);
                amount *= this.stats.critDamage;
                this.heal(30);
            }
            if (this.passives.has("navori")) {
                for (let i = 0; i < this.cooldowns.length; i++) this.cooldowns[i] *= 0.85;
            }
            if (this.passives.has("dead_mans_plate") && this.stacks >= 2) {
                this.stacks = 0;
                amount += 20;
            }
        } else {
            amount *= this.stats.abilityPower;
            if (this.passives.has("shadowflame") && target.health < target.maxHealth * 0.4) amount *= 1.2;
            if (this.passives.has("luden") && this.ludenCooldown <= 0) {
                amount += 25;
                this.ludenCooldown = 10;
            }
            if (this.passives.has("stormsurge") && this.stormsurgeCooldown <= 0) {
                amount += 40;
                this.stormsurgeCooldown = 20;
            }
            this.onAbilityHit(target, params);
        }
        return amount;
    }

    onAbilityHit(target: Player, params: DamageParams) {
        const weap = params.weaponSourceType ?? "";
        const d = target.debuffs;
        if (this.id === "ashe") d.applySlow(0.3, 2);
        if (this.id === "darius") target.applyBleed(5, this.player);
        if (this.id === "lux") this.markedIds.set(-target.__id, 1);
        if (this.id === "ahri") this.heal(4);
        switch (weap) {
            case "bullet_champ_jinx_w":
                d.applySlow(0.4, 2);
                break;
            case "bullet_champ_jinx_r":
                params.amount = (params.amount ?? 0) + (target.maxHealth - target.health) * 0.25;
                break;
            case "bullet_champ_caitlyn_e":
                d.applySlow(0.5, 1);
                break;
            case "bullet_champ_ashe_r":
                d.root = Math.max(d.root, 3.5);
                d.silence = Math.max(d.silence, 3.5);
                break;
            case "bullet_champ_ezreal_q":
                this.cooldowns = this.cooldowns.map((c) => Math.max(0, c - 1.5));
                break;
            case "bullet_champ_ezreal_w":
                this.markedIds.set(target.__id, 1);
                break;
            case "bullet_champ_lux_q":
                d.root = Math.max(d.root, 2);
                break;
            case "bullet_champ_ahri_e":
                if (target.charmDuration <= 0) target.setDirty();
                target.charmDuration = Math.max(target.charmDuration, 1.6);
                d.applySlow(0.65, 1.6);
                target.webPull = {
                    target: v2.add(target.pos, v2.mul(v2.normalizeSafe(v2.sub(this.player.pos, target.pos)), 3)),
                    speed: 4,
                    time: 1.6,
                };
                break;
            case "bullet_champ_yasuo_q3":
                d.airborne = Math.max(d.airborne, 1);
                break;
        }
    }

    /** after the damage landed */
    afterDealDamage(target: Player, dealt: number, params: DamageParams) {
        const src = params.gameSourceType ?? "";
        const weap = params.weaponSourceType ?? "";
        if (src !== this.basic && src !== "kit_jinx_fishbones") return;
        if (weap.startsWith("champ_ability_") || (weap.startsWith("bullet_champ_") && weap !== "bullet_champ_runaan")) {
            return;
        }
        if (this.stats.lifesteal > 0) {
            const heal = dealt * this.stats.lifesteal;
            const p = this.player;
            const over = p.health + heal - p.maxHealth;
            this.heal(heal);
            if (over > 0 && this.passives.has("bloodthirster")) this.addShield(over, 50);
        }
        if (this.passives.has("collector") && !target.dead && target.health < target.maxHealth * 0.05) {
            this.hit(target, target.health + 1, "item", true);
        }
    }

    /** damage this champion takes, after armor; returns what's left */
    onTakeDamage(params: DamageParams, amount: number, from?: Player): number {
        const p = this.player;
        if (this.buff("zhonya")) return 0;
        if (from && from !== p) {
            amount *= 1 - this.stats.damageReduction;
            if (this.passives.has("deaths_dance")) {
                this.deferredDamage += amount * 0.3;
                amount *= 0.7;
            }
            if (this.buff("garen_w")) amount *= 0.7;
            if (this.buff("meditate")) amount *= 0.4;
            // Yasuo's Flow shield
            if (this.id === "yasuo" && this.yasuoFlow >= 100 && amount > 0) {
                this.yasuoFlow = 0;
                this.addShield(60);
                this.announce(CastPassive);
            }
        }
        if (this.passives.has("shieldbow") && this.shieldbowCooldown <= 0 && p.health - amount < p.maxHealth * 0.3) {
            this.shieldbowCooldown = 90;
            this.addShield(60);
        }
        if (this.passives.has("guardian_angel") && !this.guardianAngelUsed && amount >= p.health + p.shield) {
            // Guardian Angel: stasis for 2 s, then back at half health
            this.guardianAngelUsed = true;
            p.health = Math.max(p.health, 1);
            p.dodgeTime = 2;
            p.debuffs.root = 2;
            this.later(2, () => this.heal(p.maxHealth * 0.5));
            this.announce(CastItem);
            return 0;
        }
        return amount;
    }

    onKill(_victim: Player) {
        if (this.id === "jinx") {
            this.buffs.excited = 6;
            this.announce(CastPassive);
        }
        if (this.id === "masteryi" && this.buff("highlander")) this.buffs.highlander += 4;
        if (this.id === "masteryi") this.cooldowns = this.cooldowns.map((c, i) => i === 3 ? c : c * 0.3);
        if (this.id === "ahri") this.heal(30);
    }

    // ---- per tick

    update(dt: number) {
        // Death's Dance pays out what it put off, over 3 s
        if (this.deferredDamage > 0) {
            const bite = Math.min(this.deferredDamage, (this.deferredDamage / 3) * dt + 0.01);
            this.deferredDamage -= bite;
            this.player.health = Math.max(1, this.player.health - bite);
            this.player.setDirty();
        }

        const p = this.player;
        for (let i = 0; i < 4; i++) this.cooldowns[i] = Math.max(0, this.cooldowns[i] - dt);
        this.itemCooldown = Math.max(0, this.itemCooldown - dt);
        this.shieldbowCooldown -= dt;
        this.ludenCooldown -= dt;
        this.stormsurgeCooldown -= dt;
        for (const k in this.buffs) this.buffs[k] -= dt;
        if (this.id === "ezreal" && !this.buff("ezreal_p")) this.stacks = 0;

        for (let i = this.pending.length - 1; i >= 0; i--) {
            const job = this.pending[i];
            job.time -= dt;
            if (job.time <= 0) {
                this.pending.splice(i, 1);
                if (!p.dead) job.run();
            }
        }

        // Perseverance: Garen heals fast out of combat
        if (this.id === "garen" && p.calmTime >= 4) this.heal(p.maxHealth * 0.06 * dt);
        // Yasuo's Flow fills as he moves
        if (this.id === "yasuo" && p.speed > 1) this.yasuoFlow = Math.min(100, this.yasuoFlow + p.speed * dt * 2);
        // Dead Man's Plate momentum
        if (this.passives.has("dead_mans_plate")) {
            this.stacks = p.speed > 1 ? Math.min(2, this.stacks + dt * 0.5) : Math.max(0, this.stacks - dt);
        }
        // Meditate heals 45% of missing health over 3 s
        if (this.buff("meditate")) this.heal(((p.maxHealth - p.health) * 0.45 * dt) / 3 + 1 * dt);
        // Highlander shrugs off slows
        if (this.buff("highlander")) p.debuffs.slow = 0;
        // Hawkshot: sees further
        if (this.buff("hawkshot")) p.zoom = Math.max(p.zoom, 120);
        // Spirit Rush recasts: R again while charges are left
        if (this.id === "ahri" && !this.buff("ahri_r")) this.ahriCharges = 0;

        // Judgment: hits all around Garen 12 times over 3 s
        if (this.buff("garen_e")) {
            this.stacks += dt;
            while (this.stacks >= 0.25) {
                this.stacks -= 0.25;
                for (const e of this.enemies(this.reach("e"))) this.hit(e, 9, "e");
            }
        }

        for (let i = this.traps.length - 1; i >= 0; i--) {
            const t = this.traps[i];
            t.arm -= dt;
            t.life -= dt;
            if (t.life <= 0) {
                this.traps.splice(i, 1);
                continue;
            }
            if (t.arm > 0) continue;
            const victim = this.enemies(1.8, t.pos)[0];
            if (!victim) continue;
            if (t.kind === "chomper") {
                // the one stepped on snaps shut, and the rest of the set close by go off with it
                const set = this.traps.filter(
                    (o) => o.kind === "chomper" && o.arm <= 0 && v2.distance(o.pos, t.pos) <= 6,
                );
                const hit = new Set<Player>();
                for (const o of set) {
                    this.traps.splice(this.traps.indexOf(o), 1);
                    // a tiny shot where it was, so every client plays the snap and clears the chomper
                    this.shoot("mark", "e", this.aim, { from: o.pos, distance: 0.1 });
                    for (const e of this.enemies(2.2, o.pos)) hit.add(e);
                }
                for (const e of hit) {
                    e.debuffs.root = Math.max(e.debuffs.root, 1.5);
                    this.hit(e, 40, "e");
                    e.applyBurn(1.5, p, this.sourceOf("e"));
                }
                i = this.traps.length;
            } else {
                this.traps.splice(i, 1);
                victim.debuffs.root = Math.max(victim.debuffs.root, 1.5);
                this.hit(victim, 30, "w");
            }
        }

        for (let i = this.zones.length - 1; i >= 0; i--) {
            const z = this.zones[i];
            z.time -= dt;
            if (z.kind === "singularity") {
                for (const e of this.enemies(5, z.pos)) e.debuffs.applySlow(0.3, 0.2);
                if (z.time <= 0) { for (const e of this.enemies(5, z.pos)) this.hit(e, 50, "e"); }
            } else {
                this.blockShots(z);
            }
            if (z.time <= 0) this.zones.splice(i, 1);
        }

        // bots cast whatever is ready when they have someone to fight
        if (p.botBrain && Math.random() < dt * 0.8 && this.nearest(30)) {
            const ready = [0, 1, 2, 3].filter((i) => this.cooldowns[i] <= 0);
            if (ready.length) this.cast(ready[Math.floor(Math.random() * ready.length)]);
            if (this.active && this.itemCooldown <= 0 && p.health < p.maxHealth * 0.3) this.useItem();
        }
    }

    /** Wind Wall: enemy shots that reach it are gone */
    blockShots(z: Zone) {
        const p = this.player;
        const side = v2.perp(z.dir);
        for (const b of p.game.bulletBarn.bullets) {
            if (!b.alive || b.playerId === p.__id) continue;
            const shooter = b.player;
            if (shooter && shooter.teamId === p.teamId) continue;
            const to = v2.sub(b.pos, z.pos);
            if (Math.abs(v2.dot(to, z.dir)) < 1.2 && Math.abs(v2.dot(to, side)) < 4) b.alive = false;
        }
    }
}
