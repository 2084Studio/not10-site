"""Cut the hero artwork out of the cover so the site uses the book's own paper.

All seven covers share one piece of art; the Chinese file is the largest, so it is
the master. Outputs:

  assets/hero/sheet-left-{w}.webp, sheet-right-{w}.webp   red halves (alpha, text removed)
  assets/hero/base-{w}.webp                               white inner paper (text removed)
  assets/hero/edge.webp                                   torn edge strip for section dividers
  assets/img/paper-red.webp, paper-cream.webp             seamless tiles from the cover

and prints the geometry constants used by assets/js/main.js.

Usage:  python3 tools/build_hero.py      (needs: pip install pillow numpy scipy)
"""
from pathlib import Path

import numpy as np
from PIL import Image
from scipy import ndimage as ndi

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "assets" / "covers" / "original" / "cover-zh.jpg"
HERO = ROOT / "assets" / "hero"
IMG = ROOT / "assets" / "img"
HERO.mkdir(parents=True, exist_ok=True)

rng = np.random.default_rng(1966)


def load():
    im = np.asarray(Image.open(SRC).convert("RGB")).astype(np.float32)
    return im


def disk(r):
    y, x = np.ogrid[-r:r + 1, -r:r + 1]
    return x * x + y * y <= r * r


# ---------------------------------------------------------------- segmentation

