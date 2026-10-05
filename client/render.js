// 캔버스 렌더러: 이미지 파일 없이 전부 코드로 그림 (네온 발광 + 파티클)
import { COSMETIC_MAP } from '../shared/cosmetics.js';
import { WEAPONS, RARITIES, ORBS } from '../shared/items.js';
import { PF } from '../shared/sim.js';
import { VIEW_W, VIEW_H } from '../shared/constants.js';

const TAU = Math.PI * 2;
const WCOLOR = Object.fromEntries(Object.values(WEAPONS).map((w) => [w.id, w.color]));
const ENEMY_TELE = '#ff3d4f';

function hexA(hex, a) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

function mix(hex, hex2, k) {
  const a = parseInt(hex.slice(1), 16);
  const b = parseInt(hex2.slice(1), 16);
  const c = (s) => Math.round(((a >> s) & 255) * (1 - k) + ((b >> s) & 255) * k);
  return `#${((1 << 24) | (c(16) << 16) | (c(8) << 8) | c(0)).toString(16).slice(1)}`;
}

// 발광 스프라이트 캐시 (radial gradient를 매번 만들지 않기 위해)
const glowCache = new Map();
function glow(color) {
  let c = glowCache.get(color);
  if (c) return c;
  c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, hexA(color, 1));
  gr.addColorStop(0.25, hexA(color, 0.55));
  gr.addColorStop(1, hexA(color, 0));
  g.fillStyle = gr;
  g.fillRect(0, 0, 64, 64);
  glowCache.set(color, c);
  return c;
}

function seeded(n) {
  let s = n * 9301 + 49297;
  return () => {
    s = (s * 9301 + 49297) % 233280;
    return s / 233280;
  };
}

