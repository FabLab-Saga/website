// Fab Lab Saga · the interactive hero wall.
//
// Inlined right after the wall so the first deal happens before first paint, and
// re-run by the ClientRouter each time the homepage is swapped in
// (data-astro-rerun). Only the decorative cells (.deco, aria-hidden) change:
// shape, turn and colour, re-dealt by the mural's rules. Photo tiles, labels,
// links and reading order are never touched. Without JS the wall stays as built.
//
//   tap/click a cell  -> it turns a quarter (the wide half-disc turns a half)
//   drag a cell       -> it spins under the pointer and settles on a quarter
//
// A turning cell shrinks just enough to stay inside its own grid cell, so it
// never covers a neighbour or a photo link. Colours change only at the middle
// of a turn and only between palette colours: no blends, no new colours.
(() => {
  const wall = document.querySelector('[data-wall]');
  if (!wall || wall.hasAttribute('data-live')) return;
  wall.setAttribute('data-live', '');
  window.__sagaWall?.abort();
  const ac = new AbortController();
  window.__sagaWall = ac;
  const on = (t, type, f, o) => t.addEventListener(type, f, { ...o, signal: ac.signal });

  const COLOURS = ['red', 'green', 'blue', 'orange', 'yellow', 'pink'];
  const SINGLE = ['q', 'q', 'q', 'q', 'circle', 'sq']; // A's grammar: four quarter-discs, circle, square
  const BASE = { q: 'r-tl', circle: 'circle', sq: 'sq', half: 'half' };
  const TURN = { 'r-tl': 0, 'r-tr': 90, 'r-br': 180, 'r-bl': 270, half: 0, 'half-up': 180 };
  const SHAPES = Object.keys(TURN).concat(['circle', 'sq']);
  const reduce = matchMedia('(prefers-reduced-motion: reduce)');
  const rnd = (a) => a[Math.floor(Math.random() * a.length)];

  const cells = [...wall.querySelectorAll('.deco')].map((el) => {
    const cls = SHAPES.find((c) => el.classList.contains(c)) || 'sq';
    const wide = el.classList.contains('w2');
    return {
      el, wide, w: 1, h: 1, tween: null,
      shape: wide ? 'half' : cls.startsWith('r-') ? 'q' : cls,
      a: TURN[cls] || 0,
      colour: COLOURS.find((c) => el.classList.contains('c-' + c)),
    };
  });
  const tiles = [...wall.querySelectorAll('.tile')].map((el) => ({ el, tile: true, colour: el.dataset.colour }));

  // ---- geometry -------------------------------------------------------------
  function measure() { for (const c of cells) { c.w = c.el.offsetWidth || 1; c.h = c.el.offsetHeight || 1; } }
  // largest scale at which the turned box still fits its own cell
  function fit(c) {
    const t = ((c.a % 180) * Math.PI) / 180, x = Math.abs(Math.cos(t)), y = Math.abs(Math.sin(t));
    return Math.min(1, c.w / (c.w * x + c.h * y), c.h / (c.w * y + c.h * x));
  }
  function draw(c) { c.el.style.transform = `rotate(${c.a.toFixed(2)}deg) scale(${fit(c).toFixed(4)})`; }
  function paint(c) {
    c.el.classList.remove(...SHAPES, ...COLOURS.map((k) => 'c-' + k));
    c.el.classList.add(BASE[c.shape], 'c-' + c.colour);
    draw(c);
  }
  // Grid neighbours share an edge. Layout boxes (offset*) ignore transforms.
  function neighbours() {
    const nodes = [...cells, ...tiles];
    const box = nodes.map(({ el }) => ({ l: el.offsetLeft, t: el.offsetTop, r: el.offsetLeft + el.offsetWidth, b: el.offsetTop + el.offsetHeight }));
    const adj = new Map(nodes.map((n) => [n, []]));
    const near = (p, q) => Math.abs(p - q) < 2;
    const overlap = (a1, a2, b1, b2) => Math.min(a2, b2) - Math.max(a1, b1) > 2;
    for (let i = 0; i < nodes.length; i++) for (let j = i + 1; j < nodes.length; j++) {
      const A = box[i], B = box[j];
      if ((overlap(A.t, A.b, B.t, B.b) && (near(A.r, B.l) || near(B.r, A.l))) ||
          (overlap(A.l, A.r, B.l, B.r) && (near(A.b, B.t) || near(B.b, A.t)))) {
        adj.get(nodes[i]).push(nodes[j]); adj.get(nodes[j]).push(nodes[i]);
      }
    }
    return adj;
  }

  // ---- the deal: never two neighbours in one colour ---------------------------
  function plan() {
    const adj = neighbours();
    for (let tries = 0; tries < 100; tries++) {
      const next = new Map();
      let ok = true;
      for (const c of [...cells].sort(() => Math.random() - 0.5)) {
        const used = new Set(adj.get(c).map((n) => (n.tile ? n.colour : next.get(n)?.colour)));
        const pool = COLOURS.filter((k) => !used.has(k));
        if (!pool.length) { ok = false; break; }
        const fresh = pool.filter((k) => k !== c.colour); // prefer a visible change
        next.set(c, { colour: rnd(fresh.length ? fresh : pool), shape: c.wide ? 'half' : rnd(SINGLE) });
      }
      if (ok) return next;
    }
    return null;
  }
  function repairColours() {
    const adj = neighbours();
    for (const c of cells) {
      const used = new Set(adj.get(c).map((n) => n.colour));
      if (!used.has(c.colour)) continue;
      const pool = COLOURS.filter((k) => !used.has(k));
      if (pool.length) { c.colour = rnd(pool); paint(c); }
    }
  }

  // ---- motion: one rAF loop, alive only while something turns ----------------
  const tweens = new Set();
  let raf = 0;
  const settle = (t) => { const s = 1.4; t -= 1; return t * t * ((s + 1) * t + s) + 1; }; // ease-out with a small overshoot
  function stop(c) {
    if (!c.tween) return;
    const tw = c.tween; tweens.delete(tw); c.tween = null;
    if (tw.swap) { tw.swap(); paint(c); }
  }
  function turn(c, to, { delay = 0, dur = 420, swap = null } = {}) {
    stop(c);
    if (reduce.matches) { c.a = to; if (swap) swap(); paint(c); normal(c); return; }
    c.tween = { c, from: c.a, to, start: performance.now() + delay, dur, swap };
    tweens.add(c.tween);
    if (!raf) raf = requestAnimationFrame(tick);
  }
  function normal(c) { c.a = ((c.a % 360) + 360) % 360; draw(c); }
  function tick(now) {
    raf = 0;
    for (const tw of tweens) {
      if (now < tw.start) continue;
      const c = tw.c, p = Math.min(1, (now - tw.start) / tw.dur);
      c.a = tw.from + (tw.to - tw.from) * settle(p);
      if (tw.swap && Math.abs(c.a - tw.from) >= Math.abs(tw.to - tw.from) / 2) {
        const s = tw.swap; tw.swap = null; s(); paint(c); // swap shape/colour at the narrowest point
      } else draw(c);
      if (p >= 1) { tweens.delete(tw); c.tween = null; c.a = tw.to; normal(c); }
    }
    if (tweens.size) raf = requestAnimationFrame(tick);
  }
  ac.signal.addEventListener('abort', () => { cancelAnimationFrame(raf); tweens.clear(); });

  // ---- first deal: instant, before first paint --------------------------------
  measure();
  const first = plan();
  for (const c of cells) {
    if (first) Object.assign(c, first.get(c));
    if (!c.wide) c.a = 90 * Math.floor(Math.random() * 4);
    paint(c);
  }

  // ---- pointer: tap to turn, drag to spin ------------------------------------
  let drag = null;
  on(wall, 'pointerdown', (e) => {
    const el = e.target.closest('.deco');
    if (!el || e.button > 0) return;
    const c = cells.find((x) => x.el === el);
    stop(c);
    const r = el.getBoundingClientRect();
    const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
    drag = { c, id: e.pointerId, cx, cy, x0: e.clientX, y0: e.clientY, phi: Math.atan2(e.clientY - cy, e.clientX - cx), moved: false, v: 0, t: e.timeStamp };
    if (e.pointerType === 'mouse') e.preventDefault(); // no text selection
    el.setPointerCapture?.(e.pointerId);
  });
  on(wall, 'pointermove', (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    if (!drag.moved) {
      if (Math.hypot(e.clientX - drag.x0, e.clientY - drag.y0) < 6) return;
      drag.moved = true; drag.c.el.classList.add('is-held');
    }
    const phi = Math.atan2(e.clientY - drag.cy, e.clientX - drag.cx);
    let d = ((phi - drag.phi) * 180) / Math.PI;
    if (d > 180) d -= 360; else if (d < -180) d += 360;
    const dt = Math.max(1, e.timeStamp - drag.t);
    drag.v = 0.6 * (d / dt) + 0.4 * drag.v; drag.phi = phi; drag.t = e.timeStamp;
    drag.c.a += d; draw(drag.c);
  });
  const release = (e, cancelled) => {
    if (!drag || e.pointerId !== drag.id) return;
    const { c, moved } = drag;
    const v = e.timeStamp - drag.t > 80 ? 0 : drag.v; // a held pointer has no momentum
    drag = null; c.el.classList.remove('is-held');
    const step = c.wide ? 180 : 90;
    if (!moved) { if (!cancelled) turn(c, Math.round(c.a / step) * step + step, { dur: c.wide ? 520 : 420 }); return; }
    const fling = cancelled ? 0 : Math.max(-180, Math.min(180, v * 160)); // keep a flick's momentum
    turn(c, Math.round((c.a + fling) / step) * step, { dur: 380 });
  };
  on(wall, 'pointerup', (e) => release(e, false));
  on(wall, 'pointercancel', (e) => release(e, true));

  let resizeTimer = 0;
  on(window, 'resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => { measure(); repairColours(); cells.forEach(draw); }, 150);
  });
  ac.signal.addEventListener('abort', () => clearTimeout(resizeTimer));
  on(document, 'astro:before-swap', () => ac.abort());
})();
