/* Vitals in the Void — Games: leisure for the crew, solo or together.
   Ludo (2–8 players, any seat human or computer), Chess (2 players or vs computer),
   Connect Four (2 players or vs computer), Memory match (1–4 players, scored) and Sudoku (solo). */
const G = { cur: null, timers: [] };
const gClear = () => { G.timers.forEach(clearTimeout); G.timers = []; clearInterval(G.tick); document.removeEventListener('keydown', sudKey); if (G.lkey) document.removeEventListener('keydown', G.lkey); };
const gLater = (f, ms) => { const t = setTimeout(f, ms); G.timers.push(t); return t; };
const gWait = ms => new Promise(r => gLater(r, ms));
const crewFirst = () => (STATE.crew || []).map(c => c.name.split(' ')[0]);
const lsGet = (k, d) => { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } };
const lsSet = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} };
const GAMES = [
  ['ludo', 'Ludo', '2–8 players · humans or computer', 'Race your four tokens home. Roll a 6 to leave base, land on others to send them back.', '<circle cx="7" cy="7" r="3"/><circle cx="17" cy="7" r="3"/><circle cx="7" cy="17" r="3"/><circle cx="17" cy="17" r="3"/><rect x="3" y="3" width="18" height="18" rx="3"/>'],
  ['chess', 'Chess', '2 players or vs computer', 'Full rules: castling, en passant, promotion, check and mate. Three computer levels.', '<path d="M8 21h8M9 21l1-6h4l1 6M10 15c-2-1-3-3-2-5l2-2-1-3h6l-1 3 2 2c1 2 0 4-2 5"/>'],
  ['c4', 'Connect Four', '2 players or vs computer', 'Drop discs and connect four in a row — across, down or diagonally.', '<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="8" cy="9" r="1.6"/><circle cx="12" cy="9" r="1.6"/><circle cx="16" cy="9" r="1.6"/><circle cx="8" cy="15" r="1.6"/><circle cx="12" cy="15" r="1.6"/><circle cx="16" cy="15" r="1.6"/>'],
  ['memory', 'Memory match', '1–4 players · scored', 'Flip two cards, find the pairs. Streaks earn combo points; solo games add a time bonus.', '<rect x="3" y="4" width="8" height="11" rx="2"/><rect x="13" y="9" width="8" height="11" rx="2"/>'],
  ['sudoku', 'Sudoku', 'Solo', 'Unique-solution puzzles with pencil notes, undo, hints and best times.', '<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M9 3v18M15 3v18M3 9h18M3 15h18"/>'],
];

VIEWS.games = async () => {
  const c = cur(); if (c) { try { const O = await api(`/api/crew/${c.id}/overview`); renderHeader(O.hdr); } catch (e) { renderHeader(); } } else renderHeader();
  gClear(); G.cur = null;
  return {
    html: `<p class="t2" style="max-width:720px">Downtime matters: short games lower stress and keep the crew connected. Play alone against the computer or pass the tablet around.</p>
    <div class="ggrid section">${GAMES.map(([k, n, p, d, ic]) => `<button class="gcard" data-game="${k}"><span class="gic">${ICON(ic)}</span><span class="gt"><b>${n}</b><span class="xs t3">${p}</span></span><span class="s t2">${d}</span></button>`).join('')}</div>`,
    bind() { $$('[data-game]').forEach(b => b.onclick = () => openGame(b.dataset.game)); }
  };
};
function openGame(k) {
  gClear(); G.cur = k; const g = GAMES.find(x => x[0] === k);
  $('#main').innerHTML = `<div class="page"><div class="row between" style="margin-bottom:16px"><button class="btn ghost" id="gback">${ICON('<path d="M15 6l-6 6 6 6"/>')}All games</button><h2 style="margin:0">${g[1]}</h2><span style="width:110px"></span></div><div id="gmain"></div></div>`;
  $('#mainwrap').scrollTop = 0; $('#gback').onclick = () => { gClear(); render(); };
  ({ ludo: ludoSetup, chess: chessSetup, c4: c4Setup, memory: memSetup, sudoku: sudSetup })[k]();
}
const seg = (name, items, sel) => `<div class="seg" data-seg="${name}">${items.map(([v, n]) => `<button type="button" data-v="${v}" aria-pressed="${v === sel}">${n}</button>`).join('')}</div>`;
function bindSeg(root, cb) { root.querySelectorAll('[data-seg]').forEach(s => s.querySelectorAll('button').forEach(b => b.onclick = () => { s.querySelectorAll('button').forEach(x => x.setAttribute('aria-pressed', x === b)); cb && cb(s.dataset.seg, b.dataset.v); })); }
const segVal = (root, name) => root.querySelector(`[data-seg="${name}"] [aria-pressed=true]`).dataset.v;
function setupCard(inner, start) {
  $('#gmain').innerHTML = `<div class="card" style="max-width:760px;margin-inline:auto">${inner}<div style="margin-top:20px"><button class="btn p" id="gstart">${ICON('<path d="M6 4l14 8-14 8z"/>')}Start game</button></div></div>`;
  bindSeg($('#gmain')); $('#gstart').onclick = start;
}
function gameOver(msg, again, extra = '') {
  modal(`<div style="text-align:center"><div style="font-size:44px;line-height:1">🏆</div><h3 style="margin-top:10px">${msg}</h3>${extra}<div class="row" style="justify-content:center;margin-top:18px"><button class="btn" id="gm1">Close</button><button class="btn p" id="gm2">Play again</button></div></div>`);
  $('#gm1').onclick = closeModal; $('#gm2').onclick = () => { closeModal(); again(); };
}

/* =================================================================== LUDO
   One geometry for 4, 6 or 8 arms: each arm is 3 lanes × 6 cells around a central polygon.
   Track per arm (13 cells): outward lane (6), tip (2), inward lane (5). A player starts on the
   inward lane of their arm, goes round once and turns into the middle lane (home column). */
