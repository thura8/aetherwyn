// Ported from the prototype as plain JavaScript; it gets TypeScript types in a later step.
// ===================== AETHERWYN — title menu, sound, input =====================
import qrcode from 'qrcode-generator';
import { createWorld } from './world.js';


/**
 * Starts the title screen inside markup already on the page (see TitleScene.tsx).
 * Returns a function that stops it and releases every listener, timer, sound and GPU resource.
 */
export function startTitleMenu() {
  let alive = true;
  const offs = [];
  const timers = [];
  const on = (target, type, fn, opts) => { target.addEventListener(type, fn, opts); offs.push(() => target.removeEventListener(type, fn, opts)); };
  const later = (fn, ms) => { const id = setTimeout(() => { if (alive) fn(); }, ms); timers.push(id); return id; };

  const $ = (id) => document.getElementById(id);
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const coarse = matchMedia('(pointer: coarse)').matches;
  const qParam = (() => { try { return new URLSearchParams(location.search).get('quality') || (location.hash.match(/quality-(high|low)/) || [])[1]; } catch { return null; } })();
  const tier = qParam === 'high' || qParam === 'low' ? qParam : (coarse || /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent) || (navigator.hardwareConcurrency || 8) <= 4) ? 'low' : 'high';
  const store = { get(k) { try { return localStorage.getItem(k); } catch { return null; } }, set(k, v) { try { localStorage.setItem(k, v); } catch { /* storage blocked */ } } };

  // ---------------- title letters ----------------
  $('title').textContent = '';
  'AETHERWYN'.split('').forEach((ch, i) => {
    const s = document.createElement('span'); s.textContent = ch; s.style.setProperty('--i', i); s.setAttribute('aria-hidden', 'true'); $('title').appendChild(s);
  });
  let toastTimer;
  function toast(msg) { const el = $('toast'); el.textContent = msg; el.classList.add('show'); clearTimeout(toastTimer); toastTimer = later(() => el.classList.remove('show'), 3000); }

  // ===================== SOUND (synthesised, no files) =====================
  const Sound = (() => {
    let ctx = null, master, sfxBus, musicBus, verb, muted = store.get('aw-muted') === '1', musicTimer = null, chordIdx = 0, nextChordAt = 0, nextBellAt = 0;
    const notes = (n) => 440 * Math.pow(2, (n - 69) / 12);
    const CHORDS = [[50, 57, 62, 65, 69], [46, 53, 58, 62, 69], [41, 48, 53, 57, 64], [48, 55, 60, 64, 67]]; // Dm9 · B♭maj7 · Fmaj7 · C(add9)
    const SCALE = [62, 64, 65, 67, 69, 72, 74, 76, 77, 81];
    function impulse(sec) {
      const len = ctx.sampleRate * sec, b = ctx.createBuffer(2, len, ctx.sampleRate);
      for (let c = 0; c < 2; c++) { const d = b.getChannelData(c); for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.6); }
      return b;
    }
    function init() {
      if (ctx) return;
      const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
      ctx = new AC();
      master = ctx.createGain(); master.gain.value = muted ? 0 : 0.9;
      const comp = ctx.createDynamicsCompressor(); comp.threshold.value = -16; comp.ratio.value = 3;
      master.connect(comp).connect(ctx.destination);
      verb = ctx.createConvolver(); verb.buffer = impulse(3.2);
      const verbGain = ctx.createGain(); verbGain.gain.value = 0.55; verb.connect(verbGain).connect(master);
      sfxBus = ctx.createGain(); sfxBus.gain.value = 0.8; sfxBus.connect(master);
      musicBus = ctx.createGain(); musicBus.gain.value = 0.0; musicBus.connect(master);
      musicBus.gain.setTargetAtTime(0.32, ctx.currentTime + 0.2, 2.5);
      startMusic();
    }
    function env(node, t, a, peak, d) { node.gain.setValueAtTime(0.0001, t); node.gain.exponentialRampToValueAtTime(peak, t + a); node.gain.exponentialRampToValueAtTime(0.0001, t + a + d); }
    function tone(freq, { type = 'sine', t = 0, a = 0.005, d = 0.4, peak = 0.2, send = 0.3, bus = sfxBus, glide = 0 } = {}) {
      if (!ctx) return;
      const now = ctx.currentTime + t, o = ctx.createOscillator(), g = ctx.createGain();
      o.type = type; o.frequency.setValueAtTime(freq, now);
      if (glide) o.frequency.exponentialRampToValueAtTime(Math.max(30, freq * glide), now + a + d);
      env(g, now, a, peak, d); o.connect(g); g.connect(bus);
      if (send) { const s = ctx.createGain(); s.gain.value = send; g.connect(s).connect(verb); }
      o.start(now); o.stop(now + a + d + 0.05);
    }
    function noise(dur, { t = 0, from = 400, to = 2000, q = 1.2, peak = 0.15, send = 0.4 } = {}) {
      if (!ctx) return;
      const now = ctx.currentTime + t, len = Math.ceil(ctx.sampleRate * dur), b = ctx.createBuffer(1, len, ctx.sampleRate), d = b.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      const src = ctx.createBufferSource(); src.buffer = b;
      const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.Q.value = q;
      f.frequency.setValueAtTime(from, now); f.frequency.exponentialRampToValueAtTime(to, now + dur * 0.55); f.frequency.exponentialRampToValueAtTime(Math.max(80, from * 0.6), now + dur);
      const g = ctx.createGain(); env(g, now, dur * 0.35, peak, dur * 0.65);
      src.connect(f).connect(g).connect(sfxBus); const s = ctx.createGain(); s.gain.value = send; g.connect(s).connect(verb);
      src.start(now); src.stop(now + dur + 0.05);
    }
    // ambient music: slow pad chords + sparse bells
    function padChord(midi, at, dur) {
      midi.forEach((n, k) => {
        [-6, 6].forEach((det) => {
          const o = ctx.createOscillator(), f = ctx.createBiquadFilter(), g = ctx.createGain();
          o.type = k === 0 ? 'triangle' : 'sawtooth'; o.frequency.value = notes(n); o.detune.value = det;
          f.type = 'lowpass'; f.frequency.setValueAtTime(500, at); f.frequency.linearRampToValueAtTime(1100, at + dur * 0.5); f.frequency.linearRampToValueAtTime(600, at + dur);
          const peak = k === 0 ? 0.05 : 0.022;
          g.gain.setValueAtTime(0.0001, at); g.gain.linearRampToValueAtTime(peak, at + 2.4); g.gain.setValueAtTime(peak, at + dur - 2); g.gain.linearRampToValueAtTime(0.0001, at + dur + 1.5);
          o.connect(f).connect(g); g.connect(musicBus); const s = ctx.createGain(); s.gain.value = 0.6; g.connect(s).connect(verb);
          o.start(at); o.stop(at + dur + 1.6);
        });
      });
    }
    function bell(n, at) {
      [1, 2.01, 3.02].forEach((h, i) => {
        const o = ctx.createOscillator(), g = ctx.createGain();
        o.type = 'sine'; o.frequency.value = notes(n) * h;
        g.gain.setValueAtTime(0.0001, at); g.gain.exponentialRampToValueAtTime([0.05, 0.016, 0.008][i], at + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, at + 2.6 - i * 0.6);
        o.connect(g); g.connect(musicBus); const s = ctx.createGain(); s.gain.value = 0.9; g.connect(s).connect(verb);
        o.start(at); o.stop(at + 2.7);
      });
    }
    function startMusic() {
      nextChordAt = ctx.currentTime + 0.3; nextBellAt = ctx.currentTime + 2;
      musicTimer = setInterval(() => {
        if (!ctx || ctx.state !== 'running') return;
        const ahead = ctx.currentTime + 0.6;
        while (nextChordAt < ahead) { padChord(CHORDS[chordIdx % 4], nextChordAt, 8); chordIdx++; nextChordAt += 8; }
        while (nextBellAt < ahead) { bell(SCALE[Math.floor(Math.random() * SCALE.length)], nextBellAt); nextBellAt += 1.2 + Math.random() * 2.4; }
      }, 250);
    }
    const api = {
      unlock() { init(); if (ctx && ctx.state === 'suspended') ctx.resume(); },
      get muted() { return muted; },
      setMuted(m) { muted = m; store.set('aw-muted', m ? '1' : '0'); if (master) master.gain.setTargetAtTime(m ? 0 : 0.9, ctx.currentTime, 0.08); },
      suspend() { if (ctx && ctx.state === 'running') ctx.suspend(); },
      dispose() { clearInterval(musicTimer); if (ctx) ctx.close(); ctx = null; },
      resume() { if (ctx && ctx.state === 'suspended') ctx.resume(); },
      hover() { tone(1568, { d: 0.09, peak: 0.035, send: 0.15 }); tone(2093, { t: 0.03, d: 0.08, peak: 0.02, send: 0.2 }); },
      press() { [880, 1318.5, 1760].forEach((f, i) => tone(f, { t: i * 0.045, d: 0.7, peak: 0.08 - i * 0.015, send: 0.45 })); tone(110, { type: 'triangle', d: 0.25, peak: 0.12, send: 0 }); },
      back() { [1174.7, 880].forEach((f, i) => tone(f, { t: i * 0.06, d: 0.35, peak: 0.06, send: 0.35 })); },
      whoosh() { noise(1.1, { from: 300, to: 2400, q: 0.9, peak: 0.12 }); },
      ignite() { tone(220, { type: 'sawtooth', a: 0.02, d: 0.9, peak: 0.05, glide: 4, send: 0.5 }); [1318.5, 1975.5].forEach((f, i) => tone(f, { t: 0.15 + i * 0.07, d: 1.2, peak: 0.05, send: 0.6 })); },
      surge() { noise(1.6, { from: 120, to: 1800, q: 0.7, peak: 0.16 }); tone(55, { type: 'sine', a: 0.05, d: 1.4, peak: 0.25, send: 0.2 }); [659.3, 987.8, 1318.5].forEach((f, i) => tone(f, { t: 0.2 + i * 0.08, d: 1.6, peak: 0.05, send: 0.7 })); },
      cast() { tone(1400, { type: 'square', a: 0.002, d: 0.16, peak: 0.035, glide: 0.18, send: 0.2 }); noise(0.22, { from: 2000, to: 5000, q: 2, peak: 0.07, send: 0.1 }); },
      hit(combo = 1) { const base = 1046.5 * Math.pow(2, Math.min(combo - 1, 7) / 12); [1, 1.5, 2.01, 2.99].forEach((h, i) => tone(base * h, { t: i * 0.012, d: 0.9 - i * 0.15, peak: 0.06, send: 0.55 })); tone(80, { type: 'sine', d: 0.25, peak: 0.25, glide: 0.5, send: 0 }); noise(0.3, { from: 3000, to: 7000, q: 1, peak: 0.06, send: 0.3 }); },
      miss() { noise(0.35, { from: 900, to: 300, q: 1.5, peak: 0.05, send: 0.3 }); },
      tick(hi = false) { tone(hi ? 1760 : 1174.7, { d: 0.12, peak: 0.06, send: 0.2 }); },
      error() { tone(220, { type: 'triangle', d: 0.18, peak: 0.08, send: 0.1 }); tone(207.7, { type: 'triangle', t: 0.1, d: 0.22, peak: 0.08, send: 0.1 }); },
    };
    return api;
  })();

  function syncSoundButton() {
    const on = !Sound.muted;
    $('sound').setAttribute('aria-pressed', String(on));
    $('sound').setAttribute('aria-label', on ? 'Sound on' : 'Sound off');
    $('sound-label').textContent = on ? 'Sound' : 'Muted';
    $('sound-icon').innerHTML = on
      ? '<path d="M4 9h4l5-4v14l-5-4H4z"/><path d="M16.5 8.5a5 5 0 0 1 0 7M19 6a8.5 8.5 0 0 1 0 12"/>'
      : '<path d="M4 9h4l5-4v14l-5-4H4z"/><path d="M17 9l5 6M22 9l-5 6"/>';
  }
  syncSoundButton();
  on($('sound'), 'click', () => { Sound.unlock(); Sound.setMuted(!Sound.muted); syncSoundButton(); if (!Sound.muted) Sound.press(); });
  const unlockOnce = () => { Sound.unlock(); };
  on(window, 'pointerdown', unlockOnce, { once: true });
  on(window, 'keydown', unlockOnce, { once: true });

  // ===================== WORLD =====================
  // the world is built asynchronously behind the loading screen (see boot() below)
  let world = null, T3 = null, fr = null;
  const backTarget = () => ((screen === 'training' || screen === 'join') && room ? 'lobby' : 'title');

  // ===================== CAMERA DIRECTOR =====================
  const cam = { mode: 'intro', start: 0, fromPos: null, fromLook: null, dur: 1.7, look: null };
  const mouse = { x: 0, y: 0, tx: 0, ty: 0 };
  on(window, 'pointermove', (e) => { mouse.tx = e.clientX / innerWidth - 0.5; mouse.ty = e.clientY / innerHeight - 0.5; });
  const easeInOut = (x) => x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
  const portrait = () => innerWidth / innerHeight < 0.9;
  const narrow = () => innerWidth <= 760;

  function shot(name, t, pos, look) {
    const mx = screen === 'training' ? 0 : mouse.x, my = screen === 'training' ? 0 : mouse.y;
    if (name === 'title') {
      const ang = Math.sin(t * 0.05) * 0.2 + mx * 0.16;
      pos.set(Math.sin(ang) * 44, 16.5 + Math.sin(t * 0.13) * 1.2 - my * 4, Math.cos(ang) * 44);
      look.set(mx * 3, 4 - my * 1.5, -3);
    } else if (name === 'lobby') {
      if (narrow()) { pos.set(Math.sin(t * 0.06) * 2, 46, 30); look.set(0, -8, -2); }
      else { pos.set(6 + Math.sin(t * 0.06) * 2 + mx * 2, 36 - my * 2, 36); look.set(-11, 0, -1); }
    } else if (name === 'join') {
      world.portalWorld(look);
      const p = look.clone();
      if (narrow()) { pos.set(p.x + 16, p.y + 6 + Math.sin(t * 0.1) * 0.6, p.z + 22); look.set(p.x, p.y + 2 - 6, p.z); }
      else { pos.set(p.x + 20 + mx * 2, p.y + 4 + Math.sin(t * 0.1) * 0.6 - my, p.z + 18); look.set(p.x + 6, p.y, p.z - 4); }
    } else if (name === 'training') {
      const P = fr.P, N = fr.N, T = fr.T;
      world.portalFrame(P, N); T.set(N.z, 0, -N.x);
      pos.copy(P).addScaledVector(N, portrait() ? 26 : 19.5).addScaledVector(T, Math.sin(t * 0.06) * 1.2); pos.y += portrait() ? 4.5 : 3;
      look.copy(P).addScaledVector(N, 5); look.y += portrait() ? 1.2 : 0.8;
    }
  }

  // ===================== SCREENS =====================
  let screen = 'title', busy = false;
  const screens = { title: $('scr-title'), lobby: $('scr-lobby'), join: $('scr-join'), training: $('scr-training') };
  // Intro: a short glide in from a wide shot that already frames the arena, castles and aurora.
  const INTRO = 4.2, IGNITE = [1.8, 2.2, 2.6, 3.0], ORB_AT = 3.5;
  const INTRO_FROM = { x: -14, y: 34, z: 92 }, INTRO_LOOK = { x: 0, y: 14, z: -50 };
  let introFired = { circles: [false, false, false, false], orb: false };

  function go(name) {
    if (busy || name === screen || !screens[name]) return;
    busy = true;
    const from = screen;
    if (from === 'title') screens.title.classList.remove('play');
    if (world && !introFired.orb) { introFired = { circles: [true, true, true, true], orb: true }; world.state.orbTarget = 1; }
    onLeave[from]?.(name);
    Sound.whoosh();
    screens[from].classList.add('out');
    $('veil').classList.add('on');
    later(() => { screens[from].hidden = true; $('veil').classList.remove('on'); }, 420);
    if (world) {
      cam.mode = 'move'; cam.start = world.state.t; cam.fromPos = world.camera.position.clone(); cam.fromLook = cam.look.clone();
      cam.dur = reduce ? 0.01 : 1.7;
    }
    screen = name; document.body.dataset.screen = name;
    $('back').hidden = name === 'title';
    later(() => {
      const el = screens[name]; el.hidden = false; void el.offsetWidth; el.classList.remove('out');
      onEnter[name]?.(from);
      const first = el.querySelector('[data-autofocus]') || el.querySelector('input, .btn:not(:disabled)');
      if (first && !coarse) first.focus({ preventScroll: true });
      busy = false;
    }, reduce ? 200 : 900);
  }
  const onEnter = {}, onLeave = {};

  // ----- title -----
  onEnter.title = () => { if (world) { world.setCircles([1, 1, 1, 1]); world.state.orbTarget = 1; } };

  // ----- lobby -----
  const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const WIZARDS = [['Lyra', 'The Mystic'], ['Thorne', 'The Elemental Mage'], ['Isolde', 'The Guardian'], ['Corvin', 'The Arcane Scholar'], ['Seren', 'The Mystic'], ['Bram', 'The Guardian']];
  const CLASSES = ['The Elemental Mage', 'The Guardian', 'The Mystic', 'The Arcane Scholar'];
  let room = null, testIdx = 0;
  const hexCss = (h) => '#' + h.toString(16).padStart(6, '0');
  function newCode() { let c = ''; const r = new Uint32Array(4); crypto.getRandomValues(r); for (let i = 0; i < 4; i++) c += ALPHABET[r[i] % ALPHABET.length]; return c; }
  function renderQR(text) {
    const box = $('qr');
    if (typeof qrcode === 'function') {
      const q = qrcode(0, 'M'); q.addData(text); q.make();
      box.innerHTML = q.createSvgTag({ cellSize: 3, margin: 0, scalable: true });
      const svg = box.querySelector('svg'); if (svg) { svg.querySelectorAll('path, rect').forEach((p) => { if (p.getAttribute('fill') === '#000000' || p.getAttribute('fill') === 'black') p.setAttribute('fill', '#1D2C55'); }); }
    } else box.textContent = text;
  }
  function renderSlots() {
    const ul = $('slots'); ul.innerHTML = '';
    const colors = world ? world.CIRCLE_COLORS : [0x9f6bff, 0x7fe8ff, 0xffd27a, 0x5ff0c8];
    room.players.forEach((p, i) => {
      const li = document.createElement('li');
      li.className = 'slot ' + (p ? 'filled' : 'empty');
      li.style.setProperty('--c', hexCss(colors[i]));
      li.innerHTML = `<span class="sig" aria-hidden="true"></span><span class="who"><span class="name"></span><span class="cls"></span></span><span class="end"></span>`;
      li.querySelector('.name').textContent = p ? p.name : 'Waiting for a wand…';
      li.querySelector('.cls').textContent = p ? p.cls : `Casting circle ${i + 1}`;
      if (p) {
        const pill = document.createElement('span'); pill.className = 'pill'; pill.textContent = p.test ? 'Test wand' : 'Wand connected';
        const x = document.createElement('button'); x.className = 'x'; x.type = 'button'; x.textContent = '×'; x.setAttribute('aria-label', `Remove ${p.name}`);
        x.addEventListener('click', () => { room.players[i] = null; Sound.back(); toast(`${p.name} left the circle.`); refreshLobby(); });
        li.querySelector('.end').append(pill, x);
      }
      if (!p || !p.fresh) li.style.animation = 'none';
      if (p) p.fresh = false;
      ul.appendChild(li);
    });
  }
  function refreshLobby() {
    renderSlots();
    const n = room.players.filter(Boolean).length;
    $('begin').disabled = n === 0;
    $('begin-reason').textContent = n === 0 ? 'Waiting for at least one wizard.' : n === 1 ? '1 wizard ready. A duel needs 2; training works with 1.' : `${n} wizards ready.`;
    $('add-test').disabled = n >= 4;
    if (world && screen === 'lobby') world.setCircles(room.players.map(Boolean));
  }
  function seatPlayer(name, cls, test) {
    const i = room.players.findIndex((p) => !p);
    if (i < 0) return -1;
    room.players[i] = { name, cls, test, fresh: true };
    if (world && screen === 'lobby') { world.circles[i].flashT = world.state.t; }
    Sound.ignite();
    return i;
  }
  onEnter.lobby = () => {
    if (!room) {
      room = { code: newCode(), players: [null, null, null, null] };
      if (world) { world.triggerShock(0.8); world.state.orbTarget = 1.6; later(() => { if (world) world.state.orbTarget = 1; }, 900); }
      Sound.surge();
    }
    $('room-code').textContent = room.code;
    renderQR(`https://aetherwyn.local/join?code=${room.code}`);
    refreshLobby();
  };
  on($('add-test'), 'click', () => {
    if (!room) return;
    const [name, cls] = WIZARDS[testIdx++ % WIZARDS.length];
    if (seatPlayer(name, cls, true) >= 0) { toast(`${name} entered the realm.`); refreshLobby(); }
  });
  on($('begin'), 'click', () => go('training'));
  on($('close-room'), 'click', () => { room = null; toast('Room closed.'); go('title'); });

  // ----- join -----
  const codeInput = $('code-input'), nameInput = $('name-input'), joinErr = $('join-error');
  on(codeInput, 'input', () => {
    const clean = codeInput.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 4);
    if (clean !== codeInput.value) codeInput.value = clean;
    codeInput.classList.remove('bad'); joinErr.textContent = '';
    if (clean.length === 4) Sound.tick(true);
  });
  on(nameInput, 'input', () => { nameInput.classList.remove('bad'); joinErr.textContent = ''; });
  function fail(input, msg) { input.classList.remove('bad'); void input.offsetWidth; input.classList.add('bad'); joinErr.textContent = msg; Sound.error(); input.focus(); }
  on($('join-form'), 'submit', (e) => {
    e.preventDefault();
    const code = codeInput.value.trim().toUpperCase(), name = nameInput.value.trim().replace(/[\u0000-\u001f]/g, '');
    if (code.length !== 4) return fail(codeInput, 'Room codes are 4 characters, like A94X.');
    if ([...code].some((ch) => !ALPHABET.includes(ch))) return fail(codeInput, 'Codes never use 0, O, 1 or I. Check the big screen.');
    if (!name) return fail(nameInput, 'Give your wizard a name (up to 20 characters).');
    if (!room || room.code !== code) return fail(codeInput, `No open realm has the code ${code}. Check the code on the big screen.`);
    if (room.players.every(Boolean)) return fail(codeInput, 'That realm is full. Four wizards are already in the circles.');
    const cls = CLASSES[room.players.filter(Boolean).length % 4];
    seatPlayer(name, cls, false);
    Sound.press();
    toast(`${name} entered the realm.`);
    codeInput.value = ''; nameInput.value = '';
    go('lobby');
  });
  onEnter.join = () => { if (world) { world.state.portalBoost = 1; } joinErr.textContent = ''; if (room && !codeInput.value) codeInput.placeholder = room.code; };
  onLeave.join = () => { if (world) world.state.portalBoost = 0; };

  // ----- training -----
  const TRAIN_SECONDS = 45;
  const train = { active: false, score: 0, combo: 1, best: 1, hits: 0, shots: 0, timeLeft: TRAIN_SECONDS, lastHit: -10, cool: 0, aim: { x: innerWidth / 2, y: innerHeight * 0.42 }, started: false, lastTick: 99 };
  const reticle = $('reticle');
  function setStat(id, val, bump) { const el = $(id); el.querySelector('b').textContent = val; if (bump) { el.classList.remove('bump'); void el.offsetWidth; el.classList.add('bump'); } }
  function moveReticle(x, y) { train.aim.x = Math.max(0, Math.min(innerWidth, x)); train.aim.y = Math.max(0, Math.min(innerHeight, y)); reticle.style.left = train.aim.x + 'px'; reticle.style.top = train.aim.y + 'px'; }
  function banner(text) { const b = $('banner'); b.textContent = text; b.hidden = false; b.classList.remove('go'); void b.offsetWidth; b.classList.add('go'); }
  function floater(text, x, y, miss) { const f = document.createElement('div'); f.className = 'floater' + (miss ? ' miss' : ''); f.textContent = text; f.style.left = x + 'px'; f.style.top = y + 'px'; document.body.appendChild(f); later(() => f.remove(), 950); }
  function casterIndices() { const seated = room ? room.players.map((p, i) => (p ? i : -1)).filter((i) => i >= 0) : []; return seated.length ? seated : [0, 3]; }
  let casterTurn = 0;
  function startRound() {
    Object.assign(train, { active: false, score: 0, combo: 1, best: 1, hits: 0, shots: 0, timeLeft: TRAIN_SECONDS, cool: 0, started: false, lastTick: 99 });
    setStat('st-score', 0); setStat('st-combo', '×1'); setStat('st-time', TRAIN_SECONDS); $('st-time').classList.remove('low');
    $('results').hidden = true; reticle.hidden = false; moveReticle(innerWidth / 2, innerHeight * 0.42);
    if (world) { world.state.training = true; world.state.beamH = 0.3; world.startTraining(); const seats = casterIndices(); world.setCircles([0, 1, 2, 3].map((i) => seats.includes(i))); world.state.orbTarget = 1; }
    const seq = reduce ? [['Cast!', 0]] : [['3', 0], ['2', 700], ['1', 1400], ['Cast!', 2100]];
    seq.forEach(([txt, ms], k) => later(() => { if (screen !== 'training') return; banner(txt); Sound.tick(k === seq.length - 1); if (k === seq.length - 1) { train.active = true; train.started = true; } }, 400 + ms));
  }
  function endRound() {
    train.active = false; reticle.hidden = true;
    $('res-score').textContent = train.score.toLocaleString();
    $('res-hits').textContent = train.hits;
    $('res-acc').textContent = train.shots ? Math.round(train.hits / train.shots * 100) + '%' : '0%';
    $('res-combo').textContent = '×' + train.best;
    $('res-h').textContent = train.score >= 2500 ? 'Archmage material' : train.score >= 1000 ? 'Well cast, wizard' : 'A promising start';
    $('results').hidden = false; Sound.surge();
    if (!coarse) $('again').focus();
  }
  function cast() {
    if (!world || !train.active || train.cool > 0) return;
    train.cool = 0.22; train.shots++;
    const seats = casterIndices(), idx = seats[casterTurn++ % seats.length];
    const color = world.CIRCLE_COLORS[idx];
    const ndcX = train.aim.x / innerWidth * 2 - 1, ndcY = -(train.aim.y / innerHeight * 2 - 1);
    const ax = train.aim.x, ay = train.aim.y;
    reticle.classList.add('fire'); later(() => reticle.classList.remove('fire'), 90);
    Sound.cast();
    if (navigator.vibrate) try { navigator.vibrate(12); } catch { /* not allowed */ }
    world.castBolt(idx, ndcX, ndcY, color, (hit) => {
      if (!train.active) return;
      if (hit) {
        train.combo = world.state.t - train.lastHit < 2.5 ? train.combo + 1 : 1;
        train.lastHit = world.state.t; train.best = Math.max(train.best, train.combo); train.hits++;
        const pts = 100 * train.combo; train.score += pts;
        setStat('st-score', train.score.toLocaleString(), true); setStat('st-combo', '×' + train.combo, train.combo > 1);
        floater(`+${pts}`, ax, ay); Sound.hit(train.combo); hitStop = 0.07;
      } else {
        train.combo = 1; setStat('st-combo', '×1'); floater('Missed', ax, ay, true); Sound.miss();
      }
    });
  }
  onEnter.training = () => { $('back').hidden = false; if (world) { world.state.focus = 'portal'; world.state.portalBoost = 0.35; } $('train-hint').textContent = coarse ? 'Tap a crystal to cast' : 'Aim at the crystals · click to cast · Space or arrow keys work too'; startRound(); };
  onLeave.training = () => { if (world) { world.state.focus = 'arena'; world.state.portalBoost = 0; } train.active = false; reticle.hidden = true; $('results').hidden = true; $('banner').hidden = true; if (world) { world.stopTraining(); world.state.training = false; world.state.beamH = 1; } };
  on($('again'), 'click', startRound);
  on($('to-menu'), 'click', () => go('title'));
  on($('stage'), 'pointerdown', (e) => { if (screen !== 'training') return; moveReticle(e.clientX, e.clientY); cast(); });
  on(window, 'pointermove', (e) => { if (screen === 'training' && e.pointerType !== 'touch') moveReticle(e.clientX, e.clientY); });

  // ----- title buttons -----
  on($('host'), 'click', () => go('lobby'));
  on($('join-here'), 'click', () => go('join'));
  on($('train'), 'click', () => go('training'));
  on($('back'), 'click', () => { Sound.back(); go(backTarget()); });

  // ===================== MENU FEEL: hover, press, ripple, 3D reactions =====================
  let lastHover = null;
  on(document, 'pointerover', (e) => {
    const b = e.target.closest('.btn, .icon-btn'); if (!b || b === lastHover || b.disabled) return;
    lastHover = b; Sound.hover(); react(b, true);
  });
  on(document, 'pointerout', (e) => { const b = e.target.closest('.btn, .icon-btn'); if (b && !b.contains(e.relatedTarget)) { if (lastHover === b) lastHover = null; react(b, false); } });
  on(document, 'focusin', (e) => { const b = e.target.closest('.btn'); if (b && e.target.matches(':focus-visible')) { Sound.hover(); react(b, true); } });
  on(document, 'focusout', (e) => { const b = e.target.closest('.btn'); if (b) react(b, false); });
  on(document, 'pointerdown', (e) => {
    const b = e.target.closest('.btn'); if (!b || b.disabled) return;
    const r = b.getBoundingClientRect(), dot = document.createElement('span');
    dot.className = 'ripple'; dot.style.left = (e.clientX - r.left) + 'px'; dot.style.top = (e.clientY - r.top) + 'px';
    b.appendChild(dot); later(() => dot.remove(), 650);
  });
  on(document, 'click', (e) => { const b = e.target.closest('.btn'); if (b && !b.disabled && b.id !== 'join-submit') Sound.press(); });
  function react(btn, on) {
    if (!world) return;
    const kind = btn.dataset.react;
    if (kind === 'orb') world.state.orbTarget = on ? 1.7 : 1;
    if (kind === 'portal') world.state.portalBoost = screen === 'training' ? 0.35 : (on || screen === 'join') ? 1 : 0;
    if (kind === 'circles') world.state.circleBoost = on ? 1 : 0;
  }

  // ===================== KEYBOARD & GAMEPAD =====================
  function focusables() { const el = screens[screen]; return el ? [...el.querySelectorAll('.btn:not(:disabled), input, .x')].filter((n) => n.offsetParent !== null) : []; }
  function moveFocus(dir) {
    const list = focusables(); if (!list.length) return;
    const i = list.indexOf(document.activeElement);
    const n = list[(i + dir + list.length) % list.length]; n.focus();
  }
  on(window, 'keydown', (e) => {
    if (e.key === 'm' || e.key === 'M') { if (document.activeElement && document.activeElement.tagName === 'INPUT') return; Sound.unlock(); Sound.setMuted(!Sound.muted); syncSoundButton(); return; }
    if (e.key === 'Escape') { if (screen !== 'title') { Sound.back(); go(backTarget()); } return; }
    if (screen === 'training' && train.active) {
      const step = 28;
      if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); cast(); }
      else if (e.key === 'ArrowLeft') moveReticle(train.aim.x - step, train.aim.y);
      else if (e.key === 'ArrowRight') moveReticle(train.aim.x + step, train.aim.y);
      else if (e.key === 'ArrowUp') moveReticle(train.aim.x, train.aim.y - step);
      else if (e.key === 'ArrowDown') moveReticle(train.aim.x, train.aim.y + step);
      return;
    }
    if (document.activeElement && document.activeElement.tagName === 'INPUT' && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) return;
    if (e.key === 'ArrowDown' || e.key === 'ArrowRight') { e.preventDefault(); moveFocus(1); }
    if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') { e.preventDefault(); moveFocus(-1); }
  });
  const pad = { prev: {}, repeatAt: 0 };
  function pollGamepad(now) {
    const gp = navigator.getGamepads ? [...navigator.getGamepads()].find(Boolean) : null; if (!gp) return;
    const btn = (i) => gp.buttons[i] && gp.buttons[i].pressed;
    const edge = (i) => { const p = btn(i), was = pad.prev[i]; pad.prev[i] = p; return p && !was; };
    const ax = gp.axes[0] || 0, ay = gp.axes[1] || 0;
    if (screen === 'training' && train.active) {
      if (Math.abs(ax) > 0.15 || Math.abs(ay) > 0.15) moveReticle(train.aim.x + ax * 14, train.aim.y + ay * 14);
      if (edge(0) || edge(7)) cast();
      if (edge(1)) { Sound.back(); go(backTarget()); }
      return;
    }
    const down = btn(13) || ay > 0.6, up = btn(12) || ay < -0.6;
    if ((down || up) && now > pad.repeatAt) { moveFocus(down ? 1 : -1); pad.repeatAt = now + 220; }
    if (!down && !up) pad.repeatAt = 0;
    if (edge(0) && document.activeElement && document.activeElement.click) { Sound.unlock(); document.activeElement.click(); }
    if (edge(1) && screen !== 'title') { Sound.back(); go(backTarget()); }
  }

  // ===================== LOOP, QUALITY, PAUSE =====================
  let hitStop = 0;
  const perf = { ema: 1 / 60, slowFor: 0, fastFor: 0 };
  function adapt(dt) {
    perf.ema += (dt - perf.ema) * 0.05;
    if (perf.ema > 1 / 42) { perf.slowFor += dt; perf.fastFor = 0; } else if (perf.ema < 1 / 57) { perf.fastFor += dt; perf.slowFor = 0; } else { perf.slowFor = perf.fastFor = 0; }
    if (perf.slowFor > 2) {
      perf.slowFor = 0;
      const pr = world.pixelRatio;
      if (world.aoOn) world.setQuality({ ao: false });
      else if (pr > 0.8) world.setQuality({ pr: Math.max(0.75, +(pr - 0.25).toFixed(2)) });
      else world.setQuality({ shadows: false });
    } else if (perf.fastFor > 6) {
      perf.fastFor = 0;
      const pr = world.pixelRatio, target = Math.min(world.maxPR, window.devicePixelRatio || 1);
      if (pr < target) world.setQuality({ pr: Math.min(target, +(pr + 0.25).toFixed(2)) });
    }
  }

  function boot() {
  if (world) {
    const { camera, state } = world;
    const pos = new T3.Vector3(), look = new T3.Vector3();
    cam.look = new T3.Vector3(INTRO_LOOK.x, INTRO_LOOK.y, INTRO_LOOK.z);
    world.setCircles([0, 0, 0, 0]); state.orbTarget = 0.15;
    if (reduce) { cam.mode = 'idle'; world.setCircles([1, 1, 1, 1]); state.orbTarget = 1; introFired = { circles: [true, true, true, true], orb: true }; }

    let last = performance.now(), firstFrameShown = false;
    const loop = () => {
      const now = performance.now();
      let dt = Math.min((now - last) / 1000, 0.05); last = now;
      adapt(dt);
      if (hitStop > 0) { hitStop -= dt; dt *= 0.15; }
      mouse.x += (mouse.tx - mouse.x) * 0.04; mouse.y += (mouse.ty - mouse.y) * 0.04;
      world.update(dt);
      const t = state.t;

      // intro ignition
      if (cam.mode === 'intro') {
        IGNITE.forEach((at, i) => { if (!introFired.circles[i] && t > at) { introFired.circles[i] = true; const l = [0, 0, 0, 0].map((_, k) => introFired.circles[k]); world.setCircles(l); Sound.ignite(); } });
        if (!introFired.orb && t > ORB_AT) { introFired.orb = true; state.orbTarget = 1; world.triggerShock(1); Sound.surge(); }
      }

      // camera
      shot(screen, t, pos, look);
      if (cam.mode === 'intro') {
        const k = Math.min(t / INTRO, 1), e = easeInOut(k);
        camera.position.set(INTRO_FROM.x + (pos.x - INTRO_FROM.x) * e, INTRO_FROM.y + (pos.y - INTRO_FROM.y) * e, INTRO_FROM.z + (pos.z - INTRO_FROM.z) * e);
        cam.look.set(INTRO_LOOK.x + (look.x - INTRO_LOOK.x) * e, INTRO_LOOK.y + (look.y - INTRO_LOOK.y) * e, INTRO_LOOK.z + (look.z - INTRO_LOOK.z) * e);
        if (k >= 1) cam.mode = 'idle';
      } else if (cam.mode === 'move') {
        const k = Math.min((t - cam.start) / cam.dur, 1), e = easeInOut(k);
        camera.position.lerpVectors(cam.fromPos, pos, e);
        // lift the path into a gentle arc
        camera.position.y += Math.sin(k * Math.PI) * 4;
        cam.look.lerpVectors(cam.fromLook, look, e);
        if (k >= 1) cam.mode = 'idle';
      } else {
        camera.position.lerp(pos, 0.06); cam.look.lerp(look, 0.08);
      }
      if (state.shake > 0) { camera.position.x += (Math.random() - 0.5) * state.shake; camera.position.y += (Math.random() - 0.5) * state.shake; state.shake *= 0.88; if (state.shake < 0.01) state.shake = 0; }
      camera.lookAt(cam.look);

      // training clock
      if (screen === 'training') {
        if (train.cool > 0) train.cool -= dt;
        if (train.active) {
          train.timeLeft -= dt;
          const s = Math.max(0, Math.ceil(train.timeLeft));
          if (s !== train.lastTick) { train.lastTick = s; setStat('st-time', s); $('st-time').classList.toggle('low', s <= 10); if (s <= 5 && s > 0) Sound.tick(false); }
          if (train.timeLeft <= 0) endRound();
          // lock-on hint
          const ray = world.aimRay(train.aim.x / innerWidth * 2 - 1, -(train.aim.y / innerHeight * 2 - 1));
          let lock = false; const p = new T3.Vector3();
          world.crystals.forEach((m) => { if (m.visible && m.userData.alive) { m.getWorldPosition(p); if (ray.distanceToPoint(p) < 2.1) lock = true; } });
          reticle.classList.toggle('lock', lock);
        }
      }

      pollGamepad(now);
      world.render();
      // the loading screen fades only once the first real frame is on screen
      if (!firstFrameShown) { firstFrameShown = true; reveal(); }
    };
    world.renderer.setAnimationLoop(loop);
    on(document, 'visibilitychange', () => {
      if (document.hidden) { world.renderer.setAnimationLoop(null); Sound.suspend(); }
      else { last = performance.now(); world.renderer.setAnimationLoop(loop); Sound.resume(); }
    });
  } else {
    // no WebGL: menus still work over the painted background
    cam.look = null;
  }
  }

  // ---------- loading screen ----------
  const loader = $('loader'), loaderText = $('loader-text'), loaderMeter = $('loader-meter'), loaderTip = $('loader-tip');
  const TIPS = [
    'Four casting circles ring the arena, one for each wizard.',
    'Your phone is your wand. Flick it to cast.',
    'The orb above the arena wakes when every circle is lit.',
    'Through the portal lie the Training Grounds.',
    'Crystals shatter faster when you chain your casts.',
    'Join from any phone with the four-letter room code.',
  ];
  let tipIndex = Math.floor(Math.random() * TIPS.length);
  function showTip() {
    if (!alive || loader.hidden) return;
    loaderTip.classList.add('swap');
    later(() => { tipIndex = (tipIndex + 1) % TIPS.length; loaderTip.textContent = TIPS[tipIndex]; loaderTip.classList.remove('swap'); }, 450);
    later(showTip, 3600);
  }
  loaderTip.textContent = TIPS[tipIndex];
  later(showTip, 3600);
  function setProgress(p, label) {
    if (!alive) return;
    loader.style.setProperty('--p', String(Math.max(0.02, Math.min(1, p))));
    loaderMeter.setAttribute('aria-valuenow', String(Math.round(p * 100)));
    if (label) loaderText.textContent = label;
    if (p >= 1) loader.classList.add('ready');
  }
  function reveal() {
    if (!alive) return;
    loader.classList.add('done');
    screens.title.classList.add('play');
    later(() => { loader.hidden = true; }, 1400);
  }
  // Start on the next tick: React's development mode mounts twice, and the first mount is cancelled before this runs.
  later(() => {
    const view = reduce ? { from: { x: 0, y: 16.5, z: 44 }, look: { x: 0, y: 4, z: -3 } } : { from: INTRO_FROM, look: INTRO_LOOK };
    createWorld($('stage'), { reduce, tier, onProgress: setProgress, view })
      .then((w) => {
        if (!alive) { w.dispose(); return; }
        world = w; T3 = w.THREE;
        fr = { P: new T3.Vector3(), N: new T3.Vector3(), T: new T3.Vector3() };
        boot();
      })
      .catch((e) => {
        console.warn('3D view unavailable; showing the menu without it.', e);
        if (alive) { setProgress(1, 'Ready'); boot(); reveal(); }
      });
  }, 0);

  document.body.dataset.screen = 'title';
  window.__aw = { go, get screen() { return screen; }, get room() { return room; }, train, get world() { return world; } };

  return function stopTitleMenu() {
    alive = false;
    offs.splice(0).forEach((off) => off());
    timers.splice(0).forEach((id) => clearTimeout(id));
    Sound.dispose();
    if (world) world.dispose();
    delete document.body.dataset.screen;
    delete window.__aw;
  };

}
