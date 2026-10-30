import { SwingShots } from "../../../shared/defs/gameObjects/customWeaponEffects.ts";
import type { GunDef } from "../../../shared/defs/gameObjects/gunDefs.ts";
import { isKitItem, KitDefs, SpiderDodgeTime, WolverineDashDistance } from "../../../shared/defs/gameObjects/kitDefs.ts";
import type { MeleeDef } from "../../../shared/defs/gameObjects/meleeDefs.ts";
import { PerkProperties } from "../../../shared/defs/gameObjects/perkDefs.ts";
import { type ThrowableDef, ThrowableDefs } from "../../../shared/defs/gameObjects/throwableDefs.ts";
import { GameObjectDefs } from "../../../shared/defs/register.ts";
import { GameConfig, type InventoryItem, WeaponSlot } from "../../../shared/gameConfig.ts";
import * as net from "../../../shared/net/net.ts";
import { ObjectType } from "../../../shared/net/objectSerializeFns.ts";
import { coldet } from "../../../shared/utils/coldet.ts";
import { collider } from "../../../shared/utils/collider.ts";
import { collisionHelpers } from "../../../shared/utils/collisionHelpers.ts";
import { math } from "../../../shared/utils/math.ts";
import { assert, util } from "../../../shared/utils/util.ts";
import { v2, type Vec2 } from "../../../shared/utils/v2.ts";
import type { BulletParams } from "../game/objects/bullet.ts";
import type { GameObject } from "../game/objects/gameObject.ts";
import type { Player } from "../game/objects/player.ts";
import type { Obstacle } from "./objects/obstacle.ts";
import type { Projectile } from "./objects/projectile.ts";

/**
 * List of throwables to cycle based on the definition `inventoryOrder`
 */
export const throwableList = Object.keys(ThrowableDefs).filter((a) => {
    const def = ThrowableDefs[a];
    // Trying to pickup a throwable that has no `handImg` will crash the client
    // so filter them out
    return "handImg" in def && "equip" in def.handImg!;
});

throwableList.sort((a, b) => {
    const aDef = ThrowableDefs[a];
    const bDef = ThrowableDefs[b];
    return aDef.inventoryOrder - bDef.inventoryOrder;
});

export class WeaponManager {
    player: Player;

    private _curWeapIdx = 2;

    lastWeaponIdx = 0;

    get curWeapIdx(): number {
        return this._curWeapIdx;
    }

    weapons: Array<{
        type: string;
        ammo: number;
        cooldown: number;
        recoilTime: number;
    }> = [];

    scheduledReload = false;

    bursts: number[] = [];
    offHand = false;

    meleeAttacks: number[] = [];

    /** how long fire has been held with the current gun, for minigun spin up and Last Prism's charge */
    holdTime = 0;

    meleeAnimCooldown = 0;

    get cookingThrowable() {
        return this.player.animType === GameConfig.Anim.Cook;
    }
    cookTicker = 0;
    throwableCooldown = 0;

    get activeWeapon(): string {
        return this.weapons[this.curWeapIdx].type;
    }

    constructor(player: Player) {
        this.player = player;

        for (let i = 0; i < WeaponSlot.Count; i++) {
            this.weapons.push({
                type: GameConfig.WeaponType[i] === "melee" ? "fists" : "",
                ammo: 0,
                cooldown: 0,
                recoilTime: Infinity,
            });
        }
    }

    /**
     * @param idx index being swapped to
     * @param forceSwitch true when no active weapon and switch to melee
     * @returns
     */
    setCurWeapIndex(idx: number, forceSwitch = false): void {
        // if current slot is invalid and next too, switch to melee
        if (!this.activeWeapon && !this.weapons[idx].type) {
            idx = WeaponSlot.Melee;

            if (!this.weapons[idx].type) {
                this.weapons[idx].type = "fists";
                this.weapons[idx].cooldown = 0;
            }
            forceSwitch = true;
        }

        if (idx === this._curWeapIdx) return;
        // no swapping while steering a Judge rocket
        const rocket = this.player.activeJudgeRocket;
        if (!forceSwitch && rocket?.alive && rocket.active) return;
        if (this.weapons[idx].type === "") return;

        const curWeaponDef = GameObjectDefs.typeToDefSafe(this.activeWeapon) as
            | GunDef
            | MeleeDef
            | ThrowableDef;

        if (
            curWeaponDef?.type === "gun"
            && curWeaponDef.fireMode === "burst"
            && this.bursts.length
            && !forceSwitch
        ) {
            return;
        }

        if (this.cookingThrowable && idx !== GameConfig.WeaponSlot.Throwable) {
            this.throwThrowable(true);
        }

        this.player.cancelAnim();

        this.player.shotSlowdownTimer = 0;
        this.bursts.length = 0;
        this.meleeAttacks.length = 0;
        this.scheduledReload = false;

        this.player.recoilTicker = 0;

        const curWeapon = this.weapons[this.curWeapIdx];
        const nextWeapon = this.weapons[idx];
        let effectiveSwitchDelay = 0;

        const nextWeaponDef = GameObjectDefs.typeToDef(this.weapons[idx].type) as
            | GunDef
            | MeleeDef
            | ThrowableDef;
        if (curWeapon.type && nextWeapon.type) {
            // ensure that player is still holding both weapons (didnt drop one)

            const swappingToGun = nextWeaponDef.type == "gun";

            effectiveSwitchDelay = swappingToGun ? nextWeaponDef.switchDelay : 0;

            if (this.player.freeSwitchTimer < 0) {
                effectiveSwitchDelay = GameConfig.player.baseSwitchDelay;
                this.player.freeSwitchTimer = GameConfig.player.freeSwitchCooldown;
            }

            if (
                swappingToGun
                && nextWeaponDef.deployGroup !== undefined
                && (curWeaponDef as GunDef).deployGroup !== undefined
                && nextWeaponDef.deployGroup === (curWeaponDef as GunDef).deployGroup
                && curWeapon.cooldown > 0
            ) {
                effectiveSwitchDelay = nextWeaponDef.switchDelay;
            } else if (nextWeaponDef.type === "melee") {
                effectiveSwitchDelay = math.max(
                    nextWeapon.cooldown,
                    nextWeaponDef.switchDelay,
                );
            }

            // kit abilities keep their cooldown through a swap (normal guns keep the quickswitch)
            nextWeapon.cooldown = isKitItem(nextWeapon.type)
                ? math.max(nextWeapon.cooldown, effectiveSwitchDelay)
                : effectiveSwitchDelay;
        }

        this.lastWeaponIdx = this._curWeapIdx;
        this._curWeapIdx = idx;

        this.player.cancelAction();

        this.player.wearingPan = false;
        if (
            this.weapons[WeaponSlot.Melee].type === "pan"
            && this.activeWeapon !== "pan"
        ) {
            this.player.wearingPan = true;
        }

        if (GameConfig.WeaponType[idx] === "gun" && this.weapons[idx].ammo <= 0) {
            this.scheduledReload = true;
        }

        if (idx === this.curWeapIdx && WeaponSlot[idx] == "gun") {
            this.offHand = false;
        }

        if (nextWeaponDef.type === "melee") {
            this.playMeleeDeployAnim();
        }

        this.player.setDirty();
        this.player.weapsDirty = true;
    }

