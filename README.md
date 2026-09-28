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
assets/img/             paper textures, share image, icons
tools/build_assets.py   regenerates everything in assets/covers + assets/img
CNAME                   custom domain for GitHub Pages
```

## Editing

- **Text**: edit `index.html` (Chinese) and `en/index.html` (English). The two pages share the same structure.
- **Trailers**: YouTube IDs live in the `data-video` attributes in the Trailer section of each page
  (中文 `SN9qZIcayBk`, English `TMs_cJ2ucQ0`).
- **Covers**: replace a file in `assets/covers/original/` (keep the `cover-<lang>` name), then run
  `pip install pillow numpy && python3 tools/build_assets.py`.
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
