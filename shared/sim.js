// 게임 시뮬레이션 (서버 권한). 서버와 브라우저 연습 모드가 같은 코드를 실행한다.
// 16인 배틀로얄: 착지 지점 선택 → 상자·사냥으로 증강 → 자기장 5단계 → 최후의 1인
import { TAU, clamp, dist2, lerp, makeRng, shuffle, segPointDist2 } from './math.js';
import * as C from './constants.js';
import { WEAPONS, WEAPON_IDS, makeItem } from './items.js';
import { AUGMENTS, AUG_BY_ID, rollTier, pickOffer } from './augments.js';
import { MONSTERS, MSTATE, updateMonster } from './monsters.js';
import { MAPS, DEFAULT_MAP, CAMP_TYPES } from './maps.js';
import { NavGrid } from './nav.js';
import { resolveStatic, separateUnits, stepBody, wallBlocked } from './physics.js';
import { randomCosmetics, sanitizeCosmetics } from './cosmetics.js';
import { CombatMixin, PROJ_KINDS, AREA_KINDS } from './combat.js';
import { BOT_NAMES, botThink, makeBotBrain } from './bot.js';

const NAV_CACHE = new Map();

export { PROJ_KINDS, AREA_KINDS };

// 플레이어 상태 플래그 (스냅샷)
export const PF = {
  DASH: 1,
  PROTECT: 2,
  ROOT: 4,
  STUN: 8,
  INVIS: 16,
  BUSH: 32,
  SHIELD: 64,
  BOUNTY: 128,
  OFFER: 256,
  SLOW: 512,
  IFRAME: 1024,
  CHANNEL: 2048,
  EMPOWER: 4096,
  BURN: 8192,
  MARK: 16384,
  BLEED: 32768,
};
export const CHEST_KINDS = ['small', 'big', 'bounty'];
export const ZONE_STAGE = ['wait', 'warn', 'shrink'];

function makeStatus() {
  return {
    stunT: 0,
    rootT: 0,
    ccImmT: 0,
    slamT: 0,
    slamSrc: 0,
    iframeT: 0,
    invisT: 0,
    bulwarkT: 0,
    sprintT: 0,
    hasteT: 0,
    haste: 0,
    empT: 0,
    emp: null,
    burnT: 0,
    bleed: null,
    mark: null,
    shield: 0,
    shieldT: 0,
    slows: [],
    dots: [],
  };
}

export const PRESS = C.PRESS;

export function emptyInput() {
  return { seq: 0, mx: 0, my: 0, aim: 0, atk: false, cx: 0, cy: 0, ti: 0, at: 0, lx: null, ly: null, po: 0, pk: 0, p: new Array(C.PRESS_N).fill(0) };
}

const num = (v, d = 0) => (typeof v === 'number' && Number.isFinite(v) ? v : d);
const int = (v, d = 0) => (Number.isInteger(v) ? v : d);

// 클라이언트 입력 검증
export function sanitizeInput(raw, prev) {
  if (!raw || typeof raw !== 'object') return { ...prev, p: prev.p.slice() };
  const inp = emptyInput();
  inp.seq = int(raw.s, prev.seq);
  inp.mx = clamp(num(raw.mx), -1, 1);
  inp.my = clamp(num(raw.my), -1, 1);
  inp.aim = num(raw.a, prev.aim);
  inp.atk = !!raw.k;
  inp.cx = clamp(num(raw.cx, prev.cx), -5000, 5000);
  inp.cy = clamp(num(raw.cy, prev.cy), -5000, 5000);
  const pr = Array.isArray(raw.p) ? raw.p : [];
  for (let i = 0; i < C.PRESS_N; i++) inp.p[i] = Math.max(prev.p[i], int(pr[i], prev.p[i]));
  inp.ti = int(raw.ti, 0);
  inp.at = int(raw.at, 0); // 롤식 기본 공격 대상
  // 착지 지점 (착지 단계에서만 의미 있음)
  if (typeof raw.lx === 'number' && typeof raw.ly === 'number') {
    inp.lx = clamp(num(raw.lx), -5000, 5000);
    inp.ly = clamp(num(raw.ly), -5000, 5000);
  } else {
    inp.lx = prev.lx;
    inp.ly = prev.ly;
  }
  // 증강 선택: 어떤 제안(po)의 몇 번째(pk 1~3)를 골랐는지
  inp.po = int(raw.po, 0);
  inp.pk = int(raw.pk, 0);
  return inp;
}

export class Game {
  constructor(opts = {}) {
    this.seed = (opts.seed ?? Math.floor(Math.random() * 2147483647)) >>> 0;
    this.rng = makeRng(this.seed);
    this.mode = opts.mode || 'public';
    this.fillTo = opts.fillTo ?? C.MAX_PLAYERS;
    this.botLevel = opts.botLevel ?? 1; // 0 쉬움, 1 보통, 2 어려움
    this.mapId = opts.map || DEFAULT_MAP;
    this.camps = [];
    this.walls = [];
    this.bushes = [];
    this.time = 0;
    this.tick = 0;
    this.state = 'waiting';
    this.landT = 0;
    this.players = new Map();
    this.byId = new Map();
    this.units = [];
    this.monsters = [];
    this.projs = [];
    this.areas = [];
    this.souls = [];
    this.items = [];
    this.chests = [];
    this.obstacles = [];
    this.events = [];
    this.nextId = 1;
    this.nextOffer = 1;
    this.R = 2000;
    this.zone = null;
    this.startCount = 0;
    this.elimCount = 0;
    this.results = null;
    this.winner = 0;
    this.endReason = '';
  }

