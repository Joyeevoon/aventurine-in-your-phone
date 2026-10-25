(() => {
'use strict';
const $ = s => document.querySelector(s);
const stage = $('#stage');
const vIdle = $('#vIdle'), vTalk = $('#vTalk');
const fogCv = $('#fogCanvas'), crackCv = $('#crackCanvas');
const dialog = $('#dialog'), dlgText = $('#dlgText');
const tapLayer = $('#tapLayer'), tapHint = $('#tapHint'), fogHint = $('#fogHint');
const toolbar = $('#toolbar'), restoreBtn = $('#restoreBtn');
const musicBtn = $('#musicBtn'), stickerBtn = $('#stickerBtn'), cameraBtn = $('#cameraBtn');
const stickerPanel = $('#stickerPanel'), stickerLayer = $('#stickerLayer');
const postcard = $('#postcard'), pcImg = $('#pcImg');

const LINES = {
  ask: '试着点击屏幕，带我离开这里？',
  crack: '不好，屏幕碎裂了，但就这样隔着一层屏幕，也要陪我久一点好不好？',
  healed: '……修好了。那就别走了，再陪我一会儿。'
};
const FOG_TOTAL = 6000, FOG_FADE_FROM = 4000;

/* ---------------- asset loading with progress (plain files: mp4 video + mp3 audio) ---------------- */
const ASSETS = [
  { key: 'idle', url: './assets/sj1.mp4', w: 2745, kind: 'video', el: 'vIdle' },
  { key: 'talk', url: './assets/sj2.mp4', w: 1744, kind: 'video', el: 'vTalk' },
  { key: 'bgm', url: './audio/bgm.mp3', w: 2213, kind: 'audio' },
  { key: 'line1', url: './audio/line1.mp3', w: 62, kind: 'audio' },
  { key: 'line2', url: './audio/line2.mp3', w: 203, kind: 'audio' },
  { key: 'line3', url: './audio/line3.mp3', w: 101, kind: 'audio' },
  { key: 'st1', url: './assets/sticker1.png', w: 55, kind: 'image', img: 1 },
  { key: 'st2', url: './assets/sticker2.png', w: 150, kind: 'image', img: 2 }
];
const totalW = ASSETS.reduce((s, x) => s + x.w, 0);
const prog = {};
const ldFill = $('#ldFill'), ldNum = $('#ldNum'), loader = $('#loader');
let shownPct = 0, targetPct = 0;
function updateProgress() {
  let done = 0;
  for (const a of ASSETS) done += (prog[a.key] || 0) * a.w;
  targetPct = Math.min(100, Math.round(done / totalW * 100));
}
(function tickProgress() {
  if (shownPct < targetPct) shownPct = Math.min(targetPct, shownPct + Math.max(1, Math.round((targetPct - shownPct) / 6)));
  ldFill.style.width = shownPct + '%';
  ldNum.textContent = shownPct + '%';
  if (shownPct < 100) requestAnimationFrame(tickProgress);
  else onLoaded();
})();

const voices = {};
const bgm = new Audio();
bgm.loop = true; bgm.preload = 'auto';
function trackMedia(el, a) {
  return new Promise(resolve => {
    let finished = false;
    const fin = () => { if (finished) return; finished = true; prog[a.key] = 1; updateProgress(); resolve(); };
    const bump = v => { prog[a.key] = Math.max(prog[a.key] || 0, Math.min(.99, v)); updateProgress(); };
    el.addEventListener('progress', () => {
      try {
        if (el.duration && el.buffered.length) {
          const p = el.buffered.end(el.buffered.length - 1) / el.duration;
          bump(p); if (p >= .98) fin();
        }
      } catch (e) {}
    });
    el.addEventListener('loadedmetadata', () => { bump(.4); if (a.kind === 'audio') fin(); });
    el.addEventListener('loadeddata', () => bump(.75));
    el.addEventListener('canplaythrough', fin);
    el.addEventListener('error', fin);
    setTimeout(fin, a.kind === 'video' ? 9000 : 5000); // never hang the loader
    el.preload = 'auto';
    if (!el.getAttribute('src')) el.src = a.url;
    if (typeof el.load === 'function') el.load();
  });
}
function trackImage(img, a) {
  return new Promise(resolve => {
    const fin = () => { prog[a.key] = 1; updateProgress(); resolve(); };
    if (img.complete && img.naturalWidth) return fin();
    img.addEventListener('load', fin); img.addEventListener('error', fin);
    if (!img.src) img.src = a.url;
  });
}
function loadAll() {
  ASSETS.forEach(a => {
    if (a.kind === 'video') trackMedia(document.getElementById(a.el), a);
    else if (a.key === 'bgm') trackMedia(bgm, a);
    else if (a.kind === 'audio') { const el = new Audio(); voices[a.key] = el; trackMedia(el, a); }
    else trackImage(stickerImgs[a.img], a);
  });
}
let loadedOnce = false;
function onLoaded() {
  if (loadedOnce) return; loadedOnce = true;
  loader.classList.add('ready');
  loader.addEventListener('pointerup', start, { once: true });
}

/* ---------------- audio (native media elements; WebAudio only for synthesized SFX) ---------------- */
const AC = window.AudioContext || window.webkitAudioContext;
let ac = null, musicOn = true, voiceSrc = null;
function setupAudio() {
  try { if (AC) ac = new AC(); } catch (e) { ac = null; }
  // unlock every voice element inside this tap so it can speak later without a new gesture
  Object.keys(voices).forEach(k => {
    const v = voices[k];
    v.muted = true;
    const p = v.play();
    const reset = () => { try { v.pause(); v.currentTime = 0; } catch (e) {} v.muted = false; };
    if (p && typeof p.then === 'function') p.then(reset, reset); else reset();
  });
}
const BGM_VOL = .42, BGM_DUCK = .14;
let bgmFade = null;
function bgmTo(v, t) {
  clearInterval(bgmFade);
  const from = bgm.volume, dur = Math.max(.05, t === undefined ? .6 : t) * 1000, t0 = Date.now();
  bgmFade = setInterval(() => {
    const k = Math.min(1, (Date.now() - t0) / dur);
    try { bgm.volume = Math.max(0, Math.min(1, from + (v - from) * k)); } catch (e) {}
    if (k >= 1) clearInterval(bgmFade);
  }, 30);
}
function setMusic(on) {
  musicOn = on;
  musicBtn.classList.toggle('on', on);
  if (on) { const p = bgm.play(); if (p && p.catch) p.catch(() => {}); bgmTo(voiceSrc ? BGM_DUCK : BGM_VOL, .8); }
  else { bgmTo(0, .3); setTimeout(() => { if (!musicOn) bgm.pause(); }, 350); }
}
const VOICE_FALLBACK = { line1: 2.6, line2: 8.6, line3: 4.3 };
function playVoice(key, onEnd) {
  stopVoice();
  const a = voices[key];
  const handle = {};
  voiceSrc = handle;
  const done = () => { if (voiceSrc !== handle) return; voiceSrc = null; if (musicOn) bgmTo(BGM_VOL, 1); if (onEnd) onEnd(); };
  if (musicOn) bgmTo(BGM_DUCK, .3);
  const dur = a && isFinite(a.duration) && a.duration > 0 ? a.duration : VOICE_FALLBACK[key];
  if (!a) { setTimeout(done, dur * 1000); return dur; }
  a.muted = false;
  try { a.currentTime = 0; } catch (e) {}
  a.onended = done;
  const p = a.play();
  if (p && p.catch) p.catch(() => setTimeout(done, dur * 1000));
  handle.stop = () => { a.onended = null; a.pause(); };
  return dur;
}
function stopVoice() { if (voiceSrc && voiceSrc.stop) voiceSrc.stop(); voiceSrc = null; }

function sfxCrack() {
  if (!ac) return;
  const n = ac.currentTime, len = .5, sr = ac.sampleRate;
  const buf = ac.createBuffer(1, sr * len, sr), d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) {
    const t = i / sr;
    const env = Math.exp(-t * 18) + (Math.random() < .004 ? .8 * Math.exp(-t * 6) : 0);
    d[i] = (Math.random() * 2 - 1) * env;
  }
  const s = ac.createBufferSource(); s.buffer = buf;
  const hp = ac.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 2200;
  const g = ac.createGain(); g.gain.value = .5;
  s.connect(hp).connect(g).connect(ac.destination); s.start(n);
  [0, .03, .07].forEach((dt, i) => {
    const o = ac.createOscillator(), og = ac.createGain();
    o.type = 'sine'; o.frequency.value = 3800 + i * 900;
    og.gain.setValueAtTime(.08, n + dt); og.gain.exponentialRampToValueAtTime(.0001, n + dt + .25);
    o.connect(og).connect(ac.destination); o.start(n + dt); o.stop(n + dt + .3);
  });
}
function sfxChime() {
  if (!ac) return;
  const n = ac.currentTime;
  [1318.5, 1760, 2349.3].forEach((f, i) => {
    const o = ac.createOscillator(), g = ac.createGain();
    o.type = 'sine'; o.frequency.value = f;
    g.gain.setValueAtTime(0, n + i * .09); g.gain.linearRampToValueAtTime(.09, n + i * .09 + .02);
    g.gain.exponentialRampToValueAtTime(.0001, n + i * .09 + 1.2);
    o.connect(g).connect(ac.destination); o.start(n + i * .09); o.stop(n + i * .09 + 1.3);
  });
}
function sfxShutter() {
  if (!ac) return;
  const n = ac.currentTime, sr = ac.sampleRate;
  [0, .085].forEach(dt => {
    const buf = ac.createBuffer(1, sr * .06, sr), d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * Math.exp(-i / sr * 70);
    const s = ac.createBufferSource(); s.buffer = buf;
    const bp = ac.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 1800; bp.Q.value = .8;
    const g = ac.createGain(); g.gain.value = .7;
    s.connect(bp).connect(g).connect(ac.destination); s.start(n + dt);
  });
}

/* ---------------- stage sizing ---------------- */
// stage = what the screen shows; scene = the 9:16 picture, cover-fitted inside the stage
const scene = $('#scene');
let SW = 0, SH = 0, StW = 0, StH = 0, SX = 0, SY = 0, DPR = 1;
function resize() {
  const vw = window.innerWidth, vh = window.innerHeight;
  const wide = vw / vh > 0.8; // landscape / near-square: portrait column on a backdrop
  stage.style.width = wide ? Math.round(vh * 9 / 16) + 'px' : '100%';
  stage.style.height = '100%';
  const r = stage.getBoundingClientRect();
  StW = r.width; StH = r.height; DPR = Math.min(2, window.devicePixelRatio || 1);
  if (StW / StH < 9 / 16) { SH = StH; SW = StH * 9 / 16; SX = (StW - SW) / 2; SY = 0; }
  else { SW = StW; SH = StW * 16 / 9; SX = 0; SY = -(SH - StH) * 0.42; } // crop a touch more from the bottom, keep his face
  scene.style.width = SW + 'px'; scene.style.height = SH + 'px';
  scene.style.left = SX + 'px'; scene.style.top = SY + 'px';
  crackCv.width = Math.round(SW * DPR); crackCv.height = Math.round(SH * DPR);
  if (fog.active) fog.resize();
  if (crack.geo) crack.render(crack.r);
  layoutStickers();
}
const stagePt = e => { const r = stage.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };
const scenePt = e => { const r = scene.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };

/* ---------------- fog ---------------- */
const fog = {
  active: false, t0: 0, mask: null, mctx: null, tex: null, drips: [], last: null, drew: false,
  resize() {
    const w = Math.round(StW * DPR), h = Math.round(StH * DPR);
    const old = this.mask;
    fogCv.width = w; fogCv.height = h;
    this.mask = document.createElement('canvas'); this.mask.width = w; this.mask.height = h;
    this.mctx = this.mask.getContext('2d');
    if (old) this.mctx.drawImage(old, 0, 0, w, h);
    this.makeTexture(w, h);
  },
  makeTexture(w, h) {
    const t = document.createElement('canvas'); t.width = w; t.height = h;
    const c = t.getContext('2d');
    const g = c.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, 'rgba(244,247,250,.24)'); g.addColorStop(.5, 'rgba(236,241,245,.17)'); g.addColorStop(1, 'rgba(228,235,241,.26)');
    c.fillStyle = g; c.fillRect(0, 0, w, h);
    for (let i = 0; i < 140; i++) {
      const x = Math.random() * w, y = Math.random() * h, r = (40 + Math.random() * 160) * DPR;
      const rg = c.createRadialGradient(x, y, 0, x, y, r);
      const a = .03 + Math.random() * .07;
      rg.addColorStop(0, `rgba(255,255,255,${a})`); rg.addColorStop(1, 'rgba(255,255,255,0)');
      c.fillStyle = rg; c.fillRect(x - r, y - r, r * 2, r * 2);
    }
    // condensation beads
    for (let i = 0; i < 200; i++) {
      const x = Math.random() * w, y = Math.random() * h;
      const r = (Math.random() < .9 ? .6 + Math.random() * 1.6 : 2 + Math.random() * 3.2) * DPR;
      c.fillStyle = 'rgba(160,178,192,.12)'; c.beginPath(); c.arc(x + r * .25, y + r * .3, r, 0, 7); c.fill();
      c.fillStyle = 'rgba(255,255,255,.38)'; c.beginPath(); c.arc(x, y, r * .9, 0, 7); c.fill();
      c.fillStyle = 'rgba(255,255,255,.55)'; c.beginPath(); c.arc(x - r * .3, y - r * .3, r * .3, 0, 7); c.fill();
    }
    this.tex = t;
  },
  start() {
    this.active = true; this.resize(); this.t0 = performance.now();
    fogCv.addEventListener('pointerdown', this.down);
    window.addEventListener('pointermove', this.move);
    window.addEventListener('pointerup', this.up);
    requestAnimationFrame(this.frame);
  },
  brush(x, y) {
    const c = this.mctx, r = Math.max(22, SW / 15) * DPR;
    const g = c.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, 'rgba(0,0,0,1)'); g.addColorStop(.55, 'rgba(0,0,0,.92)'); g.addColorStop(1, 'rgba(0,0,0,0)');
    c.fillStyle = g; c.fillRect(x - r, y - r, r * 2, r * 2);
    if (Math.random() < .045 && this.drips.length < 40) this.drips.push({ x: x + (Math.random() - .5) * r, y: y + r * .6, v: (0.6 + Math.random()) * DPR, life: 60 + Math.random() * 120, r: (2 + Math.random() * 2.5) * DPR });
  },
  stroke(p) {
    const x = p.x * DPR, y = p.y * DPR;
    if (this.last) {
      const dx = x - this.last.x, dy = y - this.last.y, d = Math.hypot(dx, dy), step = Math.max(4, SW / 60) * DPR;
      for (let s = step; s < d; s += step) this.brush(this.last.x + dx * s / d, this.last.y + dy * s / d);
    }
    this.brush(x, y); this.last = { x, y };
    if (!this.drew) { this.drew = true; fogHint.classList.add('out'); }
  },
  down: e => { if (!fog.active) return; fog.pid = e.pointerId; fog.last = null; fog.stroke(stagePt(e)); },
  move: e => { if (fog.active && fog.pid === e.pointerId) fog.stroke(stagePt(e)); },
  up: e => { if (fog.pid === e.pointerId) { fog.pid = null; fog.last = null; } },
  frame: now => {
    if (!fog.active) return;
    const t = now - fog.t0;
    const c = fogCv.getContext('2d'), w = fogCv.width, h = fogCv.height;
    // drips sliding down the glass
    const m = fog.mctx; m.fillStyle = '#000';
    for (const d of fog.drips) { if (d.life-- <= 0) continue; d.y += d.v; d.x += (Math.random() - .5) * .6 * DPR; m.beginPath(); m.arc(d.x, d.y, d.r, 0, 7); m.fill(); d.r *= .997; }
    // frosted glass: very blurred view of him + mist texture, minus finger strokes
    c.globalCompositeOperation = 'source-over'; c.globalAlpha = 1;
    c.clearRect(0, 0, w, h);
    c.drawImage(fog.tex, 0, 0);
    c.globalCompositeOperation = 'destination-out';
    c.drawImage(fog.mask, 0, 0);
    c.globalCompositeOperation = 'source-over';
    // auto evaporation — completely clear by 6 s
    if (t > FOG_FADE_FROM) { const k = Math.min(1, (t - FOG_FADE_FROM) / (FOG_TOTAL - FOG_FADE_FROM)); fogCv.style.opacity = String(1 - k * k * (3 - 2 * k)); }
    if (t >= FOG_TOTAL) return fog.finish();
    requestAnimationFrame(fog.frame);
  },
  finish() {
    this.active = false;
    fogCv.style.opacity = '0'; fogCv.classList.add('gone'); fogHint.classList.add('out');
    fogCv.removeEventListener('pointerdown', this.down);
    window.removeEventListener('pointermove', this.move);
    window.removeEventListener('pointerup', this.up);
    setTimeout(() => { fogCv.getContext('2d').clearRect(0, 0, fogCv.width, fogCv.height); fogCv.style.display = 'none'; }, 400);
    setTimeout(beginStory, 500);
  }
};

