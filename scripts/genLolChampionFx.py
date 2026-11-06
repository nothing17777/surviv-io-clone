"""
League of Legends champion sounds and particle textures, from the game's extracted WAD files
(<league>/extracted/champions/<Champion>/...), for the champion kits:
  - client/public/audio/champions/<champ>/<event>.ogg   base skin ability sounds, by Wwise event name
  - client/public/img/champions/fx/<champ>/<texture>.png  base skin particle and spell textures

Sounds: the champion's .bin files name every Wwise event (Play_sfx_<Champ>_<Spell>_<Trigger>). An event's
id is the FNV-1 hash of its lowercased name; the events bank (HIRC) links it through actions and
containers to sounds, whose source ids are .wem files in the audio bank (DIDX/DATA). vgmstream decodes
them, ffmpeg turns them into ogg.
Textures: .tex is a small header in front of DXT1/DXT5/BGRA data, rewritten as a .dds for Pillow.

Run with: python3 scripts/genLolChampionFx.py <league>/extracted <vgmstream-cli>   (needs pillow, numpy, ffmpeg)
"""

import os
import re
import struct
import subprocess
import sys
import tempfile

import numpy as np
from PIL import Image, ImageStat

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
# importable by genLolSpellFx.py, which only needs tex_to_png
SRC = sys.argv[1] if len(sys.argv) > 1 else ""
VGMSTREAM = sys.argv[2] if len(sys.argv) > 2 else ""