    swapWeaponSlots() {
        const primary = {
            ...this.weapons[WeaponSlot.Primary],
        };
        const secondary = {
            ...this.weapons[WeaponSlot.Secondary],
        };

        this.weapons[WeaponSlot.Primary] = secondary;
        this.weapons[WeaponSlot.Secondary] = primary;

        if (
            this.curWeapIdx == WeaponSlot.Primary
            || this.curWeapIdx == WeaponSlot.Secondary
        ) {
            const newIdx = this.curWeapIdx ^ 1;

            this.lastWeaponIdx = this._curWeapIdx;
            assert(this.weapons[newIdx].type);
            this._curWeapIdx = newIdx;
        }

        this.player.weapsDirty = true;
    }

    setWeapon(idx: number, type: string, ammo: number) {
        const weaponDef = GameObjectDefs.typeToDefSafe(type);
        const isMelee = idx === WeaponSlot.Melee;

        // non melee weapons can be set to empty strings to clear the slot
        if (!isMelee && type !== "") {
            assert(
                weaponDef!.type === "gun"
                    || weaponDef!.type === "melee"
                    || weaponDef!.type === "throwable",
            );
        }
        if (
            isMelee
            && (this.player.animType === GameConfig.Anim.DeployMelee
                || this.player.animType === GameConfig.Anim.IdleMelee)
        ) {
            this.player.cancelAnim();
        }

        // can't wear pan if you're replacing it with another melee
        if (this.weapons[idx].type == "pan") {
            this.player.wearingPan = false;
            this.player.setDirty();
        }

        const newPerk = weaponDef && "perk" in weaponDef ? weaponDef.perk : "";
        const oldDef = GameObjectDefs.typeToDefSafe(this.weapons[idx].type);
        const oldPerk = oldDef && "perk" in oldDef ? oldDef.perk : "";

        if (oldPerk && oldPerk !== newPerk) {
            this.player.removePerk(oldPerk);
            this.player.setDirty();
        }
        if (newPerk && newPerk !== oldPerk) {
            this.player.addPerk(newPerk);
            this.player.setDirty();
        }

        // pan is always "worn" if player has it and any other slot is selected
        if (type == "pan" && this.curWeapIdx != WeaponSlot.Melee) {
            this.player.wearingPan = true;
            this.player.setDirty();
        }

        this.weapons[idx].type = type;
        this.weapons[idx].cooldown = 0;
        this.weapons[idx].ammo = ammo;
        if (weaponDef?.type === "gun") {
            this.weapons[idx].recoilTime = weaponDef.recoilTime;
        }
        if (weaponDef && "switchDelay" in weaponDef) {
            this.weapons[idx].cooldown = weaponDef.switchDelay;
        }

        if (idx === this.curWeapIdx) {
            this.bursts.length = 0;
            this.player.setDirty();
        }

        if (!this.activeWeapon) {
            this.setCurWeapIndex(WeaponSlot.Melee, true);
        }

        this.player.weapsDirty = true;
    }

    bufferInput = false;

    update(dt: number) {
        const player = this.player;

        if (player.downed) {
            return;
        }
        this.bufferInput = false;

        player.freeSwitchTimer -= dt;

        player.recoilTicker += dt;

        this.meleeAnimCooldown -= dt;
        this.throwableCooldown -= dt;

        for (let i = 0; i < this.weapons.length; i++) {
            this.weapons[i].cooldown -= dt;
            this.weapons[i].recoilTime -= dt;
        }

        const itemDef = GameObjectDefs.typeToDef(this.activeWeapon);

        switch (itemDef.type) {
            case "gun": {
                this.gunUpdate(dt);
                break;
            }
            case "melee": {
                this.meleeUpdate(dt);
                break;
            }
            case "throwable": {
                if (player.shootStart && !this.cookingThrowable) {
                    this.cookThrowable();
                }
                break;
            }
        }

        if (this.cookingThrowable) {
            this.cookTicker += dt;
            if (this.curWeapIdx != WeaponSlot.Throwable) {
                this.throwThrowable();
                return;
            }

            if (
                (itemDef.type === "throwable"
                    && itemDef.cookable
                    && this.cookTicker > itemDef.fuseTime) // safety check
                || (!player.shootHold && this.cookTicker > GameConfig.player.cookTime)
            ) {
                this.throwThrowable();
            }
        }

        if (!this.bufferInput) {
            player.shootStart = false;
        }
    }

    gunUpdate(dt: number) {
        const itemDef = GameObjectDefs.typeToDef(this.activeWeapon, "gun");
        const player = this.player;
        const weapon = this.weapons[this.curWeapIdx];

        if (weapon.cooldown <= 0 && this.scheduledReload) {
            this.scheduledReload = false;
            this.tryReload();
        }

        this.holdTime = player.shootHold && weapon.ammo > 0 ? this.holdTime + dt : 0;

        switch (itemDef.fireMode) {
            case "auto":
                if (player.shootHold && weapon.cooldown <= 0) {
                    this.fireWeapon(this.offHand);
                    this.offHand = !this.offHand;
                }
                break;
            case "single":
                if (player.shootStart) {
                    if (weapon.cooldown < 0) {
                        this.fireWeapon(this.offHand);
                        this.offHand = !this.offHand;
                    } else if (weapon.cooldown < 0.1) {
                        this.bufferInput = true;
                    }
                }
                break;
            case "burst":
                if (player.shootHold && weapon.cooldown < 0 && this.payEnergy(itemDef.energyCost)) {
                    weapon.cooldown = 0;
                    for (let i = 0; i < itemDef.burstCount!; i++) {
                        this.bursts.push(weapon.cooldown);
                        weapon.cooldown += itemDef.burstDelay!;
                    }
                    this.offHand = !this.offHand;
                    weapon.cooldown += itemDef.fireDelay;
                }
                for (let i = 0; i < this.bursts.length; i++) {
                    this.bursts[i] -= dt;
                    if (this.bursts[i] <= 0) {
                        this.burstIndex = itemDef.burstCount! - this.bursts.length;
                        this.fireWeapon(this.offHand);
                        this.bursts.splice(i, 1);
                        i--;
                    }
                }
                break;
        }
    }

    meleeUpdate(dt: number) {
        const itemDef = GameObjectDefs.typeToDef(this.activeWeapon, "melee");
        const player = this.player;
        const attack = itemDef.attack;
        const weapon = this.weapons[this.curWeapIdx];

        if (
            player.animType !== GameConfig.Anim.Melee
            && (player.shootStart || (player.shootHold && itemDef.autoAttack))
            && weapon.cooldown < 0
            && this.payEnergy(itemDef.energyCost)
        ) {
            this.player.cancelAction();
            // abilities in the melee slot
            if (this.activeWeapon === "kit_ultron_minions") this.player.spawnMinions();
            if (this.activeWeapon === "kit_spider_dodge") {
                this.player.dodgeTime = SpiderDodgeTime;
                // the faster webs start straight away
                this.player.autoFireTimer = 0;
                this.player.setDirty();
            }
            if (this.activeWeapon === "kit_warmachine_secondfire") {
                // the left shoulder mount switches on for its duration
                this.player.kitEnhanceTime = KitDefs.warmachine.mounts!.secondDuration;
                this.player.setDirty();
            }
            if (this.activeWeapon === "kit_wizard_enhance") {
                this.player.kitEnhanceTime = 9;
                this.player.setDirty();
            }

            this.player.playAnim(GameConfig.Anim.Melee, attack.cooldownTime);
            weapon.cooldown = attack.cooldownTime * (this.player.charmed ? 2 : 1)
                * (this.player.champ?.attackCooldownMult() ?? 1);
            this.meleeAttacks = [...attack.damageTimes];
            this.fireSwingShot();
        }

        for (let i = 0; i < this.meleeAttacks.length; i++) {
            this.meleeAttacks[i] -= dt;
            if (this.meleeAttacks[i] <= 0) {
                this.meleeDamage();
                this.meleeAttacks.splice(i, 1);
                i--;
            }
        }
    }

