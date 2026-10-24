"""
Turns the ten best known Terraria / Pixel Gun 3D images in client/public/img/{terraria-weapons,pg3d-guns}
into surviv weapons:
  - client/public/img/custom-weapons/loot/<id>.png   loot icon (original pose, fit to 128px)
  - client/public/img/custom-weapons/world/<id>.png  held gun sprite (muzzle pointing up)
  - shared/defs/gameObjects/customWeaponDefs.ts      gun and melee defs, cloned from a base weapon

Run with: python3 scripts/genCustomWeapons.py
"""

import hashlib
import os
import re
import sys

from PIL import Image

VERSION = ""
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
IMG = os.path.join(ROOT, "client/public/img")
OUT = os.path.join(IMG, "custom-weapons")
DEFS = os.path.join(ROOT, "shared/defs/gameObjects/customWeaponDefs.ts")

# only each game's best known weapons are added
PICKS = {
    "tr": {"Zenith", "Terra_Blade", "Night's_Edge", "Excalibur", "Meowmere", "Star_Wrath",
           "Megashark", "Minishark", "S.D.M.G.", "Last_Prism"},
    "pg": {"Prototype", "Dark_Matter_Generator", "Laser_Minigun", "Railgun", "Rocket_Launcher",
           "Excalibur", "Gauss_Cannon", "Heavy_Sniper_Rifle", "Tesla_Cannon", "Combat_Rifle",
           "Pixel_Gun", "Armageddon", "Apocalypse", "Desert_Eagle", "Dual_Revolvers", "Grenade_Launcher",
           "Laser_Bow", "Plasma_Rifle", "Mega_Destroyer", "Hellraiser",
           "Shotgun", "Sniper_Rifle", "Machine_Gun", "Crossbow", "Double-barreled_Shotgun", "Acid_Shotgun",
           "Water_Rifle", "Napalm_Cannon", "Photon_Sniper_Rifle", "Hand_Gatling", "Nanobots_Rifle", "Ultimatum"},
}

SOURCES = [("terraria-weapons", "tr", "Terraria"), ("pg3d-guns", "pg", "Pixel Gun 3D")]

# weapons swung or thrown in their own game become surviv melee weapons
MELEE = re.compile(
    r"sword|blade|saber|claymore|glaive|naginata|halberd|pike|partisan|spear|lance|trident|"
    r"javelin|axe|hatchet|hammer|wrench|shovel|machete|katana|_sai$|knife|knives|sickle|mace|"
    r"_bat$|^bat_bat|cutlass|scimitar|gladius|baghnakhs|glove|paws|fist|_arm$|slap_hand|umbrella|"
    r"keybrand|muramasa|excalibur|arkhalis|terragrim|zenith|starfury|night's_edge|yoyo|amarok|"
    r"artery|cascade|^chik$|^code_|kraken|^rally$|^amazon$|^yelets$|gradient|eye_of_cthulhu|"
    r"malaise|^terrarian$|red's_throw|ball_o'_hurt|meatball|dao_of_pow|flower_pow|sunfury|"
    r"guillotines|anchor|swordfish|clubberfish|bladetongue|frostbrand|^starlight$|meowmere|"
    r"star_wrath|influx_waver|seedler|light's_bane|blood_butcherer|death_sickle|flying_dragon|"
    r"daybreak|solar_eruption|gungnir|north_pole|tentacle_spike|rotted_fork|scissors|shield|"
    r"drippler|flairon|blue_moon|^volcano$|boomerang|shroomerang|chakram|trimarang|light_disc|"
    r"^valor$|^eventide$|^hel-fire$|^first_fractal$|^ice_blade$|^the_horseman's_blade$|"
    r"^galahad$|^viking$|tail$|whip|gauntlets|^marrow$|^hive-five$|^flymeal$|^reaper$",
    re.I,
)
# Eventide and Marrow are bows, not melee
NOT_MELEE = {"eventide", "marrow", "the_undertaker", "zeus_chain-sword"}

# images drawn facing left, mirrored so the muzzle points right like the rest
FLIP = {"S.D.M.G."}

