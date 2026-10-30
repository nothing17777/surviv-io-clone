"""
League skeletons and animations: .skl holds the joints a model is skinned to, .anm the pose of each
joint over time. Together with the .skn's bone weights they give the champion's own walk and cast
animations, which genLolChampionModels.py renders as sprite sheets.

.anm v5 stores each frame as indices into a shared pool of translations/scales (3 floats) and
rotations (quaternions quantised to 48 bits), which is what makes the files small.
"""

import struct

import numpy as np


def elf_hash(name):
    """how .anm names the joints it animates"""
    h = 0
    for c in name.lower():
        h = (h << 4) + ord(c)
        high = h & 0xF0000000
        if high:
            h ^= high >> 24
        h &= ~high & 0xFFFFFFFF
    return h


class Joint:
    __slots__ = ("name", "hash", "parent", "local", "inv_bind")


def quat_matrix(q):
    """a quaternion (x, y, z, w) as a 3x3 rotation"""
    x, y, z, w = q
    n = (x * x + y * y + z * z + w * w) ** 0.5 or 1.0
    x, y, z, w = x / n, y / n, z / n, w / n
    return np.array([
        [1 - 2 * (y * y + z * z), 2 * (x * y - w * z), 2 * (x * z + w * y)],
        [2 * (x * y + w * z), 1 - 2 * (x * x + z * z), 2 * (y * z - w * x)],
        [2 * (x * z - w * y), 2 * (y * z + w * x), 1 - 2 * (x * x + y * y)],
    ])


def trs(translation, scale, rotation):
    """a 4x4 from translation, scale and rotation"""
    m = np.eye(4)
    m[:3, :3] = quat_matrix(rotation) * np.asarray(scale)
    m[:3, 3] = translation
    return m


def read_skl(path):
    """the joints, each with its parent, its pose and the inverse of its bind pose"""
    d = open(path, "rb").read()
    magic = struct.unpack_from("<I", d, 4)[0]
    if magic != 0x22FD4FC3:
        raise ValueError("not a skeleton we read: %s" % hex(magic))
    count = struct.unpack_from("<H", d, 14)[0]
    start = struct.unpack_from("<i", d, 20)[0]
    joints = []
    for i in range(count):
        o = start + i * 100
        j = Joint()
        j.parent = struct.unpack_from("<h", d, o + 4)[0]
        j.hash = struct.unpack_from("<I", d, o + 8)[0]
        j.local = trs(
            struct.unpack_from("<3f", d, o + 16),
            struct.unpack_from("<3f", d, o + 28),
            struct.unpack_from("<4f", d, o + 40),
        )
        j.inv_bind = trs(
            struct.unpack_from("<3f", d, o + 56),
            struct.unpack_from("<3f", d, o + 68),
            struct.unpack_from("<4f", d, o + 80),
        )
        name_at = o + 96 + struct.unpack_from("<i", d, o + 96)[0]
        end = d.index(b"\0", name_at)
        j.name = d[name_at:end].decode("utf-8", "replace")
        joints.append(j)
    # the mesh's bone indices are into this table, not into the joints directly
    influences_at, count = struct.unpack_from("<i", d, 28)[0], struct.unpack_from("<I", d, 16)[0]
    influences = list(np.frombuffer(d, "<u2", count, influences_at))
    return joints, influences


SQRT2 = 2 ** 0.5


def _unpack_quat(raw):
    """48 bits: which component was dropped, then the other three at 15 bits each"""
    bits = raw[0] | (raw[1] << 16) | (raw[2] << 32)
    dropped = (bits >> 45) & 3
    parts = [
        ((bits >> 30) & 0x7FFF) / 0x7FFF * SQRT2 - 1 / SQRT2,
        ((bits >> 15) & 0x7FFF) / 0x7FFF * SQRT2 - 1 / SQRT2,
        (bits & 0x7FFF) / 0x7FFF * SQRT2 - 1 / SQRT2,
    ]
    rest = max(0.0, 1.0 - sum(p * p for p in parts))
    last = rest ** 0.5
    q = parts[:]
    q.insert(dropped, last)
    return tuple(q)