CHAMPIONS = {
    "jinx": "Jinx",
    "caitlyn": "Caitlyn",
    "ashe": "Ashe",
    "ezreal": "Ezreal",
    "lux": "Lux",
    "ahri": "Ahri",
    "yasuo": "Yasuo",
    "garen": "Garen",
    "darius": "Darius",
    "masteryi": "MasterYi",
    "aatrox": "Aatrox",
    "akali": "Akali",
    "akshan": "Akshan",
    "alistar": "Alistar",
    "ambessa": "Ambessa",
    "amumu": "Amumu",
    "anivia": "Anivia",
    "annie": "Annie",
    "aphelios": "Aphelios",
    "aurelionsol": "AurelionSol",
    "aurora": "Aurora",
    "azir": "Azir",
    "bard": "Bard",
    "belveth": "Belveth",
    "blitzcrank": "Blitzcrank",
    "brand": "Brand",
    "braum": "Braum",
    "briar": "Briar",
    "camille": "Camille",
    "cassiopeia": "Cassiopeia",
    "chogath": "Chogath",
    "corki": "Corki",
    "diana": "Diana",
    "draven": "Draven",
    "drmundo": "DrMundo",
    "ekko": "Ekko",
    "elise": "Elise",
    "evelynn": "Evelynn",
    "fiddlesticks": "Fiddlesticks",
    "fiora": "Fiora",
    "fizz": "Fizz",
    "galio": "Galio",
    "gangplank": "Gangplank",
    "gnar": "Gnar",
    "gragas": "Gragas",
    "graves": "Graves",
    "gwen": "Gwen",
    "hecarim": "Hecarim",
    "heimerdinger": "Heimerdinger",
    "hwei": "Hwei",
    "illaoi": "Illaoi",
    "irelia": "Irelia",
    "ivern": "Ivern",
    "janna": "Janna",
    "jarvaniv": "JarvanIV",
    "jax": "Jax",
    "jayce": "Jayce",
    "jhin": "Jhin",
    "kaisa": "Kaisa",
    "kalista": "Kalista",
    "karma": "Karma",
    "karthus": "Karthus",
    "kassadin": "Kassadin",
    "katarina": "Katarina",
    "kayle": "Kayle",
    "kayn": "Kayn",
    "kennen": "Kennen",
    "khazix": "Khazix",
    "kindred": "Kindred",
    "kled": "Kled",
    "kogmaw": "KogMaw",
    "ksante": "KSante",
    "leblanc": "Leblanc",
    "leesin": "LeeSin",
    "leona": "Leona",
    "lillia": "Lillia",
    "lissandra": "Lissandra",
    "locke": "Locke",
    "lucian": "Lucian",
    "lulu": "Lulu",
    "malphite": "Malphite",
    "malzahar": "Malzahar",
    "maokai": "Maokai",
    "mel": "Mel",
    "milio": "Milio",
    "missfortune": "MissFortune",
    "monkeyking": "MonkeyKing",
    "mordekaiser": "Mordekaiser",
    "morgana": "Morgana",
    "naafiri": "Naafiri",
    "nami": "Nami",
    "nasus": "Nasus",
    "nautilus": "Nautilus",
    "neeko": "Neeko",
    "nidalee": "Nidalee",
    "nilah": "Nilah",
    "nocturne": "Nocturne",
    "nunu": "Nunu",
    "olaf": "Olaf",
    "orianna": "Orianna",
    "ornn": "Ornn",
    "pantheon": "Pantheon",
    "poppy": "Poppy",
    "pyke": "Pyke",
    "qiyana": "Qiyana",
    "quinn": "Quinn",
    "rakan": "Rakan",
    "rammus": "Rammus",
    "reksai": "RekSai",
    "rell": "Rell",
    "renata": "Renata",
    "renekton": "Renekton",
    "rengar": "Rengar",
    "riven": "Riven",
    "rumble": "Rumble",
    "ryze": "Ryze",
    "samira": "Samira",
    "sejuani": "Sejuani",
    "senna": "Senna",
    "seraphine": "Seraphine",
    "sett": "Sett",
    "shaco": "Shaco",
    "shen": "Shen",
    "shyvana": "Shyvana",
    "singed": "Singed",
    "sion": "Sion",
    "sivir": "Sivir",
    "skarner": "Skarner",
    "smolder": "Smolder",
    "sona": "Sona",
    "soraka": "Soraka",
    "swain": "Swain",
    "sylas": "Sylas",
    "syndra": "Syndra",
    "tahmkench": "TahmKench",
    "taliyah": "Taliyah",
    "talon": "Talon",
    "taric": "Taric",
    "teemo": "Teemo",
    "thresh": "Thresh",
    "tristana": "Tristana",
    "trundle": "Trundle",
    "tryndamere": "Tryndamere",
    "twistedfate": "TwistedFate",
    "twitch": "Twitch",
    "udyr": "Udyr",
    "urgot": "Urgot",
    "varus": "Varus",
    "vayne": "Vayne",
    "veigar": "Veigar",
    "velkoz": "Velkoz",
    "vex": "Vex",
    "vi": "Vi",
    "viego": "Viego",
    "viktor": "Viktor",
    "vladimir": "Vladimir",
    "volibear": "Volibear",
    "warwick": "Warwick",
    "xayah": "Xayah",
    "xerath": "Xerath",
    "xinzhao": "XinZhao",
    "yone": "Yone",
    "yorick": "Yorick",
    "yunara": "Yunara",
    "yuumi": "Yuumi",
    "zaahen": "Zaahen",
    "zac": "Zac",
    "zed": "Zed",
    "zeri": "Zeri",
    "ziggs": "Ziggs",
    "zilean": "Zilean",
    "zoe": "Zoe",
    "zyra": "Zyra",
}
# only what the game uses: "<champ>/<file>" textures named in gunDefs and championFx.ts, sounds in ChampionSounds
USED_TEXTURES = {
    t
    for f in [
        "shared/defs/gameObjects/gunDefs.ts",
        "client/src/championFx.ts",
        *sorted(
            os.path.join("shared/defs/gameObjects/championAbilityBullets", b)
            for b in os.listdir(os.path.join(ROOT, "shared/defs/gameObjects/championAbilityBullets"))
            if b.endswith(".ts")
        ),
    ]
    for t in re.findall(r'"((?:%s)/[a-z0-9_\-]+)"' % "|".join(CHAMPIONS), open(os.path.join(ROOT, f)).read())
}
# 3D models rendered as sprites: champion -> (mesh, texture, mesh axes drawn right / down / toward the camera,
# or ("tilt", degrees) for League's camera tilted from straight down toward the model's front)
MESHES = {
    "jinx": [("jinx_r_mis", "jinx_r_mis", (1, 0, 2)), ("jinx_q_rocket", "jinx_q_rocket", (0, 2, 1))],
    "ashe": [("ashe_base_aa_arrow", "ashe_base_aa_arrowtext", (2, 0, 1)), ("ashe_base_r_arrow", "ashe_base_aa_arrowtext", (2, 0, 1))],
    "caitlyn": [
        ("caitlyn_base_qvfx_rg", "caitlyn_base_q_tx_cm", (2, 0, 1)),
        ("caitlyn_base_entrapment_mis_net", "caitlyn_base_entrapment_mis_net", (2, 0, 1)),
        ("caitlyn_base_mesh_01", "caitlyn_base_mesh_01", (1, 0, 2)),
    ],
    "garen": [("garen_base_e_spin", "garen_base_e_spin_edge", (0, 2, 1))],
    # Flame Chompers! (the JinxMine minion, painted with Jinx's own texture)
    "jinx_mine": [("jinxmine", "jinx_base_tx_cm", ("tilt", 35))],
}
# the champion's own model, rendered straight down (League's camera, looking at the top of the champion)
# as the player's body sprite: champion -> (mesh, texture) under assets/characters/<champ>/skins/base
MODEL_SIZE = 256
MODELS = {
    "jinx": ("jinx", "jinx_base_tx_cm"),
    "caitlyn": ("caitlyn_base", "caitlyn_base_tx_cm"),
    "ashe": ("ashe", "ashe_base_2011_tx_cm"),
    "ezreal": ("ezreal_base", "ezreal_base_tx_cm"),
    "lux": ("lux", "lux_base_cm_tx"),
    "ahri": ("ahri_base", "ahri_base_tx_cm"),
    "yasuo": ("yasuo", "yasuo_base_tx_cm"),
    "garen": ("garen", "garen_base_tx_cm"),
    "darius": ("darius", "darius_base_tx_cm"),
    "masteryi": ("masteryi", "masteryi_2013_tx_cm"),
    "aatrox": ("aatrox", "aatrox_base_tx_cm"),
    "akali": ("akali", "akali_base_tx_cm"),
    "akshan": ("akshan_base", "akshan_base_tx_cm"),
    "alistar": ("alistar", "alistar_base_tx_cm"),
    "ambessa": ("ambessa_base", "ambessa_base_tx_cm"),
    "amumu": ("amumu", "sadmummy"),
    "anivia": ("anivia", "cryophoenix"),
    "annie": ("annie_2012", "annie_base_2012_cm"),
    "aphelios": ("aphelios", "aphelios_base_tx_cm"),
    "aurelionsol": ("aurelionsol", "aurelionsol_body_tx_cm"),
    "aurora": ("aurora_base", "aurora_base_tx_cm"),
    "azir": ("azir", "azir_base_tx_cm"),
    "bard": ("bard", "bard_base_tx_cm"),
    "belveth": ("belveth_base", "belveth_base_main_tx"),
    "blitzcrank": ("blitzcrank", "steamgolem"),
    "brand": ("brand", "brand_base_tx_cm"),
    "braum": ("braum_base", "braum_base_tx_cm"),
    "briar": ("briar_base", "briar_base_tx_cm"),
    "camille": ("camille", "camille_base_tx_cm"),
    "cassiopeia": ("cassiopeia", "cassiopeia_base_tx_cm"),
    "chogath": ("chogath", "greenterror"),
    "corki": ("corki", "corki"),
    "diana": ("diana", "diana_base_tx_cm"),
    "draven": ("draven", "draven_base_tx_cm"),
    "drmundo": ("drmundo_base", "drmundo_base_tx_cm"),
    "ekko": ("ekko", "ekko_base_tx_cm"),
    "elise": ("elise", "elise_base_proxy_tx_cm"),
    "evelynn": ("evelynn", "scrolling"),
    "fiddlesticks": ("fiddlesticks_base", "fiddlesticks_base_body_tx_cm"),
    "fiora": ("fiora", "fiora_base_tx_cm"),
    "fizz": ("fizz", "fizz_base_tx_cm"),
    "galio": ("galio", "galio_base_cm_tx"),
    "gangplank": ("gangplank", "gangplank_base_tx_cm"),
    "gnar": ("gnar", "gnar_base_tx_cm"),
    "gragas": ("gragas", "gragas"),
    "graves": ("graves", "graves"),
    "gwen": ("gwen_base", "gwen_base_main_tx_cm"),
    "hecarim": ("hecarim", "hecarim_base_tx_cm"),
    "heimerdinger": ("heimerdinger", "heimerdinger_base_tx_cm"),
    "hwei": ("hwei_base", "hwei_base_tx_cm"),
    "illaoi": ("illaoi", "illaoi_base_tx_cm"),
    "irelia": ("irelia_base", "irelia_base_tx_cm"),
    "ivern": ("ivern_base", "ivern_base_tx_cm"),
    "janna": ("janna", "janna_base_tx_cm"),
    "jarvaniv": ("jarvaniv", "jarvaniv_base_tx_cm"),
    "jax": ("jax_base", "jax_base_body_tx_cm"),
    "jayce": ("jayce", "jayce_base_melee_tx_cm"),
    "jhin": ("jhin", "jhin_base_tx_cm"),
    "kaisa": ("kaisa_base", "kaisa_base_tx_cm"),
    "kalista": ("kalista", "kalista_base_tx_cm"),
    "karma": ("karma_2012", "karma_base_2012_cm"),
    "karthus": ("karthus", "karthus_base_tx_cm"),
    "kassadin": ("kassadin", "kassadin_base_tx_cm"),
    "katarina": ("katarina", "katarina_base_2012_tx_cm"),
    "kayle": ("kayle", "kayle_base_tx_cm"),
    "kayn": ("kayn", "kayn_base_tx_cm"),
    "kennen": ("kennen", "kennen"),
    "khazix": ("khazix_base", "khazix_base_cm_tx"),
    "kindred": ("kindred_base", "kindred_base_tx_cm"),
    "kled": ("kled", "kledrider_base_tx_cm"),
    "kogmaw": ("kogmaw", "kogmaw_base_tx_cm"),
    "ksante": ("ksante", "ksante_base_tx_cm"),
    "leblanc": ("leblanc_base", "leblanc_base_tx_cm"),
    "leesin": ("leesin_base", "leesin_base_tx_cm"),
    "leona": ("leona", "leona_base_tx_cm"),
    "lillia": ("lillia_base", "lillia_base_seed_tx_cm"),
    "lissandra": ("lissandra", "lissandra_base_tx_cm"),
    "locke": ("locke_base", "locke_base_main_tx_cm"),
    "lucian": ("lucian_base", "lucian_base_tx_cm"),
    "lulu": ("lulu", "lulu_base_tx_cm"),
    "malphite": ("malphite", "malphite"),
    "malzahar": ("malzahar", "malzahar_tx_cm"),
    "maokai": ("maokai", "maokai_base_2014_tx_cm"),
    "mel": ("mel_base", "mel_base_tx_cm"),
    "milio": ("milio_base", "milio_base_tx_cm"),
    "missfortune": ("missfortune", "missfortune_base_tx_cm"),
    "monkeyking": ("monkeyking", "monkeyking_base_tx_cm_v02"),
    "mordekaiser": ("mordekaiser_base", "mordekaiser_base_tx_cm"),
    "morgana": ("morgana", "morgana_base_tx_cm"),
    "naafiri": ("naafiri_base", "naafiri_base_main_tx_cm"),
    "nami": ("nami", "nami_base_tx_cm"),
    "nasus": ("nasus", "nasus"),
    "nautilus": ("nautilus", "nautilus_base_tx_cm"),
    "neeko": ("neeko_base", "neeko_base_tx_cm"),
    "nidalee": ("nidalee2012", "nidalee_base_2012_tx_cm"),
    "nilah": ("nilah_base", "nilah_base_tx_cm"),
    "nocturne": ("nocturne", "nocturne_base_tx_cm"),
    "nunu": ("nunu", "nunu_base_tx_cm"),
    "olaf": ("olaf", "olaf"),
    "orianna": ("orianna", "orianna_base_tx_gm"),
    "ornn": ("ornn", "ornn_base_tx_cm"),
    "pantheon": ("pantheon_base", "pantheon_base_tx_cm"),
    "poppy": ("poppy", "poppy_base_tx_cm"),
    "pyke": ("pyke_base", "pyke_base_tx_cm"),
    "qiyana": ("qiyana", "qiyana_base_tx_cm"),
    "quinn": ("quinn_base", "quinn_base_tx_cm"),
    "rakan": ("rakan_base", "rakan_base_tx_cm"),
    "rammus": ("rammus", "armordillo"),
    "reksai": ("reksai", "reksai_base_tx_cm"),
    "rell": ("rell_base", "rell_base_tx_cm"),
    "renata": ("renata_base", "renata_base_body_tx_cm"),
    "renekton": ("renekton", "renekton_base_tx_cm"),
    "rengar": ("rengar_base", "rengar_base_tx_cm"),
    "riven": ("riven", "riven_base_tx_cm"),
    "rumble": ("rumble", "rumble_base_tx_cm"),
    "ryze": ("ryze", "ryze"),
    "samira": ("samira_base", "samira_base_tx_cm"),
    "sejuani": ("sejuani", "sejuani_base_tx_cm"),
    "senna": ("senna_base", "senna_base_gun_tx_cm"),
    "seraphine": ("seraphine_base", "seraphine_base_body_tx_cm"),
    "sett": ("sett", "sett_base_tx_cm"),
    "shaco": ("shaco", "jester"),
    "shen": ("shen", "shen_base_tx_cm"),
    "shyvana": ("shyvana_base", "shyvana_base_tx_cm"),
    "singed": ("singed", "singed_tx_cm"),
    "sion": ("sion", "sion_base_tx_cm"),
    "sivir": ("sivir", "sivir"),
    "skarner": ("skarner_rework_base", "skarner_rework_base_tx_cm"),
    "smolder": ("smolder_base", "smolder_base_tx_cm"),
    "sona": ("sona", "sona_base_tx_cm"),
    "soraka": ("soraka", "soraka_base_tx_cm"),
    "swain": ("swain", "swain_base_tx_cm"),
    "sylas": ("sylas_base", "sylas_base_tx_cm"),
    "syndra": ("syndra", "syndra_base_tx_cm"),
    "tahmkench": ("tahmkench_base", "tahmkench_base_tx_cm"),
    "taliyah": ("taliyah_base", "taliyah_base_tx_cm"),
    "talon": ("talon", "talon_base_tx_cm"),
    "taric": ("taric", "taric_base_tx_cm"),
    "teemo": ("teemo_base", "teemo_base_tx_cm"),
    "thresh": ("thresh", "thresh_base_tx_cm"),
    "tristana": ("tristana", "tristana_tx_cm"),
    "trundle": ("trundle", "trundle_base_tx_cm"),
    "tryndamere": ("tryndamere", "tryndamere_base2011_tx_cm"),
    "twistedfate": ("twistedfate2012", "twistedfate_base_2012_cm"),
    "twitch": ("twitch", "twitch_base_tx_cm"),
    "udyr": ("udyr_base", "udyr_base_main_tx_cm"),
    "urgot": ("urgot_base", "urgot_base"),
    "varus": ("varus", "varus_base_tx_cm"),
    "vayne": ("vayne", "vayne_base_tx_cm"),
    "veigar": ("veigar", "veigar_turnaround_b"),
    "velkoz": ("velkoz_base", "velkoz_base"),
    "vex": ("vex_base", "vex_main_tx_cm"),
    "vi": ("vi_base", "vi_tx_cm"),
    "viego": ("viego_base", "viego_base_body_tx_cm"),
    "viktor": ("viktor_base", "viktor_base_tx_cm"),
    "vladimir": ("vladimir", "vladimir_base_tx_cm"),
    "volibear": ("volibear_base", "volibear_base_tx_cm"),
    "warwick": ("warwick", "warwick_base_cm_tx"),
    "xayah": ("xayah_base", "xayah_base_tx_cm"),
    "xerath": ("xerath", "xerath_base_tx_cm"),
    "xinzhao": ("xinzhaorework_base", "xinzhaorework_base_tx_cm"),
    "yone": ("yone_base", "yone_base_tx_cm"),
    "yorick": ("yorick", "yorick1_base_cm_tx"),
    "yunara": ("yunara_base", "yunara_base_tx_cm"),
    "yuumi": ("yuumi_base", "yuumi_base_joke_tx_cm"),
    "zaahen": ("zaahen_base", "zaahen_base_tx_cm"),
    "zac": ("zac_base", "zac_base_tx_cm"),
    "zed": ("zed", "zed_base_tx_cm"),
    "zeri": ("zeri_base", "zeri_base_tx_cm"),
    "ziggs": ("ziggs", "ziggs_base_tx_cm"),
    "zilean": ("zilean", "chronokeeper"),
    "zoe": ("zoe_base", "zoe_base_tx_cm"),
    "zyra": ("zyra", "zyraloadscreen"),
}
USED_SOUNDS = set(re.findall(r'"([a-z0-9_]+)"', open(os.path.join(ROOT, "shared/defs/gameObjects/championDefs.ts")).read().split("export const ChampionSounds")[1].split("};")[0]))
# emotes, recall and the like aren't abilities
SKIP = re.compile(r"dance|joke|taunt|laugh|recall|homeguard|death|music|respawn|idle|run|move|emote", re.I)


