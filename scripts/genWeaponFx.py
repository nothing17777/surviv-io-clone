"""
Draws the projectile and swing sprites for the Terraria / Pixel Gun 3D weapons
into client/public/img/custom-weapons/fx/. Shots point right (+x).

Run with: python3 scripts/genWeaponFx.py
"""

import math
import os

from PIL import Image, ImageDraw, ImageFilter

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "client/public/img/custom-weapons/fx")


def glow(im, radius, strength=2):
    """Puts a soft blurred copy of the image behind it."""
    halo = im.filter(ImageFilter.GaussianBlur(radius))
    out = Image.new("RGBA", im.size)
    for _ in range(strength):
        out.alpha_composite(halo)
    out.alpha_composite(im)
    return out


def canvas(w, h=None):
    return Image.new("RGBA", (w, h or w))


def terra_slash():
    # a green crescent bulging forward, like the Terra Blade's slash
    im = canvas(128)
    d = ImageDraw.Draw(im)
    d.ellipse((8, 8, 120, 120), fill=(110, 255, 120, 255))
    d.ellipse((-20, 14, 92, 114), fill=(0, 0, 0, 0))
    inner = canvas(128)
    di = ImageDraw.Draw(inner)
    di.ellipse((22, 22, 112, 106), fill=(220, 255, 210, 255))
    di.ellipse((-8, 24, 92, 104), fill=(0, 0, 0, 0))
    im.alpha_composite(inner)
    return glow(im, 8, 3)


def cat():
    # Meowmere's cat head: pixel art, facing right, scaled up crisp
    rows = [
        "..O.......O.",
        ".OYO.....OYO",
        ".OYYOOOOOYYO",
        "OYYYYYYYYYYO",
        "OYYKYYYYKYYO",
        "OYYKYYYYKYYO",
        "OYPYYYKYYPYO",
        "OYYYYKYKYYYO",
        ".OYYYYYYYYO.",
        "..OOOOOOOO..",
    ]
    colors = {"O": (60, 30, 20, 255), "Y": (250, 200, 120, 255), "K": (20, 10, 10, 255), "P": (255, 140, 170, 255)}
    im = canvas(len(rows[0]), len(rows))
    for y, row in enumerate(rows):
        for x, c in enumerate(row):
            if c in colors:
                im.putpixel((x, y), colors[c])
    im = im.resize((im.width * 8, im.height * 8), Image.NEAREST).rotate(-90, expand=True)
    # rainbow trail behind (to the left once rotated so it faces right)
    out = canvas(im.width + 96, im.height)
    d = ImageDraw.Draw(out)
    bands = [(255, 60, 60), (255, 160, 40), (255, 240, 60), (80, 230, 90), (70, 150, 255), (170, 90, 255)]
    bh = im.height / len(bands)
    for i, c in enumerate(bands):
        d.rectangle((0, i * bh, 110, (i + 1) * bh), fill=c + (200,))
    out.alpha_composite(im, (96, 0))
    return glow(out, 4, 1)


def star():
    im = canvas(128)
    d = ImageDraw.Draw(im)
    pts = []
    for i in range(10):
        r = 58 if i % 2 == 0 else 24
        a = math.pi / 2 + i * math.pi / 5
        pts.append((64 + r * math.cos(a), 64 - r * math.sin(a)))
    d.polygon(pts, fill=(255, 150, 220, 255))
    d.ellipse((50, 50, 78, 78), fill=(255, 235, 250, 255))
    return glow(im, 8, 3)


def orb(core, ring, sparks=None):
    im = canvas(128)
    d = ImageDraw.Draw(im)
    d.ellipse((22, 22, 106, 106), fill=ring)
    d.ellipse((38, 38, 90, 90), fill=core)
    if sparks:
        for i in range(6):
            a = i * math.pi / 3
            x0, y0 = 64 + 30 * math.cos(a), 64 + 30 * math.sin(a)
            x1, y1 = 64 + 58 * math.cos(a + 0.3), 64 + 58 * math.sin(a + 0.3)
            xm, ym = (x0 + x1) / 2 + 8 * math.sin(a), (y0 + y1) / 2 - 8 * math.cos(a)
            d.line((x0, y0, xm, ym, x1, y1), fill=sparks, width=5)
    return glow(im, 10, 3)


def rocket():
    im = canvas(160, 64)
    d = ImageDraw.Draw(im)
    d.polygon([(0, 22), (0, 42), (40, 36), (40, 28)], fill=(255, 170, 40, 230))
    d.polygon([(10, 26), (10, 38), (40, 34), (40, 30)], fill=(255, 250, 160, 255))
    d.rectangle((40, 22, 120, 42), fill=(90, 110, 80, 255))
    d.polygon([(120, 22), (120, 42), (156, 32)], fill=(200, 60, 40, 255))
    d.polygon([(44, 22), (64, 22), (54, 6)], fill=(70, 80, 60, 255))
    d.polygon([(44, 42), (64, 42), (54, 58)], fill=(70, 80, 60, 255))
    return glow(im, 3, 1)


def arc(colors):
    """A swing aura: a crescent in front of the player (the player is at the left edge, middle)."""
    size = 256
    im = canvas(size)
    for i, c in enumerate(colors):
        layer = canvas(size)
        d = ImageDraw.Draw(layer)
        w = 26 - i * 4
        r = 118 - i * 6
        d.arc((-r, size / 2 - r, r, size / 2 + r), -70, 70, fill=c + (230,), width=max(w, 6))
        im.alpha_composite(layer)
    return glow(im, 10, 2)


def main():
    os.makedirs(OUT, exist_ok=True)
    sprites = {
        "terra_slash": terra_slash(),
        "cat": cat(),
        "star": star(),
        "dark_orb": orb((20, 0, 40, 255), (130, 40, 220, 220)),
        "tesla_orb": orb((230, 255, 255, 255), (90, 200, 255, 200), sparks=(200, 250, 255, 255)),
        "rocket": rocket(),
        "arc_green": arc([(60, 220, 90), (180, 255, 170)]),
        "arc_purple": arc([(120, 40, 200), (210, 140, 255)]),
        "arc_gold": arc([(230, 170, 30), (255, 240, 150)]),
        "arc_pink": arc([(230, 90, 190), (255, 200, 240)]),
        "arc_rainbow": arc([(255, 70, 70), (255, 200, 50), (90, 230, 100), (80, 150, 255), (190, 100, 255)]),
    }
    for name, im in sprites.items():
        im.save(os.path.join(OUT, name + ".png"))


main()
