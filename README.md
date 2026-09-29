# 文革非十年 · Not Ten Years: The Cultural Revolution

Official site for the book by 北靜 (Bei.Jing) — https://culturalrevolution.2084studio.com

A static site with no build step: plain HTML, CSS and JavaScript, served by GitHub Pages.

## Structure

```
index.html              繁體中文 (default)
en/index.html           English
404.html
assets/css/style.css    all styles
assets/js/main.js       all interactions (torn hero, timeline, showcase, trailer…)
assets/covers/          web covers (480 / 1000 px WebP) for 7 languages
assets/covers/original/ original cover files as supplied
assets/hero/            hero layers cut from the cover: red sheets, inner paper, torn-edge strip
assets/img/             paper textures (from the cover), share image, icons
tools/build_hero.py     cuts assets/hero + the paper textures out of the Chinese cover
tools/build_assets.py   regenerates web covers, share image and icons
CNAME                   custom domain for GitHub Pages
```

## Editing

- **Text**: edit `index.html` (Chinese) and `en/index.html` (English). The two pages share the same structure.
- **Trailers**: YouTube IDs live in the `data-video` attributes in the Trailer section of each page
  (中文 `SN9qZIcayBk`, English `TMs_cJ2ucQ0`).
- **Covers**: replace a file in `assets/covers/original/` (keep the `cover-<lang>` name), then run
  `pip install pillow numpy scipy && python3 tools/build_assets.py`. If the cover art itself changes,
  also run `python3 tools/build_hero.py` and copy the geometry it prints into `ART` in `assets/js/main.js`.
- **Author page**: links to https://beijing.2084studio.com/ (hero author name and the contact section).
- **Lecture series (28 講)**: put the YouTube playlist ID (the `list=` value of the playlist URL) in
  `data-playlist` on `<section id="lectures">`, and the lecture titles in the `lectures__title` spans.
  A `data-video` on a lecture button plays that exact video instead of the playlist position.
- **Animated series (30 集)**: to release an episode, put its YouTube video ID in `data-video` on that
  episode's `reel__frame`; its thumbnail appears, it opens in a lightbox, and the released count updates.
- **Edition status** (即將出版 / 陸續推出 / Coming soon / Forthcoming): the `data-status` attribute on each
  button in the Editions section.

## Preview locally

```
python3 -m http.server 8000
```

Then open http://localhost:8000 (Chinese) and http://localhost:8000/en/ (English).

## Deploy (GitHub Pages)

1. Repository **Settings → Pages → Build and deployment**: Source = *Deploy from a branch*,
   Branch = `main`, folder `/ (root)`.
2. Custom domain: `culturalrevolution.2084studio.com` (already set in `CNAME`), then tick **Enforce HTTPS**
   once the certificate is issued.
3. DNS at the registrar for `2084studio.com`: add a `CNAME` record
   `culturalrevolution` → `2084studio.github.io`.
