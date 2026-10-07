// 게임 화면: 스냅샷 수신, 이동 예측/보정, 보간, 이벤트 → 이펙트
import * as C from '../shared/constants.js';
import { stepBody, startDash } from '../shared/physics.js';
import { NavGrid } from '../shared/nav.js';
import { WEAPONS, WEAPON_IDS, RARITIES } from '../shared/items.js';
import { AUG_BY_ID, AUG_TIERS, FAMILY_BY_ID } from '../shared/augments.js';
import { MONSTERS } from '../shared/monsters.js';
import { PROJ_KINDS, AREA_KINDS, PF, CHEST_KINDS, ZONE_STAGE, LAIR_STATE } from '../shared/sim.js';
import { COSMETIC_MAP } from '../shared/cosmetics.js';

const NAV_CACHE = new Map();
// 대상을 찍어 쓰는 스킬 (사거리 밖이면 걸어가서 사용)
const TARGETED = new Set(['execute', 'mark', 'conflag', 'bounce']);
const ATTACK_CURSOR = `url("data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="28" height="28"><path d="M3 3 L17 17 M17 13 L13 17 M15 19 L19 15 M18 18 L24 24" stroke="#ff3d4f" stroke-width="3" stroke-linecap="round"/><path d="M3 3 L17 17" stroke="#fff" stroke-width="1"/></svg>')}") 3 3, crosshair`;

function lerpAngle(a, b, t) {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
}

// [id,x,y,aim,hp,maxHp,flags,augCount,act,actT,weaponIdx,kills,r,famCode,rarity,shield]
function decodePlayer(a) {
  return {
    id: a[0],
    x: a[1],
    y: a[2],
    aim: a[3],
    hp: a[4],
    maxHp: a[5],
    flags: a[6],
    augN: a[7],
    act: a[8],
    actT: a[9],
    w: WEAPON_IDS[a[10]] || 'greatsword',
    kills: a[11],
    r: a[12],
    fam: a[13],
    rar: a[14],
    shield: a[15],
  };
}

function decodeMonster(a) {
  return { id: a[0], type: a[1], x: a[2], y: a[3], hp: a[4], maxHp: a[5], aim: a[6], state: a[7], wind: a[8], cc: a[9], slow: a[10], r: [15, 15, 26, 24, 38][a[1]] };
}