/* ---------------- dialogue ---------------- */
let typeTimer = null;
function say(text, dur) {
  dialog.classList.add('on');
  clearInterval(typeTimer);
  dlgText.textContent = '';
  const chars = [...text]; let i = 0;
  const per = Math.max(40, Math.min(120, (dur ? dur * 1000 * .8 : 1800) / chars.length));
  typeTimer = setInterval(() => { dlgText.textContent += chars[i++]; if (i >= chars.length) clearInterval(typeTimer); }, per);
}
function hideDialog() { dialog.classList.remove('on'); }
function setTalking(on) {
  stage.classList.toggle('talking', on);
  if (on) {
    try { vTalk.currentTime = 0; } catch (e) {}
    const p = vTalk.play(); if (p && p.catch) p.catch(() => {});
  } else {
    setTimeout(() => { if (!stage.classList.contains('talking')) vTalk.pause(); }, 400);
  }
}

/* ---------------- story flow ---------------- */
let state = 'loading'; // fog → ask → await → cracked → restored
function start() {
  setupAudio();
  setMusic(true);
  const play = el => { const p = el.play(); if (p && p.catch) p.catch(() => {}); };
  play(vIdle); play(vTalk);
  loader.classList.add('out');
  setTimeout(() => loader.remove(), 800);
  state = 'fog';
  resize();
  fog.start();
}
function beginStory() {
  state = 'ask';
  toolbar.classList.add('on');
  setTalking(true);
  const dur = playVoice('line1', () => { setTalking(false); state = 'await'; tapHint.classList.add('on'); });
  say(LINES.ask, dur);
}
tapLayer.addEventListener('pointerdown', e => {
  if (selected) { select(null); return; }
  if (!stickerPanel.classList.contains('hidden')) { closePanel(); return; }
  if (state !== 'await' && state !== 'restored') return;
  const p = scenePt(e);
  doCrack(p.x, p.y);
});
function doCrack(x, y) {
  state = 'cracked';
  tapHint.classList.remove('on');
  crack.make(x, y); crack.grow();
  sfxCrack();
  stage.classList.remove('shake'); void stage.offsetWidth; stage.classList.add('shake');
  if (navigator.vibrate) navigator.vibrate(40);
  setTimeout(() => {
    setTalking(true);
    const dur = playVoice('line2', () => setTalking(false));
    say(LINES.crack, dur);
  }, 550);
  setTimeout(() => restoreBtn.classList.remove('hidden'), 1400);
}
restoreBtn.addEventListener('click', () => {
  if (state !== 'cracked') return;
  restoreBtn.classList.add('hidden');
  stopVoice(); setTalking(false);
  sfxChime();
  const hs = $('#healSweep'); hs.classList.remove('run'); void hs.offsetWidth; hs.classList.add('run');
  crack.shrink(() => {
    state = 'restored';
    setTalking(true);
    const dur = playVoice('line3', () => setTalking(false));
    say(LINES.healed, dur);
    setTimeout(() => { if (state === 'restored') { hideDialog(); tapHint.classList.add('on'); } }, Math.max(4200, (dur || 4.3) * 1000 + 1800));
  });
});