const LCOL = [['Red', '#ef5b5b'], ['Green', '#34c27a'], ['Yellow', '#f5b941'], ['Blue', '#5aa8ff'], ['Purple', '#b07cff'], ['Orange', '#ff9a4a'], ['Cyan', '#79dce8'], ['Pink', '#ff7fb6']];
const PIPS = { 1: [4], 2: [0, 8], 3: [0, 4, 8], 4: [0, 2, 6, 8], 5: [0, 2, 4, 6, 8], 6: [0, 2, 3, 5, 6, 8] };
const DIEROT = { 1: [0, 0], 6: [0, 180], 2: [0, -90], 5: [0, 90], 3: [-90, 0], 4: [90, 0] };
function lGeo(N) {
  const a = 1.5 / Math.tan(Math.PI / N), L = 13 * N, F = L + 4;
  const phi = k => Math.PI + 2 * Math.PI * k / N;
  const xy = (k, j, i) => { const f = phi(k), r = a + i + .5, o = j - 1; return [Math.cos(f) * r - Math.sin(f) * o, Math.sin(f) * r + Math.cos(f) * o]; };
  const T = []; for (let k = 0; k < N; k++) { for (let i = 0; i < 6; i++) T.push([k, 0, i]); T.push([k, 1, 5], [k, 2, 5]); for (let i = 4; i >= 0; i--) T.push([k, 2, i]); }
  const tipR = Math.hypot(a + 6, 1.5), V = (N === 4 ? a + 6 : tipR) + .35;
  let D, rb; if (N === 4) { D = Math.SQRT2 * 4.5; rb = 2.45; } else { const s = Math.sin(Math.PI / N); rb = ((a + 5.8) * s - 1.7) / (1 + s); D = a + 6 - rb - .2; }
  const base = k => { const f = phi(k) + Math.PI / N; return [Math.cos(f) * D, Math.sin(f) * D]; };
  const safe = new Set(); for (let k = 0; k < N; k++) { safe.add(13 * k + 8); safe.add(13 * k + 3); }
  return { N, a, L, F, V, rb, phi, xy, T, base, safe };
}
function ludoSetup() {
  const names = crewFirst();
  const rows = G.lsetup || [{ kind: 'h', name: names[0] || 'Player 1' }, names[1] ? { kind: 'h', name: names[1] } : { kind: 'c', name: 'Computer' }, { kind: 'c', name: 'Computer' }];
  const draw = () => {
    $('#gmain').innerHTML = `<div class="card" style="max-width:780px;margin-inline:auto"><div class="row between"><h3>Players</h3><span class="pill">${rows.length} of 8</span></div>
     <p class="s t3" style="margin-top:4px">2–8 players. Up to 4 play on the classic board; 5–6 use a six-arm board and 7–8 an eight-arm board.</p>
     <div class="stack gap8" style="margin-top:14px">${rows.map((r, i) => `<div class="sub row" style="gap:12px;flex-wrap:wrap"><span class="dot" style="background:${LCOL[i][1]};width:14px;height:14px;box-shadow:0 0 10px ${LCOL[i][1]}"></span><b style="width:64px">${LCOL[i][0]}</b>
      ${seg('k' + i, [['h', 'Human'], ['c', 'Computer']], r.kind)}<input data-nm="${i}" value="${esc(r.name)}" style="width:min(200px,100%);flex:1" aria-label="${LCOL[i][0]} player name">
      <button class="iconbtn" data-rm="${i}" title="Remove player" ${rows.length <= 2 ? 'disabled style="opacity:.35"' : ''}>${ICON('<path d="M6 6l12 12M18 6L6 18"/>')}</button></div>`).join('')}</div>
     <div class="row" style="margin-top:14px"><button class="btn" id="ladd" ${rows.length >= 8 ? 'disabled' : ''}>${ICON('<path d="M12 5v14M5 12h14"/>')}Add player</button></div>
     <div style="margin-top:20px"><button class="btn p" id="gstart">${ICON('<path d="M6 4l14 8-14 8z"/>')}Start game</button></div></div>`;
    const sync = () => rows.forEach((r, i) => { r.name = $(`[data-nm="${i}"]`).value; });
    bindSeg($('#gmain'), (k, v) => { rows[+k.slice(1)].kind = v; const inp = $(`[data-nm="${k.slice(1)}"]`); if (v === 'c' && !/computer/i.test(inp.value)) inp.value = 'Computer'; else if (v === 'h' && /^computer$/i.test(inp.value)) inp.value = names[+k.slice(1)] || 'Player ' + (+k.slice(1) + 1); });
    $$('[data-rm]').forEach(b => b.onclick = () => { sync(); rows.splice(+b.dataset.rm, 1); draw(); });
    $('#ladd').onclick = () => { sync(); rows.push({ kind: 'c', name: 'Computer' }); draw(); };
    $('#gstart').onclick = () => { sync(); G.lsetup = rows.map(r => ({ ...r })); const P = rows.map((r, i) => ({ i, kind: r.kind, name: r.name || LCOL[i][0] })); P.forEach(p => { if (p.kind === 'c' && /^computer$/i.test(p.name)) p.name = 'Computer · ' + LCOL[p.i][0]; }); ludoStart(P); };
  };
  draw();
}
function ludoStart(P) {
  const n = P.length, N = n <= 4 ? 4 : n <= 6 ? 6 : 8, g = lGeo(N);
  P.forEach((p, k) => p.arm = Math.round(k * N / n) % N);
  const S = G.L = { P, g, tok: {}, turn: 0, roll: null, sixes: 0, busy: true, die: { x: 0, y: 0 } };
  P.forEach(p => S.tok[p.i] = [-1, -1, -1, -1]);
  $('#gmain').innerHTML = `<div class="ludo3"><aside class="card lrules"><h4>How to play</h4><ul class="s t2">
     <li>Roll a <b>6</b> to bring a token out of base.</li><li>A 6 rolls again — three 6s in a row lose the turn.</li><li>Land on a lone opponent to send it back to base, and roll again.</li><li>★ squares and coloured start squares are safe.</li><li>Go round once, then up your colour’s lane. An exact roll is needed to reach the centre.</li><li>First to bring all four tokens home wins.</li></ul>
     <h4 style="margin-top:16px">Controls</h4><p class="s t2">Tap the die (or press <b>Space</b>), then tap a glowing token.</p></aside>
    <div class="lboardwrap"><div class="ludo2" id="lboard">${ludoSVG(S)}<div id="ltoks"></div></div></div>
    <aside class="stack gap12 lside"><div class="card"><div id="lturn"></div><div class="dicebox" id="ldicebox"><button class="die3d" id="ldie" aria-label="Roll the die"><span class="cube" id="lcube">${[1, 2, 3, 4, 5, 6].map(f => `<span class="face f${f}">${Array.from({ length: 9 }, (_, k) => `<i class="${PIPS[f].includes(k) ? 'on' : ''}"></i>`).join('')}</span>`).join('')}</span></button></div><div class="s t2" id="lmsg" style="text-align:center;min-height:42px">Roll to start.</div></div>
     <div class="card"><h4>Players</h4><div id="lplayers" class="stack gap8" style="margin-top:8px"></div></div></aside></div>`;
  $('#ldie').onclick = () => { const p = S.P[S.turn]; if (p.kind === 'h' && !S.busy && S.roll == null) ludoRoll(); };
  G.lkey = e => { if (e.code === 'Space' && G.cur === 'ludo' && $('#ldie') && !e.target.closest('input,textarea')) { e.preventDefault(); $('#ldie').click(); } };
  document.addEventListener('keydown', G.lkey);
  ludoTokens(); ludoUI(); S.busy = false; ludoNext(true);
}
function ludoSVG(S) {
  const g = S.g, V = g.V, own = {}; S.P.forEach(p => own[p.arm] = LCOL[p.i][1]);
  let h = `<svg viewBox="${-V} ${-V} ${2 * V} ${2 * V}" class="lsvg" aria-label="Ludo board"><defs><filter id="lglow"><feGaussianBlur stdDeviation=".18"/></filter></defs>`;
  h += g.N === 4 ? `<rect x="${-V}" y="${-V}" width="${2 * V}" height="${2 * V}" rx=".9" class="lbg"/>` : `<circle r="${V}" class="lbg"/>`;
  for (let k = 0; k < g.N; k++) {
    const col = own[k], [bx, by] = g.base(k), deg = g.phi(k) * 180 / Math.PI;
    if (g.N === 4) h += `<rect x="${bx - 2.85}" y="${by - 2.85}" width="5.7" height="5.7" rx=".7" fill="${col || 'rgba(255,255,255,.06)'}" fill-opacity="${col ? .28 : 1}" stroke="${col || 'rgba(255,255,255,.15)'}" stroke-opacity=".7" stroke-width=".06"/>`;
    h += `<circle cx="${bx}" cy="${by}" r="${g.rb}" fill="rgba(5,8,10,.55)" stroke="${col || 'rgba(255,255,255,.2)'}" stroke-width=".07"/>`;
    if (col) for (let t = 0; t < 4; t++) { const [ox, oy] = lBaseSpot(g, k, t); h += `<circle cx="${ox}" cy="${oy}" r=".42" fill="none" stroke="${col}" stroke-opacity=".5" stroke-width=".05"/>`; }
    h += `<g transform="rotate(${deg})">`;
    for (let i = 0; i < 6; i++) for (let j = 0; j < 3; j++) {
      const idx = 13 * k + (j === 0 ? i : j === 2 ? (i === 5 ? 7 : 12 - i) : (i === 5 ? 6 : -1));
      const home = j === 1 && i < 5, start = j === 2 && i === 4, star = j === 0 && i === 3;
      const fill = home ? (col || 'rgba(255,255,255,.08)') : start ? (col || 'rgba(255,255,255,.12)') : 'rgba(255,255,255,.09)';
      const op = home ? (col ? .55 : 1) : start ? (col ? .8 : 1) : 1;
      h += `<rect x="${g.a + i + .06}" y="${j - 1.5 + .06}" width=".88" height=".88" rx=".16" fill="${fill}" fill-opacity="${op}" stroke="rgba(255,255,255,.14)" stroke-width=".03"/>`;
      if (star) h += `<text x="${g.a + i + .5}" y="${j - 1}" class="lstar" transform="rotate(${-deg} ${g.a + i + .5} ${j - 1})">★</text>`;
      if (start) h += `<text x="${g.a + i + .5}" y="${j - 1}" class="lstar" style="fill:#fff" transform="rotate(${-deg} ${g.a + i + .5} ${j - 1})">➜</text>`;
    }
    h += `<path d="M0 0L${g.a} -1.5L${g.a} 1.5Z" fill="${col || 'rgba(255,255,255,.06)'}" fill-opacity="${col ? .75 : 1}" stroke="rgba(0,0,0,.3)" stroke-width=".03"/></g>`;
  }
  return h + `<circle r="${Math.min(.9, g.a * .45)}" fill="rgba(255,255,255,.9)" filter="url(#lglow)" opacity=".25"/></svg>`;
}
const lBaseSpot = (g, k, t) => { const [bx, by] = g.base(k), d = g.rb * .46; return [bx + (t % 2 ? d : -d), by + (t < 2 ? -d : d)]; };
function lPos(S, p, t, k) {
  const g = S.g;
  if (t < 0) return lBaseSpot(g, p.arm, k);
  if (t <= g.L - 2) { const c = g.T[(13 * p.arm + 8 + t) % g.L]; return g.xy(...c); }
  if (t < g.F) return g.xy(p.arm, 1, 4 - (t - (g.L - 1)));
  const f = g.phi(p.arm), r = g.a * .48; return [Math.cos(f) * r + (k % 2 ? .3 : -.3) * -Math.sin(f), Math.sin(f) * r + (k % 2 ? .3 : -.3) * Math.cos(f)];
}
const lTrack = (S, p, t) => t >= 0 && t <= S.g.L - 2 ? (13 * p.arm + 8 + t) % S.g.L : null;
function ludoTokens() {
  const S = G.L, box = $('#ltoks'); if (!box) return; const V = S.g.V, size = 100 / (2 * V) * .74;
  if (!box.children.length) box.innerHTML = S.P.map(p => [0, 1, 2, 3].map(k => `<button class="ltok2" data-p="${p.i}" data-k="${k}" aria-label="${LCOL[p.i][0]} token ${k + 1}" style="--pc:${LCOL[p.i][1]};width:${size}%"><i></i></button>`).join('')).join('');
  const spots = {};
  S.P.forEach(p => S.tok[p.i].forEach((t, k) => { const [x, y] = lPos(S, p, t, k); const key = x.toFixed(2) + ',' + y.toFixed(2); (spots[key] = spots[key] || []).push([p, k, x, y]); }));
  Object.values(spots).forEach(arr => arr.forEach(([p, k, x, y], j) => {
    const el = box.querySelector(`[data-p="${p.i}"][data-k="${k}"]`); const m = arr.length > 1;
    const ox = m ? ((j % 2) ? .2 : -.2) : 0, oy = m ? (arr.length > 2 ? (j < 2 ? -.2 : .2) : 0) : 0;
    el.style.left = (x + ox + V) / (2 * V) * 100 + '%'; el.style.top = (y + oy + V) / (2 * V) * 100 + '%';
    el.style.setProperty('--sc', m ? .78 : 1); el.style.zIndex = 2 + j;
  }));
}
function ludoUI(mv = []) {
  const S = G.L, p = S.P[S.turn]; if (!$('#lturn')) return;
  $$('#ltoks .ltok2').forEach(b => { const on = +b.dataset.p === p.i && mv.includes(+b.dataset.k); b.classList.toggle('mv', on); b.tabIndex = on ? 0 : -1; b.onclick = on ? () => ludoMove(+b.dataset.k) : null; });
  $('#lturn').innerHTML = `<div class="row" style="gap:10px;justify-content:center"><span class="dot" style="background:${LCOL[p.i][1]};width:14px;height:14px;box-shadow:0 0 12px ${LCOL[p.i][1]}"></span><b style="font:500 18px var(--hf)">${esc(p.name)}</b><span class="pill">${p.kind === 'c' ? 'computer' : 'your turn'}</span></div>`;
  $('#ldicebox').style.setProperty('--pc', LCOL[p.i][1]);
  $('#ldie').disabled = !(p.kind === 'h' && S.roll == null && !S.busy);
  $('#lplayers').innerHTML = S.P.map((q, k) => { const home = S.tok[q.i].filter(t => t === S.g.F).length, out = S.tok[q.i].filter(t => t >= 0 && t < S.g.F).length;
    return `<div class="lprow ${k === S.turn ? 'on' : ''}"><span class="dot" style="background:${LCOL[q.i][1]}"></span><span class="grow">${esc(q.name)}</span><span class="xs t3">${out} out</span><span class="lhome">${'●'.repeat(home)}<span class="t3">${'○'.repeat(4 - home)}</span></span></div>`; }).join('');
}
function ludoMovable(p, roll) { const F = G.L.g.F; return G.L.tok[p.i].map((t, k) => (t < 0 ? roll === 6 : t < F && t + roll <= F) ? k : -1).filter(k => k >= 0); }
async function ludoRoll() {
  const S = G.L; S.busy = true; ludoUI();
  const r = 1 + Math.floor(Math.random() * 6), [tx, ty] = DIEROT[r];
  const up = (cur, t) => t + 360 * (Math.ceil((cur - t) / 360) + 2);
  S.die = { x: up(S.die.x, tx) + 360 * Math.floor(Math.random() * 2), y: up(S.die.y, ty) };
  $('#ldie').classList.add('rolling'); $('#lcube').style.transform = `rotateX(${S.die.x}deg) rotateY(${S.die.y}deg)`;
  await gWait(950); if (!$('#ldie')) return; $('#ldie').classList.remove('rolling');
  S.roll = r; const p = S.P[S.turn]; S.sixes = r === 6 ? S.sixes + 1 : 0;
  if (S.sixes === 3) { $('#lmsg').textContent = 'Three 6s in a row — turn lost.'; S.sixes = 0; S.roll = null; S.busy = false; await gWait(1000); return ludoNext(false); }
  const mv = ludoMovable(p, r);
  if (!mv.length) { $('#lmsg').textContent = `Rolled ${r}. No move possible.`; S.roll = null; S.busy = false; ludoUI(); await gWait(1000); return ludoNext(r === 6); }
  if (p.kind === 'c') { $('#lmsg').textContent = `Rolled ${r}.`; await gWait(450); return ludoMove(ludoAI(p, r, mv)); }
  S.busy = false;
  if (mv.length === 1) { $('#lmsg').textContent = `Rolled ${r}.`; ludoUI(); await gWait(350); return ludoMove(mv[0]); }
  $('#lmsg').textContent = `Rolled ${r}. Tap a glowing token.`; ludoUI(mv);
}
async function ludoMove(k) {
  const S = G.L, p = S.P[S.turn], r = S.roll; if (r == null || S.busy && p.kind === 'h' && false) return; S.roll = null; S.busy = true; ludoUI();
  const T = S.tok[p.i], from = T[k], to = from < 0 ? 0 : from + r, el = $(`#ltoks [data-p="${p.i}"][data-k="${k}"]`);
  const steps = from < 0 ? [0] : Array.from({ length: to - from }, (_, s) => from + s + 1);
  for (const st of steps) { if (!$('#ltoks')) return; T[k] = st; el.classList.remove('hop'); void el.offsetWidth; el.classList.add('hop'); ludoTokens(); await gWait(170); }
  el.classList.remove('hop');
  let extra = r === 6, msg = ''; const ti = lTrack(S, p, T[k]);
  if (ti != null && !S.g.safe.has(ti)) for (const q of S.P) { if (q.i === p.i) continue; const hits = S.tok[q.i].map((t, j) => lTrack(S, q, t) === ti ? j : -1).filter(j => j >= 0);
    if (hits.length === 1) { S.tok[q.i][hits[0]] = -1; const ce = $(`#ltoks [data-p="${q.i}"][data-k="${hits[0]}"]`); ce.classList.add('sent'); gLater(() => ce.classList.remove('sent'), 700); extra = true; msg = `Sent ${q.name}’s token back to base!`; } }
  ludoTokens();
  if (T[k] === S.g.F) { extra = true; msg = 'Token reached home!'; el.classList.add('homed'); gLater(() => el.classList.remove('homed'), 900); }
  if (T.every(t => t === S.g.F)) { ludoUI(); $('#lmsg').textContent = `${p.name} wins!`; return gameOver(`${esc(p.name)} wins Ludo!`, () => ludoStart(S.P.map(x => ({ i: x.i, kind: x.kind, name: x.name })))); }
  $('#lmsg').textContent = msg || (extra ? 'Rolled a 6 — roll again.' : '');
  S.busy = false; ludoUI(); await gWait(450); ludoNext(extra);
}
function ludoNext(same) {
  const S = G.L; if (!$('#ltoks')) return;
  if (!same) { S.turn = (S.turn + 1) % S.P.length; S.sixes = 0; }
  ludoUI(); const p = S.P[S.turn];
  if (p.kind === 'c') { if (!same) $('#lmsg').textContent = `${p.name} is rolling…`; gLater(ludoRoll, 650); }
  else if (!same) $('#lmsg').textContent = 'Your roll — tap the die.';
}
function ludoAI(p, r, mv) {
  const S = G.L, L = S.g.L; let best = mv[0], bs = -1e9; const opp = [];
  S.P.forEach(q => { if (q.i !== p.i) S.tok[q.i].forEach(t => { const x = lTrack(S, q, t); if (x != null) opp.push(x); }); });
  const danger = idx => idx != null && !S.g.safe.has(idx) && opp.some(o => { const d = (idx - o + L) % L; return d >= 1 && d <= 6; });
  mv.forEach(k => { const t = S.tok[p.i][k], nt = t < 0 ? 0 : t + r, idx = lTrack(S, p, nt); let s = nt;
    if (nt === S.g.F) s += 120; if (t < 0) s += 60; if (idx != null && !S.g.safe.has(idx) && opp.filter(o => o === idx).length === 1) s += 90;
    if (idx != null && S.g.safe.has(idx)) s += 25; if (nt > L - 2 && t <= L - 2) s += 30; if (danger(idx)) s -= 40; if (danger(lTrack(S, p, t))) s += 30;
    s += Math.random() * 4; if (s > bs) { bs = s; best = k; } });
  return best;
}