  // ---------------- 참가자 ----------------
  addPlayer({ name = '닌자', isBot = false, weapon = 'greatsword', cosmetics = null, skill = 0.5 } = {}) {
    const id = this.nextId++;
    const w = WEAPONS[weapon] ? weapon : 'greatsword';
    const p = {
      id,
      isPlayer: true,
      type: 'player',
      name: String(name).slice(0, 16) || '닌자',
      isBot,
      team: id,
      cos: sanitizeCosmetics(cosmetics),
      x: 0,
      y: 0,
      r: C.PLAYER_R,
      mass: 1,
      kbRes: 1,
      kbx: 0,
      kby: 0,
      dashT: 0,
      dashSpd: 0,
      ddx: 0,
      ddy: 0,
      aim: 0,
      alive: true,
      landed: false,
      hp: C.BASE_HP,
      maxHp: C.BASE_HP,
      level: 1,
      xp: 0,
      xpNext: C.xpForLevel(1),
      gear: { weapon: makeItem('weapon', w, 0) },
      grade: { q: 0, w: 0, e: 0 },
      cd: { q: 0, w: 0, e: 0, d: 0 },
      cdMax: { q: 1, w: 1, e: 1, d: C.ROLL.cd },
      // 증강
      augs: [],
      aug: {},
      stats: {},
      offers: [],
      luck: 0,
      hunter: 0,
      basicN: 0,
      undyingUsed: false,
      secondT: 0,
      meteorT: 5,
      recast: null,
      wantAct: null,
      dr: 0,
      ult: 0,
      act: null,
      combo: 0,
      comboT: 0,
      buffer: null,
      channel: null,
      st: makeStatus(),
      invulnT: 0,
      lastDmgT: -99,
      lastAtkT: -99,
      lastHitBy: 0,
      lastHitByT: -99,
      inBush: -1,
      kills: 0,
      deaths: 0,
      dmgDealt: 0,
      monsterKills: 0,
      chestsOpened: 0,
      multi: 0,
      lastKillT: -99,
      placement: 0,
      killerId: 0,
      specId: 0,
      left: false,
      outside: false,
      zoneTick: 0.5,
      input: emptyInput(),
      inputQueue: [],
      lp: new Array(C.PRESS_N).fill(0),
      ack: 0,
      uiVer: 1,
      speedMult: 1,
      cdMult: 1,
      freeSpeed: C.BASE_SPEED,
      brain: isBot ? makeBotBrain(this.rng, skill) : null,
    };
    this.recomputeStats(p);
    p.hp = p.maxHp;
    this.players.set(id, p);
    this.byId.set(id, p);
    return p;
  }

  fillBots() {
    const names = shuffle(BOT_NAMES.slice(), this.rng);
    const used = new Set([...this.players.values()].map((p) => p.name));
    const base = [0.22, 0.5, 0.78][this.botLevel] ?? 0.5;
    let i = 0;
    while (this.players.size < this.fillTo) {
      let name = names[i % names.length];
      if (i >= names.length || used.has(name)) name = `${name}${(i % 90) + 10}`;
      used.add(name);
      i++;
      this.addPlayer({
        name,
        isBot: true,
        weapon: WEAPON_IDS[Math.floor(this.rng() * WEAPON_IDS.length)],
        cosmetics: randomCosmetics(this.rng),
        skill: clamp(base + this.rng.range(-0.18, 0.18), 0.05, 0.95),
      });
    }
  }

  removePlayer(id) {
    const p = this.players.get(id);
    if (!p) return;
    p.left = true;
    if (this.state === 'waiting') {
      this.players.delete(id);
      this.byId.delete(id);
      return;
    }
    if (p.alive) this.killUnit(p, null, { kind: 'leave' });
  }

  setInput(id, raw) {
    const p = this.players.get(id);
    if (!p || p.isBot) return;
    const last = p.inputQueue.length ? p.inputQueue[p.inputQueue.length - 1] : p.input;
    p.inputQueue.push(sanitizeInput(raw, last));
    if (p.inputQueue.length > 8) p.inputQueue.splice(0, p.inputQueue.length - 3);
  }

  // 죽은 뒤 관전 대상 바꾸기 (←/→)
  spectate(id, dir = 1) {
    const me = this.players.get(id);
    if (!me || me.alive) return;
    const alive = [...this.players.values()].filter((p) => p.alive);
    if (!alive.length) return;
    let idx = alive.findIndex((p) => p.id === me.specId);
    idx = (idx + dir + alive.length) % alive.length;
    me.specId = alive[idx].id;
  }

  // ---------------- 시작: 착지 단계 ----------------
  start() {
    if (this.fillTo > this.players.size) this.fillBots();
    this.startCount = this.players.size;
    this.loadMap(this.mapId);
    this.zone = { x: 0, y: 0, r: this.R + 300, fx: 0, fy: 0, fr: this.R + 300, tx: 0, ty: 0, tr: this.R + 300, phase: -1, stage: 'wait', stageT: 0, dps: 0 };
    // 봇은 유적·마을·무작위 지점 중 하나를 고름
    // 봇 착지: 30%는 유적·마을, 나머지는 섬 곳곳에 흩어짐
    for (const p of this.players.values()) {
      if (!p.isBot) continue;
      if (this.rng() < 0.3) {
        const q = this.map.pois[Math.floor(this.rng() * this.map.pois.length)];
        p.input.lx = q.x + this.rng.range(-260, 260);
        p.input.ly = q.y + this.rng.range(-260, 260);
      } else {
        const a = this.rng() * TAU;
        const d = this.rng.range(0.4, 0.9) * this.R;
        p.input.lx = Math.cos(a) * d;
        p.input.ly = Math.sin(a) * d;
      }
    }
    this.state = 'landing';
    this.landT = C.LANDING_TIME;
  }

  // 착지: 고른 지점 근처의 빈 곳에 내려놓음 (안 고른 사람은 섬 가장자리 무작위)
  land() {
    const placed = [];
    for (const p of shuffle([...this.players.values()], this.rng)) {
      if (p.left) continue;
      let tx = p.input.lx;
      let ty = p.input.ly;
      if (tx == null || ty == null) {
        const s = this.map.spawns[Math.floor(this.rng() * this.map.spawns.length)];
        tx = s[0];
        ty = s[1];
      }
      const d = Math.sqrt(tx * tx + ty * ty);
      if (d > this.R - 120) {
        tx *= (this.R - 120) / d;
        ty *= (this.R - 120) / d;
      }
      // 장애물·다른 사람과 겹치지 않는 가까운 점
      let best = [tx, ty];
      for (let k = 0; k < 40; k++) {
        const a = this.rng() * TAU;
        const rr = k === 0 ? 0 : 40 + k * 14;
        const x = tx + Math.cos(a) * rr;
        const y = ty + Math.sin(a) * rr;
        if (x * x + y * y > (this.R - 100) ** 2 || this.blocked(x, y, 30)) continue;
        if (placed.some((q) => dist2(q[0], q[1], x, y) < 90 * 90)) continue;
        best = [x, y];
        break;
      }
      p.x = best[0];
      p.y = best[1];
      resolveStatic(p, this.obstacles, this.R);
      placed.push([p.x, p.y]);
      p.landed = true;
      p.invulnT = C.SPAWN_PROTECT;
      p.aim = Math.atan2(-p.y, -p.x);
      p.input.aim = p.aim;
      this.emit({ e: 'land', id: p.id, x: Math.round(p.x), y: Math.round(p.y) });
    }
    this.rebuildUnits();
    for (const c of this.camps) if (c.type !== 'elite') this.spawnCamp(c);
    this.state = 'running';
    this.time = 0;
    this.emit({ e: 'go', global: true });
  }