/* ---------------- subtle glass crack ---------------- */
const crack = {
  geo: null, r: 0,
  make(px, py) {
    const U = SW; // geometry normalised by stage width
    const x = px / U, y = py / U, s = 1 / 400;
    const n = 9 + (Math.random() * 4 | 0);
    const rays = [];
    for (let i = 0; i < n; i++) {
      let a = i / n * Math.PI * 2 + (Math.random() - .5) * .45;
      const len = (55 + Math.random() * 150 + (Math.random() < .3 ? 90 : 0)) * s;
      const pts = [{ x, y, d: 0 }]; let cx = x, cy = y, d = 0;
      while (d < len) {
        const st = (8 + Math.random() * 16) * s; a += (Math.random() - .5) * .38;
        cx += Math.cos(a) * st; cy += Math.sin(a) * st; d += st;
        pts.push({ x: cx, y: cy, d });
      }
      const br = [];
      if (Math.random() < .55 && pts.length > 4) { // small branch
        const k = 2 + (Math.random() * (pts.length - 3) | 0), b0 = pts[k];
        let ba = a + (Math.random() < .5 ? -1 : 1) * (.4 + Math.random() * .5), bx = b0.x, by = b0.y;
        br.push({ x: bx, y: by, d: b0.d });
        for (let j = 0, bd = b0.d; j < 3 + (Math.random() * 3 | 0); j++) { const st = (7 + Math.random() * 10) * s; ba += (Math.random() - .5) * .4; bx += Math.cos(ba) * st; by += Math.sin(ba) * st; bd += st; br.push({ x: bx, y: by, d: bd }); }
      }
      rays.push({ pts, len, br });
    }
    const rings = [];
    [16, 38, 70].forEach((R, ri) => {
      const rr = R * s;
      for (let i = 0; i < n; i++) {
        if (Math.random() > (ri === 0 ? .9 : .55)) continue;
        const A = rays[i], B = rays[(i + 1) % n];
        const pa = nearest(A.pts, rr), pb = nearest(B.pts, rr);
        if (!pa || !pb) continue;
        const mx = (pa.x + pb.x) / 2 + (Math.random() - .5) * 6 * s, my = (pa.y + pb.y) / 2 + (Math.random() - .5) * 6 * s;
        rings.push({ a: pa, m: { x: mx, y: my }, b: pb, d: rr });
      }
    });
    const shards = [];
    for (let i = 0; i < n; i++) {
      if (Math.random() < .45) continue;
      const A = nearest(rays[i].pts, 30 * s), B = nearest(rays[(i + 1) % n].pts, 30 * s);
      if (A && B) shards.push({ a: A, b: B, al: .05 + Math.random() * .13 });
    }
    const chips = [];
    for (let i = 0; i < 14; i++) { const a = Math.random() * 7, r0 = Math.random() * 4 * s, r1 = r0 + (3 + Math.random() * 8) * s; chips.push([x + Math.cos(a) * r0, y + Math.sin(a) * r0, x + Math.cos(a + .2) * r1, y + Math.sin(a + .2) * r1]); }
    this.geo = { x, y, rays, rings, shards, chips, max: Math.max(...rays.map(r => r.len)) + 20 * s };
    function nearest(pts, rr) { for (const p of pts) if (p.d >= rr) return p; return null; }
  },
  render(rad) {
    this.r = rad;
    const g = this.geo, c = crackCv.getContext('2d'), K = SW * DPR;
    c.setTransform(1, 0, 0, 1, 0, 0); c.clearRect(0, 0, crackCv.width, crackCv.height);
    if (!g || rad <= 0) return;
    c.save();
    c.beginPath(); c.arc(g.x * K, g.y * K, rad * K, 0, 7); c.clip();
    c.lineCap = 'round'; c.lineJoin = 'round';
    // faint refraction facets
    for (const sh of g.shards) {
      c.fillStyle = `rgba(255,255,255,${sh.al})`;
      c.beginPath(); c.moveTo(g.x * K, g.y * K); c.lineTo(sh.a.x * K, sh.a.y * K); c.lineTo(sh.b.x * K, sh.b.y * K); c.closePath(); c.fill();
    }
    const line = (pts, w0, total) => {
      for (let i = 1; i < pts.length; i++) {
        const t = pts[i].d / total, w = Math.max(.35, w0 * (1 - t * .8)) * DPR;
        // dark refraction edge
        c.strokeStyle = 'rgba(40,50,70,.32)'; c.lineWidth = w + .9 * DPR;
        c.beginPath(); c.moveTo(pts[i - 1].x * K + .7 * DPR, pts[i - 1].y * K + .7 * DPR); c.lineTo(pts[i].x * K + .7 * DPR, pts[i].y * K + .7 * DPR); c.stroke();
        c.strokeStyle = `rgba(255,255,255,${.95 - t * .45})`; c.lineWidth = w;
        c.beginPath(); c.moveTo(pts[i - 1].x * K, pts[i - 1].y * K); c.lineTo(pts[i].x * K, pts[i].y * K); c.stroke();
      }
    };
    c.shadowColor = 'rgba(255,255,255,.7)'; c.shadowBlur = 3 * DPR;
    for (const r of g.rays) { line(r.pts, 1.6, r.len); if (r.br.length) line(r.br, .9, r.len); }
    for (const rg of g.rings) {
      const w = Math.max(.4, 1.1 - rg.d * 400 / 90) * DPR;
      c.strokeStyle = 'rgba(40,50,70,.25)'; c.lineWidth = w + .8 * DPR;
      c.beginPath(); c.moveTo(rg.a.x * K + .6, rg.a.y * K + .6); c.lineTo(rg.m.x * K + .6, rg.m.y * K + .6); c.lineTo(rg.b.x * K + .6, rg.b.y * K + .6); c.stroke();
      c.strokeStyle = 'rgba(255,255,255,.8)'; c.lineWidth = w;
      c.beginPath(); c.moveTo(rg.a.x * K, rg.a.y * K); c.lineTo(rg.m.x * K, rg.m.y * K); c.lineTo(rg.b.x * K, rg.b.y * K); c.stroke();
    }
    c.lineWidth = .7 * DPR; c.strokeStyle = 'rgba(255,255,255,.9)';
    for (const ch of g.chips) { c.beginPath(); c.moveTo(ch[0] * K, ch[1] * K); c.lineTo(ch[2] * K, ch[3] * K); c.stroke(); }
    // impact point
    const rg = c.createRadialGradient(g.x * K, g.y * K, 0, g.x * K, g.y * K, 9 / 400 * K);
    rg.addColorStop(0, 'rgba(255,255,255,.75)'); rg.addColorStop(1, 'rgba(255,255,255,0)');
    c.fillStyle = rg; c.beginPath(); c.arc(g.x * K, g.y * K, 9 / 400 * K, 0, 7); c.fill();
    c.restore();
  },
  grow() {
    crackCv.classList.add('on');
    const t0 = performance.now(), max = this.geo.max;
    const f = now => { const k = Math.min(1, (now - t0) / 380); this.render(max * (1 - Math.pow(1 - k, 3))); if (k < 1) requestAnimationFrame(f); };
    requestAnimationFrame(f);
  },
  shrink(done) {
    const t0 = performance.now(), max = this.geo.max;
    const f = now => {
      const k = Math.min(1, (now - t0) / 700);
      this.render(max * (1 - k * k));
      if (k < 1) requestAnimationFrame(f); else { this.geo = null; crackCv.classList.remove('on'); this.render(0); done && done(); }
    };
    requestAnimationFrame(f);
  }
};