def segment(im):
    H, W, _ = im.shape
    red = ndi.gaussian_filter(im[..., 0] - (im[..., 1] + im[..., 2]) / 2, 1.0)
    lab, _ = ndi.label(red > 55, structure=np.ones((3, 3)))
    left = lab == lab[H // 2, 0]
    right = lab == lab[H // 2, W - 1]
    left_f, right_f = ndi.binary_fill_holes(left), ndi.binary_fill_holes(right)
    gap = ~(left_f | right_f)
    dist_gap = ndi.distance_transform_edt(~gap)

    # printed text = holes in the red sheets, away from the torn edge,
    # inside the title row or the author block
    holes = (left_f & ~left) | (right_f & ~right)
    hl, hn = ndi.label(holes, structure=np.ones((3, 3)))
    text = np.zeros_like(holes)
    for i, sl in enumerate(ndi.find_objects(hl), 1):
        comp = hl[sl] == i
        cy = (sl[0].start + sl[0].stop) / 2 / H
        if dist_gap[sl][comp].min() < 30:
            continue
        in_title = .39 < cy < .49 and comp.sum() > 1000     # whole glyphs, not fibres
        in_author = cy > .85 and sl[1].start > W * .8 and comp.sum() > 40
        if in_title or in_author:
            text[sl] |= comp

    # the author's name is small and broken into many pieces: take every light
    # pixel in its block
    lum = im.mean(-1)
    block = np.zeros_like(text)
    block[int(.872 * H):int(.918 * H), int(.82 * W):int(.945 * W)] = True
    text |= block & right_f & (lum > 100) & (red < 70)

    # red strokes inside the gap (the character 非) — everything red that is not a sheet
    fei = (red > 55) & gap
    return dict(left=left_f, right=right_f, gap=gap, text=text, fei=fei,
                dist_gap=dist_gap, red=red)


# ---------------------------------------------------------------- inpainting

def fill_regions(im, regions, valid):
    """Replace each region with texture copied from a nearby valid area."""
    out = im.copy()
    H, W, _ = im.shape
    lab, n = ndi.label(regions)
    for i, sl in enumerate(ndi.find_objects(lab), 1):
        m = np.zeros(regions.shape, bool)
        m[sl] = lab[sl] == i
        big = ndi.binary_dilation(m, disk(10))
        ring = ndi.binary_dilation(m, disk(18)) & ~ndi.binary_dilation(m, disk(6))
        ys, xs = np.where(big)
        ry, rx = np.where(ring)
        h = sl[0].stop - sl[0].start
        best = None
        for dy in range(-520, 521, 20):
            if abs(dy) < h + 30:
                continue
            for dx in range(-120, 121, 30):
                sy, sx = ys + dy, xs + dx
                if min(sy.min(), (ry + dy).min()) < 0 or max(sy.max(), (ry + dy).max()) >= H:
                    continue
                if min(sx.min(), (rx + dx).min()) < 0 or max(sx.max(), (rx + dx).max()) >= W:
                    continue
                if not valid[sy, sx].all():
                    continue
                src_ring = im[ry + dy, rx + dx]
                tgt_ring = im[ry, rx]
                score = np.abs(src_ring.mean(0) - tgt_ring.mean(0)).sum() + \
                    np.abs(src_ring.std(0) - tgt_ring.std(0)).sum() * .5
                if best is None or score < best[0]:
                    best = (score, dy, dx)
        if best is None:
            raise RuntimeError(f"no clean source for region {i} at {sl}")
        _, dy, dx = best
        a = ndi.gaussian_filter(m.astype(np.float32), 3.0)
        a = np.clip(a * 1.8, 0, 1)[ys, xs][:, None]
        out[ys, xs] = out[ys, xs] * (1 - a) + im[ys + dy, xs + dx] * a
    return out


# ---------------------------------------------------------------- texture synthesis

def synthesize(src, valid, out_h, out_w, P=96, S=72, K=60, wrap=False, seed=0):
    """Patch-based texture synthesis (quilting with feathered, variance-preserving overlaps)."""
    r = np.random.default_rng(seed)
    bad = (~valid).astype(np.float32)
    ii = bad.cumsum(0).cumsum(1)
    ii = np.pad(ii, ((1, 0), (1, 0)))
    cnt = ii[P:, P:] - ii[:-P, P:] - ii[P:, :-P] + ii[:-P, :-P]
    cand = np.argwhere(cnt == 0)
    if len(cand) < 50:
        raise RuntimeError("not enough clean source patches")
    mu = src[valid].mean(0)

    O = P - S
    ramp = np.ones(P, np.float32)
    ramp[:O] = np.linspace(.08, 1, O)
    ramp[-O:] = np.linspace(1, .08, O)
    w = np.outer(ramp, ramp)[..., None]

    if wrap:
        ch, cw = out_h, out_w
    else:
        ch, cw = out_h + P, out_w + P
    num = np.zeros((ch, cw, 3), np.float32)
    den = np.zeros((ch, cw, 1), np.float32)

    def idx(y, x):
        yy = (np.arange(y, y + P) % ch) if wrap else np.arange(y, y + P)
        xx = (np.arange(x, x + P) % cw) if wrap else np.arange(x, x + P)
        return np.ix_(yy, xx)

    ny = (out_h // S) if wrap else (out_h // S + 1)
    nx = (out_w // S) if wrap else (out_w // S + 1)
    for gy in range(ny):
        for gx in range(nx):
            y, x = gy * S, gx * S
            ix = idx(y, x)
            d = den[ix]
            est = mu + num[ix] / np.sqrt(np.maximum(d, 1e-6))
            ov = (d > 1e-3)
            picks = cand[r.integers(0, len(cand), K)]
            patches = np.stack([src[py:py + P, px:px + P] for py, px in picks])
            if ov.any():
                diff = ((patches - est[None]) ** 2 * ov[None]).sum(axis=(1, 2, 3))
                order = np.argsort(diff)
                choice = order[r.integers(0, 3)]
            else:
                choice = 0
            p = patches[choice]
            num[ix] += w * (p - mu)
            den[ix] += w * w
    out = mu + num / np.sqrt(np.maximum(den, 1e-6))
    return np.clip(out[:out_h, :out_w], 0, 255)


def flatten(img, sigma=48):
    """Remove slow light fall-off so a tile has no visible blotches when repeated."""
    low = np.stack([ndi.gaussian_filter(img[..., c], sigma, mode="wrap") for c in range(3)], -1)
    return img - low + img.reshape(-1, 3).mean(0)


def despeckle(img, amount=22):
    """Soften isolated dark specks (they repeat conspicuously in a small tile)."""
    lum = img.mean(-1)
    med = ndi.median_filter(lum, 9, mode="wrap")
    spot = ndi.binary_dilation(lum < med - amount, disk(2))
    soft = np.stack([ndi.median_filter(img[..., c], 9, mode="wrap") for c in range(3)], -1)
    a = ndi.gaussian_filter(spot.astype(np.float32), 1.5)[..., None]
    return img * (1 - a) + soft * a


def seamless(tile):
    """Make a crop tile seamlessly by blending it with its half-offset copy."""
    h, w, _ = tile.shape
    rolled = np.roll(np.roll(tile, h // 2, 0), w // 2, 1)
    wy = np.sin(np.linspace(0, np.pi, h)) ** 2
    wx = np.sin(np.linspace(0, np.pi, w)) ** 2
    a = np.outer(wy, wx)[..., None]
    mu = tile.mean((0, 1))
    blend = mu + (a * (tile - mu) + (1 - a) * (rolled - mu)) / np.sqrt(a * a + (1 - a) ** 2)
    return np.clip(blend, 0, 255)


# ---------------------------------------------------------------- output helpers

def save_rgba(rgb, alpha, name, widths, quality=80):
    H, W, _ = rgb.shape
    img = Image.fromarray(np.dstack([rgb, alpha * 255]).astype(np.uint8), "RGBA")
    for w in widths:
        out = img if w == W else img.resize((w, round(H * w / W)), Image.LANCZOS)
        out.save(HERO / f"{name}-{w}.webp", "WEBP", quality=quality, method=6, alpha_quality=90)


def save_rgb(rgb, path, quality=80):
    Image.fromarray(rgb.astype(np.uint8)).save(path, "WEBP", quality=quality, method=6)


def main():
    im = load()
    H, W, _ = im.shape
    seg = segment(im)
    left, right, gap, text, fei = seg["left"], seg["right"], seg["gap"], seg["text"], seg["fei"]
    sheets = left | right

    # 1 · remove the printed text from the red sheets
    text_region = ndi.binary_fill_holes(ndi.binary_dilation(text, disk(9)))
    valid_red = sheets & (seg["dist_gap"] > 70) & ~ndi.binary_dilation(text, disk(30))
    clean = fill_regions(im, text_region, valid_red)

    # 2 · alpha for each sheet: include the white fibre rim just outside the red
    def sheet_alpha(m):
        a = ndi.binary_dilation(m, disk(4)).astype(np.float32)
        return np.clip(ndi.gaussian_filter(a, 1.4) * 1.15, 0, 1)
    aL, aR = sheet_alpha(left), sheet_alpha(right)

    # 3 · inner paper: keep the original where it is clean, synthesize the rest
    # stay clear of the shadow the red paper casts on the inner sheet (~35 px)
    core = gap & (ndi.distance_transform_edt(gap) > 38) & ~ndi.binary_dilation(fei, disk(16))
    # at rest the gap is the cover's own paper (shadows and all); the page cross-fades
    # to the clean section texture as soon as the sheets start to part
    synth = synthesize(im, core, H, W, P=96, S=72, K=60, seed=7)
    keep = gap & ~ndi.binary_dilation(fei, disk(16))
    keep = ndi.gaussian_filter(keep.astype(np.float32), 2.5)[..., None]
    base = synth * (1 - keep) + im * keep

    # 4 · seamless tiles for the rest of the site
    red_tile = synthesize(clean, valid_red, 640, 640, P=128, S=104, K=60, wrap=True, seed=5)
    red_tile = flatten(red_tile, 64)
    cream_tile = synthesize(im, core, 640, 640, P=96, S=80, K=60, wrap=True, seed=11)
    cream_tile = despeckle(flatten(cream_tile))
    save_rgb(red_tile, IMG / "paper-red.webp", 82)
    save_rgb(cream_tile, IMG / "paper-cream.webp", 82)

    # 5 · the hero layers, full size and a phone size
    widths = (W, 1100)
    save_rgba(clean, aL, "sheet-left", widths)
    save_rgba(clean, aR, "sheet-right", widths)
    for w in widths:
        img = Image.fromarray(base.astype(np.uint8))
        img = img if w == W else img.resize((w, round(H * w / W)), Image.LANCZOS)
        img.save(HERO / f"base-{w}.webp", "WEBP", quality=80, method=6)

    # 6 · a straight torn-edge strip for section dividers, from both torn edges
    A, B = 96, 64                                  # red depth / reach past the edge
    rows = np.arange(H)
    edgeL = np.array([np.max(np.where(aL[y] > .5)[0]) for y in rows], np.float32)
    edgeR = np.array([np.min(np.where(aR[y] > .5)[0]) for y in rows], np.float32)
    sL = ndi.gaussian_filter1d(edgeL, 70)
    sR = ndi.gaussian_filter1d(edgeR, 70)
    rgba = np.dstack([clean, np.maximum(aL, aR) * 255])
    stripL = np.stack([rgba[y, int(round(sL[y])) - A:int(round(sL[y])) + B] for y in rows])
    stripR = np.stack([rgba[y, int(round(sR[y])) - B + 1:int(round(sR[y])) + A + 1][::-1] for y in rows])
    stripL = stripL.transpose(1, 0, 2)             # depth x length, red on top
    stripR = stripR.transpose(1, 0, 2)
    trim = 40
    stripL, stripR = stripL[:, trim:-trim], stripR[:, trim:-trim]
    X = 90                                         # cross-fade between the two edges
    t = np.linspace(0, 1, X)[None, :, None]
    joint = stripL[:, -X:] * (1 - t) + stripR[:, :X] * t
    strip = np.concatenate([stripL[:, :-X], joint, stripR[:, X:]], axis=1)
    fade = np.clip(np.arange(A + B) / 26, 0, 1)[:, None]
    strip[..., 3] *= fade
    recess = max((sL - edgeL).max(), (edgeR - sR).max())
    Image.fromarray(strip.astype(np.uint8), "RGBA").save(HERO / "edge.webp", "WEBP", quality=82, method=6, alpha_quality=90)

    # 7 · geometry for main.js (normalised to the artwork)
    ys = np.where(text.any(1))[0]
    title = ys[(ys > H * .39) & (ys < H * .49)]
    ty = (title.min() + title.max()) / 2
    band = slice(int(title.min()), int(title.max()))
    core_text = ndi.binary_erosion(text, disk(3))
    ink = im[..., 0][core_text], im[..., 1][core_text], im[..., 2][core_text]
    fei_rgb = im[fei].mean(0)
    print("art", W, H)
    print("titleY", round(ty / H, 4), "glyphH", round((title.max() - title.min()) / H, 4))
    print("tear at title  L", round(edgeL[band].max() / W, 4), " R", round(edgeR[band].min() / W, 4))
    print("tear extremes  maxL", round(edgeL.max() / W, 4), " minR", round(edgeR.min() / W, 4))
    side = slice(int(.40 * H), int(.49 * H))
    print("title rows: side text must stay left of", round(edgeL[side].min() / W, 4),
          "and right of", round(edgeR[side].max() / W, 4))
    xs_text = np.where(text[band].any(0))[0]
    print("title glyph x-range", round(xs_text.min() / W, 4), round(xs_text.max() / W, 4))
    print("text colour", [round(float(c.mean())) for c in ink], " fei colour", fei_rgb.round().tolist())
    print("red mean", im[valid_red].mean(0).round().tolist(), " cream mean", im[core].mean(0).round().tolist())
    print("edge strip", strip.shape, "line at", A, "max recess", round(float(recess), 1))
    for p in sorted(HERO.iterdir()):
        print(f"{p.relative_to(ROOT)}  {p.stat().st_size // 1024} KB")


if __name__ == "__main__":
    main()