  // 맵 데이터(shared/maps.js) 적용
  loadMap(id) {
    const m = MAPS[id] || MAPS[DEFAULT_MAP];
    this.map = m;
    this.mapId = m.id;
    this.R = m.R;
    this.obstacles = m.pillars.map((o) => ({ ...o }));
    this.obstacles.walls = m.walls;
    this.walls = m.walls;
    this.bushes = m.bushes || [];
    if (!NAV_CACHE.has(m.id)) NAV_CACHE.set(m.id, new NavGrid(m.R, this.obstacles, m.walls));
    this.nav = NAV_CACHE.get(m.id);
    this.chests = m.chests.map((c) => ({ id: this.nextId++, x: c.x, y: c.y, kind: c.kind || 'small', open: false }));
    // 엘리트 캠프는 1분 뒤부터
    this.camps = m.camps.map((c) => ({ id: this.nextId++, x: c.x, y: c.y, type: c.type, mobs: [], respawnT: c.type === 'elite' ? 60 : 0, alive: false }));
  }

  blocked(x, y, pad) {
    for (const o of this.obstacles) if (dist2(x, y, o.x, o.y) < (o.r + pad) ** 2) return true;
    for (const w of this.walls) if (segPointDist2(w[0], w[1], w[2], w[3], x, y) < (w[4] / 2 + pad) ** 2) return true;
    return false;
  }

  mapInfo() {
    return {
      id: this.mapId,
      name: this.map.name,
      R: this.R,
      obstacles: this.obstacles.map((o) => [o.x, o.y, o.r, o.k]),
      walls: this.walls,
      bushes: this.bushes.map((b) => [b.x, b.y, b.r]),
      pois: this.map.pois,
      decor: this.map.decor || null,
      camps: this.camps.map((c) => [c.id, c.x, c.y, c.type]),
      seed: this.seed,
      matchTime: C.MATCH_TIME,
      landTime: C.LANDING_TIME,
    };
  }

  roster() {
    return [...this.players.values()].map((p) => [p.id, p.name, p.cos, p.isBot ? 1 : 0, WEAPON_IDS.indexOf(p.gear.weapon.type)]);
  }

  rebuildUnits() {
    const u = (this.units = []);
    for (const p of this.players.values()) if (p.alive && p.landed) u.push(p);
    for (const m of this.monsters) if (m.alive) u.push(m);
  }

  aliveCount() {
    let n = 0;
    for (const p of this.players.values()) if (p.alive) n++;
    return n;
  }

  // ---------------- 메인 루프 ----------------
  step(dt = C.DT) {
    if (this.state === 'landing') {
      this.tick++;
      for (const p of this.players.values()) {
        if (!p.isBot && p.inputQueue.length) p.input = p.inputQueue.splice(0, p.inputQueue.length).pop();
        p.ack = p.input.seq;
      }
      this.landT -= dt;
      if (this.landT <= 0) this.land();
      return;
    }
    if (this.state !== 'running') return;
    this.time += dt;
    this.tick++;
    this.rebuildUnits();
    for (const p of this.players.values()) {
      if (p.alive && p.isBot) botThink(this, p, dt);
    }
    for (const p of this.players.values()) {
      if (p.alive) this.updatePlayer(p, dt);
      else if (!p.isBot && p.inputQueue.length) p.input = p.inputQueue.splice(0, p.inputQueue.length).pop();
    }
    for (const m of this.monsters) {
      if (!m.alive) continue;
      updateMonster(this, m, dt);
      this.moveMonster(m, dt);
    }
    separateUnits(this.units);
    for (const u of this.units) if (u.alive) resolveStatic(u, this.obstacles, this.R);
    this.updateProjectiles(dt);
    this.updateAreas(dt);
    this.updateStatuses(dt);
    this.updateSouls(dt);
    this.updateZone(dt);
    this.updateSpawns(dt);
    if (this.tick % 30 === 0) this.cleanup();
    // 최종 자기장이 다 닫힌 뒤에도 끝나지 않으면 체력이 가장 많은 사람이 승리
    if (this.state === 'running' && this.time >= C.MATCH_TIME + 30) {
      const alive = [...this.players.values()].filter((p) => p.alive).sort((a, b) => b.hp / b.maxHp - a.hp / a.maxHp);
      this.end(alive[0] || null, 'time');
    }
  }

  clearEvents() {
    this.events.length = 0;
  }

  cleanup() {
    const keep = [];
    for (const m of this.monsters) {
      if (m.alive) keep.push(m);
      else this.byId.delete(m.id);
    }
    this.monsters = keep;
    this.souls = this.souls.filter((o) => o.alive).slice(-400);
  }