/* ---------------- stickers ---------------- */
const stickerImgs = { 1: new Image(), 2: new Image() };
// face anchor presets, in stage fractions (eyes / cheeks of 砂金, tilted with his head)
const PRESET = {
  1: { cx: .445, cy: .283, w: .40, rot: -15 },
  2: { cx: .462, cy: .335, w: .58, rot: -14 }
};
const stickers = []; let selected = null, zTop = 1;
stickerBtn.addEventListener('click', () => {
  if (state === 'loading' || state === 'fog') return;
  const open = stickerPanel.classList.contains('hidden');
  if (open) { stickerPanel.classList.remove('hidden'); stickerBtn.classList.add('active'); }
  else closePanel();
});
function closePanel() { stickerPanel.classList.add('hidden'); stickerBtn.classList.remove('active'); select(null); }
$('#closeStickers').addEventListener('click', closePanel);
$('#clearStickers').addEventListener('click', () => { while (stickers.length) stickers.pop().el.remove(); selected = null; });
document.querySelectorAll('.sp-item').forEach(b => b.addEventListener('click', () => addSticker(+b.dataset.id)));

function addSticker(id) {
  const p = PRESET[id], img = stickerImgs[id];
  const off = stickers.filter(s => s.id === id).length * .03;
  const s = { id, cx: p.cx + off, cy: p.cy + off, w: p.w, scale: 1, rot: p.rot, ar: (img.naturalHeight || 1) / (img.naturalWidth || 3) };
  const el = document.createElement('div'); el.className = 'stk';
  el.innerHTML = `<img src="${img.src}" alt=""><span class="frame"></span>
    <span class="h h-del" data-act="del"><svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></svg></span>
    <span class="h h-rot" data-act="rot"><svg viewBox="0 0 24 24"><path d="M20 12a8 8 0 1 1-2.3-5.7"/><path d="M20 4v4h-4"/></svg></span>`;
  s.el = el; stickerLayer.appendChild(el); stickers.push(s);
  bindSticker(s); layoutSticker(s); select(s);
  if (typeof el.animate === 'function') el.animate([{ opacity: 0, filter: 'brightness(2)' }, { opacity: 1, filter: 'none' }], { duration: 300 });
}
function layoutSticker(s) {
  const w = s.w * SW, h = w * s.ar;
  Object.assign(s.el.style, { width: w + 'px', height: h + 'px', left: (s.cx * SW - w / 2) + 'px', top: (s.cy * SH - h / 2) + 'px', transform: `rotate(${s.rot}deg) scale(${s.scale})` });
  s.el.querySelectorAll('.h').forEach(h => h.style.transform = `scale(${1 / s.scale})`);
  s.el.querySelector('.frame').style.borderWidth = (1.5 / s.scale) + 'px';
}
function layoutStickers() { stickers.forEach(layoutSticker); }
function select(s) {
  stickers.forEach(o => o.el.classList.toggle('sel', o === s));
  selected = s; if (s) s.el.style.zIndex = ++zTop;
}
function bindSticker(s) {
  const pts = new Map(); let g = null;
  const center = () => { const r = scene.getBoundingClientRect(); return { x: r.left + s.cx * SW, y: r.top + s.cy * SH }; };
  const snap = () => {
    const arr = [...pts.values()];
    if (g && g.mode === 'rot') return;
    if (arr.length >= 2) {
      const [a, b] = arr;
      g = { mode: 'pinch', d: Math.hypot(b.x - a.x, b.y - a.y), a: Math.atan2(b.y - a.y, b.x - a.x), mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2, s: s.scale, r: s.rot, cx: s.cx, cy: s.cy };
    } else if (arr.length === 1) g = { mode: 'drag', x: arr[0].x, y: arr[0].y, cx: s.cx, cy: s.cy };
    else g = null;
  };
  s.el.addEventListener('pointerdown', e => {
    e.stopPropagation(); e.preventDefault();
    const actEl = e.target.closest('[data-act]'); const act = actEl ? actEl.dataset.act : null;
    if (act === 'del') { s.el.remove(); stickers.splice(stickers.indexOf(s), 1); if (selected === s) selected = null; return; }
    select(s);
    s.el.setPointerCapture(e.pointerId);
    pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (act === 'rot') { const c = center(); g = { mode: 'rot', a: Math.atan2(e.clientY - c.y, e.clientX - c.x), d: Math.hypot(e.clientX - c.x, e.clientY - c.y), s: s.scale, r: s.rot, id: e.pointerId }; }
    else snap();
  });
  s.el.addEventListener('pointermove', e => {
    if (!pts.has(e.pointerId) || !g) return;
    pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (g.mode === 'rot') {
      const c = center(), a = Math.atan2(e.clientY - c.y, e.clientX - c.x), d = Math.hypot(e.clientX - c.x, e.clientY - c.y);
      s.rot = g.r + (a - g.a) * 180 / Math.PI; s.scale = clampS(g.s * d / g.d);
    } else if (g.mode === 'pinch') {
      const [a, b] = [...pts.values()];
      const d = Math.hypot(b.x - a.x, b.y - a.y), ang = Math.atan2(b.y - a.y, b.x - a.x);
      s.scale = clampS(g.s * d / g.d); s.rot = g.r + (ang - g.a) * 180 / Math.PI;
      s.cx = g.cx + ((a.x + b.x) / 2 - g.mx) / SW; s.cy = g.cy + ((a.y + b.y) / 2 - g.my) / SH;
    } else {
      s.cx = g.cx + (e.clientX - g.x) / SW; s.cy = g.cy + (e.clientY - g.y) / SH;
    }
    s.cx = Math.max(0, Math.min(1, s.cx)); s.cy = Math.max(0, Math.min(1, s.cy));
    layoutSticker(s);
  });
  const end = e => { pts.delete(e.pointerId); if (g && g.mode === 'rot' && g.id === e.pointerId) g = null; snap(); };
  s.el.addEventListener('pointerup', end); s.el.addEventListener('pointercancel', end);
  s.el.addEventListener('wheel', e => { e.preventDefault(); s.scale = clampS(s.scale * (e.deltaY < 0 ? 1.08 : .93)); if (e.shiftKey) s.rot += e.deltaY < 0 ? 5 : -5; layoutSticker(s); }, { passive: false });
}
const clampS = v => Math.max(.25, Math.min(4, v));