/* =================================================================== CHESS */
const CG = { K: '♚\uFE0E', Q: '♛\uFE0E', R: '♜\uFE0E', B: '♝\uFE0E', N: '♞\uFE0E', P: '♟\uFE0E' }, CV = { P: 100, N: 320, B: 330, R: 500, Q: 900, K: 0 };
const isW = p => p && p === p.toUpperCase(), colOf = p => p ? (isW(p) ? 'w' : 'b') : null;
function chessSetup() {
  const n = crewFirst();
  setupCard(`<h3>Game</h3><div class="stack gap12" style="margin-top:12px">${seg('mode', [['ai', 'Against the computer'], ['2p', 'Two players']], 'ai')}
   <div id="caiopts" class="stack gap12"><div class="row" style="gap:10px"><span class="s t2" style="width:90px">You play</span>${seg('side', [['w', 'White'], ['b', 'Black']], 'w')}</div><div class="row" style="gap:10px"><span class="s t2" style="width:90px">Level</span>${seg('lvl', [['1', 'Relaxed'], ['2', 'Medium'], ['3', 'Strong']], '2')}</div></div>
   <div id="c2opts" class="row hidden" style="gap:10px;flex-wrap:wrap"><label class="f">White<input id="cw" value="${esc(n[0] || 'White')}"></label><label class="f">Black<input id="cb" value="${esc(n[1] || 'Black')}"></label></div></div>`,
    () => { const m = segVal($('#gmain'), 'mode'); chessStart({ mode: m, side: segVal($('#gmain'), 'side'), lvl: +segVal($('#gmain'), 'lvl'), names: m === '2p' ? { w: $('#cw').value || 'White', b: $('#cb').value || 'Black' } : null }); });
  bindSeg($('#gmain'), (k, v) => { if (k === 'mode') { $('#caiopts').classList.toggle('hidden', v !== 'ai'); $('#c2opts').classList.toggle('hidden', v === 'ai'); } });
}
function chessInit() {
  const b = Array(64).fill(null), back = 'RNBQKBNR';
  for (let f = 0; f < 8; f++) { b[f] = back[f].toLowerCase(); b[8 + f] = 'p'; b[48 + f] = 'P'; b[56 + f] = back[f]; }
  return { b, turn: 'w', cas: { K: 1, Q: 1, k: 1, q: 1 }, ep: -1, half: 0 };
}
function attacked(b, sq, by) {
  const r = sq >> 3, f = sq & 7, at = (rr, ff) => rr >= 0 && rr < 8 && ff >= 0 && ff < 8 ? b[rr * 8 + ff] : undefined;
  const mine = p => p && colOf(p) === by;
  const pr = by === 'w' ? r + 1 : r - 1;
  for (const df of [-1, 1]) { const p = at(pr, f + df); if (mine(p) && p.toUpperCase() === 'P') return true; }
  for (const [dr, df] of [[1, 2], [2, 1], [-1, 2], [-2, 1], [1, -2], [2, -1], [-1, -2], [-2, -1]]) { const p = at(r + dr, f + df); if (mine(p) && p.toUpperCase() === 'N') return true; }
  for (const [dr, df] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]]) {
    let rr = r + dr, ff = f + df, k = 1;
    while (rr >= 0 && rr < 8 && ff >= 0 && ff < 8) {
      const p = b[rr * 8 + ff];
      if (p) { if (mine(p)) { const u = p.toUpperCase(), diag = dr && df; if (u === 'Q' || (u === 'K' && k === 1) || (diag ? u === 'B' : u === 'R')) return true; } break; }
      rr += dr; ff += df; k++;
    }
  }
  return false;
}
function pseudo(s) {
  const b = s.b, me = s.turn, M = [];
  for (let i = 0; i < 64; i++) {
    const p = b[i]; if (!p || colOf(p) !== me) continue; const u = p.toUpperCase(), r = i >> 3, f = i & 7;
    const add = (t, x = {}) => M.push({ f: i, t, p, cap: b[t], ...x });
    if (u === 'P') {
      const d = me === 'w' ? -1 : 1, r1 = r + d, last = me === 'w' ? 0 : 7, startR = me === 'w' ? 6 : 1;
      const push = (t, x = {}) => { if ((t >> 3) === last) ['Q', 'R', 'B', 'N'].forEach(q => add(t, { ...x, promo: me === 'w' ? q : q.toLowerCase() })); else add(t, x); };
      if (r1 >= 0 && r1 < 8 && !b[r1 * 8 + f]) { push(r1 * 8 + f); if (r === startR && !b[(r + 2 * d) * 8 + f]) add((r + 2 * d) * 8 + f, { dbl: 1 }); }
      for (const df of [-1, 1]) { const ff = f + df; if (ff < 0 || ff > 7 || r1 < 0 || r1 > 7) continue; const t = r1 * 8 + ff; if (b[t] && colOf(b[t]) !== me) push(t); else if (t === s.ep) add(t, { ep: 1, cap: me === 'w' ? 'p' : 'P' }); }
    } else if (u === 'N' || u === 'K') {
      const D = u === 'N' ? [[1, 2], [2, 1], [-1, 2], [-2, 1], [1, -2], [2, -1], [-1, -2], [-2, -1]] : [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];
      for (const [dr, df] of D) { const rr = r + dr, ff = f + df; if (rr < 0 || rr > 7 || ff < 0 || ff > 7) continue; const t = rr * 8 + ff; if (!b[t] || colOf(b[t]) !== me) add(t); }
      if (u === 'K') {
        const op = me === 'w' ? 'b' : 'w', home = me === 'w' ? 60 : 4, kk = me === 'w' ? 'K' : 'k', qq = me === 'w' ? 'Q' : 'q';
        if (i === home && !attacked(b, home, op)) {
          if (s.cas[kk] && !b[home + 1] && !b[home + 2] && b[home + 3] && b[home + 3].toUpperCase() === 'R' && !attacked(b, home + 1, op) && !attacked(b, home + 2, op)) add(home + 2, { castle: 'K' });
          if (s.cas[qq] && !b[home - 1] && !b[home - 2] && !b[home - 3] && b[home - 4] && b[home - 4].toUpperCase() === 'R' && !attacked(b, home - 1, op) && !attacked(b, home - 2, op)) add(home - 2, { castle: 'Q' });
        }
      }
    } else {
      const D = u === 'B' ? [[1, 1], [1, -1], [-1, 1], [-1, -1]] : u === 'R' ? [[1, 0], [-1, 0], [0, 1], [0, -1]] : [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];
      for (const [dr, df] of D) { let rr = r + dr, ff = f + df; while (rr >= 0 && rr < 8 && ff >= 0 && ff < 8) { const t = rr * 8 + ff; if (b[t]) { if (colOf(b[t]) !== me) add(t); break; } add(t); rr += dr; ff += df; } }
    }
  }
  return M;
}
function cmake(s, m) {
  const b = s.b.slice(); b[m.t] = m.promo || m.p; b[m.f] = null;
  if (m.ep) b[m.t + (s.turn === 'w' ? 8 : -8)] = null;
  if (m.castle) { const home = s.turn === 'w' ? 60 : 4; if (m.castle === 'K') { b[home + 1] = b[home + 3]; b[home + 3] = null; } else { b[home - 1] = b[home - 4]; b[home - 4] = null; } }
  const cas = { ...s.cas };
  if (m.p === 'K') cas.K = cas.Q = 0; if (m.p === 'k') cas.k = cas.q = 0;
  for (const [sq, k] of [[63, 'K'], [56, 'Q'], [7, 'k'], [0, 'q']]) if (m.f === sq || m.t === sq) cas[k] = 0;
  return { b, turn: s.turn === 'w' ? 'b' : 'w', cas, ep: m.dbl ? (m.f + m.t) / 2 : -1, half: m.p.toUpperCase() === 'P' || m.cap ? 0 : s.half + 1 };
}
const kingSq = (b, c) => b.indexOf(c === 'w' ? 'K' : 'k');
function legal(s) { return pseudo(s).filter(m => { const n = cmake(s, m); return !attacked(n.b, kingSq(n.b, s.turn), n.turn); }); }
const inCheck = s => attacked(s.b, kingSq(s.b, s.turn), s.turn === 'w' ? 'b' : 'w');
function insufficient(b) { const p = b.filter(x => x && x.toUpperCase() !== 'K'); return !p.length || (p.length === 1 && 'NB'.includes(p[0].toUpperCase())); }
function ceval(b) { let s = 0; for (let i = 0; i < 64; i++) { const p = b[i]; if (!p) continue; const u = p.toUpperCase(), w = isW(p), r = i >> 3, f = i & 7; let v = CV[u]; const cen = 3.5 - Math.max(Math.abs(3.5 - r), Math.abs(3.5 - f));
  if (u === 'N' || u === 'B') v += cen * 8; if (u === 'P') v += (w ? 6 - r : r - 1) * 8 + (f > 1 && f < 6 ? cen * 4 : 0); if (u === 'Q') v += cen * 2; if (u === 'K') v += (w ? r === 7 : r === 0) && (f < 3 || f > 5) ? 20 : 0; s += w ? v : -v; } return s; }
