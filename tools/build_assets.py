"""Generate web-ready covers, the share image and icons from the original covers.
(The paper textures and hero artwork come from tools/build_hero.py.)

Usage:  python3 tools/build_assets.py
Needs:  pip install pillow numpy
"""
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "assets" / "covers" / "original"
COVERS = ROOT / "assets" / "covers"
IMG = ROOT / "assets" / "img"
IMG.mkdir(parents=True, exist_ok=True)

LANGS = ["zh", "en", "es", "fr", "de", "ja", "ko"]
RED = (125, 3, 5)        # cover paper (see tools/build_hero.py)
CREAM = (219, 204, 186)


def source(lang):
    return next(SRC.glob(f"cover-{lang}.*"))


def covers():
    """Resize every cover to a 2:3 WebP in two widths."""
    for lang in LANGS:
        im = Image.open(source(lang)).convert("RGB")
        w, h = im.size
        # normalise to exactly 2:3
        target_h = round(w * 1.5)
        if target_h != h:
            top = max(0, (h - target_h) // 2)
            im = im.crop((0, top, w, top + min(h, target_h)))
        for width in (480, 1000):
            out = im.resize((width, round(width * 1.5)), Image.LANCZOS)
            out.save(COVERS / f"cover-{lang}-{width}.webp", "WEBP", quality=82, method=6)


def social_card():
    """1200x630 share image: all seven covers fanned out on red paper."""
    W, H = 1200, 630
    # warm near-black stage with a soft red glow behind the covers
    card = Image.new("RGB", (W, H), (20, 15, 13))
    glow = Image.new("L", (W, H), 0)
    ImageDraw.Draw(glow).ellipse((200, 60, W - 200, H + 120), fill=110)
    glow = glow.filter(ImageFilter.GaussianBlur(110))
    card = Image.composite(Image.new("RGB", (W, H), (96, 10, 14)), card, glow)

    ch = 440
    cw = round(ch / 1.5)
    order = ["de", "fr", "ja", "zh", "en", "es", "ko"]
    n = len(order)
    centre = n // 2
    layers = []
    for i, lang in enumerate(order):
        c = Image.open(COVERS / f"cover-{lang}-480.webp").convert("RGBA").resize((cw, ch), Image.LANCZOS)
        off = i - centre
        angle = -off * 5
        scale = 1 - abs(off) * 0.06
        c = c.resize((round(cw * scale), round(ch * scale)), Image.LANCZOS)
        rot = c.rotate(angle, resample=Image.BICUBIC, expand=True)
        x = W // 2 + off * 132 - rot.width // 2
        y = H // 2 - rot.height // 2 + abs(off) * 14 + 8
        layers.append((abs(off), x, y, rot))
    for _, x, y, rot in sorted(layers, key=lambda l: -l[0]):
        shadow = Image.new("RGBA", rot.size, (0, 0, 0, 0))
        shadow.putalpha(rot.getchannel("A").point(lambda a: int(a * 0.8)))
        shadow = shadow.filter(ImageFilter.GaussianBlur(14))
        card.paste(shadow, (x + 6, y + 14), shadow)
        card.paste(rot, (x, y), rot)
    card.save(IMG / "og-image.jpg", "JPEG", quality=86, optimize=True, progressive=True)


def icons():
    """Red square torn open by a cream strip, like the cover."""
    for size, name in ((180, "apple-touch-icon.png"), (512, "icon-512.png"), (32, "favicon-32.png")):
        s = 4
        big = Image.new("RGB", (size * s, size * s), RED)
        d = ImageDraw.Draw(big)
        rng = np.random.default_rng(7)
        pts_l, pts_r = [], []
        steps = 28
        for i in range(steps + 1):
            y = i / steps * size * s
            prof = np.exp(-((i / steps - 0.5) ** 2) / 0.05)
            half = size * s * (0.05 + 0.1 * prof)
            cx = size * s * 0.5 + np.sin(i * 0.7) * size * s * 0.015
            pts_l.append((cx - half - rng.uniform(0, size * s * 0.025), y))
            pts_r.append((cx + half + rng.uniform(0, size * s * 0.025), y))
        d.polygon(pts_l + pts_r[::-1], fill=CREAM)
        big.resize((size, size), Image.LANCZOS).save(IMG / name)


if __name__ == "__main__":
    covers()
    social_card()
    icons()
    for p in sorted(list(COVERS.glob("*.webp")) + list(IMG.iterdir())):
        print(f"{p.relative_to(ROOT)}  {p.stat().st_size // 1024} KB")