/* ---------------- music toggle ---------------- */
musicBtn.addEventListener('click', () => setMusic(!musicOn));

/* ---------------- camera & postcard ---------------- */
let shots = 0;
cameraBtn.addEventListener('click', () => {
  if (state === 'loading' || state === 'fog') return;
  select(null);
  sfxShutter();
  const fl = $('#flash'); fl.classList.remove('go'); void fl.offsetWidth; fl.classList.add('go');
  const photo = capture();
  shots++;
  setTimeout(() => showPostcard(photo), 380);
});
function capture() {
  const W = 1080, H = 1920, cv = document.createElement('canvas'); cv.width = W; cv.height = H;
  const c = cv.getContext('2d');
  const v = stage.classList.contains('talking') && vTalk.readyState >= 2 ? vTalk : vIdle;
  try { c.drawImage(v, 0, 0, W, H); } catch (e) { c.fillStyle = '#cfe0ec'; c.fillRect(0, 0, W, H); }
  if (crack.geo && crackCv.width) c.drawImage(crackCv, 0, 0, W, H);
  const k = W / SW;
  for (const s of [...stickers].sort((a, b) => (+a.el.style.zIndex || 0) - (+b.el.style.zIndex || 0))) {
    const img = stickerImgs[s.id], w = s.w * SW * k, h = w * s.ar;
    c.save(); c.translate(s.cx * W, s.cy * H); c.rotate(s.rot * Math.PI / 180); c.scale(s.scale, s.scale);
    c.drawImage(img, -w / 2, -h / 2, w, h); c.restore();
  }
  return cv;
}
function pickLine() {
  const has1 = stickers.some(s => s.id === 1), has2 = stickers.some(s => s.id === 2);
  const pool = [];
  if (shots >= 3 && Math.random() < .6) return `第${shots}张了。你是打算集齐一整本，砂金限定相册吗？`;
  if (state === 'cracked') pool.push('裂痕也一起拍进去了？……那就当作，是我们一起留下的纪念。', '隔着碎掉的玻璃还要拍我，你啊——真拿你没办法。');
  if (has2) pool.push('谁允许你给我贴腮红的？……算了，你喜欢就留着吧。', '脸红？这可不是我，是你的贴纸先动的手。');
  if (has1) pool.push('给我画了亮晶晶的眼睛？那你可要一直看着它们。', '眼睛里有光的话，大概是因为镜头后面站着你。');
  if (has1 && has2) pool.push('又是星星眼又是腮红……这张不许给别人看，只许你一个人收着。');
  if (!pool.length || Math.random() < .3) pool.push(
    '偷拍我？胆子不小——下次记得先叫我摆个姿势。',
    '这张就送你了。想我的时候，就隔着屏幕看一看。',
    '镜头再近一点……对，就是这个距离，刚刚好。',
    '拍得这么认真，是想把我装进口袋里带走吗？',
    '雾散了，你也还在。今天就算是个好日子。'
  );
  return pool[Math.random() * pool.length | 0];
}
function wrap(c, text, maxW) {
  const out = []; let line = '';
  for (const ch of text) { if (c.measureText(line + ch).width > maxW && line) { out.push(line); line = ch; } else line += ch; }
  if (line) out.push(line);
  // avoid a lone punctuation mark starting a line
  for (let i = 1; i < out.length; i++) if (/^[，。、？！…—」』）]/.test(out[i])) { out[i - 1] += out[i][0]; out[i] = out[i].slice(1); }
  return out.filter(Boolean);
}
let lastLine = '';
function showPostcard(photo) {
  // laid out on a 1000×1600 grid, rendered at 1.5× (1500×2400) so the saved card stays sharp
  const W = 1000, H = 1600, PS = 1.5, cv = document.createElement('canvas'); cv.width = W * PS; cv.height = H * PS;
  const c = cv.getContext('2d');
  c.scale(PS, PS);
  c.imageSmoothingEnabled = true; if ('imageSmoothingQuality' in c) c.imageSmoothingQuality = 'high';
  const SERIF = '"Songti SC","STSong","Noto Serif SC","Source Han Serif SC","SimSun",serif';
  const SANS = '"PingFang SC","Noto Sans SC","Microsoft YaHei",sans-serif';
  // paper
  c.fillStyle = '#f7f1e6'; c.fillRect(0, 0, W, H);
  for (let i = 0; i < 2600; i++) { c.fillStyle = `rgba(120,96,60,${Math.random() * .05})`; c.fillRect(Math.random() * W, Math.random() * H, 1.5, 1.5); }
  // photo 3:4
  const px = 56, py = 56, pw = 888, ph = 1184;
  c.save(); c.shadowColor = 'rgba(60,40,20,.22)'; c.shadowBlur = 14; c.shadowOffsetY = 4;
  c.fillStyle = '#fff'; c.fillRect(px, py, pw, ph); c.restore();
  c.drawImage(photo, 0, 60, 1080, 1440, px, py, pw, ph);
  c.fillStyle = 'rgba(255,255,255,.85)'; c.font = `600 26px ${SANS}`; c.textAlign = 'left';
  c.save(); c.shadowColor = 'rgba(0,0,0,.4)'; c.shadowBlur = 6;
  c.fillText('MISTY GLASS · POSTCARD', px + 28, py + ph - 30);
  c.restore();
  // stamp
  const sx = 770, sy = 1268, sw = 168, sh = 200;
  c.save(); c.shadowColor = 'rgba(60,40,20,.2)'; c.shadowBlur = 6;
  c.fillStyle = '#fff'; c.fillRect(sx, sy, sw, sh); c.restore();
  c.fillStyle = '#f7f1e6';
  for (let x = sx; x <= sx + sw; x += 14) { c.beginPath(); c.arc(x, sy, 5, 0, 7); c.arc(x, sy + sh, 5, 0, 7); c.fill(); }
  for (let y = sy; y <= sy + sh; y += 14) { c.beginPath(); c.arc(sx, y, 5, 0, 7); c.arc(sx + sw, y, 5, 0, 7); c.fill(); }
  c.drawImage(photo, 270, 255, 480, 495, sx + 14, sy + 14, sw - 28, sh - 60);
  c.fillStyle = '#9a6b2f'; c.font = `600 20px ${SERIF}`; c.textAlign = 'left'; c.fillText('砂金', sx + 16, sy + sh - 18);
  c.textAlign = 'right'; c.font = `600 18px ${SANS}`; c.fillText('520', sx + sw - 16, sy + sh - 18);
  // postmark
  const mx = sx - 44, my = sy + 74;
  c.save(); c.strokeStyle = 'rgba(150,70,60,.55)'; c.fillStyle = 'rgba(150,70,60,.6)'; c.lineWidth = 3;
  c.beginPath(); c.arc(mx, my, 62, 0, 7); c.stroke();
  c.lineWidth = 1.5; c.beginPath(); c.arc(mx, my, 52, 0, 7); c.stroke();
  c.textAlign = 'center'; c.font = `600 17px ${SERIF}`; c.fillText('雾中邮局', mx, my - 14);
  const d = new Date();
  c.font = `600 16px ${SANS}`; c.fillText(`${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`, mx, my + 10);
  c.font = `500 12px ${SANS}`; c.fillText('MIST POST', mx, my + 30);
  c.lineWidth = 2.5;
  for (let k = 0; k < 4; k++) { c.beginPath(); const yy = my - 30 + k * 18; c.moveTo(mx + 70, yy); for (let x = 0; x <= 120; x += 10) c.lineTo(mx + 70 + x, yy + Math.sin(x / 10) * 5); c.stroke(); }
  c.restore();
  // message
  c.textAlign = 'left';
  c.fillStyle = '#8a7a64'; c.font = `500 24px ${SERIF}`; c.fillText('To. 屏幕那头的你', 76, 1300);
  c.fillStyle = '#3a3440'; c.font = `500 34px ${SERIF}`;
  lastLine = pickLine();
  const lines = wrap(c, lastLine, 580);
  let y = 1356;
  for (const l of lines.slice(0, 3)) { c.fillText(l, 76, y); y += 50; }
  c.strokeStyle = 'rgba(138,122,100,.25)'; c.lineWidth = 1;
  for (let k = 0; k < 3; k++) { c.beginPath(); c.moveTo(76, 1368 + k * 50); c.lineTo(670, 1368 + k * 50); c.stroke(); }
  c.fillStyle = '#9a6b2f'; c.font = `600 28px ${SERIF}`; c.textAlign = 'right'; c.fillText('—— 砂金', 670, Math.max(y + 2, 1470));
  // footer
  c.strokeStyle = 'rgba(138,122,100,.35)'; c.setLineDash([6, 6]); c.beginPath(); c.moveTo(56, 1520); c.lineTo(W - 56, 1520); c.stroke(); c.setLineDash([]);
  c.textAlign = 'center'; c.fillStyle = '#8a7a64'; c.font = `500 24px ${SANS}`;
  c.fillText('游戏作者：布丁爱吃布丁', W / 2, 1562);

  refreshFollowStatus();
  pcData = cv.toDataURL('image/jpeg', .9);
  prepareTempFile();
  pcImg.src = pcData;
  fitPostcard();
  postcard.classList.remove('hidden');
}
function fitPostcard() {
  // card is 5:8; leave room for the buttons and the follow card underneath
  const w = Math.min(window.innerWidth * 0.84, (window.innerHeight - 250) * 0.625, 420);
  $('#pcWrap').style.width = Math.max(200, Math.round(w)) + 'px';
}
$('#pcClose').addEventListener('click', () => postcard.classList.add('hidden'));
postcard.addEventListener('pointerdown', e => { if (e.target === postcard) postcard.classList.add('hidden'); });
/* ---------------- Xiaohongshu container capabilities (window.xhs.miniTool, per the online contract) ---------------- */
let pcData = '', pcFile = null;
const miniTool = () => (window.xhs && window.xhs.miniTool) || null;
const hasApi = name => { const m = miniTool(); return !!(m && typeof m[name] === 'function'); };
let toastTimer = null;
function toast(msg, ms) {
  const t = $('#toast'); t.textContent = msg; t.classList.add('on');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove('on'), ms || 2400);
}
// Same shape as the official samples: miniTool.api(params) → Promise. Invoked synchronously inside the tap.
function callMini(name, params) {
  const m = miniTool();
  if (!m || typeof m[name] !== 'function') return Promise.reject({ errMsg: name + ':fail unsupported', errCode: 'NO_API' });
  try {
    const ret = params === undefined ? m[name]() : m[name](params);
    if (ret && typeof ret.then === 'function') return ret.then(r => r || {});
    return Promise.reject({ errMsg: name + ':fail no promise returned', errCode: 'NO_PROMISE' });
  } catch (e) {
    return Promise.reject({ errMsg: name + ':fail ' + ((e && e.message) || e), errCode: 'THROW' });
  }
}
// environment readout, shown whenever a platform action can't complete
let clientVersion = '';
(function readClientVersion() {
  const read = lo => { const env = lo && lo.miniToolEnv; const v = Number(env && env.buildVersion) || 0; if (v) { const n = Math.floor(v / 1000); clientVersion = Math.floor(n / 1000) + '.' + Math.floor(n / 10 % 100) + '.' + (n % 10); } };
  read(window.xhs && window.xhs.launchOptions);
  if (!clientVersion && hasApi('getLaunchOptions')) callMini('getLaunchOptions').then(read, () => {});
})();
function envInfo() {
  if (!window.xhs) return '未检测到小红书环境';
  if (!miniTool()) return '小红书环境缺少 miniTool';
  return '小红书 ' + (clientVersion || '版本未知');
}
const errText = err => (err && (err.errCode !== undefined ? '错误码 ' + err.errCode : (err.errMsg || ''))) || '';