function search(s, d, a, bt) {
  const ms = legal(s); if (!ms.length) return inCheck(s) ? -100000 - d : 0;
  if (d === 0) { const e = ceval(s.b); return s.turn === 'w' ? e : -e; }
  ms.sort((x, y) => (y.cap ? CV[y.cap.toUpperCase()] * 10 - CV[y.p.toUpperCase()] : 0) + (y.promo ? 800 : 0) - ((x.cap ? CV[x.cap.toUpperCase()] * 10 - CV[x.p.toUpperCase()] : 0) + (x.promo ? 800 : 0)));
  for (const m of ms) { const v = -search(cmake(s, m), d - 1, -bt, -a); if (v > a) a = v; if (a >= bt) break; } return a;
}
function chessAI(s, lvl) {
  const ms = legal(s); let best = [], bv = -Infinity; const d = lvl === 1 ? 1 : lvl === 2 ? 2 : 3;
  for (const m of ms) { const v = -search(cmake(s, m), d - 1, -Infinity, Infinity) + (lvl === 1 ? Math.random() * 60 : Math.random() * 6); if (v > bv) { bv = v; best = [m]; } }
  return best[0];
}
const sqName = i => 'abcdefgh'[i & 7] + (8 - (i >> 3));
function chessStart(o) {
  const C = G.C = { ...o, s: chessInit(), hist: [], moves: [], sel: -1, last: null, over: false, flip: o.mode === 'ai' && o.side === 'b' };
  $('#gmain').innerHTML = `<div class="chess-wrap"><div class="cboard" id="cboard"></div><div class="stack gap12 ludo-side"><div class="card"><div id="cstat"></div><div class="row" style="margin-top:14px;flex-wrap:wrap"><button class="btn sm" id="cundo">Undo</button><button class="btn sm" id="cflip">Flip board</button><button class="btn sm ghost" id="cnew">New game</button></div></div>
   <div class="card"><h4>Captured</h4><div id="ccap" style="margin-top:6px;font-size:22px;line-height:1.3"></div></div><div class="card"><h4>Moves</h4><div id="cmoves" class="s t2 cmoves"></div></div></div></div>`;
  $('#cundo').onclick = () => { if (C.thinking || C.anim || !C.hist.length) return; const n = C.mode === 'ai' && C.hist.length >= 2 && C.s.turn === (C.side) ? 2 : 1; for (let k = 0; k < n && C.hist.length; k++) { C.s = C.hist.pop(); C.moves.pop(); } C.over = false; C.shown = 0; C.sel = -1; C.last = null; chessDraw(); };
  $('#cflip').onclick = () => { C.flip = !C.flip; chessDraw(); }; $('#cnew').onclick = () => chessSetup();
  chessDraw(); chessMaybeAI();
}
const chessName = c => G.C.mode === 'ai' ? (c === G.C.side ? 'You' : 'Computer') : G.C.names[c];
function chessDraw() {
  const C = G.C, s = C.s, B = $('#cboard'); if (!B) return; const L = C.sel >= 0 ? legal(s).filter(m => m.f === C.sel) : [];
  const ck = inCheck(s) ? kingSq(s.b, s.turn) : -1; let h = '';
  for (let k = 0; k < 64; k++) {
    const i = C.flip ? 63 - k : k, p = s.b[i], r = i >> 3, f = i & 7, dark = (r + f) % 2 === 1, tgt = L.find(m => m.t === i);
    h += `<button class="csq ${dark ? 'dk' : 'lt'} ${C.sel === i ? 'sel' : ''} ${C.last && (C.last.f === i || C.last.t === i) ? 'last' : ''} ${ck === i ? 'chk' : ''} ${tgt ? (p ? 'cap' : 'tgt') : ''}" data-sq="${i}" aria-label="${sqName(i)}${p ? ' ' + (isW(p) ? 'white ' : 'black ') + p.toUpperCase() : ''}">${p ? `<span class="pc ${isW(p) ? 'w' : 'b'}">${CG[p.toUpperCase()]}</span>` : ''}${(C.flip ? f === 7 : f === 0) ? `<i class="rk">${8 - r}</i>` : ''}${(C.flip ? r === 0 : r === 7) ? `<i class="fl">${'abcdefgh'[f]}</i>` : ''}</button>`;
  }
  B.innerHTML = h; B.querySelectorAll('.csq').forEach(b => b.onclick = () => chessClick(+b.dataset.sq));
  const ms = legal(s), chk = inCheck(s); let st;
  if (!ms.length) { C.over = true; st = chk ? `<b>Checkmate.</b> ${esc(chessName(s.turn === 'w' ? 'b' : 'w'))} win${chessName(s.turn === 'w' ? 'b' : 'w') === 'You' ? '' : 's'}.` : '<b>Stalemate.</b> Draw.'; }
  else if (s.half >= 100) { C.over = true; st = '<b>Draw</b> by the 50-move rule.'; }
  else if (insufficient(s.b)) { C.over = true; st = '<b>Draw</b> — not enough material to mate.'; }
  else st = `<span class="row" style="gap:10px"><span class="dot" style="background:${s.turn === 'w' ? '#f4f0ff' : '#2a2350'};border:1px solid var(--line2);width:14px;height:14px"></span><b style="font:600 18px var(--hf)">${esc(chessName(s.turn))}</b>${C.thinking ? '<span class="pill">thinking…</span>' : chk ? '<span class="pill" style="color:#ff9a9a">check</span>' : '<span class="pill">to move</span>'}</span>`;
  $('#cstat').innerHTML = st;
  const capW = [], capB = []; C.moves.forEach(m => { if (m.cap) (isW(m.cap) ? capW : capB).push(m.cap); });
  $('#ccap').innerHTML = `<div><span class="pc w">${capW.map(p => CG[p.toUpperCase()]).join('')}</span></div><div><span class="pc b">${capB.map(p => CG[p.toUpperCase()]).join('')}</span></div>`;
  $('#cmoves').innerHTML = C.moves.map((m, k) => `${k % 2 === 0 ? `<b>${k / 2 + 1}.</b> ` : ''}${m.castle ? (m.castle === 'K' ? 'O-O' : 'O-O-O') : (m.p.toUpperCase() === 'P' ? '' : m.p.toUpperCase()) + sqName(m.f) + (m.cap ? '×' : '–') + sqName(m.t) + (m.promo ? '=' + m.promo.toUpperCase() : '')}`).join(' ') || '<span class="t3">No moves yet.</span>';
  const mv = $('#cmoves'); mv.scrollTop = mv.scrollHeight;
  if (C.over && !C.shown) { C.shown = 1; gLater(() => gameOver($('#cstat').textContent, () => chessStart({ mode: C.mode, side: C.side, lvl: C.lvl, names: C.names })), 500); }
}
function chessClick(i) {
  const C = G.C, s = C.s; if (C.over || C.thinking || C.anim) return; if (C.mode === 'ai' && s.turn !== C.side) return;
  const p = s.b[i];
  if (C.sel >= 0) { const ms = legal(s).filter(m => m.f === C.sel && m.t === i); if (ms.length) { const m = ms.find(x => !x.promo || x.promo.toUpperCase() === 'Q'); return chessPlay(m, ms.length > 1); } }
  C.sel = p && colOf(p) === s.turn && C.sel !== i ? i : -1; chessDraw();
}
function chessPlay(m, askPromo) {
  const C = G.C;
  const go = mm => { C.sel = -1; chessAnim(mm, () => { C.hist.push(C.s); C.moves.push(mm); C.s = cmake(C.s, mm); C.last = mm; chessDraw(); chessMaybeAI(); }); };
  if (askPromo) {
    const w = isW(m.p); modal(`<h3>Promote pawn to</h3><div class="row" style="margin-top:14px;justify-content:center">${['Q', 'R', 'B', 'N'].map(q => `<button class="btn" data-pr="${q}" style="font-size:30px;min-width:64px"><span class="pc ${w ? 'w' : 'b'}">${CG[q]}</span></button>`).join('')}</div>`);
    $$('[data-pr]').forEach(b => b.onclick = () => { closeModal(); go({ ...m, promo: w ? b.dataset.pr : b.dataset.pr.toLowerCase() }); }); return;
  }
  go(m);
}
function chessMaybeAI() {
  const C = G.C; if (C.mode !== 'ai' || C.over || C.s.turn === C.side) return;
  C.thinking = true; chessDraw();
  gLater(() => { const m = chessAI(C.s, C.lvl); C.thinking = false; if (m && G.C === C) { chessDraw(); chessAnim(m, () => { C.hist.push(C.s); C.moves.push(m); C.s = cmake(C.s, m); C.last = m; chessDraw(); }); } else chessDraw(); }, 350);
}