    playMeleeDeployAnim() {
        if (this.player.animType !== GameConfig.Anim.None) return;
        if (this.player.curWeapIdx !== GameConfig.WeaponSlot.Melee) return;
        const def = GameObjectDefs.typeToDef(this.activeWeapon, "melee");
        if (!def.anim.deployAnims?.length) return;
        if (this.player.downed) return;

        this.player.playAnim(GameConfig.Anim.DeployMelee, def.anim.deployAnimTime + 0.1);
    }

    playMeleeIdleAnim() {
        if (this.player.animType !== GameConfig.Anim.None) return;
        if (this.player.curWeapIdx !== GameConfig.WeaponSlot.Melee) return;
        if (this.meleeAnimCooldown > 0) return;
        const def = GameObjectDefs.typeToDef(this.activeWeapon, "melee");
        if (!def.anim.idleAnims?.length) return;
        if (this.player.downed) return;

        this.player.playAnim(GameConfig.Anim.IdleMelee, def.anim.idleAnimTime + 0.1);
        this.meleeAnimCooldown = def.anim.idleAnimTime + 1;
    }

    getAmmoStats(weaponDef: GunDef): {
        maxClip: number;
        maxReload: number;
        maxReloadAlt: number | undefined;
    } {
        if (this.player.hasPerk("firepower")) {
            return {
                maxClip: weaponDef.extendedClip,
                maxReload: weaponDef.extendedReload,
                maxReloadAlt: weaponDef.extendedReloadAlt,
            };
        }

        return {
            maxClip: weaponDef.maxClip,
            maxReload: weaponDef.maxReload,
            maxReloadAlt: weaponDef.maxReloadAlt,
        };
    }

    isInfinite(weaponDef: GunDef): boolean {
        return (
            !weaponDef.ignoreEndlessAmmo
            && (weaponDef.ammoInfinite || this.player.hasPerk("endless_ammo"))
        );
    }

    /**
     * Try to schedule a reload action if all conditions are met
     */
    tryReload() {
        if (
            this.player.actionType === GameConfig.Action.Reload
            || this.player.actionType === GameConfig.Action.ReloadAlt
        ) {
            return;
        }
        const weaponDef = GameObjectDefs.typeToDef(this.activeWeapon, "gun");

        if (
            this.player.actionType == GameConfig.Action.Revive
            || this.player.actionType == GameConfig.Action.UseItem
            || this.curWeapIdx == WeaponSlot.Melee
            || this.curWeapIdx == WeaponSlot.Throwable
        ) {
            return;
        }

        const isInfinite = this.isInfinite(weaponDef);

        let invAmmo = Infinity;

        if (!isInfinite) {
            if (this.player.invManager.isValid(weaponDef.ammo)) {
                invAmmo = this.player.invManager.get(weaponDef.ammo);
                if (invAmmo <= 0) return;
            } else {
                // not a valid ammo type and not an infinite ammo gun (e.g bugle)
                // so dont try to reload it
                // since bugle reloads are managed in a timer elsewhere
                return;
            }
        }

        const curWeapon = this.weapons[this.curWeapIdx];
        const stats = this.getAmmoStats(weaponDef);

        // gun is full
        if (curWeapon.ammo >= stats.maxClip) {
            return;
        }
        // kit guns reload with energy
        if (weaponDef.reloadEnergy && this.player.energy < weaponDef.reloadEnergy) return;

        let duration = weaponDef.reloadTime;
        let action: number = GameConfig.Action.Reload;

        // schedule an alt reload if ammo is 0 and we have more inventory ammo
        // than a single reload
        // so if you have a mosin with 0 ammo and 1 ammo in the inventory it will
        // schedule the single bullet reload instead of longer 5 bullets reload
        if (
            weaponDef.reloadTimeAlt
            && this.weapons[this.curWeapIdx].ammo === 0
            && invAmmo > stats.maxReload
        ) {
            duration = weaponDef.reloadTimeAlt!;
            action = GameConfig.Action.ReloadAlt;
        }

        this.player.doAction(this.activeWeapon, action, duration);
    }

    /**
     * called when reload action completed, actually updates all state variables
     */
    reload(curWeapIdx = this.curWeapIdx, fullReload = false): void {
        if (!this.weapons[curWeapIdx].type) return; // prevent rare bug
        const reloadEnergy = GameObjectDefs.typeToDefSafe(this.weapons[curWeapIdx].type)?.type === "gun"
            ? GameObjectDefs.typeToDef(this.weapons[curWeapIdx].type, "gun").reloadEnergy
            : undefined;
        if (reloadEnergy) {
            if (this.player.energy < reloadEnergy) return;
            this.player.energy -= reloadEnergy;
            this.player.energyDirty = true;
        }
        const weapon = this.weapons[curWeapIdx];
        const weaponDef = GameObjectDefs.typeToDef(weapon.type, "gun");
        const ammoStats = this.getAmmoStats(weaponDef);
        const activeWeaponAmmo = weapon.ammo;

        let maxReload: number;
        if (fullReload) {
            maxReload = ammoStats.maxClip;
        } else if (
            this.player.actionType === GameConfig.Action.ReloadAlt
            && ammoStats.maxReloadAlt
        ) {
            maxReload = ammoStats.maxReloadAlt;
        } else {
            maxReload = ammoStats.maxReload;
        }

        const spaceLeft = ammoStats.maxClip - activeWeaponAmmo;
        if (spaceLeft <= 0) return;

        let amountToReload = math.min(maxReload, spaceLeft);

        if (amountToReload <= 0) return;

        const isInfinite = this.isInfinite(weaponDef);
        // isValid check because some ammo types are not "valid" as in "they are in the player backpack"
        // eg potato and bugle ammo
        if (!isInfinite && this.player.invManager.isValid(weaponDef.ammo)) {
            amountToReload = this.player.invManager.take(weaponDef.ammo, amountToReload);
            if (amountToReload <= 0) return;
        }

        weapon.ammo += amountToReload;

        // reload again if we still have ammo in the inventory but didnt fill the weapon
        // for single reload shotguns
        if (
            weapon.ammo < ammoStats.maxClip
            && (isInfinite || this.player.invManager.has(weaponDef.ammo as InventoryItem))
        ) {
            this.player.reloadAgain = true;
        }

        this.player.weapsDirty = true;
        this.bursts.length = 0;
    }

    private _dropGun(weapIdx: number): void {
        const weap = this.weapons[weapIdx];
        if (!weap || !weap.type) return;
        const weaponDef = GameObjectDefs.typeToDef(weap.type, "gun");
        if (!weaponDef) return;
        if (weaponDef.noDrop) return;
        const weaponAmmoType = weaponDef.ammo;
        const weaponAmmoCount = weap.ammo;

        let item = weap.type;

        let amountToDrop = 0;
        if (!this.isInfinite(weaponDef)) {
            const res = this.player.invManager.give(
                weaponAmmoType as InventoryItem,
                weaponAmmoCount,
            );
            amountToDrop = res.remaining;
        }

        if (weaponDef.isDual) {
            item = item.replace("_dual", "");
            this.player.dropLoot(item, 0, true);
        }
        this.player.dropLoot(item, amountToDrop, true);
        this.player.weapsDirty = true;
    }

