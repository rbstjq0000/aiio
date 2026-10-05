// 게임 화면: 스냅샷 수신, 이동 예측/보정, 보간, 이벤트 → 이펙트/사운드
import * as C from '../shared/constants.js';
import { stepBody, startDash, resolveStatic } from '../shared/physics.js';
import { NavGrid } from '../shared/nav.js';

const NAV_CACHE = new Map();
import { WEAPONS, ARMORS, BOOTS, SPELLS, RARITIES, ORBS, WEAPON_IDS, ARMOR_IDS, BOOT_IDS, KIND_IDS, SLOT_KINDS, itemDef } from '../shared/items.js';
import { MONSTER_TYPES } from '../shared/monsters.js';
import { PROJ_KINDS, AREA_KINDS, ALTAR_STATE, PF } from '../shared/sim.js';
import { COSMETIC_MAP } from '../shared/cosmetics.js';
import { play } from './audio.js';

const KIND_NAMES = ['skill', 'armor', 'boots'];

function lerpAngle(a, b, t) {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
}

function decodePlayer(a) {
  return {
    id: a[0],
    x: a[1],
    y: a[2],
    aim: a[3],
    hp: a[4],
    maxHp: a[5],
    flags: a[6],
    level: a[7],
    act: a[8],
    actT: a[9],
    w: WEAPON_IDS[a[10]],
    wr: a[11],
    armor: ARMOR_IDS[a[12]],
    boots: BOOT_IDS[a[13]],
    orbs: a[14],
    shield: a[15],
  };
}

function decodeMonster(a) {
  return { id: a[0], type: a[1], x: a[2], y: a[3], hp: a[4], maxHp: a[5], aim: a[6], state: a[7], wind: a[8], cc: a[9], slow: a[10], r: [15, 15, 26, 24, 38][a[1]] };
}

export class GameClient {
  constructor({ transport, renderer, input, hud, onEnd, onLobby, onStart, onError }) {
    this.t = transport;
    this.r = renderer;
    this.input = input;
    this.hud = hud;
    this.onEnd = onEnd;
    this.onLobby = onLobby;
    this.onStart = onStart;
    this.onError = onError;
    this.running = false;
    this.snaps = [];
    this.offset = null;
    this.me = null;
    this.ui = null;
    this.pred = null;
    this.corr = { x: 0, y: 0 };
    this.hist = [];
    this.seq = 0;
    this.acc = 0;
    this.lastFrame = 0;
    this.time = 0;
    this.ping = 0;
    this.lastSpace = 0;
    this.spaceLockT = 0;
    this.camLead = { x: 0, y: 0 };
    this.lastHp = null;
    this.roster = new Map();
    t_bind(this);
  }

  handle(m) {
    switch (m.t) {
      case 'lobby':
        if (this.onLobby) this.onLobby(m);
        break;
      case 'start':
        this.start(m);
        break;
      case 'snap':
        this.ingest(m);
        break;
      case 'end':
        this.running = false;
        if (this.onEnd) this.onEnd(m);
        break;
      case 'pong':
        this.ping = Math.round(performance.now() - m.c);
        break;
      case 'err':
        if (this.onError) this.onError(m.msg);
        break;
      default:
        break;
    }
  }

  start(m) {
    this.meId = m.you;
    this.mode = m.mode;
    const obstacles = m.map.obstacles.map((o) => ({ x: o[0], y: o[1], r: o[2], k: o[3] }));
    obstacles.walls = m.map.walls;
    this.map = {
      id: m.map.id,
      name: m.map.name,
      R: m.map.R,
      obstacles,
      walls: m.map.walls,
      decor: m.map.decor,
      altars: m.map.altars.map((a) => ({ i: a[0], x: a[1], y: a[2] })),
      camps: (m.map.camps || []).map((c) => ({ id: c[0], x: c[1], y: c[2], type: c[3] })),
      matchTime: m.map.matchTime,
    };
    this.moveTarget = null;
    this.path = null;
    this.dest = null;
    this.moveMarker = null;
    this.hitstop = 0;
    // 클릭 이동용 길찾기 격자 (맵마다 한 번)
    if (!NAV_CACHE.has(this.map.id)) NAV_CACHE.set(this.map.id, new NavGrid(this.map.R, obstacles, this.map.walls));
    this.nav = NAV_CACHE.get(this.map.id);
    this.frozenView = null;
    this.roster.clear();
    for (const r of m.roster) this.roster.set(r[0], { name: r[1], cos: r[2], bot: r[3] });
    this.snaps = [];
    this.offset = null;
    this.me = null;
    this.ui = null;
    this.pred = null;
    this.hist = [];
    this.seq = 0;
    this.input.counters = new Array(C.PRESS_N).fill(0);
    this.lastSpell = [0, 0];
    this.interactTarget = 0;
    this.input.onMoveClick = (sx, sy) => this.moveClick(sx, sy);
    this.running = true;
    this.lastFrame = performance.now();
    this.acc = 0;
    this.lastHp = null;
    this.hud.reset(this);
    if (this.onStart) this.onStart(m);
    requestAnimationFrame(this.frame);
    this.pingTimer = setInterval(() => this.t.send({ t: 'ping', c: performance.now() }), 2000);
  }

