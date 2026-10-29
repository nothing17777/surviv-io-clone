"""
League of Legends weapons and champions, from the client's extracted rcp-be-lol-game-data assets.
  - client/public/img/custom-weapons/loot/<id>.png   loot icon, background removed, fit to 128px
  - client/public/img/custom-weapons/world/<id>.png  held sprite (gun: 64x160 muzzle up, melee: 128x64,
                                                     champion basic attack: 128x128)
  - client/public/img/champions/<champ>_<p|q|w|e|r>.png  ability icons for the champion HUD
  - client/public/audio/champions/<champ>_{choose,ban,sfx}.ogg  champion select voice lines and stinger

The client stores files under xxh64 hashes of their game-data path, so paths are hashed to find them.
Item icons are painted on busy backgrounds; BiRefNet (rembg) cuts the item out. Cutouts are cached in
.cache/lol-cutouts so reruns only process new icons.
Run with: python3 scripts/genLolWeapons.py "<extracted_assets>/rcp-be-lol-game-data"
          (needs pillow, xxhash, rembg[cpu])
"""

import hashlib
import json
import os
import shutil
import sys

import rembg
import xxhash
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
IMG = os.path.join(ROOT, "client/public/img")
OUT = os.path.join(IMG, "custom-weapons")
CACHE = os.path.join(ROOT, ".cache/lol-cutouts")
DATA = sys.argv[1]

# id: item name (only ones the background remover cuts out cleanly)
GUNS = {
    "lol_the_collector": "The Collector",
    "lol_lord_dominiks_regards": "Lord Dominik's Regards",
    "lol_mortal_reminder": "Mortal Reminder",
    "lol_yun_tal_wildarrows": "Yun Tal Wildarrows",
    "lol_kraken_slayer": "Kraken Slayer",
    "lol_statikk_shiv": "Statikk Shiv",
    "lol_hextech_gunblade": "Hextech Gunblade",
    "lol_stormsurge": "Stormsurge",
    "lol_rylais_crystal_scepter": "Rylai's Crystal Scepter",
    "lol_phantom_dancer": "Phantom Dancer",
}
MELEES = {
    "lol_infinity_edge": "Infinity Edge",
    "lol_trinity_force": "Trinity Force",
    "lol_guinsoos_rageblade": "Guinsoo's Rageblade",
    "lol_wits_end": "Wit's End",
    "lol_terminus": "Terminus",
}
# champion: (champion id, basic attack is a gun?, item from its build drawn as the basic attack weapon)
CHAMPIONS = {
    "jinx": (222, True, "Hexoptics C44"),
    "caitlyn": (51, True, "The Collector"),
    "ashe": (22, True, "Phantom Dancer"),
    "ezreal": (81, True, "Trinity Force"),
    "lux": (99, True, "Luden's Echo"),
    "ahri": (103, True, "Malignance"),
    "yasuo": (157, False, "Infinity Edge"),
    "garen": (86, False, "Stridebreaker"),
    "darius": (122, False, "Youmuu's Ghostblade"),
    "masteryi": (11, False, "Blade of The Ruined King"),
}


def find(path):
    h = xxhash.xxh64(("plugins/rcp-be-lol-game-data/global/default/" + path).lower().encode()).hexdigest()
    ext = os.path.splitext(path)[1]
    for d in ("default-assets", "default-assets2"):
        for kind in ("data", "images", "audio"):
            f = os.path.join(DATA, d, kind, h + ext)
            if os.path.exists(f):
                return f
    raise FileNotFoundError(path)


def asset(icon_path):
    return find(icon_path.replace("/lol-game-data/assets/", ""))


session = None


def cutout(path, rot):
    """the icon with its painted background removed, turned `rot` degrees and cropped to what's left"""
    global session
    os.makedirs(CACHE, exist_ok=True)
    cached = os.path.join(CACHE, hashlib.sha1(open(path, "rb").read()).hexdigest() + ".png")
    if not os.path.exists(cached):
        session = session or rembg.new_session("birefnet-general")
        img = Image.open(path).convert("RGB").resize((512, 512), Image.LANCZOS)
        rembg.remove(img, session=session).save(cached)
    img = Image.open(cached).rotate(rot, Image.BICUBIC, expand=True)
    return img.crop(img.getbbox())


def fit(img, size):
    img = img.copy()
    img.thumbnail(size, Image.LANCZOS)
    out = Image.new("RGBA", size)
    out.paste(img, ((size[0] - img.width) // 2, (size[1] - img.height) // 2))
    return out


def save(id, icon, world_size, rot):
    """loot keeps the icon's pose; the held sprite is turned so a gun's muzzle points up, a blade right"""
    fit(cutout(icon, 0), (128, 128)).save(os.path.join(OUT, "loot", id + ".png"))
    fit(cutout(icon, rot), world_size).save(os.path.join(OUT, "world", id + ".png"))


items = json.load(open(find("v1/items.json")))
icons = {i["name"]: i["iconPath"] for i in reversed(items)}
for id, name in GUNS.items():
    save(id, asset(icons[name]), (64, 160), 45)
for id, name in MELEES.items():
    save(id, asset(icons[name]), (128, 64), -45)

os.makedirs(os.path.join(IMG, "champions"), exist_ok=True)
os.makedirs(os.path.join(ROOT, "client/public/audio/champions"), exist_ok=True)
for champ, (cid, gun, item) in CHAMPIONS.items():
    save(f"kit_{champ}_basic", asset(icons[item]), (128, 128), 45 if gun else -45)
    data = json.load(open(find(f"v1/champions/{cid}.json")))
    spells = [("p", data["passive"])] + [(s["spellKey"], s) for s in data["spells"]]
    for key, spell in spells:
        Image.open(asset(spell["abilityIconPath"])).convert("RGB").resize((64, 64), Image.LANCZOS).save(
            os.path.join(IMG, "champions", f"{champ}_{key}.png")
        )
    for kind, field in (("choose", "chooseVoPath"), ("ban", "banVoPath"), ("sfx", "stingerSfxPath")):
        shutil.copy(asset(data[field]), os.path.join(ROOT, f"client/public/audio/champions/{champ}_{kind}.ogg"))
print("wrote", len(GUNS) + len(MELEES), "item weapons and", len(CHAMPIONS), "champions")
