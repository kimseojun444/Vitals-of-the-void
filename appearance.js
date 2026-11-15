/* Vitals in the Void — Appearance: grain and glass translucency sliders, and wallpapers.
   Wallpapers come in four families, all in the same dark orbital / deep-space style as the default:
   Animated (video or a slow drawn animation), Graphic (drawn artwork), Gradient and Solid — plus the
   crew's own upload (image or video). Settings are saved on the station server. */
(function () {
  /* ---------- catalogue ---------- */
  const ORBIT_VIDEO = 'https://d8j0ntlcm91z4.cloudfront.net/user_38xzZboKViGWJOttwIXH07lWA1P/hf_20260315_073750_51473149-4350-4920-ae24-c8214286f323.mp4';
  const EARTH_VIDEO = 'https://d8j0ntlcm91z4.cloudfront.net/user_38xzZboKViGWJOttwIXH07lWA1P/hf_20260827_202422_3ffb4889-c520-432d-8458-038009eb40df.mp4';
  const svg = s => `url("data:image/svg+xml,${encodeURIComponent(s)}")`;
  function topo() { let p = ''; const R = (a, b) => a + Math.sin(b * 12.9898) * 43758.5453 % 1; for (let k = 0; k < 26; k++) { const cx = 980 + Math.sin(k * .7) * 40, cy = 660 + Math.cos(k * .5) * 30, r = 40 + k * 34; let d = ''; for (let i = 0; i <= 64; i++) { const a = i / 64 * Math.PI * 2, w = r + Math.sin(a * 3 + k * .6) * (8 + k * 1.6) + Math.cos(a * 5 + k) * 6; d += (i ? 'L' : 'M') + (cx + Math.cos(a) * w * 1.25).toFixed(1) + ' ' + (cy + Math.sin(a) * w).toFixed(1); } p += `<path d="${d}Z" fill="none" stroke="rgba(121,220,232,${(.16 - k * .004).toFixed(3)})" stroke-width="1.2"/>`; } return svg(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1600 1000" preserveAspectRatio="xMidYMid slice"><rect width="1600" height="1000" fill="#08100e"/><radialGradient id="g" cx=".62" cy=".66" r=".7"><stop offset="0" stop-color="#16362c" stop-opacity=".8"/><stop offset="1" stop-color="#08100e" stop-opacity="0"/></radialGradient><rect width="1600" height="1000" fill="url(#g)"/>${p}</svg>`); }
  function constel() { let s = '', l = '', pts = []; let seed = 7; const rnd = () => (seed = (seed * 9301 + 49297) % 233280) / 233280; for (let i = 0; i < 160; i++) { const x = rnd() * 1600, y = rnd() * 1000, r = rnd() * 1.4 + .3; s += `<circle cx="${x.toFixed(0)}" cy="${y.toFixed(0)}" r="${r.toFixed(2)}" fill="#fff" opacity="${(.25 + rnd() * .6).toFixed(2)}"/>`; if (i < 26) pts.push([x, y]); } pts.sort((a, b) => a[0] - b[0]); for (let i = 1; i < pts.length; i++) if (Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]) < 320) l += `<line x1="${pts[i - 1][0].toFixed(0)}" y1="${pts[i - 1][1].toFixed(0)}" x2="${pts[i][0].toFixed(0)}" y2="${pts[i][1].toFixed(0)}" stroke="rgba(121,220,232,.28)" stroke-width="1"/><circle cx="${pts[i][0].toFixed(0)}" cy="${pts[i][1].toFixed(0)}" r="2.6" fill="#bdeff5"/>`; return svg(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1600 1000" preserveAspectRatio="xMidYMid slice"><radialGradient id="g" cx=".3" cy=".2" r="1"><stop offset="0" stop-color="#0f2a2a"/><stop offset=".6" stop-color="#070d10"/><stop offset="1" stop-color="#05080a"/></radialGradient><rect width="1600" height="1000" fill="url(#g)"/>${s}${l}</svg>`); }
  function orbits() { let o = ''; for (let k = 0; k < 7; k++) o += `<ellipse cx="1120" cy="620" rx="${180 + k * 120}" ry="${60 + k * 40}" fill="none" stroke="rgba(121,220,232,${(.22 - k * .025).toFixed(3)})" stroke-dasharray="${k % 2 ? '2 10' : '0'}" transform="rotate(-14 1120 620)"/>`; return svg(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1600 1000" preserveAspectRatio="xMidYMid slice"><rect width="1600" height="1000" fill="#060a0c"/>${o}<radialGradient id="p" cx=".38" cy=".32" r=".8"><stop offset="0" stop-color="#5a8f7d"/><stop offset=".55" stop-color="#1d3d34"/><stop offset="1" stop-color="#08120f"/></radialGradient><circle cx="1120" cy="620" r="96" fill="url(#p)"/><circle cx="1120" cy="620" r="99" fill="none" stroke="rgba(121,220,232,.35)" stroke-width="2"/></svg>`); }
  function limb() { return svg(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1600 1000" preserveAspectRatio="xMidYMid slice"><rect width="1600" height="1000" fill="#04080a"/><radialGradient id="a" cx=".5" cy="2.15" r="1.75"><stop offset=".72" stop-color="#0b1a16"/><stop offset=".745" stop-color="#2f6b5c"/><stop offset=".76" stop-color="#9fe7d5" stop-opacity=".9"/><stop offset=".785" stop-color="#2c5d74" stop-opacity=".55"/><stop offset=".86" stop-color="#04080a" stop-opacity="0"/></radialGradient><rect width="1600" height="1000" fill="url(#a)"/></svg>`); }
  const C = [
    { id: 'anim:orbit', cat: 'Animated', name: 'Orbital Earth', note: 'Default', kind: 'video', src: ORBIT_VIDEO, prev: 'radial-gradient(120% 70% at 50% 115%,#3d6b55,transparent 60%),#0a0f0d' },
    { id: 'anim:earth', cat: 'Animated', name: 'Blue marble rise', kind: 'video', src: EARTH_VIDEO, prev: 'radial-gradient(120% 80% at 50% 120%,#2b5f8a,transparent 60%),#04101f' },
    { id: 'anim:aurora', cat: 'Animated', name: 'Aurora over the limb', kind: 'canvas', fx: 'aurora', prev: 'linear-gradient(170deg,transparent 30%,rgba(80,220,160,.35) 50%,transparent 65%),radial-gradient(140% 60% at 50% 125%,#1d4a3c,#05090a 70%)' },
    { id: 'anim:nebula', cat: 'Animated', name: 'Drifting nebula', kind: 'canvas', fx: 'nebula', prev: 'radial-gradient(40% 50% at 30% 40%,rgba(60,170,150,.45),transparent),radial-gradient(40% 50% at 70% 60%,rgba(40,90,150,.45),transparent),#05090c' },
    { id: 'anim:stars', cat: 'Animated', name: 'Star drift', kind: 'canvas', fx: 'stars', prev: 'radial-gradient(1px 1px at 20% 30%,#fff,transparent),radial-gradient(1px 1px at 60% 70%,#fff,transparent),radial-gradient(1.5px 1.5px at 80% 20%,#bdeff5,transparent),radial-gradient(80% 60% at 70% 0%,#10302a,#05080a)' },
    { id: 'anim:ringed', cat: 'Animated', name: 'Ringed planet', kind: 'canvas', fx: 'ringed', prev: 'radial-gradient(14% 14% at 72% 70%,#3c6d60,#13261f 70%,transparent 72%),#060a0c' },
    { id: 'anim:night', cat: 'Animated', name: 'Night side city lights', kind: 'canvas', fx: 'night', prev: 'radial-gradient(150% 70% at 50% 130%,#1a2a24 60%,#5fb8a0 61%,transparent 64%),#04070a' },
    { id: 'gfx:limb', cat: 'Graphic', name: 'Dawn limb', kind: 'image', bg: limb(), prev: limb() },
    { id: 'gfx:topo', cat: 'Graphic', name: 'Topographic', kind: 'image', bg: null, gen: topo, prev: null },
    { id: 'gfx:constel', cat: 'Graphic', name: 'Constellations', kind: 'image', bg: null, gen: constel, prev: null },
    { id: 'gfx:orbits', cat: 'Graphic', name: 'Orbit lines', kind: 'image', bg: null, gen: orbits, prev: null },
    { id: 'grad:teal', cat: 'Gradient', name: 'Deep teal', kind: 'css', bg: 'radial-gradient(120% 90% at 80% 110%,#18453b,transparent 60%),linear-gradient(160deg,#071012,#0b1a17 60%,#06100d)' },
    { id: 'grad:forest', cat: 'Gradient', name: 'Midnight forest', kind: 'css', bg: 'radial-gradient(90% 70% at 20% 0%,#163a2a,transparent 60%),linear-gradient(180deg,#07100b,#040805)' },
    { id: 'grad:abyss', cat: 'Gradient', name: 'Abyss blue', kind: 'css', bg: 'radial-gradient(110% 80% at 50% 120%,#123c58,transparent 62%),linear-gradient(180deg,#05080f,#060c14)' },
    { id: 'grad:fog', cat: 'Gradient', name: 'Graphite fog', kind: 'css', bg: 'radial-gradient(80% 60% at 70% 20%,#2a3330,transparent 60%),linear-gradient(170deg,#0d0f0f,#141917 55%,#0a0c0c)' },
    { id: 'grad:mars', cat: 'Gradient', name: 'Mars dusk', kind: 'css', bg: 'radial-gradient(120% 70% at 50% 125%,#4a2116,transparent 60%),linear-gradient(180deg,#0a0908,#120c0a)' },
    { id: 'solid:void', cat: 'Solid', name: 'Void black', kind: 'css', bg: '#0a0a0a' },
    { id: 'solid:forest', cat: 'Solid', name: 'Forest night', kind: 'css', bg: '#0c1612' },
    { id: 'solid:slate', cat: 'Solid', name: 'Deep slate', kind: 'css', bg: '#0d1317' },
    { id: 'solid:navy', cat: 'Solid', name: 'Midnight navy', kind: 'css', bg: '#0a0f1c' },
    { id: 'solid:moss', cat: 'Solid', name: 'Dark moss', kind: 'css', bg: '#101a14' },
  ];
  C.forEach(w => { if (w.gen) { w.bg = w.gen(); w.prev = w.bg; } if (!w.prev) w.prev = w.bg; });
  const CATS = ['Animated', 'Graphic', 'Gradient', 'Solid'];
  const byId = id => C.find(w => w.id === id);

  /* ---------- background engine ---------- */
  const A = { cfg: { grain: .5, trans: .5, wall: 'anim:orbit', dust: true, custom: null }, raf: 0, fx: null };
  const bg = () => document.getElementById('bg');
  function layer(id, tag) { let el = document.getElementById(id); if (!el) { el = document.createElement(tag); el.id = id; el.className = 'bglayer'; const b = bg(); b.insertBefore(el, b.querySelector('.bgscrim')); } return el; }
  function show(el) { ['bgv', 'bgimg', 'bgfx', 'bgcv'].forEach(id => { const e = document.getElementById(id); if (e && e !== el) { e.classList.remove('on'); if (e.tagName === 'VIDEO') setTimeout(() => { if (!e.classList.contains('on')) e.pause(); }, 900); } }); if (el) requestAnimationFrame(() => el.classList.add('on')); }
  function applyWall(id) {
    stopFx();
    const w = id === 'custom' ? (A.cfg.custom ? { kind: A.cfg.custom.type === 'video' ? 'video' : 'image', src: '/api/wallpaper/file?v=' + A.cfg.custom.v, upload: true } : byId('anim:orbit')) : (byId(id) || byId('anim:orbit'));
    document.documentElement.dataset.wall = (w.id || 'custom');
    if (w.kind === 'video') {
      const v = w.id === 'anim:orbit' ? document.getElementById('bgv') : layer('bgcv', 'video');
      if (v.id === 'bgcv') { v.muted = true; v.loop = true; v.playsInline = true; v.autoplay = true; if (v.getAttribute('src') !== w.src) v.src = w.src; }
      v.classList.remove('on'); const p = v.play && v.play(); p && p.catch && p.catch(() => {});
      const onplay = () => show(v); if (v.readyState >= 3) onplay(); else { v.addEventListener('playing', onplay, { once: true }); show(null); }
    } else if (w.kind === 'image' || w.kind === 'css') {
      const d = layer('bgimg', 'div'); d.style.background = w.kind === 'image' ? (w.upload ? `url("${w.src}") center/cover no-repeat` : `${w.bg} center/cover no-repeat`) : w.bg; show(d);
    } else if (w.kind === 'canvas') { const cv = layer('bgfx', 'canvas'); startFx(cv, w.fx); show(cv); }
    const sc = bg().querySelector('.bgscrim'); if (sc) sc.style.opacity = (w.kind === 'video' || w.upload) ? 1 : .55;
  }
  function applyLook() {
    const r = document.documentElement.style, g = A.cfg.grain, t = A.cfg.trans;
    r.setProperty('--pa', (.86 - .68 * t).toFixed(3)); r.setProperty('--ta', (.52 - .46 * t).toFixed(3)); r.setProperty('--ia', (.55 - .5 * t).toFixed(3));
    r.setProperty('--fw', (.04 + .1 * (1 - t)).toFixed(3)); r.setProperty('--blurP', Math.round(48 - 34 * t) + 'px'); r.setProperty('--blurT', Math.round(26 - 20 * t) + 'px');
    r.setProperty('--grainO', (g).toFixed(2));
    if (window.makeNoise) window.makeNoise(g);
    const dc = document.getElementById('space'); if (dc) dc.style.opacity = A.cfg.dust ? 1 : 0;
  }
  window.applyAppearance = cfg => { if (cfg) A.cfg = Object.assign(A.cfg, cfg); applyLook(); if (A.cur !== A.cfg.wall + (A.cfg.custom ? A.cfg.custom.v : '')) { A.cur = A.cfg.wall + (A.cfg.custom ? A.cfg.custom.v : ''); applyWall(A.cfg.wall); } };
  async function load() { try { const r = await fetch('/api/appearance'); if (r.ok) window.applyAppearance(await r.json()); } catch (e) { window.applyAppearance(); } }
  let saveT = 0; const save = patch => { Object.assign(A.cfg, patch); clearTimeout(saveT); saveT = setTimeout(() => api('/api/appearance', { body: patch }).catch(() => {}), 250); };

  /* ---------- drawn animations (slow, low-cost: ~30 fps, paused when hidden) ---------- */
  function stopFx() { cancelAnimationFrame(A.raf); A.fx = null; }
  function startFx(cv, kind) {
    const ctx = cv.getContext('2d'); let w = 0, h = 0, t = 0, last = 0; const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
    const size = () => { const d = Math.min(1.5, devicePixelRatio || 1); w = innerWidth; h = innerHeight; cv.width = w * d; cv.height = h * d; ctx.setTransform(d, 0, 0, d, 0, 0); };
    size(); addEventListener('resize', size);
    let seed = 11; const rnd = () => (seed = (seed * 9301 + 49297) % 233280) / 233280;
    const stars = Array.from({ length: 220 }, () => ({ x: rnd(), y: rnd(), z: rnd(), tw: rnd() * 6 }));
    const lights = Array.from({ length: 160 }, () => ({ a: rnd() * Math.PI, r: rnd(), tw: rnd() * 6, s: .5 + rnd() }));
    const blobs = Array.from({ length: 6 }, (_, i) => ({ px: rnd(), py: rnd(), fx: .02 + rnd() * .03, fy: .015 + rnd() * .03, r: .35 + rnd() * .35, c: ['42,170,140', '30,110,160', '70,200,170', '20,80,120', '90,210,190', '40,140,120'][i] }));
    const starfield = (sp, al) => { for (const s of stars) { const x = ((s.x * w - t * sp * (1 + s.z * 3)) % w + w) % w, y = s.y * h; ctx.fillStyle = `rgba(255,255,255,${(al * (.25 + s.z * .6) * (.7 + .3 * Math.sin(s.tw + t * 1.3))).toFixed(3)})`; ctx.fillRect(x, y, s.z > .85 ? 1.6 : 1, s.z > .85 ? 1.6 : 1); } };
    const F = {
      aurora() { const g = ctx.createLinearGradient(0, 0, 0, h); g.addColorStop(0, '#04080a'); g.addColorStop(1, '#071311'); ctx.fillStyle = g; ctx.fillRect(0, 0, w, h); starfield(4, .8);
        ctx.globalCompositeOperation = 'lighter';
        for (let k = 0; k < 3; k++) { const base = h * (.38 + k * .09); ctx.beginPath(); for (let x = 0; x <= w; x += 12) { const y = base + Math.sin(x * .0028 + t * .22 + k * 1.7) * 60 + Math.sin(x * .0011 - t * .13 + k) * 90; x ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }
          for (let x = w; x >= 0; x -= 12) { const y = base + 160 + Math.sin(x * .0023 + t * .19 + k * 2.1) * 50 + Math.sin(x * .0013 - t * .11 + k) * 80; ctx.lineTo(x, y); } ctx.closePath();
          const gg = ctx.createLinearGradient(0, base - 120, 0, base + 260); gg.addColorStop(0, 'rgba(60,240,170,0)'); gg.addColorStop(.45, `rgba(${k === 1 ? '90,200,230' : '60,240,170'},${.10 + .03 * Math.sin(t * .5 + k)})`); gg.addColorStop(1, 'rgba(20,90,120,0)'); ctx.fillStyle = gg; ctx.fill(); }
        ctx.globalCompositeOperation = 'source-over';
        const R = w * 1.6, cx = w / 2, cy = h + R * .86; const lg = ctx.createRadialGradient(cx, cy, R * .985, cx, cy, R * 1.04); lg.addColorStop(0, '#0a1814'); lg.addColorStop(.35, 'rgba(120,230,200,.55)'); lg.addColorStop(1, 'rgba(10,30,30,0)'); ctx.fillStyle = lg; ctx.beginPath(); ctx.arc(cx, cy, R * 1.04, 0, 7); ctx.fill(); ctx.fillStyle = '#071210'; ctx.beginPath(); ctx.arc(cx, cy, R * .985, 0, 7); ctx.fill(); },
      nebula() { ctx.fillStyle = '#05090c'; ctx.fillRect(0, 0, w, h); starfield(2, .6); ctx.globalCompositeOperation = 'lighter';
        for (const b of blobs) { const x = (b.px + Math.sin(t * b.fx * 2) * .18) * w, y = (b.py + Math.cos(t * b.fy * 2) * .14) * h, r = b.r * Math.max(w, h) * (1 + .08 * Math.sin(t * .2 + b.px * 9)); const g = ctx.createRadialGradient(x, y, 0, x, y, r); g.addColorStop(0, `rgba(${b.c},.20)`); g.addColorStop(1, `rgba(${b.c},0)`); ctx.fillStyle = g; ctx.fillRect(x - r, y - r, r * 2, r * 2); }
        ctx.globalCompositeOperation = 'source-over'; },
      stars() { const g = ctx.createRadialGradient(w * .7, 0, 0, w * .7, 0, Math.max(w, h)); g.addColorStop(0, '#10302a'); g.addColorStop(.6, '#06100d'); g.addColorStop(1, '#05080a'); ctx.fillStyle = g; ctx.fillRect(0, 0, w, h); starfield(9, 1);
        if (!A.sh && Math.random() < .004) A.sh = { x: rnd() * w, y: rnd() * h * .5, l: 1 }; if (A.sh) { const s = A.sh; s.x -= 7; s.y += 3; s.l -= .02; const gr = ctx.createLinearGradient(s.x, s.y, s.x + 90, s.y - 38); gr.addColorStop(0, `rgba(255,255,255,${.8 * s.l})`); gr.addColorStop(1, 'rgba(255,255,255,0)'); ctx.strokeStyle = gr; ctx.lineWidth = 1.3; ctx.beginPath(); ctx.moveTo(s.x, s.y); ctx.lineTo(s.x + 90, s.y - 38); ctx.stroke(); if (s.l <= 0) A.sh = null; } },
      ringed() { ctx.fillStyle = '#060a0c'; ctx.fillRect(0, 0, w, h); starfield(3, .8); const px = w * .78, py = h * .72, R = Math.min(w, h) * .12;
        ctx.save(); ctx.translate(px, py); ctx.rotate(-.35); ctx.strokeStyle = 'rgba(121,220,232,.18)'; ctx.lineWidth = 1.3; ctx.beginPath(); ctx.ellipse(0, 0, R * 2.1, R * .55, 0, Math.PI, Math.PI * 2); ctx.stroke(); ctx.restore();
        const g = ctx.createRadialGradient(px - R * .4, py - R * .4, R * .1, px, py, R); g.addColorStop(0, 'rgba(90,150,130,.55)'); g.addColorStop(1, 'rgba(14,32,28,.6)'); ctx.fillStyle = g; ctx.beginPath(); ctx.arc(px, py, R, 0, 7); ctx.fill();
        ctx.save(); ctx.translate(px, py); ctx.rotate(-.35); ctx.strokeStyle = 'rgba(121,220,232,.3)'; ctx.beginPath(); ctx.ellipse(0, 0, R * 2.1, R * .55, 0, 0, Math.PI); ctx.stroke(); ctx.restore();
        const a = t * .06, sx = px + Math.cos(a) * R * 3.3, sy = py + Math.sin(a) * R * 1.2; ctx.fillStyle = 'rgba(230,240,255,.9)'; ctx.fillRect(sx - 2, sy - 1.5, 4, 3); ctx.fillStyle = 'rgba(121,220,232,.6)'; ctx.fillRect(sx - 9, sy - 1, 5, 2); ctx.fillRect(sx + 4, sy - 1, 5, 2); },
      night() { ctx.fillStyle = '#04070a'; ctx.fillRect(0, 0, w, h); starfield(1.5, .7); const R = w * 1.25, cx = w / 2 + Math.sin(t * .02) * 20, cy = h + R * .72;
        const lg = ctx.createRadialGradient(cx, cy, R * .99, cx, cy, R * 1.035); lg.addColorStop(0, 'rgba(95,184,160,.6)'); lg.addColorStop(1, 'rgba(10,30,30,0)'); ctx.fillStyle = lg; ctx.beginPath(); ctx.arc(cx, cy, R * 1.035, 0, 7); ctx.fill();
        ctx.fillStyle = '#0a1210'; ctx.beginPath(); ctx.arc(cx, cy, R * .99, 0, 7); ctx.fill();
        for (const L of lights) { const ang = -Math.PI / 2 + (L.a - Math.PI / 2) * .38 + t * .004, rr = R * (.99 - L.r * .2); const x = cx + Math.cos(ang) * rr, y = cy + Math.sin(ang) * rr; if (y > h || y < 0) continue; ctx.fillStyle = `rgba(255,${200 + 40 * L.s | 0},140,${(.25 + .35 * (.5 + .5 * Math.sin(L.tw + t * L.s))).toFixed(3)})`; ctx.fillRect(x, y, 1.6, 1.6); } }
    };
    const fn = F[kind] || F.stars; A.fx = kind;
    const loop = now => { if (A.fx !== kind) return; A.raf = requestAnimationFrame(loop); if (document.hidden) return; if (now - last < 33) return; const dt = Math.min(.1, (now - last) / 1000 || .033); last = now; if (!reduced) t += dt; fn(); };
    fn(); A.raf = requestAnimationFrame(loop);
  }

  /* ---------- the Appearance page ---------- */
  VIEWS.appearance = async () => {
    try { const r = await api('/api/appearance'); A.cfg = Object.assign(A.cfg, r); } catch (e) {}
    const c = cur(); if (c) { try { const O = await api(`/api/crew/${c.id}/overview`); renderHeader(O.hdr); } catch (e) { renderHeader(); } } else renderHeader();
    const f = A.cfg, cat = A.cat || (f.wall === 'custom' ? 'Yours' : (byId(f.wall) || {}).cat || 'Animated');
    const tile = w => `<button class="wall ${f.wall === w.id ? 'on' : ''}" data-wall="${w.id}" title="${esc(w.name)}"><span class="wprev" style="background:${w.prev}${w.kind === 'image' ? ' center/cover' : ''}"></span>${w.kind === 'video' || w.kind === 'canvas' ? '<span class="wbadge">▶ animated</span>' : ''}<span class="wname">${esc(w.name)}${w.note ? ` <span class="t3">· ${w.note}</span>` : ''}</span></button>`;
    return {
      html: `<div class="grid split">
       <div class="card"><h3>Glass & texture</h3><p class="s t2" style="margin-top:4px">Changes apply instantly and are saved for the whole station.</p>
        <div class="slide" style="margin-top:18px"><div class="row between"><label for="sGrain"><b>Grain</b> <span class="t3 s">· film texture on the tiles and screen</span></label><span class="num" id="vGrain">${Math.round(f.grain * 100)}%</span></div><input type="range" id="sGrain" min="0" max="100" value="${Math.round(f.grain * 100)}"><div class="row between xs t3"><span>Smooth</span><span>Heavy grain</span></div></div>
        <div class="slide" style="margin-top:18px"><div class="row between"><label for="sTrans"><b>Translucency</b> <span class="t3 s">· how much of the wallpaper shows through the glass</span></label><span class="num" id="vTrans">${Math.round(f.trans * 100)}%</span></div><input type="range" id="sTrans" min="0" max="100" value="${Math.round(f.trans * 100)}"><div class="row between xs t3"><span>Frosted / solid</span><span>Clear glass</span></div></div>
        <label class="row" style="gap:10px;margin-top:18px;cursor:pointer"><input type="checkbox" id="sDust" ${f.dust ? 'checked' : ''} style="width:18px;min-height:18px"><span><b>Floating dust</b> <span class="t3 s">· slow drifting particles over the wallpaper</span></span></label>
        <div class="sub glassdemo" style="margin-top:18px"><b>Preview tile</b><p class="s t2" style="margin-top:4px">Text should stay easy to read. If it isn't, lower the translucency.</p><div class="row" style="margin-top:10px;gap:8px"><span class="count"><span class="dot" style="background:var(--ok)"></span><b>8</b>nominal</span><button class="btn sm">Button</button><button class="btn p sm">Primary</button></div></div>
        <div class="row" style="margin-top:16px"><button class="btn ghost sm" id="sReset">Reset to default look</button></div></div>
       <div class="card"><div class="row between"><h3>Wallpaper</h3><button class="btn sm" id="wRand">${ICON('<path d="M16 3h5v5M4 20L21 3M21 16v5h-5M15 15l6 6M4 4l5 5"/>')}Surprise me</button></div>
        <p class="s t2" style="margin-top:4px">Pick a background, shuffle to a random one, or upload your own picture or video.</p>
        <div class="seg" style="margin-top:14px" id="wcats">${CATS.concat(['Yours']).map(k => `<button data-cat="${k}" aria-pressed="${k === cat}">${k}</button>`).join('')}</div>
        <div id="wgrid" style="margin-top:14px">${cat === 'Yours' ? yours() : `<div class="wgrid">${C.filter(w => w.cat === cat).map(tile).join('')}</div>`}</div></div></div>`,
      bind() {
        const sg = $('#sGrain'), sl = $('#sTrans');
        sg.oninput = () => { $('#vGrain').textContent = sg.value + '%'; A.cfg.grain = sg.value / 100; applyLook(); }; sg.onchange = () => save({ grain: sg.value / 100 });
        sl.oninput = () => { $('#vTrans').textContent = sl.value + '%'; A.cfg.trans = sl.value / 100; applyLook(); }; sl.onchange = () => save({ trans: sl.value / 100 });
        $('#sDust').onchange = e => { A.cfg.dust = e.target.checked; applyLook(); save({ dust: e.target.checked }); };
        $('#sReset').onclick = () => { Object.assign(A.cfg, { grain: .5, trans: .5, dust: true }); save({ grain: .5, trans: .5, dust: true }); applyLook(); pick('anim:orbit'); render(); };
        $$('#wcats [data-cat]').forEach(b => b.onclick = () => { A.cat = b.dataset.cat; $$('#wcats [data-cat]').forEach(x => x.setAttribute('aria-pressed', x === b)); drawGrid(); });
        $('#wRand').onclick = () => { const pool = C.filter(w => w.id !== A.cfg.wall); const w = pool[Math.floor(Math.random() * pool.length)]; A.cat = w.cat; pick(w.id); $$('#wcats [data-cat]').forEach(x => x.setAttribute('aria-pressed', x.dataset.cat === w.cat)); drawGrid(); toast('Wallpaper: ' + w.name); };
        bindGrid();
      }
    };
    function yours() {
      const cu = A.cfg.custom;
      return `<div class="stack gap12"><label class="wdrop" id="wdrop"><input type="file" id="wfile" accept="image/*,video/mp4,video/webm,video/quicktime" class="hidden">${ICON('<path d="M12 16V4M6 10l6-6 6 6M4 20h16"/>')}<b>Upload your own wallpaper</b><span class="s t3">Drop an image (JPG, PNG, WebP, GIF) or a video (MP4, WebM) here, or click to choose · up to 120 MB</span></label>
       ${cu ? `<div class="wgrid"><button class="wall ${A.cfg.wall === 'custom' ? 'on' : ''}" data-wall="custom"><span class="wprev" style="background:${cu.type === 'video' ? '#111' : `url('/api/wallpaper/file?v=${cu.v}') center/cover`}">${cu.type === 'video' ? `<video src="/api/wallpaper/file?v=${cu.v}" muted loop autoplay playsinline></video>` : ''}</span><span class="wname">${esc(cu.name)}</span></button></div>` : '<p class="s t3">No uploaded wallpaper yet.</p>'}</div>`;
    }
    function drawGrid() { const g = $('#wgrid'); if (!g) return; const cat = A.cat; g.innerHTML = cat === 'Yours' ? yours() : `<div class="wgrid">${C.filter(w => w.cat === cat).map(tile).join('')}</div>`; g.style.animation = 'none'; void g.offsetWidth; g.style.animation = 'rise .3s var(--ease)'; bindGrid(); }
    function bindGrid() {
      $$('#wgrid [data-wall]').forEach(b => b.onclick = () => { pick(b.dataset.wall); $$('#wgrid [data-wall]').forEach(x => x.classList.toggle('on', x === b)); });
      const fi = $('#wfile'), dz = $('#wdrop');
      if (fi) fi.onchange = () => fi.files[0] && upload(fi.files[0]);
      if (dz) { dz.ondragover = e => { e.preventDefault(); dz.classList.add('over'); }; dz.ondragleave = () => dz.classList.remove('over'); dz.ondrop = e => { e.preventDefault(); dz.classList.remove('over'); const f = e.dataTransfer.files[0]; if (f) upload(f); }; }
    }
    async function upload(file) {
      const fd = new FormData(); fd.append('file', file); toast('Uploading ' + file.name + '…');
      try { const r = await api('/api/wallpaper', { form: fd }); A.cfg = Object.assign(A.cfg, r); window.applyAppearance(); A.cat = 'Yours'; drawGrid(); toast('Your wallpaper is on'); } catch (e) { toast(e.message); }
    }
  };
  function pick(id) { A.cfg.wall = id; save({ wall: id }); A.cur = null; window.applyAppearance(); }
  load();
})();