// temp files are use-once: prepare one ahead of the tap, hand it out once, then prepare the next
function prepareTempFile() {
  pcFile = null;
  if (!pcData || !hasApi('writeTempFile')) return;
  const data = pcData;
  callMini('writeTempFile', { data }).then(r => { if (data === pcData && r && r.filePath) pcFile = r.filePath; }, () => {});
}
function takeImagePath() {
  const path = pcFile || pcData; // data: base64 is also accepted when the temp file is not ready yet
  pcFile = null;
  setTimeout(prepareTempFile, 200);
  return path;
}
const cooling = {};
function cooldown(key, ms) {
  if (cooling[key]) return true;
  cooling[key] = true; setTimeout(() => { cooling[key] = false; }, ms);
  return false;
}

function shareInBrowser() {
  // Web Share API can hand the image straight to the 小红书 app on a phone
  try {
    if (navigator.share && navigator.canShare) {
      const bin = atob(pcData.split(',')[1]);
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      const file = new File([bytes], '砂金的明信片.jpg', { type: 'image/jpeg' });
      if (navigator.canShare({ files: [file] })) {
        navigator.share({ files: [file], title: '隔着雾气，和砂金的合照', text: '「' + lastLine + '」—— 《雾中的砂金》· 游戏作者：布丁爱吃布丁' })
          .catch(() => {});
        return;
      }
    }
  } catch (e) {}
  toast('这张图已下载，打开小红书发笔记就能贴上', 3200);
  downloadCard();
}
function downloadCard() {
  const a = document.createElement('a');
  a.href = pcData;
  a.download = '砂金的明信片-' + Date.now() + '.jpg';
  document.body.appendChild(a); a.click(); a.remove();
  toast('明信片已下载，可以直接发到小红书', 3000);
}
$('#pcSave').addEventListener('click', () => {
  if (cooldown('save', 1200)) return;
  if (!hasApi('saveImageToPhotosAlbum')) { downloadCard(); return; }
  callMini('saveImageToPhotosAlbum', { filePath: takeImagePath() })
    .then(() => toast('明信片已保存到相册'), err => toast('保存失败，请允许访问相册后再试（' + errText(err) + '）'));
});
$('#pcShare').addEventListener('click', () => {
  if (cooldown('share', 1500)) return;
  if (!hasApi('postNote')) { shareInBrowser(); return; }
  // postNote only resolves once the user actually publishes, so nothing waits on it
  let left = false, settled = false;
  const onHide = () => { if (document.hidden) left = true; };
  document.addEventListener('visibilitychange', onHide);
  window.addEventListener('blur', function onBlur() { left = true; window.removeEventListener('blur', onBlur); });
  toast('正在打开小红书发布页…', 1800);
  setTimeout(() => {
    document.removeEventListener('visibilitychange', onHide);
    if (!left && !settled) toast('发布页没有弹出（' + envInfo() + '）。电脑模拟器不支持发布页，请用手机小红书扫码打开再试', 5200);
  }, 3500);
  callMini('postNote', {
    title: '隔着雾气，和砂金的合照',
    content: '隔着一层起雾的玻璃，砂金对我说：\n「' + lastLine + '」\n\n这张明信片是我在《雾中的砂金》里拍下的～\n游戏作者：布丁爱吃布丁（持续更新好玩的游戏，关注不迷路）\n\n#砂金 #乙女游戏 #互动小游戏 #布丁爱吃布丁',
    pageType: 'photo_publish',
    mediaInfo: { image_resources: [{ url: takeImagePath() }] }
  }).then(() => { settled = true; }, err => { settled = true; toast('没能打开发布页（' + errText(err) + ' · ' + envInfo() + '）', 4200); });
});