    dropGun(weapIdx: number): void {
        const def = GameObjectDefs.typeToDefSafe(this.weapons[weapIdx].type) as GunDef | undefined;
        if (def?.noDrop) return;

        this._dropGun(weapIdx);
        this.setWeapon(weapIdx, "", 0);
    }

    replaceGun(idx: number, type: string): void {
        const oldDef = GameObjectDefs.typeToDefSafe(this.weapons[idx].type) as GunDef | undefined;
        let ammo = 0;

        if (oldDef) {
            ammo = oldDef.dualWieldType === type ? this.weapons[idx].ammo : 0;
            if (oldDef.dualWieldType !== type) {
                this._dropGun(idx);
            }
        }

        this.setWeapon(idx, type, ammo);
    }

    dropMelee(): void {
        const slot = WeaponSlot.Melee;
        if (this.weapons[slot].type != "fists") {
            this.player.dropLoot(this.weapons[slot].type);
            this.setWeapon(slot, "fists", 0);
            if (slot === this.curWeapIdx) this.player.setDirty();
        }
    }

    /**
     * Checks if player can drop flare gun, if holding one.
     * @param weapIdx The slot index.
     */
    canDropFlare(weapIdx: number): boolean {
        const def = GameObjectDefs.typeToDefSafe(this.weapons[weapIdx].type) as GunDef;
        if (!def) return false;

        if (this.player.role !== "leader") return true;

        return def.ammo !== "flare" || this.player.hasFiredFlare;
    }

    /**
     * Used when firepower perk is removed
     */
    clampGunsAmmo() {
        for (let i = 0; i < this.weapons.length; i++) {
            const weap = this.weapons[i];
            const def = GameObjectDefs.typeToDefSafe(weap.type);
            if (def?.type !== "gun") continue;

            const ammo = this.getAmmoStats(def);
            const ammoType = def.ammo;
            const diff = weap.ammo - ammo.maxClip;
            if (diff <= 0) continue;

            weap.ammo -= diff;
            this.player.weapsDirty = true;
            if (this.player.invManager.isValid(ammoType)) {
                this.player.invManager.giveAndDrop(ammoType, diff);
            }
        }
    }

    isBulletSaturated(ammo: string): number {
        let totalDamageMult = 1;
        if (this.player.lastBreathActive) {
            totalDamageMult *= PerkProperties.final_bugle.bonusDamageMult;
        }

        // avoid other checks if player has no perks
        if (!this.player.perks.length) return totalDamageMult;

        const perks = ["bonus_assault", "treat_super"];
        if (perks.some((p) => this.player.hasPerk(p))) {
            totalDamageMult *= 1.08;
        }

        if (PerkProperties.ammoBonuses[ammo]) {
            for (const perk of this.player.perks) {
                if (PerkProperties.ammoBonuses[ammo].includes(perk.type)) {
                    totalDamageMult *= PerkProperties.ammoBonusDamageMult;
                }
            }
        }

        return totalDamageMult;
    }

    /** which shot of the current burst is being fired */
    burstIndex = 0;

    /** kit abilities: spend the energy, or say there isn't enough */
    payEnergy(cost: number | undefined): boolean {
        if (!cost) return true;
        if (this.player.energy < cost) return false;
        this.player.energy -= cost;
        this.player.energyDirty = true;
        return true;
    }

    /**
     * The second volley of Iron Man's flight: the same ring of rockets as the first, from where he is now, aimed
     * where he is looking now. It costs nothing and doesn't care which weapon he is holding by then.
     */
    fireRingWave(gunType: string) {
        const player = this.player;
        if (player.dead) return;
        const def = GameObjectDefs.typeToDef(gunType, "gun");
        for (let i = 0; i < def.bulletCount; i++) {
            const dir = v2.rotate(player.dir, math.deg2rad((i / def.bulletCount) * 360));
            this.player.game.bulletBarn.fireBullet({
                playerId: player.__id,
                bulletType: def.bulletType,
                gameSourceType: gunType,
                ghost: !!def.ghostShots,
                damageType: GameConfig.DamageType.Player,
                pos: v2.add(player.pos, v2.mul(dir, player.rad + 0.5)),
                dir,
                layer: player.aimLayer,
                distance: Number.MAX_VALUE,
                damageMult: 1,
                speedMult: 1,
                distanceMult: 1,
                shotFx: i === 0,
                shotOffhand: false,
                trailSaturated: false,
                trailSmall: false,
                trailThick: false,
                reflectCount: 0,
                lastShot: false,
                reflectObjId: player.obstacleOutfit?.__id,
            });
        }
    }