  stop() {
    this.running = false;
    clearInterval(this.pingTimer);
  }

  serverNow() {
    return performance.now() / 1000 + (this.offset || 0);
  }

  ingest(s) {
    const now = performance.now() / 1000;
    const est = s.tm - now;
    // 시계 동기화: 가장 빨리 도착한 패킷 기준으로 천천히 따라감
    if (this.offset == null || est > this.offset) this.offset = est;
    else this.offset = this.offset * 0.995 + est * 0.005;
    const snap = {
      tm: s.tm,
      pl: new Map(s.pl.map((a) => [a[0], decodePlayer(a)])),
      mo: new Map(s.mo.map((a) => [a[0], decodeMonster(a)])),
      pr: s.pr,
      ar: s.ar,
      so: s.so,
      it: s.it,
      ch: s.ch,
      al: s.al,
      go: s.go,
      ca: s.ca,
      sc: s.sc,
      z: s.z,
    };
    this.snaps.push(snap);
    if (this.snaps.length > 40) this.snaps.shift();
    this.latest = snap;
    if (s.me) {
      this.me = s.me;
      if (s.me.ui) this.ui = s.me.ui;
      this.reconcile(s.me);
    }
    for (const e of s.ev) this.onEvent(e);
  }

  // 서버 위치 + 아직 확인 안 된 내 입력을 다시 적용 → 예측 위치
  reconcile(me) {
    if (!me.al) {
      this.pred = null;
      this.hist.length = 0;
      return;
    }
    const base = { x: me.x, y: me.y, r: C.PLAYER_R, kbx: me.kbx, kby: me.kby, dashT: me.dt, dashSpd: me.ds, ddx: me.ddx, ddy: me.ddy };
    while (this.hist.length && this.hist[0].seq <= me.ack) this.hist.shift();
    for (const h of this.hist) {
      if (h.sp) this.applyBlink(base, h.sp);
      stepBody(base, h.mx, h.my, h.speed, C.DT, this.map.obstacles, this.map.R);
    }
    if (this.pred) {
      const dx = this.pred.x - base.x;
      const dy = this.pred.y - base.y;
      if (dx * dx + dy * dy < 300 * 300) {
        this.corr.x += dx;
        this.corr.y += dy;
      } else {
        this.corr.x = 0;
        this.corr.y = 0;
      }
    }
    this.pred = base;
  }

  // 점멸 예측 (서버와 같은 규칙)
  applyBlink(b, sp) {
    b.x += sp.dx * sp.dist;
    b.y += sp.dy * sp.dist;
    b.kbx = 0;
    b.kby = 0;
    b.dashT = 0;
    resolveStatic(b, this.map.obstacles, this.map.R);
  }

  mouseWorld(sx = this.input.mouseX, sy = this.input.mouseY) {
    const r = this.r;
    return [r.cam.x + (sx - r.w / 2) / r.zoom, r.cam.y + (sy - r.h / 2) / r.zoom];
  }

  // 좌클릭: 상자/장비 위면 가서 열기·줍기, 아니면 그 지점으로 이동
  moveClick(sx, sy) {
    const [wx, wy] = this.mouseWorld(sx, sy);
    const s = this.latest;
    let target = null;
    if (s) {
      let bd = 45 * 45;
      for (const g of s.it) {
        const d = (g[4] - wx) ** 2 + (g[5] - wy) ** 2;
        if (d < bd) {
          bd = d;
          target = { id: g[0], x: g[4], y: g[5] };
        }
      }
      for (const c of s.ch) {
        if (c[3]) continue;
        const d = (c[1] - wx) ** 2 + (c[2] - wy) ** 2;
        if (d < bd) {
          bd = d;
          target = { id: c[0], x: c[1], y: c[2] };
        }
      }
    }
    if (target) {
      this.setDest(target.x, target.y);
      this.interactTarget = target.id;
      this.input.counters[C.PRESS.act]++;
      this.moveMarker = { x: target.x, y: target.y, t: 0, interact: true };
    } else {
      this.setDest(wx, wy);
      this.interactTarget = 0;
      this.moveMarker = { x: wx, y: wy, t: 0 };
    }
  }

  // 이동 목적지: 벽이 가로막으면 길찾기로 돌아가는 경로를 만듦 (롤처럼)
  setDest(x, y) {
    const px = this.pred ? this.pred.x : this.me ? this.me.x : 0;
    const py = this.pred ? this.pred.y : this.me ? this.me.y : 0;
    this.dest = [x, y];
    this.path = null;
    if (this.nav && !this.nav.clearLine(px, py, x, y)) {
      const p = this.nav.find(px, py, x, y);
      if (p && p.length) this.path = p;
    }
    this.moveTarget = this.path ? this.path[0] : [x, y];
  }