/* ---- follow the tool author (§3.15, client 9.51+): followAuthor / getFollowStatus ---- */
const followSheet = $('#followSheet');
const followBtn = $('#followBtn');
let currentFollowStatus = -1, followPending = false, followPendingTimer = null;
function renderFollowStatus(status) {
  currentFollowStatus = status;
  followBtn.classList.toggle('done', status === 1 || status === 2);
  followBtn.classList.toggle('busy', followPending);
  if (followPending) { followBtn.textContent = '处理中…'; return; }
  if (status === 1) followBtn.textContent = '已关注';
  else if (status === 2) followBtn.textContent = '作者本人';
  else followBtn.textContent = '+ 关注布丁';
}
function refreshFollowStatus() {
  if (!hasApi('getFollowStatus')) return;
  // -1 查询失败（不缓存，下次重查）；0 未关注（含未登录）；1 已关注（含互关）；2 作者本人
  callMini('getFollowStatus').then(r => { if (!followPending) renderFollowStatus(typeof r.follow_status === 'number' ? r.follow_status : -1); }, () => {});
}
function endFollowPending() {
  followPending = false; clearTimeout(followPendingTimer);
  renderFollowStatus(currentFollowStatus);
}
followBtn.addEventListener('click', () => {
  if (!hasApi('followAuthor')) {
    // normal web build: no platform follow API, so guide them to the author page
    if (window.xhs) toast('一键关注需要小红书 9.51 及以上（' + envInfo() + '），先按引导关注吧', 3600);
    followSheet.classList.remove('hidden');
    return;
  }
  if (currentFollowStatus === 2) { toast('你就是作者本人哦～换个账号打开就能看到关注弹窗', 3200); return; }
  if (currentFollowStatus === 1) { toast('已经关注布丁啦，新游戏上线第一时间见'); return; }
  if (followPending) return;
  followPending = true; renderFollowStatus(currentFollowStatus);
  followPendingTimer = setTimeout(() => { // never leave the button stuck, and say why
    endFollowPending();
    toast('关注弹窗没有出现（' + envInfo() + '）。请用手机小红书 9.51+、非作者账号打开再试', 5200);
  }, 6000);
  callMini('followAuthor').then(r => {
    const st = typeof r.follow_status === 'number' ? r.follow_status : -1;
    if (st === -1) { toast('关注没有成功，稍后再试一次'); endFollowPending(); refreshFollowStatus(); return; }
    currentFollowStatus = st;
    if (st === 1) toast('关注成功～新游戏上线第一时间见');
    else if (st === 2) toast('你就是作者本人哦', 2600);
    endFollowPending();
  }, err => {
    const code = err && err.errCode;
    if (code === 15404) toast('今天的关注引导次数用完了，明天再来吧', 3000);
    else if (code !== 20002 && code !== 10003) toast('暂时没能拉起关注（' + errText(err) + ' · ' + envInfo() + '）', 4200);
    // 20002 用户关闭确认框 / 放弃登录、10003 确认流程进行中：静默
    endFollowPending();
  });
});
$('#followOk').addEventListener('click', () => followSheet.classList.add('hidden'));
followSheet.addEventListener('pointerdown', e => { if (e.target === followSheet) followSheet.classList.add('hidden'); });
window.addEventListener('resize', () => { if (!postcard.classList.contains('hidden')) fitPostcard(); });