    fireWeapon(offHand: boolean, forceFire?: boolean) {
        const itemDef = GameObjectDefs.typeToDef(this.activeWeapon, "gun");

        const weapon = this.weapons[this.curWeapIdx];
        this.scheduledReload = weapon.ammo <= 1;

        if (weapon.ammo <= 0) return;
        // only one Judge rocket in the air at a time
        if (this.activeWeapon === "pg_judge") {
            const live = this.player.activeJudgeRocket;
            if (live?.alive && live.active && live.player === this.player) return;
        }
        // abilities pay per use (a burst pays once, when it starts)
        if (itemDef.fireMode !== "burst" && !this.payEnergy(itemDef.energyCost)) return;

        const firstShotAccuracy = weapon.recoilTime <= 0;

        weapon.cooldown = itemDef.fireDelay * (this.player.charmed ? 2 : 1)
            * (this.player.champ?.attackCooldownMult() ?? 1);
        if (this.player.champ && this.activeWeapon === this.player.champ.basic) {
            this.player.champ.onBasicShot(this.player.dir);
        }
        // minigun: starts 3x slower and spins up to full rate
        if (itemDef.spinUp) {
            weapon.cooldown *= math.lerp(math.min(this.holdTime / itemDef.spinUp, 1), 3, 1);
        }
        weapon.recoilTime = itemDef.recoilTime;

        // Check firing location
        if (itemDef.outsideOnly && this.player.indoors && !forceFire) {
            const msg = new net.PickupMsg();
            msg.type = net.PickupMsgType.GunCannotFire;
            this.player.client.sendMsg(net.MsgType.Pickup, msg);
            return;
        }

        const direction = this.player.dir;
        const toMouseLen = this.player.toMouseLen;

        // kit weapons never slow their owner down
        this.player.shotSlowdownTimer = this.player.kit === "default" ? itemDef.fireDelay : 0;

        this.player.cancelAction();

        // bots never empty their clip, so they never reload
        if (!this.player.botBrain && itemDef.energyCost === undefined) weapon.ammo--;
        this.player.weapsDirty = true;
        // Iron Man's rockets take him into the air for a while
        if (itemDef.flight) this.player.startFlight(itemDef.flight, this.activeWeapon);
        // Wolverine's dash: he slides 16 tiles alongside his streak (walls still stop him)
        if (this.activeWeapon === "kit_wolverine_dash") {
            const bullet = GameObjectDefs.typeToDef(itemDef.bulletType, "bullet");
            this.player.webPull = {
                target: v2.add(this.player.pos, v2.mul(this.player.dir, WolverineDashDistance)),
                speed: bullet.speed,
                time: WolverineDashDistance / bullet.speed + 0.1,
            };
        }

        const collisionLayer = util.toGroundLayer(this.player.layer);
        const bulletLayer = this.player.aimLayer;

        const gunOff = itemDef.isDual
            ? itemDef.dualOffset! * (offHand ? 1.0 : -1.0)
            : itemDef.barrelOffset;
        const gunPos = v2.add(this.player.pos, v2.mul(v2.perp(direction), gunOff));
        const gunLen = itemDef.barrelLength;

        // Compute gun pos clipping if there is an obstacle in the way
        // @NOTE: Add an extra 1.5 to account for shotgun shots being
        //        offset to spawn infront of the gun
        let clipLen = gunLen + 1.5;
        let clipPt = v2.add(gunPos, v2.mul(direction, clipLen));
        let clipNrm = v2.mul(direction, -1.0);
        const aabb = collider.createAabbExtents(
            this.player.pos,
            v2.create(this.player.rad + gunLen + 1.5),
        );

        const nearbyObjs = this.player.game.grid.intersectCollider(aabb);

        for (let i = 0; i < nearbyObjs.length; i++) {
            const obj = nearbyObjs[i];
            if (obj.__type !== ObjectType.Obstacle) continue;

            if (
                obj.dead
                || !obj.collidable
                || !util.sameLayer(obj.layer, bulletLayer)
                || obj.height < GameConfig.bullet.height
            ) {
                continue;
            }
            // @NOTE: The player can sometimes be inside a collider.
            // This can happen when the bulletLayer is different from
            // the player's layer, ie when the player is firing down a
            // stairwell. In this case we'll just ignore that particular
            // collider.
            // Create fake circle for detecting collision between guns and map objects.
            if (
                !util.sameLayer(collisionLayer, bulletLayer)
                && collider.intersectCircle(obj.collider, gunPos, GameConfig.player.radius)
            ) {
                continue;
            }

            const res = collider.intersectSegment(obj.collider, gunPos, clipPt);
            if (res) {
                const colPos = v2.add(res.point, v2.mul(res.normal, 0.01));
                const newLen = v2.length(v2.sub(colPos, gunPos));
                if (newLen < clipLen) {
                    clipLen = newLen;
                    clipPt = colPos;
                    clipNrm = res.normal;
                }
            }
        }

        //
        // Perks
        //
        const hasExplosive = this.player.hasPerk("explosive");
        const hasSplinter = this.player.hasPerk("splinter");
        const hasApRounds = this.player.hasPerk("ap_rounds");
        const hasHighVelocity = this.player.hasPerk("high_velocity");
        const hasCombatStims = this.player.combatStimsActive;
        const shouldApplyChambered = this.player.hasPerk("chambered")
            && itemDef.ammo !== "12gauge"
            && (weapon.ammo === 0 // ammo count already decremented
                || weapon.ammo === this.getAmmoStats(itemDef).maxClip - 1);

        let damageMult = 1;
        if (hasSplinter) {
            damageMult *= PerkProperties.splinter.mainDamageMult;
        }

        const saturated = this.isBulletSaturated(itemDef.ammo);
        if (saturated) {
            damageMult *= saturated;
        }

        if (this.player.combatStimsActive) {
            damageMult *= PerkProperties.combat_stims.bonusDamageMult;
        }

        if (shouldApplyChambered) {
            damageMult *= PerkProperties.chambered.damageMult;
        }

        //
        // Movement spread
        //
        let spread = itemDef.shotSpread ?? 0;
        const travel = v2.sub(this.player.pos, this.player.posOld);
        if (v2.length(travel) > 0.01) {
            spread += itemDef.moveSpread ?? 0;
        }

        // Recoil currently just cancels spread if you shoot slow enough.
        if (this.player.recoilTicker >= itemDef.recoilTime) {
            spread = 0.0;
        }
        this.player.recoilTicker = 0.0;
        // a bot's rolled hit goes exactly where it aimed
        if (this.player.botBrain?.aimLocked) spread = 0.0;

        let bulletType = itemDef.bulletType;

        let speedMult = 1;
        let distanceMult = 1;
        if (itemDef.ammo == "9mm" && this.player.hasPerk("bonus_9mm")) {
            spread *= PerkProperties.bonus_9mm.spreadMul;
            speedMult = PerkProperties.bonus_9mm.speedMult;
            distanceMult = PerkProperties.bonus_9mm.distanceMult;
        }

        if (this.player.hasPerk("high_velocity")) {
            speedMult *= PerkProperties.high_velocity.speedMult;
            distanceMult *= PerkProperties.high_velocity.distanceMult;
        }

        if (this.player.hasPerk("bonus_assault")) {
            speedMult *= PerkProperties.bonus_assault.speedMult;
        }

        const bulletCount = itemDef.bulletCount;
        const jitter = itemDef.jitter ?? 0.25;

        const bonus45 = itemDef.ammo === "45acp" && this.player.hasPerk("bonus_45");

        for (let i = 0; i < bulletCount; i++) {
            const empowered45 = bonus45 && Math.random() < PerkProperties.bonus_45.empoweredChance;
            if (empowered45) {
                damageMult *= PerkProperties.bonus_45.empoweredDamageMult;
                speedMult *= PerkProperties.bonus_45.empoweredSpeedMult;
            }

            const deviation = itemDef.shotAngles
                ? (itemDef.shotAngles[i] ?? 0)
                : itemDef.ringShot
                ? (i / bulletCount) * 360
                : itemDef.fanShot
                ? (bulletCount > 1 ? i / (bulletCount - 1) - 0.5 : 0) * spread
                : (empowered45 || firstShotAccuracy)
                ? 0
                : util.random(-0.5, 0.5) * (spread || 0);
            let shotDir = v2.rotate(direction, math.deg2rad(deviation));

            // Compute shot start position
            let bltStart = v2.add(gunPos, v2.mul(direction, gunLen));
            if (i > 0) {
                // Add shotgun jitter
                const offset = v2.mul(
                    v2.create(util.random(-jitter, jitter), util.random(-jitter, jitter)),
                    1.11,
                );
                bltStart = v2.add(bltStart, offset);
            }

            let toBlt = v2.sub(bltStart, gunPos);
            let toBltLen = v2.length(toBlt);
            toBlt = toBltLen > 0.00001 ? v2.div(toBlt, toBltLen) : v2.create(1.0, 0.0);
            // Clip with nearly obstacle plane
            // @TODO: This doesn't handle interior corners properly;
            //        bullets may still escape if one spawns closer
            //        to a different clipping plane than the gun end.
            const dn = v2.dot(toBlt, clipNrm);
            if (dn < -0.00001) {
                const t = v2.dot(v2.sub(clipPt, gunPos), clipNrm) / dn;
                if (t < toBltLen) {
                    toBltLen = t - 0.1;
                }
            }

            // ring shots start just outside the shooter, each on its own side
            let shotPos = itemDef.ringShot
                ? v2.add(this.player.pos, v2.mul(shotDir, this.player.rad + 0.5))
                : v2.add(gunPos, v2.mul(toBlt, toBltLen));
            const shotBulletType = itemDef.bulletTypes?.[itemDef.fireMode === "burst" ? this.burstIndex : i]
                ?? bulletType;
            // Star Blast: shots start side by side and close in on the point at the end of their range
            if (itemDef.converge && itemDef.burstCount) {
                const t = this.burstIndex / Math.max(itemDef.burstCount - 1, 1) - 0.5;
                shotPos = v2.add(shotPos, v2.mul(v2.perp(direction), t * itemDef.converge));
                const range = GameObjectDefs.typeToDef(shotBulletType, "bullet").distance;
                shotDir = v2.normalizeSafe(v2.sub(v2.add(gunPos, v2.mul(direction, range)), shotPos), direction);
            }
            // an enhanced Wizard's spells go through walls and home in on the marked enemies
            const wizardGhost = this.player.kit === "wizard" && this.player.kitEnhanceTime > 0;
            // Iron Man's rockets fly through walls too
            const ghost = wizardGhost || !!itemDef.ghostShots;
            const marked = wizardGhost ? [...this.player.wizardMarks].filter((p) => !p.dead) : [];
            const ghostTarget = marked.length
                ? marked.reduce((
                    a,
                    b,
                ) => (v2.length(v2.sub(a.pos, shotPos)) < v2.length(v2.sub(b.pos, shotPos)) ? a : b))
                : undefined;
            let distance = Number.MAX_VALUE;
            if (itemDef.toMouseHit) {
                distance = math.max(toMouseLen - gunLen, 0.0);
            }

            const params: BulletParams = {
                playerId: this.player.__id,
                bulletType: shotBulletType,
                gameSourceType: this.activeWeapon,
                ghost,
                // only shots that already seek get the marked enemy; a beam keeps flying straight
                homingTargetId: GameObjectDefs.typeToDef(shotBulletType, "bullet").homing
                    ? ghostTarget?.__id
                    : undefined,
                damageType: GameConfig.DamageType.Player,
                pos: shotPos,
                dir: shotDir,
                layer: bulletLayer,
                distance,
                clipDistance: itemDef.toMouseHit,
                damageMult,
                speedMult,
                distanceMult,
                shotFx: i === 0,
                shotOffhand: offHand,
                trailSaturated: shouldApplyChambered || saturated > 1,
                trailSmall: false,
                trailThick: shouldApplyChambered || empowered45,
                reflectCount: 0,
                splinter: hasSplinter,
                apRounds: hasApRounds,
                highVelocity: hasHighVelocity,
                combatStims: hasCombatStims,
                lastShot: weapon.ammo <= 0,
                reflectObjId: this.player.obstacleOutfit?.__id,
                onHitFx: hasExplosive ? "explosion_rounds" : undefined,
            };

            // Last Prism: six beams fanned out that close into one beam doing 3x damage
            if (itemDef.prismCharge) {
                const t = math.min(this.holdTime / itemDef.prismCharge, 1);
                if (t >= 1) {
                    params.damageMult *= 3;
                } else {
                    for (let k = 0; k < 6; k++) {
                        const ang = math.deg2rad((k - 2.5) * 8 * (1 - t));
                        this.player.game.bulletBarn.fireBullet({
                            ...params,
                            dir: v2.rotate(shotDir, ang),
                            shotFx: k === 0,
                        });
                    }
                    continue;
                }
            }

            this.player.game.bulletBarn.fireBullet(params);

            // Shoot a projectile if defined
            let projectile: Projectile | undefined;
            if (itemDef.projType) {
                const projDef = GameObjectDefs.typeToDef(itemDef.projType, "throwable");

                const vel = v2.mul(shotDir, projDef.throwPhysics.speed);
                projectile = this.player.game.projectileBarn.addProjectile(
                    this.player.__id,
                    itemDef.projType,
                    shotPos,
                    0.5,
                    bulletLayer,
                    vel,
                    projDef.fuseTime,
                    GameConfig.DamageType.Player,
                    shotDir,
                    this.activeWeapon,
                );
            }

            // Splinter creates additional bullets that deviate on either side of
            // the main bullet
            const splinterSpread = math.max(spread, 1.0);
            if (hasSplinter && !itemDef.noSplinter) {
                for (let j = 0; j < 2; j++) {
                    const sParams = { ...params };

                    const deviation = util.random(0.2, 0.25)
                        * splinterSpread
                        * (j % 2 === 0 ? -1.0 : 1.0);
                    sParams.dir = v2.rotate(sParams.dir, math.deg2rad(deviation));
                    sParams.lastShot = false;
                    sParams.shotFx = false;
                    sParams.trailSmall = true;
                    sParams.damageMult *= PerkProperties.splinter.splitsDamageMult;

                    this.player.game.bulletBarn.fireBullet(sParams);
                    //
                    if (projectile) {
                        this.player.game.projectileBarn.addProjectile(
                            this.player.__id,
                            projectile.type,
                            shotPos,
                            0.5,
                            bulletLayer,
                            v2.rotate(projectile.vel, math.deg2rad(deviation)),
                            projectile.fuseTime,
                            GameConfig.DamageType.Player,
                            sParams.dir,
                        );
                    }
                }
            }
        }

        if (this.activeWeapon == "bugle" && this.player.hasPerk("inspiration")) {
            this.player.playBugle();
        }

        if (bulletType === "bullet_flare" && this.player.role === "leader") {
            this.player.hasFiredFlare = true;
        }

        if (
            this.player.game.map.factionMode
            && !this.player.game.playerBarn.players.every(
                (p) =>
                    p.teamId === this.player.teamId
                    || p.dead
                    || p.disconnected
                    || v2.distance(p.pos, this.player.pos) > p.zoom,
            )
        ) {
            this.player.timeUntilHidden = 1;
        }
    }