export class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.dpr = 1;
    this.w = 0;
    this.h = 0;
    this.zoom = 1;
    this.cam = { x: 0, y: 0 };
    this.shakeT = 0;
    this.shakeAmt = 0;
    this.particles = [];
    this.fx = [];
    this.texts = [];
    this.flash = new Map();
    this.trails = new Map();
    this.floor = this.makeFloor();
    this.floorPattern = null;
    this.rockShapes = new Map();
    this.settings = { shake: true };
    this.resize();
    addEventListener('resize', () => this.resize());
  }

  resize() {
    this.dpr = Math.min(2, window.devicePixelRatio || 1);
    this.w = innerWidth;
    this.h = innerHeight;
    this.canvas.width = Math.floor(this.w * this.dpr);
    this.canvas.height = Math.floor(this.h * this.dpr);
    this.canvas.style.width = `${this.w}px`;
    this.canvas.style.height = `${this.h}px`;
    // 모든 유저가 같은 넓이의 월드를 보도록
    this.zoom = Math.sqrt((this.w * this.h) / (VIEW_W * VIEW_H));
  }

  makeFloor() {
    const S = 512;
    const c = document.createElement('canvas');
    c.width = c.height = S;
    const g = c.getContext('2d');
    g.fillStyle = '#15111f';
    g.fillRect(0, 0, S, S);
    const rnd = seeded(7);
    // 판석
    const rows = 8;
    const h = S / rows;
    for (let r = 0; r < rows; r++) {
      let x = r % 2 ? -h * 0.5 : 0;
      while (x < S) {
        const w = h * (0.8 + rnd() * 0.9);
        const shade = 18 + Math.floor(rnd() * 10);
        g.fillStyle = `rgb(${shade + 4},${shade},${shade + 14})`;
        g.fillRect(x + 2, r * h + 2, w - 4, h - 4);
        g.fillStyle = 'rgba(255,255,255,0.025)';
        g.fillRect(x + 2, r * h + 2, w - 4, 3);
        x += w;
      }
    }
    // 얼룩
    for (let i = 0; i < 260; i++) {
      g.fillStyle = `rgba(${rnd() < 0.5 ? '0,0,0' : '120,90,160'},${0.05 + rnd() * 0.08})`;
      g.beginPath();
      g.arc(rnd() * S, rnd() * S, 1 + rnd() * 3, 0, TAU);
      g.fill();
    }
    // 빛나는 균열
    g.strokeStyle = 'rgba(94,242,214,0.16)';
    g.lineWidth = 1.5;
    for (let i = 0; i < 5; i++) {
      let x = rnd() * S;
      let y = rnd() * S;
      g.beginPath();
      g.moveTo(x, y);
      for (let k = 0; k < 6; k++) {
        x += (rnd() - 0.5) * 50;
        y += (rnd() - 0.5) * 50;
        g.lineTo(x, y);
      }
      g.stroke();
    }
    return c;
  }

  // ---------------- 이펙트 API ----------------
  shake(a) {
    if (!this.settings.shake) return;
    this.shakeAmt = Math.min(22, Math.max(this.shakeAmt, a));
    this.shakeT = 0.25;
  }

  hitFlash(id) {
    this.flash.set(id, 0.09);
  }

  burst(x, y, color, n = 10, speed = 220, size = 4, life = 0.45, opts = {}) {
    for (let i = 0; i < n; i++) {
      const a = opts.dir != null ? opts.dir + (Math.random() - 0.5) * (opts.spread ?? 1) : Math.random() * TAU;
      const s = speed * (0.35 + Math.random() * 0.8);
      this.particles.push({
        x,
        y,
        vx: Math.cos(a) * s,
        vy: Math.sin(a) * s,
        life: life * (0.6 + Math.random() * 0.6),
        max: life,
        size: size * (0.6 + Math.random() * 0.8),
        color,
        drag: opts.drag ?? 3,
        grav: opts.grav ?? 0,
        glow: opts.glow ?? true,
        shape: opts.shape || 'dot',
        rot: Math.random() * TAU,
      });
    }
    if (this.particles.length > 1400) this.particles.splice(0, this.particles.length - 1400);
  }

  ring(x, y, r0, r1, color, dur = 0.35, width = 6) {
    this.fx.push({ k: 'ring', x, y, r0, r1, color, t: 0, dur, width });
  }

  slash(x, y, aim, arc, range, color, color2, step = 0, dur = 0.16) {
    this.fx.push({ k: 'slash', x, y, aim, arc, range, color, color2, t: 0, dur, flip: step % 2 });
  }

  cone(x, y, aim, arc, range, color) {
    this.fx.push({ k: 'cone', x, y, aim, arc, range, color, t: 0, dur: 0.3 });
  }

  beam(x1, y1, x2, y2, color, width = 8, dur = 0.25) {
    this.fx.push({ k: 'beam', x1, y1, x2, y2, color, width, t: 0, dur });
  }

  pillar(x, y, color, dur = 0.8, w = 50) {
    this.fx.push({ k: 'pillar', x, y, color, t: 0, dur, w });
  }

  text(x, y, str, color = '#fff', size = 16, dur = 0.8, opts = {}) {
    this.texts.push({ x: x + (Math.random() - 0.5) * 14, y, str, color, size, t: 0, dur, vy: opts.vy ?? -70, bold: opts.bold ?? true, stroke: opts.stroke ?? true });
    if (this.texts.length > 120) this.texts.shift();
  }

  // ---------------- 메인 그리기 ----------------
  draw(v, dt) {
    const ctx = this.ctx;
    const { w, h, zoom } = this;
    this.update(dt);
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.fillStyle = '#05040a';
    ctx.fillRect(0, 0, w, h);

    let sx = 0;
    let sy = 0;
    if (this.shakeT > 0) {
      const k = this.shakeT / 0.25;
      sx = (Math.random() - 0.5) * this.shakeAmt * k;
      sy = (Math.random() - 0.5) * this.shakeAmt * k;
    }
    this.cam.x = v.cam.x;
    this.cam.y = v.cam.y;
    ctx.save();
    ctx.translate(w / 2 + sx, h / 2 + sy);
    ctx.scale(zoom, zoom);
    ctx.translate(-v.cam.x, -v.cam.y);
    this.view = {
      x0: v.cam.x - w / 2 / zoom - 100,
      x1: v.cam.x + w / 2 / zoom + 100,
      y0: v.cam.y - h / 2 / zoom - 100,
      y1: v.cam.y + h / 2 / zoom + 100,
    };

    this.drawFloor(v);
    this.drawZone(v);
    this.drawAltars(v);
    this.drawChests(v);
    this.drawItems(v);
    this.drawSouls(v);
    this.drawAreas(v, false);
    this.drawObstacleShadows(v);
    for (const m of v.monsters) if (this.visible(m.x, m.y)) this.drawMonster(m, v.time);
    for (const p of v.players) if (!p.me && this.visible(p.x, p.y)) this.drawPlayer(p, v);
    const me = v.players.find((p) => p.me);
    if (me) this.drawPlayer(me, v);
    this.drawObstacles(v);
    this.drawGroundOrbs(v);
    this.drawProjectiles(v);
    this.drawAreas(v, true);
    this.drawFx(ctx);
    this.drawParticles(ctx);
    for (const p of v.players) if (this.visible(p.x, p.y)) this.drawNameplate(p, v);
    for (const m of v.monsters) if (this.visible(m.x, m.y)) this.drawMonsterBar(m);
    this.drawTexts(ctx);
    ctx.restore();

    this.drawIndicators(v);
    this.drawVignette(v);
  }

  visible(x, y, pad = 0) {
    const vw = this.view;
    return x > vw.x0 - pad && x < vw.x1 + pad && y > vw.y0 - pad && y < vw.y1 + pad;
  }

  update(dt) {
    if (this.shakeT > 0) {
      this.shakeT -= dt;
      if (this.shakeT <= 0) this.shakeAmt = 0;
    }
    for (const [id, t] of this.flash) {
      if (t - dt <= 0) this.flash.delete(id);
      else this.flash.set(id, t - dt);
    }
    const ps = this.particles;
    let j = 0;
    for (let i = 0; i < ps.length; i++) {
      const p = ps[i];
      p.life -= dt;
      if (p.life <= 0) continue;
      const f = Math.exp(-p.drag * dt);
      p.vx *= f;
      p.vy = p.vy * f + p.grav * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.rot += dt * 4;
      ps[j++] = p;
    }
    ps.length = j;
    this.fx = this.fx.filter((f) => (f.t += dt) < f.dur);
    this.texts = this.texts.filter((t) => {
      t.t += dt;
      t.y += t.vy * dt;
      t.vy *= Math.exp(-3 * dt);
      return t.t < t.dur;
    });
  }

  // ---------------- 바닥/맵 ----------------
  drawFloor(v) {
    const ctx = this.ctx;
    const R = v.map.R;
    if (!this.floorPattern) this.floorPattern = ctx.createPattern(this.floor, 'repeat');
    ctx.save();
    ctx.beginPath();
    ctx.arc(0, 0, R, 0, TAU);
    ctx.fillStyle = this.floorPattern;
    ctx.fill();
    // 가장자리로 갈수록 어둡게
    const g = ctx.createRadialGradient(0, 0, R * 0.55, 0, 0, R);
    g.addColorStop(0, 'rgba(5,4,10,0)');
    g.addColorStop(1, 'rgba(5,4,10,0.75)');
    ctx.fillStyle = g;
    ctx.fill();
    ctx.lineWidth = 14;
    ctx.strokeStyle = 'rgba(94,242,214,0.08)';
    ctx.stroke();
    ctx.lineWidth = 3;
    ctx.strokeStyle = 'rgba(94,242,214,0.45)';
    ctx.stroke();
    ctx.restore();
  }

  drawZone(v) {
    const z = v.zone;
    if (!z) return;
    const ctx = this.ctx;
    const t = v.time;
    if (z.active) {
      ctx.save();
      ctx.beginPath();
      ctx.rect(this.view.x0 - 500, this.view.y0 - 500, this.view.x1 - this.view.x0 + 1000, this.view.y1 - this.view.y0 + 1000);
      ctx.arc(z.x, z.y, z.r, 0, TAU, true);
      ctx.fillStyle = 'rgba(110,8,28,0.38)';
      ctx.fill('evenodd');
      ctx.beginPath();
      ctx.arc(z.x, z.y, z.r, 0, TAU);
      ctx.lineWidth = 16;
      ctx.strokeStyle = `rgba(255,51,85,${0.12 + 0.06 * Math.sin(t * 4)})`;
      ctx.stroke();
      ctx.lineWidth = 3;
      ctx.strokeStyle = '#ff3355';
      ctx.stroke();
      ctx.restore();
    }
    ctx.save();
    ctx.setLineDash([18, 14]);
    ctx.lineWidth = 2;
    ctx.strokeStyle = z.active ? 'rgba(255,255,255,0.35)' : 'rgba(255,255,255,0.0)';
    ctx.beginPath();
    ctx.arc(z.tx, z.ty, z.tr, 0, TAU);
    ctx.stroke();
    ctx.restore();
  }

  drawObstacleShadows(v) {
    const ctx = this.ctx;
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    for (const o of v.map.obstacles) {
      if (!this.visible(o.x, o.y, o.r)) continue;
      ctx.beginPath();
      ctx.ellipse(o.x + o.r * 0.25, o.y + o.r * 0.35, o.r * 1.05, o.r * 0.8, 0, 0, TAU);
      ctx.fill();
    }
  }

  rockPath(o) {
    let pts = this.rockShapes.get(o);
    if (!pts) {
      const rnd = seeded(Math.abs(Math.round(o.x * 7 + o.y * 13)) + 1);
      const n = 9;
      pts = [];
      for (let i = 0; i < n; i++) {
        const a = (i / n) * TAU;
        const r = o.r * (0.82 + rnd() * 0.25);
        pts.push([Math.cos(a) * r, Math.sin(a) * r]);
      }
      this.rockShapes.set(o, pts);
    }
    return pts;
  }

  drawObstacles(v) {
    const ctx = this.ctx;
    const t = v.time;
    for (const o of v.map.obstacles) {
      if (!this.visible(o.x, o.y, o.r)) continue;
      ctx.save();
      ctx.translate(o.x, o.y);
      if (o.k === 0) {
        const pts = this.rockPath(o);
        ctx.beginPath();
        pts.forEach((p, i) => (i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1])));
        ctx.closePath();
        const g = ctx.createLinearGradient(-o.r, -o.r, o.r, o.r);
        g.addColorStop(0, '#4a4258');
        g.addColorStop(1, '#221d2c');
        ctx.fillStyle = g;
        ctx.fill();
        ctx.lineWidth = 2;
        ctx.strokeStyle = 'rgba(0,0,0,0.5)';
        ctx.stroke();
        ctx.fillStyle = 'rgba(255,255,255,0.06)';
        ctx.beginPath();
        ctx.ellipse(-o.r * 0.25, -o.r * 0.3, o.r * 0.45, o.r * 0.25, -0.5, 0, TAU);
        ctx.fill();
      } else {
        // 기둥
        ctx.beginPath();
        ctx.arc(0, 0, o.r, 0, TAU);
        const g = ctx.createRadialGradient(-o.r * 0.35, -o.r * 0.35, o.r * 0.1, 0, 0, o.r);
        g.addColorStop(0, '#6b6280');
        g.addColorStop(0.7, '#3a3349');
        g.addColorStop(1, '#1f1a29');
        ctx.fillStyle = g;
        ctx.fill();
        ctx.lineWidth = 3;
        ctx.strokeStyle = 'rgba(0,0,0,0.55)';
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(0, 0, o.r * 0.62, 0, TAU);
        ctx.strokeStyle = 'rgba(255,255,255,0.07)';
        ctx.lineWidth = 2;
        ctx.stroke();
        if (o.k === 2) {
          // 화로: 녹색 영혼불
          const f = 0.8 + 0.2 * Math.sin(t * 9 + o.x);
          ctx.globalCompositeOperation = 'lighter';
          ctx.drawImage(glow('#3dffb0'), -o.r * 3 * f, -o.r * 3 * f, o.r * 6 * f, o.r * 6 * f);
          ctx.drawImage(glow('#c8fff0'), -o.r * 0.8, -o.r * 0.8, o.r * 1.6, o.r * 1.6);
          ctx.globalCompositeOperation = 'source-over';
          if (Math.random() < 0.15) this.burst(o.x + (Math.random() - 0.5) * o.r, o.y, '#3dffb0', 1, 40, 3, 0.8, { grav: -60, drag: 1 });
        }
      }
      ctx.restore();
    }
  }

  drawAltars(v) {
    const ctx = this.ctx;
    const t = v.time;
    for (const al of v.altars) {
      if (!this.visible(al.x, al.y, 200)) continue;
      const orb = ORBS[al.i];
      ctx.save();
      ctx.translate(al.x, al.y);
      // 원형 제단
      ctx.beginPath();
      ctx.arc(0, 0, 120, 0, TAU);
      ctx.fillStyle = 'rgba(30,24,44,0.9)';
      ctx.fill();
      ctx.lineWidth = 4;
      ctx.strokeStyle = hexA(orb.color, 0.5);
      ctx.stroke();
      ctx.rotate(t * 0.2);
      for (let i = 0; i < 12; i++) {
        ctx.rotate(TAU / 12);
        ctx.fillStyle = hexA(orb.color, 0.35);
        ctx.fillRect(98, -3, 14, 6);
      }
      ctx.restore();
      ctx.save();
      ctx.translate(al.x, al.y);
      ctx.beginPath();
      ctx.arc(0, 0, 60, 0, TAU);
      ctx.strokeStyle = hexA(orb.color, 0.3);
      ctx.lineWidth = 2;
      ctx.stroke();
      if (al.state === 'warn') {
        const p = 0.5 + 0.5 * Math.sin(t * 6);
        ctx.globalCompositeOperation = 'lighter';
        ctx.drawImage(glow(orb.color), -140, -140, 280, 280);
        ctx.globalAlpha = 0.3 + 0.3 * p;
        ctx.fillStyle = hexA(orb.color, 0.4);
        ctx.fillRect(-14, -400, 28, 400);
        ctx.globalAlpha = 1;
        ctx.globalCompositeOperation = 'source-over';
      } else if (al.state === 'idle') {
        ctx.fillStyle = 'rgba(255,255,255,0.12)';
        ctx.font = '700 16px "Noto Sans KR", sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(orb.name, 0, 6);
      }
      ctx.restore();
    }
  }

  drawChests(v) {
    const ctx = this.ctx;
    for (const c of v.chests) {
      if (!this.visible(c.x, c.y)) continue;
      ctx.save();
      ctx.translate(c.x, c.y);
      if (!c.open) {
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = 0.5 + 0.2 * Math.sin(v.time * 3 + c.id);
        ctx.drawImage(glow('#ffcf5a'), -45, -45, 90, 90);
        ctx.globalAlpha = 1;
        ctx.globalCompositeOperation = 'source-over';
      }
      ctx.fillStyle = 'rgba(0,0,0,0.35)';
      ctx.fillRect(-18, 6, 38, 10);
      ctx.fillStyle = c.open ? '#3b2d1f' : '#7a4b1e';
      ctx.fillRect(-18, -12, 36, 24);
      ctx.fillStyle = c.open ? '#2a2016' : '#a5662a';
      ctx.fillRect(-18, -16, 36, c.open ? 4 : 10);
      ctx.fillStyle = c.open ? '#5a4a2a' : '#ffcf5a';
      ctx.fillRect(-18, -2, 36, 3);
      ctx.fillRect(-3, -6, 6, 9);
      ctx.restore();
    }
  }

  drawItems(v) {
    const ctx = this.ctx;
    for (const it of v.items) {
      if (!this.visible(it.x, it.y)) continue;
      const rc = RARITIES[it.rarity].color;
      const bob = Math.sin(v.time * 3 + it.id) * 3;
      ctx.save();
      ctx.translate(it.x, it.y + bob);
      ctx.globalCompositeOperation = 'lighter';
      ctx.drawImage(glow(rc), -30 - it.rarity * 4, -30 - it.rarity * 4, 60 + it.rarity * 8, 60 + it.rarity * 8);
      ctx.globalCompositeOperation = 'source-over';
      ctx.rotate(Math.PI / 4);
      ctx.fillStyle = 'rgba(14,10,22,0.9)';
      ctx.strokeStyle = rc;
      ctx.lineWidth = 2;
      ctx.fillRect(-11, -11, 22, 22);
      ctx.strokeRect(-11, -11, 22, 22);
      ctx.rotate(-Math.PI / 4);
      ctx.font = '15px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(it.icon, 0, 1);
      ctx.restore();
    }
  }

  drawSouls(v) {
    const ctx = this.ctx;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (const s of v.souls) {
      if (!this.visible(s.x, s.y)) continue;
      const r = 6 + Math.min(8, s.v / 6);
      ctx.drawImage(glow('#5ef2d6'), s.x - r * 2, s.y - r * 2, r * 4, r * 4);
      ctx.drawImage(glow('#e0fffa'), s.x - r * 0.6, s.y - r * 0.6, r * 1.2, r * 1.2);
    }
    ctx.restore();
  }

  drawGroundOrbs(v) {
    const ctx = this.ctx;
    for (const o of v.groundOrbs) {
      const c = ORBS[o.i].color;
      const p = 1 + 0.12 * Math.sin(v.time * 5);
      ctx.save();
      ctx.translate(o.x, o.y);
      ctx.globalCompositeOperation = 'lighter';
      ctx.drawImage(glow(c), -90 * p, -90 * p, 180 * p, 180 * p);
      ctx.globalAlpha = 0.35;
      ctx.fillStyle = hexA(c, 0.5);
      ctx.fillRect(-10, -500, 20, 500);
      ctx.globalAlpha = 1;
      ctx.drawImage(glow('#ffffff'), -16, -16, 32, 32);
      ctx.globalCompositeOperation = 'source-over';
      ctx.beginPath();
      ctx.arc(0, 0, 14, 0, TAU);
      ctx.fillStyle = c;
      ctx.fill();
      ctx.lineWidth = 3;
      ctx.strokeStyle = '#fff';
      ctx.stroke();
      ctx.restore();
    }
  }

  // ---------------- 장판 / 예고 ----------------
  drawAreas(v, top) {
    const ctx = this.ctx;
    const t = v.time;
    for (const a of v.areas) {
      const big = a.kind === 'line' ? a.len : a.r;
      if (!this.visible(a.x, a.y, big)) continue;
      const enemy = a.enemy;
      const col = enemy ? ENEMY_TELE : a.color || '#ffffff';
      const pre = a.t < a.delay;
      const prog = a.delay > 0 ? Math.min(1, a.t / a.delay) : 1;
      if (top) {
        if (a.kind === 'field' && !pre) this.drawBlizzard(a, t);
        continue;
      }
      ctx.save();
      if (a.kind === 'line') {
        ctx.translate(a.x, a.y);
        ctx.rotate(a.ang);
        if (pre) {
          ctx.fillStyle = hexA(col, 0.12);
          ctx.fillRect(0, -a.width / 2, a.len, a.width);
          ctx.fillStyle = hexA(col, 0.32);
          ctx.fillRect(0, -a.width / 2, a.len * prog, a.width);
          ctx.strokeStyle = hexA(col, 0.9);
          ctx.lineWidth = 2;
          ctx.strokeRect(0, -a.width / 2, a.len, a.width);
        }
      } else if (a.kind === 'burn') {
        const k = 1 - Math.max(0, a.t - a.dur + 0.5) / 0.5;
        ctx.globalAlpha = Math.max(0, Math.min(1, k));
        const g = ctx.createRadialGradient(a.x, a.y, 0, a.x, a.y, a.r);
        g.addColorStop(0, 'rgba(255,140,40,0.35)');
        g.addColorStop(1, 'rgba(255,60,20,0.08)');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(a.x, a.y, a.r, 0, TAU);
        ctx.fill();
        if (Math.random() < 0.6) {
          const ang = Math.random() * TAU;
          const d = Math.sqrt(Math.random()) * a.r;
          this.burst(a.x + Math.cos(ang) * d, a.y + Math.sin(ang) * d, Math.random() < 0.5 ? '#ff7a2e' : '#ffd45a', 1, 30, 5, 0.6, { grav: -90, drag: 1 });
        }
      } else if (a.kind === 'field') {
        if (pre) {
          ctx.beginPath();
          ctx.arc(a.x, a.y, a.r, 0, TAU);
          ctx.strokeStyle = hexA(col, 0.7);
          ctx.lineWidth = 2;
          ctx.stroke();
        }
      } else {
        // 원형 예고: ground / ring / leap / slam
        if (pre) {
          ctx.beginPath();
          ctx.arc(a.x, a.y, a.r, 0, TAU);
          ctx.fillStyle = hexA(col, enemy ? 0.14 : 0.1);
          ctx.fill();
          ctx.lineWidth = enemy ? 3 : 2;
          ctx.strokeStyle = hexA(col, enemy ? 0.95 : 0.8);
          ctx.stroke();
          ctx.beginPath();
          ctx.arc(a.x, a.y, a.r * prog, 0, TAU);
          ctx.fillStyle = hexA(col, enemy ? 0.28 : 0.2);
          ctx.fill();
        } else if (a.kind === 'ground' && a.ticks > 1) {
          // 화살비
          ctx.beginPath();
          ctx.arc(a.x, a.y, a.r, 0, TAU);
          ctx.fillStyle = hexA(col, 0.08);
          ctx.fill();
          for (let i = 0; i < 3; i++) {
            const ang = Math.random() * TAU;
            const d = Math.sqrt(Math.random()) * a.r;
            const x = a.x + Math.cos(ang) * d;
            const y = a.y + Math.sin(ang) * d;
            this.fx.push({ k: 'drop', x, y, color: col, t: 0, dur: 0.18 });
          }
        }
      }
      ctx.restore();
    }
  }

  drawBlizzard(a, t) {
    const ctx = this.ctx;
    ctx.save();
    ctx.translate(a.x, a.y);
    const g = ctx.createRadialGradient(0, 0, 0, 0, 0, a.r);
    g.addColorStop(0, 'rgba(200,240,255,0.22)');
    g.addColorStop(1, 'rgba(120,200,255,0.08)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(0, 0, a.r, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = 'rgba(220,250,255,0.35)';
    ctx.lineWidth = 3;
    for (let i = 0; i < 4; i++) {
      ctx.beginPath();
      ctx.arc(0, 0, a.r * (0.35 + i * 0.18), t * (1.5 + i * 0.4) + i, t * (1.5 + i * 0.4) + i + 1.6);
      ctx.stroke();
    }
    ctx.restore();
    if (Math.random() < 0.8) {
      const ang = Math.random() * TAU;
      const d = Math.sqrt(Math.random()) * a.r;
      this.burst(a.x + Math.cos(ang) * d, a.y + Math.sin(ang) * d, '#e6fbff', 1, 80, 3, 0.7, { drag: 0.5 });
    }
  }

  // ---------------- 캐릭터 ----------------
  drawPlayer(p, v) {
    const ctx = this.ctx;
    const t = v.time;
    const skin = COSMETIC_MAP[p.cos.skin] || COSMETIC_MAP.skin_shade;
    const r = 18;
    const f = p.flags;
    ctx.save();
    ctx.translate(p.x, p.y);
    if (f & PF.INVIS) ctx.globalAlpha = p.me ? 0.4 : 0.25;
    // 그림자
    ctx.fillStyle = 'rgba(0,0,0,0.4)';
    ctx.beginPath();
    ctx.ellipse(3, r * 0.75, r * 1.05, r * 0.45, 0, 0, TAU);
    ctx.fill();
    // 승천 의식
    if (f & PF.RITUAL) {
      ctx.globalCompositeOperation = 'lighter';
      ctx.drawImage(glow('#ffe9a8'), -110, -110, 220, 220);
      ctx.fillStyle = 'rgba(255,233,168,0.25)';
      ctx.fillRect(-22, -900, 44, 900);
      ctx.globalCompositeOperation = 'source-over';
    }
    // 아우라
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha *= 0.55;
    ctx.drawImage(glow(skin.body), -r * 2.6, -r * 2.6, r * 5.2, r * 5.2);
    ctx.globalAlpha = f & PF.INVIS ? (p.me ? 0.4 : 0.25) : 1;
    ctx.globalCompositeOperation = 'source-over';
    // 들고 있는 오브
    for (let i = 0; i < p.orbs; i++) {
      const a = t * 2.5 + (i / Math.max(1, p.orbs)) * TAU;
      const ox = Math.cos(a) * 34;
      const oy = Math.sin(a) * 34;
      const oc = ORBS[(p.orbIds && p.orbIds[i]) ?? i].color;
      ctx.globalCompositeOperation = 'lighter';
      ctx.drawImage(glow(oc), ox - 18, oy - 18, 36, 36);
      ctx.globalCompositeOperation = 'source-over';
      ctx.beginPath();
      ctx.arc(ox, oy, 6, 0, TAU);
      ctx.fillStyle = oc;
      ctx.fill();
    }
    this.drawWeapon(p, r, t, false);
    // 몸
    const aim = p.aim;
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, TAU);
    const g = ctx.createRadialGradient(Math.cos(aim) * 5 - 3, Math.sin(aim) * 5 - 5, 2, 0, 0, r);
    g.addColorStop(0, skin.core);
    g.addColorStop(0.45, skin.body);
    g.addColorStop(1, mix(skin.body, '#000000', 0.45));
    ctx.fillStyle = g;
    ctx.fill();
    ctx.lineWidth = 2.5;
    ctx.strokeStyle = skin.rim;
    ctx.stroke();
    this.drawSkinAcc(skin, r, t);
    // 눈
    for (const s of [-0.42, 0.42]) {
      const ex = Math.cos(aim + s) * r * 0.55;
      const ey = Math.sin(aim + s) * r * 0.55;
      ctx.beginPath();
      ctx.ellipse(ex, ey, 2.6, 3.6, aim, 0, TAU);
      ctx.fillStyle = skin.eye;
      ctx.fill();
    }
    // 피격 섬광
    const fl = this.flash.get(p.id);
    if (fl) {
      ctx.globalAlpha = Math.min(1, fl / 0.09);
      ctx.beginPath();
      ctx.arc(0, 0, r + 1, 0, TAU);
      ctx.fillStyle = '#ffffff';
      ctx.fill();
      ctx.globalAlpha = 1;
    }
    this.drawWeapon(p, r, t, true);
    this.drawStatus(p, r, t);
    ctx.restore();
  }

  drawSkinAcc(skin, r, t) {
    const ctx = this.ctx;
    switch (skin.acc) {
      case 'flame':
        for (let i = 0; i < 3; i++) {
          const fx = (i - 1) * 7;
          const fh = 9 + Math.sin(t * 14 + i * 2) * 3;
          ctx.beginPath();
          ctx.moveTo(fx - 4, -r + 4);
          ctx.quadraticCurveTo(fx, -r - fh, fx + 4, -r + 4);
          ctx.fillStyle = i === 1 ? '#ffe08a' : '#ff8a3d';
          ctx.fill();
        }
        break;
      case 'leaf':
        ctx.fillStyle = '#9dffbf';
        ctx.beginPath();
        ctx.ellipse(-6, -r + 1, 7, 3.5, -0.6, 0, TAU);
        ctx.ellipse(6, -r + 1, 7, 3.5, 0.6, 0, TAU);
        ctx.fill();
        break;
      case 'void':
        ctx.save();
        ctx.rotate(t * 2);
        ctx.strokeStyle = 'rgba(255,77,240,0.7)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(0, 0, r * 0.55, 0, 4);
        ctx.stroke();
        ctx.restore();
        break;
      case 'crown':
        ctx.fillStyle = '#e6fbff';
        ctx.beginPath();
        ctx.moveTo(-10, -r + 3);
        for (let i = 0; i < 5; i++) {
          ctx.lineTo(-10 + i * 5 + 2.5, -r - (i % 2 ? 4 : 10));
          ctx.lineTo(-10 + (i + 1) * 5, -r + 3);
        }
        ctx.closePath();
        ctx.fill();
        break;
      case 'moon':
        ctx.strokeStyle = 'rgba(255,128,149,0.9)';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.ellipse(0, -r - 6, 13, 4, 0, 0, TAU);
        ctx.stroke();
        break;
      case 'laurel':
        ctx.strokeStyle = '#fff3c2';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(0, 0, r - 4, Math.PI * 1.1, Math.PI * 1.45);
        ctx.moveTo(Math.cos(Math.PI * 1.55) * (r - 4), Math.sin(Math.PI * 1.55) * (r - 4));
        ctx.arc(0, 0, r - 4, Math.PI * 1.55, Math.PI * 1.9);
        ctx.stroke();
        break;
      case 'stars':
        for (let i = 0; i < 6; i++) {
          const a = i * 1.7 + t * 0.6;
          const d = (i * 5) % 12;
          const s = 1 + Math.abs(Math.sin(t * 3 + i)) * 1.5;
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(Math.cos(a) * d - s / 2, Math.sin(a) * d - s / 2, s, s);
        }
        break;
      default:
        break;
    }
  }

  // 무기: front=false면 몸 뒤, true면 몸 앞
  drawWeapon(p, r, t, front) {
    const ctx = this.ctx;
    const w = p.w;
    const wc = WCOLOR[w] || '#ffffff';
    const rc = RARITIES[p.wr || 0].color;
    let ang = p.aim;
    const prog = (p.actT || 0) / 100;
    const act = p.act;
    // 근접 기본 공격 휘두르기
    if (act >= 1 && act <= 3 && (w === 'greatsword' || w === 'daggers')) {
      const flip = (act - 1) % 2 ? -1 : 1;
      const e = Math.min(1, prog * 2.2);
      ang = p.aim + flip * (-1.1 + 2.2 * (1 - (1 - e) * (1 - e)));
    }
    if (act === 4 && w === 'greatsword') ang = p.aim + prog * TAU * 3;
    const behind = Math.sin(ang - p.aim) > 0.2 && !(act >= 1 && act <= 6);
    if (front === behind) return;
    ctx.save();
    ctx.rotate(ang);
    ctx.lineCap = 'round';
    switch (w) {
      case 'greatsword': {
        ctx.translate(r - 2, 6);
        ctx.fillStyle = '#3a2a1a';
        ctx.fillRect(-6, -3, 12, 6);
        ctx.fillStyle = '#c9b48a';
        ctx.fillRect(4, -9, 4, 18);
        const g = ctx.createLinearGradient(8, 0, 56, 0);
        g.addColorStop(0, '#e9eef5');
        g.addColorStop(1, mix(wc, '#ffffff', 0.4));
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.moveTo(8, -5);
        ctx.lineTo(50, -4);
        ctx.lineTo(58, 0);
        ctx.lineTo(50, 4);
        ctx.lineTo(8, 5);
        ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = rc;
        ctx.lineWidth = 1.5;
        ctx.stroke();
        break;
      }
      case 'daggers': {
        for (const s of [-1, 1]) {
          ctx.save();
          ctx.translate(r - 4, s * 10);
          ctx.fillStyle = '#2b2236';
          ctx.fillRect(-4, -2, 8, 4);
          ctx.fillStyle = '#e8e2ff';
          ctx.beginPath();
          ctx.moveTo(4, -3);
          ctx.lineTo(22, 0);
          ctx.lineTo(4, 3);
          ctx.closePath();
          ctx.fill();
          ctx.strokeStyle = rc;
          ctx.lineWidth = 1;
          ctx.stroke();
          ctx.restore();
        }
        break;
      }
      case 'longbow': {
        const pull = act === 1 || act === 4 ? Math.min(1, prog * 1.6) : 0;
        ctx.translate(r + 2, 0);
        ctx.strokeStyle = '#8a5a2b';
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.arc(-14, 0, 26, -1.05, 1.05);
        ctx.stroke();
        ctx.strokeStyle = rc;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(-14 + Math.cos(-1.05) * 26, Math.sin(-1.05) * 26);
        ctx.lineTo(-14 - pull * 12, 0);
        ctx.lineTo(-14 + Math.cos(1.05) * 26, Math.sin(1.05) * 26);
        ctx.stroke();
        if (pull > 0) {
          ctx.strokeStyle = '#f2e6c8';
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.moveTo(-14 - pull * 12, 0);
          ctx.lineTo(18, 0);
          ctx.stroke();
          if (act === 4) {
            ctx.globalCompositeOperation = 'lighter';
            ctx.drawImage(glow(wc), 2, -16, 32, 32);
            ctx.globalCompositeOperation = 'source-over';
          }
        }
        break;
      }
      case 'firestaff':
      case 'froststaff': {
        ctx.translate(r - 2, 8);
        ctx.strokeStyle = w === 'firestaff' ? '#5a2e1a' : '#2a4a6a';
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.moveTo(-8, 0);
        ctx.lineTo(34, 0);
        ctx.stroke();
        const pulse = 1 + 0.2 * Math.sin(t * 8) + (act ? 0.4 : 0);
        ctx.globalCompositeOperation = 'lighter';
        ctx.drawImage(glow(wc), 36 - 14 * pulse, -14 * pulse, 28 * pulse, 28 * pulse);
        ctx.globalCompositeOperation = 'source-over';
        ctx.beginPath();
        ctx.arc(36, 0, 5, 0, TAU);
        ctx.fillStyle = w === 'firestaff' ? '#ffd45a' : '#e6fbff';
        ctx.fill();
        ctx.strokeStyle = rc;
        ctx.lineWidth = 1.5;
        ctx.stroke();
        break;
      }
      case 'spear': {
        const thrust = act >= 1 && act <= 3 ? Math.sin(Math.min(1, prog * 1.6) * Math.PI) * 26 : 0;
        ctx.translate(r - 14 + thrust, 7);
        ctx.strokeStyle = '#7a5a32';
        ctx.lineWidth = 3.5;
        ctx.beginPath();
        ctx.moveTo(-14, 0);
        ctx.lineTo(54, 0);
        ctx.stroke();
        ctx.fillStyle = '#f2e6b8';
        ctx.beginPath();
        ctx.moveTo(52, -6);
        ctx.lineTo(70, 0);
        ctx.lineTo(52, 6);
        ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = rc;
        ctx.lineWidth = 1.5;
        ctx.stroke();
        break;
      }
      default:
        break;
    }
    ctx.restore();
  }

  drawStatus(p, r, t) {
    const ctx = this.ctx;
    const f = p.flags;
    if (f & PF.PROTECT) {
      ctx.beginPath();
      ctx.arc(0, 0, r + 9, 0, TAU);
      ctx.strokeStyle = `rgba(255,224,130,${0.5 + 0.3 * Math.sin(t * 10)})`;
      ctx.lineWidth = 3;
      ctx.stroke();
    }
    if (f & PF.SHIELD) {
      ctx.beginPath();
      ctx.arc(0, 0, r + 7, 0, TAU);
      ctx.fillStyle = 'rgba(140,220,255,0.18)';
      ctx.fill();
      ctx.strokeStyle = 'rgba(180,240,255,0.9)';
      ctx.lineWidth = 2;
      ctx.stroke();
    }
    if (f & PF.BULWARK) {
      ctx.save();
      ctx.rotate(t);
      ctx.strokeStyle = 'rgba(255,214,120,0.9)';
      ctx.lineWidth = 3;
      ctx.beginPath();
      for (let i = 0; i <= 6; i++) {
        const a = (i / 6) * TAU;
        const x = Math.cos(a) * (r + 11);
        const y = Math.sin(a) * (r + 11);
        if (i) ctx.lineTo(x, y);
        else ctx.moveTo(x, y);
      }
      ctx.stroke();
      ctx.restore();
    }
    if (f & PF.STUN) {
      for (let i = 0; i < 3; i++) {
        const a = t * 6 + (i / 3) * TAU;
        ctx.fillStyle = '#ffe14d';
        ctx.font = '12px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('★', Math.cos(a) * 14, -r - 8 + Math.sin(a) * 4);
      }
    }
    if (f & PF.ROOT) {
      ctx.strokeStyle = 'rgba(160,230,255,0.9)';
      ctx.lineWidth = 3;
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * TAU;
        ctx.beginPath();
        ctx.moveTo(Math.cos(a) * (r - 2), Math.sin(a) * (r - 2));
        ctx.lineTo(Math.cos(a) * (r + 9), Math.sin(a) * (r + 9));
        ctx.stroke();
      }
    }
    if (f & PF.SLOW) {
      ctx.fillStyle = 'rgba(160,220,255,0.18)';
      ctx.beginPath();
      ctx.arc(0, 0, r, 0, TAU);
      ctx.fill();
    }
    if (f & PF.CHANNEL) {
      ctx.beginPath();
      ctx.arc(0, 0, r + 14, -Math.PI / 2, -Math.PI / 2 + TAU * ((p.actT || 0) / 100));
      ctx.strokeStyle = '#ffcf5a';
      ctx.lineWidth = 4;
      ctx.stroke();
    }
  }

  drawNameplate(p, v) {
    const ctx = this.ctx;
    if (p.flags & PF.INVIS && !p.me) return;
    const y = p.y - 40;
    const wbar = 52;
    ctx.save();
    ctx.translate(p.x, y);
    ctx.textAlign = 'center';
    ctx.font = '700 12px "Noto Sans KR", sans-serif';
    ctx.lineWidth = 3;
    ctx.strokeStyle = 'rgba(0,0,0,0.75)';
    const name = p.name || '';
    ctx.strokeText(name, 0, -10);
    ctx.fillStyle = p.me ? '#ffe9a8' : '#ffffff';
    ctx.fillText(name, 0, -10);
    const title = p.cos && COSMETIC_MAP[p.cos.title] ? COSMETIC_MAP[p.cos.title].text : '';
    if (title) {
      ctx.font = '600 10px "Noto Sans KR", sans-serif';
      ctx.strokeText(title, 0, -23);
      ctx.fillStyle = '#c9a8ff';
      ctx.fillText(title, 0, -23);
    }
    // 레벨 배지
    ctx.fillStyle = 'rgba(10,8,18,0.9)';
    ctx.fillRect(-wbar / 2 - 20, -4, 18, 11);
    ctx.fillStyle = '#ffe9a8';
    ctx.font = '700 9px sans-serif';
    ctx.fillText(String(p.level), -wbar / 2 - 11, 5);
    // 체력바
    ctx.fillStyle = 'rgba(10,8,18,0.85)';
    ctx.fillRect(-wbar / 2 - 1, -4, wbar + 2, 9);
    const k = Math.max(0, p.hp / p.maxHp);
    ctx.fillStyle = p.me ? '#4cff8f' : '#ff4d5e';
    ctx.fillRect(-wbar / 2, -3, wbar * k, 7);
    if (p.shield > 0) {
      ctx.fillStyle = 'rgba(220,245,255,0.9)';
      ctx.fillRect(-wbar / 2 + wbar * k, -3, Math.min(wbar * (1 - k), (wbar * p.shield) / p.maxHp), 7);
    }
    // 100 단위 눈금
    ctx.fillStyle = 'rgba(0,0,0,0.45)';
    for (let i = 250; i < p.maxHp; i += 250) ctx.fillRect(-wbar / 2 + (wbar * i) / p.maxHp, -3, 1, 7);
    ctx.restore();
  }

  drawMonster(m, t) {
    const ctx = this.ctx;
    ctx.save();
    ctx.translate(m.x, m.y);
    const r = m.r;
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.beginPath();
    ctx.ellipse(2, r * 0.7, r, r * 0.4, 0, 0, TAU);
    ctx.fill();
    const wind = m.wind / 100;
    if (wind > 0) {
      ctx.globalCompositeOperation = 'lighter';
      ctx.drawImage(glow('#ff3d4f'), -r * 2.5, -r * 2.5, r * 5, r * 5);
      ctx.globalCompositeOperation = 'source-over';
    }
    const fl = this.flash.get(m.id);
    switch (m.type) {
      case 0: {
        // 망령
        ctx.globalAlpha = 0.85;
        ctx.beginPath();
        ctx.arc(0, -2, r, Math.PI, 0);
        for (let i = 0; i <= 4; i++) ctx.lineTo(r - (i * r) / 2, r * 0.8 + (i % 2 ? -4 : 2) + Math.sin(t * 8 + i) * 2);
        ctx.closePath();
        ctx.fillStyle = '#6fd6c0';
        ctx.fill();
        ctx.globalAlpha = 1;
        this.eyes(m.aim, r, '#ff3355');
        break;
      }
      case 1: {
        // 해골 궁수
        ctx.beginPath();
        ctx.arc(0, 0, r, 0, TAU);
        ctx.fillStyle = '#e8e0cc';
        ctx.fill();
        ctx.fillStyle = '#1a1420';
        this.eyes(m.aim, r, '#1a1420', 3.5);
        ctx.strokeStyle = '#8a5a2b';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(Math.cos(m.aim) * (r + 2), Math.sin(m.aim) * (r + 2), 12, m.aim - 1.2, m.aim + 1.2);
        ctx.stroke();
        break;
      }
      case 2:
      case 3: {
        // 지옥 거한 / 망령 기사
        const elite = m.type === 3;
        ctx.rotate(m.aim);
        ctx.beginPath();
        for (let i = 0; i < 6; i++) {
          const a = (i / 6) * TAU;
          ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
        }
        ctx.closePath();
        ctx.fillStyle = elite ? '#3d2b5c' : '#6b1e24';
        ctx.fill();
        ctx.lineWidth = 3;
        ctx.strokeStyle = elite ? '#b18cff' : '#ff6b5a';
        ctx.stroke();
        ctx.fillStyle = elite ? '#e0c8ff' : '#ffb84d';
        ctx.beginPath();
        ctx.moveTo(r * 0.2, -r * 0.9);
        ctx.lineTo(r * 0.9, -r * 1.3);
        ctx.lineTo(r * 0.6, -r * 0.6);
        ctx.moveTo(r * 0.2, r * 0.9);
        ctx.lineTo(r * 0.9, r * 1.3);
        ctx.lineTo(r * 0.6, r * 0.6);
        ctx.fill();
        ctx.rotate(-m.aim);
        this.eyes(m.aim, r * 0.8, elite ? '#ff4df0' : '#ffe14d', 3);
        if (elite) {
          ctx.globalCompositeOperation = 'lighter';
          ctx.drawImage(glow('#b18cff'), -r * 2, -r * 2, r * 4, r * 4);
          ctx.globalCompositeOperation = 'source-over';
        }
        break;
      }
      case 4: {
        // 오브 수호자
        ctx.globalCompositeOperation = 'lighter';
        ctx.drawImage(glow('#ffe9a8'), -r * 3, -r * 3, r * 6, r * 6);
        ctx.globalCompositeOperation = 'source-over';
        ctx.save();
        ctx.rotate(t * 0.8);
        ctx.strokeStyle = 'rgba(255,233,168,0.8)';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(0, 0, r + 12, 0, 1.2);
        ctx.moveTo(Math.cos(2.1) * (r + 12), Math.sin(2.1) * (r + 12));
        ctx.arc(0, 0, r + 12, 2.1, 3.3);
        ctx.moveTo(Math.cos(4.2) * (r + 12), Math.sin(4.2) * (r + 12));
        ctx.arc(0, 0, r + 12, 4.2, 5.4);
        ctx.stroke();
        ctx.restore();
        ctx.beginPath();
        ctx.arc(0, 0, r, 0, TAU);
        const g = ctx.createRadialGradient(-8, -10, 4, 0, 0, r);
        g.addColorStop(0, '#8a7a5a');
        g.addColorStop(1, '#2e2618');
        ctx.fillStyle = g;
        ctx.fill();
        ctx.lineWidth = 4;
        ctx.strokeStyle = '#ffe9a8';
        ctx.stroke();
        this.eyes(m.aim, r * 0.7, '#ffffff', 4);
        break;
      }
      default:
        break;
    }
    if (fl) {
      ctx.globalAlpha = Math.min(1, fl / 0.09) * 0.85;
      ctx.beginPath();
      ctx.arc(0, 0, r + 1, 0, TAU);
      ctx.fillStyle = '#fff';
      ctx.fill();
      ctx.globalAlpha = 1;
    }
    if (m.cc) {
      ctx.fillStyle = '#ffe14d';
      ctx.font = '12px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('★', Math.cos(t * 6) * 12, -r - 8);
    }
    ctx.restore();
  }

  eyes(aim, r, color, size = 2.5) {
    const ctx = this.ctx;
    ctx.fillStyle = color;
    for (const s of [-0.45, 0.45]) {
      ctx.beginPath();
      ctx.arc(Math.cos(aim + s) * r * 0.55, Math.sin(aim + s) * r * 0.55, size, 0, TAU);
      ctx.fill();
    }
  }

  drawMonsterBar(m) {
    if (m.hp >= m.maxHp && m.type !== 4) return;
    const ctx = this.ctx;
    const w = m.type === 4 ? 110 : m.type >= 2 ? 50 : 32;
    const y = m.y - m.r - 14;
    ctx.fillStyle = 'rgba(10,8,18,0.85)';
    ctx.fillRect(m.x - w / 2 - 1, y - 1, w + 2, 6);
    ctx.fillStyle = m.type === 4 ? '#ffd45a' : m.type === 3 ? '#c56bff' : '#ff8a5a';
    ctx.fillRect(m.x - w / 2, y, w * Math.max(0, m.hp / m.maxHp), 4);
  }

  drawProjectiles(v) {
    const ctx = this.ctx;
    ctx.save();
    for (const q of v.projs) {
      if (!this.visible(q.x, q.y)) continue;
      const a = Math.atan2(q.vy, q.vx);
      const col = q.enemy ? '#ff6b6b' : q.color || '#ffffff';
      ctx.save();
      ctx.translate(q.x, q.y);
      ctx.rotate(a);
      ctx.globalCompositeOperation = 'lighter';
      switch (q.kind) {
        case 'arrow':
        case 'pierce': {
          const big = q.kind === 'pierce';
          ctx.drawImage(glow(col), -24, -12, 48, 24);
          ctx.strokeStyle = big ? '#ffffff' : '#f2e6c8';
          ctx.lineWidth = big ? 4 : 2;
          ctx.beginPath();
          ctx.moveTo(-26, 0);
          ctx.lineTo(10, 0);
          ctx.stroke();
          ctx.fillStyle = col;
          ctx.beginPath();
          ctx.moveTo(16, 0);
          ctx.lineTo(6, -5);
          ctx.lineTo(6, 5);
          ctx.fill();
          if (big) ctx.drawImage(glow(col), -70, -10, 70, 20);
          break;
        }
        case 'fireball':
          ctx.drawImage(glow('#ff5a1f'), -22, -22, 44, 44);
          ctx.drawImage(glow('#ffd45a'), -9, -9, 18, 18);
          if (Math.random() < 0.7) this.burst(q.x, q.y, '#ff7a2e', 1, 40, 5, 0.35, { drag: 2 });
          break;
        case 'icebolt':
        case 'lance': {
          const L = q.kind === 'lance' ? 34 : 16;
          ctx.drawImage(glow('#8fe3ff'), -L - 10, -14, L * 2 + 20, 28);
          ctx.fillStyle = '#e6fbff';
          ctx.beginPath();
          ctx.moveTo(L, 0);
          ctx.lineTo(-L * 0.6, -5);
          ctx.lineTo(-L, 0);
          ctx.lineTo(-L * 0.6, 5);
          ctx.fill();
          break;
        }
        case 'dagger':
          ctx.rotate(v.time * 25);
          ctx.drawImage(glow('#7dff4d'), -14, -14, 28, 28);
          ctx.fillStyle = '#e8ffe0';
          ctx.fillRect(-9, -2, 18, 4);
          break;
        case 'javelin':
          ctx.drawImage(glow('#ffe066'), -40, -12, 80, 24);
          ctx.strokeStyle = '#fff3c2';
          ctx.lineWidth = 4;
          ctx.beginPath();
          ctx.moveTo(-34, 0);
          ctx.lineTo(22, 0);
          ctx.stroke();
          break;
        case 'bone':
          ctx.rotate(v.time * 12);
          ctx.drawImage(glow('#ff6b6b'), -14, -14, 28, 28);
          ctx.fillStyle = '#efe6d2';
          ctx.fillRect(-8, -2, 16, 4);
          break;
        case 'orbshot':
          ctx.drawImage(glow('#ff3d4f'), -18, -18, 36, 36);
          ctx.drawImage(glow('#ffffff'), -6, -6, 12, 12);
          break;
        default:
          ctx.drawImage(glow(col), -10, -10, 20, 20);
      }
      ctx.restore();
    }
    ctx.restore();
  }

  drawFx(ctx) {
    for (const f of this.fx) {
      const k = f.t / f.dur;
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      switch (f.k) {
        case 'ring': {
          const r = f.r0 + (f.r1 - f.r0) * (1 - (1 - k) * (1 - k));
          ctx.globalAlpha = 1 - k;
          ctx.strokeStyle = f.color;
          ctx.lineWidth = f.width * (1 - k * 0.6);
          ctx.beginPath();
          ctx.arc(f.x, f.y, r, 0, TAU);
          ctx.stroke();
          break;
        }
        case 'slash': {
          ctx.translate(f.x, f.y);
          ctx.rotate(f.aim);
          if (f.flip) ctx.scale(1, -1);
          const a0 = -f.arc / 2;
          const a1 = a0 + f.arc * Math.min(1, k * 2.2);
          ctx.globalAlpha = 1 - k;
          const g = ctx.createRadialGradient(0, 0, f.range * 0.35, 0, 0, f.range);
          g.addColorStop(0, hexA(f.color2, 0));
          g.addColorStop(0.75, hexA(f.color, 0.75));
          g.addColorStop(1, hexA(f.color2, 0.95));
          ctx.fillStyle = g;
          ctx.beginPath();
          ctx.arc(0, 0, f.range, a0, a1);
          ctx.arc(0, 0, f.range * 0.55, a1, a0, true);
          ctx.closePath();
          ctx.fill();
          break;
        }
        case 'cone': {
          ctx.translate(f.x, f.y);
          ctx.rotate(f.aim);
          ctx.globalAlpha = 1 - k;
          const g = ctx.createRadialGradient(0, 0, 10, 0, 0, f.range);
          g.addColorStop(0, hexA('#ffffff', 0.8));
          g.addColorStop(0.4, hexA(f.color, 0.7));
          g.addColorStop(1, hexA(f.color, 0));
          ctx.fillStyle = g;
          ctx.beginPath();
          ctx.moveTo(0, 0);
          ctx.arc(0, 0, f.range * (0.6 + k * 0.4), -f.arc / 2, f.arc / 2);
          ctx.closePath();
          ctx.fill();
          break;
        }
        case 'beam': {
          ctx.globalAlpha = 1 - k;
          ctx.strokeStyle = f.color;
          ctx.lineWidth = f.width * (1 - k * 0.5);
          ctx.lineCap = 'round';
          ctx.beginPath();
          ctx.moveTo(f.x1, f.y1);
          ctx.lineTo(f.x2, f.y2);
          ctx.stroke();
          ctx.strokeStyle = '#ffffff';
          ctx.lineWidth = f.width * 0.3;
          ctx.stroke();
          break;
        }
        case 'pillar': {
          ctx.globalAlpha = (1 - k) * 0.8;
          const g = ctx.createLinearGradient(f.x, f.y - 300, f.x, f.y);
          g.addColorStop(0, hexA(f.color, 0));
          g.addColorStop(1, hexA(f.color, 0.8));
          ctx.fillStyle = g;
          ctx.fillRect(f.x - f.w / 2, f.y - 300, f.w, 300);
          ctx.drawImage(glow(f.color), f.x - f.w * 1.5, f.y - f.w * 1.5, f.w * 3, f.w * 3);
          break;
        }
        case 'drop': {
          ctx.globalAlpha = 1 - k;
          ctx.strokeStyle = f.color;
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.moveTo(f.x - 10 + k * 10, f.y - 40 + k * 40);
          ctx.lineTo(f.x + k * 10, f.y - 10 + k * 40);
          ctx.stroke();
          break;
        }
        default:
          break;
      }
      ctx.restore();
    }
  }

  drawParticles(ctx) {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (const p of this.particles) {
      const k = Math.max(0, p.life / p.max);
      const s = p.size * (0.4 + 0.6 * k);
      ctx.globalAlpha = Math.min(1, k * 1.3);
      if (p.shape === 'petal') {
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.ellipse(0, 0, s, s * 0.5, 0, 0, TAU);
        ctx.fill();
        ctx.restore();
      } else if (p.shape === 'star') {
        ctx.fillStyle = p.color;
        ctx.fillRect(p.x - s / 2, p.y - s * 1.5, s, s * 3);
        ctx.fillRect(p.x - s * 1.5, p.y - s / 2, s * 3, s);
      } else if (p.glow) {
        ctx.drawImage(glow(p.color), p.x - s * 2, p.y - s * 2, s * 4, s * 4);
      } else {
        ctx.fillStyle = p.color;
        ctx.fillRect(p.x - s / 2, p.y - s / 2, s, s);
      }
    }
    ctx.restore();
  }

  drawTexts(ctx) {
    ctx.save();
    ctx.textAlign = 'center';
    for (const t of this.texts) {
      const k = t.t / t.dur;
      const pop = k < 0.15 ? 0.6 + (k / 0.15) * 0.6 : 1.2 - Math.min(0.2, (k - 0.15) * 0.6);
      ctx.globalAlpha = k > 0.7 ? 1 - (k - 0.7) / 0.3 : 1;
      ctx.font = `${t.bold ? 800 : 600} ${Math.round(t.size * pop)}px "Noto Sans KR", sans-serif`;
      if (t.stroke) {
        ctx.lineWidth = 4;
        ctx.strokeStyle = 'rgba(0,0,0,0.8)';
        ctx.strokeText(t.str, t.x, t.y);
      }
      ctx.fillStyle = t.color;
      ctx.fillText(t.str, t.x, t.y);
    }
    ctx.restore();
  }

  // 화면 밖 목표 표시 (오브, 보유자, 제단)
  drawIndicators(v) {
    const ctx = this.ctx;
    const { w, h, zoom } = this;
    const marks = [];
    for (const o of v.groundOrbs) marks.push({ x: o.x, y: o.y, color: ORBS[o.i].color, label: '오브' });
    for (const c of v.carriers) if (c.id !== v.meId) marks.push({ x: c.x, y: c.y, color: c.ritual ? '#ffe9a8' : '#ff4d5e', label: c.ritual ? `승천 ${c.ritual.toFixed(0)}` : `오브×${c.n}` });
    for (const al of v.altars) if (al.state === 'warn' || al.state === 'guarded') marks.push({ x: al.x, y: al.y, color: ORBS[al.i].color, label: al.state === 'warn' ? '곧 등장' : '수호자' });
    ctx.save();
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    for (const m of marks) {
      const sx = (m.x - v.cam.x) * zoom + w / 2;
      const sy = (m.y - v.cam.y) * zoom + h / 2;
      if (sx > 30 && sx < w - 30 && sy > 30 && sy < h - 30) continue;
      const a = Math.atan2(sy - h / 2, sx - w / 2);
      const pad = 46;
      const ex = Math.max(pad, Math.min(w - pad, w / 2 + Math.cos(a) * w));
      const ey = Math.max(pad + 40, Math.min(h - pad - 90, h / 2 + Math.sin(a) * h));
      ctx.save();
      ctx.translate(ex, ey);
      ctx.rotate(a);
      ctx.fillStyle = m.color;
      ctx.beginPath();
      ctx.moveTo(18, 0);
      ctx.lineTo(0, -10);
      ctx.lineTo(0, 10);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
      ctx.font = '700 11px "Noto Sans KR", sans-serif';
      ctx.textAlign = 'center';
      ctx.lineWidth = 3;
      ctx.strokeStyle = 'rgba(0,0,0,0.8)';
      const dist = Math.round(Math.hypot(m.x - v.cam.x, m.y - v.cam.y) / 10);
      const label = `${m.label} ${dist}m`;
      ctx.strokeText(label, ex - Math.cos(a) * 22, ey - Math.sin(a) * 22 + 4);
      ctx.fillStyle = m.color;
      ctx.fillText(label, ex - Math.cos(a) * 22, ey - Math.sin(a) * 22 + 4);
    }
    ctx.restore();
  }

  drawVignette(v) {
    const ctx = this.ctx;
    const { w, h } = this;
    ctx.save();
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    const g = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.35, w / 2, h / 2, Math.max(w, h) * 0.75);
    g.addColorStop(0, 'rgba(0,0,0,0)');
    g.addColorStop(1, 'rgba(0,0,0,0.55)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
    const me = v.players.find((p) => p.me);
    if (me && me.hp / me.maxHp < 0.3) {
      const k = (0.3 - me.hp / me.maxHp) / 0.3;
      const p = 0.5 + 0.5 * Math.sin(v.time * 6);
      const g2 = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.3, w / 2, h / 2, Math.max(w, h) * 0.7);
      g2.addColorStop(0, 'rgba(255,0,40,0)');
      g2.addColorStop(1, `rgba(255,0,40,${0.25 * k + 0.15 * k * p})`);
      ctx.fillStyle = g2;
      ctx.fillRect(0, 0, w, h);
    }
    if (me && me.flags & PF.SLOW) {
      ctx.fillStyle = 'rgba(120,200,255,0.05)';
      ctx.fillRect(0, 0, w, h);
    }
    ctx.restore();
  }

  // 미니맵 (HUD 캔버스에 그림)
  drawMinimap(mc, v) {
    const g = mc.getContext('2d');
    const S = mc.width;
    const R = v.map.R;
    const k = (S / 2 - 6) / R;
    g.clearRect(0, 0, S, S);
    g.save();
    g.translate(S / 2, S / 2);
    g.beginPath();
    g.arc(0, 0, R * k, 0, TAU);
    g.fillStyle = 'rgba(20,16,32,0.85)';
    g.fill();
    g.strokeStyle = 'rgba(94,242,214,0.5)';
    g.lineWidth = 1.5;
    g.stroke();
    g.fillStyle = 'rgba(120,110,140,0.5)';
    for (const o of v.map.obstacles) {
      g.beginPath();
      g.arc(o.x * k, o.y * k, Math.max(1, o.r * k), 0, TAU);
      g.fill();
    }
    const z = v.zone;
    if (z && z.active) {
      g.beginPath();
      g.arc(z.x * k, z.y * k, z.r * k, 0, TAU);
      g.strokeStyle = '#ff3355';
      g.lineWidth = 2;
      g.stroke();
      g.setLineDash([3, 3]);
      g.beginPath();
      g.arc(z.tx * k, z.ty * k, z.tr * k, 0, TAU);
      g.strokeStyle = 'rgba(255,255,255,0.6)';
      g.lineWidth = 1;
      g.stroke();
      g.setLineDash([]);
    }
    for (const al of v.altars) {
      const c = ORBS[al.i].color;
      g.beginPath();
      g.arc(al.x * k, al.y * k, 6, 0, TAU);
      g.strokeStyle = c;
      g.lineWidth = 2;
      g.stroke();
      if (al.state === 'warn' || al.state === 'guarded') {
        g.fillStyle = hexA(c, 0.5 + 0.4 * Math.sin(v.time * 6));
        g.fill();
      }
    }
    for (const c of v.chests) {
      if (c.open) continue;
      g.fillStyle = 'rgba(255,207,90,0.7)';
      g.fillRect(c.x * k - 1.5, c.y * k - 1.5, 3, 3);
    }
    for (const o of v.groundOrbs) {
      g.beginPath();
      g.arc(o.x * k, o.y * k, 5, 0, TAU);
      g.fillStyle = ORBS[o.i].color;
      g.fill();
      g.strokeStyle = '#fff';
      g.lineWidth = 1.5;
      g.stroke();
    }
    for (const c of v.carriers) {
      g.beginPath();
      g.arc(c.x * k, c.y * k, c.ritual ? 7 : 5, 0, TAU);
      g.fillStyle = c.id === v.meId ? '#ffe9a8' : '#ff4d5e';
      g.fill();
      g.strokeStyle = '#fff';
      g.lineWidth = 1.5;
      g.stroke();
    }
    const me = v.players.find((p) => p.me);
    if (me) {
      g.save();
      g.translate(me.x * k, me.y * k);
      g.rotate(me.aim);
      g.fillStyle = '#ffe9a8';
      g.beginPath();
      g.moveTo(7, 0);
      g.lineTo(-5, -5);
      g.lineTo(-3, 0);
      g.lineTo(-5, 5);
      g.closePath();
      g.fill();
      g.restore();
    }
    g.restore();
  }
}

export { hexA, glow };
