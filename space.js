/* Vitals in the Void — background.
   Same layers as the reference: the orbital Earth video under a radial scrim, plus the reference's
   slow drifting star/dust particles (white and cyan, rising gently and twinkling).
   The video fades in once it plays; without a connection the dark ground and dust remain.
   Pauses when the tab is hidden; a single still frame under reduced motion. */
/* film grain: one noise tile shared by the screen overlay and every glass surface.
   window.makeNoise(intensity 0–1) redraws it when the Appearance "Grain" slider moves. */
(() => {
  const n = 160, c = document.createElement('canvas'); c.width = c.height = n; const x = c.getContext('2d');
  const base = new Uint8Array(n * n * 2); for (let i = 0; i < n * n; i++) { base[i * 2] = Math.random() < .5 ? 0 : 255; base[i * 2 + 1] = Math.random() * 255 | 0; }
  window.makeNoise = g => {
    try { const d = x.createImageData(n, n), amax = 52 * Math.max(0, Math.min(1, g));
      for (let i = 0; i < n * n; i++) { const v = base[i * 2]; d.data[i * 4] = d.data[i * 4 + 1] = d.data[i * 4 + 2] = v; d.data[i * 4 + 3] = base[i * 2 + 1] / 255 * amax | 0; }
      x.putImageData(d, 0, 0); document.documentElement.style.setProperty('--noise', `url(${c.toDataURL('image/png')})`); } catch (e) {}
  };
  window.makeNoise(.5);
})();
(() => {
  const v = document.getElementById('bgv');
  if (v) {
    const on = () => { const w = document.documentElement.dataset.wall; if (!w || w === 'anim:orbit') v.classList.add('on'); };
    v.addEventListener('playing', on);
    const p = v.play && v.play(); if (p && p.catch) p.catch(() => {});
    document.addEventListener('visibilitychange', () => { const w = document.documentElement.dataset.wall; if (document.hidden) v.pause(); else if (!w || w === 'anim:orbit') { const q = v.play(); q && q.catch && q.catch(() => {}); } });
  }
  const cv = document.getElementById('space'); if (!cv || !cv.getContext) return;
  const ctx = cv.getContext('2d');
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  let w = 0, h = 0, dpr = 1, P = [], last = 0, run = true;
  function seed() {
    const n = Math.min(95, Math.max(36, Math.round(w * h / 18000))); P = [];
    for (let i = 0; i < n; i++) {
      const dust = i % 4 === 0, depth = .3 + Math.random() * .7, t = Math.random();
      P.push({ x: Math.random() * w, y: Math.random() * h, r: dust ? 1.4 + Math.random() * 1.8 : .55 + Math.random() * 1.05,
        vx: (Math.random() - .45) * 4.5 * depth, vy: -(2.2 + Math.random() * 5.8) * depth,
        a: dust ? .08 + Math.random() * .14 : .18 + Math.random() * .42, amp: dust ? .05 : .12 + Math.random() * .22,
        sp: .4 + Math.random() * .9, ph: Math.random() * 6.283, dust, c: t < .28 ? '121,220,232' : t < .52 ? '206,236,255' : '255,255,255' });
    }
  }
  function size() { dpr = Math.min(devicePixelRatio || 1, 2); w = innerWidth; h = innerHeight; cv.width = Math.max(1, w * dpr | 0); cv.height = Math.max(1, h * dpr | 0); ctx.setTransform(dpr, 0, 0, dpr, 0, 0); seed(); }
  function draw(ts) {
    if (!last) last = ts; const dt = Math.min(.05, (ts - last) / 1000); last = ts; const t = ts / 1000;
    ctx.clearRect(0, 0, w, h);
    for (const p of P) {
      if (!reduced) { p.x += p.vx * dt; p.y += p.vy * dt; if (p.y < -8) p.y = h + 8; else if (p.y > h + 8) p.y = -8; if (p.x < -8) p.x = w + 8; else if (p.x > w + 8) p.x = -8; }
      const a = p.a + (reduced ? 0 : Math.sin(t * p.sp + p.ph) * p.amp); if (a <= .01) continue;
      if (p.dust) { const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.r * 2.4); g.addColorStop(0, `rgba(${p.c},${a.toFixed(3)})`); g.addColorStop(1, `rgba(${p.c},0)`); ctx.fillStyle = g; ctx.beginPath(); ctx.arc(p.x, p.y, p.r * 2.4, 0, 6.283); ctx.fill(); }
      else { ctx.fillStyle = `rgba(${p.c},${a.toFixed(3)})`; ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, 6.283); ctx.fill(); }
    }
    if (!reduced && run) requestAnimationFrame(draw);
  }
  addEventListener('resize', () => { size(); if (reduced) draw(performance.now()); });
  document.addEventListener('visibilitychange', () => { run = !document.hidden; last = 0; if (run && !reduced) requestAnimationFrame(draw); });
  size(); requestAnimationFrame(draw);
})();
