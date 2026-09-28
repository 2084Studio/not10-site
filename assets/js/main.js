/* 文革非十年 · Not Ten Years — interactions */
(() => {
  'use strict';

  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const smoothstep = (a, b, v) => { const t = clamp((v - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
  const easeInOut = t => (t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
  const easeOutExpo = t => (t >= 1 ? 1 : 1 - Math.pow(2, -10 * t));

  // Seeded RNG so the tear has the same shape on every visit.
  function mulberry32(seed) {
    return () => {
      seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // Smooth 1-D noise in [-1, 1]: random control points, cosine-interpolated.
  function smoothNoise(len, step, rand) {
    const ctrl = Array.from({ length: Math.ceil(len / step) + 2 }, () => rand() * 2 - 1);
    return Array.from({ length: len }, (_, i) => {
      const k = Math.floor(i / step), f = (i % step) / step;
      const m = (1 - Math.cos(f * Math.PI)) / 2;
      return ctrl[k] * (1 - m) + ctrl[k + 1] * m;
    });
  }

  /* ------------------------------------------------------------
     Hero: two sheets of red paper, torn apart
     ------------------------------------------------------------ */
  function initHero() {
    const hero = document.querySelector('[data-hero]');
    if (!hero) return null;
    const stage = hero.querySelector('.hero__stage');
    const left = hero.querySelector('[data-panel="left"]');
    const right = hero.querySelector('[data-panel="right"]');
    const lFace = left.querySelector('.face'), lRim = left.querySelector('.rim');
    const rFace = right.querySelector('.face'), rRim = right.querySelector('.rim');
    const mid = hero.querySelector('.hero__mid');
    const sideL = hero.querySelector('.hero__side--left');
    const sideR = hero.querySelector('.hero__side--right');
    const cue = hero.querySelector('.hero__cue');

    const N = 150;
    const rand = mulberry32(1966);
    const wander = smoothNoise(N + 1, 38, rand);
    const wobL = smoothNoise(N + 1, 9, rand), wobR = smoothNoise(N + 1, 9, rand);
    const bumpL = smoothNoise(N + 1, 26, rand), bumpR = smoothNoise(N + 1, 26, rand);
    const jitL = Array.from({ length: N + 1 }, rand), jitR = Array.from({ length: N + 1 }, rand);
    const rimL = Array.from({ length: N + 1 }, rand), rimR = Array.from({ length: N + 1 }, rand);

    let W = 0, H = 0, titleY = .5, midHalf = 40, open = reduceMotion ? 1 : 0;

    function measure() {
      W = stage.clientWidth; H = stage.clientHeight;
      const s = stage.getBoundingClientRect(), m = mid.getBoundingClientRect();
      titleY = clamp((m.top + m.height / 2 - s.top) / H, .2, .8);
      midHalf = m.width / 2;
    }

    function draw() {
      const base = Math.max(W * .016, 7);
      const bulge = Math.max(W * .085, midHalf + 6 - base);
      const sigma = .15;
      const teeth = clamp(W * .006, 3, 8) * (.35 + .65 * open);
      const wob = W * .012 * open;
      const lf = [], lr = [], rf = [], rr = [];
      for (let i = 0; i <= N; i++) {
        const t = i / N, y = (t * (H + 8) - 4).toFixed(1);
        const g = Math.exp(-((t - titleY) ** 2) / (2 * sigma * sigma));
        // widen a little near the bottom too, like the printed cover
        const g2 = Math.exp(-((t - .9) ** 2) / (2 * .06 * .06)) * .25;
        const hw = (base + bulge * g + bulge * g2) * open;
        const cx = W / 2 + W * .03 * wander[i] * (1 - g);
        const xl = cx - hw - Math.max(0, bumpL[i]) * wob - wobL[i] * wob * .35 - jitL[i] * teeth;
        const xr = cx + hw + Math.max(0, bumpR[i]) * wob + wobR[i] * wob * .35 + jitR[i] * teeth;
        const rimW = .6 + open * 1.4;
        lf.push(`${xl.toFixed(1)}px ${y}px`);
        lr.push(`${(xl + (1.5 + rimL[i] * 4.5) * rimW).toFixed(1)}px ${y}px`);
        rf.push(`${xr.toFixed(1)}px ${y}px`);
        rr.push(`${(xr - (1.5 + rimR[i] * 4.5) * rimW).toFixed(1)}px ${y}px`);
      }
      const L0 = '-40px -40px', L1 = `-40px ${H + 40}px`;
      const R0 = `${W + 40}px -40px`, R1 = `${W + 40}px ${H + 40}px`;
      lFace.style.clipPath = `polygon(${L0},${lf.join(',')},${L1})`;
      lRim.style.clipPath = `polygon(${L0},${lr.join(',')},${L1})`;
      rFace.style.clipPath = `polygon(${R0},${rf.join(',')},${R1})`;
      rRim.style.clipPath = `polygon(${R0},${rr.join(',')},${R1})`;
    }

    function onScroll() {
      if (reduceMotion) return;
      const range = hero.offsetHeight - H;
      const p = clamp(-hero.getBoundingClientRect().top / Math.max(range, 1), 0, 1);
      const e = easeInOut(p);
      const dx = e * W * .6;
      left.style.transform = `translate3d(${-dx}px,0,0)`;
      right.style.transform = `translate3d(${dx}px,0,0)`;
      sideL.style.transform = `translate3d(${-dx}px,0,0)`;
      sideR.style.transform = `translate3d(${dx}px,0,0)`;
      mid.style.opacity = String(1 - smoothstep(.55, .92, p));
      mid.style.transform = `scale(${1 + e * .25})`;
      cue.style.opacity = String(1 - smoothstep(0, .08, p));
      return p;
    }

    function intro() {
      hero.classList.add('is-ready');
      if (reduceMotion) { draw(); hero.classList.add('is-open'); return; }
      const start = performance.now() + 250, dur = 1900;
      let opened = false;
      const tick = now => {
        const t = clamp((now - start) / dur, 0, 1);
        open = easeOutExpo(t);
        draw();
        if (!opened && t > .32) { opened = true; hero.classList.add('is-open'); }
        if (t < 1) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    }

    measure(); draw();
    const fontsReady = document.fonts && document.fonts.ready ? document.fonts.ready : Promise.resolve();
    Promise.race([fontsReady, new Promise(r => setTimeout(r, 1500))]).then(() => { measure(); intro(); });

    return {
      resize() { measure(); draw(); onScroll(); },
      scroll: onScroll,
      progress() { return clamp(-hero.getBoundingClientRect().top / Math.max(hero.offsetHeight - H, 1), 0, 1); }
    };
  }

  /* ------------------------------------------------------------
     Torn edges between sections
     ------------------------------------------------------------ */
  function initTearEdges() {
    document.querySelectorAll('.tear-edge').forEach((edge, idx) => {
      const rand = mulberry32(1976 + idx * 97);
      const n = 120, h = edge.offsetHeight || 30;
      const coarse = smoothNoise(n + 1, 7, rand);
      const a = ['0% 100%'], b = ['0% 100%'];
      for (let i = 0; i <= n; i++) {
        const x = (i / n * 100).toFixed(2) + '%';
        const y = clamp(h * .55 + coarse[i] * h * .28 + (rand() - .5) * h * .3, 3, h - 1);
        a.push(`${x} ${y.toFixed(1)}px`);
        b.push(`${x} ${Math.max(0, y - 1.5 - rand() * 3.5).toFixed(1)}px`);
      }
      a.push('100% 100%'); b.push('100% 100%');
      edge.style.setProperty('--tear', `polygon(${a.join(',')})`);
      edge.style.setProperty('--tear-rim', `polygon(${b.join(',')})`);
    });
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
  initTearEdges();
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
