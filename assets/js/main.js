/* 文革非十年 · Not Ten Years — interactions */
(() => {
  'use strict';

  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const smoothstep = (a, b, v) => { const t = clamp((v - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
  const easeInOut = t => (t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
  const easeOutCubic = t => 1 - Math.pow(1 - t, 3);

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
    const tabs = [...document.querySelectorAll('[data-video]')];
    const ytLink = document.querySelector('[data-yt-link]');

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
     Scroll / resize loop
     ------------------------------------------------------------ */
  const header = document.querySelector('[data-header]');
  const bar = document.querySelector('.progress');
  const hero = initHero();
  initReveal();
  const timeline = initTimeline();
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
    request();
  });
  frame();
})();