  updatePlayer(p, dt) {
    if (!p.isBot) {
      if (p.inputQueue.length) p.input = p.inputQueue.shift();
      p.ack = p.input.seq;
    }
    const inp = p.input;
    p.aim = inp.aim;
    if (p.invulnT > 0) p.invulnT -= dt;
    if (p.comboT > 0) {
      p.comboT -= dt;
      if (p.comboT <= 0) p.combo = 0;
    }
    for (const k of ['q', 'w', 'e', 'd']) if (p.cd[k] > 0) p.cd[k] -= dt;
    p.ult = Math.min(100, p.ult + C.ULT_PASSIVE * dt * (1 + (p.stats.ultGain || 0)));
    if (p.buffer) {
      p.buffer.t -= dt;
      if (p.buffer.t <= 0) p.buffer = null;
    }
    this.updateOffers(p, dt);
    this.updateAugTimers(p, dt);

    const pressed = (i) => {
      if (inp.p[i] > p.lp[i]) {
        p.lp[i] = inp.p[i];
        return true;
      }
      return false;
    };
    if (pressed(PRESS.d)) this.tryRoll(p);
    if (pressed(PRESS.act)) this.interact(p, inp.ti);
    if (p.wantAct) this.tryWantAct(p, dt);
    for (const key of ['q', 'w', 'e', 'r']) {
      if (pressed(PRESS[key]) && !this.trySkill(p, key)) p.buffer = { k: key, t: 0.3 };
    }
    const newAtk = pressed(PRESS.atk);
    if ((newAtk || inp.atk) && !this.tryBasic(p) && newAtk) p.buffer = { k: 'atk', t: 0.25 };
    if (p.buffer && this.canAct(p)) {
      const k = p.buffer.k;
      const ok = k === 'atk' ? this.tryBasic(p) : this.trySkill(p, k);
      if (ok) p.buffer = null;
    }

    if (p.act) this.updateAction(p, dt);
    this.updateChannel(p, dt);

    p.freeSpeed = this.playerSpeed(p, false);
    const speed = this.playerSpeed(p, true);
    const hitWall = stepBody(p, inp.mx, inp.my, speed, dt, this.obstacles, this.R);
    if (hitWall && p.st.slamT > 0) this.wallSlam(p);
    if (!p.alive) return;

    // 수풀 안에 있는지
    p.inBush = -1;
    for (let i = 0; i < this.bushes.length; i++) {
      const b = this.bushes[i];
      if (dist2(p.x, p.y, b.x, b.y) < b.r * b.r) {
        p.inBush = i;
        break;
      }
    }
    if (!p.outside && p.hp < p.maxHp) {
      const rate = C.REGEN_BASE + (this.time - p.lastDmgT > C.REGEN_DELAY ? C.REGEN_RATE : 0) + (p.stats.regen || 0);
      p.hp = Math.min(p.maxHp, p.hp + p.maxHp * rate * dt);
    }
  }

  playerSpeed(p, withAction) {
    if (p.st.stunT > 0 || p.st.rootT > 0) return 0;
    let s = C.BASE_SPEED * p.speedMult * this.slowMult(p);
    if (p.st.sprintT > 0) s *= 1.6;
    if (p.st.invisT > 0) s *= 1.25;
    if (p.st.hasteT > 0) s *= 1 + p.st.haste;
    if (withAction) {
      if (p.act) s *= p.act.moveMult;
      if (p.channel) s = 0;
    }
    return s;
  }

  moveMonster(m, dt) {
    const speed = m.state === MSTATE.windup || m.state === MSTATE.recover || m.st.rootT > 0 || m.st.stunT > 0 ? 0 : m.moveSpeed || 0;
    const hit = stepBody(m, m.mx || 0, m.my || 0, speed, dt, this.obstacles, this.R);
    if (hit && m.st.slamT > 0) this.wallSlam(m);
    if (!m.alive) return;
    const z = this.zone;
    if (z.dps > 0 && dist2(m.x, m.y, z.x, z.y) > (z.r + 40) ** 2) {
      m.hp -= m.maxHp * 0.3 * dt;
      if (m.hp <= 0) this.killUnit(m, null, { kind: 'zone' });
    }
  }

  // 레벨·직업·증강에 따른 능력치
  recomputeStats(p) {
    const wd = WEAPONS[p.gear.weapon.type];
    const s = (p.stats = {});
    for (const id of p.augs) {
      const a = AUG_BY_ID[id];
      if (a && a.stats) for (const k in a.stats) s[k] = (s[k] || 0) + a.stats[k];
    }
    const ratio = p.maxHp > 0 ? p.hp / p.maxHp : 1;
    p.maxHp = Math.round(C.BASE_HP * (wd.hp || 1) * C.levelMult(p.level) * (1 + (s.hp || 0)));
    p.hp = Math.min(p.maxHp, Math.max(1, ratio * p.maxHp));
    p.speedMult = (wd.speed || 1) * (1 + (s.speed || 0));
    p.cdMult = Math.max(0.4, 1 - (s.cdr || 0));
    p.r = C.PLAYER_R * (1 + (s.size || 0));
    p.mass = 1 + (s.size || 0) * 2;
    p.dr = 0;
    p.uiVer++;
  }

  // ---------------- 상자 → 증강 ----------------
  // 우클릭으로 고른 상자. 멀면 걸어가는 동안 기억해 두었다가 닿으면 열기 시작
  interact(p, targetId) {
    if (!p.alive) return;
    if (targetId) {
      p.wantAct = { id: targetId, t: 4 };
      return;
    }
    for (const c of this.chests) {
      if (!c.open && dist2(c.x, c.y, p.x, p.y) < C.INTERACT_RANGE ** 2) return this.startChannel(p, c);
    }
  }

  tryWantAct(p, dt) {
    const w = p.wantAct;
    w.t -= dt;
    const c = this.chests.find((q) => q.id === w.id && !q.open);
    if (!c || w.t <= 0) {
      p.wantAct = null;
      return;
    }
    if (p.st.stunT > 0 || dist2(c.x, c.y, p.x, p.y) > C.INTERACT_RANGE ** 2) return;
    // 걸음을 멈춘 뒤에 열기 시작
    if (Math.abs(p.input.mx) + Math.abs(p.input.my) > 0.2 || p.act) return;
    p.wantAct = null;
    this.startChannel(p, c);
  }

  startChannel(p, c) {
    if (p.act || p.st.stunT > 0) return;
    p.channel = { id: c.id, t: 0 };
    this.breakStealth(p);
  }

  updateChannel(p, dt) {
    const ch = p.channel;
    if (!ch) return;
    const c = this.chests.find((q) => q.id === ch.id);
    const moving = Math.abs(p.input.mx) + Math.abs(p.input.my) > 0.2;
    if (!c || c.open || moving || p.act || dist2(c.x, c.y, p.x, p.y) > (C.INTERACT_RANGE + 20) ** 2) {
      p.channel = null;
      return;
    }
    ch.t += dt;
    if (ch.t >= C.CHEST_OPEN) {
      p.channel = null;
      this.openChest(p, c);
    }
  }

  openChest(p, c) {
    c.open = true;
    p.chestsOpened++;
    const tier = rollTier(this.rng, c.kind, p.luck);
    this.emit({ e: 'chest', id: c.id, x: c.x, y: c.y, r: tier, by: p.id, k: c.kind });
    this.offerAugment(p, tier);
    // 열린 상자는 잠시 뒤 사라짐
    c.goneT = this.time + 4;
  }