# first matching pattern picks the base surviv gun to clone
GUN_BASES = [
    (r"^prototype$", "sv98"),
    (r"^ultimatum$", "m870"),
    (r"tactical_shotgun|dual_shotguns", "saiga"),
    (r"shotgun|boomstick|shotbow|dragon_breath|triple_bite|cerberus", "m870"),
    (r"semi_auto_sniper", "svd"),
    (r"sniper|railgun|gauss|musket|anti-|one_shot|never_use_scope|piercer|night_hunter|sly_avenger", "sv98"),
    (r"bow|repeater|crossbow|stake|harpoon|blowgun|stynger|marrow|eventide|dart_rifle", "mosin"),
    (r"minigun_pistol", "vector"),
    (r"minigun|gatling|machine|chain_gun|megashark|s\.d\.m\.g|gatligator|machinegun|vortex_beater|"
     r"phantasm|chain-sword|hurricane|destruction_system", "m249"),
    (r"launcher|rocket|bazooka|napalm|snowman_cannon|ko_cannon|star_cannon|celebration|apocalypse|"
     r"armageddon|mega_destroyer|big_buddy|huge_boy|plastic_bazooka|sandgun|volcano", "barrett"),
    (r"cannon", "barrett"),
    (r"pistol|revolver|eagle|handgun|magnum|flintlock|peacemaker|blaster|zapper|zapinator|space_gun|"
     r"undertaker|red_ryder|patriot|hero|golden_friend|last_squeak|infiltrator", "deagle"),
    (r"uzi|minishark|bee_gun|wasp|nail_gun|paintball|bubble|piranha|flamethrower|elf_melter|toxikarp|"
     r"bee_keeper|xenopopper|accurate_bubbler|dart_pistol|handy_darts", "vector"),
    (r"staff|rod$|scepter|wand|tome|book|spell|harp|horn|flask|cocktail|magic|missile|bolt|storm|"
     r"flower_of|cursed|crystal|nebula|lunar|razorblade|life_drain|lightning|bat_scepter|magnet|"
     r"nettle|medusa|shadowflame|tsunami|golden_shower|water|heat_ray|last_prism|arc_surge|"
     r"lantern|necklace|altar|drawing_pad|ore_emitter|hole|generator|pulsator|deck|doll|octopod|"
     r"fork|weather|tune|fracture|fury|aerial_bane|scourge|kraken|blood_thorn|ice_sickle", "famas"),
]


# first matching pattern picks what the gun does (see shared/defs/gameObjects/customWeaponEffects.ts)
GUN_EFFECTS = [
    (r"last_prism", "prism"),
    (r"nanobots", "nanobots"),
    (r"^ultimatum$", "plain"),
    (r"heavy_sniper", "sniper_pierce"),
    (r"^excalibur$|hand_gatling", "minigun"),
    (r"launcher|rocket|bazooka|napalm|snowman_cannon|ko_cannon|star_cannon|celebration|apocalypse|"
     r"armageddon|mega_destroyer|big_buddy|huge_boy|sandgun|destruction_system|grenade", "rocket"),
    (r"railgun|gauss|impulse|photon|anti-|one_shot|neutron", "rail"),
    (r"laser|beam|heat_ray|last_prism|space|alien|future|portalium|digital|network|"
     r"prototype|liquidator|zapinator", "laser"),
    (r"black|glitch|hole|dark_matter|void|abyssal|nebula|shadowbeam|ghost|reaper|necro|soul|demon", "void"),
    (r"flame|fire|inferno|hel|dragon|napalm|burn|sun|solar|molten|elf_melter|volcano|phoenix|meteor|"
     r"flaming|heat|lava|hellwing|betsy|hellraiser|^ash", "flame"),
    (r"ice|frost|blizzard|snow|winter|frozen|north|cold|mammoth|nimbus", "frost"),
    (r"acid|venom|toxic|poison|goo|slime|cursed|vile|scourge|malaise|plague|toxikarp", "poison"),
    (r"tesla|lightning|thunder|storm|zap|electro|arc_surge|plasma|pulse|shock|neon|spark|magnet|"
     r"static|charge|volt", "shock"),
    (r"bubble|water|aqua|tsunami|golden_shower|rain|squirt|piranha|octopod", "bubble"),
    (r"bow|crossbow|repeater|stake|harpoon|blowgun|dart|stynger|javelin", "arrow"),
    (r"staff|rod$|scepter|wand|tome|book|spell|magic|missile|bolt|harp|horn|flower_of|crystal|lunar|"
     r"razorblade|life_drain|bat_scepter|medusa|nettle|bee|wasp|hive|deck|doll|lantern|necklace|altar|"
     r"drawing_pad|emitter|generator|pulsator|star|rainbow|seed|tune|fracture|weather|fork|bloom", "magic"),
]

MELEE_EFFECTS = [
    (r"zenith|terra_blade|starfury|star_wrath|meowmere|influx_waver|night's_edge|excalibur|"
     r"true_|terragrim|arkhalis|first_fractal|daybreak|solar_eruption|galahad|zeus", "legendary"),
    (r"shortsword|knife|knives|dagger|_sai$|gladius|baghnakhs|glove|paws|fist|gauntlets|"
     r"slap_hand|scissors|_arm$|chain_knife", "quick"),
    (r"spear|lance|pike|trident|glaive|halberd|naginata|partisan|javelin|gungnir|fork|yoyo|amarok|"
     r"artery|cascade|chik|code_|kraken|rally|amazon|yelets|gradient|cthulhu|malaise|terrarian|"
     r"red's_throw|hurt|meatball|dao_of_pow|flower_pow|sunfury|guillotines|anchor|boomerang|"
     r"chakram|trimarang|light_disc|flairon|blue_moon|drippler|whip|tail|valor|hive-five|"
     r"north_pole|tentacle_spike|flymeal|dark_lance", "reach"),
    (r"claymore|broadsword|hammer|axe|hatchet|breaker_blade|butcherer|mace|anchor|bat|wrench|"
     r"shovel|clubberfish|shield|volcano|horseman|keybrand|scythe|sickle|reaper|viking", "heavy"),
]