def read_anm(path, window=None):
    """
    The pose of each animated joint, by joint hash, for every frame. `window` caps how many seconds
    to read: some files hold far more than one cycle of the animation (Ashe's run is nine seconds of
    them), and walking through all of it gives a different pose every frame instead of one loop.
    """
    d = open(path, "rb").read()
    magic, version = d[:8], struct.unpack_from("<I", d, 8)[0]
    if magic == b"r3d2canm":
        return _read_anm_compressed(d, window=window)
    if magic != b"r3d2anmd":
        raise ValueError("%s is %r, a format we don't read" % (path, magic))
    if version == 3:
        return _read_anm_v3(d)
    if version == 4:
        return _read_anm_v4(d)
    if version != 5:
        raise ValueError("%s is v%d, which we don't read" % (path, version))
    tracks, frames, duration = struct.unpack_from("<IIf", d, 12 + 16)
    hashes_at, _name_at, _time_at, vectors_at, rotations_at, frames_at = struct.unpack_from("<6i", d, 12 + 28)
    hashes_at, vectors_at, rotations_at, frames_at = (
        hashes_at + 12, vectors_at + 12, rotations_at + 12, frames_at + 12,
    )
    joint_hashes = np.frombuffer(d, "<u4", tracks, hashes_at)
    vectors = np.frombuffer(d, "<f4", (rotations_at - vectors_at) // 4, vectors_at).reshape(-1, 3)
    rot_count = (frames_at - rotations_at) // 6
    rotations = [
        _unpack_quat(struct.unpack_from("<3H", d, rotations_at + i * 6)) for i in range(rot_count)
    ]
    entries = np.frombuffer(d, "<u2", tracks * frames * 3, frames_at).reshape(frames, tracks, 3)
    pose = {}
    for t, joint in enumerate(joint_hashes):
        pose[int(joint)] = [
            trs(vectors[entries[f, t, 0]], vectors[entries[f, t, 1]], rotations[entries[f, t, 2]])
            for f in range(frames)
        ]
    return {"frames": frames, "duration": duration, "pose": pose}


def _read_anm_v3(d):
    """the oldest layout: every track spells out its name and every frame in full"""
    tracks, frames, fps = struct.unpack_from("<3I", d, 16)
    pose, o = {}, 28
    for _ in range(tracks):
        name = d[o : o + 32].split(b"\0")[0].decode("utf-8", "replace")
        o += 36  # the name, then the track's flags
        poses = []
        for _ in range(frames):
            rotation = struct.unpack_from("<4f", d, o)
            translation = struct.unpack_from("<3f", d, o + 16)
            poses.append(trs(translation, (1, 1, 1), rotation))
            o += 28
        pose[elf_hash(name)] = poses
    return {"frames": frames, "duration": 1.0 / max(fps, 1), "pose": pose}


def _read_anm_v4(d):
    """like v5, but each frame names its joint and the rotations are plain quaternions"""
    tracks, frames, duration = struct.unpack_from("<IIf", d, 12 + 16)
    _tracks_at, _name_at, _time_at, vectors_at, rotations_at, frames_at = struct.unpack_from("<6i", d, 12 + 28)
    vectors_at, rotations_at, frames_at = vectors_at + 12, rotations_at + 12, frames_at + 12
    vectors = np.frombuffer(d, "<f4", (rotations_at - vectors_at) // 4, vectors_at).reshape(-1, 3)
    rotations = np.frombuffer(d, "<f4", (frames_at - rotations_at) // 4, rotations_at).reshape(-1, 4)
    total = tracks * frames
    stride = (len(d) - frames_at) // total
    pose = {}
    for n in range(total):
        o = frames_at + n * stride
        joint, t, s_, r = struct.unpack_from("<IHHH", d, o)
        pose.setdefault(int(joint), []).append(trs(vectors[t], vectors[s_], rotations[r]))
    return {"frames": frames, "duration": duration, "pose": pose}


def _read_anm_compressed(d, want_frames=32, window=None):
    """
    The compressed layout keeps only the frames where a joint actually moved: each 10-byte entry is a
    time, which joint and which of rotation/translation/scale it sets, and the value quantised into
    16 bits (a rotation into 48). Reading it back means walking the keyframes in time order and
    holding the last value seen for each joint, which is what the game does between keyframes.
    """
    joint_count, frame_count = struct.unpack_from("<2I", d, 24)
    duration = struct.unpack_from("<f", d, 36)[0]
    t_min = np.array(struct.unpack_from("<3f", d, 68))
    t_max = np.array(struct.unpack_from("<3f", d, 80))
    s_min = np.array(struct.unpack_from("<3f", d, 92))
    s_max = np.array(struct.unpack_from("<3f", d, 104))
    frames_at, _jump_at, hashes_at = (o + 12 for o in struct.unpack_from("<3i", d, 116))
    hashes = np.frombuffer(d, "<u4", joint_count, hashes_at)

    # the value each joint holds, starting from no animation at all
    held = {j: [None, None, None] for j in range(joint_count)}
    keys = []
    for n in range(frame_count):
        o = frames_at + n * 10
        time, bits = struct.unpack_from("<2H", d, o)
        raw = struct.unpack_from("<3H", d, o + 4)
        keys.append((time / 65535.0 * duration, bits & 0x3FFF, (bits >> 14) & 3, raw))
    keys.sort(key=lambda k: k[0])

    # sample the held values at even times across one cycle of the animation
    span = min(duration, window) if window else duration
    pose = {int(h): [] for h in hashes}
    at = 0
    for step in range(want_frames):
        now = span * step / want_frames
        while at < len(keys) and keys[at][0] <= now:
            _t, joint, kind, raw = keys[at]
            if joint < joint_count:
                if kind == 0:
                    held[joint][0] = _unpack_quat(raw)
                elif kind == 1:
                    held[joint][1] = t_min + (t_max - t_min) * (np.array(raw) / 65535.0)
                else:
                    held[joint][2] = s_min + (s_max - s_min) * (np.array(raw) / 65535.0)
            at += 1
        for joint in range(joint_count):
            rotation, translation, scale = held[joint]
            pose[int(hashes[joint])].append(trs(
                translation if translation is not None else (0, 0, 0),
                scale if scale is not None else (1, 1, 1),
                rotation if rotation is not None else (0, 0, 0, 1),
            ))
    return {"frames": want_frames, "duration": span / max(want_frames, 1), "pose": pose}