  offerAugment(p, tier) {
    const owned = [...p.augs, ...p.offers.flatMap((o) => o.ids)];
    const ids = pickOffer(this.rng, tier, owned);
    if (!ids.length) return;
    const o = { id: this.nextOffer++, tier, ids, t: C.OFFER_TIME };
    p.offers.push(o);
    p.uiVer++;
    this.emit({ e: 'offer', to: p.id, o: o.id, r: tier, ids });
    if (tier === 2) this.emit({ e: 'prism', global: true, id: p.id });
  }

  updateOffers(p, dt) {
    if (!p.offers.length) return;
    const o = p.offers[0];
    o.t -= dt;
    let pick = -1;
    if (p.isBot) pick = o.t < C.OFFER_TIME - 1 ? Math.floor(this.rng() * o.ids.length) : -1;
    else if (p.input.po === o.id && p.input.pk >= 1 && p.input.pk <= o.ids.length) pick = p.input.pk - 1;
    if (pick < 0 && o.t <= 0) pick = Math.floor(this.rng() * o.ids.length);
    if (pick < 0) return;
    p.offers.shift();
    this.applyAugment(p, o.ids[pick]);
  }

  applyAugment(p, id) {
    const a = AUG_BY_ID[id];
    if (!a || p.augs.includes(id)) return;
    p.augs.push(id);
    if (a.flag) p.aug[a.flag] = true;
    if (a.grade) for (const k in a.grade) p.grade[k] = Math.max(p.grade[k], a.grade[k]);
    if (id === 'gambler') {
      p.luck += 0.5;
      const pool = AUGMENTS.filter((x) => x.tier === 1 && !p.augs.includes(x.id));
      if (pool.length) this.applyAugment(p, pool[Math.floor(this.rng() * pool.length)].id);
    }
    this.recomputeStats(p);
    this.emit({ e: 'aug', id: p.id, a: id, x: Math.round(p.x), y: Math.round(p.y), r: a.tier });
  }

  // ---------------- 경험치 영혼 ----------------
  dropSouls(x, y, total, maxN = 4) {
    const n = Math.max(1, Math.min(maxN, Math.round(total / 12)));
    for (let i = 0; i < n; i++) {
      const a = this.rng() * TAU;
      const sp = this.rng.range(90, 260);
      this.souls.push({ id: this.nextId++, x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, v: total / n, t: 0, alive: true });
    }
  }

  updateSouls(dt) {
    const f = Math.exp(-5 * dt);
    for (const o of this.souls) {
      if (!o.alive) continue;
      o.t += dt;
      if (o.t > C.XP_ORB_LIFE) {
        o.alive = false;
        continue;
      }
      o.x += o.vx * dt;
      o.y += o.vy * dt;
      o.vx *= f;
      o.vy *= f;
      if (o.t < 0.35) continue;
      let best = null;
      let bestD = C.XP_ORB_MAGNET ** 2;
      for (const p of this.players.values()) {
        if (!p.alive || !p.landed) continue;
        const d2 = dist2(o.x, o.y, p.x, p.y);
        if (d2 < bestD) {
          best = p;
          bestD = d2;
        }
      }
      if (!best) continue;
      const d = Math.sqrt(bestD);
      if (d < C.XP_ORB_PICK) {
        o.alive = false;
        this.gainXp(best, o.v);
        this.emit({ e: 'soul', to: best.id, a: Math.round(o.v) });
      } else {
        const sp = 380 + (1 - d / C.XP_ORB_MAGNET) * 700;
        o.vx = ((best.x - o.x) / d) * sp;
        o.vy = ((best.y - o.y) / d) * sp;
      }
    }
  }

  gainXp(p, amt) {
    if (!p.alive || p.level >= C.LEVEL_MAX) return;
    p.xp += amt;
    let leveled = false;
    while (p.xp >= p.xpNext && p.level < C.LEVEL_MAX) {
      p.xp -= p.xpNext;
      p.level++;
      p.xpNext = C.xpForLevel(p.level);
      leveled = true;
    }
    if (p.level >= C.LEVEL_MAX) p.xp = 0;
    if (leveled) {
      this.recomputeStats(p);
      this.heal(p, p.maxHp * 0.1);
      this.emit({ e: 'lvl', id: p.id, x: Math.round(p.x), y: Math.round(p.y), l: p.level });
    }
  }

  // 상자를 바닥에 새로 놓음 (몬스터 캠프 보상, 현상금 주머니)
  addChest(x, y, kind) {
    const c = { id: this.nextId++, x: Math.round(x), y: Math.round(y), kind, open: false };
    resolveStatic({ x: c.x, y: c.y, r: 20 }, this.obstacles, this.R);
    this.chests.push(c);
    this.emit({ e: 'chestdrop', id: c.id, x: c.x, y: c.y, k: kind });
    return c;
  }