/* =================================================================== CONNECT FOUR */
function c4Setup() {
  const n = crewFirst();
  setupCard(`<h3>Game</h3><div class="stack gap12" style="margin-top:12px">${seg('mode', [['ai', 'Against the computer'], ['2p', 'Two players']], 'ai')}
   <div id="c4ai" class="row" style="gap:10px"><span class="s t2" style="width:90px">Level</span>${seg('lvl', [['2', 'Easy'], ['4', 'Medium'], ['6', 'Hard']], '4')}</div>
   <div id="c42" class="row hidden" style="gap:10px;flex-wrap:wrap"><label class="f">Red<input id="c4a" value="${esc(n[0] || 'Red')}"></label><label class="f">Yellow<input id="c4b" value="${esc(n[1] || 'Yellow')}"></label></div></div>`,
    () => { const m = segVal($('#gmain'), 'mode'); c4Start({ mode: m, lvl: +segVal($('#gmain'), 'lvl'), names: m === 'ai' ? ['You', 'Computer'] : [$('#c4a').value || 'Red', $('#c4b').value || 'Yellow'] }); });
  bindSeg($('#gmain'), (k, v) => { if (k === 'mode') { $('#c4ai').classList.toggle('hidden', v !== 'ai'); $('#c42').classList.toggle('hidden', v === 'ai'); } });
}
const C4W = (() => { const w = []; for (let r = 0; r < 6; r++) for (let c = 0; c < 7; c++) for (const [dr, dc] of [[0, 1], [1, 0], [1, 1], [1, -1]]) { const l = []; for (let k = 0; k < 4; k++) { const rr = r + dr * k, cc = c + dc * k; if (rr < 0 || rr > 5 || cc < 0 || cc > 6) break; l.push(rr * 7 + cc); } if (l.length === 4) w.push(l); } return w; })();
const c4Win = b => { for (const l of C4W) { const v = b[l[0]]; if (v && l.every(i => b[i] === v)) return l; } return null; };
const c4Drop = (b, c) => { for (let r = 5; r >= 0; r--) if (!b[r * 7 + c]) return r * 7 + c; return -1; };
function c4Score(b, me) { let s = 0; const op = 3 - me; for (const l of C4W) { const m = l.filter(i => b[i] === me).length, o = l.filter(i => b[i] === op).length; if (o === 0) s += [0, 1, 6, 40, 0][m]; if (m === 0) s -= [0, 1, 7, 60, 0][o]; } for (let r = 0; r < 6; r++) if (b[r * 7 + 3] === me) s += 4; return s; }
function c4Neg(b, d, a, bt, me) {
  const w = c4Win(b); if (w) return -100000 - d; if (b.every(x => x)) return 0; if (d === 0) return c4Score(b, me);
  for (const c of [3, 2, 4, 1, 5, 0, 6]) { const i = c4Drop(b, c); if (i < 0) continue; b[i] = me; const v = -c4Neg(b, d - 1, -bt, -a, 3 - me); b[i] = 0; if (v > a) a = v; if (a >= bt) break; }
  return a;
}
function c4Start(o) {
  const S = G.F = { ...o, b: Array(42).fill(0), turn: 1, over: false, score: G.F && G.F.names + '' === o.names + '' ? G.F.score : [0, 0] };
  $('#gmain').innerHTML = `<div class="chess-wrap"><div><div class="c4" id="c4"></div></div><div class="stack gap12 ludo-side"><div class="card"><div id="c4s"></div><div class="row" style="margin-top:14px"><button class="btn sm" id="c4n">New round</button></div></div><div class="card"><h4>Score</h4><div id="c4sc" class="stack gap4" style="margin-top:8px"></div></div></div></div>`;
  $('#c4n').onclick = () => c4Start(o); c4Draw();
}
function c4Draw(win) {
  const S = G.F, B = $('#c4'); if (!B) return;
  B.innerHTML = Array.from({ length: 7 }, (_, c) => `<button class="c4col" data-c="${c}" aria-label="Column ${c + 1}">${Array.from({ length: 6 }, (_, r) => { const v = S.b[r * 7 + c]; return `<span class="c4h ${v ? 'p' + v : ''} ${win && win.includes(r * 7 + c) ? 'win' : ''}"></span>`; }).join('')}</button>`).join('');
  B.querySelectorAll('.c4col').forEach(b => b.onclick = () => c4Play(+b.dataset.c));
  const col = ['', '#ef5b5b', '#f5b941'];
  $('#c4s').innerHTML = S.over ? `<b>${S.over}</b>` : `<span class="row" style="gap:10px"><span class="dot" style="background:${col[S.turn]};width:14px;height:14px"></span><b style="font:600 18px var(--hf)">${esc(S.names[S.turn - 1])}</b><span class="pill">${S.think ? 'thinking…' : 'to play'}</span></span>`;
  $('#c4sc').innerHTML = S.names.map((n, k) => `<div class="row between"><span class="row" style="gap:8px"><span class="dot" style="background:${col[k + 1]}"></span>${esc(n)}</span><b class="num">${S.score[k]}</b></div>`).join('');
}
function c4Play(c, ai) {
  const S = G.F; if (S.over || S.think || (S.mode === 'ai' && S.turn === 2 && !ai)) return;
  const i = c4Drop(S.b, c); if (i < 0) return; S.b[i] = S.turn;
  const w = c4Win(S.b);
  if (w) { S.score[S.turn - 1]++; S.over = `${S.names[S.turn - 1]} win${S.names[S.turn - 1] === 'You' ? '' : 's'}!`; c4Draw(w); return gLater(() => gameOver(esc(S.over), () => c4Start({ mode: S.mode, lvl: S.lvl, names: S.names })), 700); }
  if (S.b.every(x => x)) { S.over = 'Draw — the board is full.'; return c4Draw(); }
  S.turn = 3 - S.turn; c4Draw();
  if (S.mode === 'ai' && S.turn === 2) {
    S.think = true; c4Draw();
    gLater(() => { let best = 3, bv = -Infinity; for (const cc of [3, 2, 4, 1, 5, 0, 6]) { const j = c4Drop(S.b, cc); if (j < 0) continue; S.b[j] = 2; const v = -c4Neg(S.b, S.lvl - 1, -Infinity, Infinity, 1) + Math.random() * (S.lvl <= 2 ? 30 : 2); S.b[j] = 0; if (v > bv) { bv = v; best = cc; } } S.think = false; c4Play(best, true); }, 300);
  }
}

