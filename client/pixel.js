// 도트 렌더러: 월드를 저해상도 캔버스(1px = 월드 3)에 그린 뒤 정수 배율로 키워서 화면에 찍는다.
// 스킬 예고·범위·파티클 같은 효과는 기존 Renderer의 그리기 코드를 저해상도 캔버스 위에서 그대로 재사용한다.
import { Renderer, hexA } from './render.js';
import { PF } from '../shared/sim.js';
import { VIEW_W, VIEW_H } from '../shared/constants.js';
import { IMG, SPR, FX, PROJ, FLOOR, MON_LOOK, WEAPON_LOOK, sheetOf, whiteOf, tintOf } from './assets.js';
import { RARITIES, WEAPONS } from '../shared/items.js';
import { MONSTER_BY_IDX } from '../shared/monsters.js';

export const PX = 3; // 월드 단위 / 도트 1칸
const TAU = Math.PI * 2;
const CHEST_GLOW = { small: '', big: '#ffcf4a', bounty: '#ffd54a', epic: '#c56bff', titan: '#ff7ef2' };
const FAM_ICONS = ['', '🔥', '⚡', '🌑', '🛡', '🩸', '🍃'];

function hash2(x, y, s = 0) {
  let h = (x * 374761393 + y * 668265263 + s * 1442695041) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

function makeNoise(seed) {
  const sm = (t) => t * t * (3 - 2 * t);
  return (x, y) => {
    const ix = Math.floor(x);
    const iy = Math.floor(y);
    const fx = sm(x - ix);
    const fy = sm(y - iy);
    const a = hash2(ix, iy, seed);
    const b = hash2(ix + 1, iy, seed);
    const c = hash2(ix, iy + 1, seed);
    const d = hash2(ix + 1, iy + 1, seed);
    return (a + (b - a) * fx) * (1 - fy) + (c + (d - c) * fx) * fy;
  };
}

function seededRng(seed) {
  let s = seed >>> 0 || 1;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

// 4방향 시트 열: 0 아래, 1 위, 2 왼쪽, 3 오른쪽
function dirCol(a) {
  const c = Math.cos(a);
  const s = Math.sin(a);
  if (Math.abs(c) >= Math.abs(s) * 0.9) return c > 0 ? 3 : 2;
  return s > 0 ? 0 : 1;
}

export class PixelRenderer extends Renderer {
  constructor(canvas) {
    super(canvas);
    this.mainCtx = this.ctx;
    this.anims = [];
    this.grounds = new Map();
    this.statics = new Map();
    this.pixT = [0, 0];
  }

  resize() {
    if (!this.low) {
      this.low = document.createElement('canvas');
      this.lctxLow = this.low.getContext('2d');
    }
    this.dpr = Math.min(2, window.devicePixelRatio || 1);
    this.w = innerWidth;
    this.h = innerHeight;
    this.canvas.width = Math.floor(this.w * this.dpr);
    this.canvas.height = Math.floor(this.h * this.dpr);
    this.canvas.style.width = `${this.w}px`;
    this.canvas.style.height = `${this.h}px`;
    // 모두 같은 넓이의 월드를 보도록 하되, 도트가 고르게 보이게 정수 배율로 맞춤
    const want = Math.sqrt((this.w * this.h) / (VIEW_W * VIEW_H)) * 1.05;
    this.k = Math.max(2, Math.round(want * PX));
    this.zoom = this.k / PX;
    this.low.width = Math.ceil(this.w / this.k) + 4;
    this.low.height = Math.ceil(this.h / this.k) + 4;
    this.lctxLow.imageSmoothingEnabled = false;
  }

  // ---------------- 좌표계 ----------------
  // 월드 좌표로 그리기 (벡터 효과용)
  worldMode() {
    this.ctx.setTransform(1 / PX, 0, 0, 1 / PX, this.pixT[0], this.pixT[1]);
  }

  // 도트 좌표로 그리기 (스프라이트용): 그릴 위치는 Math.round(월드/PX)
  pixMode() {
    this.ctx.setTransform(1, 0, 0, 1, this.pixT[0], this.pixT[1]);
  }

  // 스프라이트 애니메이션 효과 (Ninja Adventure FX 띠)
  anim(name, x, y, opts = {}) {
    const def = FX[name];
    if (!def) return;
    this.anims.push({ def, x, y, t: -(opts.delay || 0), dur: opts.dur || def[2] * 0.05, scale: opts.scale || 1, rot: opts.rot || 0, flip: !!opts.flip, alpha: opts.alpha ?? 1, add: !!opts.add, follow: opts.follow || 0 });
    if (this.anims.length > 160) this.anims.shift();
  }

  update(dt) {
    super.update(dt);
    this.anims = this.anims.filter((a) => (a.t += dt) < a.dur);
  }

  // ---------------- 메인 ----------------
  draw(v, dt) {
    this.update(dt);
    const L = this.lctxLow;
    const W = this.low.width;
    const H = this.low.height;
    let sx = 0;
    let sy = 0;
    if (this.shakeT > 0) {
      const k = this.shakeT / 0.25;
      sx = (Math.random() - 0.5) * this.shakeAmt * k;
      sy = (Math.random() - 0.5) * this.shakeAmt * k;
    }
    const camX = v.cam.x + sx / this.zoom;
    const camY = v.cam.y + sy / this.zoom;
    this.cam.x = camX;
    this.cam.y = camY;
    const cpx = camX / PX;
    const cpy = camY / PX;
    const fx = Math.floor(cpx);
    const fy = Math.floor(cpy);
    const hw = Math.floor(W / 2);
    const hh = Math.floor(H / 2);
    this.pixT = [hw - fx, hh - fy];
    const zw = this.w / 2 / this.zoom;
    const zh = this.h / 2 / this.zoom;
    this.view = { x0: camX - zw - 100, x1: camX + zw + 100, y0: camY - zh - 100, y1: camY + zh + 140 };

    this.ctx = L;
    L.setTransform(1, 0, 0, 1, 0, 0);
    L.globalAlpha = 1;
    L.globalCompositeOperation = 'source-over';
    L.fillStyle = '#3f7cc4';
    L.fillRect(0, 0, W, H);
    this.drawGround(v);
    this.worldMode();
    this.drawZone(v);
    this.drawMoveMarker(v, dt);
    this.drawSouls(v);
    this.drawAreas(v, false);
    this.drawTelegraphs(v);
    const me = v.players.find((p) => p.me);
    this.worldMode();
    this.drawTargeting(v, me);
    this.drawSorted(v, me);
    this.worldMode();
    this.drawProjectiles(v);
    this.worldMode();
    this.drawAreas(v, true);
    this.drawAnims();
    this.worldMode();
    this.drawFx(L);
    this.drawParticles(L);
    this.pixMode();
    this.drawBars(v);
    this.ctx = this.mainCtx;

    // 확대해서 화면에 찍기 (부드러운 카메라를 위해 소수점만큼 밀어서)
    const ctx = this.mainCtx;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.imageSmoothingEnabled = false;
    const k = this.k;
    const x0 = this.w / 2 - (hw + (cpx - fx)) * k;
    const y0 = this.h / 2 - (hh + (cpy - fy)) * k;
    ctx.drawImage(this.low, 0, 0, W, H, Math.round(x0 * this.dpr), Math.round(y0 * this.dpr), W * k * this.dpr, H * k * this.dpr);

    // 화면 해상도로 그리는 글자 (한글 이름·피해 숫자)
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    this.drawNames(v);
    this.drawTexts(ctx);
    this.drawIndicators(v);
    this.drawVignette(v);
  }

  toScreen(x, y) {
    return [(x - this.cam.x) * this.zoom + this.w / 2, (y - this.cam.y) * this.zoom + this.h / 2];
  }

  // ---------------- 바닥 (맵마다 한 번 만들어 둠) ----------------
  groundOf(map) {
    let gc = this.grounds.get(map.id);
    if (gc) return gc;
    const floor = IMG['tiles/TilesetFloor.png'];
    if (!floor || !floor.width) return null;
    const tc = document.createElement('canvas');
    tc.width = floor.width;
    tc.height = floor.height;
    const tg = tc.getContext('2d');
    tg.drawImage(floor, 0, 0);
    const tp = tg.getImageData(0, 0, tc.width, tc.height).data;
    const TW = tc.width;
    const tile = (t, x, y) => ((t[1] + y) * TW + t[0] + x) * 4;

    const M = 420;
    const half = map.R + M;
    const S = Math.ceil((2 * half) / PX);
    const c = document.createElement('canvas');
    c.width = c.height = S;
    const g = c.getContext('2d');
    const img = g.createImageData(S, S);
    const d = img.data;
    const type = new Uint8Array(S * S); // 0 물, 1 모래, 2 풀, 3 흙, 4 연못
    const seed = (map.decor && map.decor.seed) || 1;
    const noise = makeNoise(seed);
    const ponds = map.obstacles.filter((o) => o.k === 5);
    const dirts = (map.pois || []).map((p, i) => ({ x: p.x, y: p.y, r: i === 0 ? 560 : 300 }));
    const R = map.R;
    const set = (i, r, gg, b) => {
      d[i] = r;
      d[i + 1] = gg;
      d[i + 2] = b;
      d[i + 3] = 255;
    };
    for (let py = 0; py < S; py++) {
      const wy = py * PX - half;
      for (let px = 0; px < S; px++) {
        const wx = px * PX - half;
        const o = (py * S + px) * 4;
        const n = noise(wx / 260, wy / 260);
        const dd = Math.sqrt(wx * wx + wy * wy);
        const edge = R + (n - 0.5) * 90;
        if (dd > edge) {
          // 바다: 물결 무늬 + 해안 거품
          const foam = dd - edge < 5;
          const wave = noise(wx / 40 + 50, wy / 18) > 0.72;
          if (foam) set(o, 223, 243, 255);
          else if (dd - edge < 22) set(o, 111, 177, 230);
          else if (wave) set(o, 92, 158, 220);
          else set(o, 63, 124, 196);
          type[py * S + px] = 0;
          continue;
        }
        if (dd > edge - 50) {
          const t = tile(FLOOR.sand, px % 16, py % 16);
          set(o, tp[t], tp[t + 1], tp[t + 2]);
          type[py * S + px] = 1;
          continue;
        }
        // 연못
        let pond = 99;
        for (const p of ponds) {
          const q = Math.sqrt((wx - p.x) ** 2 + (wy - p.y) ** 2) - p.r * (0.95 + (noise(wx / 60 + 9, wy / 60) - 0.5) * 0.25);
          if (q < pond) pond = q;
        }
        if (pond < 0) {
          if (pond > -6) set(o, 223, 243, 255);
          else if (noise(wx / 30 + 50, wy / 14) > 0.75) set(o, 92, 158, 220);
          else set(o, 75, 140, 205);
          type[py * S + px] = 4;
          continue;
        }
        if (pond < 7) {
          set(o, 72, 112, 44);
          type[py * S + px] = 2;
          continue;
        }
        // 흙 (마을·유적 바닥)
        let dirt = 99;
        for (const q of dirts) {
          const v2 = Math.sqrt((wx - q.x) ** 2 + (wy - q.y) ** 2) - q.r * (0.8 + noise(wx / 120 + 3, wy / 120 + 7) * 0.4);
          if (v2 < dirt) dirt = v2;
        }
        if (dirt < 0) {
          const t = tile(FLOOR.dirt, px % 16, py % 16);
          set(o, tp[t], tp[t + 1], tp[t + 2]);
          type[py * S + px] = 3;
          continue;
        }
        // 풀: 16칸마다 가끔 무늬 있는 타일
        const cx = Math.floor(px / 16);
        const cy = Math.floor(py / 16);
        const hv = hash2(cx, cy, seed);
        const ft = hv < 0.22 ? FLOOR.grassVar[Math.floor(hash2(cy, cx, seed) * FLOOR.grassVar.length)] : FLOOR.grass;
        const t = tile(ft, px % 16, py % 16);
        if (dirt < 4) set(o, tp[t] * 0.8, tp[t + 1] * 0.85, tp[t + 2] * 0.7);
        else set(o, tp[t], tp[t + 1], tp[t + 2]);
        type[py * S + px] = 2;
      }
    }
    g.putImageData(img, 0, 0);
    // 꽃·풀 장식
    const rnd = seededRng(seed * 7 + 3);
    const deco = ['flower0', 'flower1', 'flower2', 'flower3', 'flower6', 'tuft', 'tuft', 'tuft'];
    const n = Math.floor((S * S) / 1400);
    for (let i = 0; i < n; i++) {
      const px = Math.floor(rnd() * S);
      const py = Math.floor(rnd() * S);
      if (type[py * S + px] !== 2) continue;
      const wx = px * PX - half;
      const wy = py * PX - half;
      if (map.obstacles.some((o) => (o.x - wx) ** 2 + (o.y - wy) ** 2 < (o.r + 30) ** 2)) continue;
      const sp = SPR[deco[Math.floor(rnd() * deco.length)]];
      g.drawImage(IMG[sp[0]], sp[1], sp[2], sp[3], sp[4], px - 8, py - 8, sp[3], sp[4]);
    }
    gc = { c, half, S };
    this.grounds.set(map.id, gc);
    return gc;
  }

  drawGround(v) {
    const gc = this.groundOf(v.map);
    if (!gc) return;
    const L = this.ctx;
    L.setTransform(1, 0, 0, 1, 0, 0);
    L.drawImage(gc.c, this.pixT[0] - gc.half / PX, this.pixT[1] - gc.half / PX);
  }

  // ---------------- 맵의 고정 물체 (나무·바위·벽·수풀) ----------------
  staticsOf(map) {
    let st = this.statics.get(map.id);
    if (st) return st;
    st = [];
    for (const o of map.obstacles) {
      const h = hash2(Math.round(o.x), Math.round(o.y), 5);
      let spr = null;
      let oy = 0;
      switch (o.k) {
        case 0:
          spr = o.r >= 22 ? 'rockG' : 'srockG';
          break;
        case 1:
          spr = 'rockB';
          break;
        case 2:
          spr = o.r >= 24 && h < 0.35 ? 'bigGreen' : ['treeG', 'treeG2', 'treeG3', 'oak'][Math.floor(h * 4)];
          break;
        case 3:
          spr = h < 0.25 ? 'dead' : 'pine';
          break;
        case 4:
          spr = h < 0.3 ? 'bigPink' : 'pink';
          break;
        case 6:
          spr = o.r >= 18 ? 'stumpB' : 'stumpS';
          break;
        default:
          break;
      }
      if (!spr) continue;
      const s = SPR[spr];
      const tree = o.k >= 2 && o.k <= 4;
      // 그림의 발밑을 충돌 원 아래쪽에 맞춤
      oy = tree ? s[4] - 3 : s[4] === 16 ? 11 : s[4] === 32 ? 22 : s[4] - 4;
      st.push({ x: o.x, y: o.y, sort: o.y + (tree ? 6 : 0), spr, ox: s[3] / 2, oy, tree, w: s[3], h: s[4] });
    }
    // 벽: 돌 블록을 이어 붙임
    for (const w of map.walls || []) {
      const len = Math.hypot(w[2] - w[0], w[3] - w[1]);
      const n = Math.max(1, Math.ceil(len / 5));
      const th = Math.max(4, Math.round(w[4] / PX));
      for (let i = 0; i <= n; i++) {
        const x = w[0] + ((w[2] - w[0]) * i) / n;
        const y = w[1] + ((w[3] - w[1]) * i) / n;
        st.push({ x, y, sort: y, wall: true, th, h: hash2(Math.round(x), Math.round(y), 9) });
      }
    }
    // 수풀: 덤불 여러 개를 모아 둠
    for (const b of map.bushes || []) {
      const n = Math.max(4, Math.round((b.r * b.r) / 650));
      for (let i = 0; i < n; i++) {
        const a = (i / n) * TAU + hash2(b.x, b.y, i) * 0.8;
        const rr = i === 0 ? 0 : b.r * (0.35 + hash2(b.y, b.x, i) * 0.4);
        const x = b.x + Math.cos(a) * rr;
        const y = b.y + Math.sin(a) * rr;
        st.push({ x, y, sort: y + 4, spr: ['bush0', 'bush1', 'bush2'][i % 3], ox: 8, oy: 12, bush: b, w: 16, h: 16 });
      }
    }
    this.statics.set(map.id, st);
    return st;
  }

  behind(s) {
    for (const u of this.units) {
      if (u.y < s.y && s.y - u.y < s.h * PX * 0.9 && Math.abs(u.x - s.x) < s.w * PX * 0.45) return true;
    }
    return false;
  }

  drawSorted(v, me) {
    const L = this.ctx;
    this.units = v.players.concat(v.monsters);
    const list = [];
    for (const s of this.staticsOf(v.map)) if (this.visible(s.x, s.y, 120)) list.push({ y: s.sort, s });
    for (const c of v.chests) if (this.visible(c.x, c.y, 60)) list.push({ y: c.y, c });
    for (const g of v.items || []) if (this.visible(g.x, g.y, 40)) list.push({ y: g.y, g });
    for (const l of v.lairs || []) if ((l.state === 'sleep' || l.state === 'dead') && this.visible(l.x, l.y, 120)) list.push({ y: l.y, l });
    for (const m of v.monsters) if (this.visible(m.x, m.y, 60)) list.push({ y: m.y, m });
    for (const p of v.players) if (this.visible(p.x, p.y, 60)) list.push({ y: p.y, p });
    list.sort((a, b) => a.y - b.y);
    this.pixMode();
    const t = v.time;
    for (const it of list) {
      if (it.p) this.drawPlayer(it.p, v);
      else if (it.m) this.drawMonster(it.m, t);
      else if (it.c) this.drawChest(it.c, t);
      else if (it.g) this.drawItem(it.g, t);
      else if (it.l) this.drawLair(it.l, t);
      else this.drawStatic(it.s, me);
      L.globalAlpha = 1;
    }
  }

  spr(name, x, y, flip = false) {
    const s = SPR[name];
    const img = IMG[s[0]];
    if (!img || !img.width) return;
    const L = this.ctx;
    if (flip) {
      L.save();
      L.translate(x + s[3], y);
      L.scale(-1, 1);
      L.drawImage(img, s[1], s[2], s[3], s[4], 0, 0, s[3], s[4]);
      L.restore();
    } else L.drawImage(img, s[1], s[2], s[3], s[4], x, y, s[3], s[4]);
  }

  drawStatic(s, me) {
    const L = this.ctx;
    const lx = Math.round(s.x / PX);
    const ly = Math.round(s.y / PX);
    if (s.wall) {
      // 위에서 비스듬히 본 돌담: 2px 간격으로 겹쳐 그려 이어진 담처럼 보이게
      const w = s.th + 2;
      const x = lx - Math.floor(w / 2);
      L.fillStyle = '#3a3440';
      L.fillRect(x - 1, ly - 8, w + 2, 13);
      L.fillStyle = '#6f6a78';
      L.fillRect(x, ly - 2, w, 6);
      L.fillStyle = '#58535f';
      if (Math.floor(s.h * 7) % 3 === 0) L.fillRect(x + Math.floor(s.h * 30) % w, ly - 2, 1, 6);
      L.fillRect(x, ly + 1, w, 1);
      L.fillStyle = '#b3aebb';
      L.fillRect(x, ly - 7, w, 5);
      L.fillStyle = '#d4d0da';
      L.fillRect(x, ly - 7, w, 1);
      if (s.h < 0.12) {
        L.fillStyle = '#76a83e';
        L.fillRect(x + Math.floor(s.h * 90) % w, ly - 7, 2, 1);
      }
      return;
    }
    // 나무 뒤에 누가 있으면 나무를 반투명하게 (가려서 안 보이는 일이 없게)
    if (s.tree && this.behind(s)) L.globalAlpha = 0.5;
    if (s.bush && me && me.flags & PF.BUSH && (me.x - s.bush.x) ** 2 + (me.y - s.bush.y) ** 2 < s.bush.r * s.bush.r) L.globalAlpha = 0.6;
    this.spr(s.spr, lx - s.ox, ly - s.oy, s.bush ? hash2(lx, ly) < 0.5 : false);
    L.globalAlpha = 1;
  }

  drawChest(c, t) {
    const L = this.ctx;
    const lx = Math.round(c.x / PX);
    const ly = Math.round(c.y / PX);
    const big = c.kind !== 'small';
    const glow = CHEST_GLOW[c.kind];
    const s = c.kind === 'titan' ? 2 : 1;
    if (!c.open && glow && !c.locked) {
      // 은은하게 빛나는 바닥
      L.globalAlpha = 0.35 + 0.15 * Math.sin(t * 4 + c.id);
      L.fillStyle = glow;
      L.fillRect(lx - 9 * s, ly + 1, 18 * s, 3);
      L.fillRect(lx - 7 * s, ly, 14 * s, 5);
      L.globalAlpha = 1;
    }
    this.spr('shadow', lx - 6, ly - 1);
    const name = big ? (c.open ? 'chestB1' : 'chestB0') : c.open ? 'chestS1' : 'chestS0';
    if (c.open) L.globalAlpha = 0.7;
    if (c.locked) L.globalAlpha = 0.75;
    const sp = SPR[name];
    const img = IMG[sp[0]];
    if (img && img.width) {
      L.drawImage(img, sp[1], sp[2], sp[3], sp[4], lx - 8 * s, ly - (big ? 11 : 12) * s, sp[3] * s, sp[4] * s);
      // 에픽 보물: 보라·분홍빛으로 물들임
      if ((c.kind === 'epic' || c.kind === 'titan') && !c.open) {
        const ti = tintOf(sp[0], glow);
        if (ti) {
          L.globalAlpha = 0.35 + 0.15 * Math.sin(t * 6);
          L.drawImage(ti, sp[1], sp[2], sp[3], sp[4], lx - 8 * s, ly - 11 * s, sp[3] * s, sp[4] * s);
        }
      }
    }
    L.globalAlpha = 1;
    if (c.locked && !c.open) {
      // 자물쇠: 캠프 몹을 다 잡아야 열림
      const y = ly - 20;
      L.fillStyle = '#2a1a10';
      L.fillRect(lx - 4, y - 1, 9, 8);
      L.fillStyle = '#c9c9d6';
      L.fillRect(lx - 3, y + 2, 7, 4);
      L.fillRect(lx - 2, y - 2, 1, 4);
      L.fillRect(lx + 2, y - 2, 1, 4);
      L.fillRect(lx - 2, y - 3, 5, 1);
      L.fillStyle = '#2a1a10';
      L.fillRect(lx, y + 3, 1, 2);
    }
    if (!c.open && c.kind === 'bounty') {
      // 현상금 주머니: 위에서 빙글빙글 도는 금화
      const bob = Math.round(Math.sin(t * 5 + c.id) * 2);
      this.spr('coin', lx - 3, ly - 22 + bob);
    }
    if (!c.open && !c.locked && glow && Math.random() < (c.kind === 'titan' || c.kind === 'epic' ? 0.4 : 0.08)) {
      const a = Math.random() * TAU;
      this.burst(c.x + Math.cos(a) * 20 * s, c.y - 10 + Math.sin(a) * 10, glow, 1, 30, 3, 0.6, { grav: -40, drag: 1 });
    }
  }

  // 바닥에 떨어진 무기: 등급 색으로 빛나며 둥실둥실
  drawItem(g, t) {
    const L = this.ctx;
    const lx = Math.round(g.x / PX);
    const ly = Math.round(g.y / PX);
    const look = WEAPON_LOOK[g.type];
    const img = look && IMG[look.icon];
    const col = RARITIES[g.rarity].color;
    L.globalAlpha = 0.45;
    L.fillStyle = '#000';
    L.fillRect(lx - 4, ly, 9, 2);
    L.globalAlpha = 0.3 + 0.2 * Math.sin(t * 4 + g.id);
    L.fillStyle = col;
    L.fillRect(lx - 6, ly - 1, 13, 3);
    if (g.rarity >= 3) {
      L.fillRect(lx - 1, ly - 30, 3, 28);
    }
    L.globalAlpha = 1;
    if (!img || !img.width) return;
    const bob = Math.round(Math.sin(t * 3 + g.id) * 1.5);
    const w = Math.max(6, Math.round(img.width * (g.type === 'dagger' ? 1 : 0.8)));
    const h = Math.round((img.height * w) / img.width);
    const x = lx - Math.floor(w / 2);
    const y = ly - h - 4 + bob;
    // 등급 색 테두리
    const ti = tintOf(look.icon, col);
    if (ti && g.rarity > 0) for (const [ox, oy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) L.drawImage(ti, x + ox, y + oy, w, h);
    L.drawImage(img, x, y, w, h);
    if (g.rarity >= 2 && Math.random() < 0.06 * g.rarity) this.burst(g.x + (Math.random() - 0.5) * 30, g.y - 20, col, 1, 20, 3, 0.6, { grav: -50, drag: 1 });
  }

  // 잠든 (또는 다시 깨어나기를 기다리는) 에픽 몬스터
  drawLair(l, t) {
    const L = this.ctx;
    const look = MON_LOOK[l.bossIdx];
    const img = look && IMG[look.sheet];
    const lx = Math.round(l.x / PX);
    const ly = Math.round(l.y / PX);
    // 둥지: 어두운 원
    L.globalAlpha = 0.35;
    L.fillStyle = '#2a1a30';
    L.beginPath();
    L.ellipse(lx, ly, 30, 14, 0, 0, TAU);
    L.fill();
    L.globalAlpha = 1;
    if (l.state === 'dead' || !img || !img.width) return;
    const [fw] = look.strip;
    const fh = img.height;
    L.globalAlpha = 0.6;
    L.drawImage(img, 0, 0, fw, fh, lx - Math.floor(fw / 2), ly - fh + look.foot, fw, fh);
    L.globalAlpha = 1;
    // Zzz
    const k = (t * 0.8) % 1;
    L.fillStyle = '#e8f6ff';
    L.globalAlpha = 1 - k;
    const zx = lx + 10 + Math.round(k * 8);
    const zy = ly - fh + 2 - Math.round(k * 12);
    L.fillRect(zx, zy, 4, 1);
    L.fillRect(zx + 2, zy + 1, 1, 1);
    L.fillRect(zx + 1, zy + 2, 1, 1);
    L.fillRect(zx, zy + 3, 4, 1);
    L.globalAlpha = 1;
  }

  // ---------------- 캐릭터 ----------------
  drawPlayer(p, v) {
    const L = this.ctx;
    L.save();
    this.pixMode();
    const t = v.time;
    const file = sheetOf(p.cos);
    const img = IMG[file];
    const rar = p.rar || 0;
    const [rx, ry] = this.recoilOf(p.id);
    const lx = Math.round((p.x + rx) / PX);
    const ly = Math.round((p.y + ry) / PX);
    const f = p.flags || 0;
    const sp = Math.hypot(p.vx || 0, p.vy || 0);
    const moving = sp > 30;
    const acting = p.act > 0 && p.act !== 7;
    const face = acting || !moving ? p.aim : Math.atan2(p.vy, p.vx);
    const col = dirCol(face);
    let row = 0;
    if (f & PF.DASH) row = 5;
    else if (acting) row = 4;
    else if (moving) row = Math.floor(t * 8 + p.id) % 4;
    let alpha = L.globalAlpha;
    if (f & PF.INVIS) alpha *= p.me ? 0.4 : 0.3;
    if (f & PF.BUSH && p.me) alpha *= 0.6;
    if (f & PF.PROTECT && Math.floor(t * 10) % 2) alpha *= 0.5;
    // 발밑: 나는 노란 고리, 현상금 걸린 적은 금색
    L.globalAlpha = alpha;
    if (p.me) this.footRing(lx, ly + 3, '#ffe36b');
    else if (f & PF.BOUNTY) this.footRing(lx, ly + 3, '#ffb000');
    // 무기 등급 오라: 전설·신화는 발밑 원 + 떠오르는 불꽃 (멀리서도 "쟤 세다")
    if (rar >= 4 && !(f & PF.INVIS)) {
      const col = RARITIES[rar].color;
      L.globalAlpha = alpha * (0.35 + 0.2 * Math.sin(t * 5 + p.id));
      L.strokeStyle = col;
      L.lineWidth = 1;
      L.beginPath();
      L.ellipse(lx + 0.5, ly + 3.5, 11, 5, 0, 0, TAU);
      L.stroke();
      L.globalAlpha = alpha;
      if (Math.random() < (rar >= 5 ? 0.6 : 0.3)) this.burst(p.x + (Math.random() - 0.5) * 34, p.y - 8, Math.random() < 0.5 ? col : '#ffffff', 1, 30, 4, 0.7, { grav: -90, drag: 1 });
    } else if (rar === 3 && Math.random() < 0.12) this.burst(p.x + (Math.random() - 0.5) * 30, p.y - 20, RARITIES[3].color, 1, 20, 3, 0.6, { grav: -60, drag: 1 });
    this.spr('shadow', lx - 6, ly);
    const big = (p.r || 18) > 20 ? 2 : 1; // 거인화 증강
    const dx = lx - 8 * big;
    const dy = ly - 13 * big;
    const wFront = col !== 1;
    if (!wFront) this.drawHeld(p, lx, ly, t);
    if (img && img.width) {
      // 등급 테두리: 등급 색 실루엣을 상하좌우로 1칸씩 밀어 그림 (영웅 이상은 깜빡임)
      if (rar > 0 && !(f & PF.INVIS)) {
        const ti = tintOf(file, RARITIES[rar].color);
        if (ti) {
          L.globalAlpha = alpha * (rar >= 3 ? 0.75 + 0.25 * Math.sin(t * (rar >= 4 ? 8 : 4) + p.id) : 0.9);
          for (const [ox, oy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) L.drawImage(ti, col * 16, row * 16, 16, 16, dx + ox, dy + oy, 16 * big, 16 * big);
          L.globalAlpha = alpha;
        }
      }
      L.drawImage(img, col * 16, row * 16, 16, 16, dx, dy, 16 * big, 16 * big);
      const fl = this.flash.get(p.id);
      if (fl) {
        const wi = whiteOf(file);
        if (wi) {
          L.globalAlpha = alpha * Math.min(1, fl / 0.09);
          L.drawImage(wi, col * 16, row * 16, 16, 16, dx, dy, 16 * big, 16 * big);
          L.globalAlpha = alpha;
        }
      }
    }
    if (wFront) this.drawHeld(p, lx, ly, t);
    L.globalAlpha = alpha;
    this.drawStatusPx(p, lx, ly - 13 * big, t);
    L.restore();
  }

  footRing(lx, ly, color) {
    const L = this.ctx;
    L.fillStyle = color;
    L.fillRect(lx - 5, ly - 2, 10, 1);
    L.fillRect(lx - 5, ly + 2, 10, 1);
    L.fillRect(lx - 7, ly - 1, 2, 3);
    L.fillRect(lx + 5, ly - 1, 2, 3);
  }

  // 손에 든 무기: 공격 중에는 조준 방향으로 휘두름
  drawHeld(p, lx, ly, t) {
    const look = WEAPON_LOOK[p.w] || WEAPON_LOOK.dagger;
    const img = IMG[look.held];
    if (!img || !img.width) return;
    const sc = look.scale;
    const L = this.ctx;
    let a = p.aim;
    let reach = 6;
    if (p.act >= 1 && p.act <= 3) {
      const k = (p.actT || 0) / 100;
      const flip = p.act === 2 ? -1 : 1;
      a += (k - 0.5) * 2.4 * flip;
      reach = 8;
    } else if (p.act > 3 && p.act !== 7) reach = 9;
    else if (!(p.act > 0)) {
      // 평소: 몸 옆에 들고 있음
      const col = dirCol(p.aim);
      a = col === 2 ? Math.PI * 0.75 : col === 3 ? Math.PI * 0.25 : col === 1 ? -Math.PI * 0.35 : Math.PI * 0.6;
      reach = 5;
    }
    L.save();
    L.translate(lx + Math.round(Math.cos(a) * reach), ly - 5 + Math.round(Math.sin(a) * reach * 0.8));
    L.rotate(a + Math.PI / 2);
    if (p.w === 'shuriken') L.rotate(t * (p.act > 0 ? 20 : 3));
    const w = Math.max(3, Math.round(img.width * sc));
    const h = Math.max(3, Math.round(img.height * sc));
    L.drawImage(img, -Math.floor(w / 2), p.w === 'shuriken' ? -Math.floor(h / 2) : -h + 3, w, h);
    if (p.flags & PF.EMPOWER) {
      L.globalCompositeOperation = 'lighter';
      L.globalAlpha = 0.5 + 0.3 * Math.sin(t * 14);
      L.fillStyle = '#ff6b2e';
      L.fillRect(-2, -img.height, 4, img.height);
    }
    L.restore();
  }

  drawStatusPx(p, lx, top, t) {
    const L = this.ctx;
    const f = p.flags || 0;
    if (f & PF.STUN) {
      L.fillStyle = '#ffe14d';
      for (let i = 0; i < 3; i++) {
        const a = t * 6 + (i / 3) * TAU;
        const x = lx + Math.round(Math.cos(a) * 6);
        const y = top - 2 + Math.round(Math.sin(a) * 2);
        L.fillRect(x, y - 1, 1, 3);
        L.fillRect(x - 1, y, 3, 1);
      }
    }
    if (f & PF.ROOT) {
      L.fillStyle = '#5fd35f';
      L.fillRect(lx - 6, top + 14, 2, 3);
      L.fillRect(lx + 4, top + 14, 2, 3);
      L.fillRect(lx - 1, top + 15, 2, 2);
    }
    if (f & PF.SHIELD) {
      L.globalAlpha *= 0.55 + 0.2 * Math.sin(t * 6);
      L.strokeStyle = '#bfefff';
      L.lineWidth = 1;
      L.beginPath();
      L.ellipse(lx + 0.5, top + 8.5, 10, 11, 0, 0, TAU);
      L.stroke();
      L.globalAlpha = 1;
    }
    if (f & PF.MARK) {
      L.fillStyle = '#c56bff';
      L.fillRect(lx - 1, top - 6, 3, 3);
      L.fillRect(lx, top - 7, 1, 5);
      L.fillRect(lx - 2, top - 5, 5, 1);
    }
    if (f & PF.BURN && Math.random() < 0.3) this.burst(p.x + (Math.random() - 0.5) * 24, p.y - 10, Math.random() < 0.5 ? '#ff7a2e' : '#ffd45a', 1, 20, 4, 0.5, { grav: -80, drag: 1 });
    if (f & PF.SLOW && Math.random() < 0.15) this.burst(p.x + (Math.random() - 0.5) * 24, p.y, '#9fe8ff', 1, 20, 3, 0.5, { grav: 40 });
    if (f & PF.CHANNEL) {
      L.fillStyle = '#1a1420';
      L.fillRect(lx - 9, top - 9, 18, 4);
      L.fillStyle = '#ffcf4a';
      L.fillRect(lx - 8, top - 8, Math.round(16 * Math.min(1, (p.actT || 0) / 100)), 2);
    }
  }

  // ---------------- 몬스터 ----------------
  drawMonster(m, t) {
    const L = this.ctx;
    L.save();
    this.pixMode();
    const look = MON_LOOK[m.type] || MON_LOOK[0];
    const file = look.sheet;
    const img = IMG[file];
    const [rx, ry] = this.recoilOf(m.id);
    const lx = Math.round((m.x + rx) / PX);
    const ly = Math.round((m.y + ry) / PX);
    // 그릴 칸: 일반 몬스터는 4방향 시트, 보스는 가로 띠
    let sx;
    let sy;
    let fw;
    let fh;
    let s;
    if (look.strip) {
      [fw] = look.strip;
      fh = img && img.height ? img.height : 40;
      sx = (Math.floor(t * 7 + m.id) % look.strip[1]) * fw;
      sy = 0;
      s = 1;
    } else {
      fw = fh = 16;
      s = look.scale;
      sx = dirCol(m.aim) * 16;
      sy = (Math.floor(t * 6 + m.id) % 4) * 16;
    }
    const dw = fw * s;
    const dh = fh * s;
    const dx = lx - Math.floor(dw / 2);
    const dy = look.strip ? ly - dh + look.foot : ly - 14 * s;
    m.top = dy;
    L.globalAlpha = 0.5;
    L.fillStyle = '#000';
    L.beginPath();
    L.ellipse(lx, ly + 1, Math.max(5, dw * 0.32), Math.max(2, dw * 0.1), 0, 0, TAU);
    L.fill();
    L.globalAlpha = 1;
    if (img && img.width) L.drawImage(img, sx, sy, fw, fh, dx, dy, dw, dh);
    const wind = m.wind / 100;
    const fl = this.flash.get(m.id);
    // 피격: 하얗게 / 공격 준비: 붉게 깜빡이고 머리 위에 느낌표
    const ti = fl ? whiteOf(file) : wind > 0 ? tintOf(file, '#ff2a3d') : null;
    if (ti) {
      L.globalAlpha = fl ? Math.min(1, fl / 0.09) : 0.2 + 0.5 * wind * (0.6 + 0.4 * Math.sin(t * 30));
      L.drawImage(ti, sx, sy, fw, fh, dx, dy, dw, dh);
      L.globalAlpha = 1;
      if (!fl) {
        L.fillStyle = '#ff3d4f';
        L.fillRect(lx - 1, dy - 7, 2, 4);
        L.fillRect(lx - 1, dy - 2, 2, 1);
      }
    }
    if (m.cc) {
      L.fillStyle = '#ffe14d';
      const a = t * 6;
      L.fillRect(lx + Math.round(Math.cos(a) * 5 * s), dy - 3, 2, 2);
    }
    L.restore();
  }

  // ---------------- 투사체 ----------------
  drawProjectiles(v) {
    const L = this.ctx;
    for (const q of v.projs) {
      if (!this.visible(q.x, q.y)) continue;
      const def = PROJ[q.kind] || PROJ.orbshot;
      const img = IMG[def[0]];
      if (!img || !img.width) continue;
      const fw = def[1];
      const fh = img.height;
      const fr = Math.floor(v.time * 12 + q.id) % def[2];
      L.save();
      L.setTransform(1, 0, 0, 1, this.pixT[0] + Math.round(q.x / PX), this.pixT[1] + Math.round(q.y / PX));
      if (def[3] != null) L.rotate(Math.atan2(q.vy, q.vx) - def[3]);
      else L.rotate(v.time * 18 + q.id);
      const sc = q.r >= 20 ? 2 : 1;
      if (sc > 1) L.scale(sc, sc);
      L.drawImage(img, fr * fw, 0, fw, fh, -Math.floor(fw / 2), -Math.floor(fh / 2), fw, fh);
      L.restore();
      if (q.kind === 'fireball' && Math.random() < 0.5) this.burst(q.x, q.y, '#ff7a2e', 1, 30, 4, 0.3, { drag: 2 });
    }
  }

  // ---------------- 효과 ----------------
  drawAnims() {
    const L = this.ctx;
    for (const a of this.anims) {
      if (a.t < 0) continue;
      const [file, fw, n] = a.def;
      const img = IMG[file];
      if (!img || !img.width) continue;
      const fr = Math.min(n - 1, Math.floor((a.t / a.dur) * n));
      const fh = img.height;
      L.save();
      L.setTransform(1, 0, 0, 1, this.pixT[0] + Math.round(a.x / PX), this.pixT[1] + Math.round(a.y / PX));
      if (a.rot) L.rotate(a.rot);
      if (a.flip) L.scale(1, -1);
      if (a.scale !== 1) L.scale(a.scale, a.scale);
      L.globalAlpha = a.alpha;
      if (a.add) L.globalCompositeOperation = 'lighter';
      L.drawImage(img, fr * fw, 0, fw, fh, -Math.floor(fw / 2), -Math.floor(fh / 2), fw, fh);
      L.restore();
    }
  }

  // 파티클은 네모 도트로
  drawParticles(ctx) {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (const p of this.particles) {
      const k = Math.max(0, p.life / p.max);
      const s = Math.max(PX, Math.round((p.size * (0.4 + 0.6 * k)) / PX) * PX);
      ctx.globalAlpha = Math.min(1, k * 1.4);
      ctx.fillStyle = p.color;
      ctx.fillRect(Math.round(p.x / PX) * PX - s / 2, Math.round(p.y / PX) * PX - s / 2, s, s);
    }
    ctx.restore();
  }

  drawSouls(v) {
    const L = this.ctx;
    L.save();
    this.pixMode();
    for (const o of v.souls) {
      if (!this.visible(o.x, o.y)) continue;
      const lx = Math.round(o.x / PX);
      const ly = Math.round(o.y / PX) - 2 + Math.round(Math.sin(v.time * 5 + o.id) * 1.5);
      L.fillStyle = '#7fe7ff';
      L.fillRect(lx - 1, ly - 1, 3, 3);
      L.fillStyle = '#ffffff';
      L.fillRect(lx, ly, 1, 1);
    }
    L.restore();
  }

  drawZone(v) {
    const z = v.zone;
    if (!z) return;
    const ctx = this.ctx;
    const t = v.time;
    if (z.active || z.r < v.map.R + 200) {
      ctx.save();
      ctx.beginPath();
      ctx.rect(this.view.x0 - 500, this.view.y0 - 500, this.view.x1 - this.view.x0 + 1000, this.view.y1 - this.view.y0 + 1000);
      ctx.arc(z.x, z.y, z.r, 0, TAU, true);
      ctx.fillStyle = 'rgba(70,20,120,0.42)';
      ctx.fill('evenodd');
      ctx.beginPath();
      ctx.arc(z.x, z.y, z.r, 0, TAU);
      ctx.lineWidth = PX * 3;
      ctx.strokeStyle = `rgba(214,120,255,${0.5 + 0.25 * Math.sin(t * 5)})`;
      ctx.stroke();
      ctx.restore();
      // 자기장 바깥에 흩날리는 보랏빛 가루
      if (Math.random() < 0.5) {
        const a = Math.random() * TAU;
        const x = z.x + Math.cos(a) * (z.r + 20 + Math.random() * 200);
        const y = z.y + Math.sin(a) * (z.r + 20 + Math.random() * 200);
        if (this.visible(x, y)) this.burst(x, y, '#c58bff', 1, 20, 4, 1, { grav: -30, drag: 1 });
      }
    }
    if (z.stage === 'warn' || z.stage === 'shrink') {
      ctx.save();
      ctx.setLineDash([PX * 4, PX * 3]);
      ctx.lineWidth = PX;
      ctx.strokeStyle = 'rgba(255,255,255,0.8)';
      ctx.beginPath();
      ctx.arc(z.tx, z.ty, z.tr, 0, TAU);
      ctx.stroke();
      ctx.restore();
    }
  }

  // ---------------- 체력바 (도트) ----------------
  drawBars(v) {
    const L = this.ctx;
    for (const p of v.players) {
      if (!this.visible(p.x, p.y)) continue;
      if (p.flags & PF.INVIS && !p.me) continue;
      const big = (p.r || 18) > 20 ? 2 : 1;
      const lx = Math.round(p.x / PX);
      const ly = Math.round(p.y / PX) - 13 * big - 5;
      const w = 20;
      const k = Math.max(0, Math.min(1, p.hp / p.maxHp));
      L.fillStyle = '#16121c';
      L.fillRect(lx - w / 2 - 1, ly - 1, w + 2, 5);
      L.fillStyle = '#3a2a2e';
      L.fillRect(lx - w / 2, ly, w, 3);
      L.fillStyle = p.me ? '#5fe05a' : '#ff4d5e';
      L.fillRect(lx - w / 2, ly, Math.round(w * k), 3);
      L.fillStyle = p.me ? '#b6ff9a' : '#ff9aa4';
      L.fillRect(lx - w / 2, ly, Math.round(w * k), 1);
      if (p.shield > 0) {
        L.fillStyle = '#e8f6ff';
        L.fillRect(lx - w / 2, ly + 2, Math.min(w, Math.round((w * p.shield) / p.maxHp)), 1);
      }
      // 체력 눈금 (300마다)
      L.fillStyle = 'rgba(22,18,28,0.6)';
      for (let hp = 300; hp < p.maxHp; hp += 300) L.fillRect(lx - w / 2 + Math.round((w * hp) / p.maxHp), ly, 1, 2);
    }
    for (const m of v.monsters) {
      if (!this.visible(m.x, m.y) || (m.hp >= m.maxHp && m.type < 3)) continue;
      const look = MON_LOOK[m.type] || MON_LOOK[0];
      const boss = !!look.strip;
      const lx = Math.round(m.x / PX);
      const ly = (m.top != null ? m.top : Math.round(m.y / PX) - 14 * (look.scale || 1)) - 4;
      const w = boss ? (m.type === 9 ? 60 : 40) : 12 + (look.scale || 1) * 6;
      const h = boss ? 3 : 2;
      L.fillStyle = '#16121c';
      L.fillRect(lx - w / 2 - 1, ly - 1, w + 2, h + 2);
      L.fillStyle = boss ? '#c56bff' : m.type >= 3 ? '#c56bff' : '#ff9a4a';
      if (m.type === 9) L.fillStyle = '#ff7ef2';
      L.fillRect(lx - w / 2, ly, Math.round(w * Math.max(0, m.hp / m.maxHp)), h);
      if (boss) {
        // 30% 선
        L.fillStyle = '#ffffff';
        L.fillRect(lx - w / 2 + Math.round(w * 0.3), ly - 1, 1, h + 2);
      }
    }
  }

  // 이름표: 화면 해상도로 (한글). 증강 계열 아이콘, 보스 이름, 가까운 바닥 무기 이름
  drawNames(v) {
    const ctx = this.mainCtx;
    ctx.save();
    ctx.textAlign = 'center';
    ctx.lineJoin = 'round';
    const me = v.players.find((p) => p.me);
    for (const p of v.players) {
      if (!this.visible(p.x, p.y) || (p.flags & PF.INVIS && !p.me) || p.id <= 0) continue;
      const big = (p.r || 18) > 20 ? 2 : 1;
      const [sx, sy] = this.toScreen(p.x, p.y - (13 * big + 7) * PX);
      // 증강 계열 아이콘 (나도 표시)
      let icons = '';
      let c = p.fam || 0;
      for (let i = 0; i < 3 && c > 0; i++) {
        icons += FAM_ICONS[c % 7] || '';
        c = Math.floor(c / 7);
      }
      if (p.me) {
        if (icons) {
          ctx.font = '11px sans-serif';
          ctx.fillText(icons, sx, sy - 2);
        }
        continue;
      }
      const bounty = p.flags & PF.BOUNTY;
      const label = p.name || '';
      ctx.font = '700 12px "Noto Sans KR", sans-serif';
      ctx.lineWidth = 3;
      ctx.strokeStyle = 'rgba(10,8,16,0.85)';
      ctx.strokeText(label, sx, sy);
      ctx.fillStyle = bounty ? '#ffd54a' : (p.rar || 0) >= 3 ? RARITIES[p.rar].color : '#ffffff';
      ctx.fillText(label, sx, sy);
      const top = `${icons}${bounty ? ` 💰${p.kills}` : ''}`;
      if (top) {
        ctx.font = '800 11px "Noto Sans KR", sans-serif';
        ctx.strokeText(top, sx, sy - 14);
        ctx.fillStyle = '#ffd54a';
        ctx.fillText(top, sx, sy - 14);
      }
    }
    // 보스 이름
    for (const m of v.monsters) {
      const look = MON_LOOK[m.type];
      if (!look || !look.strip || !this.visible(m.x, m.y)) continue;
      const def = MONSTER_BY_IDX[m.type];
      const [sx, sy] = this.toScreen(m.x, ((m.top != null ? m.top : m.y / PX) - 8) * PX);
      ctx.font = '800 13px "Noto Sans KR", sans-serif';
      ctx.lineWidth = 3;
      ctx.strokeStyle = 'rgba(10,8,16,0.85)';
      ctx.strokeText(def.name, sx, sy);
      ctx.fillStyle = def.titan ? '#ff7ef2' : '#e0b8ff';
      ctx.fillText(def.name, sx, sy);
    }
    // 가까운 바닥 무기 이름
    if (me) {
      for (const g of v.items || []) {
        if ((g.x - me.x) ** 2 + (g.y - me.y) ** 2 > 260 * 260) continue;
        const [sx, sy] = this.toScreen(g.x, g.y - 50);
        ctx.font = '800 11px "Noto Sans KR", sans-serif';
        ctx.lineWidth = 3;
        ctx.strokeStyle = 'rgba(10,8,16,0.85)';
        const label = `${RARITIES[g.rarity].name} ${WEAPONS[g.type].name}`;
        ctx.strokeText(label, sx, sy);
        ctx.fillStyle = RARITIES[g.rarity].color;
        ctx.fillText(label, sx, sy);
      }
    }
    ctx.restore();
  }

  drawTexts(ctx) {
    ctx.save();
    ctx.textAlign = 'center';
    ctx.lineJoin = 'round';
    for (const t of this.texts) {
      const k = t.t / t.dur;
      const pop = k < 0.12 ? 0.7 + (k / 0.12) * 0.5 : 1.2 - Math.min(0.2, (k - 0.12) * 0.6);
      ctx.globalAlpha = k > 0.7 ? 1 - (k - 0.7) / 0.3 : 1;
      const [sx, sy] = this.toScreen(t.x, t.y);
      const num = /^[0-9+\-!]+$/.test(t.str);
      const size = Math.round(t.size * pop * (num ? 1.15 : 1));
      ctx.font = num ? `${size}px "PixelFont", monospace` : `800 ${size}px "Noto Sans KR", sans-serif`;
      if (t.stroke) {
        ctx.lineWidth = num ? 5 : 4;
        ctx.strokeStyle = 'rgba(16,10,20,0.9)';
        ctx.strokeText(t.str, sx, sy);
      }
      ctx.fillStyle = t.color;
      ctx.fillText(t.str, sx, sy);
    }
    ctx.restore();
  }

  // 화면 밖 표시: 현상금 걸린 적, 자기장 밖이면 안전지대 방향
  drawIndicators(v) {
    const ctx = this.mainCtx;
    const { w, h } = this;
    const marks = [];
    for (const b of v.bounties || []) if (b[0] !== v.meId) marks.push({ x: b[1], y: b[2], color: '#ffd54a', label: `💰${b[3]}` });
    // 체력 30% 아래로 떨어진 에픽 몬스터 (어부지리 기회)
    for (const l of v.lairs || []) if (l.state === 'fight' && l.hp > 0 && l.hp <= 30) marks.push({ x: l.x, y: l.y, color: '#d68bff', label: `에픽 ${l.hp}%` });
    const me = v.players.find((p) => p.me);
    const z = v.zone;
    if (me && z && z.active) {
      const tx = z.stage === 'warn' ? z.tx : z.x;
      const ty = z.stage === 'warn' ? z.ty : z.y;
      const tr = z.stage === 'warn' ? z.tr : z.r;
      if (Math.hypot(me.x - tx, me.y - ty) > tr - 40) marks.push({ x: tx, y: ty, color: '#ffffff', label: '안전지대', force: true });
    }
    ctx.save();
    for (const m of marks) {
      const [sx, sy] = this.toScreen(m.x, m.y);
      if (!m.force && sx > 30 && sx < w - 30 && sy > 30 && sy < h - 30) continue;
      if (m.force && sx > 60 && sx < w - 60 && sy > 60 && sy < h - 60) continue;
      const a = Math.atan2(sy - h / 2, sx - w / 2);
      const pad = 46;
      const ex = Math.max(pad, Math.min(w - pad, w / 2 + Math.cos(a) * w));
      const ey = Math.max(pad + 40, Math.min(h - pad - 110, h / 2 + Math.sin(a) * h));
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
      ctx.font = '700 12px "Noto Sans KR", sans-serif';
      ctx.textAlign = 'center';
      ctx.lineWidth = 3;
      ctx.strokeStyle = 'rgba(0,0,0,0.8)';
      const dist = Math.round(Math.hypot(m.x - (me ? me.x : this.cam.x), m.y - (me ? me.y : this.cam.y)) / 10);
      const label = `${m.label} ${dist}m`;
      ctx.strokeText(label, ex - Math.cos(a) * 24, ey - Math.sin(a) * 24 + 4);
      ctx.fillStyle = m.color;
      ctx.fillText(label, ex - Math.cos(a) * 24, ey - Math.sin(a) * 24 + 4);
    }
    ctx.restore();
  }

  // 미니맵: 바닥 그림을 줄여서 + 자기장·상자·나
  drawMinimap(mc, v, opts = {}) {
    const g = mc.getContext('2d');
    const S = mc.width;
    const R = v.map.R;
    const k = (S / 2 - 4) / (R + 120);
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, S, S);
    const gc = this.groundOf(v.map);
    g.save();
    g.beginPath();
    g.arc(S / 2, S / 2, S / 2 - 1, 0, TAU);
    g.clip();
    g.fillStyle = '#3f7cc4';
    g.fillRect(0, 0, S, S);
    if (gc) {
      g.imageSmoothingEnabled = true;
      const sz = gc.half * 2 * k;
      g.drawImage(gc.c, S / 2 - sz / 2, S / 2 - sz / 2, sz, sz);
    }
    g.translate(S / 2, S / 2);
    g.fillStyle = 'rgba(40,60,30,0.55)';
    for (const o of v.map.obstacles) {
      if (o.k === 5) continue;
      g.fillRect(o.x * k - 1, o.y * k - 1, 2, 2);
    }
    g.strokeStyle = '#4a4552';
    g.lineWidth = 2;
    for (const w of v.map.walls || []) {
      g.beginPath();
      g.moveTo(w[0] * k, w[1] * k);
      g.lineTo(w[2] * k, w[3] * k);
      g.stroke();
    }
    const z = v.zone;
    if (z && (z.active || z.stage !== 'wait')) {
      g.beginPath();
      g.rect(-S, -S, S * 2, S * 2);
      g.arc(z.x * k, z.y * k, z.r * k, 0, TAU, true);
      g.fillStyle = 'rgba(70,20,120,0.45)';
      g.fill('evenodd');
      g.beginPath();
      g.arc(z.x * k, z.y * k, z.r * k, 0, TAU);
      g.strokeStyle = '#d678ff';
      g.lineWidth = 2;
      g.stroke();
      if (z.stage === 'warn' || z.stage === 'shrink') {
        g.setLineDash([3, 3]);
        g.beginPath();
        g.arc(z.tx * k, z.ty * k, z.tr * k, 0, TAU);
        g.strokeStyle = '#ffffff';
        g.lineWidth = 1.5;
        g.stroke();
        g.setLineDash([]);
      }
    }
    for (const c of v.chests) {
      if (c.open) continue;
      g.fillStyle = c.kind === 'bounty' ? '#ff7ef2' : c.kind === 'big' ? '#ffcf4a' : '#e8d3a0';
      const s = c.kind === 'small' ? 3 : 4;
      g.fillRect(c.x * k - s / 2, c.y * k - s / 2, s, s);
    }
    if (opts.pois) {
      g.font = '700 10px "Noto Sans KR", sans-serif';
      g.textAlign = 'center';
      for (const p of v.map.pois || []) {
        // 에픽 둥지 이름은 작게 아이콘 아래에
        const dy = p.lair ? 16 : 4;
        g.font = p.lair ? '700 9px "Noto Sans KR", sans-serif' : '700 10px "Noto Sans KR", sans-serif';
        g.lineWidth = 3;
        g.strokeStyle = 'rgba(0,0,0,0.7)';
        g.strokeText(p.name, p.x * k, p.y * k + dy);
        g.fillStyle = p.lair ? '#e6c8ff' : '#fff6d8';
        g.fillText(p.name, p.x * k, p.y * k + dy);
      }
    }
    // 에픽 둥지: 잠듦(회색) / 살아 있음(보라) / 싸우는 중(깜빡임) / 처치됨(남은 시간)
    g.textAlign = 'center';
    for (const l of v.lairs || []) {
      if (l.state === 'gone') continue;
      const x = l.x * k;
      const y = l.y * k;
      const big = l.kind === 'titan';
      const fight = l.state === 'fight';
      const r = big ? 7 : 5;
      g.beginPath();
      g.arc(x, y, r + (fight ? 1.5 * Math.sin(v.time * 12) : 0), 0, TAU);
      g.fillStyle = l.state === 'sleep' || l.state === 'dead' ? 'rgba(90,80,110,0.85)' : fight ? (Math.floor(v.time * 6) % 2 ? '#ff4d6b' : '#ffffff') : big ? '#ff7ef2' : '#c56bff';
      g.fill();
      g.lineWidth = 1.5;
      g.strokeStyle = '#1a1020';
      g.stroke();
      g.font = `800 ${big ? 9 : 8}px "Noto Sans KR", sans-serif`;
      g.fillStyle = '#fff';
      g.fillText(big ? '★' : '◆', x, y + 3);
      if ((l.state === 'sleep' || l.state === 'dead') && l.t > 0 && opts.timers !== false) {
        g.font = '700 9px "Noto Sans KR", sans-serif';
        g.lineWidth = 2.5;
        g.strokeStyle = 'rgba(0,0,0,0.8)';
        const tx = `${Math.floor(l.t / 60)}:${String(l.t % 60).padStart(2, '0')}`;
        g.strokeText(tx, x, y - r - 2);
        g.fillStyle = '#e8dcff';
        g.fillText(tx, x, y - r - 2);
      }
    }
    for (const b of v.bounties || []) {
      if (b[0] === v.meId) continue;
      g.fillStyle = '#ffd54a';
      g.beginPath();
      g.arc(b[1] * k, b[2] * k, 3.5, 0, TAU);
      g.fill();
      g.strokeStyle = '#2a1a10';
      g.lineWidth = 1;
      g.stroke();
    }
    const me = v.players.find((p) => p.me);
    const mark = me || v.specTarget;
    if (mark) {
      g.save();
      g.translate(mark.x * k, mark.y * k);
      g.rotate(mark.aim || 0);
      g.fillStyle = me ? '#ffe36b' : '#9fe8ff';
      g.strokeStyle = '#1a1420';
      g.lineWidth = 1.5;
      g.beginPath();
      g.moveTo(6, 0);
      g.lineTo(-4, -4);
      g.lineTo(-2, 0);
      g.lineTo(-4, 4);
      g.closePath();
      g.fill();
      g.stroke();
      g.restore();
    }
    g.restore();
    g.beginPath();
    g.arc(S / 2, S / 2, S / 2 - 1, 0, TAU);
    g.strokeStyle = '#2a2018';
    g.lineWidth = 2;
    g.stroke();
  }
}

export { hexA };