    getMeleeCollider() {
        const meleeDef = GameObjectDefs.typeToDef(this.activeWeapon, "melee");
        const rot = Math.atan2(this.player.dir.y, this.player.dir.x);

        const pos = v2.add(
            meleeDef.attack.offset,
            v2.mul(v2.create(1, 0), this.player.scale - 1),
        );
        const rotated = v2.add(this.player.pos, v2.rotate(pos, rot));
        const rad = meleeDef.attack.rad;
        return collider.createCircle(rotated, rad);
    }

    /** Terraria / Pixel Gun 3D swords fire their own game's projectile with each swing */
    fireSwingShot(): void {
        const shot = SwingShots[this.activeWeapon];
        if (!shot) return;
        const player = this.player;
        const count = shot.count ?? 1;
        // Zenith: the swords share out the enemies around the cursor, nearest first
        const cursorEnemies = shot.toCursor ? this.enemiesNear(player.mousePos, 20) : [];
        for (let i = 0; i < count; i++) {
            const angle = math.deg2rad((i - (count - 1) / 2) * (shot.spread ?? 0));
            let pos = v2.add(player.pos, v2.mul(player.dir, 1.5));
            let dir = v2.rotate(player.dir, angle);
            let distance: number | undefined;
            let homingId = 0;
            if (shot.toCursor) {
                // Zenith: every sword converges on the cursor, anywhere on screen, and swords lock onto
                // an enemy within 20 of it. A boomerang turns at half its distance, so that's twice the trip.
                const k = i - (count - 1) / 2;
                let target = v2.add(player.mousePos, v2.mul(v2.perp(player.dir), k * 1.5));
                const enemy = cursorEnemies.length ? cursorEnemies[i % cursorEnemies.length] : undefined;
                if (enemy) {
                    target = enemy.pos;
                    homingId = enemy.__id;
                }
                dir = v2.normalizeSafe(v2.sub(target, pos), player.dir);
                // fan the swords out a little on the way so they don't overlap
                dir = v2.rotate(dir, math.deg2rad(k * (shot.spread ?? 0)));
                distance = math.clamp(v2.length(v2.sub(target, pos)) * 2, 4, 140);
            }
            if (shot.fromSky) {
                // a star lands on the aim point, falling in from behind and to the side
                const target = v2.add(player.mousePos, v2.mul(v2.perp(player.dir), (i - (count - 1) / 2) * 3));
                pos = v2.add(target, v2.create(-10, 18));
                dir = v2.normalize(v2.sub(target, pos));
                distance = v2.length(v2.sub(target, pos));
            }
            const bullet = player.game.bulletBarn.fireBullet({
                playerId: player.__id,
                bulletType: shot.bullet,
                gameSourceType: this.activeWeapon,
                damageType: GameConfig.DamageType.Player,
                pos,
                dir,
                layer: player.layer,
                distance,
                clipDistance: shot.fromSky || shot.toCursor,
                damageMult: 1,
                shotFx: false,
                reflectCount: 0,
            });
            if (homingId) bullet.homingId = homingId;
        }
        // a wide wave: parallel shots across its width, spaced wider than a player so nobody is hit twice
        for (const off of shot.lanes?.offsets ?? []) {
            player.game.bulletBarn.fireBullet({
                playerId: player.__id,
                bulletType: shot.lanes!.bullet,
                gameSourceType: this.activeWeapon,
                damageType: GameConfig.DamageType.Player,
                pos: v2.add(v2.add(player.pos, v2.mul(player.dir, 1.5)), v2.mul(v2.perp(player.dir), off)),
                dir: player.dir,
                layer: player.layer,
                damageMult: 1,
                shotFx: false,
                reflectCount: 0,
            });
        }
    }

