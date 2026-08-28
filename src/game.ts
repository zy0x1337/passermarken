/* ══════════════════════════════════════════════════════════════════════
   PASSERMARKEN — Engine (Quelle)
   Vanilla TypeScript · Canvas 2D · LocalStorage · keine Dependencies.

   Kernidee: Der tragfähige Boden ist keine Geometrie, sondern die
   Schnittmenge zweier Druckplatten. Der Spieler steuert deren Versatz.
   ══════════════════════════════════════════════════════════════════════ */
(() => {
  'use strict';

  /* ── Typen ──────────────────────────────────────────────────── */
  interface Rect { x: number; y: number; w: number; h: number }
  interface Plate extends Rect { d: number }              /* d = Grund-Drift der Platte */
  interface Mark { x: number; y: number; got: boolean }
  interface Blob { x: number; y: number; r: number; seed: number; hit?: boolean }
  interface Particle { x: number; y: number; vx: number; vy: number; l: number; col: string; s: number }
  interface Toast { txt: string; col: string; l: number; big: boolean; y: number }
  interface Runner { y: number; vy: number; ground: boolean; coyote: number; buf: number; phase: number }
  interface Palette { name: string; blue: string; pink: string; accent: string; need: number }
  interface Save { best: number; runs: number; sheets: number; marks: number; pal: number; sound: boolean; hap: boolean }
  type Mode = 'menu' | 'play' | 'over';

  /* ── Konstanten ─────────────────────────────────────────────── */
  const VW = 420, VH = 760, HUD = 64, PH = VH - HUD;
  const RUNTIME = 90;
  const G = 1520, JUMPV = -655;
  const RUN_X = 110;
  const REG_MAX = 112;
  const PAPER = '#E9E2D0';
  const PLUM = '#2A1030';
  const KEY = 'passermarken.v2';

  const PALETTES: Palette[] = [
    { name: 'Federal Blau / Fluo-Pink', blue: '#1B3FD6', pink: '#FF3D9A', accent: '#FFC93C', need: 0 },
    { name: 'Grasgrün / Fluo-Orange',   blue: '#0E8F4E', pink: '#FF5A2B', accent: '#FFE04B', need: 1800 },
    { name: 'Schwarz / Fluo-Gelb',      blue: '#191A1C', pink: '#7C7F86', accent: '#FFD400', need: 4200 },
    { name: 'Violett / Türkis',         blue: '#4B2A9B', pink: '#00A6A0', accent: '#FF9AC1', need: 9000 }
  ];

  const clamp = (v: number, a: number, b: number): number => (v < a ? a : v > b ? b : v);
  const rnd = (a: number, b: number): number => a + Math.random() * (b - a);
  const pick = <T,>(a: T[]): T => a[(Math.random() * a.length) | 0];
  const $ = (id: string): HTMLElement => document.getElementById(id) as HTMLElement;

  /* ── Persistenz ─────────────────────────────────────────────── */
  const DEF: Save = { best: 0, runs: 0, sheets: 0, marks: 0, pal: 0, sound: true, hap: true };
  let S: Save = DEF;
  try { S = Object.assign({}, DEF, JSON.parse(localStorage.getItem(KEY) || '{}')) as Save; } catch { S = DEF; }
  const save = (): void => { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch { /* privat */ } };

  /* ── Audio: die Maschine, vollständig synthetisiert ─────────── */
  const Machine = {
    ctx: null as AudioContext | null,
    master: null as GainNode | null,
    humG: null as GainNode | null,
    f1: null as OscillatorNode | null,
    f2: null as OscillatorNode | null,
    noise: null as AudioBuffer | null,

    init(): void {
      if (this.ctx) return;
      const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AC) return;
      const c = new AC();
      this.ctx = c;
      this.master = c.createGain();
      this.master.gain.value = S.sound ? 0.9 : 0;
      this.master.connect(c.destination);

      const len = Math.floor(c.sampleRate * 0.5);
      this.noise = c.createBuffer(1, len, c.sampleRate);
      const d = this.noise.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;

      this.f1 = c.createOscillator(); this.f1.type = 'sawtooth'; this.f1.frequency.value = 51;
      this.f2 = c.createOscillator(); this.f2.type = 'sawtooth'; this.f2.frequency.value = 51.9;
      const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 240;
      this.humG = c.createGain(); this.humG.gain.value = 0;
      this.f1.connect(lp); this.f2.connect(lp); lp.connect(this.humG); this.humG.connect(this.master);
      this.f1.start(); this.f2.start();
    },
    resume(): void { this.init(); if (this.ctx && this.ctx.state === 'suspended') void this.ctx.resume(); },
    toggle(on: boolean): void { S.sound = on; save(); if (this.master && this.ctx) this.master.gain.value = on ? 0.9 : 0; },
    humLevel(v: number): void { if (this.humG && this.ctx) this.humG.gain.setTargetAtTime(v, this.ctx.currentTime, 0.2); },
    humPitch(sp: number): void {
      if (!this.f1 || !this.f2 || !this.ctx) return;
      const f = 46 + (sp - 200) * 0.09;
      this.f1.frequency.setTargetAtTime(f, this.ctx.currentTime, 0.3);
      this.f2.frequency.setTargetAtTime(f * 1.017, this.ctx.currentTime, 0.3);
    },
    click(freq: number, gain: number, dur: number): void {
      if (!this.ctx || !this.noise || !this.master) return;
      const s = this.ctx.createBufferSource(); s.buffer = this.noise;
      const bp = this.ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = freq; bp.Q.value = 1.1;
      const g = this.ctx.createGain();
      g.gain.setValueAtTime(gain, this.ctx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.0001, this.ctx.currentTime + dur);
      s.connect(bp); bp.connect(g); g.connect(this.master); s.start(); s.stop(this.ctx.currentTime + dur);
    },
    blip(a: number, b: number, dur: number, type: OscillatorType): void {
      if (!this.ctx || !this.master) return;
      const o = this.ctx.createOscillator(); o.type = type;
      const g = this.ctx.createGain();
      o.frequency.setValueAtTime(a, this.ctx.currentTime);
      o.frequency.exponentialRampToValueAtTime(b, this.ctx.currentTime + dur);
      g.gain.setValueAtTime(0.12, this.ctx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.0001, this.ctx.currentTime + dur);
      o.connect(g); g.connect(this.master); o.start(); o.stop(this.ctx.currentTime + dur);
    },
    land(): void { this.click(1750, 0.16, 0.055); },
    jump(): void { this.blip(300, 620, 0.09, 'triangle'); },
    mark(c: number): void { this.blip(760 + Math.min(c, 9) * 55, 1500 + Math.min(c, 9) * 70, 0.09, 'square'); },
    klack(): void { this.click(900, 0.2, 0.05); },
    fail(): void { this.blip(300, 60, 0.6, 'sawtooth'); this.click(300, 0.25, 0.4); },
    win(): void { [523, 659, 784, 1047].forEach((f, i) => setTimeout(() => this.blip(f, f * 1.5, 0.16, 'triangle'), i * 90)); },
    gear(): void { this.blip(180, 90, 0.16, 'square'); this.click(2400, 0.18, 0.09); }
  };
  const buzz = (ms: number | number[]): void => {
    if (S.hap && navigator.vibrate) { try { navigator.vibrate(ms); } catch { /* iOS */ } }
  };

  /* ── Canvas ─────────────────────────────────────────────────── */
  const cv = $('game') as HTMLCanvasElement;
  const ctx = cv.getContext('2d', { alpha: false }) as CanvasRenderingContext2D;
  const stage = $('stage');
  let scale = 1;

  function fit(): void {
    const r = stage.getBoundingClientRect();
    const s = Math.min(r.width / VW, r.height / VH);
    const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
    cv.width = Math.round(VW * s * dpr);
    cv.height = Math.round(VH * s * dpr);
    cv.style.width = `${VW * s}px`;
    cv.style.height = `${VH * s}px`;
    scale = s * dpr;
  }
  addEventListener('resize', fit);

  const makeTile = (size: number, fn: (g: CanvasRenderingContext2D, s: number) => void): CanvasPattern => {
    const c = document.createElement('canvas'); c.width = size; c.height = size;
    fn(c.getContext('2d') as CanvasRenderingContext2D, size);
    return ctx.createPattern(c, 'repeat') as CanvasPattern;
  };
  const grainPat = makeTile(110, (g, s) => {
    const im = g.createImageData(s, s);
    for (let i = 0; i < im.data.length; i += 4) {
      const v = 120 + Math.random() * 135;
      im.data[i] = im.data[i + 1] = im.data[i + 2] = v; im.data[i + 3] = 255;
    }
    g.putImageData(im, 0, 0);
  });
  const halfPat = makeTile(10, (g) => {
    g.fillStyle = 'rgba(60,45,30,0.9)';
    g.beginPath(); g.arc(2.5, 2.5, 1.05, 0, 7); g.fill();
    g.beginPath(); g.arc(7.5, 7.5, 0.75, 0, 7); g.fill();
  });

  /* ── Weltzustand ────────────────────────────────────────────── */
  const W = {
    mode: 'menu' as Mode,
    t: 0, dist: 0, speed: 205, gear: 1,
    reg: 0, regT: 0, drift: 0, driftV: 0,
    ink: 100, fail: 0, failW: 0, smear: 0,
    score: 0, combo: 0, comboMax: 0, marks: 0, sheets: 3,
    blue: [] as Rect[], pink: [] as Plate[], marks_: [] as Mark[], blobs: [] as Blob[],
    grounds: [] as Rect[], parts: [] as Particle[], toasts: [] as Toast[],
    shake: 0, flash: 0, invuln: 0, genX: 0, lastY: 400,
    hadPal: [] as number[],
    r: { y: 400, vy: 0, ground: false, coyote: 0, buf: 0, phase: 0 } as Runner
  };
  W.hadPal = PALETTES.map((_p, i) => i).filter(i => S.best >= PALETTES[i].need);
  const pal = (): Palette => PALETTES[clamp(S.pal, 0, PALETTES.length - 1)];

  /* ── Level-Generator: die Drift ist ein Random Walk, kein Würfel ── */
  function genChunk(x: number, diff: number): number {
    const y = clamp(W.lastY + rnd(-72, 72), 210, 570);
    W.lastY = y;
    const w = rnd(150, 262);
    W.driftV = clamp(W.driftV + rnd(-34, 34), -46, 46);
    W.drift = clamp(W.drift + W.driftV * 0.5, -95 * diff, 95 * diff);
    const d = W.drift;

    W.blue.push({ x, y, w, h: 18 });
    W.pink.push({ x: x + d, y: y + rnd(-9, 9), w, h: 18, d });

    if (Math.random() < 0.3 + diff * 0.2) {                 /* zweite, höhere Plattform */
      const y2 = clamp(y - rnd(105, 150), 170, 480);
      const w2 = rnd(90, 150);
      const ox = rnd(-20, 40);
      W.blue.push({ x: x + ox, y: y2, w: w2, h: 16 });
      W.pink.push({ x: x + d * 0.55 + ox, y: y2 + rnd(-6, 6), w: w2, h: 16, d: d * 0.55 });
      if (Math.random() < 0.7) W.marks_.push({ x: x + 60, y: y2 - 34, got: false });
    }
    if (Math.random() < 0.62) W.marks_.push({ x: x + w * rnd(0.35, 0.75), y: y - rnd(44, 92), got: false });
    if (Math.random() < 0.16 + diff * 0.14) {
      W.blobs.push({ x: x + w * rnd(0.4, 0.9), y: y - rnd(20, 40), r: rnd(11, 16), seed: Math.random() * 99 });
    }
    return x + w + rnd(10, 58);
  }

  function generate(): void {
    while (W.genX < W.dist + 1100) W.genX = genChunk(W.genX, clamp(0.5 + W.t / RUNTIME, 0.5, 1.35));
    const lim = W.dist - 420;
    W.blue = W.blue.filter(r => r.x + r.w > lim);
    W.pink = W.pink.filter(r => r.x + r.w > lim);
    W.marks_ = W.marks_.filter(m => m.x > lim);
    W.blobs = W.blobs.filter(b => b.x > lim);
  }

  /* ── DER TWIST: Boden = Schnittmenge beider Platten ─────────── */
  function computeGrounds(): void {
    const L = W.dist - 180, R = W.dist + 620, gs: Rect[] = [], reg = W.reg;
    for (let i = 0; i < W.blue.length; i++) {
      const b = W.blue[i];
      if (b.x + b.w < L || b.x > R) continue;
      for (let j = 0; j < W.pink.length; j++) {
        const p = W.pink[j], px = p.x + reg;
        if (px + p.w < b.x || px > b.x + b.w) continue;
        const x1 = Math.max(b.x, px), x2 = Math.min(b.x + b.w, px + p.w);
        const y1 = Math.max(b.y, p.y), y2 = Math.min(b.y + b.h, p.y + p.h);
        if (x2 - x1 < 6 || y2 - y1 < 5) continue;           /* < 6 px Überdeckung trägt nicht */
        gs.push({ x: x1, y: y1, w: x2 - x1, h: y2 - y1 });
      }
    }
    W.grounds = gs;
  }

  function burst(x: number, y: number, n: number, col: string, spd: number): void {
    for (let i = 0; i < n; i++) {
      const a = rnd(0, 6.283), v = rnd(spd * 0.3, spd);
      W.parts.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 40, l: 1, col, s: rnd(1.6, 4.2) });
    }
  }
  const toast = (txt: string, col: string, big = false): void => { W.toasts.push({ txt, col, l: 1, big, y: 0 }); };

  /* Passungsfehler unter den Füßen — steuert die sichtbare Fehlpas­sung der Figur */
  function plateDriftHere(): number {
    let best: Plate | null = null;
    for (const p of W.pink) {
      const x = p.x + W.reg;
      if (x <= W.dist + 12 && x + p.w >= W.dist - 12 && (!best || p.y > best.y)) best = p;
    }
    return best ? best.d : W.drift;
  }

  /* ── Runden ─────────────────────────────────────────────────── */
  function reset(): void {
    Object.assign(W, {
      t: 0, dist: 0, speed: 205, gear: 1, reg: 0, regT: 0, drift: 0, driftV: 0,
      ink: 100, fail: 0, smear: 0, score: 0, combo: 0, comboMax: 0, marks: 0, sheets: 3,
      blue: [], pink: [], marks_: [], blobs: [], grounds: [], parts: [], toasts: [],
      genX: -60, lastY: 420, shake: 0, flash: 0, invuln: 0
    });
    W.r = { y: 380, vy: 0, ground: false, coyote: 0, buf: 0, phase: 0 };
    W.blue.push({ x: -60, y: 430, w: 420, h: 18 });
    W.pink.push({ x: -60, y: 430, w: 420, h: 18, d: 0 });
    generate();
  }

  function start(): void {
    Machine.resume();
    reset();
    W.mode = 'play';
    $('ovMenu').classList.add('hidden');
    $('ovOver').classList.add('hidden');
    Machine.humLevel(0.05);
    toast('BOGEN LÄUFT', '#FFC93C', true);
  }

  function loseSheet(): void {
    W.sheets--; W.combo = 0; W.shake = 16; W.flash = 1;
    Machine.fail(); buzz([24, 40, 60]);
    if (W.sheets <= 0) { over(false); return; }
    toast('NACHDRUCK', '#FF3D9A', true);

    let best: Plate | null = null;
    for (const p of W.pink) if (p.x > W.dist + 40 && (!best || p.x < best.x)) best = p;
    if (best) {
      W.dist = best.x + 50;
      W.reg = W.regT = -best.d;                              /* Nachdruck kommt passend raus */
      W.r.y = best.y - 34; W.r.vy = 0; W.r.ground = true;
    }
    W.invuln = 1.5;
    W.ink = Math.max(W.ink, 40);
  }

  function over(won: boolean): void {
    W.mode = 'over';
    Machine.humLevel(0);
    if (won) { W.score += W.sheets * 500 + Math.round(W.ink * 4); Machine.win(); buzz([12, 40, 12, 40, 90]); }
    else { Machine.fail(); buzz(220); }

    const sc = Math.round(W.score);
    const isBest = sc > S.best;
    if (isBest) S.best = sc;
    S.runs++; S.sheets += W.marks; S.marks += W.marks;

    let unlocked: Palette | null = null;
    PALETTES.forEach((p, i) => {
      if (S.best >= p.need && !W.hadPal.includes(i)) { W.hadPal.push(i); unlocked = p; }
    });
    save(); buildPals();

    $('ovTitle').innerHTML = won ? 'AUFLAGE<br>FREIGEGEBEN' : 'BOGEN<br>VERLOREN';
    $('ovSub').textContent = won
      ? '90 Sekunden, zwei Platten, keine Fehlstelle. Der Bogen liegt im Trocknungsregal.'
      : pick([
          'Die Farben standen nie zusammen.',
          'Zu viel Versatz. Der Bogen wandert in den Makulaturstapel.',
          'Die Maschine hat gewonnen. Sie tut das öfter.',
          'Pink lief davon. Blau hat es nicht gemerkt.'
        ]);
    $('ovNew').classList.toggle('hidden', !isBest);
    $('stScore').textContent = String(sc);
    $('stMarks').textContent = String(W.marks);
    $('stCombo').textContent = '×' + W.comboMax;
    $('stTime').textContent = `${Math.min(90, W.t | 0)} s`;
    const u = $('ovUnlock');
    if (unlocked) { u.classList.remove('hidden'); u.innerHTML = `<b>Neue Spot-Farbe freigeschaltet:</b> ${(unlocked as Palette).name}`; }
    else u.classList.add('hidden');
    $('ovOver').classList.remove('hidden');
    $('menuBest').textContent = String(S.best);
    $('stRuns').textContent = `${S.runs} Bögen gefahren`;
    $('logline').textContent = won
      ? `Bogen ${S.runs} freigegeben. Walze läuft weiter.`
      : 'Makulatur. Farbe nachgefüllt. Weitermachen.';
  }

  /* ── Eingabe: ein Daumen ────────────────────────────────────── */
  let ptrId: number | null = null, lastPX = 0;
  cv.addEventListener('pointerdown', (e: PointerEvent) => {
    if (W.mode !== 'play') return;
    cv.setPointerCapture(e.pointerId);
    ptrId = e.pointerId; lastPX = e.clientX;
    W.r.buf = 0.13;                                          /* Springen geht nur am Boden */
    e.preventDefault();
  });
  cv.addEventListener('pointermove', (e: PointerEvent) => {
    if (ptrId !== e.pointerId || W.mode !== 'play') return;
    const rect = cv.getBoundingClientRect();
    const dx = (e.clientX - lastPX) * (VW / rect.width);
    lastPX = e.clientX;
    if (W.fail > 0) return;                                  /* Farbausfall: die Maschine lenkt */
    const dir = W.smear > 0 ? -1 : 1;                        /* Spritzer kehren die Steuerung um */
    W.regT = clamp(W.regT + dx * 1.25 * dir, -REG_MAX, REG_MAX);
  });
  const endPtr = (e: PointerEvent): void => { if (e.pointerId === ptrId) ptrId = null; };
  cv.addEventListener('pointerup', endPtr);
  cv.addEventListener('pointercancel', endPtr);
  cv.addEventListener('pointerup', () => { if (W.r.vy < -180) W.r.vy *= 0.52; });   /* kurze Sprünge */

  addEventListener('keydown', (e: KeyboardEvent) => {
    if (e.code === 'Space' || e.code === 'ArrowUp' || e.code === 'KeyW') {
      if (W.mode === 'play') W.r.buf = 0.13; else start();
      e.preventDefault();
      return;
    }
    if (W.mode !== 'play' || W.fail > 0) return;
    const k = (W.smear > 0 ? -1 : 1) * 7;
    if (e.code === 'ArrowLeft' || e.code === 'KeyA') W.regT = clamp(W.regT - k, -REG_MAX, REG_MAX);
    if (e.code === 'ArrowRight' || e.code === 'KeyD') W.regT = clamp(W.regT + k, -REG_MAX, REG_MAX);
  });
  addEventListener('keyup', (e: KeyboardEvent) => { if (e.code === 'Space' && W.r.vy < -180) W.r.vy *= 0.5; });

  /* ── Simulation ─────────────────────────────────────────────── */
  function update(dt: number): void {
    if (W.mode !== 'play') return;
    W.t += dt;

    const prog = W.t / RUNTIME;
    const newGear = 1 + Math.min(3, Math.floor(prog * 4));
    if (newGear !== W.gear) { W.gear = newGear; Machine.gear(); W.shake = 7; toast('GANG ' + newGear, '#1B3FD6'); }
    W.speed = 205 + 175 * (prog * prog * 0.45 + prog * 0.55);
    Machine.humPitch(W.speed);
    W.dist += W.speed * dt;
    W.score += W.speed * dt * 0.07;

    W.ink = Math.max(0, W.ink - dt * (3.1 + prog * 1.5));
    if (W.fail > 0) {
      W.fail -= dt;
      W.failW = clamp(W.failW + rnd(-1, 1) * 46 * dt * 10, -REG_MAX, REG_MAX);
      W.regT = W.failW;
      if (W.fail <= 0) { W.ink = 50; toast('FARBE NACHGEFÜLLT', '#FFC93C'); }
    } else if (W.ink <= 0) {
      W.fail = 3.5; W.failW = W.reg; W.combo = 0;
      Machine.fail(); buzz([30, 30, 30, 30, 120]);
      toast('FARBAUSFALL', '#FF3D9A', true);
      W.shake = 14;
    }

    W.reg += (W.regT - W.reg) * (1 - Math.exp(-dt * 13));     /* Feder, keine Maus */
    generate(); computeGrounds();

    const r = W.r;
    if (W.invuln > 0) W.invuln -= dt;
    if (r.buf > 0) r.buf -= dt;
    if (r.coyote > 0) r.coyote -= dt;

    if (r.buf > 0 && (r.ground || r.coyote > 0)) {
      r.vy = JUMPV; r.ground = false; r.coyote = 0; r.buf = 0;
      Machine.jump(); buzz(8);
      burst(RUN_X, r.y + 30, 5, pal().blue, 90);
    }
    r.vy += G * dt;
    const py = r.y, ny = r.y + r.vy * dt;
    const fl = W.dist - 9, fr = W.dist + 9;

    let landed: Rect | null = null;
    for (const g of W.grounds) {
      if (g.x + g.w < fl || g.x > fr) continue;
      if (r.vy >= 0 && py + 30 <= g.y + 3 && ny + 30 >= g.y) { landed = g; break; }
    }
    if (landed) {
      if (!r.ground) {
        Machine.land(); buzz(6);
        burst(RUN_X, landed.y, 4, PLUM, 70);
        r.y = Math.round(landed.y - 30);
        if (r.y % 2) r.y -= 1;                                /* Pressen-Quantisierung: 2-px-Raster */
      } else r.y = landed.y - 30;
      r.vy = 0; r.ground = true; r.coyote = 0.1;
    } else {
      r.y = ny;
      if (r.ground) { r.ground = false; r.coyote = 0.1; }
    }
    if (r.vy < 0) {
      for (const g of W.grounds) {
        if (g.x + g.w < fl || g.x > fr) continue;
        if (py >= g.y + g.h - 2 && ny < g.y + g.h) { r.y = g.y + g.h; r.vy = 40; break; }
      }
    }
    r.phase += dt * W.speed * 0.055;
    if (r.y > PH + 40 && W.invuln <= 0) { loseSheet(); return; }

    for (const m of W.marks_) {
      if (m.got) continue;
      if (Math.abs(m.x - W.dist) < 24 && Math.abs(m.y - (r.y + 15)) < 40) {
        m.got = true; W.marks++; W.combo++; W.comboMax = Math.max(W.comboMax, W.combo);
        const mult = Math.min(8, W.combo);
        W.score += 100 * mult;
        W.ink = Math.min(100, W.ink + 16);
        Machine.mark(W.combo); buzz(10);
        burst(m.x - W.dist + RUN_X, m.y, 12, pal().accent, 170);
        if (W.combo > 1) toast(`×${mult}  +${100 * mult}`, pal().accent);
      }
    }

    if (W.smear > 0) W.smear -= dt;
    for (const b of W.blobs) {
      if (b.hit) continue;
      if (Math.abs(b.x - W.dist) < b.r + 11 && Math.abs(b.y - (r.y + 15)) < b.r + 17) {
        b.hit = true; W.smear = 2.6; W.combo = 0; W.shake = 12;
        Machine.fail(); buzz([18, 22, 40]);
        burst(b.x - W.dist + RUN_X, b.y, 16, pal().pink, 190);
        toast('VERSCHMIERT', pal().pink, true);
      }
    }

    W.shake *= Math.exp(-dt * 7);
    W.flash *= Math.exp(-dt * 6);
    for (let i = W.parts.length - 1; i >= 0; i--) {
      const p = W.parts[i];
      p.vy += 900 * dt; p.x += p.vx * dt; p.y += p.vy * dt; p.l -= dt * 1.5;
      if (p.l <= 0) W.parts.splice(i, 1);
    }
    for (let i = W.toasts.length - 1; i >= 0; i--) {
      const t = W.toasts[i]; t.l -= dt * 0.75; t.y -= dt * 26;
      if (t.l <= 0) W.toasts.splice(i, 1);
    }
    if (W.t >= RUNTIME) over(true);
  }

  /* ── Render ─────────────────────────────────────────────────── */
  function drawRunner(P: Palette, time: number): void {
    const r = W.r;
    const e = clamp(Math.abs(W.reg + plateDriftHere()) * 0.045, 0, 6);   /* Können wird zur Grafik */
    const leg = Math.sin(r.phase) * (r.ground ? 6 : 2);
    const blink = W.invuln > 0 && (time | 0) % 120 < 60;

    const body = (ox: number, col: string): void => {
      ctx.fillStyle = col;
      const x = RUN_X + ox, y = r.y;
      ctx.fillRect(x - 6, y + 8, 12, 14);
      ctx.beginPath(); ctx.arc(x, y + 3, 6.2, 0, 7); ctx.fill();
      ctx.save(); ctx.lineWidth = 3; ctx.strokeStyle = col; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(x - 1, y + 21); ctx.lineTo(x - 1 - leg, y + 31); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(x + 1, y + 21); ctx.lineTo(x + 1 + leg, y + 31); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(x - 5, y + 12); ctx.lineTo(x - 5 + leg * 0.8, y + 19); ctx.stroke();
      ctx.restore();
    };
    ctx.globalCompositeOperation = 'multiply';
    ctx.globalAlpha = blink ? 0.35 : 0.8;
    body(-e, P.blue); body(e, P.pink);
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = blink ? 0.4 : 1;
    body(0, PLUM);
    ctx.globalAlpha = 1;
    ctx.fillStyle = PAPER; ctx.fillRect(RUN_X + 1.5, r.y + 1, 2.4, 2.4);
  }

  function drawHud(P: Palette): void {
    ctx.fillStyle = '#171412'; ctx.fillRect(0, 0, VW, HUD);
    ctx.fillStyle = 'rgba(233,226,208,0.05)';
    for (let x = 0; x < VW; x += 4) ctx.fillRect(x, 0, 1, HUD);

    ctx.font = "9px 'IBM Plex Mono',monospace";
    ctx.fillStyle = 'rgba(233,226,208,0.5)';
    ctx.fillText('BOGEN', 14, 20);
    for (let i = 0; i < 3; i++) {
      const x = 14 + i * 15;
      ctx.fillStyle = i < W.sheets ? PAPER : 'rgba(233,226,208,0.16)';
      ctx.fillRect(x, 26, 11, 15);
      if (i >= W.sheets) { ctx.strokeStyle = 'rgba(233,226,208,0.3)'; ctx.lineWidth = 1; ctx.strokeRect(x, 26, 11, 15); }
    }

    const bx = 78, bw = VW - 78 - 96, p = clamp(W.t / RUNTIME, 0, 1);
    ctx.fillStyle = 'rgba(233,226,208,0.14)'; ctx.fillRect(bx, 30, bw, 8);
    ctx.fillStyle = P.pink; ctx.fillRect(bx, 30, bw * p, 8);
    ctx.fillStyle = P.blue; ctx.fillRect(bx + bw * p - 2, 27, 4, 14);
    ctx.fillStyle = 'rgba(233,226,208,0.35)';
    for (let i = 1; i < 4; i++) ctx.fillRect(bx + bw * i / 4, 30, 1, 8);
    ctx.font = "9px 'IBM Plex Mono',monospace";
    ctx.fillStyle = 'rgba(233,226,208,0.5)';
    ctx.fillText(`VORSCHUB  ${Math.max(0, RUNTIME - W.t | 0)}s`, bx, 20);
    ctx.fillStyle = P.accent;
    ctx.fillText('GANG ' + W.gear, bx + bw - 34, 20);

    ctx.textAlign = 'right';
    ctx.font = "22px 'Archivo Black',sans-serif";
    ctx.fillStyle = PAPER;
    ctx.fillText(String(Math.round(W.score)), VW - 14, 42);
    ctx.font = "9px 'IBM Plex Mono',monospace";
    ctx.fillStyle = 'rgba(233,226,208,0.5)';
    ctx.fillText('AUFLAGE', VW - 14, 20);
    ctx.textAlign = 'left';

    const iw = VW - 28, low = W.ink < 25;
    ctx.fillStyle = 'rgba(233,226,208,0.13)'; ctx.fillRect(14, 52, iw, 5);
    ctx.fillStyle = W.fail > 0 ? P.pink : (low ? '#FF5A2B' : P.accent);
    if (low && Date.now() % 500 < 250) ctx.globalAlpha = 0.45;
    ctx.fillRect(14, 52, iw * clamp(W.ink / 100, 0, 1), 5);
    ctx.globalAlpha = 1;
    ctx.font = "8.5px 'IBM Plex Mono',monospace";
    ctx.fillStyle = 'rgba(233,226,208,0.45)';
    ctx.fillText(W.fail > 0 ? 'FARBAUSFALL' : 'FARBSTAND', 14, 63);
    if (W.combo > 1) {
      ctx.textAlign = 'right'; ctx.fillStyle = P.accent;
      ctx.font = "10px 'IBM Plex Mono',monospace";
      ctx.fillText('SERIE ×' + Math.min(8, W.combo), VW - 14, 63);
      ctx.textAlign = 'left';
    }
    ctx.fillStyle = '#0B0A09'; ctx.fillRect(0, HUD - 1, VW, 2);
  }

  function render(time: number): void {
    const P = pal();
    const jit = Math.sin(time * 0.03) * 0.6;                  /* Maschinen-Vibration, rein optisch */
    ctx.setTransform(scale, 0, 0, scale, 0, 0);
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = '#0B0A09'; ctx.fillRect(0, 0, VW, VH);
    drawHud(P);

    ctx.save();
    ctx.translate(W.shake ? rnd(-W.shake, W.shake) : 0, HUD + (W.shake ? rnd(-W.shake, W.shake) * 0.5 : 0));
    ctx.beginPath(); ctx.rect(0, 0, VW, PH); ctx.clip();

    ctx.fillStyle = PAPER; ctx.fillRect(0, 0, VW, PH);
    ctx.globalAlpha = 0.055;
    ctx.save(); ctx.translate(-(W.dist * 0.5) % 110, -(W.dist * 0.5) % 110);
    ctx.fillStyle = grainPat; ctx.fillRect(0, 0, VW + 110, PH + 110); ctx.restore();
    ctx.globalAlpha = 0.07; ctx.fillStyle = halfPat; ctx.fillRect(0, 0, VW, PH);
    ctx.globalAlpha = 1;

    ctx.fillStyle = 'rgba(70,55,40,0.16)';
    for (let y = -(W.dist % 46) - 46; y < PH + 46; y += 46) { ctx.beginPath(); ctx.arc(13, y, 5, 0, 7); ctx.fill(); }
    ctx.fillStyle = 'rgba(70,55,40,0.14)'; ctx.fillRect(26, 0, 1, PH);

    /* Platten: echter Overprint */
    ctx.globalCompositeOperation = 'multiply';
    ctx.fillStyle = P.blue;
    for (const c of W.blue) {
      const x = c.x - W.dist + RUN_X;
      if (x + c.w < -20 || x > VW + 20) continue;
      ctx.fillRect(x, c.y, c.w, c.h);
      ctx.fillRect(x + 4, c.y + c.h, 5, 4);
      ctx.fillRect(x + c.w - 9, c.y + c.h, 5, 4);
    }
    ctx.fillStyle = P.pink;
    for (const c of W.pink) {
      const x = c.x + W.reg + jit - W.dist + RUN_X;
      if (x + c.w < -20 || x > VW + 20) continue;
      ctx.fillRect(x, c.y, c.w, c.h);
      ctx.fillRect(x + 4, c.y - 4, 5, 4);
      ctx.fillRect(x + c.w - 9, c.y - 4, 5, 4);
    }
    ctx.fillStyle = 'rgba(42,16,48,0.34)';
    for (const g of W.grounds) {
      const x = g.x - W.dist + RUN_X;
      if (x + g.w < -20 || x > VW + 20) continue;
      ctx.fillRect(x, g.y, g.w, g.h);
    }
    ctx.fillStyle = 'rgba(28,8,32,0.6)';
    for (const g of W.grounds) {
      const x = g.x - W.dist + RUN_X;
      if (x + g.w < -20 || x > VW + 20) continue;
      ctx.fillRect(x, g.y, g.w, 2.5);
    }
    ctx.globalCompositeOperation = 'source-over';

    for (const b of W.blobs) {
      if (b.hit) continue;
      const x = b.x - W.dist + RUN_X;
      if (x < -40 || x > VW + 40) continue;
      ctx.fillStyle = P.pink;
      ctx.beginPath();
      for (let i = 0; i < 9; i++) {
        const a = i / 9 * 6.283;
        const rr = b.r * (0.62 + 0.5 * Math.abs(Math.sin(b.seed + i * 2.1)));
        const px = x + Math.cos(a) * rr, py2 = b.y + Math.sin(a) * rr;
        if (i) ctx.lineTo(px, py2); else ctx.moveTo(px, py2);
      }
      ctx.closePath(); ctx.fill();
      ctx.fillStyle = PAPER; ctx.beginPath(); ctx.arc(x - b.r * 0.25, b.y - b.r * 0.3, b.r * 0.2, 0, 7); ctx.fill();
    }

    for (const m of W.marks_) {
      if (m.got) continue;
      const x = m.x - W.dist + RUN_X;
      if (x < -30 || x > VW + 30) continue;
      const pu = 1 + Math.sin(time * 0.006 + m.x) * 0.09;
      ctx.save(); ctx.translate(x, m.y); ctx.rotate(time * 0.0009 + m.x * 0.01); ctx.scale(pu, pu);
      ctx.strokeStyle = P.accent; ctx.lineWidth = 2.2;
      ctx.beginPath(); ctx.arc(0, 0, 9, 0, 7); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(-13, 0); ctx.lineTo(13, 0); ctx.moveTo(0, -13); ctx.lineTo(0, 13); ctx.stroke();
      ctx.fillStyle = P.accent; ctx.beginPath(); ctx.arc(0, 0, 2.4, 0, 7); ctx.fill();
      ctx.restore();
    }

    drawRunner(P, time);

    for (const p of W.parts) {
      ctx.globalAlpha = Math.max(0, p.l);
      ctx.fillStyle = p.col;
      ctx.fillRect(p.x - p.s / 2, p.y - p.s / 2, p.s, p.s);
    }
    ctx.globalAlpha = 1;

    ctx.fillStyle = 'rgba(20,17,15,0.5)'; ctx.fillRect(0, 0, VW, 9);
    ctx.fillStyle = PAPER;
    for (let x = 14; x < VW; x += 30) ctx.fillRect(x, 3, 12, 3);
    const grd = ctx.createLinearGradient(0, PH - 52, 0, PH);
    grd.addColorStop(0, 'rgba(20,17,15,0)'); grd.addColorStop(1, 'rgba(20,17,15,0.42)');
    ctx.fillStyle = grd; ctx.fillRect(0, PH - 52, VW, 52);

    ctx.strokeStyle = 'rgba(42,16,48,0.35)'; ctx.lineWidth = 1;
    [[38, 26], [VW - 38, 26], [38, PH - 26], [VW - 38, PH - 26]].forEach(([cx, cy]) => {
      ctx.beginPath(); ctx.arc(cx, cy, 7, 0, 7); ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(cx - 11, cy); ctx.lineTo(cx + 11, cy);
      ctx.moveTo(cx, cy - 11); ctx.lineTo(cx, cy + 11);
      ctx.stroke();
    });

    ctx.textAlign = 'center';
    for (const t of W.toasts) {
      ctx.globalAlpha = Math.max(0, Math.min(1, t.l * 1.6));
      ctx.fillStyle = t.col;
      ctx.font = `${t.big ? 30 : 16}px 'Archivo Black',sans-serif`;
      ctx.save(); ctx.translate(VW / 2 + (1 - t.l) * 12, 300 + t.y); ctx.rotate(-0.035);
      ctx.fillText(t.txt, 0, 0); ctx.restore();
    }
    ctx.globalAlpha = 1;
    ctx.textAlign = 'left';

    if (W.flash > 0.02) { ctx.fillStyle = `rgba(233,226,208,${W.flash * 0.5})`; ctx.fillRect(0, 0, VW, PH); }
    if (W.smear > 0) { ctx.strokeStyle = P.pink; ctx.lineWidth = 3; ctx.strokeRect(2, 2, VW - 4, PH - 4); }
    ctx.restore();
  }

  /* ── Loop ───────────────────────────────────────────────────── */
  let last = performance.now(), frames = 0, fpsT = 0;
  function loop(now: number): void {
    const dt = Math.min(0.034, (now - last) / 1000); last = now;
    update(dt); render(now);
    frames++; fpsT += dt;
    if (fpsT > 0.5) { $('fps').textContent = `${Math.round(frames / fpsT)} fps`; frames = 0; fpsT = 0; }
    requestAnimationFrame(loop);
  }

  /* ── UI ─────────────────────────────────────────────────────── */
  function buildPals(): void {
    const row = $('palRow');
    row.innerHTML = '';
    PALETTES.forEach((p, i) => {
      const open = S.best >= p.need;
      const b = document.createElement('button');
      b.className = 'chip flex-1 p-1.5 text-left';
      b.disabled = !open;
      b.setAttribute('aria-pressed', String(S.pal === i));
      b.innerHTML =
        `<span class="block h-6 mb-1" style="background:linear-gradient(90deg,${p.blue} 0 50%,${p.pink} 50% 100%)"></span>` +
        `<span class="block text-[9px] leading-tight" style="color:#14110F">${open ? p.name.split(' / ')[0] : 'ab ' + p.need}</span>`;
      b.onclick = () => { S.pal = i; save(); buildPals(); Machine.klack(); };
      row.appendChild(b);
    });
  }

  $('btnStart').onclick = start;
  $('btnAgain').onclick = start;
  $('btnMenu').onclick = () => {
    W.mode = 'menu';
    $('ovOver').classList.add('hidden');
    $('ovMenu').classList.remove('hidden');
    $('menuBest').textContent = String(S.best);
    $('stRuns').textContent = `${S.runs} Bögen gefahren`;
  };
  const syncToggles = (): void => {
    $('btnSound').textContent = 'Ton: ' + (S.sound ? 'an' : 'aus');
    $('btnHap').textContent = 'Haptik: ' + (S.hap ? 'an' : 'aus');
  };
  $('btnSound').onclick = () => { Machine.toggle(!S.sound); syncToggles(); };
  $('btnHap').onclick = () => { S.hap = !S.hap; save(); syncToggles(); buzz(14); };

  buildPals(); syncToggles();
  $('menuBest').textContent = String(S.best);
  $('stRuns').textContent = `${S.runs} Bögen gefahren`;
  reset(); fit(); requestAnimationFrame(loop);

  /* ══ Seite ══════════════════════════════════════════════════ */
  const dm = $('demo') as HTMLCanvasElement;
  const dc = dm.getContext('2d') as CanvasRenderingContext2D;
  let demoBase = 30, demoW = 300, demoDrag: number | null = null, demoVisible = false;

  function demoFit(): void {
    const r = dm.getBoundingClientRect();
    const dpr = Math.min(devicePixelRatio || 1, 2);
    dm.width = Math.max(1, Math.round(r.width * dpr));
    dm.height = Math.round(230 * dpr);
    dc.setTransform(dpr, 0, 0, dpr, 0, 0);
    demoW = r.width || 300;
  }
  function demoDraw(t: number): void {
    const H = 230;
    const off = clamp(demoBase + Math.sin(t * 0.0007) * 34, -90, 90);
    dc.clearRect(0, 0, demoW, H);
    dc.fillStyle = PAPER; dc.fillRect(0, 0, demoW, H);
    dc.globalAlpha = 0.06; dc.fillStyle = halfPat; dc.fillRect(0, 0, demoW, H); dc.globalAlpha = 1;

    const A: Rect = { x: 30, y: 60, w: demoW - 120, h: 34 };
    const B: Rect = { x: 90 + off, y: 128, w: demoW - 120, h: 34 };
    dc.globalCompositeOperation = 'multiply';
    dc.fillStyle = pal().blue; dc.fillRect(A.x, A.y, A.w, A.h);
    dc.fillStyle = pal().pink; dc.fillRect(B.x, B.y, B.w, B.h);
    const x1 = Math.max(A.x, B.x), x2 = Math.min(A.x + A.w, B.x + B.w);
    const ov = Math.max(0, x2 - x1);
    if (ov > 2) {
      dc.fillStyle = 'rgba(42,16,48,0.4)'; dc.fillRect(x1, H / 2 - 14, ov, 28);
      dc.fillStyle = 'rgba(28,8,32,0.7)'; dc.fillRect(x1, H / 2 - 14, ov, 2);
    }
    dc.globalCompositeOperation = 'source-over';
    dc.strokeStyle = 'rgba(42,16,48,0.4)'; dc.setLineDash([3, 4]); dc.lineWidth = 1;
    dc.beginPath(); dc.moveTo(x1, 40); dc.lineTo(x1, H - 34); dc.moveTo(x2, 40); dc.lineTo(x2, H - 34); dc.stroke();
    dc.setLineDash([]);

    dc.font = "9px 'IBM Plex Mono',monospace";
    dc.fillStyle = pal().blue; dc.fillText('PLATTE A · FEST', A.x, A.y - 8);
    dc.fillStyle = pal().pink; dc.fillText(`PLATTE B · VERSATZ ${Math.round(off)} PX`, B.x, B.y + B.h + 16);
    dc.fillStyle = PLUM; dc.font = "10px 'IBM Plex Mono',monospace";
    dc.fillText(ov > 2 ? `TRAGFÄHIG · ${Math.round(ov)} PX` : 'KEIN BODEN', Math.max(6, x1), H / 2 - 22);
    $('demoPct').textContent = `${Math.round(clamp(ov / (demoW - 120), 0, 1) * 100)} %`;
  }
  new IntersectionObserver(es => es.forEach(e => {
    demoVisible = e.isIntersecting;
    if (e.isIntersecting) demoFit();
  }), { threshold: 0.15 }).observe(dm);
  (function demoLoop(t: number): void { if (demoVisible) demoDraw(t); requestAnimationFrame(demoLoop); })(0);
  addEventListener('resize', demoFit);

  const dPtr = (e: PointerEvent): void => {
    const r = dm.getBoundingClientRect();
    demoBase = clamp(((e.clientX - r.left) / r.width - 0.5) * 200, -90, 90);
  };
  dm.addEventListener('pointerdown', (e: PointerEvent) => { demoDrag = e.pointerId; dm.setPointerCapture(e.pointerId); dPtr(e); });
  dm.addEventListener('pointermove', (e: PointerEvent) => { if (demoDrag === e.pointerId) dPtr(e); });
  dm.addEventListener('pointerup', () => { demoDrag = null; });
  demoFit();

  const io = new IntersectionObserver(es => es.forEach(e => {
    if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); }
  }), { threshold: 0.18 });
  document.querySelectorAll('.reveal').forEach(el => io.observe(el));

  setTimeout(() => document.querySelectorAll('.reg.hunting').forEach(el => el.classList.remove('hunting')), 1700);
  const kick = (): void => {
    document.querySelectorAll<HTMLElement>('.reg').forEach((el, i) => {
      el.style.setProperty('--gx', `${-8 - i * 2}px`);
      el.style.setProperty('--gx2', `${8 + i * 2}px`);
      setTimeout(() => { el.style.setProperty('--gx', '0px'); el.style.setProperty('--gx2', '0px'); }, 60);
    });
  };
  const sio = new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) kick(); }), { threshold: 0.5 });
  document.querySelectorAll('section').forEach(s => sio.observe(s));

  const tick = (): void => {
    const d = new Date();
    $('clock').textContent = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  };
  tick(); setInterval(tick, 20000);

  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    addEventListener('load', () => { void navigator.serviceWorker.register('sw.js').catch(() => undefined); });
  }
})();
