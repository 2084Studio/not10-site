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
     Timeline. The camera starts on the familiar ten years, pulls
     back to show what came before 1966, then pans on past 1976 to
     today and beyond. Labels are given rows so that none overlap.
     ------------------------------------------------------------ */
  function initTimeline() {
    const tl = document.querySelector('[data-timeline]');
    if (!tl) return null;
    const track = tl.querySelector('[data-track]');
    const decade = tl.querySelector('[data-decade]');
    const decadeLabel = decade.querySelector('.tl-decade__label');
    const origin = tl.querySelector('.tl-origin');
    const trace = tl.querySelector('.tl-trace');
    const future = tl.querySelector('.tl-future');
    const caps = [...tl.querySelectorAll('.timeline__caption')];

    const NOW = new Date().getFullYear();
    tl.querySelectorAll('[data-now]').forEach(el => { el.dataset.year = NOW; });
    tl.querySelectorAll('[data-now-year]').forEach(el => { el.textContent = NOW; });
    tl.querySelectorAll('[data-note]').forEach(el => { el.dataset.year = (1976 + NOW) / 2; });
    tl.querySelectorAll('[data-q]').forEach(el => { el.dataset.year = NOW + 7; });

    const marks = [...tl.querySelectorAll('.tl-mark')].map(el => ({
      el,
      from: +el.dataset.year, to: +(el.dataset.to || el.dataset.year),
      label: el.querySelector('.tl-label'),
      span: el.querySelector('.tl-span'),
      kind: el.classList.contains('tl-pre') ? 'pre' : el.classList.contains('tl-post') ? 'post' : 'fixed',
      q: el.hasAttribute('data-q'),
      lw: 0
    }));
    const mid = m => (m.from + m.to) / 2;

    // [scroll progress, first year, last year] — eased between
    const LONG = [1939, 1979.5];
    const KEYS = [[0, 1963.5, 1978.5], [.12, 1963.5, 1978.5], [.42, ...LONG], [.55, ...LONG], [.82, 1968, NOW + 10], [1, 1968, NOW + 10]];
    function view(p) {
      for (let i = 1; i < KEYS.length; i++) {
        const [p0, a0, b0] = KEYS[i - 1], [p1, a1, b1] = KEYS[i];
        if (p <= p1) {
          const t = easeInOut(clamp((p - p0) / (p1 - p0), 0, 1));
          return [lerp(a0, a1, t), lerp(b0, b1, t)];
        }
      }
      return KEYS[KEYS.length - 1].slice(1);
    }

    let W = 0, gutter = 0;

    function measure() {
      W = track.clientWidth;
      gutter = track.getBoundingClientRect().left;
      marks.forEach(m => { m.lw = m.label ? m.label.offsetWidth : 0; });
      assignRows();
    }

    // rows are worked out for the long view, where every earlier campaign is on screen
    function assignRows() {
      const X = y => (y - LONG[0]) / (LONG[1] - LONG[0]) * W;
      const rows = { a1: [], b1: [], a2: [], b2: [], a3: [], b3: [], a4: [], b4: [] };
      const pad = 12;
      const overlap = (row, lo, hi) => rows[row].reduce((sum, [l, h]) => sum + Math.max(0, Math.min(hi + pad, h + pad) - Math.max(lo, l)), 0);
      const dw = decadeLabel.offsetWidth;
      const dl = Math.min((X(1966) + X(1976)) / 2 - dw / 2, W - dw);
      rows.a1.push([dl, dl + dw]);
      marks.filter(m => m.kind === 'fixed').forEach(m => rows.b1.push([X(m.from) - m.lw / 2, X(m.from) + m.lw / 2]));
      marks.filter(m => m.kind === 'pre').sort((m, n) => mid(m) - mid(n)).forEach(m => {
        let lo = X(mid(m)) - m.lw / 2;
        lo = clamp(lo, 0, Math.max(0, W - m.lw));
        const hi = lo + m.lw;
        const names = Object.keys(rows);
        const row = names.find(r => overlap(r, lo, hi) === 0) ||
          names.reduce((best, r) => (overlap(r, lo, hi) < overlap(best, lo, hi) ? r : best), names[0]);
        rows[row].push([lo, hi]);
        m.el.dataset.lane = row;
      });
    }

    function render(p) {
      const [d0, d1] = view(p);
      const X = y => (y - d0) / (d1 - d0) * W;
      const pre = smoothstep(.12, .3, p) * (1 - smoothstep(.56, .64, p)), post = smoothstep(.6, .78, p);

      marks.forEach(m => {
        const x = X(mid(m));
        m.el.style.transform = `translate3d(${x.toFixed(1)}px,0,0)`;
        if (m.span) m.span.style.width = `${Math.max(2, X(m.to) - X(m.from)).toFixed(1)}px`;
        if (m.label && !m.q) {
          const lo = x - m.lw / 2;
          const shift = clamp(lo, -gutter * .5, Math.max(0, W - m.lw)) - lo;
          m.label.style.transform = `translateX(calc(-50% + ${shift.toFixed(1)}px))`;
        }
        const edge = clamp(Math.min(x + gutter * .6, W + gutter * .6 - x) / (W * .06), 0, 1);
        const show = m.kind === 'pre' ? pre : m.kind === 'post' ? post : 1;
        m.el.style.opacity = String(edge * show);
      });

      const x66 = X(1966), x76 = X(1976), xNow = X(NOW);
      decade.style.left = `${x66}px`;
      decade.style.width = `${x76 - x66}px`;
      // the decade's own label stays on screen at the right, and fades out at the left
      const dw = decadeLabel.offsetWidth, dlo = (x66 + x76) / 2 - dw / 2;
      const dshift = Math.min(0, W + gutter * .4 - dw - dlo);
      decadeLabel.style.transform = `translateX(calc(-50% + ${dshift.toFixed(1)}px))`;
      decadeLabel.style.opacity = String(clamp((dlo + dshift + gutter) / 40, 0, 1));
      origin.style.left = `${X(1942)}px`;
      origin.style.width = `${Math.max(0, x66 - X(1942))}px`;
      origin.style.opacity = String(smoothstep(.28, .42, p));
      trace.style.left = `${x76}px`;
      trace.style.width = `${Math.max(0, xNow - x76)}px`;
      trace.style.opacity = String(smoothstep(.56, .7, p));
      future.style.left = `${xNow}px`;
      future.style.opacity = String(smoothstep(.68, .84, p));

      const stage = p < .12 ? 0 : p < .57 ? 1 : 2;
      caps.forEach((c, i) => c.classList.toggle('is-active', i === stage));
      tl.classList.toggle('is-not', p > .4);
    }

    function onScroll() {
      if (reduceMotion) return;
      const r = tl.getBoundingClientRect();
      render(clamp(-r.top / Math.max(r.height - window.innerHeight, 1), 0, 1));
    }

    const redraw = () => (reduceMotion ? render(.5) : onScroll());
    measure();
    redraw();
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => { measure(); redraw(); });

    return {
      resize() { measure(); redraw(); },
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
     What the book asks: the author's sentence is written onto
     manuscript paper as the reader scrolls. Chinese goes one
     character to a square (稿紙); English onto ruled paper. The
     familiar questions stay grey, 不只是 is red, and the questions
     the book adds are underlined in red pen once they are written.
     ------------------------------------------------------------ */
  function initManuscript() {
    const root = document.querySelector('[data-manuscript]');
    if (!root) return null;
    const text = root.querySelector('.manuscript__text');
    const cjk = /^(zh|ja)/i.test(text.closest('[lang]').lang);
    const SVGNS = 'http://www.w3.org/2000/svg';
    const HANG = /^[，、。；：！？」』）》〉]$/;

    // screen readers get the sentence whole
    const plain = document.createElement('p');
    plain.className = 'visually-hidden';
    plain.textContent = text.textContent;
    text.before(plain);
    text.setAttribute('aria-hidden', 'true');

    // one span per character (Chinese) or per word (English), keeping the marks
    const units = [];
    let group = 0;
    const frag = document.createDocumentFragment();
    [...text.childNodes].forEach(node => {
      const mark = node.nodeType === 1 ? node.dataset.mark || '' : '';
      const gid = mark === 'line' ? ++group : 0;
      const parts = cjk ? [...node.textContent] : node.textContent.split(/(\s+)/);
      parts.forEach(part => {
        if (!part) return;
        if (!cjk && /^\s+$/.test(part)) { frag.append(' '); return; }
        const el = document.createElement('span');
        el.className = 'u';
        el.textContent = part;
        if (mark) el.dataset.m = mark;
        frag.append(el);
        units.push({ el, gid, hang: cjk && HANG.test(part), r: 0, ink: -1 });
      });
    });
    text.replaceChildren(frag);
    text.classList.add('is-set');
    root.classList.add(cjk ? 'is-grid' : 'is-ruled');

    const svg = document.createElementNS(SVGNS, 'svg');
    svg.setAttribute('class', 'manuscript__lines');
    text.append(svg);

    let rows = 1, pens = [], visible = false;

    function path(cls, d) {
      const p = document.createElementNS(SVGNS, 'path');
      p.setAttribute('class', cls);
      p.setAttribute('d', d);
      svg.append(p);
      return p;
    }

    function layout() {
      if (cjk) {
        const avail = root.clientWidth - parseFloat(getComputedStyle(root).paddingLeft) * 2;
        const cols = clamp(Math.floor(avail / 33), 8, 20);
        const cell = Math.min(62, Math.floor(avail / cols));
        text.style.setProperty('--cols', cols);
        text.style.setProperty('--cell', `${cell}px`);
        // a closing mark never starts a row: it hangs off the end of the one before
        units.forEach(u => u.el.classList.remove('is-hang'));
        for (let pass = 0; pass < 4; pass++) {
          const i = units.findIndex((u, k) => k > 0 && u.hang && !u.el.classList.contains('is-hang') &&
            u.el.offsetTop > units[k - 1].el.offsetTop);
          if (i < 0) break;
          units[i].el.classList.add('is-hang');
        }
      }

      const W = text.clientWidth, H = text.clientHeight;
      const tops = [...new Set(units.map(u => u.el.offsetTop))].sort((a, b) => a - b);
      rows = tops.length;
      const box = units.map(u => ({ x: u.el.offsetLeft, w: u.el.offsetWidth, y: u.el.offsetTop, h: u.el.offsetHeight }));
      units.forEach((u, i) => {
        u.row = tops.indexOf(box[i].y);
        u.r = u.row + (box[i].x + box[i].w / 2) / Math.max(W, 1);
      });

      svg.replaceChildren();
      svg.setAttribute('width', W);
      svg.setAttribute('height', H);
      svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
      const cell = cjk ? parseFloat(text.style.getPropertyValue('--cell')) : 0;
      const pitch = cjk ? cell * 1.25 : (H / Math.max(rows, 1));
      let d = '';
      if (cjk) {
        const cols = +text.style.getPropertyValue('--cols');
        const w = cols * cell, n = Math.max(rows, Math.round(H / pitch));
        for (let k = 0; k < n; k++) {
          const y0 = Math.round(k * pitch) + .5, y1 = Math.round(k * pitch + cell) + .5;
          d += `M0 ${y0}H${w}M0 ${y1}H${w}`;
          for (let j = 0; j <= cols; j++) { const x = Math.round(j * cell) + .5; d += `M${x} ${y0}V${y1}`; }
        }
        path('grid', d);
      } else {
        const lh = parseFloat(getComputedStyle(text).lineHeight) || pitch;
        for (let k = 0; k < rows; k++) { const y = Math.round(tops[k] + lh * .86) + .5; d += `M0 ${y}H${W}`; }
        path('rule', d);
      }

      // red-pen underlines, one stroke per row of each marked phrase
      const rand = mulberry32(1976);
      pens = [];
      for (let g = 1; g <= group; g++) {
        const mine = units.map((u, i) => [u, box[i]]).filter(([u]) => u.gid === g);
        const byRow = new Map();
        mine.forEach(([u, b]) => { if (!byRow.has(u.row)) byRow.set(u.row, []); byRow.get(u.row).push([u, b]); });
        byRow.forEach(list => {
          const x0 = Math.min(...list.map(([, b]) => b.x)) + (cjk ? cell * .06 : 0);
          const x1 = Math.max(...list.map(([, b]) => b.x + b.w)) - (cjk ? cell * .06 : 2);
          const y = cjk ? list[0][1].y + cell * 1.1 : list[0][1].y + list[0][1].h * .94;
          const wob = () => (rand() - .5) * (cjk ? cell * .08 : 4);
          const p = path('pen', `M${(x0 - 3).toFixed(1)} ${(y + wob()).toFixed(1)}Q${((x0 + x1) / 2).toFixed(1)} ${(y + wob() * 1.6).toFixed(1)} ${x1.toFixed(1)} ${(y + wob()).toFixed(1)}`);
          p.setAttribute('pathLength', '1');
          pens.push({ el: p, from: list[list.length - 1][0].r, done: -1 });
        });
      }
      units.forEach(u => { u.ink = -1; });
      update();
    }

    // the writing front moves one row for every ~1.5 rows of scrolling
    function update() {
      if (!visible && !reduceMotion) return;
      const rect = text.getBoundingClientRect();
      const rowPx = rect.height / Math.max(rows, 1);
      const F = reduceMotion ? rows + 3 : (window.innerHeight * .84 - rect.top) / (rowPx * 1.5);
      const soft = cjk ? .22 : .16;
      units.forEach(u => {
        const ink = Math.round(clamp((F - u.r) / soft, 0, 1) * 50) / 50;
        if (ink !== u.ink) { u.ink = ink; u.el.style.setProperty('--ink', ink); }
      });
      pens.forEach(p => {
        const k = Math.round(clamp((F - p.from - .08) / .3, 0, 1) * 100) / 100;
        if (k !== p.done) { p.done = k; p.el.style.strokeDashoffset = String(1 - k); }
      });
    }

    new IntersectionObserver(([en]) => { visible = en.isIntersecting; update(); }, { rootMargin: '20% 0px' }).observe(root);
    layout();
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(layout);
    return { scroll: update, resize: layout };
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
    const cover = root.querySelector('[data-lecture-cover]');
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
      cover.src = buttons[i].dataset.cover;
      label.textContent = buttons[i].dataset.label;
      play(i);
    }

    poster.addEventListener('click', () => play(current));
    buttons.forEach((b, i) => b.addEventListener('click', () => select(i)));
  }

  /* ------------------------------------------------------------
     Animated series: a player and an index of thirty episodes,
     each in a Chinese and an English version
     ------------------------------------------------------------ */


  function initEpisodes() {
    const root = document.querySelector('[data-episodes]');
    if (!root) return;
    const T = {
      zh: { series: '北靜 · 文革非十年 動畫', sample: '樣片', soon: '即將推出' },
      en: { series: 'Bei.Jing · Not Ten Years — animated', sample: 'Preview', soon: 'Coming soon' }
    };
    const player = root.querySelector('[data-ep-player]');
    const poster = root.querySelector('[data-ep-play]');
    const big = root.querySelector('[data-ep-big]');
    const title = root.querySelector('[data-ep-title]');
    const tag = root.querySelector('[data-ep-tag]');
    const series = root.querySelector('.ep-poster__series');
    const tabs = [...root.querySelectorAll('[data-ep-lang]')];
    const items = [...root.querySelectorAll('[data-ep]')];
    let lang = root.dataset.lang || 'zh', current = 0;

    // each episode: a YouTube ID per language (data-zh / data-en); data-sample-zh / -en marks a short preview
    const id = b => (b.dataset[lang] || '').trim();
    const sample = b => b.hasAttribute(`data-sample-${lang}`);
    const lit = b => !!id(b) || sample(b);

    function stop() {
      const f = player.querySelector('iframe');
      if (f) f.remove();
      poster.hidden = false;
    }

    function show(i) {
      current = i;
      const b = items[i];
      items.forEach((x, k) => (k === i ? x.setAttribute('aria-current', 'true') : x.removeAttribute('aria-current')));
      stop();
      big.textContent = String(i + 1).padStart(2, '0');
      title.textContent = `${b.dataset[`${lang}No`]} · ${b.dataset[`${lang}Title`]}`;
      tag.textContent = sample(b) ? T[lang].sample : id(b) ? '' : T[lang].soon;
      tag.hidden = !tag.textContent;
      player.classList.toggle('is-lit', lit(b));
      player.classList.toggle('is-playable', !!id(b));
      poster.disabled = !id(b);
    }

    function render() {
      series.textContent = T[lang].series;
      items.forEach(b => {
        b.querySelector('.ep__no').textContent = b.dataset[`${lang}No`];
        b.querySelector('.ep__title').textContent = b.dataset[`${lang}Title`];
        const t = b.querySelector('.ep__tag');
        t.textContent = sample(b) ? T[lang].sample : '';
        b.classList.toggle('is-lit', lit(b));
        b.lang = lang === 'zh' ? 'zh-Hant' : 'en';
      });
      tabs.forEach(t => t.setAttribute('aria-selected', String(t.dataset.epLang === lang)));
      const first = items.findIndex(lit);
      show(first < 0 ? 0 : first);
    }

    poster.addEventListener('click', () => {
      const v = id(items[current]);
      if (!v) return;
      const f = document.createElement('iframe');
      f.src = `https://www.youtube-nocookie.com/embed/${encodeURIComponent(v)}?autoplay=1&rel=0&playsinline=1`;
      f.title = title.textContent;
      f.allow = 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share';
      f.referrerPolicy = 'strict-origin-when-cross-origin';
      f.allowFullscreen = true;
      player.append(f);
      poster.hidden = true;
    });
    items.forEach((b, i) => b.addEventListener('click', () => show(i)));
    tabs.forEach(t => t.addEventListener('click', () => { lang = t.dataset.epLang; render(); }));
    render();
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
  const manuscript = initManuscript();
  initEpisodes();
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
    if (manuscript) manuscript.scroll();
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
    if (manuscript) manuscript.resize();
    request();
  });
  frame();
})();
