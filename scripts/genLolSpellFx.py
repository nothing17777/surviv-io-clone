"""
Champion ability effects, taken from the game's own particle systems instead of being rebuilt by hand.

Every champion skin's .bin holds its VfxSystemDefinitionData entries, named <Champ>_Base_<Key>_<part>:
  _cas   what plays on the champion as it casts
  _mis   what travels with the projectile
  _tar   what plays where it lands
Each system is a list of emitters, and an emitter names the texture it draws, how long its particles
live, and how they scale and fade over that life. This turns each emitter into one layer of
client/src/championFxGen.ts, with its texture written next to the others under
client/public/img/champions/fx/<champ>/, and championFx.ts draws those layers.

Run with: python3 scripts/genLolSpellFx.py <league>/extracted   (needs pillow, numpy)
"""

import glob
import os
import re
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from lolBin import read_bin

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = sys.argv[1]

CHAMPIONS = {
    "jinx": "Jinx", "caitlyn": "Caitlyn", "ashe": "Ashe", "ezreal": "Ezreal", "lux": "Lux",
    "ahri": "Ahri", "yasuo": "Yasuo", "garen": "Garen", "darius": "Darius", "masteryi": "MasterYi",
}

# VfxSystemDefinitionData and the emitter fields we read, by their name's hash
SYSTEM = 0x45CD899F
F_NAME, F_EMITTERS = 0xECF1C6BC, 0x868EB76A
F_TEX, F_LIFETIME, F_SCALE, F_COLOR, F_EMITTER_NAME = 0x3C6468F4, 0x5212ABEE, 0xD4E17A53, 0x3D7E6258, 0x3D25B8CE
F_CONST, F_DYNAMICS, F_VALUES = 3031705514, 3154345447, 877087803

# an emitter's scale is a multiplier; this is the width, in world units, a scale of 1 draws
SCALE_UNITS = 2.2
# emitters that are only there for sound, targeting or the HUD
SKIP = re.compile(r"sound|indicator|debuff|minion|avatar|distort|_ui|icon", re.I)


def number(value, default=None):
    """a field that is either one value or a curve: the biggest it ever reaches"""
    if not isinstance(value, dict):
        return value if isinstance(value, (int, float)) else default
    if F_CONST in value:
        value = value[F_CONST]
    else:
        dyn = value.get(F_DYNAMICS)
        value = dyn.get(F_VALUES) if isinstance(dyn, dict) else None
    if value is None:
        return default
    if isinstance(value, (int, float)):
        return float(value)
    if isinstance(value, (tuple, list)):
        flat = [c for v in value for c in (v if isinstance(v, (tuple, list)) else [v])]
        return max(flat) if flat else default
    return default


def systems(champ, name):
    """every particle system the champion's bins define, by name"""
    out = {}
    folder = os.path.join(SRC, "champions", name, "data/characters", champ)
    for path in glob.glob(os.path.join(folder, "*.bin")):
        try:
            entries = read_bin(path)
        except Exception:
            continue
        for kind, _, obj in entries:
            if kind == SYSTEM and F_NAME in obj:
                out[obj[F_NAME].lower()] = obj
    return out


def layers(system):
    """one layer per emitter that draws something"""
    out = []
    for emitter in system.get(F_EMITTERS) or []:
        tex = emitter.get(F_TEX)
        name = emitter.get(F_EMITTER_NAME) or ""
        if not tex or SKIP.search(name):
            continue
        scale = number(emitter.get(F_SCALE), 1) or 1
        out.append({
            "tex": os.path.basename(tex)[:-4].lower(),
            "size": round(min(max(scale * SCALE_UNITS, 0.5), 8), 2),
            "life": round(number(emitter.get(F_LIFETIME), 0.5) or 0.5, 2),
            "ground": name.lower().startswith("ground"),
        })
    return out


# other champions' spells, bot-only effects and alternate forms of one spell, which all sit next to the
# spell's own systems under the same name
NOT_THE_SPELL = re.compile(r"sound|indicator|nightmarebot|clone|crit|hurricane|_alt|skin\d", re.I)


