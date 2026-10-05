// 효과음: 파일 없이 WebAudio로 실시간 합성 (로딩 0, 저작권 걱정 없음)
let ctx = null;
let master = null;
let noiseBuf = null;
let volume = 0.6;
const lastPlay = new Map();

function init() {
  if (ctx) return true;
  try {
    ctx = new (window.AudioContext || window.webkitAudioContext)();
  } catch {
    return false;
  }
  master = ctx.createGain();
  master.gain.value = volume;
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -14;
  comp.ratio.value = 6;
  master.connect(comp);
  comp.connect(ctx.destination);
  noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
  const d = noiseBuf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  return true;
}

export function unlockAudio() {
  if (init() && ctx.state === 'suspended') ctx.resume();
}

export function setVolume(v) {
  volume = v;
  if (master) master.gain.value = v;
}

function env(g, t, a, peak, d) {
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(peak, t + a);
  g.gain.exponentialRampToValueAtTime(0.0001, t + a + d);
}

function tone(type, f0, f1, dur, vol, t0 = 0, out = master) {
  const t = ctx.currentTime + t0;
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(f0, t);
  if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
  env(g, t, 0.005, vol, dur);
  o.connect(g);
  g.connect(out);
  o.start(t);
  o.stop(t + dur + 0.05);
}

function noise(dur, vol, ftype, f0, f1, q = 1, t0 = 0, out = master) {
  const t = ctx.currentTime + t0;
  const s = ctx.createBufferSource();
  s.buffer = noiseBuf;
  const f = ctx.createBiquadFilter();
  f.type = ftype;
  f.Q.value = q;
  f.frequency.setValueAtTime(f0, t);
  if (f1 !== f0) f.frequency.exponentialRampToValueAtTime(Math.max(30, f1), t + dur);
  const g = ctx.createGain();
  env(g, t, 0.004, vol, dur);
  s.connect(f);
  f.connect(g);
  g.connect(out);
  s.start(t, Math.random() * 0.5);
  s.stop(t + dur + 0.05);
}

const SOUNDS = {
  swing: (v) => noise(0.13, 0.35 * v, 'bandpass', 900, 3200, 1.5),
  heavy: (v) => {
    noise(0.22, 0.4 * v, 'bandpass', 500, 2200, 1.2);
    tone('sine', 120, 60, 0.18, 0.25 * v);
  },
  stab: (v) => noise(0.07, 0.3 * v, 'highpass', 2500, 5000, 1),
  hit: (v) => {
    tone('sine', 160, 55, 0.12, 0.45 * v);
    noise(0.05, 0.25 * v, 'highpass', 2000, 2000, 1);
  },
  hitBig: (v) => {
    tone('sine', 110, 40, 0.25, 0.6 * v);
    noise(0.12, 0.35 * v, 'lowpass', 2500, 400, 1);
  },
  hurt: (v) => {
    tone('square', 220, 90, 0.12, 0.18 * v);
    noise(0.08, 0.25 * v, 'lowpass', 1800, 600, 1);
  },
  shoot: (v) => {
    noise(0.08, 0.3 * v, 'bandpass', 2400, 1200, 3);
    tone('triangle', 900, 500, 0.06, 0.08 * v);
  },
  fire: (v) => {
    noise(0.3, 0.35 * v, 'lowpass', 1200, 300, 0.8);
    tone('sawtooth', 90, 60, 0.25, 0.08 * v);
  },
  ice: (v) => {
    tone('triangle', 1600, 2400, 0.12, 0.12 * v);
    noise(0.15, 0.2 * v, 'highpass', 4000, 6000, 2);
  },
  boom: (v) => {
    tone('sine', 90, 30, 0.5, 0.7 * v);
    noise(0.45, 0.45 * v, 'lowpass', 1600, 120, 0.7);
  },
  dash: (v) => noise(0.16, 0.3 * v, 'bandpass', 600, 2800, 0.8),
  blink: (v) => {
    tone('sine', 400, 1600, 0.15, 0.15 * v);
    tone('sine', 800, 2400, 0.12, 0.08 * v, 0.03);
  },
  stun: (v) => {
    tone('square', 1200, 1200, 0.05, 0.06 * v);
    tone('square', 900, 900, 0.05, 0.06 * v, 0.07);
  },
  shield: (v) => tone('triangle', 520, 780, 0.25, 0.15 * v),
  level: (v) => [523, 659, 784, 1047].forEach((f, i) => tone('triangle', f, f, 0.18, 0.13 * v, i * 0.07)),
  pickup: (v) => tone('sine', 880, 1320, 0.08, 0.1 * v),
  soul: (v) => tone('sine', 1100 + Math.random() * 400, 1600, 0.05, 0.05 * v),
  chest: (v) => [392, 523, 659, 784].forEach((f, i) => tone('triangle', f, f, 0.22, 0.12 * v, i * 0.05)),
  orb: (v) => {
    [330, 440, 554, 659, 880].forEach((f, i) => tone('sine', f, f, 0.5, 0.12 * v, i * 0.06));
  },
  alarm: (v) => {
    tone('sawtooth', 220, 220, 0.25, 0.12 * v);
    tone('sawtooth', 165, 165, 0.25, 0.12 * v, 0.28);
  },
  horn: (v) => {
    tone('sawtooth', 98, 98, 0.9, 0.16 * v);
    tone('sawtooth', 147, 147, 0.9, 0.08 * v);
  },
  kill: (v) => {
    tone('square', 660, 660, 0.08, 0.1 * v);
    tone('square', 990, 990, 0.12, 0.1 * v, 0.08);
  },
  death: (v) => tone('sawtooth', 440, 80, 0.7, 0.2 * v),
  ult: (v) => {
    tone('sawtooth', 110, 220, 0.4, 0.15 * v);
    noise(0.4, 0.3 * v, 'bandpass', 300, 3000, 1);
  },
  ui: (v) => tone('sine', 700, 900, 0.05, 0.08 * v),
  win: (v) => [523, 659, 784, 1047, 1319].forEach((f, i) => tone('triangle', f, f, 0.4, 0.15 * v, i * 0.12)),
  lose: (v) => [392, 330, 262].forEach((f, i) => tone('triangle', f, f, 0.4, 0.12 * v, i * 0.18)),
};

// v: 거리 등으로 줄인 볼륨(0~1)
export function play(name, v = 1) {
  if (!ctx || v < 0.03 || volume <= 0) return;
  const now = performance.now();
  const last = lastPlay.get(name) || 0;
  if (now - last < 35) return;
  lastPlay.set(name, now);
  const fn = SOUNDS[name];
  if (fn) fn(Math.min(1, v));
}