  // 30Hz 고정: 입력 전송 + 내 이동 예측
  inputTick() {
    const [wx, wy] = this.mouseWorld();
    const me = this.me;
    const px = this.pred ? this.pred.x : me ? me.x : 0;
    const py = this.pred ? this.pred.y : me ? me.y : 0;
    // 좌클릭을 누르고 있으면 계속 커서를 따라감 (경로는 0.2초마다 다시 계산)
    if (this.input.moveHeld) {
      const moved = !this.dest || Math.hypot(this.dest[0] - wx, this.dest[1] - wy) > 30;
      if (moved && (this.repathT || 0) <= 0) {
        this.setDest(wx, wy);
        this.repathT = 0.2;
      }
    }
    if (this.repathT > 0) this.repathT -= C.DT;
    // 경로 중간 지점에 닿았거나 다음 지점이 바로 보이면 다음으로
    if (this.path && this.path.length > 1) {
      const [ax, ay] = this.path[0];
      const [bx, by] = this.path[1];
      if (Math.hypot(ax - px, ay - py) < 22 || (this.nav && this.nav.clearLine(px, py, bx, by))) {
        this.path.shift();
        this.moveTarget = this.path[0];
      }
    }
    if (this.input.stopPressed) {
      this.moveTarget = null;
      this.path = null;
      this.input.stopPressed = false;
    }
    let mx = 0;
    let my = 0;
    if (this.moveTarget) {
      const dx = this.moveTarget[0] - px;
      const dy = this.moveTarget[1] - py;
      const d = Math.hypot(dx, dy);
      const stopAt = this.interactTarget ? 40 : 6;
      if (d > stopAt) {
        mx = dx / d;
        my = dy / d;
        // 한 틱에 지나칠 거리면 속도를 줄여 정확히 멈춤
        const step = (me ? me.ms : 250) * C.DT;
        if (d < step) {
          mx *= d / step;
          my *= d / step;
        }
      } else if (this.path && this.path.length > 1) {
        this.path.shift();
        this.moveTarget = this.path[0];
      } else {
        this.moveTarget = null;
        this.path = null;
      }
    }
    const aim = Math.atan2(wy - py, wx - px);
    this.aim = aim;
    this.seq++;
    const p = this.input.counters.slice();
    this.t.send({ t: 'in', s: this.seq, mx: Math.round(mx * 1000) / 1000, my: Math.round(my * 1000) / 1000, a: Math.round(aim * 1000) / 1000, k: this.input.atkHeld, cx: Math.round(wx), cy: Math.round(wy), ti: this.interactTarget, p });
    if (!me || !me.al || !this.pred || !this.ui) return;
    let speed = me.ms;
    const w = WEAPONS[this.ui.gear.weapon.type];
    if (this.input.atkHeld) speed *= w.basic.moveMult;
    if (me.chn >= 0) speed = 0;
    // 점멸만 즉시 예측 (나머지 이동기는 서버 결과로 보정)
    let sp = null;
    for (let i = 0; i < 2; i++) {
      const idx = i === 0 ? C.PRESS.d : C.PRESS.f;
      if (p[idx] > this.lastSpell[i]) {
        this.lastSpell[i] = p[idx];
        const spell = SPELLS[this.ui.spells[i]];
        if (spell.type === 'blink' && me.cd[3 + i] <= 0 && me.st === 0) {
          const dx = wx - this.pred.x;
          const dy = wy - this.pred.y;
          const len = Math.hypot(dx, dy) || 1;
          sp = { dx: dx / len, dy: dy / len, dist: Math.min(spell.dist, len) };
          this.applyBlink(this.pred, sp);
          this.moveTarget = null;
          this.path = null;
        }
      }
    }
    stepBody(this.pred, mx, my, speed, C.DT, this.map.obstacles, this.map.R);
    this.hist.push({ seq: this.seq, mx, my, speed, sp });
    if (this.hist.length > 90) this.hist.shift();
  }

  frame(now) {
    if (!this.running) return;
    const dt = Math.min(0.1, (now - this.lastFrame) / 1000);
    this.lastFrame = now;
    this.time += dt;
    this.acc += dt;
    while (this.acc >= C.DT) {
      this.acc -= C.DT;
      this.inputTick();
    }
    const k = Math.exp(-12 * dt);
    this.corr.x *= k;
    this.corr.y *= k;
    if (this.latest) {
      // 히트스톱: 타격 순간 화면을 아주 잠깐 멈춰 손맛을 줌
      if (this.hitstop > 0 && this.frozenView) {
        this.hitstop -= dt;
        this.r.draw(this.frozenView, dt * 0.08);
      } else {
        const v = this.buildView(dt);
        this.frozenView = v;
        this.r.draw(v, dt);
        this.hud.update(this, v, dt);
      }
    }
    requestAnimationFrame(this.frame);
  }

