/* Vitals in the Void — start sequence, ported from the reference design.
   Stage 1 (hero): orbital Earth video, drifting dust, a WebGL "nebula" fluid trail that follows the
   cursor, parallax stars, the title with an entrance reveal, rotating subtitles and the glass
   "Begin my journey!" button (cursor spotlight + soft space hum).
   Stage 2 (loader): Mars approach video, sped to ~3 s, with a 0–100 % counter.
   Stage 3: hands over to the app (welcome screen: Add Astronaut and the other options).
   Everything stops when the hero is left, so nothing keeps running behind the app. */
(function () {
  let started = false, stopped = false, booted = false, onDone = null;
  const hero = () => document.getElementById('hero');
  const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

  window.startHero = function (done) {
    onDone = done; const H = hero(); if (!H) return done && done();
    H.classList.remove('hidden', 'is-exiting'); H.style.display = '';
    stopped = false; booted = false;
    const v = H.querySelector('.sky video'); if (v && v.play) { const p = v.play(); p && p.catch && p.catch(() => {}); }
    if (!started) { started = true; initDust(); initNebula(); initStars(); initButton(); initSubs(); entrance(); }
    else { subsSchedule(3400); }
  };

  /* ---------------- dust: subtle drifting stars ---------------- */
  function initDust() {
    const canvas = hero().querySelector('canvas.hdust'); if (!canvas || !canvas.getContext) return;
    const ctx = canvas.getContext('2d'); let w = 0, h = 0, dpr = 1, P = [], last = 0;
    function seed() {
      const count = Math.min(95, Math.max(36, Math.round(w * h / 18000))); P = [];
      for (let i = 0; i < count; i++) { const dust = i % 4 === 0, depth = .3 + Math.random() * .7, t = Math.random();
        P.push({ x: Math.random() * w, y: Math.random() * h, r: dust ? 1.4 + Math.random() * 1.8 : .55 + Math.random() * 1.05, vx: (Math.random() - .45) * 4.5 * depth, vy: -(2.2 + Math.random() * 5.8) * depth,
          a: dust ? .08 + Math.random() * .14 : .18 + Math.random() * .42, amp: dust ? .05 : .12 + Math.random() * .22, sp: .4 + Math.random() * .9, ph: Math.random() * 6.283, dust, c: t < .28 ? '121,220,232' : t < .52 ? '206,236,255' : '255,255,255' }); }
    }
    function resize() { dpr = Math.min(devicePixelRatio || 1, 2); w = innerWidth; h = innerHeight; canvas.width = Math.max(1, w * dpr | 0); canvas.height = Math.max(1, h * dpr | 0); ctx.setTransform(dpr, 0, 0, dpr, 0, 0); seed(); }
    function draw(ts) {
      if (stopped) { last = 0; return requestAnimationFrame(draw); }
      if (!last) last = ts; const dt = Math.min(.05, (ts - last) / 1000); last = ts; const t = ts / 1000, rm = reduced();
      ctx.clearRect(0, 0, w, h);
      for (const p of P) {
        if (!rm) { p.x += p.vx * dt; p.y += p.vy * dt; if (p.y < -8) p.y = h + 8; else if (p.y > h + 8) p.y = -8; if (p.x < -8) p.x = w + 8; else if (p.x > w + 8) p.x = -8; }
        const a = p.a + (rm ? 0 : Math.sin(t * p.sp + p.ph) * p.amp); if (a <= .01) continue;
        if (p.dust) { const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.r * 2.4); g.addColorStop(0, `rgba(${p.c},${a.toFixed(3)})`); g.addColorStop(1, `rgba(${p.c},0)`); ctx.fillStyle = g; ctx.beginPath(); ctx.arc(p.x, p.y, p.r * 2.4, 0, 6.283); ctx.fill(); }
        else { ctx.fillStyle = `rgba(${p.c},${a.toFixed(3)})`; ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, 6.283); ctx.fill(); }
      }
      requestAnimationFrame(draw);
    }
    resize(); addEventListener('resize', resize); document.addEventListener('visibilitychange', () => { if (!document.hidden) last = 0; });
    requestAnimationFrame(draw);
  }

  /* ---------------- nebula: fluid cursor trail (WebGL, 2D fallback) ---------------- */
  function spaceTint(t, boost) {
    const pal = [[.62, .90, .94], [.82, .96, .98], [.48, .86, .92], [.70, .92, .96]];
    const i = Math.floor(t) % pal.length, n = (i + 1) % pal.length, f = t - Math.floor(t), m = boost != null ? boost : .85;
    return { r: (pal[i][0] * (1 - f) + pal[n][0] * f) * m, g: (pal[i][1] * (1 - f) + pal[n][1] * f) * m, b: (pal[i][2] * (1 - f) + pal[n][2] * f) * m };
  }
  function initNebula() {
    if (reduced()) return;
    let nebCanvas = hero().querySelector('canvas.nebula'); if (!nebCanvas) return;
    /* luminous trailing dot */
    const dot = hero().querySelector('.nebula-cursor'), ds = { active: false, tx: -100, ty: -100, x: -100, y: -100, btn: false, scale: 1 };
    if (dot && matchMedia('(pointer: fine)').matches) {
      addEventListener('pointermove', e => { if (stopped) return; ds.tx = e.clientX; ds.ty = e.clientY; if (!ds.active) { ds.x = e.clientX; ds.y = e.clientY; ds.active = true; dot.classList.add('is-visible'); } }, { passive: true });
      document.addEventListener('pointerleave', () => { ds.active = false; dot.classList.remove('is-visible'); });
      const b = document.getElementById('heroBtn'); if (b) { b.addEventListener('pointerenter', () => ds.btn = true); b.addEventListener('pointerleave', () => ds.btn = false); }
    }
    const stepDot = () => { if (!dot || !ds.active || stopped) return; ds.x += (ds.tx - ds.x) * .3; ds.y += (ds.ty - ds.y) * .3; ds.scale += ((ds.btn ? .85 : 1) - ds.scale) * .22; dot.style.transform = `translate3d(${ds.x.toFixed(2)}px,${ds.y.toFixed(2)}px,0) scale(${ds.scale.toFixed(3)})`; };

    const params = { alpha: true, depth: false, stencil: false, antialias: false, preserveDrawingBuffer: false, premultipliedAlpha: true };
    let gl = nebCanvas.getContext('webgl2', params); const isWebGL2 = !!gl;
    if (!gl) gl = nebCanvas.getContext('webgl', params) || nebCanvas.getContext('experimental-webgl', params);

    function fresh2D() { const f = document.createElement('canvas'); f.className = nebCanvas.className; f.setAttribute('aria-hidden', 'true'); nebCanvas.parentNode && nebCanvas.parentNode.replaceChild(f, nebCanvas); nebCanvas = f; return f.getContext('2d'); }
    function fallback2D() {
      let c2d = gl ? fresh2D() : nebCanvas.getContext('2d'); if (!c2d) c2d = fresh2D(); if (!c2d) return;
      const wisps = []; let lastP = null, cw = 0, ch = 0, dpr2 = 1;
      const rs = () => { dpr2 = Math.min(devicePixelRatio || 1, 2); cw = innerWidth; ch = innerHeight; nebCanvas.width = Math.max(1, cw * dpr2 | 0); nebCanvas.height = Math.max(1, ch * dpr2 | 0); c2d.setTransform(dpr2, 0, 0, dpr2, 0, 0); };
      rs(); addEventListener('resize', rs);
      addEventListener('pointermove', e => { if (stopped) return; const x = e.clientX, y = e.clientY, dx = lastP ? x - lastP.x : 0, dy = lastP ? y - lastP.y : 0; lastP = { x, y };
        const spd = Math.min(48, Math.hypot(dx, dy)), col = spaceTint(performance.now() * .0004, .95);
        wisps.push({ x, y, vx: dx * .18 + (Math.random() - .5) * 1.1, vy: dy * .18 + (Math.random() - .5) * 1.1, r: 36 + spd * 1.6, life: 1, color: `${Math.min(255, Math.round(col.r * 255))},${Math.min(255, Math.round(col.g * 255))},${Math.min(255, Math.round(col.b * 255))}` });
        if (wisps.length > 120) wisps.shift(); }, { passive: true });
      (function loop() {
        if (!stopped) { stepDot(); c2d.clearRect(0, 0, cw, ch); c2d.globalCompositeOperation = 'lighter';
          for (let i = wisps.length - 1; i >= 0; i--) { const s = wisps[i]; s.x += s.vx; s.y += s.vy; s.vx *= .965; s.vy *= .965; s.r += .75; s.life -= .015; if (s.life <= 0) { wisps.splice(i, 1); continue; }
            const g = c2d.createRadialGradient(s.x, s.y, 0, s.x, s.y, s.r); g.addColorStop(0, `rgba(${s.color},${(s.life * .55).toFixed(3)})`); g.addColorStop(.45, `rgba(180,242,250,${(s.life * .24).toFixed(3)})`); g.addColorStop(1, 'rgba(0,0,0,0)');
            c2d.fillStyle = g; c2d.beginPath(); c2d.arc(s.x, s.y, s.r, 0, 6.283); c2d.fill(); }
          c2d.globalCompositeOperation = 'source-over'; }
        requestAnimationFrame(loop);
      })();
    }
    if (!gl) return fallback2D();

    let halfFloat, linear;
    if (isWebGL2) { gl.getExtension('EXT_color_buffer_float'); gl.getExtension('EXT_color_buffer_half_float'); linear = true; halfFloat = gl.HALF_FLOAT; }
    else { const hf = gl.getExtension('OES_texture_half_float'); linear = !!gl.getExtension('OES_texture_half_float_linear'); halfFloat = hf ? hf.HALF_FLOAT_OES : null; }
    if (!halfFloat) return fallback2D();
    function supportsRT(ifmt, fmt, type) {
      const tex = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texImage2D(gl.TEXTURE_2D, 0, ifmt, 4, 4, 0, fmt, type, null);
      const fbo = gl.createFramebuffer(); gl.bindFramebuffer(gl.FRAMEBUFFER, fbo); gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
      const ok = gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE; gl.bindFramebuffer(gl.FRAMEBUFFER, null); gl.deleteFramebuffer(fbo); gl.deleteTexture(tex); return ok;
    }
    function fmtOf(ifmt, fmt, type) { if (!supportsRT(ifmt, fmt, type)) { if (isWebGL2) { if (ifmt === gl.R16F) return fmtOf(gl.RG16F, gl.RG, type); if (ifmt === gl.RG16F) return fmtOf(gl.RGBA16F, gl.RGBA, type); } return null; } return { internalFormat: ifmt, format: fmt }; }
    const fRGBA = isWebGL2 ? fmtOf(gl.RGBA16F, gl.RGBA, halfFloat) : fmtOf(gl.RGBA, gl.RGBA, halfFloat);
    const fRG = isWebGL2 ? fmtOf(gl.RG16F, gl.RG, halfFloat) : fRGBA, fR = isWebGL2 ? fmtOf(gl.R16F, gl.RED, halfFloat) : fRGBA;
    if (!fRGBA || !fRG || !fR) return fallback2D();
    const filtering = linear ? gl.LINEAR : gl.NEAREST;
    function prog(vs, fs) {
      const p = gl.createProgram(), sh = (t, s) => { const x = gl.createShader(t); gl.shaderSource(x, s); gl.compileShader(x); return x; };
      gl.attachShader(p, sh(gl.VERTEX_SHADER, vs)); gl.attachShader(p, sh(gl.FRAGMENT_SHADER, fs)); gl.bindAttribLocation(p, 0, 'aPosition'); gl.linkProgram(p);
      if (!gl.getProgramParameter(p, gl.LINK_STATUS)) return null; const u = {}; const n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
      for (let i = 0; i < n; i++) { const nm = gl.getActiveUniform(p, i).name; u[nm] = gl.getUniformLocation(p, nm); } return { program: p, uniforms: u };
    }
    const VS = `precision highp float;attribute vec2 aPosition;varying vec2 vUv;varying vec2 vL;varying vec2 vR;varying vec2 vT;varying vec2 vB;uniform vec2 texelSize;
      void main(){vUv=aPosition*0.5+0.5;vL=vUv-vec2(texelSize.x,0.0);vR=vUv+vec2(texelSize.x,0.0);vT=vUv+vec2(0.0,texelSize.y);vB=vUv-vec2(0.0,texelSize.y);gl_Position=vec4(aPosition,0.0,1.0);}`;
    const NB = 'varying highp vec2 vUv;varying highp vec2 vL;varying highp vec2 vR;varying highp vec2 vT;varying highp vec2 vB;';
    const P = {
      splat: prog(VS, `precision highp float;precision highp sampler2D;varying vec2 vUv;uniform sampler2D uTarget;uniform float aspectRatio;uniform vec3 color;uniform vec2 point;uniform float radius;
        void main(){vec2 p=vUv-point.xy;p.x*=aspectRatio;vec3 splat=exp(-dot(p,p)/radius)*color;vec3 base=texture2D(uTarget,vUv).xyz;gl_FragColor=vec4(base+splat,1.0);}`),
      curl: prog(VS, `precision mediump float;precision mediump sampler2D;${NB}uniform sampler2D uVelocity;
        void main(){float L=texture2D(uVelocity,vL).y;float R=texture2D(uVelocity,vR).y;float T=texture2D(uVelocity,vT).x;float B=texture2D(uVelocity,vB).x;gl_FragColor=vec4(0.5*(R-L-T+B),0.0,0.0,1.0);}`),
      vort: prog(VS, `precision highp float;precision highp sampler2D;varying vec2 vUv;varying vec2 vL;varying vec2 vR;varying vec2 vT;varying vec2 vB;uniform sampler2D uVelocity;uniform sampler2D uCurl;uniform float curl;uniform float dt;
        void main(){float L=texture2D(uCurl,vL).x;float R=texture2D(uCurl,vR).x;float T=texture2D(uCurl,vT).x;float B=texture2D(uCurl,vB).x;float C=texture2D(uCurl,vUv).x;
        vec2 force=0.5*vec2(abs(T)-abs(B),abs(R)-abs(L));force/=length(force)+0.0001;force*=curl*C;force.y*=-1.0;vec2 vel=texture2D(uVelocity,vUv).xy;gl_FragColor=vec4(vel+force*dt,0.0,1.0);}`),
      div: prog(VS, `precision mediump float;precision mediump sampler2D;${NB}uniform sampler2D uVelocity;
        void main(){float L=texture2D(uVelocity,vL).x;float R=texture2D(uVelocity,vR).x;float T=texture2D(uVelocity,vT).y;float B=texture2D(uVelocity,vB).y;vec2 C=texture2D(uVelocity,vUv).xy;
        if(vL.x<0.0){L=-C.x;}if(vR.x>1.0){R=-C.x;}if(vT.y>1.0){T=-C.y;}if(vB.y<0.0){B=-C.y;}gl_FragColor=vec4(0.5*(R-L+T-B),0.0,0.0,1.0);}`),
      clear: prog(VS, `precision mediump float;precision mediump sampler2D;varying highp vec2 vUv;uniform sampler2D uTexture;uniform float value;void main(){gl_FragColor=value*texture2D(uTexture,vUv);}`),
      press: prog(VS, `precision mediump float;precision mediump sampler2D;${NB}uniform sampler2D uPressure;uniform sampler2D uDivergence;
        void main(){float L=texture2D(uPressure,vL).x;float R=texture2D(uPressure,vR).x;float T=texture2D(uPressure,vT).x;float B=texture2D(uPressure,vB).x;float d=texture2D(uDivergence,vUv).x;gl_FragColor=vec4((L+R+B+T-d)*0.25,0.0,0.0,1.0);}`),
      grad: prog(VS, `precision mediump float;precision mediump sampler2D;${NB}uniform sampler2D uPressure;uniform sampler2D uVelocity;
        void main(){float L=texture2D(uPressure,vL).x;float R=texture2D(uPressure,vR).x;float T=texture2D(uPressure,vT).x;float B=texture2D(uPressure,vB).x;vec2 v=texture2D(uVelocity,vUv).xy;v.xy-=vec2(R-L,T-B);gl_FragColor=vec4(v,0.0,1.0);}`),
      adv: prog(VS, `precision highp float;precision highp sampler2D;varying vec2 vUv;uniform sampler2D uVelocity;uniform sampler2D uSource;uniform vec2 texelSize;uniform float dt;uniform float dissipation;
        void main(){vec2 coord=vUv-dt*texture2D(uVelocity,vUv).xy*texelSize;vec4 r=texture2D(uSource,coord);gl_FragColor=r/(1.0+dissipation*dt);}`),
      disp: prog(VS, `precision highp float;precision highp sampler2D;varying vec2 vUv;uniform sampler2D uTexture;
        void main(){vec3 c=texture2D(uTexture,vUv).rgb;float peak=max(c.r,max(c.g,c.b));vec3 mist=vec3(0.45,0.85,0.90)*peak*0.75;vec3 core=vec3(0.95,0.99,1.00)*pow(peak,1.7)*1.45;
        vec3 col=1.0-exp(-(c*1.25+mist+core)*1.6);float a=clamp(max(col.r,max(col.g,col.b)),0.0,1.0);gl_FragColor=vec4(col,a);}`)
    };
    if (Object.values(P).some(x => !x)) return fallback2D();
    const qb = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, qb); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, -1, 1, 1, 1, 1, -1]), gl.STATIC_DRAW);
    const ib = gl.createBuffer(); gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ib); gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array([0, 1, 2, 0, 2, 3]), gl.STATIC_DRAW);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0); gl.enableVertexAttribArray(0);
    const blit = t => { if (t == null) { gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight); gl.bindFramebuffer(gl.FRAMEBUFFER, null); } else { gl.viewport(0, 0, t.width, t.height); gl.bindFramebuffer(gl.FRAMEBUFFER, t.fbo); } gl.drawElements(gl.TRIANGLES, 6, gl.UNSIGNED_SHORT, 0); };
    function fbo(w, h, ifmt, fmt, type, param) {
      gl.activeTexture(gl.TEXTURE0); const tex = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, param); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, param);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texImage2D(gl.TEXTURE_2D, 0, ifmt, w, h, 0, fmt, type, null);
      const fb = gl.createFramebuffer(); gl.bindFramebuffer(gl.FRAMEBUFFER, fb); gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
      gl.viewport(0, 0, w, h); gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT);
      return { texture: tex, fbo: fb, width: w, height: h, texelSizeX: 1 / w, texelSizeY: 1 / h, attach(id) { gl.activeTexture(gl.TEXTURE0 + id); gl.bindTexture(gl.TEXTURE_2D, tex); return id; } };
    }
    function dfbo(w, h, ifmt, fmt, type, param) { let a = fbo(w, h, ifmt, fmt, type, param), b = fbo(w, h, ifmt, fmt, type, param);
      return { width: w, height: h, texelSizeX: a.texelSizeX, texelSizeY: a.texelSizeY, get read() { return a; }, get write() { return b; }, swap() { const t = a; a = b; b = t; } }; }
    const res = r => { let asp = gl.drawingBufferWidth / Math.max(1, gl.drawingBufferHeight); if (asp < 1) asp = 1 / asp; const mn = Math.round(r), mx = Math.round(r * asp); return gl.drawingBufferWidth > gl.drawingBufferHeight ? { width: mx, height: mn } : { width: mn, height: mx }; };
    let dye, vel, divg, curl, pres;
    function resize() {
      const d = Math.min(devicePixelRatio || 1, 1.5), nw = Math.max(1, (nebCanvas.clientWidth || innerWidth) * d | 0), nh = Math.max(1, (nebCanvas.clientHeight || innerHeight) * d | 0);
      if (nebCanvas.width === nw && nebCanvas.height === nh && dye) return; nebCanvas.width = nw; nebCanvas.height = nh;
      const sr = res(128), dr = res(512);
      dye = dfbo(dr.width, dr.height, fRGBA.internalFormat, fRGBA.format, halfFloat, filtering); vel = dfbo(sr.width, sr.height, fRG.internalFormat, fRG.format, halfFloat, filtering);
      divg = fbo(sr.width, sr.height, fR.internalFormat, fR.format, halfFloat, gl.NEAREST); curl = fbo(sr.width, sr.height, fR.internalFormat, fR.format, halfFloat, gl.NEAREST);
      pres = dfbo(sr.width, sr.height, fR.internalFormat, fR.format, halfFloat, gl.NEAREST);
    }
    resize(); addEventListener('resize', resize);
    const ptr = { x: 0, y: 0, has: false, tick: 0 }, queue = [];
    function upd(cx, cy) {
      const r = nebCanvas.getBoundingClientRect(), rw = r.width || innerWidth, rh = r.height || innerHeight; if (!rw || !rh) return;
      const nx = (cx - r.left) / rw, ny = 1 - (cy - r.top) / rh;
      if (!ptr.has) { ptr.x = nx; ptr.y = ny; ptr.has = true; queue.push({ px: nx, py: ny, x: nx, y: ny, dx: .008, dy: .008 }); return; }
      const dx = Math.max(-.18, Math.min(.18, (nx - ptr.x) * rw / rh)), dy = Math.max(-.18, Math.min(.18, ny - ptr.y));
      if (Math.abs(dx) > .0001 || Math.abs(dy) > .0001) { queue.push({ px: ptr.x, py: ptr.y, x: nx, y: ny, dx, dy }); if (queue.length > 24) queue.shift(); }
      ptr.x = nx; ptr.y = ny;
    }
    addEventListener('pointermove', e => { if (!stopped) upd(e.clientX, e.clientY); }, { passive: true });
    addEventListener('touchmove', e => { if (!stopped && e.touches && e.touches[0]) upd(e.touches[0].clientX, e.touches[0].clientY); }, { passive: true });
    function splat(x, y, dx, dy, c) {
      gl.useProgram(P.splat.program); gl.uniform1i(P.splat.uniforms.uTarget, vel.read.attach(0)); gl.uniform1f(P.splat.uniforms.aspectRatio, nebCanvas.width / Math.max(1, nebCanvas.height));
      gl.uniform2f(P.splat.uniforms.point, x, y); gl.uniform3f(P.splat.uniforms.color, dx, dy, 0); gl.uniform1f(P.splat.uniforms.radius, .0028); blit(vel.write); vel.swap();
      gl.uniform1i(P.splat.uniforms.uTarget, dye.read.attach(0)); gl.uniform3f(P.splat.uniforms.color, c.r, c.g, c.b); gl.uniform1f(P.splat.uniforms.radius, .0044); blit(dye.write); dye.swap();
    }
    let lt = performance.now(); document.addEventListener('visibilitychange', () => { if (!document.hidden) lt = performance.now(); });
    function step() {
      requestAnimationFrame(step); if (stopped) return; stepDot();
      const now = performance.now(), dt = Math.min((now - lt) / 1000, .0167); lt = now;
      for (const s of queue) { ptr.tick += .025; const dist = Math.hypot(s.x - s.px, s.y - s.py), col = spaceTint(ptr.tick, Math.min(1.25, .68 + dist * 8)), n = Math.min(8, Math.max(1, Math.ceil(dist / .009))), dv = Math.pow(n, .35);
        for (let k = 1; k <= n; k++) { const f = k / n; splat(s.px + (s.x - s.px) * f, s.py + (s.y - s.py) * f, s.dx * 6200 / n, s.dy * 6200 / n, { r: col.r / dv, g: col.g / dv, b: col.b / dv }); } }
      queue.length = 0; gl.disable(gl.BLEND);
      const ts = p => gl.uniform2f(p.uniforms.texelSize, vel.texelSizeX, vel.texelSizeY);
      gl.useProgram(P.curl.program); ts(P.curl); gl.uniform1i(P.curl.uniforms.uVelocity, vel.read.attach(0)); blit(curl);
      gl.useProgram(P.vort.program); ts(P.vort); gl.uniform1i(P.vort.uniforms.uVelocity, vel.read.attach(0)); gl.uniform1i(P.vort.uniforms.uCurl, curl.attach(1)); gl.uniform1f(P.vort.uniforms.curl, 34); gl.uniform1f(P.vort.uniforms.dt, dt); blit(vel.write); vel.swap();
      gl.useProgram(P.div.program); ts(P.div); gl.uniform1i(P.div.uniforms.uVelocity, vel.read.attach(0)); blit(divg);
      gl.useProgram(P.clear.program); gl.uniform1i(P.clear.uniforms.uTexture, pres.read.attach(0)); gl.uniform1f(P.clear.uniforms.value, .8); blit(pres.write); pres.swap();
      gl.useProgram(P.press.program); ts(P.press); gl.uniform1i(P.press.uniforms.uDivergence, divg.attach(0));
      for (let i = 0; i < 20; i++) { gl.uniform1i(P.press.uniforms.uPressure, pres.read.attach(1)); blit(pres.write); pres.swap(); }
      gl.useProgram(P.grad.program); ts(P.grad); gl.uniform1i(P.grad.uniforms.uPressure, pres.read.attach(0)); gl.uniform1i(P.grad.uniforms.uVelocity, vel.read.attach(1)); blit(vel.write); vel.swap();
      gl.useProgram(P.adv.program); ts(P.adv); gl.uniform1i(P.adv.uniforms.uVelocity, vel.read.attach(0)); gl.uniform1i(P.adv.uniforms.uSource, vel.read.attach(0)); gl.uniform1f(P.adv.uniforms.dt, dt); gl.uniform1f(P.adv.uniforms.dissipation, .22); blit(vel.write); vel.swap();
      gl.uniform2f(P.adv.uniforms.texelSize, dye.texelSizeX, dye.texelSizeY); gl.uniform1i(P.adv.uniforms.uVelocity, vel.read.attach(0)); gl.uniform1i(P.adv.uniforms.uSource, dye.read.attach(1)); gl.uniform1f(P.adv.uniforms.dissipation, .86); blit(dye.write); dye.swap();
      gl.useProgram(P.disp.program); gl.uniform1i(P.disp.uniforms.uTexture, dye.read.attach(0)); gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT); blit(null);
    }
    requestAnimationFrame(step);
  }

  /* ---------------- star icons with delayed parallax ---------------- */
  function initStars() {
    if (reduced()) return;
    const S = [...hero().querySelectorAll('.p-star')].map(el => ({ el, depth: parseFloat(el.dataset.depth) || .6, lag: parseFloat(el.dataset.lag) || 2.5, x: 0, y: 0 }));
    let tx = 0, ty = 0, lt = performance.now();
    addEventListener('pointermove', e => { tx = (e.clientX / (innerWidth || 1) - .5) * 2; ty = (e.clientY / (innerHeight || 1) - .5) * 2; }, { passive: true });
    document.documentElement.addEventListener('pointerleave', () => { tx = 0; ty = 0; });
    (function tick(now) { requestAnimationFrame(tick); if (stopped) return; const dt = Math.min(.05, Math.max(.001, (now - lt) / 1000)); lt = now;
      for (const s of S) { const e = 1 - Math.exp(-s.lag * dt); s.x += (tx * 26 * s.depth - s.x) * e; s.y += (ty * 26 * s.depth - s.y) * e; s.el.style.transform = `translate3d(${s.x.toFixed(2)}px,${s.y.toFixed(2)}px,0)`; } })(lt);
  }

  /* ---------------- glass button: spotlight, soft hum, launch ---------------- */
  let audio = null, humOn = false;
  function hum() {
    if (humOn) return;
    try { const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return; if (!audio) audio = new AC();
      const build = () => { if (humOn || audio.state !== 'running') return; humOn = true; const n = audio.currentTime, m = audio.createGain();
        m.gain.setValueAtTime(.0001, n); m.gain.linearRampToValueAtTime(.045, n + 2.4); m.connect(audio.destination); hum.master = m;
        const f = audio.createBiquadFilter(); f.type = 'lowpass'; f.frequency.setValueAtTime(150, n); f.Q.setValueAtTime(1.4, n); f.connect(m);
        const o1 = audio.createOscillator(); o1.type = 'sine'; o1.frequency.setValueAtTime(55, n); o1.connect(f);
        const o2 = audio.createOscillator(); o2.type = 'sine'; o2.frequency.setValueAtTime(55.35, n); const g2 = audio.createGain(); g2.gain.setValueAtTime(.7, n); o2.connect(g2); g2.connect(f);
        const o3 = audio.createOscillator(); o3.type = 'triangle'; o3.frequency.setValueAtTime(82.4, n); const g3 = audio.createGain(); g3.gain.setValueAtTime(.22, n); o3.connect(g3); g3.connect(f);
        const l = audio.createOscillator(); l.type = 'sine'; l.frequency.setValueAtTime(.18, n); const lg = audio.createGain(); lg.gain.setValueAtTime(24, n); l.connect(lg); lg.connect(f.frequency);
        [o1, o2, o3, l].forEach(o => o.start(n)); };
      if (audio.state === 'running') build(); else audio.resume().then(build).catch(() => {}); } catch (e) {}
  }
  function humFade() { try { if (hum.master && audio) { const n = audio.currentTime; hum.master.gain.cancelScheduledValues(n); hum.master.gain.setValueAtTime(hum.master.gain.value, n); hum.master.gain.linearRampToValueAtTime(.0001, n + 2.5); gLaterSafe(() => { try { audio.suspend(); } catch (e) {} humOn = false; }, 2600); } } catch (e) {} }
  const gLaterSafe = (f, ms) => setTimeout(f, ms);
  function initButton() {
    const b = document.getElementById('heroBtn'); if (!b) return;
    const spot = e => { const r = b.getBoundingClientRect(); if (!r.width) return; b.style.setProperty('--mx', ((e.clientX - r.left) / r.width * 100).toFixed(2) + '%'); b.style.setProperty('--my', ((e.clientY - r.top) / r.height * 100).toFixed(2) + '%'); };
    b.addEventListener('pointerenter', spot); b.addEventListener('pointermove', spot);
    ['pointerenter', 'pointerdown'].forEach(ev => b.addEventListener(ev, hum));
    b.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') hum(); });
    b.addEventListener('click', () => { hum(); launch(); });
  }

  /* ---------------- rotating subheading ---------------- */
  const PHR = ['In a universe defined by silence, every heartbeat is a signal.', 'Carrying the fragile rhythm of Earth into the dark.', 'Where the pulse meets the edge of the map.',
    'Translating the language of life against the vastness of the void.', 'Monitoring the quiet spark that outlasts the stars.', 'The architecture of survival where gravity fades.',
    'A single thread of life, held against the infinite.', 'Keeping watch over the human spark.', 'Life, secured in the dark.'];
  let pi = 0, ct = 0, st = 0;
  function subsSchedule(ms) {
    clearTimeout(ct); if (stopped || booted) return; const el = document.getElementById('hero-sub'); if (!el) return;
    ct = setTimeout(() => { if (stopped || booted) return; if (document.hidden) return subsSchedule(2600);
      el.classList.add('is-leaving'); clearTimeout(st);
      st = setTimeout(() => { if (stopped || booted) return; pi = (pi + 1) % PHR.length; el.classList.remove('is-leaving'); el.classList.add('is-entering-start'); el.textContent = PHR[pi]; void el.offsetWidth; el.classList.remove('is-entering-start'); subsSchedule(2600 + Math.round(Math.random() * 1200)); }, 360);
    }, ms);
  }
  function initSubs() { subsSchedule(3400); }

  /* ---------------- entrance reveal ---------------- */
  function entrance() {
    const root = document.documentElement; if (!root.classList.contains('anim')) return; let go = false;
    const start = () => { if (go) return; go = true; requestAnimationFrame(() => requestAnimationFrame(() => { root.classList.add('play'); setTimeout(() => root.classList.remove('anim', 'play'), 2150); })); };
    const guard = setTimeout(start, 500); if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => { clearTimeout(guard); start(); });
  }

  /* ---------------- stage 2: Mars approach loader, then the app ---------------- */
  function launch() {
    if (booted) return; booted = true;
    const H = hero(), M = document.getElementById('mars'), ui = document.getElementById('mars-ui'), vid = document.getElementById('preloader-video'), val = document.getElementById('preloader-value');
    H.classList.add('is-exiting'); M.classList.remove('hidden', 'is-leaving', 'fallback'); ui.classList.remove('is-leaving'); val.textContent = '0';
    requestAnimationFrame(() => M.classList.add('on'));
    setTimeout(() => { stopped = true; const v = H.querySelector('.sky video'); v && v.pause && v.pause(); H.classList.add('hidden'); }, 500);
    humFade();
    let finished = false, safety = 0, fbRaf = 0;
    const finish = () => {
      if (finished) return; finished = true; clearTimeout(safety); cancelAnimationFrame(fbRaf); val.textContent = '100'; ui.classList.add('is-leaving');
      onDone && onDone();
      setTimeout(() => M.classList.add('is-leaving'), 220);
      setTimeout(() => { vid.pause && vid.pause(); M.classList.add('hidden'); M.classList.remove('on', 'is-leaving', 'fallback'); }, 950);
    };
    /* without the video (offline), a drawn Mars zoom plays for the same ~3 s */
    const fallback = () => { if (finished) return; M.classList.add('fallback'); const t0 = performance.now();
      (function f(now) { const p = Math.min(1, (now - t0) / 3000); val.textContent = String(Math.round(p * 100)); M.style.setProperty('--zp', p.toFixed(4)); if (p < 1) fbRaf = requestAnimationFrame(f); else finish(); })(t0); };
    const count = () => { if (finished) return; if (vid.duration && isFinite(vid.duration)) val.textContent = String(Math.min(100, Math.max(0, Math.round(vid.currentTime / vid.duration * 100)))); if (!vid.ended) requestAnimationFrame(count); };
    const play = () => {
      if (vid.duration && isFinite(vid.duration) && vid.duration > 0) vid.playbackRate = Math.max(.25, vid.duration / 3);
      vid.addEventListener('ended', finish, { once: true }); safety = setTimeout(finish, 4500);
      const p = vid.play(); if (p && p.then) p.then(() => requestAnimationFrame(count)).catch(() => { clearTimeout(safety); fallback(); }); else requestAnimationFrame(count);
    };
    if (!vid || vid.error) return fallback();
    try { vid.currentTime = 0; } catch (e) {}
    if (vid.readyState >= 1) play();
    else { let s = false; const meta = () => { if (s) return; s = true; play(); };
      vid.addEventListener('loadedmetadata', meta, { once: true }); vid.addEventListener('error', () => { if (!s) { s = true; fallback(); } }, { once: true });
      setTimeout(() => { if (!s) { s = true; vid.readyState >= 1 ? play() : fallback(); } }, 1500); }
  }
})();