def fnv1(name):
    h = 2166136261
    for b in name.lower().encode():
        h = (h * 16777619) & 0xFFFFFFFF
        h ^= b
    return h


def sections(path):
    data = open(path, "rb").read()
    out, i = {}, 0
    while i + 8 <= len(data):
        tag, size = data[i : i + 4].decode("latin1"), struct.unpack_from("<I", data, i + 4)[0]
        out[tag] = data[i + 8 : i + 8 + size]
        i += 8 + size
    return out


def hirc(sec):
    """object id -> (type, payload)"""
    objs, (count,), i = {}, struct.unpack_from("<I", sec), 4
    for _ in range(count):
        kind, size, oid = struct.unpack_from("<BII", sec, i)
        objs[oid] = (kind, sec[i + 9 : i + 5 + size])
        i += 5 + size
    return objs


def u32s(payload):
    """every u32 at every byte offset: ids are found by matching, not by parsing each object version"""
    return {struct.unpack_from("<I", payload, j)[0] for j in range(len(payload) - 3)}


def wems_for(oid, objs, media, seen):
    """the .wem ids an object leads to: events -> actions -> containers -> sounds -> media"""
    if oid in seen or oid not in objs:
        return []
    seen.add(oid)
    kind, payload = objs[oid]
    found = []
    refs = u32s(payload)
    if kind == 2:  # sound
        found += [r for r in refs if r in media]
    for r in refs:
        if r != oid and r in objs and objs[r][0] in (2, 3, 5, 6, 7):  # sound, action, containers
            found += wems_for(r, objs, media, seen)
    return found