  // ---------------- 처치 / 탈락 ----------------
  killUnit(u, src, ctx) {
    if (!u.alive) return;
    u.alive = false;
    u.hp = 0;
    if (!u.isPlayer) {
      const killer = src && src.isPlayer ? src : null;
      this.emit({ e: 'mdeath', id: u.id, x: Math.round(u.x), y: Math.round(u.y), t: MONSTERS[u.type].idx, k: killer ? killer.id : 0 });
      if (u.tele) {
        u.tele.alive = false;
        u.tele = null;
      }
      if (killer) {
        killer.monsterKills++;
        this.dropSouls(u.x, u.y, u.xp * (1 + this.time / 300), 4);
        if (u.camp) {
          const c = this.camps.find((q) => q.id === u.camp);
          if (c) {
            c.lastKiller = killer.id;
            c.lx = u.x;
            c.ly = u.y;
          }
        }
      }
      return;
    }
    // 플레이어 탈락 (목숨 1개)
    u.deaths++;
    u.placement = this.aliveCount() + 1;
    u.act = null;
    u.channel = null;
    u.dashT = 0;
    u.kbx = 0;
    u.kby = 0;
    u.offers = [];
    u.st = makeStatus();
    let killer = src && src.isPlayer && src !== u ? src : null;
    if (!killer && u.lastHitBy && this.time - u.lastHitByT < 8) {
      const k = this.players.get(u.lastHitBy);
      if (k && k !== u && k.alive) killer = k;
    }
    u.killerId = killer ? killer.id : 0;
    u.specId = u.killerId;
    // 현상금 주머니: 연속 처치가 쌓인 사람이 죽으면 좋은 상자가 터져 나옴
    const bounty = u.kills;
    if (bounty >= C.BOUNTY_MIN) {
      this.addChest(u.x, u.y, 'bounty');
      if (bounty >= 4) this.addChest(u.x + 50, u.y + 30, 'big');
      this.emit({ e: 'bountydrop', global: true, id: u.id, k: killer ? killer.id : 0, n: bounty, x: Math.round(u.x), y: Math.round(u.y) });
    }
    let multi = 0;
    if (killer) {
      killer.kills++;
      killer.multi = this.time - killer.lastKillT < 8 ? killer.multi + 1 : 1;
      killer.lastKillT = this.time;
      multi = killer.multi;
      this.gainXp(killer, 80 + 12 * u.level);
      if (killer.alive) this.heal(killer, killer.maxHp * C.KILL_HEAL);
      this.onKillAug(killer, u);
      if (killer.kills >= C.BOUNTY_MIN) this.emit({ e: 'bounty', global: true, id: killer.id, n: killer.kills });
      killer.uiVer++;
    }
    this.dropSouls(u.x, u.y, 40 + 10 * u.level, 4);
    this.emit({ e: 'death', id: u.id, x: Math.round(u.x), y: Math.round(u.y), k: killer ? killer.id : 0, fx: killer ? killer.cos.killfx : '' });
    this.emit({ e: 'kill', global: true, k: killer ? killer.id : 0, v: u.id, z: ctx && ctx.kind === 'zone' ? 1 : 0, m: multi, left: this.aliveCount() });
    u.uiVer++;
    const alive = [...this.players.values()].filter((p) => p.alive);
    if (alive.length <= 1) this.end(alive[0] || killer || null, 'last');
  }

  // ---------------- 자기장 ----------------
  updateZone(dt) {
    const z = this.zone;
    const phases = C.ZONE_PHASES;
    const next = phases[z.phase + 1];
    if (next && this.time >= next.at && z.stage !== 'warn') {
      // 다음 원: 지금 원 안에서 무작위 중심
      z.phase++;
      z.stage = 'warn';
      z.stageT = next.warn;
      z.fx = z.x;
      z.fy = z.y;
      z.fr = z.r;
      z.tr = this.R * next.frac;
      const room = Math.max(0, Math.min(z.r, this.R) - z.tr) * 0.85;
      const a = this.rng() * TAU;
      const d = Math.sqrt(this.rng()) * room;
      let tx = z.x + Math.cos(a) * d;
      let ty = z.y + Math.sin(a) * d;
      const td = Math.sqrt(tx * tx + ty * ty);
      if (td + z.tr > this.R) {
        tx *= Math.max(0, this.R - z.tr) / td;
        ty *= Math.max(0, this.R - z.tr) / td;
      }
      z.tx = tx;
      z.ty = ty;
      this.emit({ e: 'zonewarn', global: true, p: z.phase, t: next.warn });
    }
    if (z.stage === 'warn') {
      z.stageT -= dt;
      if (z.stageT <= 0) {
        z.stage = 'shrink';
        z.stageT = phases[z.phase].shrink;
        z.dps = phases[z.phase].dps;
        this.emit({ e: 'zone', global: true, p: z.phase });
      }
    } else if (z.stage === 'shrink') {
      z.stageT -= dt;
      const ph = phases[z.phase];
      const k = clamp(1 - z.stageT / ph.shrink, 0, 1);
      z.x = lerp(z.fx, z.tx, k);
      z.y = lerp(z.fy, z.ty, k);
      z.r = lerp(z.fr, z.tr, k);
      if (z.stageT <= 0) z.stage = 'wait';
    }
    for (const p of this.players.values()) {
      if (!p.alive || !p.landed) continue;
      p.outside = z.dps > 0 && dist2(p.x, p.y, z.x, z.y) > z.r * z.r;
      if (p.outside) {
        p.zoneTick -= dt;
        if (p.zoneTick <= 0) {
          p.zoneTick = 0.5;
          this.dealDamage(null, p, p.maxHp * z.dps * 0.5, { kind: 'zone' });
        }
      } else p.zoneTick = Math.min(p.zoneTick, 0.25);
    }
  }

  // ---------------- 정글 캠프 ----------------
  spawnCamp(c) {
    const def = CAMP_TYPES[c.type];
    c.mobs = def.mobs.map((t, i) => {
      const a = (i / def.mobs.length) * TAU;
      const m = this.spawnMonster(t, c.x + Math.cos(a) * (def.mobs.length > 1 ? 45 : 0), c.y + Math.sin(a) * (def.mobs.length > 1 ? 45 : 0), { camp: c.id });
      return m.id;
    });
    c.alive = true;
  }

  updateSpawns(dt) {
    const z = this.zone;
    for (const c of this.camps) {
      if (c.alive) {
        if (c.mobs.every((id) => {
          const m = this.byId.get(id);
          return !m || !m.alive;
        })) {
          c.alive = false;
          c.respawnT = CAMP_TYPES[c.type].respawn * 2;
          this.emit({ e: 'campclear', id: c.id, x: c.x, y: c.y });
          // 캠프 보상: 정리한 사람이 있으면 상자 (엘리트는 큰 상자)
          if (c.lastKiller) this.addChest(c.lx, c.ly, c.type === 'elite' || c.type === 'large' ? 'big' : 'small');
          c.lastKiller = 0;
        }
        continue;
      }
      c.respawnT -= dt;
      if (c.respawnT > 0) continue;
      if (z.dps > 0 && dist2(c.x, c.y, z.x, z.y) > (z.r - 80) ** 2) continue;
      // 바로 옆에 플레이어가 있으면 기다림
      let near = false;
      for (const p of this.players.values()) if (p.alive && dist2(p.x, p.y, c.x, c.y) < 260 * 260) near = true;
      if (!near) this.spawnCamp(c);
    }
    // 열고 나서 시간이 지난 상자 정리
    if (this.tick % 15 === 0 && this.chests.some((c) => c.open && c.goneT && this.time > c.goneT)) {
      this.chests = this.chests.filter((c) => !(c.open && c.goneT && this.time > c.goneT));
    }
  }