  buildView(dt) {
    const rt = this.serverNow() - C.INTERP_DELAY;
    const snaps = this.snaps;
    let s0 = snaps[0];
    let s1 = snaps[snaps.length - 1];
    for (let i = snaps.length - 1; i > 0; i--) {
      if (snaps[i - 1].tm <= rt) {
        s0 = snaps[i - 1];
        s1 = snaps[i];
        break;
      }
    }
    const span = s1.tm - s0.tm;
    const k = span > 0 ? Math.max(0, Math.min(1, (rt - s0.tm) / span)) : 1;
    const latest = this.latest;
    const players = [];
    for (const [id, b] of s1.pl) {
      const a = s0.pl.get(id) || b;
      const info = this.roster.get(id) || { name: '?', cos: {} };
      const p = { ...b, x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k, aim: lerpAngle(a.aim, b.aim, k), name: info.name, cos: info.cos, me: id === this.meId, vx: span > 0 ? (b.x - a.x) / span : 0, vy: span > 0 ? (b.y - a.y) / span : 0 };
      if (p.me) {
        const lp = latest.pl.get(id) || b;
        Object.assign(p, lp);
        p.me = true;
        p.name = info.name;
        p.cos = info.cos;
        if (this.pred) {
          const nx = this.pred.x + this.corr.x;
          const ny = this.pred.y + this.corr.y;
          if (this.lastMe && dt > 0) {
            p.vx = (nx - this.lastMe[0]) / dt;
            p.vy = (ny - this.lastMe[1]) / dt;
          }
          this.lastMe = [nx, ny];
          p.x = nx;
          p.y = ny;
        }
        p.aim = this.aim ?? p.aim;
        p.orbIds = this.me ? this.me.ob : null;
      }
      players.push(p);
    }
    // 내가 최신 스냅샷에만 있는 경우 (방금 부활 등)
    if (this.me && this.me.al && !players.some((p) => p.me)) {
      const lp = latest.pl.get(this.meId);
      if (lp && this.pred) {
        const info = this.roster.get(this.meId);
        players.push({ ...lp, x: this.pred.x, y: this.pred.y, me: true, name: info.name, cos: info.cos, aim: this.aim ?? lp.aim });
      }
    }
    const monsters = [];
    for (const [id, b] of s1.mo) {
      const a = s0.mo.get(id) || b;
      monsters.push({ ...b, x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k, aim: lerpAngle(a.aim, b.aim, k) });
    }
    const dtp = rt - s1.tm;
    const myTeamOwner = this.meId;
    const projs = s1.pr.map((q) => ({
      id: q[0],
      kind: PROJ_KINDS[q[1]],
      x: q[2] + q[4] * dtp,
      y: q[3] + q[5] * dtp,
      vx: q[4],
      vy: q[5],
      color: q[6] >= 0 ? WEAPONS[WEAPON_IDS[q[6]]].color : '',
      enemy: q[7] !== myTeamOwner,
    }));
    const snow = this.serverNow();
    const areas = latest.ar.map((a) => ({
      id: a[0],
      kind: AREA_KINDS[a[1]],
      x: a[2],
      y: a[3],
      r: a[4],
      t: a[5] / 100 + Math.max(0, snow - latest.tm - C.INTERP_DELAY),
      delay: a[6] / 100,
      dur: a[7] / 100,
      color: a[8] >= 0 ? WEAPONS[WEAPON_IDS[a[8]]].color : '#ff3d4f',
      enemy: a[9] !== myTeamOwner,
      ang: a[10],
      len: a[11],
      width: a[12],
      outer: a[14] || 0,
      ticks: AREA_KINDS[a[1]] === 'ground' ? 2 : 1,
    }));
    const souls = latest.so.map((o) => ({ id: o[0], x: o[1], y: o[2], v: o[3] }));
    const items = latest.it.map((g) => {
      const kind = KIND_NAMES[g[1]];
      const type = KIND_IDS[kind][g[2]];
      const def = itemDef({ kind, type });
      return { id: g[0], kind, type, rarity: g[3], x: g[4], y: g[5], icon: def.icon, name: def.name };
    });
    const chests = latest.ch.map((c) => ({ id: c[0], x: c[1], y: c[2], open: !!c[3] }));
    const altars = this.map.altars.map((al) => {
      const st = latest.al.find((q) => q[0] === al.i);
      return { ...al, state: ALTAR_STATE[st ? st[1] : 0], ghp: st ? st[2] : 0 };
    });
    const groundOrbs = latest.go.map((o) => ({ i: o[0], x: o[1], y: o[2] }));
    const carriers = latest.ca.map((c) => ({ id: c[0], x: c[1], y: c[2], n: c[3], ritual: c[4] >= 0 ? c[4] : 0 }));
    const z = latest.z;
    const zone = { active: !!z[0], x: z[1], y: z[2], r: z[3], tx: z[4], ty: z[5], tr: z[6] };
    // 카메라: 내 위치(또는 관전 대상) + 마우스 방향으로 살짝
    let cx;
    let cy;
    const meP = players.find((p) => p.me);
    if (meP) {
      cx = meP.x;
      cy = meP.y;
      const [wx, wy] = [this.input.mouseX - this.r.w / 2, this.input.mouseY - this.r.h / 2];
      const tx = Math.max(-1, Math.min(1, wx / (this.r.w / 2))) * 110;
      const ty = Math.max(-1, Math.min(1, wy / (this.r.h / 2))) * 80;
      const kk = 1 - Math.exp(-6 * dt);
      this.camLead.x += (tx - this.camLead.x) * kk;
      this.camLead.y += (ty - this.camLead.y) * kk;
      cx += this.camLead.x;
      cy += this.camLead.y;
    } else {
      const spec = this.me && this.me.sp ? players.find((p) => p.id === this.me.sp) : null;
      cx = spec ? spec.x : this.r.cam.x;
      cy = spec ? spec.y : this.r.cam.y;
    }
    return {
      time: this.time,
      cam: { x: cx, y: cy },
      map: this.map,
      zone,
      players,
      monsters,
      projs,
      areas,
      souls,
      items,
      chests,
      altars,
      groundOrbs,
      carriers,
      meId: this.meId,
      walls: this.map.walls,
      camps: this.map.camps,
      moveMarker: this.moveMarker,
      eye: meP ? { x: meP.x, y: meP.y } : { x: cx, y: cy },
      serverTime: latest.tm,
      scores: latest.sc,
    };
  }