/* smooth piece movement: the piece glides to its square (rook too when castling), a captured piece fades */
function chessAnim(m, done) {
  const C = G.C; C.anim = true; const sq = i => $(`#cboard [data-sq="${i}"]`);
  const glide = (f, t) => { const a = sq(f), b = sq(t); if (!a || !b) return; const pc = a.querySelector('.pc'); if (!pc) return; const ra = a.getBoundingClientRect(), rb = b.getBoundingClientRect();
    a.style.zIndex = 5; pc.style.transition = 'transform .32s cubic-bezier(.22,1,.36,1), filter .32s'; pc.style.filter = 'drop-shadow(0 8px 10px rgba(0,0,0,.45))'; requestAnimationFrame(() => pc.style.transform = `translate(${rb.left - ra.left}px,${rb.top - ra.top}px) scale(1.06)`); };
  const capAt = m.ep ? m.t + (C.s.turn === 'w' ? 8 : -8) : m.cap ? m.t : -1;
  if (capAt >= 0) { const cp = sq(capAt) && sq(capAt).querySelector('.pc'); if (cp) { cp.style.transition = 'opacity .26s, transform .26s'; cp.style.opacity = 0; cp.style.transform = 'scale(.55)'; } }
  glide(m.f, m.t);
  if (m.castle) { const home = C.s.turn === 'w' ? 60 : 4; m.castle === 'K' ? glide(home + 3, home + 1) : glide(home - 4, home - 1); }
  gLater(() => { C.anim = false; done(); }, 340);
}

/* =================================================================== MEMORY (scored)
   Match = 100 points; every extra match in an unbroken streak adds +50 (combo).
   Solo: each miss costs 10 points; finishing adds a time bonus. Best solo score is kept per board size. */