  spawnMonster(type, x, y, extra = {}) {
    const def = MONSTERS[type];
    const hpMult = 1 + this.time / 300;
    const m = {
      id: this.nextId++,
      isPlayer: false,
      type,
      x,
      y,
      r: def.r,
      mass: def.mass,
      kbRes: def.kbRes,
      hp: def.hp * hpMult,
      maxHp: def.hp * hpMult,
      alive: true,
      team: -1,
      aim: this.rng() * TAU,
      st: makeStatus(),
      kbx: 0,
      kby: 0,
      dashT: 0,
      dashSpd: 0,
      homeX: x,
      homeY: y,
      target: 0,
      thinkT: this.rng() * 0.4,
      atkT: 0.6 + this.rng(),
      state: 0,
      stateT: 0,
      wanderT: 0,
      wanderA: null,
      mx: 0,
      my: 0,
      moveSpeed: 0,
      xp: def.xp,
      ringT: 2.5,
      leash: extra.camp ? 420 : def.leash || 900,
      altar: null,
      camp: extra.camp || 0,
      tele: null,
      invulnT: 0,
      lastDmgT: -99,
      ccImmune: false,
    };
    resolveStatic(m, this.obstacles, this.R);
    this.monsters.push(m);
    this.byId.set(m.id, m);
    this.units.push(m);
    return m;
  }

  monsterDmgMult() {
    return 1 + this.time / 600;
  }

  // ---------------- 종료 ----------------
  end(winner, reason) {
    if (this.state === 'ended') return;
    this.state = 'ended';
    this.endReason = reason;
    if (winner) winner.placement = 1;
    this.winner = winner ? winner.id : 0;
    const all = [...this.players.values()];
    // 순위: 우승자 → 늦게 탈락한 순
    for (const p of all) if (!p.placement) p.placement = p === winner ? 1 : 2;
    all.sort((a, b) => a.placement - b.placement || b.kills - a.kills);
    this.results = all.map((p, i) => ({
      id: p.id,
      name: p.name,
      bot: p.isBot ? 1 : 0,
      placement: i + 1,
      kills: p.kills,
      deaths: p.deaths,
      score: p.kills,
      monsterKills: p.monsterKills,
      chests: p.chestsOpened,
      augs: p.augs.slice(),
      dmg: Math.round(p.dmgDealt),
      level: p.level,
      weapon: p.gear.weapon.type,
    }));
    this.emit({ e: 'end', global: true, w: this.winner, r: reason });
  }

  // ---------------- 스냅샷 ----------------
  // 죽은 뒤: 고른 대상 → 나를 죽인 사람 → 처치 수 1등 순으로 관전
  spectateTarget(me) {
    let t = me.specId ? this.players.get(me.specId) : null;
    if (t && t.alive) return t;
    t = null;
    for (const p of this.players.values()) if (p.alive && (!t || p.kills > t.kills)) t = p;
    me.specId = t ? t.id : 0;
    return t;
  }

  playerFlags(p) {
    let f = 0;
    if (p.dashT > 0) f |= PF.DASH;
    if (p.invulnT > 0) f |= PF.PROTECT;
    if (p.st.rootT > 0) f |= PF.ROOT;
    if (p.st.stunT > 0) f |= PF.STUN;
    if (p.st.invisT > 0) f |= PF.INVIS;
    if (p.inBush >= 0) f |= PF.BUSH;
    if (p.st.shield > 0) f |= PF.SHIELD;
    if (p.kills >= C.BOUNTY_MIN) f |= PF.BOUNTY;
    if (p.offers.length) f |= PF.OFFER;
    if (p.st.slows.length) f |= PF.SLOW;
    if (p.st.iframeT > 0) f |= PF.IFRAME;
    if (p.channel) f |= PF.CHANNEL;
    if (p.st.empT > 0) f |= PF.EMPOWER;
    if (p.st.burnT > 0) f |= PF.BURN;
    if (p.st.mark) f |= PF.MARK;
    if (p.st.bleed) f |= PF.BLEED;
    return f;
  }

  // 수풀 안의 적: 가까이 가거나 같은 수풀에 있거나, 방금 공격했으면 보임
  hiddenInBush(p, viewer, cx, cy) {
    if (p.inBush < 0) return false;
    if (this.time - p.lastAtkT < 1 || this.time - p.lastDmgT < 0.5) return false;
    if (viewer && viewer.alive && viewer.inBush === p.inBush) return false;
    return dist2(p.x, p.y, cx, cy) > 170 * 170;
  }