  // ---------------- 이벤트 → 이펙트 / 사운드 ----------------
  vol(x, y) {
    if (x === undefined) return 1;
    const d = Math.hypot(x - this.r.cam.x, y - this.r.cam.y);
    return Math.max(0, 1 - d / 1100);
  }

  nameOf(id) {
    const r = this.roster.get(id);
    return r ? r.name : '';
  }

  cosOf(id) {
    const r = this.roster.get(id);
    return r ? r.cos : {};
  }

  onEvent(e) {
    const R = this.r;
    const isMe = e.id === this.meId;
    switch (e.e) {
      case 'hit': {
        R.hitFlash(e.id);
        const src = e.s ? this.findPlayer(e.s) || (this.latest && this.latest.mo.get(e.s)) : null;
        if (src) R.recoil(e.id, e.x - src.x, e.y - src.y, e.b ? 12 : 7);
        if ((e.s === this.meId || e.id === this.meId) && e.k !== 3 && e.k !== 6) this.hitstop = Math.max(this.hitstop, e.b ? 0.09 : e.a >= 100 ? 0.06 : 0.04);
        const toMe = e.id === this.meId;
        const byMe = e.s === this.meId;
        let color = '#d8d8e0';
        let size = 13;
        if (toMe) {
          color = '#ff4d5e';
          size = 15;
        } else if (byMe) {
          color = e.k === 2 ? '#ffd45a' : e.k === 1 ? '#ffb070' : e.k === 3 ? '#c99bff' : '#ffffff';
          size = e.b ? 26 : e.k === 3 ? 13 : 17;
        } else if (e.k === 3) size = 11;
        if (toMe || byMe || e.a >= 40) R.text(e.x, e.y - 24, String(e.a), color, size, e.b ? 1.1 : 0.75);
        if (e.k !== 3 && e.k !== 6) R.burst(e.x, e.y, e.k === 2 ? '#ffd45a' : '#ffffff', e.b ? 18 : 6, e.b ? 420 : 260, e.b ? 5 : 3, 0.3);
        if (toMe) {
          if (e.k !== 3 && e.k !== 6) play('hurt', 0.9);
          R.shake(e.a > 150 ? 12 : 6);
        } else if (byMe) {
          if (e.k !== 3) play(e.b || e.a > 120 ? 'hitBig' : 'hit', 0.9);
          if (e.b) R.shake(9);
        } else if (e.k !== 3) play('hit', this.vol(e.x, e.y) * 0.4);
        break;
      }
      case 'swing': {
        const p = this.findPlayer(e.id);
        const w = p ? p.w : 'greatsword';
        const wd = WEAPONS[w];
        const c = wd.basic.combo ? wd.basic.combo[e.s % wd.basic.combo.length] : null;
        const sl = COSMETIC_MAP[this.cosOf(e.id).slash] || COSMETIC_MAP.slash_default;
        if (c) R.slash(e.x, e.y, e.a, Math.min(c.arc, 2.8), c.range + 14, sl.color, sl.color2, e.s);
        play(w === 'daggers' ? 'stab' : e.s === 2 ? 'heavy' : 'swing', this.vol(e.x, e.y) * (isMe ? 1 : 0.6));
        break;
      }
      case 'skill': {
        const v = this.vol(e.x, e.y) * (isMe ? 1 : 0.6);
        const w = WEAPONS[e.w];
        const sk = w[e.k];
        if (e.k === 'r') {
          play('ult', v);
          R.ring(e.x, e.y, 10, 90, w.color, 0.4, 6);
          if (isMe) R.text(e.x, e.y - 50, sk.name, '#ffd45a', 22, 1);
        } else if (sk.type === 'dashstrike' || sk.type === 'leap') play('dash', v);
        else if (e.w === 'firestaff') play('fire', v);
        else if (e.w === 'froststaff') play('ice', v);
        else if (e.w === 'longbow') play('shoot', v);
        else play('swing', v);
        if (sk.type === 'spin') R.ring(e.x, e.y, 30, sk.r, w.color, 0.6, 10);
        if (sk.type === 'dashstrike') R.beam(e.x, e.y, e.x + Math.cos(e.a) * sk.dist, e.y + Math.sin(e.a) * sk.dist, w.color, 10, 0.25);
        break;
      }
      case 'cone':
        R.cone(e.x, e.y, e.a, e.arc, e.r, WEAPONS[e.w].color);
        break;
      case 'nova':
        R.ring(e.x, e.y, 20, e.r, WEAPONS[e.w].color, 0.35, 10);
        R.burst(e.x, e.y, WEAPONS[e.w].color, 16, 380, 4, 0.4);
        play('heavy', this.vol(e.x, e.y));
        break;
      case 'areafx': {
        const col = e.w ? WEAPONS[e.w].color : '#ff3d4f';
        const v = this.vol(e.x, e.y);
        if (e.k === 'line') {
          R.beam(e.x, e.y, e.x + Math.cos(e.a) * e.l, e.y + Math.sin(e.a) * e.l, col, 34, 0.45);
          R.shake(10 * v);
          play('boom', v);
        } else if (e.k === 'ring' && e.w !== 'froststaff') {
          // 회오리 도끼: 바깥 고리가 핵심이라 고리 두 겹으로
          R.ring(e.x, e.y, e.r * 0.55, e.r, col, 0.35, 16);
          R.ring(e.x, e.y, 20, e.r * 0.62, '#ffffff', 0.25, 4);
          R.burst(e.x, e.y, col, 22, 420, 5, 0.45);
          play('heavy', v);
          R.shake(6 * v);
        } else if (e.k === 'ring') {
          R.ring(e.x, e.y, 30, e.r, '#c8f4ff', 0.4, 14);
          R.burst(e.x, e.y, '#e6fbff', 22, 380, 4, 0.5, { shape: 'star' });
          play('ice', v);
        } else if (e.k === 'flag') {
          R.ring(e.x, e.y, 10, e.r, col, 0.35, 8);
          R.burst(e.x, e.y, col, 14, 260, 4, 0.4);
          play('heavy', v * 0.7);
        } else if (e.k === 'slam') {
          R.ring(e.x, e.y, 20, e.r, '#ff6b5a', 0.35, 10);
          R.burst(e.x, e.y, '#ff8a5a', 14, 300, 5, 0.4);
          play('boom', v * 0.6);
          R.shake(5 * v);
        } else {
          const big = e.r >= 150;
          R.ring(e.x, e.y, 10, e.r, col, 0.4, big ? 18 : 10);
          R.burst(e.x, e.y, col, big ? 40 : 18, big ? 520 : 320, big ? 7 : 5, 0.6);
          R.burst(e.x, e.y, '#ffffff', 8, 200, 4, 0.3);
          play(big ? 'boom' : e.w === 'longbow' ? 'shoot' : 'fire', v);
          R.shake((big ? 14 : 6) * v);
        }
        break;
      }
      case 'dash': {
        const tr = COSMETIC_MAP[this.cosOf(e.id).trail] || COSMETIC_MAP.trail_none;
        this.trail(e.x, e.y, e.dx, e.dy, 220, tr);
        play('dash', this.vol(e.x, e.y) * (isMe ? 1 : 0.5));
        break;
      }
      case 'empower':
        R.ring(e.x, e.y, 10, 60, '#ff6b3d', 0.3, 6);
        R.burst(e.x, e.y, '#ffb070', 12, 220, 4, 0.4);
        play('shield', this.vol(e.x, e.y) * 0.8);
        break;
      case 'empowerhit':
        R.slash(e.x, e.y, e.a, 2.6, 130, '#ff6b3d', '#ffe0b0', 2);
        R.shake(isMe ? 9 : 4);
        play('hitBig', this.vol(e.x, e.y));
        break;
      case 'execute':
        R.text(e.x, e.y - 56, '처형!', '#ff3d6b', 22, 1.1);
        R.burst(e.x, e.y, '#ff3d6b', 30, 420, 6, 0.6);
        R.shake(12 * this.vol(e.x, e.y));
        break;
      case 'flagdash':
        R.ring(e.x, e.y, 20, 140, '#ffe066', 0.35, 10);
        play('dash', this.vol(e.x, e.y));
        break;
      case 'blink':
        R.burst(e.x, e.y, '#b28cff', 16, 240, 4, 0.4);
        R.burst(e.x2, e.y2, '#e0c8ff', 16, 240, 4, 0.4);
        R.beam(e.x, e.y, e.x2, e.y2, '#b28cff', 4, 0.2);
        play('blink', this.vol(e.x, e.y));
        break;
      case 'sprint':
        R.burst(e.x, e.y, '#ffd45a', 12, 200, 3, 0.4);
        play('dash', this.vol(e.x, e.y) * 0.6);
        break;
      case 'armor':
        if (e.k === 'purify') R.ring(e.x, e.y, 10, 70, '#ffffff', 0.4, 8);
        else if (e.k === 'shadow') R.burst(e.x, e.y, '#6b5a8a', 24, 160, 7, 0.6, { glow: false });
        else R.ring(e.x, e.y, 30, 40, '#ffd678', 0.4, 6);
        play('shield', this.vol(e.x, e.y));
        break;
      case 'stun':
      case 'root':
      case 'freeze':
        R.text(e.x, e.y - 46, e.e === 'stun' ? '기절' : e.e === 'root' ? '속박' : '빙결', e.e === 'stun' ? '#ffe14d' : '#9fe8ff', 14, 0.8);
        if (e.e === 'freeze') R.burst(e.x, e.y, '#e6fbff', 14, 160, 4, 0.5, { shape: 'star' });
        play('stun', this.vol(e.x, e.y) * 0.8);
        break;
      case 'immune':
        if (isMe || this.vol(e.x, e.y) > 0.6) R.text(e.x, e.y - 46, '면역', '#bbbbbb', 12, 0.6);
        break;
      case 'iframe':
        if (isMe) R.text(e.x, e.y - 40, '회피!', '#7fe7ff', 15, 0.6);
        break;
      case 'shieldhit':
        R.ring(e.x, e.y, 18, 26, '#bfefff', 0.2, 3);
        break;
      case 'interrupt':
        if (isMe) R.text(e.x, e.y - 46, '중단됨', '#ffb070', 14, 0.7);
        break;
      case 'reveal':
        R.burst(e.x, e.y, '#6b5a8a', 12, 120, 6, 0.5, { glow: false });
        break;
      case 'phit':
        R.burst(e.x, e.y, '#ffe9c8', 5, 160, 2.5, 0.25);
        break;
      case 'death': {
        const fx = COSMETIC_MAP[e.fx] || COSMETIC_MAP.kill_soul;
        this.killFx(e.x, e.y, fx);
        if (isMe) {
          play('death', 1);
          R.shake(16);
        }
        break;
      }
      case 'kill':
        this.hud.killfeed(this, e);
        if (e.k === this.meId) {
          this.hitstop = 0.14;
          play('kill', 1);
          if (e.m >= 2) this.hud.announce(e.m === 2 ? '더블 킬!' : e.m === 3 ? '트리플 킬!' : '학살!', '#ff6b5a', 1.5);
        }
        break;
      case 'mdeath': {
        const col = ['#6fd6c0', '#e8e0cc', '#ff6b5a', '#b18cff', '#ffe9a8'][e.t];
        R.burst(e.x, e.y, col, e.t >= 3 ? 40 : 12, e.t >= 3 ? 420 : 220, e.t >= 3 ? 6 : 4, 0.6);
        if (e.t >= 3) R.ring(e.x, e.y, 10, 160, col, 0.6, 10);
        break;
      }
      case 'lvl':
        R.ring(e.x, e.y, 10, 80, '#ffe9a8', 0.6, 6);
        if (isMe) {
          R.text(e.x, e.y - 60, `레벨 ${e.l}`, '#ffe9a8', 22, 1.2);
          R.pillar(e.x, e.y, '#ffe9a8', 0.8, 40);
          play('level', 1);
        }
        break;
      case 'soul':
        play('soul', 0.6);
        break;
      case 'heal':
        if (isMe && e.a >= 20) R.text(e.x, e.y - 30, `+${e.a}`, '#4cff8f', 14, 0.8);
        break;
      case 'chest':
        R.burst(e.x, e.y, RARITIES[e.r].color, 26, 320, 5, 0.6);
        R.pillar(e.x, e.y, RARITIES[e.r].color, 0.7, 34);
        play('chest', this.vol(e.x, e.y));
        break;
      case 'equip':
        if (isMe) {
          play('pickup', 1);
          if (e.s) R.text(e.x, e.y - 50, `${e.s.toUpperCase()} ${RARITIES[e.r].name} 등급!`, RARITIES[e.r].color, 18, 1.2);
        }
        R.burst(e.x, e.y, RARITIES[e.r].color, 10, 160, 4, 0.4);
        break;
      case 'setbonus':
        if (isMe) {
          this.hud.announce(`세트 효과! R 스킬이 ${RARITIES[e.r].name} 등급으로`, RARITIES[e.r].color, 2.5);
          R.pillar(e.x, e.y, RARITIES[e.r].color, 1, 60);
          play('orb', 1);
        }
        break;
      case 'demote':
        this.hud.announce(`${e.s.toUpperCase()} 스킬이 ${RARITIES[e.r].name} 등급으로 강등`, '#ff6b5a', 2.5);
        break;
      case 'equipfail':
        this.hud.announce('이미 같거나 더 높은 등급입니다', '#aaaaaa', 1.2);
        break;
      case 'spell': {
        const v = this.vol(e.x, e.y);
        if (e.k === 'purify') R.ring(e.x, e.y, 10, 70, '#ffffff', 0.4, 8);
        else if (e.k === 'shadow') R.burst(e.x, e.y, '#6b5a8a', 24, 160, 7, 0.6, { glow: false });
        else if (e.k === 'bulwark') R.ring(e.x, e.y, 30, 40, '#ffd678', 0.4, 6);
        play(e.k === 'blink' ? 'blink' : e.k === 'sprint' ? 'dash' : 'shield', v);
        break;
      }
      case 'respawn':
        R.pillar(e.x, e.y, '#bfe9ff', 0.8, 44);
        if (isMe) {
          this.pred = null;
          this.corr.x = this.corr.y = 0;
        }
        break;
      case 'orbwarn':
        this.hud.announce(`${ORBS[e.i].name}가 30초 뒤 나타납니다`, ORBS[e.i].color, 3);
        play('horn', 0.8);
        break;
      case 'orbspawn':
        this.hud.announce(`${ORBS[e.i].name} 수호자 등장!`, ORBS[e.i].color, 3);
        play('horn', 1);
        break;
      case 'orbtake':
        this.hud.announce(e.id === this.meId ? `${ORBS[e.i].name} 획득! (${e.n}/3)` : `${this.nameOf(e.id)}: ${ORBS[e.i].name} 획득 (${e.n}/3)`, ORBS[e.i].color, 2.2);
        if (e.id === this.meId) play('orb', 1);
        break;
      case 'orbdrop':
        this.hud.announce(`${ORBS[e.i].name}가 떨어졌습니다!`, ORBS[e.i].color, 1.8);
        break;
      case 'ritual':
        this.hud.announce(e.id === this.meId ? '승천 의식 시작! 15초를 버티세요!' : `${this.nameOf(e.id)} 승천 의식 시작! 막아야 합니다!`, '#ffe9a8', 4);
        play('alarm', 1);
        break;
      case 'ritualfail':
        this.hud.announce('승천 저지!', '#ff6b5a', 2);
        break;
      case 'zone':
        this.hud.announce('스틱스 강이 범람합니다!', '#ff3355', 3);
        play('horn', 1);
        break;
      default:
        break;
    }
  }