def find(all_systems, champ, key, part):
    """
    <champ>_base_<key>_<part>, give or take what the artist put in between (jinx_base_q_rocket_mis,
    yasuo_base_r_tar_imp_01). The shortest name that fits is the spell's own.
    """
    want = re.compile(r"^%s_base_%s_([a-z0-9_]*_)?%s(_[a-z0-9_]+)?$" % (champ, key, part))
    hits = [(n, s) for n, s in all_systems.items() if want.match(n) and not NOT_THE_SPELL.search(n)]
    if not hits:
        return None
    return min(hits, key=lambda h: len(h[0]))[1]


def textures(champ, name, wanted):
    """write the textures the layers use next to the champion's others"""
    from genLolChampionFx import tex_to_png

    found = {}
    for dirpath, _, files in os.walk(os.path.join(SRC, "champions", name, "assets")):
        base = "/skins/base" in dirpath.lower() or "/skins/" not in dirpath.lower()
        for f in files:
            key = f.lower()
            if key.endswith(".tex") and (key not in found or base):
                found[key] = os.path.join(dirpath, f)
    out = os.path.join(ROOT, "client/public/img/champions/fx", champ)
    os.makedirs(out, exist_ok=True)
    written = set()
    for tex in wanted:
        src = found.get(tex + ".tex")
        if src and tex_to_png(src, os.path.join(out, tex + ".png")):
            written.add(tex)
    return written


def main():
    cast, projectile = {}, {}
    for champ, name in CHAMPIONS.items():
        all_systems = systems(champ, name)
        wanted, got = set(), {}
        for key in ("q", "w", "e", "r"):
            parts = {}
            for part, slot in (("cas", "cast"), ("mis", "head"), ("tar", "hit")):
                system = find(all_systems, champ, key, part)
                if system:
                    parts[slot] = layers(system)
                    wanted.update(l["tex"] for l in parts[slot])
            got[key] = parts
        have = textures(champ, name, wanted)
        for key, parts in got.items():
            keep = {slot: [l for l in ls if l["tex"] in have] for slot, ls in parts.items()}
            if keep.get("cast"):
                cast["%s_%s" % (champ, key)] = keep["cast"]
            shot = {s: keep[s] for s in ("head", "hit") if keep.get(s)}
            if shot:
                projectile["bullet_champ_%s_%s" % (champ, key)] = shot
        print(champ, sum(len(p) for p in got.values()), "systems,", len(have), "textures")
    write(cast, projectile)


def layer_ts(l):
    extra = ", ground: true" if l["ground"] else ""
    return '    { tex: "img/champions/fx/%s.png", size: %s, life: %s%s },' % (l["tex_path"], l["size"], l["life"], extra)


def write(cast, projectile):
    lines = [
        "// Generated by scripts/genLolSpellFx.py from the champions' own particle systems. Do not edit.",
        'import type { GeneratedLayer, GeneratedShot } from "./championFx.ts";',
        "",
        "export const GeneratedCastFx: Record<string, GeneratedLayer[]> = {",
    ]
    for name, ls in sorted(cast.items()):
        lines.append('    %s: [' % name)
        for l in ls:
            lines.append("        " + entry(name.split("_")[0], l))
        lines.append("    ],")
    lines += ["};", "", "export const GeneratedShotFx: Record<string, GeneratedShot> = {"]
    for name, shot in sorted(projectile.items()):
        champ = name.split("_")[2]
        lines.append('    %s: {' % name)
        for slot, ls in shot.items():
            lines.append("        %s: [" % slot)
            for l in ls:
                lines.append("            " + entry(champ, l))
            lines.append("        ],")
        lines.append("    },")
    lines += ["};", ""]
    path = os.path.join(ROOT, "client/src/championFxGen.ts")
    open(path, "w").write("\n".join(lines))
    print("wrote", path, len(cast), "casts,", len(projectile), "shots")


def entry(champ, l):
    extra = ", ground: true" if l["ground"] else ""
    return '{ tex: "img/champions/fx/%s/%s.png", size: %s, life: %s%s },' % (champ, l["tex"], l["size"], l["life"], extra)


main()