    /** living enemies within rad of a point, nearest first */
    enemiesNear(pos: Vec2, rad: number): Player[] {
        return this.player.game.playerBarn.livingPlayers
            .filter((p) =>
                p !== this.player
                && p.teamId !== this.player.teamId
                && util.sameLayer(p.layer, this.player.layer)
                && v2.length(v2.sub(p.pos, pos)) < rad
            )
            .sort((a, b) => v2.length(v2.sub(a.pos, pos)) - v2.length(v2.sub(b.pos, pos)));
    }

    meleeDamage(): void {
        const meleeDef = GameObjectDefs.typeToDef(this.activeWeapon, "melee");

        const meleeCol = this.getMeleeCollider();
        const meleeDist = meleeCol.rad + v2.length(v2.sub(this.player.pos, meleeCol.pos));

        const hits: Array<{
            obj: GameObject;
            prio: number;
            pos: Vec2;
            pen: number;
            dir: Vec2;
        }> = [];

        const objs = this.player.game.grid.intersectCollider(meleeCol);

        const obstacles = objs.filter((obj) => {
            return obj.__type === ObjectType.Obstacle && coldet.test(obj.collider, meleeCol);
        }) as Obstacle[];

        // Obstacles
        for (let i = 0; i < obstacles.length; i++) {
            const obstacle = obstacles[i];
            if (obstacle.dead || obstacle.isSkin) continue;
            if (obstacle.height < GameConfig.player.meleeHeight) continue;
            if (!util.sameLayer(obstacle.layer, this.player.layer & 1)) continue;

            let res = collider.intersectCircle(
                obstacle.collider,
                meleeCol.pos,
                meleeCol.rad,
            );
            if (!res) continue;

            // Certain melee weapons should perform a more expensive wall check
            // to not hit obstacles behind walls.
            if (meleeDef.cleave) {
                const meleeDir = v2.normalizeSafe(
                    v2.sub(obstacle.pos, this.player.pos),
                    v2.create(1, 0),
                );
                const wallCheck = collisionHelpers.intersectSegment(
                    obstacles,
                    this.player.pos,
                    meleeDir,
                    meleeDist,
                    obstacle.height,
                    this.player.layer,
                    false,
                );
                if (wallCheck && wallCheck.id !== obstacle.__id) {
                    continue;
                }
            }
            const closestPt = v2.add(
                meleeCol.pos,
                v2.mul(v2.neg(res.dir), meleeCol.rad - res.pen),
            );
            hits.push({
                obj: obstacle,
                pen: res.pen,
                prio: 1,
                pos: closestPt,
                dir: res.dir,
            });
        }

        // Players
        for (let i = 0; i < objs.length; i++) {
            const playerCol = objs[i];
            if (playerCol.__type !== ObjectType.Player) continue;
            if (playerCol.__id === this.player.__id || playerCol.dead || playerCol.untargetable) continue;
            if (!util.sameLayer(playerCol.layer, this.player.layer)) continue;

            const res = coldet.intersectCircleCircle(
                meleeCol.pos,
                meleeCol.rad,
                playerCol.pos,
                playerCol.rad,
            );
            if (!res) continue;
            if (playerCol.teamId !== this.player.teamId && playerCol.botBrain?.phaseMelee()) continue;

            const meleeDir = v2.normalizeSafe(
                v2.sub(playerCol.pos, this.player.pos),
                v2.create(1, 0),
            );

            const lineRes = coldet.intersectSegmentCircle(
                this.player.pos,
                v2.add(this.player.pos, v2.mul(meleeDir, meleeDist)),
                playerCol.pos,
                playerCol.rad,
            );
            const pt = lineRes ? lineRes.point : playerCol.pos;
            const distToPlayer = v2.length(v2.sub(pt, this.player.pos));

            const distToObstacle = collisionHelpers.intersectSegmentDist(
                obstacles,
                this.player.pos,
                meleeDir,
                meleeDist,
                GameConfig.player.meleeHeight,
                this.player.layer,
                false,
            );

            if (distToObstacle < distToPlayer) continue;

            hits.push({
                obj: playerCol,
                pen: res.pen,
                prio: playerCol.teamId === this.player.teamId ? 2 : 0,
                pos: v2.copy(playerCol.pos),
                dir: meleeDir,
            });
        }

        hits.sort((a, b) => {
            if (a.prio == b.prio) {
                return b.pen - a.pen;
            }
            return a.prio - b.prio;
        });

        let hitCount = hits.length;
        if (!meleeDef.cleave) {
            hitCount = math.min(hitCount, 1);
        }

        for (let i = 0; i < hitCount; i++) {
            const hit = hits[i];
            const obj = hit.obj;

            if (obj.__type === ObjectType.Obstacle) {
                obj.damage({
                    amount: meleeDef.damage * meleeDef.obstacleDamage,
                    gameSourceType: this.activeWeapon,
                    damageType: GameConfig.DamageType.Player,
                    source: this.player,
                    dir: v2.copy(this.player.dir),
                    weaponSourceType: this.activeWeapon,
                });
                if (obj.interactable) obj.interact(this.player);
            } else if (obj.__type === ObjectType.Player) {
                obj.damage({
                    amount: meleeDef.damage,
                    gameSourceType: this.activeWeapon,
                    damageType: GameConfig.DamageType.Player,
                    source: this.player,
                    dir: hit.dir,
                });
                if (obj.teamId !== this.player.teamId) {
                    if (this.activeWeapon === "lol_sundered_sky") {
                        this.player.health = Math.min(this.player.health + 40, this.player.maxHealth);
                        this.player.setDirty();
                    } else if (this.activeWeapon === "lol_eclipse") {
                        this.player.eclipseHitCount = (this.player.eclipseHitCount ?? 0) + 1;
                        if (this.player.eclipseHitCount % 2 === 0) {
                            this.player.shield = Math.min((this.player.shield ?? 0) + 50, this.player.maxShield || 200);
                            this.player.shieldDirty = true;
                            this.player.setDirty();
                        }
                    }
                }
            }
        }
    }