def sounds(champ, folder):
    base = os.path.join(folder, "assets/sounds/wwise2016/sfx/characters", folder_name(folder), "skins/base")
    prefix = folder_name(folder)
    events_bnk = os.path.join(base, f"{prefix}_base_sfx_events.bnk")
    audio_bnk = os.path.join(base, f"{prefix}_base_sfx_audio.bnk")
    if not os.path.exists(events_bnk):
        print("no sound banks for", champ)
        return
    names = set()
    for dirpath, _, files in os.walk(os.path.join(folder, "data")):
        for f in files:
            if f.endswith(".bin"):
                text = open(os.path.join(dirpath, f), "rb").read()
                names |= {m.decode() for m in re.findall(rb"Play_sfx_%s_[A-Za-z0-9_]+" % prefix.encode(), text, re.I)}
    objs = {}
    for bnk in (events_bnk, audio_bnk):
        s = sections(bnk)
        if "HIRC" in s:
            objs.update(hirc(s["HIRC"]))
    audio = sections(audio_bnk)
    media = {}
    didx = audio.get("DIDX", b"")
    for j in range(0, len(didx), 12):
        wid, off, size = struct.unpack_from("<III", didx, j)
        media[wid] = audio["DATA"][off : off + size]
    out = os.path.join(ROOT, "client/public/audio/champions", champ)
    os.makedirs(out, exist_ok=True)
    n = 0
    for name in sorted(names):
        if SKIP.search(name):
            continue
        wems = wems_for(fnv1(name), objs, media, set())
        if not wems:
            continue
        # the first sound is enough: the rest are random variations of it
        with tempfile.TemporaryDirectory() as tmp:
            wem, wav = os.path.join(tmp, "a.wem"), os.path.join(tmp, "a.wav")
            open(wem, "wb").write(media[wems[0]])
            if subprocess.run([VGMSTREAM, "-o", wav, wem], capture_output=True).returncode:
                continue
            event = name[len("Play_sfx_") + len(prefix) + 1 :].lower()
            if event not in USED_SOUNDS:
                continue
            subprocess.run(
                ["ffmpeg", "-y", "-loglevel", "error", "-i", wav, "-ac", "1", "-c:a", "libvorbis", "-q:a", "3",
                 os.path.join(out, event + ".ogg")],
                check=True,
            )
            n += 1
    print(champ, "sounds:", n)