export class GameClient {
  constructor({ transport, renderer, input, hud, onEnd, onLobby, onStart, onError, onDeath }) {
    this.t = transport;
    this.r = renderer;
    this.input = input;
    this.hud = hud;
    this.onEnd = onEnd;
    this.onLobby = onLobby;
    this.onStart = onStart;
    this.onError = onError;
    this.onDeath = onDeath;
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
    this.camLead = { x: 0, y: 0 };
    this.roster = new Map();
    this.frame = this.frame.bind(this);
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
        if (m.st === 'landing' || m.st === 'waiting') this.landingSnap(m);
        else this.ingest(m);
        break;
      case 'end':
        this.ended = m;
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
      bushes: (m.map.bushes || []).map((b) => ({ x: b[0], y: b[1], r: b[2] })),
      pois: m.map.pois || [],
      decor: m.map.decor,
      camps: (m.map.camps || []).map((c) => ({ id: c[0], x: c[1], y: c[2], type: c[3] })),
      lairs: (m.map.lairs || []).map((l) => ({ id: l[0], x: l[1], y: l[2], kind: l[3], boss: l[4], bossIdx: MONSTERS[l[4]].idx, state: 'sleep', hp: 0, t: l[3] === 'titan' ? C.TITAN_WAKE : C.EPIC_WAKE })),
      matchTime: m.map.matchTime,
    };
    this.moveTarget = null;
    this.path = null;
    this.dest = null;
    this.moveMarker = null;
    this.hitstop = 0;
    if (!NAV_CACHE.has(this.map.id)) NAV_CACHE.set(this.map.id, new NavGrid(this.map.R, obstacles, this.map.walls));
    this.nav = NAV_CACHE.get(this.map.id);
    this.frozenView = null;
    this.roster.clear();
    for (const r of m.roster) this.roster.set(r[0], { name: r[1], cos: r[2], bot: r[3], w: WEAPON_IDS[r[4]] });
    this.snaps = [];
    this.latest = null;
    this.offset = null;
    this.me = null;
    this.ui = null;
    this.pred = null;
    this.hist = [];
    this.seq = 0;
    this.ended = null;
    this.dead = false;
    this.landing = { t: m.map.landTime || C.LANDING_TIME, lx: null, ly: null, chosen: false };
    this.augPick = { po: 0, pk: 0, pr: 0 };
    this.bounties = [];
    this.input.counters = new Array(C.PRESS_N).fill(0);
    this.interactTarget = 0;
    this.atkTarget = 0;
    this.atkMove = false;
    this.predAct = null;
    this.lastRoll = 0;
    this.input.onMoveClick = (sx, sy) => this.moveClick(sx, sy);
    this.input.onAttackClick = (sx, sy) => this.attackClick(sx, sy);
    this.input.onPress = (k) => this.onKeyPress(k);
    this.running = true;
    this.lastFrame = performance.now();
    this.acc = 0;
    this.hud.reset(this);
    if (this.onStart) this.onStart(m);
    requestAnimationFrame(this.frame);
    clearInterval(this.pingTimer);
    this.pingTimer = setInterval(() => this.t.send({ t: 'ping', c: performance.now() }), 2000);
  }

  stop() {
    this.running = false;
    clearInterval(this.pingTimer);
  }

  serverNow() {
    return performance.now() / 1000 + (this.offset || 0);
  }

  // 착지 단계: 남은 시간과 내 시작 지점 (고정, 서버가 나눠 줌)
  landingSnap(s) {
    if (!this.landing) return;
    this.landing.t = s.lt;
    if (s.me && s.me.lx != null) {
      this.landing.lx = s.me.lx;
      this.landing.ly = s.me.ly;
      this.landing.chosen = true;
    }
    if (s.lr) this.updateLairs(s.lr);
    for (const e of s.ev) this.onEvent(e);
  }

  // 증강 고르기: i = 카드 1~3 (4 = 건너뛰기), rep = 칸이 꽉 찼을 때 바꿀 칸 1~3
  pickAugment(i, rep = 0) {
    const of = this.me && this.me.of;
    if (!of || i < 1 || (i > of.c.length && i !== 4)) return false;
    this.augPick = { po: of.id, pk: i, pr: rep };
    return true;
  }

  // 둥지 상태: [id, state, hp%, 남은 시간]
  updateLairs(lr) {
    for (const q of lr) {
      const l = this.map.lairs.find((x) => x.id === q[0]);
      if (!l) continue;
      l.state = LAIR_STATE[q[1]];
      l.hp = q[2];
      l.t = q[3];
    }
  }

  ingest(s) {
    const now = performance.now() / 1000;
    const est = s.tm - now;
    if (this.landing) {
      // 착지 끝 → 전투 시작
      this.landing = null;
      this.offset = null;
      this.snaps = [];
    }
    if (this.offset == null || est > this.offset) this.offset = est;
    else this.offset = this.offset * 0.995 + est * 0.005;
    this.prevItems = new Set((this.latest ? this.latest.it : []).map((g) => g[0]));
    const snap = {
      tm: s.tm,
      pl: new Map(s.pl.map((a) => [a[0], decodePlayer(a)])),
      mo: new Map(s.mo.map((a) => [a[0], decodeMonster(a)])),
      pr: s.pr,
      ar: s.ar,
      so: s.so,
      it: s.it,
      ch: s.ch,
      z: s.z,
      ac: s.ac,
    };
    this.snaps.push(snap);
    if (this.snaps.length > 40) this.snaps.shift();
    this.latest = snap;
    if (s.lr) this.updateLairs(s.lr);
    if (s.bt) this.bounties = s.bt;
    if (s.me) {
      const wasAlive = this.me ? this.me.al : 1;
      this.me = s.me;
      if (s.me.ui) this.ui = s.me.ui;
      this.reconcile(s.me);
      if (wasAlive && !s.me.al && !this.dead) {
        this.dead = true;
        if (this.onDeath) this.onDeath(s.me);
      }
      // 고른 증강 제안이 끝났으면 선택 초기화
      if (this.augPick.po && (!s.me.of || s.me.of.id !== this.augPick.po)) this.augPick = { po: 0, pk: 0, pr: 0 };
    }
    for (const e of s.ev) this.onEvent(e);
  }

  // 서버 위치 + 아직 확인 안 된 내 입력을 다시 적용 → 예측 위치
  reconcile(me) {
    if (!me.al || !me.ld) {
      this.pred = null;
      this.hist.length = 0;
      return;
    }
    const base = { x: me.x, y: me.y, r: me.r || C.PLAYER_R, kbx: me.kbx, kby: me.kby, dashT: me.dt, dashSpd: me.ds, ddx: me.ddx, ddy: me.ddy };
    while (this.hist.length && this.hist[0].seq <= me.ack) this.hist.shift();
    for (const h of this.hist) {
      if (h.sp && h.sp.roll) startDash(base, h.sp.roll[0], h.sp.roll[1], C.ROLL.time, C.ROLL.dist);
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

  mouseWorld(sx = this.input.mouseX, sy = this.input.mouseY) {
    const r = this.r;
    return [r.cam.x + (sx - r.w / 2) / r.zoom, r.cam.y + (sy - r.h / 2) / r.zoom];
  }

  // 커서 근처의 적 (플레이어·몬스터). 롤처럼 몸통을 대충 눌러도 잡히게 여유를 둠
  enemyAt(wx, wy, pad = 30) {
    const s = this.latest;
    if (!s) return null;
    let best = null;
    let bd = Infinity;
    // 도트 캐릭터는 발밑 기준이라 머리를 눌러도 잡히게 조금 위쪽도 봄
    for (const p of s.pl.values()) {
      if (p.id === this.meId || p.flags & PF.INVIS) continue;
      const d = Math.min(Math.hypot(p.x - wx, p.y - wy), Math.hypot(p.x - wx, p.y - 20 - wy));
      if (d < p.r + pad && d < bd) {
        bd = d;
        best = { id: p.id, x: p.x, y: p.y, r: p.r };
      }
    }
    for (const m of s.mo.values()) {
      const d = Math.min(Math.hypot(m.x - wx, m.y - wy), Math.hypot(m.x - wx, m.y - m.r - wy));
      if (d < m.r + pad && d < bd) {
        bd = d;
        best = { id: m.id, x: m.x, y: m.y, r: m.r };
      }
    }
    return best;
  }

  // 위치 기준 가장 가까운 적 (공격 이동용)
  nearestEnemy(x, y, range, playersFirst = true) {
    const s = this.latest;
    if (!s) return null;
    let best = null;
    let bd = Infinity;
    for (const p of s.pl.values()) {
      if (p.id === this.meId || p.flags & PF.INVIS) continue;
      const d = Math.hypot(p.x - x, p.y - y) * (playersFirst ? 0.8 : 1);
      if (d < range && d < bd) {
        bd = d;
        best = { id: p.id, x: p.x, y: p.y, r: p.r };
      }
    }
    for (const m of s.mo.values()) {
      const d = Math.hypot(m.x - x, m.y - y);
      if (d < range && d < bd) {
        bd = d;
        best = { id: m.id, x: m.x, y: m.y, r: m.r };
      }
    }
    return best;
  }

  entity(id) {
    const s = this.latest;
    if (!s) return null;
    const p = s.pl.get(id);
    if (p) return p.flags & PF.INVIS ? null : { id, x: p.x, y: p.y, r: p.r };
    const m = s.mo.get(id);
    return m ? { id, x: m.x, y: m.y, r: m.r } : null;
  }

  myRange() {
    return this.ui ? WEAPONS[this.ui.gear.weapon.type].range : 100;
  }

  alive() {
    return !!(this.me && this.me.al && this.me.ld && !this.landing);
  }

  // 우클릭: 적 = 쫓아가며 공격 / 상자 = 가서 열기 / 땅 = 이동
  moveClick(sx, sy) {
    if (!this.alive()) return;
    const [wx, wy] = this.mouseWorld(sx, sy);
    const s = this.latest;
    this.atkMove = false;
    this.pendingCast = null;
    const foe = this.enemyAt(wx, wy);
    if (foe) {
      this.atkTarget = foe.id;
      this.interactTarget = 0;
      this.moveTarget = null;
      this.path = null;
      this.moveMarker = { x: foe.x, y: foe.y, t: 0, attack: true };
      return;
    }
    this.atkTarget = 0;
    let target = null;
    if (s) {
      let bd = 70 * 70;
      for (const g of s.it) {
        const d = (g[1] - wx) ** 2 + (g[2] - 10 - wy) ** 2;
        if (d < bd) {
          bd = d;
          target = { id: g[0], x: g[1], y: g[2], item: true };
        }
      }
      for (const c of s.ch) {
        if (c[3]) continue;
        const d = (c[1] - wx) ** 2 + (c[2] - 10 - wy) ** 2;
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

  // A + 좌클릭: 적을 누르면 그 적, 빈 곳이면 커서 근처 → 내 근처 적. 없으면 그쪽으로 가다가 만나는 적 공격
  attackClick(sx, sy) {
    if (!this.alive()) return;
    const [wx, wy] = this.mouseWorld(sx, sy);
    const px = this.pred ? this.pred.x : this.me.x;
    const py = this.pred ? this.pred.y : this.me.y;
    this.interactTarget = 0;
    const foe = this.enemyAt(wx, wy) || this.nearestEnemy(wx, wy, 260) || this.nearestEnemy(px, py, this.myRange() + 260);
    if (foe) {
      this.atkTarget = foe.id;
      this.atkMove = false;
      this.moveTarget = null;
      this.path = null;
      this.moveMarker = { x: foe.x, y: foe.y, t: 0, attack: true };
    } else {
      this.atkTarget = 0;
      this.atkMove = true;
      this.setDest(wx, wy);
      this.moveMarker = { x: wx, y: wy, t: 0, attack: true };
    }
  }

  // 스킬 키 처리 (롤처럼):
  //  - 대상 지정 스킬은 커서 근처 적이 사거리 밖이면 걸어가서 닿는 순간 사용
  //  - 다음 기본 공격 강화는 커서 근처 적을 자동으로 공격 대상으로 잡음
  //  - 시전 중 감속을 이동 예측에 반영 (서버와 어긋나 튀는 것 방지)
  onKeyPress(k) {
    if (!this.ui || !this.alive()) return true;
    const i = { q: 0, w: 1, e: 2 }[k];
    if (i == null && k !== 'r') return true;
    if (i != null && this.me.cd[i] > 0) return true;
    if (k === 'r' && this.me.ult < 100) return true;
    const sk = WEAPONS[this.ui.gear.weapon.type][k];
    const [wx, wy] = this.mouseWorld();
    const px = this.pred ? this.pred.x : this.me.x;
    const py = this.pred ? this.pred.y : this.me.y;
    if (TARGETED.has(sk.type)) {
      const foe = this.enemyAt(wx, wy, 60) || this.nearestEnemy(wx, wy, 220);
      if (foe && Math.hypot(foe.x - px, foe.y - py) > sk.range + foe.r - 10) {
        this.pendingCast = { key: k, id: foe.id, range: sk.range, t: 3 };
        this.atkTarget = 0;
        this.setDest(foe.x, foe.y);
        this.moveMarker = { x: foe.x, y: foe.y, t: 0, attack: true };
        return false;
      }
      if (foe) this.castAt = [foe.x, foe.y];
    }
    if (sk.type === 'empower' && !this.atkTarget) {
      const foe = this.enemyAt(wx, wy, 60) || this.nearestEnemy(px, py, this.myRange() + 260);
      if (foe) this.atkTarget = foe.id;
    }
    if (sk.moveMult != null && sk.dur) this.predAct = { t: sk.dur, mult: sk.moveMult };
    return true;
  }

  // 이동 목적지: 막히면 길찾기로 돌아가는 경로를 만듦 (롤처럼)
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
    if (this.landing) {
      this.seq++;
      const L = this.landing;
      this.t.send({ t: 'in', s: this.seq, mx: 0, my: 0, a: 0, k: false, p: this.input.counters.slice() });
      return;
    }
    const [wx, wy] = this.mouseWorld();
    const me = this.me;
    const alive = this.alive();
    const px = this.pred ? this.pred.x : me ? me.x : 0;
    const py = this.pred ? this.pred.y : me ? me.y : 0;
    if (alive && this.input.moveHeld) {
      const moved = !this.dest || Math.hypot(this.dest[0] - wx, this.dest[1] - wy) > 30;
      if (moved && (this.repathT || 0) <= 0) {
        this.setDest(wx, wy);
        this.repathT = 0.2;
      }
    }
    if (this.repathT > 0) this.repathT -= C.DT;
    if (this.path && this.path.length > 1) {
      const [ax, ay] = this.path[0];
      const [bx, by] = this.path[1];
      if (Math.hypot(ax - px, ay - py) < 22 || (this.nav && this.nav.clearLine(px, py, bx, by))) {
        this.path.shift();
        this.moveTarget = this.path[0];
      }
    }
    if (this.input.stopPressed || !alive) {
      this.moveTarget = null;
      this.path = null;
      this.pendingCast = null;
      this.atkTarget = 0;
      this.atkMove = false;
      this.input.stopPressed = false;
    }
    let castAt = this.castAt || null;
    this.castAt = null;
    if (this.pendingCast) {
      const pc = this.pendingCast;
      const t = this.entity(pc.id);
      pc.t -= C.DT;
      if (!t || pc.t <= 0) this.pendingCast = null;
      else if (Math.hypot(t.x - px, t.y - py) <= pc.range + t.r - 10) {
        this.input.counters[C.PRESS[pc.key]]++;
        castAt = [t.x, t.y];
        this.pendingCast = null;
        this.moveTarget = null;
        this.path = null;
      } else if ((this.chaseT || 0) <= 0) {
        this.setDest(t.x, t.y);
        this.chaseT = 0.12;
      }
    }
    // 롤식 기본 공격: 대상이 사거리 밖이면 쫓아가고, 안이면 멈춰서 계속 공격
    let atk = false;
    const range = this.myRange();
    if (this.atkMove && !this.atkTarget) {
      const foe = this.nearestEnemy(px, py, range + 220);
      if (foe) {
        this.atkTarget = foe.id;
        this.atkMove = false;
      } else if (!this.moveTarget) this.atkMove = false;
    }
    if (this.atkTarget) {
      const t = this.entity(this.atkTarget);
      if (!t) this.atkTarget = 0;
      else {
        const d = Math.hypot(t.x - px, t.y - py);
        if (d > range + t.r * 0.8) {
          if ((this.chaseT || 0) <= 0 || !this.moveTarget) {
            this.setDest(t.x, t.y);
            this.chaseT = 0.12;
          }
        } else {
          this.moveTarget = null;
          this.path = null;
          atk = true;
        }
      }
    }
    if (this.chaseT > 0) this.chaseT -= C.DT;
    this.autoAtk = atk;
    this.hoverId = alive ? (this.enemyAt(wx, wy) || {}).id || 0 : 0;
    let mx = 0;
    let my = 0;
    if (this.moveTarget) {
      const dx = this.moveTarget[0] - px;
      const dy = this.moveTarget[1] - py;
      const d = Math.hypot(dx, dy);
      const stopAt = this.interactTarget ? 40 : this.atkTarget ? 4 : 6;
      if (d > stopAt) {
        mx = dx / d;
        my = dy / d;
        const step = (me ? me.ms : 200) * C.DT;
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
    const aim = Math.atan2(wy - (py - 15), wx - px);
    const tgt = atk && this.atkTarget ? this.entity(this.atkTarget) : null;
    this.aim = tgt ? Math.atan2(tgt.y - py, tgt.x - px) : aim;
    this.seq++;
    const p = this.input.counters.slice();
    this.t.send({
      t: 'in',
      s: this.seq,
      mx: Math.round(mx * 1000) / 1000,
      my: Math.round(my * 1000) / 1000,
      a: Math.round(aim * 1000) / 1000,
      k: atk,
      at: this.atkTarget,
      cx: Math.round(castAt ? castAt[0] : wx),
      cy: Math.round(castAt ? castAt[1] : wy),
      ti: this.interactTarget,
      po: this.augPick.po,
      pk: this.augPick.pk,
      pr: this.augPick.pr,
      p,
    });
    if (!alive || !this.pred || !this.ui) return;
    let speed = me.ms;
    const w = WEAPONS[this.ui.gear.weapon.type];
    if (atk) speed *= w.basic.moveMult;
    if (this.predAct) {
      speed *= this.predAct.mult;
      this.predAct.t -= C.DT;
      if (this.predAct.t <= 0) this.predAct = null;
    }
    if (me.chn >= 0) speed = 0;
    // D 구르기 즉시 예측
    let sp = null;
    if (p[C.PRESS.d] > (this.lastRoll || 0)) {
      this.lastRoll = p[C.PRESS.d];
      if (me.rl > 0 && me.st === 0) {
        const dx = wx - this.pred.x;
        const dy = wy - this.pred.y;
        const len = Math.hypot(dx, dy) || 1;
        sp = { roll: [dx / len, dy / len] };
        startDash(this.pred, dx / len, dy / len, C.ROLL.time, C.ROLL.dist);
        this.predAct = null;
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
    const cur = this.input.attackMode || this.hoverId ? ATTACK_CURSOR : 'crosshair';
    if (this.input.canvas.style.cursor !== cur) this.input.canvas.style.cursor = cur;
    const k = Math.exp(-12 * dt);
    this.corr.x *= k;
    this.corr.y *= k;
    if (this.landing) {
      const v = this.landingView(dt);
      this.r.draw(v, dt);
      this.hud.update(this, v, dt);
    } else if (this.latest) {
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

  // 착지 단계 화면: 내 시작 지점 쪽을 비춤
  landingView(dt) {
    const L = this.landing;
    const tx = L.chosen ? L.lx : Math.cos(this.time * 0.15) * 900;
    const ty = L.chosen ? L.ly : Math.sin(this.time * 0.15) * 900;
    const cam = this.landCam || { x: tx, y: ty };
    const kk = 1 - Math.exp(-3 * dt);
    cam.x += (tx - cam.x) * kk;
    cam.y += (ty - cam.y) * kk;
    this.landCam = cam;
    return {
      landing: L,
      time: this.time,
      cam: { x: cam.x, y: cam.y },
      map: this.map,
      zone: { active: false, x: 0, y: 0, r: this.map.R + 300, tx: 0, ty: 0, tr: this.map.R + 300, stage: 'wait', st: 0, phase: -1 },
      players: [],
      monsters: [],
      projs: [],
      areas: [],
      souls: [],
      chests: [],
      items: [],
      lairs: this.map.lairs,
      meId: this.meId,
      moveMarker: L.chosen ? { x: L.lx, y: L.ly, t: (this.time * 0.6) % 0.45, interact: true } : null,
      serverTime: 0,
      alive: C.MAX_PLAYERS,
    };
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
      }
      players.push(p);
    }
    // 내가 최신 스냅샷에만 있는 경우 (방금 착지 등)
    if (this.alive() && !players.some((p) => p.me)) {
      const lp = latest.pl.get(this.meId);
      if (lp && this.pred) {
        const info = this.roster.get(this.meId);
        players.push({ ...lp, x: this.pred.x, y: this.pred.y, me: true, name: info.name, cos: info.cos, aim: this.aim ?? lp.aim, vx: 0, vy: 0 });
      }
    }
    const monsters = [];
    for (const [id, b] of s1.mo) {
      const a = s0.mo.get(id) || b;
      monsters.push({ ...b, x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k, aim: lerpAngle(a.aim, b.aim, k) });
    }
    const dtp = rt - s1.tm;
    const projs = s1.pr.map((q) => ({
      id: q[0],
      kind: PROJ_KINDS[q[1]],
      x: q[2] + q[4] * dtp,
      y: q[3] + q[5] * dtp,
      vx: q[4],
      vy: q[5],
      color: q[6] >= 0 ? WEAPONS[WEAPON_IDS[q[6]]].color : '',
      enemy: q[7] !== this.meId,
      r: q[8] || 8,
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
      enemy: a[9] !== this.meId,
      ang: a[10],
      len: a[11],
      width: a[12],
      outer: a[14] || 0,
      owner: a[9],
      cos: AREA_KINDS[a[1]] === 'shadow' ? this.cosOf(a[9]) : null,
      ticks: AREA_KINDS[a[1]] === 'ground' ? 2 : 1,
    }));
    const souls = latest.so.map((o) => ({ id: o[0], x: o[1], y: o[2], v: o[3] }));
    const chests = latest.ch.map((c) => ({ id: c[0], x: c[1], y: c[2], open: !!c[3], kind: CHEST_KINDS[c[4]] || 'small', locked: !!c[5] }));
    // 내가 연 상자의 무기는 등급 뽑기 연출이 끝난 뒤에 보여 줌
    const hide = this.rollHide && performance.now() < this.rollHide.until ? this.rollHide : null;
    const items = latest.it
      .filter((g) => !hide || (g[1] - hide.x) ** 2 + (g[2] - hide.y) ** 2 > 110 * 110 || hide.known.has(g[0]))
      .map((g) => ({ id: g[0], x: g[1], y: g[2], type: WEAPON_IDS[g[3]], rarity: g[4] }));
    const z = latest.z;
    const zone = { active: !!z[0], x: z[1], y: z[2], r: z[3], tx: z[4], ty: z[5], tr: z[6], stage: ZONE_STAGE[z[7]] || 'wait', st: z[8], phase: z[9] };
    // 카메라: 내 위치(또는 관전 대상) + 마우스 방향으로 살짝
    let cx;
    let cy;
    const meP = players.find((p) => p.me);
    const spec = !meP && this.me && this.me.sp ? players.find((p) => p.id === this.me.sp) : null;
    if (meP) {
      cx = meP.x;
      cy = meP.y - 12;
      const tx = Math.max(-1, Math.min(1, (this.input.mouseX - this.r.w / 2) / (this.r.w / 2))) * 100;
      const ty = Math.max(-1, Math.min(1, (this.input.mouseY - this.r.h / 2) / (this.r.h / 2))) * 70;
      const kk = 1 - Math.exp(-6 * dt);
      this.camLead.x += (tx - this.camLead.x) * kk;
      this.camLead.y += (ty - this.camLead.y) * kk;
      cx += this.camLead.x;
      cy += this.camLead.y;
    } else {
      cx = spec ? spec.x : this.r.cam.x;
      cy = spec ? spec.y - 12 : this.r.cam.y;
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
      chests,
      items,
      lairs: this.map.lairs,
      bounties: this.bounties,
      meId: this.meId,
      walls: this.map.walls,
      camps: this.map.camps,
      moveMarker: this.moveMarker,
      atkTarget: this.atkTarget,
      hoverId: this.hoverId,
      attackMode: this.input.attackMode,
      myRange: this.myRange(),
      specTarget: spec,
      serverTime: latest.tm,
      alive: latest.ac,
    };
  }

  // ---------------- 이벤트 → 이펙트 ----------------
  near(x, y) {
    if (x === undefined) return 1;
    return Math.max(0, 1 - Math.hypot(x - this.r.cam.x, y - this.r.cam.y) / 1100);
  }

  nameOf(id) {
    const r = this.roster.get(id);
    return r ? r.name : '';
  }

  cosOf(id) {
    const r = this.roster.get(id);
    return r ? r.cos : {};
  }

  findPlayer(id) {
    const s = this.latest;
    return s ? s.pl.get(id) : null;
  }

  onEvent(e) {
    const R = this.r;
    const isMe = e.id === this.meId;
    switch (e.e) {
      case 'hit': {
        R.hitFlash(e.id);
        const src = e.s ? this.findPlayer(e.s) || (this.latest && this.latest.mo.get(e.s)) : null;
        if (src) R.recoil(e.id, e.x - src.x, e.y - src.y, e.b ? 12 : 7);
        const dot = e.k === 3 || e.k === 6;
        if ((e.s === this.meId || isMe) && !dot) this.hitstop = Math.max(this.hitstop, e.b ? 0.09 : e.a >= 100 ? 0.06 : 0.04);
        const byMe = e.s === this.meId;
        let color = '#e8e8f0';
        let size = 15;
        if (isMe) {
          color = '#ff4d5e';
          size = 17;
        } else if (byMe) {
          color = e.c ? '#ff9a2e' : e.k === 2 ? '#ffd45a' : e.k === 1 ? '#ffb070' : e.k === 7 ? '#9fe8ff' : dot ? '#c99bff' : '#ffffff';
          size = e.c ? 30 : e.b ? 26 : dot ? 14 : 19;
        } else if (dot) size = 12;
        if (isMe || byMe || e.a >= 40) R.text(e.x + (byMe ? 14 : -14), e.y - 64, e.c ? `${e.a}!` : String(e.a), color, size, e.b || e.c ? 1.1 : 0.75);
        if (!dot) {
          const ang = src ? Math.atan2(e.y - src.y, e.x - src.x) : 0;
          R.anim(e.b || e.c ? 'slash3' : 'slash1', e.x, e.y - 14, { rot: ang, dur: 0.22, add: true, flip: Math.random() < 0.5 });
          if (byMe) {
            for (let i = 0; i < (e.b ? 10 : 5); i++) R.burst(e.x + Math.cos(ang) * 10, e.y - 12 + Math.sin(ang) * 10, i % 2 ? '#ffe9c8' : '#ffffff', 1, 380 + Math.random() * 200, 4, 0.22, { dir: ang, spread: 0.9 });
            R.shake(e.b || e.c ? 8 : 3);
          }
          if (e.c) R.anim('spark', e.x, e.y - 20, { dur: 0.35, add: true });
        }
        if (isMe) R.shake(e.a > 150 ? 11 : 5);
        break;
      }
      case 'swing': {
        const p = this.findPlayer(e.id);
        const wd = WEAPONS[p ? p.w : 'greatsword'];
        const c = wd.basic.combo ? wd.basic.combo[e.s % wd.basic.combo.length] : null;
        const sl = COSMETIC_MAP[this.cosOf(e.id).slash] || COSMETIC_MAP.slash_default;
        if (c) R.slash(e.x, e.y - 10, e.a, Math.min(c.arc, 2.8), c.range + 10, sl.color, sl.color2, e.s);
        break;
      }
      case 'skill': {
        const w = WEAPONS[e.w];
        const sk = w[e.k];
        if (e.k === 'r') {
          R.anim('aura', e.x, e.y - 12, { dur: 0.5, scale: 2, add: true });
          R.ring(e.x, e.y, 10, 90, w.color, 0.4, 6);
          if (isMe) R.text(e.x, e.y - 70, sk.name, '#ffd45a', 22, 1);
        }
        if (sk.type === 'dashstrike' || sk.type === 'leap') R.anim('dust', e.x, e.y, { dur: 0.4 });
        if (sk.type === 'spin') {
          R.anim('circular', e.x, e.y - 10, { dur: 0.3, scale: Math.max(1, Math.round(sk.r / 90)), add: true });
          R.ring(e.x, e.y, 30, sk.r, w.color, 0.4, 8);
        }
        if (sk.type === 'dashstrike') R.beam(e.x, e.y, e.x + Math.cos(e.a) * sk.dist, e.y + Math.sin(e.a) * sk.dist, w.color, 10, 0.25);
        break;
      }
      case 'cone':
        R.cone(e.x, e.y, e.a, e.arc, e.r, WEAPONS[e.w].color);
        break;
      case 'nova':
        R.ring(e.x, e.y, 20, e.r, WEAPONS[e.w].color, 0.35, 10);
        R.anim(e.w === 'froststaff' ? 'ice' : 'circle', e.x, e.y - 8, { dur: 0.4, scale: Math.max(1, Math.round(e.r / 60)), add: true });
        break;
      case 'areafx': {
        const col = e.w ? WEAPONS[e.w].color : '#ff3d4f';
        const v = this.near(e.x, e.y);
        if (e.k === 'line') {
          R.beam(e.x, e.y, e.x + Math.cos(e.a) * e.l, e.y + Math.sin(e.a) * e.l, col, 34, 0.45);
          for (let i = 1; i <= 4; i++) R.anim('rock', e.x + Math.cos(e.a) * e.l * (i / 4), e.y + Math.sin(e.a) * e.l * (i / 4), { delay: i * 0.04, dur: 0.5 });
          R.shake(10 * v);
        } else if (e.k === 'ring' && e.w !== 'froststaff') {
          R.ring(e.x, e.y, e.r * 0.55, e.r, col, 0.35, 16);
          R.anim('circular', e.x, e.y - 10, { dur: 0.35, scale: Math.max(1, Math.round(e.r / 70)), add: true });
          R.shake(6 * v);
        } else if (e.k === 'ring') {
          R.anim('ice', e.x, e.y - 10, { dur: 0.5, scale: Math.max(1, Math.round(e.r / 50)) });
          R.burst(e.x, e.y, '#e6fbff', 22, 380, 4, 0.5, { shape: 'star' });
        } else if (e.k === 'flag') {
          R.anim('rockspike', e.x, e.y - 20, { dur: 0.45 });
          R.ring(e.x, e.y, 10, e.r, col, 0.35, 8);
        } else if (e.k === 'slam') {
          R.anim('rock', e.x, e.y - 10, { dur: 0.5, scale: 2 });
          R.ring(e.x, e.y, 20, e.r, '#ff6b5a', 0.35, 10);
          R.shake(5 * v);
        } else {
          const big = e.r >= 150;
          R.anim(e.w === 'longbow' ? 'spark' : 'explosion', e.x, e.y - 14, { dur: big ? 0.55 : 0.4, scale: Math.max(1, Math.round(e.r / (big ? 45 : 40))) });
          R.ring(e.x, e.y, 10, e.r, col, 0.4, big ? 14 : 8);
          R.burst(e.x, e.y, col, big ? 30 : 14, big ? 480 : 300, 6, 0.5);
          R.shake((big ? 13 : 5) * v);
        }
        break;
      }
      case 'dash': {
        R.anim('dust', e.x, e.y + 4, { dur: 0.35 });
        const tr = COSMETIC_MAP[this.cosOf(e.id).trail] || COSMETIC_MAP.trail_none;
        this.trail(e.x, e.y, e.dx, e.dy, 220, tr);
        break;
      }
      case 'shadow':
        R.beam(e.x, e.y, e.x2, e.y2, '#7a3cff', 6, 0.25);
        R.anim('smoke', e.x2, e.y2 - 10, { dur: 0.35 });
        break;
      case 'mark':
        R.text(e.x, e.y - 70, '표식', '#c56bff', 18, 1);
        R.ring(e.x, e.y, 10, 60, '#c56bff', 0.4, 6);
        break;
      case 'markpop':
        R.anim('explosion', e.x, e.y - 14, { dur: 0.45, scale: 2 });
        R.burst(e.x, e.y, '#c56bff', 30, 420, 6, 0.6);
        R.shake(10 * this.near(e.x, e.y));
        break;
      case 'conflag':
        R.beam(e.x, e.y, e.x2, e.y2, '#ff7a2e', 8, 0.3);
        R.anim('flam', e.x2, e.y2 - 12, { dur: 0.45, scale: 2 });
        if (e.r) R.ring(e.x2, e.y2, 20, e.r, '#ff5a1f', 0.4, 8);
        break;
      case 'dunk':
        R.text(e.x, e.y - 70, e.n >= 5 ? '단두대!!' : '단두대', '#ff6b3d', e.n >= 5 ? 24 : 18, 1);
        R.anim('slash3', e.x, e.y - 14, { dur: 0.35, scale: 2, rot: Math.PI / 2 });
        R.shake(12 * this.near(e.x, e.y));
        break;
      case 'passive':
        R.burst(e.x, e.y, '#c56bff', 10, 220, 4, 0.4);
        break;
      case 'empower':
        R.anim('aura', e.x, e.y - 10, { dur: 0.4 });
        break;
      case 'empowerhit':
        R.slash(e.x, e.y - 10, e.a, 2.6, 130, '#ff6b3d', '#ffe0b0', 2);
        R.anim('slash3', e.x + Math.cos(e.a) * 50, e.y + Math.sin(e.a) * 50 - 10, { rot: e.a, dur: 0.3, scale: 2 });
        R.shake(isMe ? 9 : 4);
        break;
      case 'execute':
        R.text(e.x, e.y - 66, '처형!', '#ff3d6b', 22, 1.1);
        R.anim('explosion', e.x, e.y - 14, { dur: 0.45, scale: 2 });
        R.shake(12 * this.near(e.x, e.y));
        break;
      case 'flagdash':
        R.anim('dust', e.x, e.y, { dur: 0.4, scale: 2 });
        break;
      case 'blink':
        R.anim('smoke', e.x, e.y - 10, { dur: 0.35 });
        R.anim('smoke', e.x2, e.y2 - 10, { dur: 0.35 });
        break;
      case 'stun':
      case 'root':
      case 'freeze':
        R.text(e.x, e.y - 56, e.e === 'stun' ? '기절' : e.e === 'root' ? '속박' : '빙결', e.e === 'stun' ? '#ffe14d' : '#9fe8ff', 14, 0.8);
        if (e.e === 'freeze') R.anim('ice', e.x, e.y - 12, { dur: 0.45 });
        break;
      case 'immune':
        if (isMe) R.text(e.x, e.y - 56, '면역', '#bbbbbb', 12, 0.6);
        break;
      case 'iframe':
        if (isMe) R.text(e.x, e.y - 50, '회피!', '#7fe7ff', 15, 0.6);
        break;
      case 'shieldhit':
        R.anim('shield', e.x, e.y - 14, { dur: 0.25, alpha: 0.8 });
        break;
      case 'interrupt':
        if (isMe) R.text(e.x, e.y - 56, '중단됨', '#ffb070', 14, 0.7);
        break;
      case 'phit':
        R.burst(e.x, e.y, '#ffe9c8', 5, 160, 3, 0.25);
        break;
      case 'death':
        R.anim('smoke', e.x, e.y - 14, { dur: 0.6, scale: 2 });
        R.burst(e.x, e.y - 10, '#ffffff', 20, 300, 5, 0.6);
        if (isMe) R.shake(16);
        break;
      case 'kill':
        this.hud.killfeed(this, e);
        if (e.k === this.meId) {
          this.hitstop = 0.14;
          this.hud.announce(e.m >= 2 ? (e.m === 2 ? '더블 킬!' : e.m === 3 ? '트리플 킬!' : '학살!') : `처치! 남은 인원 ${e.left}`, '#ff6b5a', 1.6);
        }
        break;
      case 'mdeath': {
        R.anim('smoke', e.x, e.y - 10, { dur: 0.45, scale: e.t >= 2 ? 2 : 1 });
        const col = ['#6fd6c0', '#e8e0cc', '#ff6b5a', '#b18cff', '#ffe9a8'][e.t];
        R.burst(e.x, e.y, col, e.t >= 3 ? 30 : 10, 260, 5, 0.5);
        break;
      }
      case 'soul':
        break;
      case 'heal':
        if (isMe && e.a >= 20) R.text(e.x, e.y - 40, `+${e.a}`, '#4cff8f', 14, 0.8);
        break;
      case 'chest': {
        // 무기 상자: 무기 등급 색 / 에픽 보물: 증강 등급 색
        const col = e.aug ? AUG_TIERS[e.r].color : RARITIES[e.r].color;
        R.anim('spark', e.x, e.y - 20, { dur: 0.5, scale: 2, add: true });
        R.pillar(e.x, e.y, col, 0.9, 40);
        R.burst(e.x, e.y - 10, col, 26, 320, 5, 0.6);
        if (e.by === this.meId) {
          this.hud.chestRoll(e.r, e.k, !!e.aug, e.w);
          // 이미 바닥에 있던 무기는 그대로 보이게 기억
          const known = this.prevItems || new Set();
          this.rollHide = { x: e.x, y: e.y, until: this.hud.rollUntil - 150, known };
        }
        break;
      }
      case 'chestdrop':
        R.anim('spark', e.x, e.y - 14, { dur: 0.5 });
        break;
      case 'unlock':
        R.anim('circle', e.x, e.y - 10, { dur: 0.45, add: true });
        R.text(e.x, e.y - 50, '열림!', '#ffe36b', 15, 0.8);
        break;
      case 'locked':
        this.hud.announce('캠프 몬스터를 다 잡아야 열려요', '#ffcf4a', 1.4);
        break;
      case 'nottake':
        this.hud.announce('이미 같거나 더 좋은 무기예요', '#c9c9d6', 1.2);
        break;
      case 'equip': {
        const col = RARITIES[e.r].color;
        R.anim('boost', e.x, e.y - 16, { dur: 0.5, add: true });
        R.burst(e.x, e.y - 10, col, 14, 200, 4, 0.5);
        if (isMe) this.hud.announce(`${RARITIES[e.r].name} ${WEAPONS[e.w].name}${e.s ? ' 장착!' : ' 등급 업!'}`, col, 1.6);
        break;
      }
      case 'upgrade': {
        const col = RARITIES[e.r].color;
        R.anim('circle', e.x, e.y - 10, { dur: 0.45, scale: 2, add: true });
        R.pillar(e.x, e.y, col, 0.8, 34);
        if (isMe) this.hud.announce(`강화석으로 무기 강화! → ${RARITIES[e.r].name}`, col, 2);
        break;
      }
      case 'legend':
        if (e.id !== this.meId) this.hud.announce(`${this.nameOf(e.id)}님이 ${RARITIES[e.r].name} ${WEAPONS[e.w].name}을(를) 얻었습니다!`, RARITIES[e.r].color, 2.4);
        else this.hud.announce(`${RARITIES[e.r].name} 무기! 모두에게 빛나 보입니다`, RARITIES[e.r].color, 2.4);
        break;
      case 'offer':
        // 증강 카드는 HUD가 me.of 를 보고 띄움
        break;
      case 'aug': {
        const a = AUG_BY_ID[e.a];
        const col = AUG_TIERS[e.r].color;
        R.anim('boost', e.x, e.y - 16, { dur: 0.6, add: true });
        R.pillar(e.x, e.y, col, 0.8, 34);
        if (isMe && a) this.hud.announce(`${a.icon} ${a.name}${e.l ? ` (${AUG_BY_ID[e.l].name} 대신)` : ''}`, col, 1.8);
        break;
      }
      case 'augskip':
        if (isMe) R.text(e.x, e.y - 60, `강화석 +${C.SKIP_STONES}`, '#9fe8ff', 15, 0.9);
        break;
      case 'setup': {
        const f = FAMILY_BY_ID[e.f];
        if (f) this.hud.announce(`${f.icon} ${f.name} ${e.n}세트! ${e.n === 2 ? f.set2 : f.set3}`, f.color, 2.6);
        break;
      }
      case 'assist':
        R.text(e.x, e.y - 60, `어시스트! 강화석 +${C.ASSIST_STONES}`, '#9fe8ff', 15, 1);
        break;
      case 'steelshield':
        R.anim('shield', e.x, e.y - 14, { dur: 0.4 });
        break;
      case 'prism':
        if (e.id !== this.meId) this.hud.announce(`${this.nameOf(e.id)}님이 프리즘 증강을 받았습니다!`, '#ff7ef2', 2.2);
        break;
      case 'lairwake': {
        const def = MONSTERS[e.b];
        this.hud.announce(`${e.k === 'titan' ? '★ ' : ''}${def.name}이(가) 깨어났습니다!`, e.k === 'titan' ? '#ff7ef2' : '#d68bff', 2.6);
        break;
      }
      case 'lairlow':
        this.hud.announce(`${MONSTERS[e.b].name} 체력 30%! 막타를 노려라`, '#d68bff', 2.4);
        break;
      case 'epicdown':
        this.hud.announce(e.k === this.meId ? '에픽 처치! 보물을 지켜라 (여는 데 3초)' : `${MONSTERS[e.b].name} 처치됨 — 보물이 떨어졌습니다`, '#ff7ef2', 2.6);
        R.anim('explosion', e.x, e.y - 20, { dur: 0.6, scale: 3 });
        R.shake(10 * this.near(e.x, e.y));
        break;
      case 'lairgone':
        break;
      case 'bounty':
        if (e.id === this.meId) this.hud.announce(`현상금 ${e.n}킬! 지도에 위치가 표시됩니다`, '#ffd54a', 2);
        else if (e.n === C.BOUNTY_MIN || e.n % 2 === 0) this.hud.announce(`💰 ${this.nameOf(e.id)} 현상금 ${e.n}킬`, '#ffd54a', 2);
        break;
      case 'bountydrop':
        this.hud.announce(e.k === this.meId ? `현상금 사냥 성공! 주머니를 여세요 💰` : `${this.nameOf(e.id)}의 현상금 주머니가 떨어졌습니다`, '#ffd54a', 2.4);
        R.anim('explosion', e.x, e.y - 14, { dur: 0.5, scale: 2 });
        break;
      case 'chain':
        R.beam(e.x, e.y - 10, e.x2, e.y2 - 10, '#9fe8ff', 5, 0.2);
        R.anim('thunder', e.x2, e.y2 - 16, { dur: 0.3, add: true });
        break;
      case 'secondwind':
        R.anim('shield', e.x, e.y - 14, { dur: 0.5, scale: 2 });
        if (isMe) R.text(e.x, e.y - 70, '두 번째 바람', '#9fe8ff', 18, 1);
        break;
      case 'land':
        R.anim('dust', e.x, e.y + 2, { dur: 0.5, scale: 2 });
        if (isMe) {
          this.pred = null;
          this.corr.x = this.corr.y = 0;
        }
        break;
      case 'go':
        this.hud.announce('전투 시작!', '#ffe36b', 1.8);
        break;
      case 'zonewarn':
        this.hud.announce(`${e.p + 1}단계 자기장 예고 · ${e.t}초 뒤 줄어듭니다`, '#d678ff', 3);
        break;
      case 'zone':
        this.hud.announce('자기장이 줄어듭니다!', '#d678ff', 2.5);
        break;
      default:
        break;
    }
  }

  trail(x, y, dx, dy, dist, tr) {
    const R = this.r;
    const n = 6;
    for (let i = 0; i < n; i++) {
      const k = i / (n - 1);
      let color = tr.color;
      if (tr.style === 'rainbow') color = ['#ff4d4d', '#ffb340', '#ffe14d', '#5fd35f', '#4da3ff', '#c56bff'][i % 6];
      R.burst(x + dx * dist * k, y + dy * dist * k, color, tr.style === 'ghost' ? 2 : 3, 60, 6, 0.4, { drag: 2 });
    }
  }
}