    cookThrowable(): void {
        if (this.cookingThrowable || this.throwableCooldown > 0) {
            return;
        }

        this.player.cancelAction();
        const itemDef = GameObjectDefs.typeToDef(this.activeWeapon, "throwable");

        this.cookTicker = 0;

        this.player.playAnim(
            GameConfig.Anim.Cook,
            itemDef.cookable ? itemDef.fuseTime : Infinity,
        );
    }

    throwThrowable(noSpeed?: boolean): void {
        if (!this.cookingThrowable) return;

        if (this.cookTicker < GameConfig.player.cookTime) {
            return;
        }

        const oldThrowableType = this.weapons[GameConfig.WeaponSlot.Throwable].type;
        const amount = this.player.invManager.get(oldThrowableType as InventoryItem);
        if (amount <= 0) return;

        // need to store this incase throwableType gets replaced with its "heavy" variant like snowball => snowball_heavy
        // used to manage inventory since snowball_heavy isnt stored in inventory, when it's thrown you decrement "snowball" from inv

        let throwableType = this.weapons[GameConfig.WeaponSlot.Throwable].type;
        let throwableDef = GameObjectDefs.typeToDef(throwableType, "throwable");

        if (throwableDef.heavyType && throwableDef.changeTime) {
            if (this.cookTicker >= throwableDef.changeTime) {
                throwableType = throwableDef.heavyType;
                throwableDef = GameObjectDefs.typeToDef(throwableType, "throwable");
            }
        }

        const isAmped = this.player.hasPerk("amped_explosives");

        const throwRangeMult = isAmped
            ? PerkProperties.amped_explosives.throwableRangeMult
            : 1;

        const throwSpeedMult = isAmped
            ? PerkProperties.amped_explosives.throwableSpeedMult
            : 1;

        const maxDist = GameConfig.player.throwableMaxMouseDist * throwRangeMult;

        let multiplier: number;
        if (throwableDef.forceMaxThrowDistance) {
            multiplier = 1;
        } else if (this.curWeapIdx != GameConfig.WeaponSlot.Throwable || noSpeed) {
            // if selected weapon slot is not throwable, that means player switched slots early and velocity needs to be 0
            multiplier = 0;
        } else {
            // default throw strength algorithm, just based on mouse distance from player
            multiplier = math.clamp(this.player.toMouseLen, 0, maxDist) / maxDist;
        }

        const throwStr = multiplier * throwableDef.throwPhysics.speed * throwSpeedMult;

        // position of throwing hand
        let pos = v2.add(
            this.player.pos,
            v2.rotate(
                v2.create(0.5, -1.0),
                Math.atan2(this.player.dir.y, this.player.dir.x),
            ),
        );
        let closestDist = Number.MAX_VALUE;
        let spawnPos = v2.copy(pos);
        const spawnHeight = 0.5;

        // clip it to obstacles, similar to bullets
        // so it doesn't spawn inside walls
        const objs = this.player.game.grid.intersectLineSegment(this.player.pos, pos);

        for (let i = 0; i < objs.length; i++) {
            const obj = objs[i];
            if (obj.__type !== ObjectType.Obstacle) continue;

            if (
                obj.dead
                || !obj.collidable
                || !util.sameLayer(obj.layer, this.player.layer)
                || obj.height < spawnHeight
            ) {
                continue;
            }

            const res = collider.intersectSegment(obj.collider, this.player.pos, pos);
            if (res) {
                const colPos = v2.add(res.point, v2.mul(res.normal, 0.01));

                const dist = v2.length(v2.sub(colPos, pos));
                if (dist < closestDist) {
                    closestDist = dist;
                    spawnPos = colPos;
                }
            }
        }

        let dir = v2.copy(this.player.dir);

        // Aim toward a point some distance infront of the player
        if (throwableDef.aimDistance > 0.0) {
            const aimTarget = v2.add(
                this.player.pos,
                v2.mul(this.player.dir, throwableDef.aimDistance),
            );
            dir = v2.normalizeSafe(v2.sub(aimTarget, spawnPos), v2.create(1.0, 0.0));
        }

        // Incorporate some of the player motion into projectile velocity
        const vel = v2.add(
            v2.mul(this.player.moveVel, throwableDef.throwPhysics.playerVelMult),
            // player mouse position is irrelevant for max throwing distance
            v2.mul(dir, throwStr),
        );

        const fuseTime = math.max(
            0.0,
            throwableDef.fuseTime - (throwableDef.cookable ? this.cookTicker : 0),
        );
        const projectile = this.player.game.projectileBarn.addProjectile(
            this.player.__id,
            throwableType,
            spawnPos,
            spawnHeight,
            this.player.layer,
            vel,
            fuseTime,
            GameConfig.DamageType.Player,
            dir,
            oldThrowableType,
        );

        if (oldThrowableType == "strobe" && throwableDef.strikeDelay) {
            const duration = 3;
            const airstrikeOffset = 5;
            let airstrikesLeft = 3;
            let strikeDelay = throwableDef.strikeDelay;

            // Randomize the direction to make strobes less predictable, was not in surviv
            let rotAngle = -Math.PI / 2;
            if (Math.random() < 0.5) {
                rotAngle *= -1;
            }

            if (this.player.hasPerk("broken_arrow")) {
                airstrikesLeft += PerkProperties.broken_arrow.bonusAirstrikes;
            }

            projectile.strobe = {
                timeToPing: strikeDelay,
                airstrikesTotal: airstrikesLeft,
                airstrikesLeft: airstrikesLeft,
                airstrikeTicker: 0,
                airstrikeDelay: duration / airstrikesLeft,
                airstrikeOffset: airstrikeOffset,
                rotAngle: rotAngle,
            };
        }

        const throwTime = GameConfig.player.throwTime;
        // client animation has an extra 0.15 seconds??? (see animData.js on the client)
        // so thats why throwing grenades didnt feel that smooth on survev before...
        this.player.playAnim(GameConfig.Anim.Throw, 0.15 + throwTime);
        // actual cooldown, will prevent throwing more until its over
        this.throwableCooldown = throwTime;

        /**
         * Remove the throwable from the inventory
         * This will handle showing next throwables or switching weapons if theres none left
         */
        if (!this.player.unlimitedThrowables) {
            this.player.invManager.take(oldThrowableType as InventoryItem, 1);
        }
    }

    /**
     * switch weapons slot throwable to the next one in the throwables array
     * only call this method after the inventory state has been updated accordingly, this function only changes the weaponManager.weapons' state
     */
    showNextThrowable(): void {
        const slot = WeaponSlot.Throwable;
        const startingIndex = throwableList.indexOf(this.weapons[slot].type) + 1;
        for (let i = startingIndex; i < startingIndex + throwableList.length; i++) {
            const arrayIndex = i % throwableList.length;
            const type = throwableList[arrayIndex];

            if (!throwableList.includes(type)) {
                continue;
            }

            if (this.player.invManager.has(type as InventoryItem)) {
                this.setWeapon(slot, type, 0);
                return;
            }
        }

        if (this.curWeapIdx === slot) {
            const newSlot = this.weapons[this.lastWeaponIdx].type
                ? this.lastWeaponIdx
                : WeaponSlot.Melee;
            this.setCurWeapIndex(newSlot);
        }
        this.setWeapon(slot, "", 0);
    }
}