/* ---- keep our top buttons clear of the container's native buttons (§3.11, client 9.49+) ---- */
function avoidNativeButtons() {
  if (!hasApi('getWindowInfo')) return;
  callMini('getWindowInfo').then(info => {
    const mb = info && info.menuButtons;
    if (!mb) return;
    const st = stage.getBoundingClientRect();
    let bottom = 0;
    ['back', 'me', 'share'].forEach(k => { const r = mb[k]; if (r && typeof r.bottom === 'number' && r.top < 140) bottom = Math.max(bottom, r.bottom); });
    if (bottom > 0) {
      const top = Math.max(16, Math.round(bottom - st.top + 10)) + 'px';
      toolbar.style.top = top; restoreBtn.style.top = top;
    }
  }, () => {});
}

/* ---------------- boot ---------------- */
window.addEventListener('resize', resize);
document.addEventListener('visibilitychange', () => {
  const quiet = p => { if (p && p.catch) p.catch(() => {}); };
  if (document.hidden) { bgm.pause(); vIdle.pause(); vTalk.pause(); }
  else if (state !== 'loading') {
    if (musicOn) quiet(bgm.play());
    quiet(vIdle.play());
    if (stage.classList.contains('talking')) quiet(vTalk.play());
  }
});
resize();
loadAll();
avoidNativeButtons();
refreshFollowStatus();
})();