  snapshotFor(pid, lastUiVer = -1) {
    const me = this.players.get(pid);
    const R = Math.round;
    if (this.state === 'landing' || this.state === 'waiting') {
      const snap = { t: 'snap', tk: this.tick, tm: 0, st: this.state, lt: R(this.landT * 10) / 10, pl: [], mo: [], pr: [], ar: [], so: [], ch: this.chests.map((c) => [c.id, c.x, c.y, c.open ? 1 : 0, CHEST_KINDS.indexOf(c.kind)]), z: [0, 0, 0, R(this.R + 300), 0, 0, R(this.R + 300), 0, 0, -1], ev: this.events.filter((e) => e.global), ac: this.aliveCount() };
      if (me) snap.me = { id: me.id, al: 1, ld: 0, lx: me.input.lx, ly: me.input.ly, x: 0, y: 0, ack: me.ack, hp: me.hp, mhp: me.maxHp, cd: [0, 0, 0, 0], cdm: [1, 1, 1, 1], ult: 0, st: 0, chn: -1 };
      return snap;
    }
    let cx = 0;
    let cy = 0;
    let spec = null;
    if (me) {
      if (me.alive) {
        cx = me.x;
        cy = me.y;
      } else {
        spec = this.spectateTarget(me);
        cx = spec ? spec.x : me.x;
        cy = spec ? spec.y : me.y;
      }
    }
    const viewer = me && me.alive ? me : spec;
    const HW = C.AOI_HALF_W;
    const HH = C.AOI_HALF_H;
    const inBox = (x, y, pad) => Math.abs(x - cx) < HW + pad && Math.abs(y - cy) < HH + pad;
    // 시야: 거리 안 + 벽에 가리지 않음
    const VR2 = C.VISION_R * C.VISION_R;
    const walls = this.walls;
    const inView = (x, y, pad) => inBox(x, y, pad) && (x - cx) ** 2 + (y - cy) ** 2 < VR2 && !wallBlocked(cx, cy, x, y, walls, -8);
    const WI = (t) => WEAPON_IDS.indexOf(t);

    const pl = [];
    for (const p of this.players.values()) {
      if (!p.alive || !p.landed) continue;
      if (p !== viewer) {
        if (!inView(p.x, p.y, 80)) continue;
        if (p.st.invisT > 0 && (!viewer || dist2(p.x, p.y, cx, cy) > 140 * 140)) continue;
        if (this.hiddenInBush(p, viewer, cx, cy)) continue;
      }
      let act = 0;
      let actT = 0;
      if (p.act) {
        const a = p.act;
        act = a.key === 'basic' ? 1 + (a.step || 0) : { q: 4, w: 5, e: 8, r: 6 }[a.key];
        actT = R(Math.min(1, a.t / a.dur) * 100);
      } else if (p.channel) {
        act = 7;
        actT = R((p.channel.t / C.CHEST_OPEN) * 100);
      }
      pl.push([
        p.id,
        R(p.x),
        R(p.y),
        R((p.act && p.act.key === 'basic' ? p.act.dir : p.aim) * 100) / 100, // 기본 공격 중엔 대상 쪽을 봄
        Math.ceil(p.hp),
        p.maxHp,
        this.playerFlags(p),
        p.level,
        act,
        actT,
        WI(p.gear.weapon.type),
        p.kills,
        R(p.r),
        p.augs.length,
        0,
        R(p.st.shield),
      ]);
    }
    const mo = [];
    for (const m of this.monsters) {
      if (!m.alive || !inView(m.x, m.y, 80)) continue;
      const def = MONSTERS[m.type];
      const wind = m.state === MSTATE.windup ? R((1 - Math.max(0, m.stateT) / def.windup) * 100) : 0;
      mo.push([m.id, def.idx, R(m.x), R(m.y), Math.ceil(m.hp), R(m.maxHp), R(m.aim * 100) / 100, m.state, wind, m.st.stunT > 0 || m.st.rootT > 0 ? 1 : 0, m.st.slows.length ? 1 : 0]);
    }
    const pr = [];
    for (const q of this.projs) {
      if (!q.alive || (q.owner !== pid && !inView(q.x, q.y, 150))) continue;
      pr.push([q.id, PROJ_KINDS.indexOf(q.pkind), R(q.x), R(q.y), R(q.vx), R(q.vy), q.color ? WI(q.color) : -1, q.owner]);
    }
    const ar = [];
    for (const a of this.areas) {
      const rr = a.kind === 'line' ? a.len : a.r;
      if (!a.alive || (a.owner !== pid && !inView(a.x, a.y, rr + 50))) continue;
      ar.push([a.id, AREA_KINDS.indexOf(a.kind), R(a.x), R(a.y), R(a.r), R(a.t * 100), R(a.delay * 100), R(a.dur * 100), a.color ? WI(a.color) : -1, a.owner, R(a.ang * 100) / 100, R(a.len), R(a.width), a.team === -1 ? 1 : 0, a.outer ? R(a.outer.r0) : 0]);
    }
    const so = [];
    for (const o of this.souls) {
      if (!o.alive || !inView(o.x, o.y, 40)) continue;
      so.push([o.id, R(o.x), R(o.y), R(o.v)]);
    }
    const ch = [];
    for (const c of this.chests) {
      if (!inBox(c.x, c.y, 40)) continue;
      ch.push([c.id, c.x, c.y, c.open ? 1 : 0, CHEST_KINDS.indexOf(c.kind)]);
    }
    const z = this.zone;
    const ev = [];
    for (const e of this.events) {
      if (e.to) {
        if (e.to === pid) ev.push(e);
      } else if (e.global || (e.x !== undefined && inView(e.x, e.y, 260))) ev.push(e);
    }
    const snap = {
      t: 'snap',
      tk: this.tick,
      tm: R(this.time * 1000) / 1000,
      st: this.state,
      z: [z.dps > 0 || z.stage !== 'wait' ? 1 : 0, R(z.x), R(z.y), R(z.r), R(z.tx), R(z.ty), R(z.tr), ZONE_STAGE.indexOf(z.stage), R(z.stageT * 10) / 10, z.phase],
      pl,
      mo,
      pr,
      ar,
      so,
      ch,
      ev,
      ac: this.aliveCount(),
    };
    if (me) {
      const m = {
        id: me.id,
        al: me.alive ? 1 : 0,
        ld: me.landed ? 1 : 0,
        x: R(me.x * 100) / 100,
        y: R(me.y * 100) / 100,
        kbx: R(me.kbx * 10) / 10,
        kby: R(me.kby * 10) / 10,
        dt: R(me.dashT * 1000) / 1000,
        ds: R(me.dashSpd),
        ddx: R(me.ddx * 1000) / 1000,
        ddy: R(me.ddy * 1000) / 1000,
        ms: R(me.freeSpeed * 10) / 10,
        r: R(me.r * 10) / 10,
        hp: Math.ceil(me.hp),
        mhp: me.maxHp,
        lv: me.level,
        xp: Math.floor(me.xp),
        xn: me.xpNext,
        cd: [me.cd.q, me.cd.w, me.cd.e, me.cd.d].map((v) => Math.max(0, R(v * 100) / 100)),
        cdm: [me.cdMax.q, me.cdMax.w, me.cdMax.e, me.cdMax.d].map((v) => R(v * 100) / 100),
        ult: R(me.ult),
        k: me.kills,
        pl: me.placement,
        sp: spec ? spec.id : 0,
        ack: me.ack,
        st: me.st.stunT > 0 ? 2 : me.st.rootT > 0 ? 1 : 0,
        chn: me.channel ? R((me.channel.t / C.CHEST_OPEN) * 100) : -1,
        of: me.offers.length ? { id: me.offers[0].id, r: me.offers[0].tier, ids: me.offers[0].ids, t: R(me.offers[0].t * 10) / 10, n: me.offers.length } : null,
        dmg: R(me.dmgDealt),
        co: me.chestsOpened,
        mk: me.monsterKills,
        kb: me.killerId,
      };
      if (me.uiVer !== lastUiVer) {
        m.ui = {
          v: me.uiVer,
          gear: { weapon: me.gear.weapon },
          grade: { ...me.grade },
          augs: me.augs.slice(),
          speedMult: me.speedMult,
        };
      }
      snap.me = m;
    }
    return snap;
  }
}

Object.assign(Game.prototype, CombatMixin);
