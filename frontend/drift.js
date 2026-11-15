/* Vitals in the Void — Drift Vector (Daily life): 24–48 h predictive physiological forecasting driven by the
   astronaut's surroundings. The forecast is computed on the server (backend/drift.py, read-only) from the
   astronaut's own model; this file only draws it. Also adds the "Forecast" pill to the top bar. */
(function () {
  const DR = { cid: null, preset: 'mission', env: null, h: 24, v: 'hr', F: null, busy: false, again: false, pill: { key: '', t: 0, F: null } };
  const RISK = ['Nominal', 'Drifting', 'Threshold breach'];
  const sgn = x => (x >= 0 ? '+' : '');
  const clampN = (x, a, b) => Math.max(a, Math.min(b, x));
  function ensure(c) { if (DR.cid !== c.id) { DR.cid = c.id; DR.preset = 'mission'; DR.env = null; DR.F = null; } }
  async function fetchF(c, opts) {
    const body = { horizon: DR.h };
    if (opts && opts.preset) body.preset = opts.preset; else if (DR.env) body.env = DR.env;
    const F = await api(`/api/crew/${c.id}/drift`, { body }); DR.env = F.env; DR.F = F; return F;
  }

  /* ---------------- view ---------------- */
  VIEWS.drift = async () => {
    const c = cur(); ensure(c);
    const O = await api(`/api/crew/${c.id}/overview`); renderHeader(O.hdr);
    const F = await fetchF(c, DR.env ? null : { preset: DR.preset });
    const e = F.env;
    const sl = (id, lab, min, max, step, val, unit, dp) => `<div class="drift-ctrl"><div class="drift-ctrl-head"><label for="ds_${id}">${lab}</label><span class="drift-ctrl-val" id="dv_${id}">${fmt(val, dp)}<small>${unit}</small></span></div><input class="drift-range" id="ds_${id}" type="range" min="${min}" max="${max}" step="${step}" value="${val}"></div>`;
    return {
      html: `<div class="stack gap16">
      <div class="card"><div class="row between" style="flex-wrap:wrap;gap:12px"><div><div class="xs t3">Active crew & mission context</div><div class="s" style="margin-top:2px"><b>${esc(c.name)}</b> · Mission day <span class="num">${fmt(O.hdr.day, 1)}</span> · ${esc(F.missionBase.envName)}</div></div>
       <div class="row" style="flex-wrap:wrap"><div class="seg" role="group" aria-label="Forecast horizon">${[24, 36, 48].map(h => `<button type="button" data-dh="${h}" aria-pressed="${DR.h === h}">${h}h ahead</button>`).join('')}</div><button class="btn sm" id="driftSync" type="button">Sync to mission env</button></div></div></div>
      <div class="drift-shell">
       <div class="card"><h3>Surroundings environment</h3><p class="xs t3" style="margin-top:4px">Set the astronaut's immediate habitat and surroundings to forecast physiological drift over the next 24–48 h.</p>
        <div class="drift-presets" id="driftPresets">${F.presets.map(p => `<button type="button" class="drift-preset" data-preset="${p.id}" aria-pressed="${DR.preset === p.id}"><b>${esc(p.name)}</b><span>${esc(p.sub)}</span></button>`).join('')}</div>
        <div class="drift-sliders">
         <div class="drift-ctrl"><div class="drift-ctrl-head"><label>Gravity regime</label><span class="drift-ctrl-val" id="dv_g">${e.g}<small>g</small></span></div><div class="seg" id="driftGrav" style="width:100%">${[[0, '0 g'], [0.166, '0.17 g'], [0.38, '0.38 g'], [1, '1.0 g']].map(([g, l]) => `<button type="button" data-dg="${g}" aria-pressed="${Math.abs(e.g - g) < .02}" style="flex:1;padding:6px 4px">${l}</button>`).join('')}</div></div>
         ${sl('co2', 'Cabin ppCO₂', .4, 6, .1, e.co2, 'mmHg', 1)}${sl('temp', 'Ambient temperature', 16, 28, .5, e.temp, '°C', 1)}${sl('o2', 'Cabin O₂', 18.5, 22.5, .1, e.o2, '%', 1)}${sl('rh', 'Relative humidity', 20, 75, 1, e.rh, '%', 0)}
         ${sl('rad', 'Ambient radiation', .01, 10, .05, e.rad, 'mSv/d', 2)}${sl('noise', 'Acoustic load', 40, 74, 1, e.noise, 'dBA', 0)}${sl('dust', 'Particulate dust (PM)', 0, 2, .05, e.dust, 'mg/m³', 2)}
         <div class="drift-ctrl"><div class="drift-ctrl-head"><label>Lighting cycle</label><span class="drift-ctrl-val" id="dv_light">${esc(e.light)}</span></div><div class="seg" id="driftLight" style="width:100%">${[['aligned', 'Synced'], ['shifted', 'Shifted'], ['dim', 'Sleep dim']].map(([k, l]) => `<button type="button" data-dl="${k}" aria-pressed="${e.light === k}" style="flex:1;padding:6px 4px">${l}</button>`).join('')}</div></div>
        </div><div class="drift-drivers" id="driftEnvSummary"></div></div>
       <div class="stack gap16"><div class="drift-kpis" id="driftKpis"></div>
        <div class="card"><div class="row between" style="align-items:flex-start;gap:10px"><div id="driftTitle"></div><div id="driftBadge"></div></div><div class="drift-vtabs" id="driftTabs"></div>
         <div class="drift-cross-bar hidden" id="driftCross"></div><div id="driftMount" style="margin-top:12px">${chartBox(300)}</div>
         <div class="clegend" style="margin-top:10px"><span><i class="sw" style="background:rgba(121,220,232,.28)"></i>95% prediction cone</span><span><i class="sw" style="border-top:2.5px solid #79dce8;height:0"></i>Environment drift forecast</span><span><i class="sw" style="border-top:2px dashed rgba(255,255,255,.58);height:0"></i>Nominal mission baseline</span><span><i class="sw" style="border-top:2px dashed #f5b941;height:0"></i>Clinical limit</span><span><i class="sw" style="border-top:2px dashed #ef5b5b;height:0"></i>Safety limit</span><span><i class="drift-legend-diamond"></i>Critical crossing</span><span><i class="drift-legend-ring"></i>Critical data point</span></div></div></div>
      </div>
      <div class="grid split"><div class="card"><div class="row between"><h3>Multi-system drift matrix</h3><span class="xs t3">Click any row to inspect its trajectory</span></div>
        <div class="scroll" style="margin-top:10px"><table class="rtable"><thead><tr><th>Vital / marker</th><th class="r">Now</th><th class="r">T+24h</th><th class="r" id="driftThEnd">T+${DR.h}h</th><th class="r">Net drift</th><th>Environment driver</th><th>Forecast</th></tr></thead><tbody id="driftBody"></tbody></table></div></div>
       <div class="card hi"><h3>Countermeasure advisories</h3><p class="xs t3" style="margin-top:4px">Actions derived from the projected surroundings stressors and threshold crossings.</p><div class="stack gap8" id="driftAdv" style="margin-top:12px"></div>
        <div class="row" style="margin-top:14px"><a class="btn sm" href="#routine">Open daily routine</a><a class="btn sm" href="#monitor">View live monitor</a></div>
        <p class="xs t3" style="margin-top:14px">Forecast only: it does not change any measured value, status or alert in the app.</p></div></div></div>`,
      bind() {
        draw(DR.F);
        $$('[data-dh]').forEach(b => b.onclick = () => { DR.h = +b.dataset.dh; $$('[data-dh]').forEach(x => x.setAttribute('aria-pressed', x === b)); recompute(); });
        $('#driftSync').onclick = async () => { DR.preset = 'mission'; DR.env = null; await fetchF(c, { preset: 'mission' }); syncControls(); draw(DR.F); toast('Synced surroundings to ' + DR.F.missionBase.envName); };
        $$('#driftPresets [data-preset]').forEach(b => b.onclick = async () => { DR.preset = b.dataset.preset; await fetchF(c, { preset: DR.preset }); syncControls(); draw(DR.F); });
        $$('#driftGrav [data-dg]').forEach(b => b.onclick = () => { DR.preset = 'custom'; DR.env.g = +b.dataset.dg; syncControls(); recompute(); });
        $$('#driftLight [data-dl]').forEach(b => b.onclick = () => { DR.preset = 'custom'; DR.env.light = b.dataset.dl; syncControls(); recompute(); });
        ['co2', 'temp', 'o2', 'rh', 'rad', 'noise', 'dust'].forEach(k => { const el = $('#ds_' + k); if (el) el.oninput = () => { DR.preset = 'custom'; DR.env[k] = +el.value; syncControls(true); recompute(); }; });
      }
    };
  };
  /* slider moves: one request in flight at a time, the latest settings always win */
  async function recompute() {
    const c = cur(); if (!c) return; if (DR.busy) { DR.again = true; return; }
    DR.busy = true; try { await fetchF(c); if ($('#driftKpis')) draw(DR.F); } catch (e) {} DR.busy = false;
    if (DR.again) { DR.again = false; recompute(); }
  }
  function syncControls(fromSlider) {
    const e = DR.env; if (!e || !$('#dv_g')) return;
    const set = (k, dp, u) => { $('#dv_' + k).innerHTML = fmt(e[k], dp) + `<small>${u}</small>`; if (!fromSlider) $('#ds_' + k).value = e[k]; };
    $('#dv_g').innerHTML = e.g + '<small>g</small>'; set('co2', 1, 'mmHg'); set('temp', 1, '°C'); set('o2', 1, '%'); set('rh', 0, '%'); set('rad', 2, 'mSv/d'); set('noise', 0, 'dBA'); set('dust', 2, 'mg/m³');
    $('#dv_light').textContent = e.light;
    $$('#driftPresets [data-preset]').forEach(b => b.setAttribute('aria-pressed', b.dataset.preset === DR.preset));
    $$('#driftGrav [data-dg]').forEach(b => b.setAttribute('aria-pressed', Math.abs(e.g - +b.dataset.dg) < .02));
    $$('#driftLight [data-dl]').forEach(b => b.setAttribute('aria-pressed', e.light === b.dataset.dl));
  }
  function draw(F) {
    if (!F || !$('#driftKpis')) return;
    const S = F.seriesMap, sel = S[DR.v] || F.summaries[0]; DR.v = sel.v;
    const ec = F.earliestCrit ? S[F.earliestCrit] : null, ea = F.earliest ? S[F.earliest] : null, er = ec || ea, pk = S[F.peakVar], dI = F.predIdx - F.curIdx;
    const eVal = er ? ((ec ? 'CRIT T+' + fmt(er.critCrossH, 1) : 'T+' + fmt(er.crossH, 1)) + 'h · ' + er.v.toUpperCase()) : 'None in ' + F.horizonH + 'h';
    $('#driftKpis').innerHTML = `<div class="drift-kpi"><span class="drift-kpi-lab">Forecast status (${F.horizonH}h)</span><div style="margin-top:2px">${st(F.worstLvl, RISK[F.worstLvl])}</div><span class="drift-kpi-sub">${esc(F.env.envName)}</span></div>
     <div class="drift-kpi"><span class="drift-kpi-lab">${ec ? 'Earliest safety crossing' : 'Earliest threshold crossing'}</span><span class="drift-kpi-val">${esc(eVal)}</span><span class="drift-kpi-sub">${er ? esc(er.n) : 'All limits respected'}</span></div>
     <div class="drift-kpi"><span class="drift-kpi-lab">Peak drift magnitude</span><span class="drift-kpi-val">${esc(pk.v.toUpperCase())} ${sgn(pk.netDrift)}${fmt(pk.netDrift, pk.dp)} ${esc(pk.u)}</span><span class="drift-kpi-sub">${fmt(pk.peakZ, 1)} σ deviation · ${esc(pk.driver)}</span></div>
     <div class="drift-kpi"><span class="drift-kpi-lab">Projected crew index</span><span class="drift-kpi-val">${Math.round(F.curIdx)} → ${Math.round(F.predIdx)}</span><span class="drift-kpi-sub">${dI === 0 ? 'Steady over ' + F.horizonH + 'h' : sgn(dI) + dI + ' pts by T+' + F.horizonH + 'h'}</span></div>`;
    const e = F.env, n = [];
    if (e.co2 > 3) n.push(`Hypercapnic CO₂ load (${fmt(e.co2, 1)} mmHg)`); if (Math.abs(e.temp - 21.5) > 2) n.push(`Thermal offset (${fmt(e.temp, 1)} °C)`); if (e.o2 < 20.3) n.push(`Reduced O₂ (${fmt(e.o2, 1)}%)`);
    if (e.rad > 2) n.push(`Elevated radiation (${fmt(e.rad, 2)} mSv/d)`); if (e.noise > 60) n.push(`Acoustic load (${Math.round(e.noise)} dBA)`); if (e.dust > .3) n.push(`Particulate dust (${fmt(e.dust, 2)} mg/m³)`); if (e.light !== 'aligned') n.push('Light cycle: ' + e.light);
    $('#driftEnvSummary').innerHTML = `<b>Active surroundings drivers:</b> ${n.length ? n.map(esc).join(' · ') : `All cabin and ambient parameters within nominal range (${e.g} g).`}`;
    const sub = sel.critCrossH != null ? ` · Safety limit crossed at T+${fmt(sel.critCrossH, 1)}h` : sel.crossH != null ? ` · Clinical limit crossed at T+${fmt(sel.crossH, 1)}h` : '';
    $('#driftTitle').innerHTML = `<h3>${esc(sel.n)} <span class="t3 s">(${sel.u ? esc(sel.u) : 'index'})</span></h3><p class="xs t3" style="margin-top:2px">Driver: ${esc(sel.driver)}${sub}</p>`;
    $('#driftBadge').innerHTML = st(sel.lvl, RISK[sel.lvl]);
    $('#driftTabs').innerHTML = F.summaries.map(s => `<button type="button" class="drift-vtab" data-dv="${s.v}" aria-pressed="${s.v === sel.v}"><span class="dot" style="background:${COLV[s.lvl]};width:7px;height:7px"></span>${esc(s.v.toUpperCase())}${s.critCrossings.length ? ' <span class="num" style="color:#ff9e9e;font-size:10.5px">◆</span>' : ''}</button>`).join('');
    $$('#driftTabs [data-dv]').forEach(b => b.onclick = () => { DR.v = b.dataset.dv; draw(DR.F); });
    const mount = $('#driftMount'); chart(mount, sel, F.horizonH);
    const bar = $('#driftCross');
    if (sel.critCrossings.length || sel.critPts.length) {
      bar.classList.remove('hidden', 'is-warn');
      bar.innerHTML = '<b>Safety threshold crossings:</b>' + sel.critCrossings.map((x, i) => `<button type="button" class="drift-cross-chip" data-ci="${i}" title="Show on chart">◆ T+${fmt(x.h, 1)}h · ${esc(x.label)}</button>`).join('') + (sel.critPts.length ? `<span class="xs" style="color:#ffd8d8;opacity:.85">${sel.critPts.length} forecast point${sel.critPts.length > 1 ? 's' : ''} in the safety breach zone</span>` : '');
      $$('#driftCross [data-ci]').forEach(b => b.onclick = () => { $$('#driftCross [data-ci]').forEach(x => x.classList.remove('is-pinned')); b.classList.add('is-pinned'); mount._focus && mount._focus(sel.critCrossings[+b.dataset.ci]); });
    } else if (sel.warnCrossings.length) {
      bar.classList.remove('hidden'); bar.classList.add('is-warn');
      bar.innerHTML = '<b>Clinical threshold notice:</b>' + sel.warnCrossings.map(x => `<span class="drift-cross-chip" style="cursor:default">◇ T+${fmt(x.h, 1)}h · ${esc(x.label)}</span>`).join('') + '<span class="xs" style="opacity:.85">Safety limit not breached</span>';
    } else { bar.classList.add('hidden'); bar.innerHTML = ''; }
    $('#driftThEnd').textContent = 'T+' + F.horizonH + 'h';
    $('#driftBody').innerHTML = F.summaries.map(s => `<tr class="drift-row${s.v === sel.v ? ' is-active' : ''}" data-drow="${s.v}"><td><b>${esc(s.n)}</b><br><span class="xs t3">${esc(s.u)}</span></td><td class="r num" data-l="Now">${fmt(s.cur, s.dp)}</td><td class="r num" data-l="T+24h">${fmt(s.v24, s.dp)}</td><td class="r num" data-l="T+${F.horizonH}h"><b>${fmt(s.vEnd, s.dp)}</b></td><td class="r num" data-l="Net drift">${sgn(s.netDrift)}${fmt(s.netDrift, s.dp)}</td><td class="s t2" data-l="Driver">${esc(s.driver)}</td><td data-l="Forecast">${st(s.lvl, RISK[s.lvl])}${s.critCrossH != null ? `<div class="xs num" style="color:#ff9e9e;margin-top:2px">◆ Crit T+${fmt(s.critCrossH, 1)}h</div>` : ''}</td></tr>`).join('');
    $$('#driftBody [data-drow]').forEach(tr => tr.onclick = () => { DR.v = tr.dataset.drow; draw(DR.F); $('#driftMount').scrollIntoView({ block: 'center', behavior: 'smooth' }); });
    $('#driftAdv').innerHTML = F.advisories.map(a => `<div class="banner l${a.lvl}"><div><b>${esc(a.t)}</b><div class="s t2" style="margin-top:3px">${esc(a.d)}</div></div></div>`).join('');
    setPill(cur(), F);
  }

  /* ---------------- chart: forecast, 95 % cone, baseline, limits, crossings, hover read-out ---------------- */
  function chart(box, S, H0) {
    const svg = box.querySelector('svg'), tip = box.querySelector('.tip'); let geo = null;
    const show = t => {
      if (!geo || !t) return; const { W, X, Y } = geo, px = X(t.h), py = Y(t.val != null ? t.val : t.pred), cr = svg.querySelector('#dCross'), rg = svg.querySelector('#dRing');
      if (cr) { cr.setAttribute('x1', px); cr.setAttribute('x2', px); cr.setAttribute('stroke', t.crit ? 'rgba(239,91,91,.72)' : 'rgba(255,255,255,.38)'); cr.style.display = 'block'; }
      if (rg) { rg.setAttribute('cx', px); rg.setAttribute('cy', py); rg.setAttribute('stroke', t.crit ? '#ef5b5b' : '#fff'); rg.style.display = 'block'; }
      if (t.kind === 'critX') tip.innerHTML = `<b style="color:#ff9e9e">SAFETY LIMIT CROSSING · T+${fmt(t.h, 1)}h</b><br>${esc(t.label)}<br>Value at crossing: <b>${fmt(t.val, S.dp)} ${esc(S.u)}</b>`;
      else if (t.kind === 'warnX') tip.innerHTML = `<b style="color:#ffd982">CLINICAL LIMIT CROSSING · T+${fmt(t.h, 1)}h</b><br>${esc(t.label)}<br>Value at crossing: <b>${fmt(t.val, S.dp)} ${esc(S.u)}</b>`;
      else { const df = t.pred - t.base, L = S.lims || {}; let br = '';
        if (t.lvl === 2) br = `<br><span style="color:#ff9e9e;font-weight:600">${L.ch != null && t.pred > L.ch ? '+' + fmt(t.pred - L.ch, S.dp) + ' above safety limit (' + fmt(L.ch, S.dp) + ')' : L.cl != null && t.pred < L.cl ? '−' + fmt(L.cl - t.pred, S.dp) + ' below safety limit (' + fmt(L.cl, S.dp) + ')' : 'Safety limit breached'}</span>`;
        tip.innerHTML = `<b>T+${t.h}h · ${fmt(t.pred, S.dp)} ${esc(S.u)}</b><br>Baseline: ${fmt(t.base, S.dp)} ${esc(S.u)} (${sgn(df)}${fmt(df, S.dp)})<br>95% band: ${fmt(t.lo, S.dp)} – ${fmt(t.hi, S.dp)} · ${['Nominal', 'Warning', 'Alert'][t.lvl]}${br}`; }
      tip.style.display = 'block'; tip.style.left = Math.min(W - 255, Math.max(8, px - 118)) + 'px'; tip.style.top = Math.max(4, py - 90) + 'px';
    };
    function draw() {
      const W = svg.clientWidth, H = svg.clientHeight; if (!W || !H) return;
      const pad = { l: W < 520 ? 44 : 58, r: 18, t: 26, b: 32 }, from = -24, to = H0;
      let ys = []; S.hist.forEach(p => ys.push(p.val)); S.pts.forEach(p => ys.push(p.lo, p.hi, p.base)); if (!ys.length) ys = [0, 1];
      let lo = Math.min(...ys), hi = Math.max(...ys); const L = S.lims || {}, rg = (hi - lo) || 1;
      ['wl', 'wh', 'cl', 'ch'].forEach(k => { if (L[k] != null && L[k] > lo - .65 * rg && L[k] < hi + .65 * rg) { lo = Math.min(lo, L[k]); hi = Math.max(hi, L[k]); } });
      const m = (hi - lo) * .12 || .5; lo -= m; hi += m;
      const X = h => pad.l + (h - from) / (to - from) * (W - pad.l - pad.r), Y = v => H - pad.b - (v - lo) / (hi - lo) * (H - pad.t - pad.b); geo = { W, H, X, Y };
      const col = S.lvl === 2 ? '#ef5b5b' : S.lvl === 1 ? '#f5b941' : '#79dce8', cone = S.lvl === 2 ? 'rgba(239,91,91,.16)' : S.lvl === 1 ? 'rgba(245,185,65,.16)' : 'rgba(121,220,232,.18)';
      let s = `<defs><linearGradient id="dCone" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#fff" stop-opacity=".06"/><stop offset="1" stop-color="${col}" stop-opacity=".24"/></linearGradient><linearGradient id="dTop" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ef5b5b" stop-opacity=".2"/><stop offset="1" stop-color="#ef5b5b" stop-opacity=".06"/></linearGradient><linearGradient id="dBot" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ef5b5b" stop-opacity=".06"/><stop offset="1" stop-color="#ef5b5b" stop-opacity=".2"/></linearGradient></defs>`;
      s += `<rect x="${X(0)}" y="${pad.t}" width="${Math.max(0, X(to) - X(0))}" height="${Math.max(0, H - pad.t - pad.b)}" fill="rgba(255,255,255,.025)"/>`;
      if (L.ch != null && L.ch < hi) { const y = clampN(Y(L.ch), pad.t, H - pad.b); if (y > pad.t + 1) s += `<rect x="${pad.l}" y="${pad.t}" width="${W - pad.l - pad.r}" height="${y - pad.t}" fill="url(#dTop)"/>`; }
      if (L.cl != null && L.cl > lo) { const y = clampN(Y(L.cl), pad.t, H - pad.b); if (H - pad.b > y + 1) s += `<rect x="${pad.l}" y="${y}" width="${W - pad.l - pad.r}" height="${H - pad.b - y}" fill="url(#dBot)"/>`; }
      for (let i = 0; i <= 5; i++) { const v = lo + (hi - lo) * i / 5, y = Y(v); s += `<line x1="${pad.l}" x2="${W - pad.r}" y1="${y}" y2="${y}" stroke="rgba(255,255,255,.07)"/><text x="${pad.l - 8}" y="${y + 4}" font-size="11.5" font-family="IBM Plex Mono,monospace" text-anchor="end" fill="rgba(255,255,255,.58)">${fmt(v, S.dp > 1 ? 2 : S.dp)}</text>`; }
      const ticks = H0 === 24 ? [-24, -12, 0, 6, 12, 18, 24] : H0 === 36 ? [-24, -12, 0, 12, 24, 36] : [-24, -12, 0, 12, 24, 36, 48];
      ticks.forEach((tk, i) => s += `<text x="${X(tk)}" y="${H - 9}" font-size="11.5" font-family="IBM Plex Mono,monospace" text-anchor="${i === 0 ? 'start' : i === ticks.length - 1 ? 'end' : 'middle'}" fill="${tk === 0 ? '#fff' : 'rgba(255,255,255,.58)'}">${tk === 0 ? 'NOW' : tk > 0 ? '+' + tk + 'h' : tk + 'h'}</text>`);
      [['wl', '#f5b941', 'CLINICAL < '], ['wh', '#f5b941', 'CLINICAL > '], ['cl', '#ef5b5b', 'SAFETY < '], ['ch', '#ef5b5b', 'SAFETY > ']].forEach(([k, cl, pre]) => { if (L[k] != null && L[k] >= lo && L[k] <= hi) { const ly = Y(L[k]), cr = k === 'cl' || k === 'ch';
        s += `<line x1="${pad.l}" x2="${W - pad.r}" y1="${ly}" y2="${ly}" stroke="${cl}" stroke-width="${cr ? 1.6 : 1.2}" stroke-dasharray="${cr ? '5 3' : '4 4'}" opacity="${cr ? .92 : .75}"/>`;
        if (cr) s += `<text x="${W - pad.r - 4}" y="${k === 'ch' ? Math.max(pad.t + 11, ly - 5) : Math.min(H - pad.b - 5, ly + 12)}" font-size="9.5" font-weight="600" font-family="IBM Plex Mono,monospace" text-anchor="end" fill="#ff9e9e" opacity=".9">${pre}${fmt(L[k], S.dp)}</text>`; } });
      s += `<polygon points="${S.pts.map(p => X(p.h) + ',' + Y(p.hi)).concat(S.pts.slice().reverse().map(p => X(p.h) + ',' + Y(p.lo))).join(' ')}" fill="url(#dCone)"/>`;
      s += `<polygon points="${S.pts.map(p => X(p.h) + ',' + Y(p.pred + p.sigma)).concat(S.pts.slice().reverse().map(p => X(p.h) + ',' + Y(p.pred - p.sigma))).join(' ')}" fill="${cone}"/>`;
      s += `<polyline points="${S.pts.map(p => X(p.h) + ',' + Y(p.base)).join(' ')}" fill="none" stroke="rgba(255,255,255,.52)" stroke-width="1.6" stroke-dasharray="5 5"/>`;
      s += `<polyline class="dline" points="${S.pts.map(p => X(p.h) + ',' + Y(p.pred)).join(' ')}" fill="none" stroke="${col}" stroke-width="2.6" stroke-linecap="round"/>`;
      for (let i = 1; i < S.pts.length; i++) { const a = S.pts[i - 1], b = S.pts[i]; if (a.lvl !== 2 && b.lvl !== 2) continue; let seg;
        if (a.lvl === 2 && b.lvl === 2) seg = [[a.h, a.pred], [b.h, b.pred]]; else { const m2 = (S.critCrossings || []).find(x => x.h >= a.h && x.h <= b.h); seg = m2 ? (a.lvl === 2 ? [[a.h, a.pred], [m2.h, m2.val]] : [[m2.h, m2.val], [b.h, b.pred]]) : [[a.h, a.pred], [b.h, b.pred]]; }
        const ps = `${X(seg[0][0])},${Y(seg[0][1])} ${X(seg[1][0])},${Y(seg[1][1])}`; s += `<polyline points="${ps}" fill="none" stroke="rgba(239,91,91,.34)" stroke-width="8" stroke-linecap="round"/><polyline points="${ps}" fill="none" stroke="#ff5c5c" stroke-width="3.2" stroke-linecap="round"/>`; }
      if (S.hist.length > 1) s += `<polyline points="${S.hist.map(p => X(p.h) + ',' + Y(p.val)).join(' ')}" fill="none" stroke="rgba(255,255,255,.58)" stroke-width="1.6"/>`;
      S.hist.forEach(p => s += `<circle cx="${X(p.h)}" cy="${Y(p.val)}" r="3.4" fill="rgba(255,255,255,.88)" stroke="#0d0e11" stroke-width="1.4"/>`);
      S.pts.filter(p => p.h > 0 && p.h % 12 === 0 && p.lvl !== 2).forEach(p => s += `<circle cx="${X(p.h)}" cy="${Y(p.pred)}" r="4.2" fill="${COLV[p.lvl]}" stroke="#0d0e11" stroke-width="1.5"/>`);
      (S.critPts || []).forEach(p => s += `<circle cx="${X(p.h)}" cy="${Y(p.pred)}" r="8" fill="rgba(239,91,91,.26)"/><circle cx="${X(p.h)}" cy="${Y(p.pred)}" r="4.4" fill="#ef5b5b" stroke="#fff" stroke-width="1.5"/>`);
      (S.warnCrossings || []).forEach(w => { const x = X(w.h), y = Y(w.val); s += `<polygon points="${x},${y - 4.8} ${x + 4.8},${y} ${x},${y + 4.8} ${x - 4.8},${y}" fill="#f5b941" stroke="#0d0e11" stroke-width="1.3"/>`; });
      const placed = [];
      (S.critCrossings || []).forEach(cx => { const x = X(cx.h), y = Y(cx.val);
        s += `<line x1="${x}" x2="${x}" y1="${y}" y2="${H - pad.b}" stroke="#ef5b5b" stroke-width="1.35" stroke-dasharray="3 3" opacity=".78"/><circle class="drift-crit-pulse" cx="${x}" cy="${y}" r="10.5" fill="none" stroke="#ef5b5b" stroke-width="1.6"/><circle cx="${x}" cy="${y}" r="9" fill="rgba(239,91,91,.22)"/><polygon points="${x},${y - 6.8} ${x + 6.8},${y} ${x},${y + 6.8} ${x - 6.8},${y}" fill="#ef5b5b" stroke="#fff" stroke-width="1.7"/>`;
        const tg = cx.dir === 'active' ? 'BREACH T+0h' : cx.dir === 'exit' ? 'EXIT T+' + fmt(cx.h, 1) + 'h' : 'CRIT T+' + fmt(cx.h, 1) + 'h', bw = tg.length * 6.4 + 14, bh = 20;
        const bx = clampN(x - bw / 2, pad.l + 4, W - pad.r - bw - 4), above = y > pad.t + 36; let by = above ? y - 30 : y + 12;
        placed.forEach(pb => { if (Math.abs(bx - pb.x) < bw && Math.abs(by - pb.y) < bh + 4) by = above ? Math.max(pad.t + 2, pb.y - bh - 4) : Math.min(H - pad.b - bh - 2, pb.y + bh + 4); }); placed.push({ x: bx, y: by });
        s += `<rect x="${bx}" y="${by}" width="${bw}" height="${bh}" rx="6" fill="rgba(30,9,13,.94)" stroke="rgba(239,91,91,.88)"/><text x="${bx + bw / 2}" y="${by + 13.5}" font-size="10" font-weight="600" font-family="IBM Plex Mono,monospace" text-anchor="middle" fill="#ffd8d8">${tg}</text>`; });
      s += `<line x1="${X(0)}" x2="${X(0)}" y1="${pad.t}" y2="${H - pad.b}" stroke="rgba(255,255,255,.75)" stroke-width="1.2"/><text x="${X(0) + 6}" y="${pad.t + 12}" font-size="11" font-family="IBM Plex Mono,monospace" fill="#fff">NOW (T+0h)</text>`;
      s += `<line id="dCross" x1="0" x2="0" y1="${pad.t}" y2="${H - pad.b}" stroke="rgba(255,255,255,.38)" stroke-dasharray="2 3" style="display:none"/><circle id="dRing" cx="0" cy="0" r="8.5" fill="none" stroke="#fff" stroke-width="1.6" style="display:none"/>`;
      svg.innerHTML = s;
      svg.onmousemove = ev => { const b = svg.getBoundingClientRect(), mx = ev.clientX - b.left, my = ev.clientY - b.top;
        if (mx < X(0) - 8) { tip.style.display = 'none'; ['#dCross', '#dRing'].forEach(q => { const el = svg.querySelector(q); if (el) el.style.display = 'none'; }); return; }
        let snap = null, sd = 16; (S.critCrossings || []).forEach(cx => { const dd = Math.hypot(X(cx.h) - mx, Y(cx.val) - my); if (dd < sd) { sd = dd; snap = { ...cx, kind: 'critX', crit: true }; } });
        if (!snap) (S.warnCrossings || []).forEach(w => { const dd = Math.hypot(X(w.h) - mx, Y(w.val) - my); if (dd < 13 && dd < sd) { sd = dd; snap = { ...w, kind: 'warnX' }; } });
        if (snap) return show(snap);
        let best = null, bd = 1e9; S.pts.forEach(p => { const dd = Math.abs(X(p.h) - mx); if (dd < bd) { bd = dd; best = p; } }); if (best) show({ ...best, kind: 'pt', crit: best.lvl === 2 }); };
      svg.onmouseleave = () => { tip.style.display = 'none'; ['#dCross', '#dRing'].forEach(q => { const el = svg.querySelector(q); if (el) el.style.display = 'none'; }); };
    }
    box._focus = cx => cx && show({ ...cx, kind: 'critX', crit: true });
    if (box._ro) box._ro.disconnect(); if (typeof ResizeObserver !== 'undefined') { box._ro = new ResizeObserver(draw); box._ro.observe(svg); }
    draw();
  }

  /* ---------------- top-bar forecast pill + quick menu ---------------- */
  function setPill(c, F) {
    const w = $('#fpillWrap'), b = $('#fpill'); if (!w || !b) return; if (!c || !F) { w.classList.add('hidden'); return; }
    w.classList.remove('hidden'); DR.pill = { key: c.id + '|' + DR.h + '|' + JSON.stringify(DR.env), t: Date.now(), F };
    const S = F.seriesMap, ec = F.earliestCrit ? S[F.earliestCrit] : null, ea = F.earliest ? S[F.earliest] : null, pk = S[F.peakVar];
    const sum = ec ? `CRIT T+${fmt(ec.critCrossH, 1)}h ${ec.v.toUpperCase()}` : ea ? `T+${fmt(ea.crossH, 1)}h ${ea.v.toUpperCase()}` : `${['Nominal', 'Drifting', 'Alert'][F.worstLvl]} · Idx ${Math.round(F.predIdx)}`;
    b.classList.toggle('is-warn', F.worstLvl === 1); b.classList.toggle('is-alert', F.worstLvl === 2);
    b.innerHTML = `<span class="dot" style="background:${COLV[F.worstLvl]}"></span><span><b>${F.horizonH}h</b> <span class="hide-m">Forecast</span></span><span class="hide-m t3">·</span><span class="hide-m num">${esc(sum)}</span><span class="hide-l t3">· ${esc(pk.v.toUpperCase())} ${sgn(pk.netDrift)}${fmt(pk.netDrift, pk.dp)}${pk.u ? ' ' + esc(pk.u) : ''}</span>${CHEVD}`;
    const top = F.summaries.slice().sort((a, b2) => (b2.lvl - a.lvl) || (b2.peakZ - a.peakZ)).slice(0, 3), pr = F.presets.find(p => p.id === DR.preset);
    $('#fmenu').innerHTML = `<div class="row between" style="margin-bottom:8px"><div><b style="font-size:13.5px">Drift Vector (${F.horizonH}h)</b><div class="xs t3">${esc(pr ? pr.name : 'Custom surroundings')} · ${F.env.g} g</div></div>${st(F.worstLvl, ['Nominal', 'Drifting', 'Alert'][F.worstLvl])}</div>
     <div class="seg" style="width:100%;margin-bottom:10px">${[24, 36, 48].map(h => `<button type="button" data-fh="${h}" aria-pressed="${DR.h === h}" style="flex:1;padding:5px 6px">${h}h</button>`).join('')}</div>
     <div style="margin-bottom:10px">${top.map(r => `<div class="fmenu-row"><span class="grow"><b>${esc(r.n)}</b><div class="xs t3">${esc(r.driver)}</div></span><span class="num" style="text-align:right"><b>${fmt(r.vEnd, r.dp)}</b> ${esc(r.u)}<div class="xs" style="color:${COLV[r.lvl]}">${sgn(r.netDrift)}${fmt(r.netDrift, r.dp)}</div></span></div>`).join('')}</div>
     <div class="row between" style="gap:8px"><select id="fPreset" aria-label="Quick surroundings preset" style="flex:1">${F.presets.map(p => `<option value="${p.id}" ${DR.preset === p.id ? 'selected' : ''}>${esc(p.name)}</option>`).join('')}${DR.preset === 'custom' ? '<option value="custom" selected>Custom surroundings</option>' : ''}</select><button class="btn p sm" id="fOpen" type="button">Details →</button></div>`;
    $$('#fmenu [data-fh]').forEach(x => x.onclick = async () => { DR.h = +x.dataset.fh; if (U.route === 'drift') render(); else { await fetchF(c); setPill(c, DR.F); } });
    const ps = $('#fPreset'); if (ps) ps.onchange = async () => { if (ps.value === 'custom') return; DR.preset = ps.value; await fetchF(c, { preset: DR.preset }); if (U.route === 'drift') render(); else setPill(c, DR.F); };
    $('#fOpen').onclick = () => { $('#fmenu').classList.remove('on'); $('#fpill').setAttribute('aria-expanded', 'false'); U.route === 'drift' ? render() : (location.hash = 'drift'); };
  }
  window.refreshForecastPill = async () => {
    const c = cur(); const w = $('#fpillWrap'); if (!w) return; if (!c || $('#app').classList.contains('hidden')) { w.classList.add('hidden'); return; }
    ensure(c); const key = c.id + '|' + DR.h + '|' + JSON.stringify(DR.env);
    if (DR.pill.F && DR.pill.key === key && Date.now() - DR.pill.t < 60000) return setPill(c, DR.pill.F);
    try { const F = await fetchF(c, DR.env ? null : { preset: DR.preset }); setPill(c, F); } catch (e) {}
  };
  document.addEventListener('click', e => { const b = e.target.closest && e.target.closest('#fpill'); const m = $('#fmenu'); if (!m) return;
    if (b) { const on = !m.classList.contains('on'); m.classList.toggle('on', on); b.setAttribute('aria-expanded', on); return; }
    if (!e.target.closest('#fmenu') && !e.target.closest('.xpop')) { m.classList.remove('on'); const p = $('#fpill'); p && p.setAttribute('aria-expanded', 'false'); } });
})();
