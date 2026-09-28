"""Generate web-ready images from the original covers.

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
RED = (158, 16, 21)
CREAM = (236, 228, 214)


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


def tileable_noise(size, beta, seed):
    """Periodic 1/f^beta noise via FFT, normalised to 0..1 (tiles seamlessly)."""
    rng = np.random.default_rng(seed)
    white = rng.standard_normal((size, size))
    f = np.fft.fftfreq(size)
    fx, fy = np.meshgrid(f, f)
    r = np.sqrt(fx**2 + fy**2)
    r[0, 0] = 1
    spectrum = np.fft.fft2(white) / r**beta
    spectrum[0, 0] = 0
    n = np.real(np.fft.ifft2(spectrum))
    n -= n.min()
    return n / n.max()


def fibres(size, count, seed, length=(6, 22)):
    """Short wrapped strokes, like fibres in handmade paper."""
    rng = np.random.default_rng(seed)
    layer = Image.new("L", (size, size), 0)
    d = ImageDraw.Draw(layer)
    for _ in range(count):
        x, y = rng.uniform(0, size, 2)
        ang = rng.uniform(0, np.pi)
        ln = rng.uniform(*length)
        pts = []
        for t in np.linspace(0, 1, 5):
            a = ang + np.sin(t * 3) * 0.4
            pts.append((x + np.cos(a) * ln * t, y + np.sin(a) * ln * t))
        v = int(rng.uniform(40, 150))
        for ox in (-size, 0, size):
            for oy in (-size, 0, size):
                d.line([(px + ox, py + oy) for px, py in pts], fill=v, width=1)
    return np.asarray(layer.filter(ImageFilter.GaussianBlur(0.6)), dtype=float) / 255


def paper(name, base, size=512, seed=1, contrast=1.0, fibre_sign=1):
    low = tileable_noise(size, 1.3, seed)
    mid = tileable_noise(size, 0.9, seed + 1)
    grain = tileable_noise(size, 0.2, seed + 2)
    fib = fibres(size, 1400, seed + 3)
    fib_dark = fibres(size, 1600, seed + 4, length=(3, 10))
    t = (low - 0.5) * 0.45 + (mid - 0.5) * 0.35 + (grain - 0.5) * 0.7
    t = (t + (fib - fib_dark) * 0.45 * fibre_sign) * contrast
    rgb = np.clip(np.array(base, dtype=float)[None, None, :] * (1 + t[..., None] * 0.55), 0, 255)
    Image.fromarray(rgb.astype(np.uint8)).save(IMG / name, "WEBP", quality=80, method=6)


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
    paper("paper-red.webp", RED, seed=11, contrast=1.0, fibre_sign=1)
    paper("paper-cream.webp", CREAM, seed=21, contrast=0.3, fibre_sign=-1)
    social_card()
    icons()
    for p in sorted(list(COVERS.glob("*.webp")) + list(IMG.iterdir())):
        print(f"{p.relative_to(ROOT)}  {p.stat().st_size // 1024} KB")