  findPlayer(id) {
    const s = this.latest;
    return s ? s.pl.get(id) : null;
  }

  trail(x, y, dx, dy, dist, tr) {
    const R = this.r;
    const n = 7;
    for (let i = 0; i < n; i++) {
      const k = i / (n - 1);
      const px = x + dx * dist * k;
      const py = y + dy * dist * k;
      let color = tr.color;
      let shape = 'dot';
      if (tr.style === 'rainbow') color = ['#ff4d4d', '#ffb340', '#ffe14d', '#5fd35f', '#4da3ff', '#c56bff'][i % 6];
      if (tr.style === 'petal') shape = 'petal';
      if (tr.style === 'star') shape = 'star';
      R.burst(px, py, color, tr.style === 'ghost' ? 2 : 4, 60, tr.style === 'ghost' ? 10 : 6, 0.45, { shape, drag: 2, glow: shape === 'dot' });
    }
    if (tr.style === 'spark') R.beam(x, y, x + dx * dist, y + dy * dist, tr.color, 3, 0.2);
  }

  killFx(x, y, fx) {
    const R = this.r;
    switch (fx.style) {
      case 'thunder':
        R.beam(x + 40, y - 600, x, y, '#ffe14d', 14, 0.35);
        R.burst(x, y, '#ffe14d', 30, 420, 5, 0.6);
        break;
      case 'fireworks':
        for (const c of ['#ff7ad9', '#ffe14d', '#5ae1ff']) R.burst(x + (Math.random() - 0.5) * 60, y - 30 + (Math.random() - 0.5) * 60, c, 20, 360, 4, 0.9, { grav: 200 });
        break;
      case 'bloom':
        R.burst(x, y, '#ff9ccf', 30, 260, 7, 1.0, { shape: 'petal', drag: 1.5, glow: false });
        break;
      case 'blackhole':
        R.ring(x, y, 140, 0, '#a259ff', 0.6, 12);
        R.burst(x, y, '#a259ff', 24, 120, 5, 0.8);
        break;
      default:
        R.pillar(x, y, '#bfe9ff', 0.9, 40);
        R.burst(x, y, '#bfe9ff', 26, 300, 5, 0.7);
    }
  }
}

function t_bind(self) {
  self.frame = self.frame.bind(self);
}

export { SLOT_KINDS, ARMORS, BOOTS };
