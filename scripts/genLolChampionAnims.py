"""
Champions' own animations, as sprite sheets the client plays: the walk and each spell's cast, posed
from the game's skeleton (.skl) and animation (.anm) files and drawn from straight above, frame by
frame, the same way genLolChampionFx.py draws the standing model.

  client/public/img/champions/models/<champ>_<anim>.png   one row of frames, left to right

Run with: python3 scripts/genLolChampionAnims.py <league>/extracted   (needs pillow, numpy)
"""

import os
import struct
import sys
import tempfile

import numpy as np
from PIL import Image

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from genLolChampionFx import CHAMPIONS, MODEL_SIZE, MODELS, rasterize, tex_to_png
from lolSkeleton import read_anm, read_skl

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = sys.argv[1]

# the animations worth having, and how many frames of each to draw: a walk cycle, and each spell's cast
ANIMS = {"run": 8, "spell1": 5, "spell2": 5, "spell3": 5, "spell4": 5}
# one frame, in the sheet
FRAME = 96


def read_skinned(path):
    """a .skn's vertices with the bones that move them"""
    d = open(path, "rb").read()
    major = struct.unpack_from("<H", d, 4)[0]
    subs = struct.unpack_from("<I", d, 8)[0]
    i = 12 + subs * 80 + (4 if major >= 4 else 0)
    ic, vc = struct.unpack_from("<II", d, i)
    i += 8
    vsize = 52
    if major >= 4:
        vsize = struct.unpack_from("<I", d, i)[0]
        i += 8 + 40
    idx = np.frombuffer(d, "<u2", ic, i)
    i += ic * 2
    verts = np.frombuffer(d, np.uint8, vc * vsize, i).reshape(vc, vsize)
    pos = verts[:, 0:12].copy().view("<f4").reshape(vc, 3)
    bones = verts[:, 12:16].copy()
    weights = verts[:, 16:32].copy().view("<f4").reshape(vc, 4)
    uv = verts[:, 44:52].copy().view("<f4").reshape(vc, 2)
    faces = [tuple(int(j) for j in idx[k : k + 3]) for k in range(0, ic, 3)]
    return pos, bones, weights, uv, faces


def globals_at(joints, frame_pose, frame):
    """where every joint sits at this frame, walking down from the root"""
    out = [None] * len(joints)
    for i, joint in enumerate(joints):
        poses = frame_pose.get(joint.hash)
        local = poses[frame % len(poses)] if poses else joint.local
        parent = joint.parent
        out[i] = local if parent < 0 else out[parent] @ local
    return out


def pose(pos, bones, weights, joints, influences, anim, frame):
    """each vertex moved by the bones that hold it"""
    place = globals_at(joints, anim["pose"], frame)
    skin = np.zeros((len(joints), 4, 4))
    for i, joint in enumerate(joints):
        skin[i] = place[i] @ joint.inv_bind
    out = np.zeros_like(pos)
    homogeneous = np.concatenate([pos, np.ones((len(pos), 1))], 1)
    for slot in range(4):
        w = weights[:, slot]
        used = w > 0
        if not used.any():
            continue
        joint_of = np.array([influences[min(b, len(influences) - 1)] for b in bones[:, slot]])
        mats = skin[joint_of[used]]
        moved = np.einsum("nij,nj->ni", mats, homogeneous[used])[:, :3]
        out[used] += moved * w[used, None]
    return out


def sheet(champ, name, base, mesh, tex_png, joints, influences, anim, count):
    """one row of frames, each framed the same way so the client can just step along it"""
    pos, bones, weights, uv, faces = read_skinned(os.path.join(base, mesh + ".skn"))
    uvs = [tuple(tuple(uv[j]) for j in f) for f in faces]
    step = max(1, anim["frames"] // count)
    posed = [pose(pos, bones, weights, joints, influences, anim, n * step) for n in range(count)]
    # one framing for the whole animation, so the champion doesn't swell and shrink frame to frame
    flat = np.concatenate(posed)
    down = -flat[:, 1] * np.cos(np.radians(90)) + flat[:, 2] * np.sin(np.radians(90))
    bounds = (flat[:, 0].min(), flat[:, 0].max(), down.min(), down.max())
    out = Image.new("RGBA", (FRAME * count, FRAME), (0, 0, 0, 0))
    for n, verts in enumerate(posed):
        img = rasterize(verts, faces, uvs, tex_png, ("tilt", 90), size=FRAME, bounds=bounds, crop=False)
        img = img.rotate(90, expand=True)
        out.paste(img, (n * FRAME, 0))
    path = os.path.join(ROOT, "client/public/img/champions/models", "%s_%s.png" % (champ, name))
    out.save(path)
    return count


def pick(files, want):
    """
    The same animation is named differently from champion to champion: run.anm, jinx_minigun_run.anm,
    garen_2013_run.anm. Take the one whose name ends with what we want, shortest first, so a plain run
    beats run_haste and a champion's own prefix doesn't hide it.
    """
    hits = [f for f in files if f.lower().endswith(want + ".anm")]
    return min(hits, key=len) if hits else None


def main():
    made = {}
    for champ, name in CHAMPIONS.items():
        mesh, tex = MODELS[champ]
        base = os.path.join(SRC, "champions", name, "assets/characters", champ, "skins/base")
        skl = [f for f in os.listdir(base) if f.endswith(".skl")]
        if not skl:
            print(champ, "no skeleton")
            continue
        joints, influences = read_skl(os.path.join(base, skl[0]))
        anims_dir = os.path.join(base, "animations")
        done = []
        with tempfile.TemporaryDirectory() as tmp:
            tex_png = os.path.join(tmp, "t.png")
            tex_to_png(os.path.join(base, tex + ".tex"), tex_png)
            files = sorted(os.listdir(anims_dir)) if os.path.isdir(anims_dir) else []
            for anim_name, count in ANIMS.items():
                found = pick(files, anim_name)
                if not found:
                    continue
                path = os.path.join(anims_dir, found)
                try:
                    anim = read_anm(path)
                    sheet(champ, anim_name, base, mesh, tex_png, joints, influences, anim, count)
                    done.append(anim_name)
                except Exception as e:
                    print("  ", champ, anim_name, "failed:", e)
        made[champ] = done
        print(champ, "->", ", ".join(done) or "nothing")
    write_manifest(made)
    return made


def write_manifest(made):
    """what the client can play, and how each sheet is laid out"""
    lines = [
        "// Generated by scripts/genLolChampionAnims.py. Do not edit.",
        "",
        "/** one frame of a sprite sheet, in pixels */",
        "export const AnimFrameSize = %d;" % FRAME,
        "",
        "/** how many frames each champion's sheets hold: img/champions/models/<champ>_<anim>.png */",
        "export const ChampionAnims: Record<string, Record<string, number>> = {",
    ]
    for champ, done in sorted(made.items()):
        if not done:
            continue
        inner = ", ".join('%s: %d' % (a, ANIMS[a]) for a in done)
        lines.append("    %s: { %s }," % (champ, inner))
    lines += ["};", ""]
    path = os.path.join(ROOT, "client/src/championAnims.ts")
    open(path, "w").write("\n".join(lines))
    print("wrote", path)


main()
