/* Vitals in the Void — EMERGENCY.
   The sidebar button sends an emergency to Mission Control on Earth (arrives after the real one-way
   signal delay for the current location) and alerts the whole crew: every screen connected to this
   Python server shows a full-screen alarm with a siren until it is silenced on that screen, and a red
   banner stays on every page until the emergency is resolved. */
(function () {
  const TYPES = [
    ['medical', 'Medical emergency', '🩺'], ['fire', 'Fire or smoke', '🔥'], ['depress', 'Depressurisation / leak', '💨'],
    ['toxic', 'Toxic atmosphere', '☣️'], ['injury', 'Injury', '🩹'], ['eva', 'Spacewalk emergency', '🧑‍🚀'], ['other', 'Other', '❗']];
  /* first actions, from the ISS emergency response principles (fire, rapid depressurisation and toxic atmosphere
     are the three station-level emergencies); the onboard emergency procedures always take precedence */
  const STEPS = {
    medical: ['Crew Medical Officer to the patient; keep them still and safe.', 'Check airway, breathing, circulation; take vital signs (Assess page).', 'Open the medical kit; follow the onboard medical checklist.', 'Keep the voice loop to the Earth flight surgeon open.'],
    fire: ['Don oxygen masks / portable breathing apparatus.', 'Remove power and ventilation from the affected module.', 'Use the portable fire extinguisher if the source is located.', 'Gather the crew; isolate the module (close hatches) if it cannot be controlled.'],
    depress: ['Gather the whole crew in the safe haven / return vehicle segment.', 'Compute time to reach the minimum safe pressure.', 'Isolate modules one by one to find the leak; close hatches per procedure.', 'Prepare the return vehicle if the reserve time is short.'],
    toxic: ['Don masks or respirators immediately.', 'Move upwind to a clean module; close the hatch behind you.', 'Monitor the atmosphere with the combustion/toxic gas analyser.', 'Scrub the air and wait for clearance before removing masks.'],
    injury: ['Stop the activity and secure the injured crew member.', 'Control bleeding, immobilise, assess pain and movement.', 'Log the injury and vital signs; photograph visible injuries.', 'Report to the flight surgeon for treatment decisions.'],
    eva: ['Stop the spacewalk task; both crew members to the airlock.', 'Check suit pressure, CO₂, oxygen and cooling.', 'Begin ingress per the EVA emergency checklist.', 'Medical check after repressurisation (Spacewalk page).'],
    other: ['Make sure everyone is safe and accounted for.', 'Follow the onboard emergency procedures book.', 'Keep Mission Control informed.']
  };
  let EM = null, siren = null, busy = false;
  const silencedKey = id => 'votv-em-silenced-' + id;
  const isSilenced = id => { try { return sessionStorage.getItem(silencedKey(id)) === '1'; } catch (e) { return false; } };
  const fmtDelay = s => s >= 60 ? `${Math.floor(s / 60)} min ${Math.round(s % 60)} s` : `${(+s).toFixed(s < 10 ? 1 : 0)} s`;
  const tstr = t => new Date(t * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });

  /* ---------- siren: two-tone wail, stops when silenced ---------- */
  function sirenOn() {
    if (siren) return;
    try {
      const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
      const ctx = new AC(), o = ctx.createOscillator(), g = ctx.createGain(), lfo = ctx.createOscillator(), lg = ctx.createGain();
      o.type = 'sawtooth'; o.frequency.value = 760; lfo.type = 'triangle'; lfo.frequency.value = .55; lg.gain.value = 260;
      lfo.connect(lg); lg.connect(o.frequency); const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 2200;
      o.connect(f); f.connect(g); g.connect(ctx.destination); g.gain.value = .0001; g.gain.linearRampToValueAtTime(.07, ctx.currentTime + .4);
      o.start(); lfo.start(); siren = { ctx, g }; if (ctx.state !== 'running') ctx.resume().catch(() => {});
    } catch (e) {}
  }
  function sirenOff() { if (!siren) return; try { const { ctx, g } = siren; g.gain.linearRampToValueAtTime(.0001, ctx.currentTime + .3); setTimeout(() => ctx.close(), 400); } catch (e) {} siren = null; }

  /* ---------- the button: choose what happened, then send ---------- */
  function openSOS() {
    const crew = STATE.crew || [], me = typeof cur === 'function' && cur();
    if (EM) return showOverlay(true);
    modal(`<div class="sosform"><div class="row" style="gap:12px"><span class="sosico">🚨</span><div><h3>Send an emergency</h3><p class="s t2" style="margin-top:2px">Alerts the whole crew at once and sends a priority message to Mission Control on Earth.</p></div></div>
      <div class="sostypes">${TYPES.map(([k, n, i], j) => `<button type="button" class="sostype" data-t="${k}" aria-pressed="${j === 0}"><span>${i}</span>${n}</button>`).join('')}</div>
      ${crew.length ? `<label class="f" style="margin-top:12px">Who needs help<select id="sosWho">${crew.map(c => `<option value="${c.id}" ${me && me.id === c.id ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}<option value="">Whole crew / station</option></select></label>` : ''}
      <label class="f" style="margin-top:10px">What is happening (optional)<div class="qnote"><textarea id="sosNote" rows="2" placeholder="e.g. chest pain and short of breath, Node 3"></textarea><button class="micbtn" type="button" id="sosMic" aria-label="Speak">${MIC}</button></div></label>
      <div class="row between" style="margin-top:16px"><button class="btn" id="sosCancel">Cancel</button><button class="btn sosgo" id="sosGo">🚨 Send emergency</button></div></div>`);
    $$('.sostype').forEach(b => b.onclick = () => $$('.sostype').forEach(x => x.setAttribute('aria-pressed', x === b)));
    try { attachMic($('#sosMic'), $('#sosNote')); } catch (e) {}
    $('#sosCancel').onclick = closeModal;
    $('#sosGo').onclick = async () => {
      if (busy) return; busy = true;
      const type = $('.sostype[aria-pressed=true]').dataset.t, who = $('#sosWho') ? $('#sosWho').value : '';
      try {
        sirenOn();
        const r = await api('/api/emergency', { body: { type, cid: who || null, by: me ? me.id : null, note: $('#sosNote').value } });
        closeModal(); EM = r.emergency; try { sessionStorage.removeItem(silencedKey(EM.id)); } catch (e) {}
        showOverlay(true); drawBar();
      } catch (e) { toast('Could not send: ' + e.message); sirenOff(); }
      busy = false;
    };
  }

  /* ---------- full-screen alarm ---------- */
  function overlayHTML(e) {
    const st = e.stage, delay = fmtDelay(e.delay);
    const earth = st === 'sending' ? `<b>Sending to Mission Control…</b> arrives in ${fmtDelay(e.arrive_in)} (one-way signal delay ${delay})`
      : st === 'received' ? `<b>Received by Mission Control.</b> Waiting for their reply (${fmtDelay(e.ack_in)})`
      : `<b>Acknowledged by Mission Control.</b> The flight surgeon and flight director are on the loop.`;
    const t = TYPES.find(x => x[0] === e.type) || TYPES[6];
    return `<div class="emo-card"><div class="emo-top"><span class="emo-siren" aria-hidden="true"></span><div><div class="emo-kicker">EMERGENCY · ${tstr(e.t)} · mission day ${Math.floor(e.day)}</div>
      <h2 id="emoTitle">${t[2]} ${esc(e.label)}</h2><p class="emo-who">${e.who ? esc(e.who) : 'Whole crew / station'}${e.by && e.by !== e.who ? ` · reported by ${esc(e.by)}` : ''}</p></div></div>
      ${e.note ? `<p class="emo-note">“${esc(e.note)}”</p>` : ''}
      <div class="emo-grid"><div class="emo-box"><h4>📡 Earth station</h4><div class="emo-stages"><span class="${'sending received acknowledged'.indexOf(st) >= 0 ? 'on' : ''}">Sent</span><span class="${st !== 'sending' ? 'on' : ''}">Received</span><span class="${st === 'acknowledged' ? 'on' : ''}">Acknowledged</span></div><p class="s" style="margin-top:8px">${earth}</p></div>
       <div class="emo-box"><h4>👥 Crew alerted</h4><div class="emo-crew">${(e.crew || []).map(c => `<span>✓ ${esc(c.name)}</span>`).join('') || '<span>All connected screens</span>'}</div><p class="xs" style="margin-top:8px;opacity:.75">Every screen connected to this station shows this alarm.</p></div></div>
      <div class="emo-box" style="margin-top:12px"><h4>First actions</h4><ol class="emo-steps">${(STEPS[e.type] || STEPS.other).map(s => `<li>${esc(s)}</li>`).join('')}</ol><p class="xs" style="opacity:.75;margin-top:6px">The onboard emergency procedures always take precedence.</p></div>
      <div class="row between" style="margin-top:16px;flex-wrap:wrap;gap:10px"><button class="btn emo-btn" id="emoSilence">🔕 Silence alarm on this screen</button><button class="btn emo-btn solid" id="emoResolve">✓ Mark resolved</button></div></div>`;
  }
  function showOverlay(force) {
    const o = $('#emo'); if (!o || !EM) return;
    if (!force && isSilenced(EM.id)) return;
    o.innerHTML = overlayHTML(EM); o.classList.remove('hidden'); requestAnimationFrame(() => o.classList.add('on'));
    if (!isSilenced(EM.id)) sirenOn();
    $('#emoSilence').onclick = () => { try { sessionStorage.setItem(silencedKey(EM.id), '1'); } catch (e) {} sirenOff(); hideOverlay(); drawBar(); };
    $('#emoResolve').onclick = resolve;
  }
  function hideOverlay() { const o = $('#emo'); if (!o) return; o.classList.remove('on'); setTimeout(() => { if (!o.classList.contains('on')) o.classList.add('hidden'); }, 300); }
  async function resolve() {
    const wasOpen = !$('#emo').classList.contains('hidden'); hideOverlay();
    const ok = await ask('<h3>Mark the emergency resolved?</h3><p class="s t2" style="margin-top:6px">The alarm and banner stop on every screen. The event stays in the mission log.</p>', 'Resolve');
    if (!ok) { if (wasOpen) showOverlay(true); return; } await api('/api/emergency/resolve', { body: {} }); EM = null; sirenOff(); hideOverlay(); drawBar(); toast('Emergency marked resolved');
  }
  function drawBar() {
    const b = $('#emBar'), sb = $('#sosBtn'); if (!b) return;
    if (!EM) { b.classList.add('hidden'); sb && sb.classList.remove('active'); return; }
    sb && sb.classList.add('active');
    const stg = EM.stage === 'sending' ? `sending to Earth (${fmtDelay(EM.arrive_in)})` : EM.stage === 'received' ? 'received by Mission Control' : 'Mission Control acknowledged';
    b.innerHTML = `<span class="embar-dot"></span><b>EMERGENCY</b> · ${esc(EM.label)}${EM.who ? ' · ' + esc(EM.who) : ''} <span class="embar-s">· ${stg}</span><span class="embar-open">Open</span>`;
    b.classList.remove('hidden'); b.onclick = () => showOverlay(true);
  }
  async function poll() {
    try {
      const r = await api('/api/emergency'); const prev = EM; EM = r.emergency;
      if (!EM) { if (prev) { sirenOff(); hideOverlay(); toast('The emergency was marked resolved'); } drawBar(); return; }
      drawBar();
      const o = $('#emo');
      if (!isSilenced(EM.id)) { if (!prev || prev.id !== EM.id || o.classList.contains('hidden')) showOverlay(); else { o.innerHTML = overlayHTML(EM); $('#emoSilence').onclick = () => { try { sessionStorage.setItem(silencedKey(EM.id), '1'); } catch (e) {} sirenOff(); hideOverlay(); drawBar(); }; $('#emoResolve').onclick = resolve; } }
      else if (!o.classList.contains('hidden')) { o.innerHTML = overlayHTML(EM); $('#emoSilence').onclick = () => { sirenOff(); hideOverlay(); }; $('#emoResolve').onclick = resolve; }
    } catch (e) {}
  }
  document.addEventListener('DOMContentLoaded', () => {});
  const b = document.getElementById('sosBtn'); if (b) b.onclick = openSOS;
  setInterval(() => { if (!document.hidden) poll(); }, 2500); setTimeout(poll, 800);
  window.openSOS = openSOS;
})();
