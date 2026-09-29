/* 文革非十年 · Not Ten Years — interactions */
(() => {
  'use strict';

  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const smoothstep = (a, b, v) => { const t = clamp((v - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
  const easeInOut = t => (t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
  const easeOutCubic = t => 1 - Math.pow(1 - t, 3);

  // Seeded random numbers, so the drawings are the same on every visit.
  function mulberry32(seed) {
    return () => {
      seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function roundRect(g, x, y, w, h, r) {
    g.beginPath();
    g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r);
    g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath();
  }

  /* ------------------------------------------------------------
     Hero: the cover's own red paper, pulled apart.
     Artwork geometry, normalised (printed by tools/build_hero.py):
     gapL/gapR  the open tear at the title line (the middle word sits inside),
     sideL/sideR how far the torn edges reach over the title rows (side words stay outside),
     maxL/minR  the edges' extremes over the whole height.
     ------------------------------------------------------------ */
  const ART = { w: 1717, h: 2576, gapL: .4578, gapR: .636, sideL: .4356, sideR: .6552, maxL: .5125, minR: .5469 };
  ART.gapC = (ART.gapL + ART.gapR) / 2;

  function initHero() {
    const hero = document.querySelector('[data-hero]');
    if (!hero) return null;
    const stage = hero.querySelector('.hero__stage');
    const left = hero.querySelector('[data-sheet="left"]');
    const right = hero.querySelector('[data-sheet="right"]');
    const base = hero.querySelector('.hero__base');
    const title = hero.querySelector('.hero__title');
    const cue = hero.querySelector('.hero__cue');
    const ty = parseFloat(title.dataset.ty) || .44;
    const words = [...title.querySelectorAll('.hero__word')].map(el => ({
      el,
      side: el.dataset.side,
      anchor: el.dataset.anchor || 'center',
      x: parseFloat(el.dataset.x),
      fs: parseFloat(el.style.getPropertyValue('--fs'))
    }));

    let vw = 0, vh = 0, g = null;
    let closed = reduceMotion ? 0 : 1;   // 1: sheets pushed together, 0: as printed on the cover
    let p = 0;                            // scroll progress through the hero

    // Size every layer like `background-size: cover`, keeping the title line
    // mid-screen and, when the art is wider than the screen, the tear centred.
    function layout() {
      vw = stage.clientWidth; vh = stage.clientHeight;
      const s = Math.max(vw / ART.w, vh / ART.h);
      const rw = ART.w * s, rh = ART.h * s;
      const ox = clamp(vw / 2 - ART.gapC * rw, vw - rw, 0);
      const oy = clamp(vh / 2 - ty * rh, vh - rh, 0);
      const X = n => ox + n * rw;
      stage.style.setProperty('--art-size', `${rw.toFixed(1)}px ${rh.toFixed(1)}px`);
      stage.style.setProperty('--art-pos', `${ox.toFixed(1)}px ${oy.toFixed(1)}px`);
      stage.style.setProperty('--cue-x', `${X(ART.gapC).toFixed(1)}px`);
      g = {
        rw, rh, X, y: oy + ty * rh,
        gapL: X(ART.gapL), gapR: X(ART.gapR),
        sideL: X(ART.sideL), sideR: X(ART.sideR),
        outL: X(ART.maxL) + 60, outR: vw - X(ART.minR) + 60,
        close: (ART.gapR - ART.gapL) / 2 * rw + 4
      };
      placeTitle();
      apply();
    }

    // Set the title exactly where the cover prints it; on narrow screens, where the
    // outer letters would fall off-screen, shrink it to fit either side of the tear.
    function placeTitle() {
      const pad = Math.max(14, vw * .035);
      const room = Math.max(12, g.rw * .02);
      const size = k => words.forEach(w => { w.el.style.fontSize = `${(w.fs * g.rh * k).toFixed(2)}px`; });
      const measure = () => words.forEach(w => { w.w = w.el.offsetWidth; w.h = w.el.offsetHeight; });
      const at = (w, x) => (w.anchor === 'right' ? x - w.w : w.anchor === 'left' ? x : x - w.w / 2);
      const inside = (w, a, b) => w.left >= a && w.left + w.w <= b;
      const group = side => words.filter(w => w.side === side);

      size(1); measure();
      words.forEach(w => { w.left = at(w, g.X(w.x)); });
      const fits = words.every(w =>
        w.side === 'left' ? inside(w, pad, g.sideL - room)
          : w.side === 'right' ? inside(w, g.sideR + room, vw - pad)
            : inside(w, g.gapL, g.gapR));

      if (!fits) {
        const need = side => group(side).reduce((a, w) => a + w.w, 0) * (group(side).length > 1 ? 1.5 : 1);
        const k = Math.min(1,
          (g.sideL - room - pad) / need('left'),
          (vw - pad - g.sideR - room) / need('right'),
          (g.gapR - g.gapL - 12) / need('mid'));
        size(k); measure();
        spread(group('left'), pad, g.sideL - room);
        spread(group('right'), g.sideR + room, vw - pad);
        group('mid').forEach(w => { w.left = clamp(g.X(w.x) - w.w / 2, g.gapL, g.gapR - w.w); });
      }
      words.forEach(w => {
        w.el.style.left = `${w.left.toFixed(1)}px`;
        w.el.style.top = `${(g.y - w.h / 2).toFixed(1)}px`;
      });
    }

    function spread(list, a, b) {
      if (list.length === 1) {
        const w = list[0];
        w.left = w.anchor === 'right' ? b - w.w : w.anchor === 'left' ? a : (a + b - w.w) / 2;
        return;
      }
      const gap = (b - a - list.reduce((sum, w) => sum + w.w, 0)) / list.length;
      let x = a + gap / 2;
      list.forEach(w => { w.left = x; x += w.w + gap; });
    }

    function apply() {
      const e = easeInOut(p);
      const dxL = closed * g.close - e * g.outL;
      const dxR = -closed * g.close + e * g.outR;
      left.style.transform = `translate3d(${dxL.toFixed(1)}px,0,0)`;
      right.style.transform = `translate3d(${dxR.toFixed(1)}px,0,0)`;
      words.forEach(w => {
        if (w.side === 'left') w.el.style.transform = `translate3d(${dxL.toFixed(1)}px,0,0)`;
        else if (w.side === 'right') w.el.style.transform = `translate3d(${dxR.toFixed(1)}px,0,0)`;
        else {
          w.el.style.transform = `scale(${(1 + e * .3).toFixed(3)})`;
          w.el.style.opacity = String(1 - smoothstep(.45, .85, p));
        }
      });
      // the cover's own inner paper (with its shadows) gives way to the plain
      // section paper as soon as the sheets start to move
      base.style.opacity = String(1 - smoothstep(.02, .2, p));
      cue.style.opacity = String(1 - smoothstep(0, .06, p));
    }

    function progress() {
      return clamp(-hero.getBoundingClientRect().top / Math.max(hero.offsetHeight - vh, 1), 0, 1);
    }

    function onScroll() {
      if (reduceMotion) return;
      p = progress();
      apply();
    }

    function open() {
      hero.classList.add('is-ready');
      if (reduceMotion) { closed = 0; apply(); hero.classList.add('is-open'); return; }
      const start = performance.now() + 250, dur = 1700;
      let shown = false;
      const tick = now => {
        const t = clamp((now - start) / dur, 0, 1);
        closed = 1 - easeOutCubic(t);
        apply();
        if (!shown && t > .3) { shown = true; hero.classList.add('is-open'); }
        if (t < 1) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    }

    // wait for the artwork and the title font before tearing it open
    const art = [base, left, right].map(el => {
      const m = /url\(["']?(.*?)["']?\)/.exec(getComputedStyle(el).backgroundImage);
      if (!m) return Promise.resolve();
      const img = new Image();
      img.src = m[1];
      return img.decode ? img.decode().catch(() => {}) : new Promise(r => { img.onload = img.onerror = r; });
    });
    const fonts = document.fonts && document.fonts.ready ? document.fonts.ready : Promise.resolve();
    layout();
    Promise.race([Promise.all([...art, fonts]), new Promise(r => setTimeout(r, 3500))])
      .then(() => { layout(); open(); });

    return { resize: layout, scroll: onScroll, progress };
  }

  /* ------------------------------------------------------------
     Reveal on scroll
     ------------------------------------------------------------ */
  function initReveal() {
    const els = document.querySelectorAll('.reveal, .reveal-lines, [data-showcase]');
    if (!('IntersectionObserver' in window)) { els.forEach(el => el.classList.add('is-in')); return; }
    const io = new IntersectionObserver(entries => {
      entries.forEach(en => {
        if (en.isIntersecting) { en.target.classList.add('is-in'); io.unobserve(en.target); }
      });
    }, { rootMargin: '0px 0px -12% 0px', threshold: .08 });
    els.forEach(el => io.observe(el));
  }

  /* ------------------------------------------------------------
     Timeline: the ten years zoom out
     ------------------------------------------------------------ */
  function initTimeline() {
    const tl = document.querySelector('[data-timeline]');
    if (!tl) return null;
    const track = tl.querySelector('[data-track]');
    const decade = tl.querySelector('[data-decade]');
    const after = tl.querySelector('[data-after]');
    const origin = tl.querySelector('.tl-origin');
    const trace = tl.querySelector('.tl-trace');
    const caps = tl.querySelectorAll('.timeline__caption');
    const marks = [...tl.querySelectorAll('.tl-mark')].map(el => ({
      el, year: +el.dataset.year,
      label: el.querySelector('.tl-label'),
      fixed: el.classList.contains('tl-mark--fixed'),
      lw: 0
    }));
    const D0 = [1963.2, 1978.8], D1 = [1938, 1988];
    let W = 0;

    function measure() {
      W = track.clientWidth;
      marks.forEach(m => { m.lw = m.label.offsetWidth; });
    }

    function render(p) {
      const t = easeInOut(clamp((p - .16) / .52, 0, 1));
      const d0 = lerp(D0[0], D1[0], t), d1 = lerp(D0[1], D1[1], t);
      const X = y => (y - d0) / (d1 - d0) * W;

      marks.forEach(m => {
        const x = X(m.year);
        m.el.style.transform = `translate3d(${x.toFixed(1)}px,0,0)`;
        const lo = x - m.lw / 2;
        const shift = clamp(lo, 0, Math.max(0, W - m.lw)) - lo;
        m.label.style.transform = `translateX(calc(-50% + ${shift.toFixed(1)}px))`;
        if (!m.fixed) {
          const inside = clamp(Math.min(x, W - x) / (W * .05), 0, 1);
          m.el.style.opacity = String(inside * smoothstep(.02, .3, t));
        }
      });

      const x66 = X(1966), x76 = X(1976);
      decade.style.left = x66 + 'px';
      decade.style.width = (x76 - x66) + 'px';
      origin.style.left = X(1942) + 'px';
      origin.style.width = Math.max(0, x66 - X(1942)) + 'px';
      origin.style.opacity = String(smoothstep(.35, .9, t));
      trace.style.left = x76 + 'px';
      trace.style.opacity = String(smoothstep(.45, 1, t));
      after.style.opacity = String(smoothstep(.6, 1, t));

      const stage = p < .3 ? 0 : 1;
      caps.forEach((c, i) => c.classList.toggle('is-active', i === stage));
      tl.classList.toggle('is-not', p > .74);
    }

    function onScroll() {
      if (reduceMotion) return;
      const r = tl.getBoundingClientRect();
      const range = r.height - window.innerHeight;
      render(clamp(-r.top / Math.max(range, 1), 0, 1));
    }

    measure();
    if (reduceMotion) { render(1); caps.forEach(c => c.classList.add('is-active')); }
    else onScroll();

    return {
      resize() { measure(); reduceMotion ? render(1) : onScroll(); },
      scroll: onScroll
    };
  }

  /* ------------------------------------------------------------
     Book: tilt toward the pointer
     ------------------------------------------------------------ */
  function initTilt() {
    const box = document.querySelector('[data-tilt]');
    if (!box || reduceMotion || !window.matchMedia('(pointer: fine)').matches) return;
    const inner = box.querySelector('.book3d__inner');
    box.addEventListener('pointermove', e => {
      const r = box.getBoundingClientRect();
      const x = (e.clientX - r.left) / r.width - .5;
      const y = (e.clientY - r.top) / r.height - .5;
      inner.style.setProperty('--ry', `${-24 + x * 30}deg`);
      inner.style.setProperty('--rx', `${3 - y * 12}deg`);
    });
    box.addEventListener('pointerleave', () => {
      inner.style.removeProperty('--ry');
      inner.style.removeProperty('--rx');
    });
  }

  /* ------------------------------------------------------------
     Rotating places
     ------------------------------------------------------------ */
  function initRotator() {
    const r = document.querySelector('[data-rotator]');
    if (!r) return;
    const words = [...r.children];
    let i = 0, timer = null;
    words[0].classList.add('is-active');
    if (reduceMotion) return;
    const next = () => {
      const prev = words[i];
      prev.classList.remove('is-active');
      prev.classList.add('is-leaving');
      setTimeout(() => prev.classList.remove('is-leaving'), 750);
      i = (i + 1) % words.length;
      words[i].classList.add('is-active');
    };
    new IntersectionObserver(([en]) => {
      if (en.isIntersecting && !timer) timer = setInterval(next, 2100);
      if (!en.isIntersecting && timer) { clearInterval(timer); timer = null; }
    }).observe(r);
  }

  /* ------------------------------------------------------------
     Seven editions showcase
     ------------------------------------------------------------ */
  function initShowcase() {
    const sc = document.querySelector('[data-showcase]');
    if (!sc) return;
    const cover = sc.querySelector('.showcase__cover');
    const native = sc.querySelector('.showcase__native');
    const title = sc.querySelector('.showcase__title');
    const status = sc.querySelector('.showcase__status');
    const tabs = [...sc.querySelectorAll('[role="tab"]')];
    let idx = 0, auto = null, busy = false, stopped = reduceMotion;

    tabs.forEach((t, i) => t.setAttribute('tabindex', i === 0 ? '0' : '-1'));

    function select(i) {
      if (i === idx || busy) return;
      busy = true; idx = i;
      const t = tabs[i];
      tabs.forEach((b, j) => {
        b.setAttribute('aria-selected', String(j === i));
        b.setAttribute('tabindex', j === i ? '0' : '-1');
      });
      const img = new Image();
      img.src = t.dataset.cover;
      const ready = img.decode ? img.decode().catch(() => {}) : Promise.resolve();
      sc.classList.remove('is-landing');
      sc.classList.add('is-flipping');
      Promise.all([ready, new Promise(r => setTimeout(r, reduceMotion ? 0 : 320))]).then(() => {
        cover.src = t.dataset.cover;
        cover.alt = t.dataset.alt;
        native.textContent = t.dataset.native;
        title.textContent = t.dataset.title;
        title.lang = t.dataset.lang;
        status.textContent = t.dataset.status;
        sc.classList.add('is-landing');
        sc.classList.remove('is-flipping');
        busy = false;
      });
    }

    const stop = () => { stopped = true; clearInterval(auto); auto = null; };

    tabs.forEach((t, i) => {
      t.addEventListener('click', () => { stop(); select(i); });
      t.addEventListener('mouseenter', () => { const im = new Image(); im.src = t.dataset.cover; }, { once: true });
      t.addEventListener('keydown', e => {
        const k = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[e.key];
        if (!k) return;
        e.preventDefault(); stop();
        const n = (idx + k + tabs.length) % tabs.length;
        tabs[n].focus(); select(n);
      });
    });

    new IntersectionObserver(([en]) => {
      if (stopped) return;
      if (en.isIntersecting && !auto) auto = setInterval(() => select((idx + 1) % tabs.length), 3600);
      if (!en.isIntersecting && auto) { clearInterval(auto); auto = null; }
    }, { threshold: .4 }).observe(sc);
  }

  /* ------------------------------------------------------------
     Trailer: YouTube facade → iframe on click
     ------------------------------------------------------------ */
  function initTrailer() {
    const player = document.querySelector('[data-player]');
    if (!player) return;
    const section = player.closest('section') || document;
    const tabs = [...section.querySelectorAll('.tab[data-video]')];
    const ytLink = section.querySelector('[data-yt-link]');

    function thumb(img, id) {
      img.onerror = null;
      img.onload = () => { if (img.naturalWidth <= 120) { img.onload = null; img.src = `https://i.ytimg.com/vi/${id}/hqdefault.jpg`; } };
      img.onerror = () => {
        img.onerror = () => { img.style.visibility = 'hidden'; };
        img.src = `https://i.ytimg.com/vi/${id}/hqdefault.jpg`;
      };
      img.src = `https://i.ytimg.com/vi/${id}/maxresdefault.jpg`;
    }

    function facade(id) {
      player.innerHTML = '';
      const a = document.createElement('a');
      a.className = 'player__facade';
      a.href = `https://www.youtube.com/watch?v=${id}`;
      a.target = '_blank'; a.rel = 'noopener';
      const img = document.createElement('img');
      img.alt = '';
      thumb(img, id);
      const btn = document.createElement('span'); btn.className = 'player__btn'; btn.setAttribute('aria-hidden', 'true');
      const sr = document.createElement('span'); sr.className = 'visually-hidden'; sr.textContent = player.dataset.playLabel;
      a.append(img, btn, sr);
      a.addEventListener('click', e => { e.preventDefault(); play(id); });
      player.append(a);
      if (ytLink) ytLink.href = a.href;
    }

    function play(id) {
      const f = document.createElement('iframe');
      f.src = `https://www.youtube-nocookie.com/embed/${id}?autoplay=1&rel=0&playsinline=1`;
      f.title = player.dataset.frameTitle;
      f.allow = 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share';
      f.referrerPolicy = 'strict-origin-when-cross-origin';
      f.allowFullscreen = true;
      player.innerHTML = '';
      player.append(f);
    }

    const current = tabs.find(t => t.getAttribute('aria-selected') === 'true') || tabs[0];
    facade(current.dataset.video);

    tabs.forEach(t => t.addEventListener('click', () => {
      if (t.getAttribute('aria-selected') === 'true') return;
      tabs.forEach(b => b.setAttribute('aria-selected', String(b === t)));
      facade(t.dataset.video);
    }));
  }

  /* ------------------------------------------------------------
     Copy e-mail
     ------------------------------------------------------------ */
  function initCopy() {
    document.querySelectorAll('[data-copy]').forEach(btn => {
      const label = btn.textContent;
      btn.addEventListener('click', async () => {
        const text = btn.dataset.copy;
        try { await navigator.clipboard.writeText(text); }
        catch {
          const ta = Object.assign(document.createElement('textarea'), { value: text });
          ta.style.position = 'fixed'; ta.style.opacity = '0';
          document.body.append(ta); ta.select();
          try { document.execCommand('copy'); } catch { /* ignore */ }
          ta.remove();
        }
        btn.textContent = btn.dataset.done;
        btn.classList.add('is-done');
        setTimeout(() => { btn.textContent = label; btn.classList.remove('is-done'); }, 2000);
      });
    });
  }

  /* ------------------------------------------------------------
     Suggest the other language, once
     ------------------------------------------------------------ */
  function initLangToast() {
    const toast = document.querySelector('[data-lang-toast]');
    if (!toast) return;
    const KEY = 'nty-lang-toast';
    let seen = false;
    try { seen = localStorage.getItem(KEY) === '1'; } catch { /* storage blocked */ }
    if (seen) return;
    const langs = navigator.languages && navigator.languages.length ? navigator.languages : [navigator.language || ''];
    const prefersZh = langs.some(l => /^zh/i.test(l));
    const pageZh = /^zh/i.test(document.documentElement.lang);
    if (prefersZh === pageZh) return;
    toast.hidden = false;
    setTimeout(() => { if (!toast.matches(':hover')) toast.hidden = true; }, 14000);
    const remember = () => { try { localStorage.setItem(KEY, '1'); } catch { /* ignore */ } };
    toast.querySelector('button').addEventListener('click', () => { toast.hidden = true; remember(); });
    toast.querySelector('a').addEventListener('click', remember);
  }

  /* ------------------------------------------------------------
     What the book asks: a page of 人 on manuscript paper.
     u runs 0 → 4 through the pinned section:
       0–1 文化  the ruled page hardens and is stamped with a seal of power
       1–2 革命  the ruled lines break away; people drift out of their cells
       2–3 語言  labels fall on some of them and the crowd splits along a line
       3–4 選擇  the labels are re-issued again and again; one person stands
                 on the line with two ways to go
     ------------------------------------------------------------ */
  function initConcerns() {
    const root = document.querySelector('[data-concerns]');
    if (!root || reduceMotion) return null;
    const art = root.querySelector('.concerns__art');
    const canvas = art.querySelector('canvas');
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    const items = [...root.querySelectorAll('.concern')];
    const bars = [...root.querySelectorAll('.concerns__progress i')];
    const torn = root.querySelector('[data-tear]');
    const sealText = root.dataset.seal || '權力';
    root.classList.add('is-live');

    const INK = '#1b1613', RED = '#7d0305', RULE = '125, 3, 5';
    const SWITCH = [3.22, 3.5, 3.78];               // the rules change three times
    let W = 0, H = 0, dpr = 1, cell = 40;
    let people = [], segs = [], sets = [], member = [], hero = 0, sprite = null;
    let target = 0, u = 0, step = -1, running = false, visible = false, sized = false;
    const t0 = performance.now();

    function build() {
      const box = art.getBoundingClientRect();
      if (box.width < 40 || box.height < 40) return;
      W = box.width; H = box.height;
      dpr = Math.min(2, window.devicePixelRatio || 1);
      canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
      cell = clamp(Math.min(W, H) / 11, 26, 52);
      const cols = Math.max(6, Math.floor(W / cell - .5));
      const rows = Math.max(5, Math.floor(H / cell - .5));
      const x0 = (W - cols * cell) / 2, y0 = (H - rows * cell) / 2;
      const rand = mulberry32(1966);

      people = [];
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          people.push({
            hx: x0 + (c + .5) * cell, hy: y0 + (r + .5) * cell,
            wx: (rand() - .5) * cell * .95, wy: (rand() - .5) * cell * .95,
            tilt: (rand() - .5) * .8, ph: rand() * 6.28, sp: .5 + rand() * .9,
            drop: 2.04 + rand() * .3
          });
        }
      }
      // who carries a label under each successive set of rules
      member = [people.map(() => rand() < .36)];
      for (let k = 1; k < 4; k++) member.push(member[k - 1].map(v => (rand() < .3 ? !v : v)));
      const d = p => Math.hypot(p.hx - W / 2, p.hy - H / 2);
      hero = people.reduce((best, p, i) => (d(p) < d(people[best]) ? i : best), 0);
      [false, true, false, true].forEach((v, k) => { member[k][hero] = v; });
      sets = member.map(crowds);

      segs = [];
      const seg = (ax, ay, bx, by) => segs.push({ ax, ay, bx, by, at: 1.06 + rand() * .72, vx: (rand() - .5) * 1.6, vr: (rand() - .5) * 3 });
      for (let r = 0; r <= rows; r++) for (let c = 0; c < cols; c++) seg(x0 + c * cell, y0 + r * cell, x0 + (c + 1) * cell, y0 + r * cell);
      for (let c = 0; c <= cols; c++) for (let r = 0; r < rows; r++) seg(x0 + c * cell, y0 + r * cell, x0 + c * cell, y0 + (r + 1) * cell);
      sprite = sprites();
      sized = true;
    }

    // two crowds side by side: without a label on the left, with one on the right
    function crowds(labels) {
      const left = [], right = [];
      labels.forEach((l, i) => (l ? right : left).push(i));
      const aisle = cell * 2.6;                   // room on the line for the one who must choose
      const ay = clamp(H / W * 1.5, .9, 2.4);     // tall crowds on a portrait screen
      let gap = cell * .74, rl = 0, rr = 0;
      for (let k = 0; k < 14; k++) {
        rl = gap * Math.sqrt(left.length / (Math.PI * ay)) * 1.08;
        rr = gap * Math.sqrt(right.length / (Math.PI * ay)) * 1.08;
        if (2 * (rl + rr) + aisle + cell * .6 <= W && 2 * Math.max(rl, rr) * ay + cell <= H) break;
        gap *= .92;
      }
      const cl = (W - 2 * (rl + rr) - aisle) / 2 + rl;
      const cr = cl + rl + aisle + rr;
      const pos = new Array(people.length);
      const place = (list, cx, R) => {
        const dist = i => Math.hypot(people[i].hx - cx, people[i].hy - H / 2);
        list.slice().sort((a, b) => dist(a) - dist(b)).forEach((i, k) => {
          const rad = R * Math.sqrt((k + .5) / list.length), th = k * 2.39996;
          pos[i] = [cx + rad * Math.cos(th), H / 2 + rad * Math.sin(th) * ay];
        });
      };
      place(left, cl, rl); place(right, cr, rr);
      pos.line = cl + rl + aisle / 2;
      return pos;
    }

    function sprites() {
      const px = Math.round(cell * .6 * dpr);
      const glyph = (color, scale) => {
        const s = Math.ceil(px * scale * 1.3);
        const c = document.createElement('canvas'); c.width = c.height = s;
        const g = c.getContext('2d');
        g.fillStyle = color; g.textAlign = 'center'; g.textBaseline = 'middle';
        g.font = `600 ${Math.round(px * scale)}px "Noto Serif TC", "Songti TC", serif`;
        g.fillText('人', s / 2, s / 2 + px * scale * .04);
        return { c, size: s / dpr };
      };
      const tag = (() => {                       // a small paper label
        const w = Math.round(cell * .36 * dpr), h = Math.round(cell * .22 * dpr);
        const c = document.createElement('canvas'); c.width = w + 4; c.height = h + 4;
        const g = c.getContext('2d');
        const n = h * .5;
        g.fillStyle = RED;
        g.beginPath(); g.moveTo(2 + n, 2); g.lineTo(2 + w, 2); g.lineTo(2 + w, 2 + h); g.lineTo(2 + n, 2 + h); g.lineTo(2, 2 + h / 2); g.closePath(); g.fill();
        g.fillStyle = '#dbccba';
        g.beginPath(); g.arc(2 + n * .8, 2 + h / 2, Math.max(1, h * .12), 0, 6.3); g.fill();
        return { c, w: (w + 4) / dpr, h: (h + 4) / dpr };
      })();
      const seal = (() => {                      // a worn red seal
        const s = Math.round(cell * 2.3 * dpr);
        const c = document.createElement('canvas'); c.width = c.height = s;
        const g = c.getContext('2d');
        g.fillStyle = RED; roundRect(g, 0, 0, s, s, s * .06); g.fill();
        g.strokeStyle = 'rgba(242, 227, 200, .9)'; g.lineWidth = s * .03;
        roundRect(g, s * .09, s * .09, s * .82, s * .82, s * .04); g.stroke();
        g.fillStyle = '#f2e3c8'; g.textAlign = 'center'; g.textBaseline = 'middle';
        if (/^[\x00-\x7f]+$/.test(sealText)) {
          g.font = `600 ${Math.round(s * .21)}px "EB Garamond", serif`;
          g.fillText(sealText, s / 2, s / 2 + s * .01);
        } else {
          g.font = `900 ${Math.round(s * .33)}px "Noto Serif TC", serif`;
          [...sealText].forEach((ch, k, all) => g.fillText(ch, s / 2, s / 2 + (k - (all.length - 1) / 2) * s * .35));
        }
        g.globalCompositeOperation = 'destination-out';
        const r = mulberry32(7);
        for (let k = 0; k < 110; k++) {
          g.globalAlpha = r() * .55;
          g.beginPath(); g.arc(r() * s, r() * s, r() * s * .022, 0, 6.3); g.fill();
        }
        return { c, size: s / dpr };
      })();
      return { ink: glyph(INK, 1), red: glyph(RED, 2.2), tag, seal };
    }

    function drawTag(x, y, rot, a, fall) {
      const T = sprite.tag;
      ctx.globalAlpha = a;
      ctx.save(); ctx.translate(x, y - fall); ctx.rotate(rot * .5);
      ctx.strokeStyle = `rgba(${RULE}, .75)`; ctx.lineWidth = .8;
      ctx.beginPath(); ctx.moveTo(cell * .08, -cell * .12); ctx.lineTo(cell * .22, -cell * .3); ctx.stroke();
      ctx.drawImage(T.c, cell * .2, -cell * .3 - T.h / 2, T.w, T.h);
      ctx.restore();
    }

    function draw(t) {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, W, H);
      ctx.globalAlpha = 1;

      // the ruled page: its lines darken, then break loose and fall
      const firm = smoothstep(.25, .8, u), alpha = .2 + .45 * firm;
      ctx.lineWidth = 1 + firm * .5;
      ctx.strokeStyle = `rgba(${RULE}, ${alpha})`;
      ctx.beginPath();
      for (const s of segs) if (u < s.at) { ctx.moveTo(s.ax, s.ay); ctx.lineTo(s.bx, s.by); }
      ctx.stroke();
      for (const s of segs) {
        const f = u - s.at;
        if (f < 0 || f > .45) continue;
        ctx.save();
        ctx.translate((s.ax + s.bx) / 2 + s.vx * f * cell, (s.ay + s.by) / 2 + f * f * cell * 16);
        ctx.rotate(s.vr * f);
        ctx.strokeStyle = `rgba(${RULE}, ${alpha * (1 - f / .45)})`;
        ctx.beginPath(); ctx.moveTo((s.ax - s.bx) / 2, (s.ay - s.by) / 2); ctx.lineTo((s.bx - s.ax) / 2, (s.by - s.ay) / 2); ctx.stroke();
        ctx.restore();
      }

      // the seal of power
      const sealIn = smoothstep(.5, .64, u), sealOut = 1 - smoothstep(1.15, 1.5, u);
      if (sealIn * sealOut > 0) {
        const k = 1 + (1 - easeOutCubic(sealIn)) * .8, S = sprite.seal.size;
        ctx.save(); ctx.translate(W * .68, H * .34); ctx.rotate(-.13); ctx.scale(k, k);
        ctx.globalAlpha = .92 * sealIn * sealOut;
        ctx.drawImage(sprite.seal.c, -S / 2, -S / 2, S, S);
        ctx.restore();
      }

      // the dividing line, which moves every time the rules change
      const loose = smoothstep(1.1, 1.9, u), split = smoothstep(2.35, 2.9, u);
      const focus = smoothstep(3.02, 3.2, u), dim = smoothstep(3.55, 3.95, u);
      const q = SWITCH.map(sw => smoothstep(sw, sw + .12, u));
      let line = sets[0].line;
      for (let k = 1; k < 4; k++) line = lerp(line, sets[k].line, q[k - 1]);
      const reach = smoothstep(2.55, 2.9, u);
      if (reach > 0) {
        ctx.globalAlpha = 1;
        ctx.strokeStyle = `rgba(${RULE}, .85)`; ctx.lineWidth = 1.6;
        ctx.beginPath(); ctx.moveTo(line, H / 2 - H * .44 * reach); ctx.lineTo(line, H / 2 + H * .44 * reach); ctx.stroke();
      }

      // the people
      const ink = sprite.ink, S = ink.size;
      let hx = 0, hy = 0, htag = 0;
      for (let i = 0; i < people.length; i++) {
        const p = people[i];
        const j = loose * cell * .07;
        let x = p.hx + p.wx * loose + Math.sin(t * p.sp + p.ph) * j;
        let y = p.hy + p.wy * loose + Math.cos(t * p.sp * 1.3 + p.ph) * j;
        let rot = p.tilt * loose + Math.sin(t * .7 + p.ph) * .06 * loose;
        let tag = 0;
        if (u > p.drop) {
          tag = member[0][i] ? 1 : 0;
          for (let k = 1; k < 4; k++) tag = lerp(tag, member[k][i] ? 1 : 0, q[k - 1]);
        }
        if (split > 0) {
          let [tx, ty] = sets[0][i];
          for (let k = 1; k < 4; k++) { tx = lerp(tx, sets[k][i][0], q[k - 1]); ty = lerp(ty, sets[k][i][1], q[k - 1]); }
          x = lerp(x, tx + Math.sin(t * p.sp + p.ph) * j * .5, split);
          y = lerp(y, ty + Math.cos(t * p.sp + p.ph) * j * .5, split);
          rot *= 1 - split * .5;
        }
        if (i === hero) { hx = lerp(x, line, focus); hy = lerp(y, H / 2, focus); htag = tag; rot *= 1 - focus; }
        const drop = easeOutCubic(clamp((u - p.drop) / .14, 0, 1));
        const marked = tag * smoothstep(2.3, 2.6, u);
        if (i !== hero || focus < 1) {
          ctx.globalAlpha = (1 - marked * .55) * (i === hero ? 1 - focus : 1 - dim * .5);
          ctx.save(); ctx.translate(i === hero ? hx : x, i === hero ? hy : y); ctx.rotate(rot);
          ctx.drawImage(ink.c, -S / 2, -S / 2, S, S);
          ctx.restore();
        }
        if (tag > .01 && i !== hero) drawTag(x, y, rot, tag * drop * (1 - dim * .4), (1 - drop) * cell * 5);
      }

      // one person on the line, with two ways to go
      if (focus > 0) {
        const R = sprite.red, s = R.size * lerp(1 / 2.2, 1, focus);
        ctx.globalAlpha = focus;
        ctx.drawImage(R.c, hx - s / 2, hy - s / 2, s, s);
        if (htag > .01) drawTag(hx + cell * .25, hy - cell * .05, 0, htag, 0);
        const go = smoothstep(3.28, 3.5, u);
        if (go > 0) {
          ctx.globalAlpha = go * .9;
          ctx.strokeStyle = RED; ctx.fillStyle = RED; ctx.lineWidth = 1.4;
          for (const dir of [-1, 1]) {
            const x1 = hx, y1 = hy - cell * .95;
            const x2 = hx + dir * cell * lerp(.25, 1.05, go), y2 = hy - cell * lerp(1.2, 2.3, go);
            const cx = hx + dir * cell * .08, cy = hy - cell * 1.75;
            ctx.setLineDash([4, 5]);
            ctx.beginPath(); ctx.moveTo(x1, y1); ctx.quadraticCurveTo(cx, cy, x2, y2); ctx.stroke();
            ctx.setLineDash([]);
            const a = Math.atan2(y2 - cy, x2 - cx), h = cell * .18;
            ctx.beginPath(); ctx.moveTo(x2, y2);
            ctx.lineTo(x2 - h * Math.cos(a - .45), y2 - h * Math.sin(a - .45));
            ctx.lineTo(x2 - h * Math.cos(a + .45), y2 - h * Math.sin(a + .45));
            ctx.closePath(); ctx.fill();
          }
        }
      }
      ctx.globalAlpha = 1;

      const now = clamp(Math.floor(u + .08), 0, 3);
      if (now !== step) { step = now; items.forEach((el, k) => el.classList.toggle('is-active', k === now)); }
      bars.forEach((b, k) => b.style.setProperty('--fill', clamp(u - k, 0, 1).toFixed(3)));
      if (torn) torn.style.setProperty('--tear', smoothstep(1.2, 1.85, u).toFixed(3));
    }

    function tick(now) {
      running = false;
      if (!sized) build();
      if (!sized) return;
      const du = target - u;
      u = Math.abs(du) < .0005 ? target : u + du * .12;
      draw((now - t0) / 1000);
      // keep breathing while the crowd is loose; rest once the page is still
      if (visible && (u !== target || u > 1.08)) { running = true; requestAnimationFrame(tick); }
    }
    const kick = () => { if (!running) { running = true; requestAnimationFrame(tick); } };

    function onScroll() {
      const r = root.getBoundingClientRect();
      target = clamp((-r.top / Math.max(r.height - window.innerHeight, 1)) * 4.15 - .08, 0, 4);
      if (visible) kick();
    }

    new IntersectionObserver(([en]) => {
      visible = en.isIntersecting;
      if (visible) { onScroll(); kick(); }
    }).observe(root);
    if (document.fonts && document.fonts.load) {
      Promise.all([
        document.fonts.load('600 40px "Noto Serif TC"', '人權力'),
        document.fonts.load('600 40px "EB Garamond"', 'POWER')
      ]).catch(() => {}).then(() => { sized = false; kick(); });
    }
    return { scroll: onScroll, resize() { sized = false; onScroll(); kick(); } };
  }

  /* ------------------------------------------------------------
     Lecture series: a YouTube playlist, one lecture at a time
     (set data-playlist on the section; data-video on a lecture pins it
     to an exact video, otherwise the playlist position is used)
     ------------------------------------------------------------ */
  function initLectures() {
    const root = document.querySelector('[data-lectures]');
    if (!root) return;
    const list = (root.dataset.playlist || '').trim();
    const player = root.querySelector('[data-lecture-player]');
    const poster = root.querySelector('[data-lecture-play]');
    const no = root.querySelector('[data-lecture-no]');
    const label = root.querySelector('[data-lecture-label]');
    const buttons = [...root.querySelectorAll('[data-lecture]')];
    const link = root.querySelector('[data-playlist-link]');
    let current = 0;
    root.classList.toggle('is-pending', !list);
    poster.disabled = !list;
    if (list) link.href = `https://www.youtube.com/playlist?list=${encodeURIComponent(list)}`;
    else link.closest('p').hidden = true;

    function play(i) {
      if (!list) return;
      const id = (buttons[i].dataset.video || '').trim();
      const q = `list=${encodeURIComponent(list)}&autoplay=1&rel=0&playsinline=1`;
      const src = id
        ? `https://www.youtube-nocookie.com/embed/${encodeURIComponent(id)}?${q}`
        : `https://www.youtube-nocookie.com/embed/videoseries?${q}&index=${i}`;
      let f = player.querySelector('iframe');
      if (!f) {
        f = document.createElement('iframe');
        f.title = player.dataset.frameTitle;
        f.allow = 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share';
        f.referrerPolicy = 'strict-origin-when-cross-origin';
        f.allowFullscreen = true;
        player.append(f);
        poster.hidden = true;
      }
      f.src = src;
    }

    function select(i) {
      current = i;
      buttons.forEach((b, k) => (k === i ? b.setAttribute('aria-current', 'true') : b.removeAttribute('aria-current')));
      no.textContent = String(i + 1).padStart(2, '0');
      label.textContent = buttons[i].dataset.label;
      play(i);
    }

    poster.addEventListener('click', () => play(current));
    buttons.forEach((b, i) => b.addEventListener('click', () => select(i)));
  }

  /* ------------------------------------------------------------
     Animated series: thirty frames on film; released episodes
     (data-video) show their thumbnail and play in a lightbox
     ------------------------------------------------------------ */
  function openVideo(id, title, closeLabel) {
    let modal = document.querySelector('.video-modal');
    if (!modal) {
      modal = document.createElement('div');
      modal.className = 'video-modal';
      modal.hidden = true;
      modal.setAttribute('role', 'dialog');
      modal.setAttribute('aria-modal', 'true');
      modal.innerHTML = '<div class="video-modal__box"><button type="button" class="video-modal__close"></button></div>';
      document.body.append(modal);
      const close = () => { modal.hidden = true; const f = modal.querySelector('iframe'); if (f) f.remove(); };
      modal.addEventListener('click', e => { if (e.target === modal) close(); });
      modal.querySelector('.video-modal__close').addEventListener('click', close);
      document.addEventListener('keydown', e => { if (e.key === 'Escape' && !modal.hidden) close(); });
    }
    const btn = modal.querySelector('.video-modal__close');
    btn.textContent = closeLabel || '×';
    const f = document.createElement('iframe');
    f.src = `https://www.youtube-nocookie.com/embed/${encodeURIComponent(id)}?autoplay=1&rel=0&playsinline=1`;
    f.title = title;
    f.allow = 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share';
    f.referrerPolicy = 'strict-origin-when-cross-origin';
    f.allowFullscreen = true;
    modal.setAttribute('aria-label', title);
    modal.querySelector('.video-modal__box').append(f);
    modal.hidden = false;
    btn.focus();
  }

  function initReel() {
    const root = document.querySelector('[data-animation]');
    if (!root) return null;
    const rows = [...root.querySelectorAll('.reel__row')];
    const released = [...root.querySelectorAll('.reel__frame')].filter(f => (f.dataset.video || '').trim());
    const count = root.querySelector('[data-reel-count]');
    if (count) count.textContent = String(released.length);
    released.forEach(f => {
      const id = f.dataset.video.trim();
      const title = f.querySelector('.reel__ch').textContent;
      f.classList.add('is-out');
      f.style.backgroundImage = `url("https://i.ytimg.com/vi/${encodeURIComponent(id)}/hqdefault.jpg")`;
      f.tabIndex = 0;
      f.setAttribute('role', 'button');
      const open = () => openVideo(id, title, root.dataset.close);
      f.addEventListener('click', open);
      f.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); } });
    });
    const wide = window.matchMedia('(min-width: 861px)');
    function onScroll() {
      if (reduceMotion || !wide.matches) return;
      const r = root.getBoundingClientRect();
      const p = clamp((window.innerHeight - r.top) / (window.innerHeight + r.height), 0, 1);
      rows.forEach((row, k) => row.style.setProperty('--shift', `${((p - .5) * 110 * (k % 2 ? -1 : 1)).toFixed(1)}px`));
    }
    return { scroll: onScroll };
  }

  /* ------------------------------------------------------------
     Menu on narrow screens
     ------------------------------------------------------------ */
  function initMenu() {
    const btn = document.querySelector('[data-menu]');
    if (!btn) return;
    const nav = document.getElementById(btn.getAttribute('aria-controls'));
    const set = open => {
      document.body.classList.toggle('menu-open', open);
      btn.setAttribute('aria-expanded', String(open));
    };
    btn.addEventListener('click', () => set(!document.body.classList.contains('menu-open')));
    nav.addEventListener('click', e => { if (e.target.closest('a')) set(false); });
    document.addEventListener('keydown', e => { if (e.key === 'Escape') set(false); });
    const wide = window.matchMedia('(min-width: 961px)');
    const onWide = e => { if (e.matches) set(false); };
    if (wide.addEventListener) wide.addEventListener('change', onWide); else wide.addListener(onWide);
  }

  /* ------------------------------------------------------------
     Scroll / resize loop
     ------------------------------------------------------------ */
  const header = document.querySelector('[data-header]');
  const bar = document.querySelector('.progress');
  const hero = initHero();
  initReveal();
  const timeline = initTimeline();
  const concerns = initConcerns();
  const reel = initReel();
  initLectures();
  initMenu();
  initTilt();
  initRotator();
  initShowcase();
  initTrailer();
  initCopy();
  initLangToast();

  let ticking = false;
  function frame() {
    ticking = false;
    if (hero) hero.scroll();
    if (timeline) timeline.scroll();
    if (concerns) concerns.scroll();
    if (reel) reel.scroll();
    const heroP = hero ? hero.progress() : 1;
    header.classList.toggle('is-solid', heroP > .5);
    const max = document.documentElement.scrollHeight - window.innerHeight;
    bar.style.transform = `scaleX(${max > 0 ? window.scrollY / max : 0})`;
  }
  const request = () => { if (!ticking) { ticking = true; requestAnimationFrame(frame); } };
  window.addEventListener('scroll', request, { passive: true });

  window.addEventListener('resize', () => {
    if (hero) hero.resize();
    if (timeline) timeline.resize();
    if (concerns) concerns.resize();
    request();
  });
  frame();
})();
