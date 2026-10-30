"""
Riot PROP .bin reader. Field and class names are stored as FNV-1a hashes of their lowercased name, so a
field is looked up by hashing the name we want; nothing needs a hash dictionary. Used by
genLolSpellFx.py to read champions' particle systems out of their skin .bin files.
"""
import struct

def fnv1a(s):
    h = 0x811c9dc5
    for c in s.encode():
        h = ((h ^ c) * 0x01000193) & 0xFFFFFFFF
    return h

SIMPLE = {0:("B",0),1:("B",1),2:("b",1),3:("B",1),4:("h",2),5:("H",2),6:("i",4),7:("I",4),
          8:("q",8),9:("Q",8),10:("f",4),11:("2f",8),12:("3f",12),13:("4f",16),14:("16f",64),
          15:("4B",4),16:("str",0),17:("I",4),18:("Q",8)}

class R:
    def __init__(s, d, i=0): s.d, s.i = d, i
    def u(s, f, n):
        if n == 0: return None
        v = struct.unpack_from("<"+f, s.d, s.i); s.i += n; return v[0] if len(v)==1 else v

def read_value(r, t):
    if t & 0x80:
        kind = t & 0x7F
        if kind in (0, 1):            # list / list2
            vt = r.u("B",1); r.u("I",4); n = r.u("I",4)
            return [read_value(r, vt) for _ in range(n)]
        if kind in (2, 3):            # pointer / embedded struct
            cls = r.u("I",4)
            if cls == 0: return {}
            size = r.u("I",4); end = r.i + size; n = r.u("H",2)
            o = {}
            for _ in range(n):
                nh = r.u("I",4); ft = r.u("B",1)
                o[nh] = read_value(r, ft)
            r.i = end
            return o
        if kind == 4: return r.u("I",4)   # link
        if kind == 5:                      # option
            vt = r.u("B",1); n = r.u("B",1)
            return read_value(r, vt) if n else None
        if kind == 6:                      # map
            kt = r.u("B",1); vt = r.u("B",1); r.u("I",4); n = r.u("I",4)
            return {read_value(r, kt): read_value(r, vt) for _ in range(n)}
        if kind == 7: return r.u("B",1)   # flag
        raise ValueError("complex %d" % kind)
    if t == 16:
        n = r.u("H",2); v = r.d[r.i:r.i+n].decode("utf-8","replace"); r.i += n; return v
    f, n = SIMPLE[t]
    return r.u(f, n)
def read_bin(path):
    d = open(path,"rb").read()
    r = R(d)
    magic = r.u("4s",4)
    if magic == b"PTCH":
        r.u("Q",8); magic = r.u("4s",4)
    assert magic == b"PROP", magic
    ver = r.u("I",4)
    if ver >= 2:
        n = r.u("I",4)
        for _ in range(n):
            l = r.u("H",2); r.i += l
    cnt = r.u("I",4)
    types = [r.u("I",4) for _ in range(cnt)]
    out = []
    for t in types:
        size = r.u("I",4); end = r.i + size
        h = r.u("I",4); n = r.u("H",2)
        o = {}
        for _ in range(n):
            nh = r.u("I",4); ft = r.u("B",1)
            try: o[nh] = read_value(r, ft)
            except Exception: r.i = end; break
        r.i = end
        out.append((t, h, o))
    return out