const MEMI = ['🚀', '🪐', '🌙', '⭐', '☄️', '🛰️', '🌍', '☀️', '🌌', '🔭', '👩‍🚀', '👽'];
function memSetup() {
  const n = crewFirst();
  setupCard(`<h3>Game</h3><div class="stack gap12" style="margin-top:12px"><div class="row" style="gap:10px"><span class="s t2" style="width:90px">Players</span>${seg('np', [['1', '1'], ['2', '2'], ['3', '3'], ['4', '4']], '1')}</div>
   <div class="row" style="gap:10px"><span class="s t2" style="width:90px">Cards</span>${seg('sz', [['16', '16 cards'], ['24', '24 cards']], '16')}</div>
   <div id="mnames" class="row" style="gap:10px;flex-wrap:wrap">${[0, 1, 2, 3].map(i => `<label class="f ${i ? 'hidden' : ''}" data-mi="${i}">Player ${i + 1}<input value="${esc(n[i] || 'Player ' + (i + 1))}"></label>`).join('')}</div>
   <div class="sub s t2"><b>Scoring.</b> A pair is worth 100. Each further pair in a row adds a +50 combo. Solo games lose 10 per miss and gain a time bonus at the end.</div></div>`,
    () => { const np = +segVal($('#gmain'), 'np'); memStart({ size: +segVal($('#gmain'), 'sz'), names: [0, 1, 2, 3].slice(0, np).map(i => $(`[data-mi="${i}"] input`).value || 'Player ' + (i + 1)) }); });
  bindSeg($('#gmain'), (k, v) => { if (k === 'np') $$('[data-mi]').forEach(l => l.classList.toggle('hidden', +l.dataset.mi >= +v)); });
}
function memStart(o) {
  const pairs = MEMI.slice().sort(() => Math.random() - .5).slice(0, o.size / 2), deck = pairs.concat(pairs).sort(() => Math.random() - .5);
  const S = G.M = { ...o, deck, up: [], got: Array(deck.length).fill(-1), turn: 0, pts: o.names.map(() => 0), pairs: o.names.map(() => 0), streak: 0, best: o.names.map(() => 0), moves: 0, miss: 0, t0: Date.now(), lock: false };
  $('#gmain').innerHTML = `<div class="chess-wrap"><div class="mem ${o.size === 24 ? 'm24' : ''}" id="mem"></div><div class="stack gap12 ludo-side"><div class="card"><div id="mst"></div><div class="row" style="margin-top:14px"><button class="btn sm" id="mnew">New game</button></div></div>
   <div class="card"><h4>Scoreboard</h4><div id="msc" class="stack gap8" style="margin-top:10px"></div></div>${o.names.length === 1 ? `<div class="card"><h4>Best score</h4><p class="num" style="font-size:22px;margin-top:6px" id="mbest">${lsGet('votv-mem-' + o.size, null) ?? '—'}</p></div>` : ''}</div></div>`;
  $('#mnew').onclick = () => memStart(o);
  $('#mem').innerHTML = deck.map((e, i) => `<button class="mcard2" data-i="${i}" aria-label="Card ${i + 1}"><span class="mf mb"></span><span class="mf mfr">${e}</span></button>`).join('');
  $$('#mem .mcard2').forEach(b => b.onclick = () => memFlip(+b.dataset.i));
  G.tick = setInterval(memInfo, 1000); memInfo();
}
function memInfo() {
  const S = G.M; if (!$('#mst')) return clearInterval(G.tick); const sec = Math.floor((Date.now() - S.t0) / 1000), solo = S.names.length === 1;
  $('#mst').innerHTML = `<div class="row between"><b style="font:500 18px var(--hf)">${solo ? 'Solo' : esc(S.names[S.turn]) + ' <span class="pill">to flip</span>'}</b>${S.streak > 1 ? `<span class="combo">Combo ×${S.streak}</span>` : ''}</div>
   <div class="kpis" style="margin-top:12px"><div class="kpi"><span>Moves</span><b>${S.moves}</b></div><div class="kpi"><span>Time</span><b>${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}</b></div><div class="kpi"><span>Pairs left</span><b>${S.got.filter(x => x < 0).length / 2}</b></div></div>`;
  const lead = Math.max(...S.pts);
  $('#msc').innerHTML = S.names.map((n, k) => `<div class="lprow ${k === S.turn && !solo ? 'on' : ''}"><span class="grow">${esc(n)}${S.pts[k] === lead && lead > 0 && !solo ? ' 👑' : ''}<br><span class="xs t3">${S.pairs[k]} pairs · best streak ${S.best[k]}</span></span><b class="num" style="font-size:20px">${S.pts[k]}</b></div>`).join('');
}
function memPop(i, txt, good) { const c = $(`#mem [data-i="${i}"]`); if (!c) return; const s = document.createElement('span'); s.className = 'mpop' + (good ? '' : ' bad'); s.textContent = txt; c.appendChild(s); gLater(() => s.remove(), 1100); }
function memFlip(i) {
  const S = G.M; if (S.lock || S.got[i] >= 0 || S.up.includes(i)) return;
  S.up.push(i); $(`#mem [data-i="${i}"]`).classList.add('up');
  if (S.up.length < 2) return; S.moves++; const [a, b] = S.up, solo = S.names.length === 1;
  if (S.deck[a] === S.deck[b]) {
    S.streak++; const gain = 100 + 50 * (S.streak - 1); S.pts[S.turn] += gain; S.pairs[S.turn]++; S.best[S.turn] = Math.max(S.best[S.turn], S.streak);
    S.got[a] = S.got[b] = S.turn; S.up = []; [a, b].forEach(k => $(`#mem [data-i="${k}"]`).classList.add('got')); memPop(b, '+' + gain + (S.streak > 1 ? ` combo ×${S.streak}` : ''), true); memInfo();
    if (S.got.every(x => x >= 0)) {
      clearInterval(G.tick); const sec = Math.floor((Date.now() - S.t0) / 1000);
      if (solo) { const bonus = Math.max(0, S.size * 8 - sec) * 5, total = Math.max(0, S.pts[0] + bonus), prev = lsGet('votv-mem-' + S.size, null), rec = prev == null || total > prev; if (rec) lsSet('votv-mem-' + S.size, total);
        gLater(() => gameOver(`${total} points${rec ? ' — new best!' : ''}`, () => memStart({ size: S.size, names: S.names }), `<div class="mbreak"><span>Pairs & combos</span><b>${S.pts[0] + S.miss * 10}</b><span>Misses (${S.miss} × −10)</span><b>−${S.miss * 10}</b><span>Time bonus (${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')})</span><b>+${bonus}</b></div>`), 700); }
      else { const best = Math.max(...S.pts), win = S.names.filter((n, k) => S.pts[k] === best);
        gLater(() => gameOver(win.length > 1 ? `Tie: ${esc(win.join(' & '))}` : `${esc(win[0])} wins with ${best} points!`, () => memStart({ size: S.size, names: S.names }), `<div class="mbreak">${S.names.map((n, k) => `<span>${esc(n)}</span><b>${S.pts[k]}</b>`).join('')}</div>`), 700); }
    }
  } else {
    S.lock = true; S.streak = 0; if (solo) { S.miss++; S.pts[0] = Math.max(0, S.pts[0] - 10); memPop(b, '−10', false); }
    [a, b].forEach(k => $(`#mem [data-i="${k}"]`).classList.add('nope'));
    gLater(() => { [a, b].forEach(k => { const c = $(`#mem [data-i="${k}"]`); c && c.classList.remove('up', 'nope'); }); S.up = []; S.lock = false; if (!solo) S.turn = (S.turn + 1) % S.names.length; memInfo(); }, 900);
    memInfo();
  }
}

/* =================================================================== SUDOKU
   Pencil notes, undo, auto-clearing notes, remaining-count number pad, mistake counter with shake,
   unit-complete glow, pause, hints, keyboard play and best time per difficulty. */