DXT = {10: b"DXT1", 12: b"DXT5"}


def tex_to_png(path, dest):
    data = open(path, "rb").read()
    if data[:4] != b"TEX\0":
        return False
    w, h = struct.unpack_from("<HH", data, 4)
    fmt, mip = data[9], data[11]
    body = data[12:]
    if fmt in DXT:
        block = 8 if fmt == 10 else 16
        size = max(1, (w + 3) // 4) * max(1, (h + 3) // 4) * block
        # mipmaps are stored smallest first: the full size image is the last one
        top = body[len(body) - size :] if mip else body[:size]
        header = struct.pack(
            "<4sIIIIIII44sII4sIIIIIIIIII",
            b"DDS ", 124, 0x1007 | 0x80000, h, w, size, 0, 1, b"\0" * 44,
            32, 4, DXT[fmt], 0, 0, 0, 0, 0,
            0x1000, 0, 0, 0, 0,
        )
        img = Image.open(__import__("io").BytesIO(header + top))
    elif fmt == 20:  # BGRA8
        size = w * h * 4
        top = body[len(body) - size :] if mip else body[:size]
        img = Image.frombytes("RGBA", (w, h), top, "raw", "BGRA")
    else:
        return False
    img = img.convert("RGBA")
    # glows are drawn additively in League, on black: their brightness becomes their alpha here
    if ImageStat.Stat(img.getchannel("A")).mean[0] > 250:
        img.putalpha(img.convert("RGB").point(lambda v: min(255, v * 2)).convert("L"))
    img.save(dest)
    return True


def textures(champ, folder):
    out = os.path.join(ROOT, "client/public/img/champions/fx", champ)
    os.makedirs(out, exist_ok=True)
    found = {}
    for dirpath, _, files in os.walk(os.path.join(folder, "assets")):
        # the base skin's own textures win over other skins' copies
        base = "/skins/base" in dirpath.lower() or "/skins/" not in dirpath.lower()
        for f in files:
            key = f.lower()
            if key.endswith((".tex", ".scb", ".skn")) and (key not in found or base):
                found[key] = os.path.join(dirpath, f)
    n = 0
    for used in USED_TEXTURES:
        c, name = used.split("/")
        if c == champ and name + ".tex" in found:
            n += tex_to_png(found[name + ".tex"], os.path.join(out, name + ".png"))
    for mesh, tex, axes in MESHES.get(champ, []) + MESHES.get(champ + "_mine", []):
        with tempfile.TemporaryDirectory() as tmp:
            tex_png = os.path.join(tmp, "t.png")
            tex_to_png(found[tex + ".tex"], tex_png)
            path = found.get(mesh + ".scb") or found[mesh + ".skn"]
            render_mesh(path, tex_png, axes).save(os.path.join(out, mesh + "_mesh.png"))
            n += 1
    print(champ, "textures:", n)


def read_scb(path):
    """r3d2Mesh static mesh: positions, faces and per-face uvs"""
    d = open(path, "rb").read()
    major, minor = struct.unpack_from("<HH", d, 8)
    vc, fc = struct.unpack_from("<II", d, 140)
    i = 152 + 24
    vtype = 0
    if (major, minor) >= (3, 2):
        vtype = struct.unpack_from("<I", d, i)[0]
        i += 4
    pos = np.frombuffer(d, "<f4", vc * 3, i).reshape(-1, 3)
    i += vc * 12 + (vc * 4 if vtype == 1 else 0) + 12
    faces, uvs = [], []
    for _ in range(fc):
        faces.append(struct.unpack_from("<III", d, i))
        u = struct.unpack_from("<6f", d, i + 76)
        uvs.append(((u[0], u[3]), (u[1], u[4]), (u[2], u[5])))
        i += 100
    return pos, faces, uvs


def read_skn(path):
    """skinned mesh in its bind pose: positions, faces and per-face uvs"""
    d = open(path, "rb").read()
    major = struct.unpack_from("<H", d, 4)[0]
    subs = struct.unpack_from("<I", d, 8)[0]
    i = 12 + subs * 80 + (4 if major >= 4 else 0)
    ic, vc = struct.unpack_from("<II", d, i)
    i += 8
    vsize, vtype = 52, 0
    if major >= 4:
        vsize, vtype = struct.unpack_from("<II", d, i)
        i += 8 + 40
    idx = np.frombuffer(d, "<u2", ic, i)
    i += ic * 2
    verts = np.frombuffer(d, np.uint8, vc * vsize, i).reshape(vc, vsize)
    pos = verts[:, 0:12].copy().view("<f4").reshape(vc, 3)
    uv = verts[:, 44:52].copy().view("<f4").reshape(vc, 2)
    faces = [tuple(int(j) for j in idx[k : k + 3]) for k in range(0, ic, 3)]
    return pos, faces, [tuple(tuple(uv[j]) for j in f) for f in faces]


def render_mesh(path, tex_path, axes, size=256):
    """orthographic, nearest surface wins, nose pointing right"""
    pos, faces, uvs = (read_skn if path.endswith(".skn") else read_scb)(path)
    return rasterize(pos, faces, uvs, tex_path, axes, size)


def rasterize(pos, faces, uvs, tex_path, axes, size=256, bounds=None, crop=True):
    """
    The same, for vertices already posed by an animation. `bounds` is (x0, x1, y0, y1) in the drawn
    plane: every frame of an animation is given the one set, so the champion keeps its size and place
    from frame to frame instead of being fitted to each pose on its own.
    """
    if axes[0] == "tilt":
        a = np.radians(axes[1])
        down = -pos[:, 1] * np.cos(a) + pos[:, 2] * np.sin(a)
        depth = pos[:, 1] * np.sin(a) + pos[:, 2] * np.cos(a)
        pos, axes = np.stack([pos[:, 0], down, depth], 1), (0, 1, 2)
    tex = np.asarray(Image.open(tex_path).convert("RGBA")).astype(np.float32)
    th, tw = tex.shape[:2]
    X, Y, Z = pos[:, axes[0]], pos[:, axes[1]], pos[:, axes[2]]
    x0, x1, y0, y1 = bounds if bounds else (X.min(), X.max(), Y.min(), Y.max())
    s = (size - 4) / max(x1 - x0, y1 - y0)
    px = (X - (x1 + x0) / 2) * s + size / 2
    py = (Y - (y1 + y0) / 2) * s + size / 2
    img = np.zeros((size, size, 4), np.float32)
    depth = np.full((size, size), -1e9, np.float32)
    for f, uv in zip(faces, uvs):
        x, y, z = px[list(f)], py[list(f)], Z[list(f)]
        x0, x1 = int(max(0, np.floor(x.min()))), int(min(size - 1, np.ceil(x.max())))
        y0, y1 = int(max(0, np.floor(y.min()))), int(min(size - 1, np.ceil(y.max())))
        den = (y[1] - y[2]) * (x[0] - x[2]) + (x[2] - x[1]) * (y[0] - y[2])
        if x1 < x0 or y1 < y0 or abs(den) < 1e-9:
            continue
        gx, gy = np.meshgrid(np.arange(x0, x1 + 1) + 0.5, np.arange(y0, y1 + 1) + 0.5)
        w0 = ((y[1] - y[2]) * (gx - x[2]) + (x[2] - x[1]) * (gy - y[2])) / den
        w1 = ((y[2] - y[0]) * (gx - x[2]) + (x[0] - x[2]) * (gy - y[2])) / den
        w2 = 1 - w0 - w1
        zz = w0 * z[0] + w1 * z[1] + w2 * z[2]
        sub = depth[y0 : y1 + 1, x0 : x1 + 1]
        m = (w0 >= -1e-4) & (w1 >= -1e-4) & (w2 >= -1e-4) & (zz > sub)
        if not m.any():
            continue
        u = w0 * uv[0][0] + w1 * uv[1][0] + w2 * uv[2][0]
        v = w0 * uv[0][1] + w1 * uv[1][1] + w2 * uv[2][1]
        col = tex[np.clip((v % 1) * th, 0, th - 1).astype(int), np.clip((u % 1) * tw, 0, tw - 1).astype(int)]
        col[..., 3] = 255
        sub[m] = zz[m]
        img[y0 : y1 + 1, x0 : x1 + 1][m] = col[m]
    out = Image.fromarray(img.astype(np.uint8), "RGBA")
    return out.crop(out.getbbox()) if crop else out


def models(champ, folder):
    """the champion as the player's body sprite: its model from straight above, facing right"""
    mesh, tex = MODELS[champ]
    base = os.path.join(folder, "assets/characters", champ, "skins/base")
    out = os.path.join(ROOT, "client/public/img/champions/models")
    os.makedirs(out, exist_ok=True)
    with tempfile.TemporaryDirectory() as tmp:
        tex_png = os.path.join(tmp, "t.png")
        tex_to_png(os.path.join(base, tex + ".tex"), tex_png)
        img = render_mesh(os.path.join(base, mesh + ".skn"), tex_png, ("tilt", 90), size=MODEL_SIZE - 16)
        # the model faces down the screen; the player sprite faces right
        img = img.rotate(90, expand=True)
        # every champion on the same canvas, so the client draws them all at one scale
        canvas = Image.new("RGBA", (MODEL_SIZE, MODEL_SIZE), (0, 0, 0, 0))
        canvas.paste(img, ((MODEL_SIZE - img.width) // 2, (MODEL_SIZE - img.height) // 2))
        canvas.save(os.path.join(out, champ + ".png"))
    print(champ, "model")


def folder_name(folder):
    return os.path.basename(folder).lower()


if __name__ == "__main__":
    for champ, name in CHAMPIONS.items():
        folder = os.path.join(SRC, "champions", name)
        sounds(champ, folder)
        textures(champ, folder)
        models(champ, folder)