def pick(table, key, default):
    return next((v for p, v in table if re.search(p, key)), default)


def slug(name):
    # the production build mangles anything containing "m_" (its name for internal fields),
    # so S.D.M.G. becomes sdmg and napalm_cannon napalmcannon
    out = re.sub(r"[^a-z0-9]+", "_", name.lower().replace(".", "")).strip("_")
    return out.replace("m_", "m")


def trim(im):
    box = im.getchannel("A").point(lambda a: 255 if a > 8 else 0).getbbox()
    return im.crop(box) if box else im


def fit(im, size, pixel):
    s = size / max(im.size)
    resample = Image.NEAREST if pixel and s >= 1 else Image.LANCZOS
    return im.resize((max(1, round(im.width * s)), max(1, round(im.height * s))), resample)


def upright(im):
    """Rotates a gun so its muzzle points up, from pointing right or up-right."""
    w, h = im.size
    if h > w * 1.6:
        return im
    angle = 90 if w > h * 1.6 else 45
    return trim(im.rotate(angle, resample=Image.BICUBIC, expand=True))


def sideways(im):
    """Rotates a weapon so it points right, from pointing up-right."""
    w, h = im.size
    if w > h * 1.6:
        return im
    angle = -90 if h > w * 1.6 else -45
    return trim(im.rotate(angle, resample=Image.BICUBIC, expand=True))


def main():
    global VERSION
    os.makedirs(os.path.join(OUT, "loot"), exist_ok=True)
    os.makedirs(os.path.join(OUT, "world"), exist_ok=True)
    guns, melees = [], []
    for folder, prefix, game in SOURCES:
        src = os.path.join(IMG, folder)
        for file in sorted(os.listdir(src)):
            base, ext = os.path.splitext(file)
            if ext.lower() != ".png" or base not in PICKS[prefix]:
                continue
            name = base.replace('"', "").replace("_", " ").strip()
            key = base.replace('"', "").lower()
            wid = f"{prefix}_{slug(base)}"
            im = trim(Image.open(os.path.join(src, file)).convert("RGBA"))
            if base in FLIP:
                im = im.transpose(Image.FLIP_LEFT_RIGHT)
            pixel = prefix == "tr"
            # pixel art is upscaled first so rotating it stays crisp
            if pixel:
                im = im.resize((im.width * 4, im.height * 4), Image.NEAREST)
            fit(im, 128, pixel).save(os.path.join(OUT, "loot", wid + ".png"))

            # Pixel Gun 3D's Excalibur is a minigun, not a sword
            is_melee = MELEE.search(key) and key not in NOT_MELEE and not (prefix == "pg" and key == "excalibur")
            if is_melee:
                # held melee sprites point right like the katana's
                fit(sideways(im), 128, pixel).save(os.path.join(OUT, "world", wid + ".png"))
                melees.append((wid, name, game, pick(MELEE_EFFECTS, key, "sword")))
                continue
            fit(upright(im), 160, pixel).save(os.path.join(OUT, "world", wid + ".png"))
            gunBase = "m249" if (prefix == "pg" and key == "excalibur") else pick(GUN_BASES, key, "ak47")
            guns.append((wid, name, game, gunBase, pick(GUN_EFFECTS, key, "plain")))

    # hash of every generated image
    h = hashlib.sha1()
    for sub in ("loot", "world"):
        for f in sorted(os.listdir(os.path.join(OUT, sub))):
            with open(os.path.join(OUT, sub, f), "rb") as fh:
                h.update(f.encode() + fh.read())
    VERSION = h.hexdigest()[:8]
    lines = [
        "// Generated by scripts/genCustomWeapons.py from the Terraria and Pixel Gun 3D images. Do not edit.",
        "",
        "/** changes whenever the images do, so browsers fetch the new ones */",
        f"export const CustomWeaponsVersion = {VERSION!r};",
        "",
        "/** [id, display name, game, base surviv gun, effect] */",
        "export const CustomGuns: Array<[string, string, string, string, string]> = [",
    ]
    lines += [f"    [{wid!r}, {name!r}, {game!r}, {b!r}, {e!r}]," for wid, name, game, b, e in guns]
    lines += ["];", "", "/** [id, display name, game, melee effect] */", "export const CustomMelees: Array<[string, string, string, string]> = ["]
    lines += [f"    [{wid!r}, {name!r}, {game!r}, {e!r}]," for wid, name, game, e in melees]
    lines += ["];", ""]
    # ts strings use double quotes like the rest of the repo
    text = "\n".join(lines)
    text = re.sub(r"'([^'\"]*)'", r'"\1"', text)
    with open(DEFS, "w") as f:
        f.write(text)
    print(f"{len(guns)} guns, {len(melees)} melee", file=sys.stderr)


main()