const SLV = { 40: 'Easy', 32: 'Medium', 26: 'Hard' };
function sudSetup() {
  const bt = k => { const b = lsGet('votv-sud-' + k, null); return b ? ` · best ${Math.floor(b / 60)}:${String(b % 60).padStart(2, '0')}` : ''; };
  setupCard(`<h3>Difficulty</h3><div style="margin-top:12px">${seg('lv', [['40', 'Easy' + bt(40)], ['32', 'Medium' + bt(32)], ['26', 'Hard' + bt(26)]], '32')}</div>
   <div class="sub s t2" style="margin-top:14px"><b>Keys:</b> 1–9 enter · <b>N</b> notes on/off · Shift+1–9 note · arrows move · Backspace erase · Ctrl+Z undo · <b>P</b> pause</div>`, () => sudStart(+segVal($('#gmain'), 'lv')));
}
const sOk = (g, i, v) => { const r = Math.floor(i / 9), c = i % 9, br = r - r % 3, bc = c - c % 3; for (let k = 0; k < 9; k++) { if (g[r * 9 + k] === v || g[k * 9 + c] === v || g[(br + Math.floor(k / 3)) * 9 + bc + k % 3] === v) return false; } return true; };
function sFill(g) { const i = g.indexOf(0); if (i < 0) return true; for (const v of [1, 2, 3, 4, 5, 6, 7, 8, 9].sort(() => Math.random() - .5)) if (sOk(g, i, v)) { g[i] = v; if (sFill(g)) return true; g[i] = 0; } return false; }
function sCount(g, lim = 2) { let i = -1, bc = 10; for (let k = 0; k < 81; k++) if (!g[k]) { let n = 0; for (let v = 1; v <= 9; v++) if (sOk(g, k, v)) n++; if (n < bc) { bc = n; i = k; if (n < 2) break; } } if (i < 0) return 1; if (bc === 0) return 0; let n = 0; for (let v = 1; v <= 9 && n < lim; v++) if (sOk(g, i, v)) { g[i] = v; n += sCount(g, lim - n); g[i] = 0; } return n; }
const sPeers = i => { const r = Math.floor(i / 9), c = i % 9, br = r - r % 3, bc = c - c % 3, s = new Set(); for (let k = 0; k < 9; k++) { s.add(r * 9 + k); s.add(k * 9 + c); s.add((br + Math.floor(k / 3)) * 9 + bc + k % 3); } s.delete(i); return [...s]; };
const sUnits = i => { const r = Math.floor(i / 9), c = i % 9, br = r - r % 3, bc = c - c % 3; return [[...Array(9).keys()].map(k => r * 9 + k), [...Array(9).keys()].map(k => k * 9 + c), [...Array(9).keys()].map(k => (br + Math.floor(k / 3)) * 9 + bc + k % 3)]; };
function sudStart(clues) {
  const sol = Array(81).fill(0); sFill(sol); const puz = sol.slice();
  for (const i of [...Array(81).keys()].sort(() => Math.random() - .5)) { if (puz.filter(x => x).length <= clues) break; const v = puz[i]; puz[i] = 0; if (sCount(puz.slice()) !== 1) puz[i] = v; }
  const S = G.S = { sol, puz, g: puz.slice(), notes: Array(81).fill(0), sel: puz.indexOf(0), noteMode: false, check: true, hist: [], mist: 0, hints: 0, clues, el: 0, run: true, done: false };
  $('#gmain').innerHTML = `<div class="sud-wrap"><div class="sudbox"><div class="sud" id="sud" tabindex="0" aria-label="Sudoku board"></div><div class="spause hidden" id="spause"><b>Paused</b><button class="btn p" id="sres">Resume</button></div></div>
   <div class="stack gap12 ludo-side"><div class="card"><div class="row between"><span class="pill">${SLV[clues]}</span><span class="num" style="font-size:22px" id="stime">0:00</span><button class="iconbtn" id="spz" title="Pause (P)">${ICON('<path d="M9 5v14M15 5v14"/>')}</button></div>
     <div class="kpis" style="margin-top:12px"><div class="kpi"><span>Cells left</span><b id="sleft">–</b></div><div class="kpi"><span>Mistakes</span><b id="smist">0</b></div><div class="kpi"><span>Hints</span><b id="shn">0</b></div></div></div>
    <div class="card"><div class="pad2" id="spad">${[1, 2, 3, 4, 5, 6, 7, 8, 9].map(n => `<button class="padk" data-n="${n}"><b>${n}</b><small></small></button>`).join('')}</div>
     <div class="stools"><button class="btn sm" id="sundo">${ICON('<path d="M9 14L4 9l5-5"/><path d="M4 9h10a6 6 0 010 12h-3"/>')}Undo</button><button class="btn sm" id="sera">${ICON('<path d="M20 20H9L4 15l9-9 7 7-6 6"/>')}Erase</button><button class="btn sm" id="snote" aria-pressed="false">${ICON('<path d="M4 20l4-1 11-11-3-3L5 16z"/>')}Notes <span class="xs" id="snst">off</span></button><button class="btn sm" id="shint">${ICON('<path d="M9 18h6M10 21h4M12 3a6 6 0 00-4 10.5c.6.6 1 1.4 1 2.5h6c0-1.1.4-1.9 1-2.5A6 6 0 0012 3z"/>')}Hint</button></div>
     <div class="row between" style="margin-top:12px"><label class="row s" style="gap:8px"><input type="checkbox" id="schk" checked style="width:18px;min-height:18px">Show mistakes</label><button class="btn ghost sm" id="snew">New puzzle</button></div></div></div></div>`;
  $$('#spad [data-n]').forEach(b => b.onclick = () => sudInput(+b.dataset.n));
  $('#schk').onchange = e => { S.check = e.target.checked; sudDraw(); };
  $('#sundo').onclick = sudUndo; $('#sera').onclick = () => sudInput(0); $('#snote').onclick = () => { S.noteMode = !S.noteMode; sudDraw(); };
  $('#shint').onclick = sudHint; $('#snew').onclick = sudSetup; $('#spz').onclick = sudPause; $('#sres').onclick = sudPause;
  document.addEventListener('keydown', sudKey);
  G.tick = setInterval(() => { if (!$('#stime')) return clearInterval(G.tick); if (S.run && !S.done) { S.el++; sudTime(); } }, 1000);
  sudDraw(); $('#sud').focus({ preventScroll: true });
}
const sudTime = () => { const s = G.S.el, e = $('#stime'); if (e) e.textContent = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };
function sudPause() { const S = G.S; if (S.done) return; S.run = !S.run; $('#spause').classList.toggle('hidden', S.run); $('#sud').classList.toggle('blur', !S.run); }
function sudKey(e) {
  const S = G.S; if (G.cur !== 'sudoku' || !S || !$('#sud') || e.target.closest('input,textarea') || $('#modal').classList.contains('on')) return;
  const k = e.key;
  if ((e.ctrlKey || e.metaKey) && k.toLowerCase() === 'z') { e.preventDefault(); return sudUndo(); }
  if (k === 'p' || k === 'P') return sudPause(); if (!S.run) return;
  const dig = /^Digit([1-9])$/.exec(e.code);
  if (dig) { e.preventDefault(); return sudInput(+dig[1], e.shiftKey); }
  if (k === 'n' || k === 'N') { S.noteMode = !S.noteMode; return sudDraw(); }
  if (k === 'Backspace' || k === 'Delete' || k === '0') { e.preventDefault(); return sudInput(0); }
  const d = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -9, ArrowDown: 9 }[k];
  if (d != null) { e.preventDefault(); let n = S.sel < 0 ? 0 : S.sel + d; if (d === -1 && S.sel % 9 === 0) n = S.sel + 8; if (d === 1 && S.sel % 9 === 8) n = S.sel - 8; S.sel = (n + 81) % 81; sudDraw(); }
}
function sudDraw(flash = []) {
  const S = G.S, B = $('#sud'); if (!B) return; const sv = S.sel >= 0 ? S.g[S.sel] : 0, sr = Math.floor(S.sel / 9), sc = S.sel % 9;
  B.innerHTML = S.g.map((v, i) => { const r = Math.floor(i / 9), c = i % 9, given = !!S.puz[i];
    const peer = S.sel >= 0 && (r === sr || c === sc || (Math.floor(r / 3) === Math.floor(sr / 3) && Math.floor(c / 3) === Math.floor(sc / 3)));
    const bad = S.check && v && !given && v !== S.sol[i], same = v && v === sv, nm = S.notes[i];
    const notes = !v && nm ? `<span class="snotes">${[1, 2, 3, 4, 5, 6, 7, 8, 9].map(n => `<i class="${sv && n === sv ? 'hi' : ''}">${nm >> n & 1 ? n : ''}</i>`).join('')}</span>` : '';
    return `<button class="sc ${given ? 'gv' : 'us'} ${i === S.sel ? 'sel' : ''} ${peer ? 'peer' : ''} ${same ? 'same' : ''} ${bad ? 'bad' : ''} ${flash.includes(i) ? 'flash' : ''} ${c % 3 === 2 && c < 8 ? 'br' : ''} ${r % 3 === 2 && r < 8 ? 'bb' : ''}" data-i="${i}" tabindex="-1" aria-label="Row ${r + 1} column ${c + 1}${v ? ' ' + v : ' empty'}">${v || notes}</button>`; }).join('');
  B.querySelectorAll('.sc').forEach(b => b.onclick = () => { S.sel = +b.dataset.i; sudDraw(); B.focus({ preventScroll: true }); });
  const cnt = n => S.g.filter((v, i) => v === n && v === S.sol[i]).length;
  $$('#spad [data-n]').forEach(b => { const n = +b.dataset.n, left = 9 - cnt(n); b.querySelector('small').textContent = left ? left + ' left' : '✓'; b.classList.toggle('done', !left); b.classList.toggle('cur', !!sv && n === sv); });
  $('#snote').setAttribute('aria-pressed', S.noteMode); $('#snst').textContent = S.noteMode ? 'on' : 'off';
  $('#sleft').textContent = S.g.filter((v, i) => v !== S.sol[i]).length; $('#smist').textContent = S.mist; $('#shn').textContent = S.hints;
}
function sudInput(n, asNote) {
  const S = G.S; if (!S.run || S.done) return; const i = S.sel; if (i < 0 || S.puz[i]) return;
  if ((S.noteMode || asNote) && n) { if (S.g[i]) return; S.hist.push({ i, v: S.g[i], nt: S.notes[i] }); S.notes[i] ^= 1 << n; return sudDraw(); }
  if (S.g[i] === n) return;
  S.hist.push({ i, v: S.g[i], nt: S.notes[i], peers: n ? sPeers(i).map(p => [p, S.notes[p]]) : null });
  S.g[i] = n; S.notes[i] = 0; let flash = [];
  if (n) {
    if (n === S.sol[i]) { sPeers(i).forEach(p => S.notes[p] &= ~(1 << n)); sUnits(i).forEach(u => { if (u.every(k => S.g[k] === S.sol[k])) flash = flash.concat(u); }); }
    else { S.mist++; }
  }
  sudDraw(flash);
  if (n && n !== S.sol[i] && S.check) { const c = $(`#sud [data-i="${i}"]`); c && c.classList.add('shake'); }
  sudDone();
}
function sudUndo() { const S = G.S, h = S.hist.pop(); if (!h || S.done) return; S.g[h.i] = h.v; S.notes[h.i] = h.nt; if (h.peers) h.peers.forEach(([p, nt]) => S.notes[p] = nt); S.sel = h.i; sudDraw(); }
function sudHint() {
  const S = G.S; if (!S.run || S.done) return; const e = [...Array(81).keys()].filter(i => S.g[i] !== S.sol[i]); if (!e.length) return;
  const i = S.sel >= 0 && S.g[S.sel] !== S.sol[S.sel] ? S.sel : e[Math.floor(Math.random() * e.length)];
  S.sel = i; S.hints++; S.hist.push({ i, v: S.g[i], nt: S.notes[i] }); S.g[i] = S.sol[i]; S.notes[i] = 0; sPeers(i).forEach(p => S.notes[p] &= ~(1 << S.sol[i]));
  sudDraw([i]); sudDone();
}
function sudDone() {
  const S = G.S; if (!S.g.every((v, i) => v === S.sol[i])) return; S.done = true; clearInterval(G.tick);
  const key = 'votv-sud-' + S.clues, prev = lsGet(key, null), rec = !S.hints && (prev == null || S.el < prev); if (rec) lsSet(key, S.el);
  $('#sud').classList.add('won');
  gLater(() => gameOver(`Solved in ${Math.floor(S.el / 60)} min ${S.el % 60} s!${rec ? ' New best!' : ''}`, () => sudStart(S.clues), `<p class="s t2" style="margin-top:6px">${SLV[S.clues]} · ${S.mist} mistake${S.mist === 1 ? '' : 's'} · ${S.hints} hint${S.hints === 1 ? '' : 's'}${S.hints ? ' (hints don’t count toward best time)' : ''}</p>`), 900);
}
