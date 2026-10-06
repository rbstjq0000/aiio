// 게임 시뮬레이션 (서버 권한). 서버와 브라우저 연습 모드가 같은 코드를 실행한다.
// 규칙 근거: docs/COMBAT_DESIGN.md
import { TAU, clamp, dist2, lerp, makeRng, shuffle, segPointDist2 } from './math.js';
import * as C from './constants.js';
import { WEAPONS, ARMORS, BOOTS, RARITIES, ultGrade, WEAPON_IDS, ARMOR_IDS, BOOT_IDS, SLOT_KINDS, KIND_IDS, makeItem, rollItem, rollRarity, ORBS, runeResult } from './items.js';
import { MONSTERS, MSTATE, updateMonster } from './monsters.js';
import { MAPS, DEFAULT_MAP, CAMP_TYPES } from './maps.js';
import { NavGrid } from './nav.js';

const NAV_CACHE = new Map();
import { resolveStatic, separateUnits, stepBody, wallBlocked } from './physics.js';
import { randomCosmetics, sanitizeCosmetics } from './cosmetics.js';
import { CombatMixin, PROJ_KINDS, AREA_KINDS } from './combat.js';
import { BOT_NAMES, botThink, makeBotBrain } from './bot.js';

export { PROJ_KINDS, AREA_KINDS };

// 플레이어 상태 플래그 (스냅샷)
export const PF = {
  DASH: 1,
  PROTECT: 2,
  ROOT: 4,
  STUN: 8,
  INVIS: 16,
  BULWARK: 32,
  SHIELD: 64,
  SPRINT: 128,
  RITUAL: 256,
  SLOW: 512,
  IFRAME: 1024,
  CHANNEL: 2048,
  EMPOWER: 4096,
  BURN: 8192,
  MARK: 16384,
  BLEED: 32768,
};
export const ALTAR_STATE = ['idle', 'warn', 'guarded', 'dropped', 'taken'];
export const KIND_INDEX = { skill: 0, armor: 1, boots: 2 };

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
  return { seq: 0, mx: 0, my: 0, aim: 0, atk: false, cx: 0, cy: 0, ti: 0, at: 0, p: new Array(C.PRESS_N).fill(0) };
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
  inp.at = int(raw.at, 0); // 롤식 기본 공격 대상 (우클릭/A+클릭으로 고른 적)
  return inp;
}

export function encodeItem(it) {
  return it ? [KIND_INDEX[it.kind], KIND_IDS[it.kind].indexOf(it.type), it.rarity] : null;
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
    this.time = 0;
    this.tick = 0;
    this.state = 'waiting';
    this.players = new Map();
    this.byId = new Map();
    this.units = [];
    this.monsters = [];
    this.projs = [];
    this.areas = [];
    this.souls = [];
    this.items = [];
    this.chests = [];
    this.altars = [];
    this.groundOrbs = [];
    this.obstacles = [];
    this.events = [];
    this.nextId = 1;
    this.R = 2000;
    this.zone = null;
    this.spawnT = 0;
    this.eliteT = 20;
    this.startCount = 0;
    this.results = null;
    this.winner = 0;
    this.endReason = '';
  }

  // ---------------- 참가자 ----------------
  addPlayer({ name = '영혼', isBot = false, weapon = 'greatsword', cosmetics = null, skill = 0.5 } = {}) {
    const id = this.nextId++;
    const w = WEAPONS[weapon] ? weapon : 'greatsword';
    const p = {
      id,
      isPlayer: true,
      type: 'player',
      name: String(name).slice(0, 16) || '영혼',
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
      hp: C.BASE_HP,
      maxHp: C.BASE_HP,
      level: 1,
      xp: 0,
      xpNext: C.xpForLevel(1),
      gear: { weapon: makeItem('weapon', w, 0), armor: makeItem('armor', 'cloth', 0), boots: makeItem('boots', 'swift', 0) },
      grade: { q: 0, w: 0, e: 0 },
      cd: { q: 0, w: 0, e: 0, d: 0 },
      cdMax: { q: 1, w: 1, e: 1, d: 1, f: 1 },
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
      lastHitBy: 0,
      lastHitByT: -99,
      orbs: [],
      orbScore: 0,
      orbTakes: 0,
      ritualT: -1,
      kills: 0,
      deaths: 0,
      dmgDealt: 0,
      monsterKills: 0,
      chestsOpened: 0,
      multi: 0,
      lastKillT: -99,
      respawnT: 0,
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
    if (this.state !== 'running') {
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

  spectate(id, dir = 1) {
    const me = this.players.get(id);
    if (!me || me.alive) return;
    // 오브 보유자 우선, 없으면 생존자 전체
    let alive = [...this.players.values()].filter((p) => p.alive && p.orbs.length);
    if (!alive.length) alive = [...this.players.values()].filter((p) => p.alive);
    if (!alive.length) return;
    let idx = alive.findIndex((p) => p.id === me.specId);
    idx = (idx + dir + alive.length) % alive.length;
    me.specId = alive[idx].id;
  }

  // ---------------- 시작 / 맵 ----------------
  start() {
    if (this.fillTo > this.players.size) this.fillBots();
    this.startCount = this.players.size;
    this.loadMap(this.mapId);
    const ps = shuffle([...this.players.values()], this.rng);
    const spawns = shuffle(this.map.spawns.slice(), this.rng);
    ps.forEach((p, i) => {
      const sp = spawns[i % spawns.length];
      const a = this.rng() * TAU;
      p.x = sp[0] + (i >= spawns.length ? Math.cos(a) * 60 : 0);
      p.y = sp[1] + (i >= spawns.length ? Math.sin(a) * 60 : 0);
      resolveStatic(p, this.obstacles, this.R);
      p.aim = Math.atan2(-p.y, -p.x);
      p.input.aim = p.aim;
      p.invulnT = C.SPAWN_PROTECT;
    });
    const zc = this.map.zone;
    this.zone = { active: false, x: 0, y: 0, r: this.R, fx: 0, fy: 0, fr: this.R, tx: zc.x, ty: zc.y, tr: this.R * C.ZONE_MIN_FRAC };
    this.rebuildUnits();
    for (const c of this.camps) if (c.type !== 'elite') this.spawnCamp(c);
    this.state = 'running';
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
    if (!NAV_CACHE.has(m.id)) NAV_CACHE.set(m.id, new NavGrid(m.R, this.obstacles, m.walls));
    this.nav = NAV_CACHE.get(m.id);
    this.altars = m.altars.map((al, i) => ({ i, x: al.x, y: al.y, state: 'idle', guardian: 0 }));
    this.chests = m.chests.map((c) => ({ id: this.nextId++, x: c.x, y: c.y, open: false, respawnT: 0 }));
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
      decor: this.map.decor || null,
      altars: this.altars.map((a) => [a.i, a.x, a.y]),
      camps: this.camps.map((c) => [c.id, c.x, c.y, c.type]),
      seed: this.seed,
      matchTime: C.MATCH_TIME,
    };
  }

  roster() {
    return [...this.players.values()].map((p) => [p.id, p.name, p.cos, p.isBot ? 1 : 0]);
  }

  rebuildUnits() {
    const u = (this.units = []);
    for (const p of this.players.values()) if (p.alive) u.push(p);
    for (const m of this.monsters) if (m.alive) u.push(m);
  }

  // ---------------- 메인 루프 ----------------
  step(dt = C.DT) {
    if (this.state !== 'running') return;
    this.time += dt;
    this.tick++;
    this.rebuildUnits();
    for (const p of this.players.values()) {
      if (p.alive && p.isBot) botThink(this, p, dt);
    }
    for (const p of this.players.values()) {
      if (p.alive) this.updatePlayer(p, dt);
      else this.updateDead(p, dt);
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
    this.updateLoot(dt);
    this.updateObjectives(dt);
    this.updateZone(dt);
    this.updateSpawns(dt);
    if (this.tick % 30 === 0) this.cleanup();
    if (this.state === 'running' && this.time >= C.MATCH_TIME) this.end(null, 'time');
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
    this.items = this.items.filter((it) => this.time - it.t < 90);
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
    p.ult = Math.min(100, p.ult + C.ULT_PASSIVE * dt * (p.orbs.includes(2) ? 2 : 1));
    if (p.buffer) {
      p.buffer.t -= dt;
      if (p.buffer.t <= 0) p.buffer = null;
    }

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
    this.autoPickup(p);

    p.freeSpeed = this.playerSpeed(p, false);
    const speed = this.playerSpeed(p, true);
    const hitWall = stepBody(p, inp.mx, inp.my, speed, dt, this.obstacles, this.R);
    if (hitWall && p.st.slamT > 0) this.wallSlam(p);
    if (!p.alive) return;

    if (p.orbs.length) p.orbScore += p.orbs.length * dt;
    if (p.ritualT >= 0) {
      p.ritualT -= dt;
      if (p.ritualT <= 0) {
        this.end(p, 'ritual');
        return;
      }
    }
    if (!p.outside && p.hp < p.maxHp) {
      const rate = C.REGEN_BASE + (this.time - p.lastDmgT > C.REGEN_DELAY ? C.REGEN_RATE : 0);
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
    if (z.active && dist2(m.x, m.y, z.x, z.y) > (z.r + 40) ** 2) {
      m.hp -= m.maxHp * 0.3 * dt;
      if (m.hp <= 0) this.killUnit(m, null, { kind: 'zone' });
    }
  }

  // 장비 등급/레벨/오브에 따른 능력치
  recomputeStats(p) {
    const armor = ARMORS[p.gear.armor.type];
    const ratio = p.maxHp > 0 ? p.hp / p.maxHp : 1;
    const wd = WEAPONS[p.gear.weapon.type];
    p.maxHp = Math.round(C.BASE_HP * (wd.hp || 1) * C.levelMult(p.level) * armor.hpMult * RARITIES[p.gear.armor.rarity].mult * (1 + C.ORB_HP_PER * p.orbs.length));
    p.hp = Math.min(p.maxHp, Math.max(1, ratio * p.maxHp));
    const boots = BOOTS[p.gear.boots.type];
    const bm = RARITIES[p.gear.boots.rarity].mult;
    p.speedMult = (wd.speed || 1) * armor.speedMult * (1 + boots.speed * bm) * (1 + C.ORB_SPEED_PER * p.orbs.length);
    p.cdMult = (p.orbs.includes(2) ? 0.7 : 1) * (1 - boots.cdr * bm);
    p.dr = boots.dr * bm;
    p.uiVer++;
  }

  // ---------------- 상자/장비 ----------------
  // 우클릭으로 고른 상자/장비. 멀면 걸어가는 동안 기억해 두었다가 닿으면 실행
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
    const it = this.items.find((g) => g.id === w.id);
    const c = it ? null : this.chests.find((q) => q.id === w.id && !q.open);
    const tgt = it || c;
    if (!tgt || w.t <= 0) {
      p.wantAct = null;
      return;
    }
    if (p.st.stunT > 0 || dist2(tgt.x, tgt.y, p.x, p.y) > C.INTERACT_RANGE ** 2) return;
    // 상자는 걸음을 멈춘 뒤에 열기 시작 (도착하면서 아직 움직이는 중이면 기다림)
    if (c && (Math.abs(p.input.mx) + Math.abs(p.input.my) > 0.2 || p.act)) return;
    p.wantAct = null;
    if (it) this.equip(p, it);
    else this.startChannel(p, c);
  }

  isUpgrade(p, it) {
    return it.kind === 'skill' ? runeResult(p.grade[it.type], it.rarity) >= 0 : it.rarity > p.gear[it.kind].rarity;
  }

  // 밟고 지나가면 자동으로 줍기: 쓸 수 있는 각인, 지금보다 높은 등급의 갑옷·신발
  autoPickup(p) {
    if (!this.items.length || p.st.stunT > 0) return;
    for (const gi of this.items) {
      if (this.time - gi.t < 0.6 || dist2(gi.x, gi.y, p.x, p.y) > (p.r + 24) ** 2) continue;
      if (this.isUpgrade(p, gi.item)) {
        this.equip(p, gi);
        return;
      }
    }
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
      c.open = true;
      c.respawnT = C.CHEST_RESPAWN;
      p.chestsOpened++;
      const it = rollItem(this.rng, this.time);
      const gi = this.dropItem(it, c.x, c.y + 30);
      this.emit({ e: 'chest', id: c.id, x: c.x, y: c.y, r: it.rarity, by: p.id });
      // 연 사람에게 쓸모 있으면 바로 장착 (아니면 바닥에 남김)
      if (this.isUpgrade(p, it)) this.equip(p, gi);
    }
  }

  dropItem(item, x, y) {
    const a = this.rng() * TAU;
    const gi = { id: this.nextId++, item, x: x + Math.cos(a) * 12, y: y + Math.sin(a) * 12, t: this.time };
    resolveStatic({ x: gi.x, y: gi.y, r: 10 }, this.obstacles, this.R);
    this.items.push(gi);
    return gi;
  }

  equip(p, gi) {
    const kind = gi.item.kind;
    if (kind === 'skill') {
      // 스킬 각인: 더 높은 등급이면 그 등급으로, 같은 등급이면 합성해 한 단계 상승 (소모)
      const slot = gi.item.type;
      const next = runeResult(p.grade[slot], gi.item.rarity);
      if (next < 0) {
        this.emit({ e: 'equipfail', to: p.id });
        return;
      }
      const beforeR = ultGrade(p.grade);
      p.grade[slot] = next;
      this.items.splice(this.items.indexOf(gi), 1);
      p.uiVer++;
      this.emit({ e: 'equip', id: p.id, x: Math.round(p.x), y: Math.round(p.y), r: next, s: slot });
      const afterR = ultGrade(p.grade);
      if (afterR > beforeR) this.emit({ e: 'setbonus', id: p.id, x: Math.round(p.x), y: Math.round(p.y), r: afterR });
      return;
    }
    const old = p.gear[kind];
    p.gear[kind] = gi.item;
    this.items.splice(this.items.indexOf(gi), 1);
    if (old) this.dropItem(old, p.x, p.y);
    this.recomputeStats(p);
    this.emit({ e: 'equip', id: p.id, x: Math.round(p.x), y: Math.round(p.y), r: gi.item.rarity });
  }

  updateLoot(dt) {
    for (const c of this.chests) {
      if (!c.open) continue;
      c.respawnT -= dt;
      if (c.respawnT <= 0) c.open = false;
    }
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
        if (!p.alive) continue;
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

  // ---------------- 처치 / 부활 ----------------
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
        this.dropSouls(u.x, u.y, u.xp * (1 + this.time / 300), u.type === 'guardian' ? 8 : 4);
      }
      // 스킬 각인: 일반 몬스터도 낮은 확률로, 엘리트는 확정(높은 등급)
      const runeChance = { shade: 0.05, archer: 0.06, elite: 1, guardian: 1 }[u.type] || 0;
      if (killer && u.camp) {
        const c = this.camps.find((q) => q.id === u.camp);
        if (c) {
          c.lastKiller = killer.id;
          c.lx = u.x;
          c.ly = u.y;
        }
      }
      if (killer && this.rng() < runeChance) {
        const bonus = u.type === 'guardian' ? 0.5 : u.type === 'elite' ? 0.2 : 0;
        const slot = ['q', 'w', 'e'][Math.floor(this.rng() * 3)];
        this.dropItem(makeItem('skill', slot, Math.max(1, rollRarity(this.rng, this.time, bonus))), u.x, u.y);
      }
      if (u.altar != null) this.onGuardianDeath(u);
      return;
    }
    u.deaths++;
    u.respawnT = C.respawnDelay(this.time, u.level);
    u.act = null;
    u.channel = null;
    u.dashT = 0;
    u.kbx = 0;
    u.kby = 0;
    u.st = makeStatus();
    let killer = src && src.isPlayer && src !== u ? src : null;
    if (!killer && u.lastHitBy && this.time - u.lastHitByT < 8) {
      const k = this.players.get(u.lastHitBy);
      if (k && k !== u) killer = k;
    }
    u.killerId = killer ? killer.id : 0;
    u.specId = u.killerId;
    // 오브 전부 떨어뜨림
    if (u.ritualT >= 0) this.emit({ e: 'ritualfail', global: true, id: u.id });
    u.ritualT = -1;
    for (const i of u.orbs) this.dropOrb(i, u.x, u.y);
    u.orbs = [];
    // 사망 패널티: 가장 높은 등급의 스킬 하나가 한 단계 강등
    const top = ['q', 'w', 'e'].sort((a, b) => u.grade[b] - u.grade[a])[0];
    if (u.grade[top] > 0) {
      u.grade[top]--;
      this.emit({ e: 'demote', to: u.id, s: top, r: u.grade[top] });
    }
    this.recomputeStats(u);
    let multi = 0;
    if (killer) {
      killer.kills++;
      killer.multi = this.time - killer.lastKillT < 8 ? killer.multi + 1 : 1;
      killer.lastKillT = this.time;
      multi = killer.multi;
      this.gainXp(killer, 60 + 10 * u.level);
      if (killer.alive) this.heal(killer, killer.maxHp * C.KILL_HEAL);
      killer.uiVer++;
    }
    this.emit({ e: 'death', id: u.id, x: Math.round(u.x), y: Math.round(u.y), k: killer ? killer.id : 0, fx: killer ? killer.cos.killfx : '' });
    this.emit({ e: 'kill', global: true, k: killer ? killer.id : 0, v: u.id, z: ctx && ctx.kind === 'zone' ? 1 : 0, m: multi });
    u.uiVer++;
  }

  updateDead(p, dt) {
    if (p.left) return;
    p.respawnT -= dt;
    if (p.respawnT > 0) return;
    const [x, y] = this.safeSpot();
    p.x = x;
    p.y = y;
    p.alive = true;
    p.hp = p.maxHp;
    p.invulnT = C.RESPAWN_PROTECT;
    p.lastDmgT = -99;
    p.lastHitBy = 0;
    p.combo = 0;
    p.buffer = null;
    this.units.push(p);
    this.emit({ e: 'respawn', id: p.id, x: Math.round(x), y: Math.round(y) });
    p.uiVer++;
  }

  // 살아있는 적에게서 가장 먼, 안전지대 안의 지점
  safeSpot() {
    const z = this.zone;
    const maxR = z.active ? z.r * 0.85 : this.R * 0.86;
    let best = [z.x, z.y];
    let bestScore = -1;
    for (let k = 0; k < 30; k++) {
      const a = this.rng() * TAU;
      const d = Math.sqrt(this.rng()) * maxR;
      const x = z.x + Math.cos(a) * d;
      const y = z.y + Math.sin(a) * d;
      if (x * x + y * y > (this.R - 60) ** 2 || this.blocked(x, y, 40)) continue;
      // 몬스터 바로 옆에서 부활하지 않게
      if (this.monsters.some((m) => m.alive && dist2(x, y, m.x, m.y) < 480 * 480)) continue;
      let minD = Infinity;
      for (const p of this.players.values()) if (p.alive) minD = Math.min(minD, dist2(x, y, p.x, p.y));
      if (minD > bestScore) {
        bestScore = minD;
        best = [x, y];
      }
    }
    return best;
  }

  // ---------------- 오브 (승리 조건) ----------------
  updateObjectives(dt) {
    for (const al of this.altars) {
      const at = C.ORB_TIMES[al.i];
      if (al.state === 'idle' && this.time >= at - C.ORB_WARN) {
        al.state = 'warn';
        this.emit({ e: 'orbwarn', global: true, i: al.i, x: al.x, y: al.y });
      } else if (al.state === 'warn' && this.time >= at) {
        al.state = 'guarded';
        const g = this.spawnMonster('guardian', al.x, al.y, { altar: al.i });
        g.ccImmune = true;
        al.guardian = g.id;
        this.emit({ e: 'orbspawn', global: true, i: al.i, x: al.x, y: al.y });
      }
    }
    for (const o of this.groundOrbs) {
      o.t += dt;
      if (o.t < 1) continue;
      for (const p of this.players.values()) {
        if (!p.alive || dist2(p.x, p.y, o.x, o.y) > (p.r + 22) ** 2) continue;
        o.taken = true;
        p.orbs.push(o.i);
        p.orbTakes++;
        p.invulnT = Math.max(p.invulnT, C.ORB_PROTECT);
        this.recomputeStats(p);
        const al = this.altars[o.i];
        al.state = 'taken';
        this.emit({ e: 'orbtake', global: true, i: o.i, id: p.id, n: p.orbs.length });
        if (p.orbs.length >= 3 && p.ritualT < 0) {
          p.ritualT = C.RITUAL_TIME;
          this.emit({ e: 'ritual', global: true, id: p.id, x: Math.round(p.x), y: Math.round(p.y) });
        }
        break;
      }
    }
    if (this.groundOrbs.some((o) => o.taken)) this.groundOrbs = this.groundOrbs.filter((o) => !o.taken);
  }

  dropOrb(i, x, y) {
    const a = this.rng() * TAU;
    const o = { i, x: x + Math.cos(a) * 30, y: y + Math.sin(a) * 30, t: 0 };
    resolveStatic({ x: o.x, y: o.y, r: 14 }, this.obstacles, this.R);
    this.groundOrbs.push(o);
    this.altars[i].state = 'dropped';
    this.emit({ e: 'orbdrop', global: true, i, x: Math.round(o.x), y: Math.round(o.y) });
  }

  onGuardianDeath(g) {
    const al = this.altars[g.altar];
    al.guardian = 0;
    this.dropOrb(al.i, al.x, al.y);
  }

  // ---------------- 스틱스 강 (8분부터) ----------------
  updateZone(dt) {
    const z = this.zone;
    if (this.time >= C.ZONE_START) {
      if (!z.active) {
        z.active = true;
        z.fx = z.x;
        z.fy = z.y;
        z.fr = z.r;
        this.emit({ e: 'zone', global: true });
      }
      const k = clamp((this.time - C.ZONE_START) / (C.ZONE_END - C.ZONE_START), 0, 1);
      z.x = lerp(z.fx, z.tx, k);
      z.y = lerp(z.fy, z.ty, k);
      z.r = lerp(z.fr, z.tr, k);
    }
    for (const p of this.players.values()) {
      if (!p.alive) continue;
      p.outside = z.active && dist2(p.x, p.y, z.x, z.y) > z.r * z.r;
      if (p.outside) {
        p.zoneTick -= dt;
        if (p.zoneTick <= 0) {
          p.zoneTick = 0.5;
          this.dealDamage(null, p, p.maxHp * C.ZONE_DPS * 0.5, { kind: 'zone' });
        }
      } else p.zoneTick = Math.min(p.zoneTick, 0.25);
    }
  }

  // ---------------- 몬스터 ----------------
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
          c.respawnT = CAMP_TYPES[c.type].respawn;
          this.emit({ e: 'campclear', id: c.id, x: c.x, y: c.y });
          // 캠프 보상: 정리한 사람이 있으면 스킬 각인 (큰 캠프일수록 확률 높음)
          const chance = { small: 0.5, ranged: 0.7, large: 1 }[c.type] || 0;
          if (c.lastKiller && this.rng() < chance) {
            const slot = ['q', 'w', 'e'][Math.floor(this.rng() * 3)];
            this.dropItem(makeItem('skill', slot, Math.max(1, rollRarity(this.rng, this.time, c.type === 'large' ? 0.1 : 0))), c.lx, c.ly);
          }
          c.lastKiller = 0;
        }
        continue;
      }
      c.respawnT -= dt;
      if (c.respawnT > 0) continue;
      if (z.active && dist2(c.x, c.y, z.x, z.y) > (z.r - 80) ** 2) continue;
      // 바로 옆에 플레이어가 있으면 기다림
      let near = false;
      for (const p of this.players.values()) if (p.alive && dist2(p.x, p.y, c.x, c.y) < 260 * 260) near = true;
      if (!near) this.spawnCamp(c);
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
      altar: extra.altar ?? null,
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
    if (this.state !== 'running') return;
    this.state = 'ended';
    this.endReason = reason;
    const all = [...this.players.values()];
    // 시간 종료: 오브 보유 점수 → 처치 → 피해량 순
    const rank = (a, b) => b.orbScore - a.orbScore || b.kills - a.kills || b.dmgDealt - a.dmgDealt;
    if (!winner) {
      all.sort(rank);
      winner = all[0];
    }
    this.winner = winner ? winner.id : 0;
    const rest = all.filter((p) => p !== winner).sort(rank);
    const ordered = winner ? [winner, ...rest] : rest;
    this.results = ordered.map((p, i) => ({
      id: p.id,
      name: p.name,
      bot: p.isBot ? 1 : 0,
      placement: i + 1,
      kills: p.kills,
      deaths: p.deaths,
      orbs: p.orbs.length,
      score: Math.floor(p.orbScore),
      orbTakes: p.orbTakes,
      monsterKills: p.monsterKills,
      chests: p.chestsOpened,
      dmg: Math.round(p.dmgDealt),
      level: p.level,
      weapon: p.gear.weapon.type,
    }));
    this.emit({ e: 'end', global: true, w: this.winner, r: reason });
  }

  // ---------------- 스냅샷 ----------------
  // 죽어 있는 동안: 고른 대상 → 오브 보유자 → 나를 죽인 사람 순으로 관전
  spectateTarget(me) {
    let t = me.specId ? this.players.get(me.specId) : null;
    if (t && t.alive) return t;
    t = null;
    for (const p of this.players.values()) if (p.alive && p.orbs.length && (!t || p.orbs.length > t.orbs.length)) t = p;
    if (!t && me.killerId) {
      const k = this.players.get(me.killerId);
      if (k && k.alive) t = k;
    }
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
    if (p.st.bulwarkT > 0) f |= PF.BULWARK;
    if (p.st.shield > 0) f |= PF.SHIELD;
    if (p.st.sprintT > 0) f |= PF.SPRINT;
    if (p.ritualT >= 0) f |= PF.RITUAL;
    if (p.st.slows.length) f |= PF.SLOW;
    if (p.st.iframeT > 0) f |= PF.IFRAME;
    if (p.channel) f |= PF.CHANNEL;
    if (p.st.empT > 0) f |= PF.EMPOWER;
    if (p.st.burnT > 0) f |= PF.BURN;
    if (p.st.mark) f |= PF.MARK;
    if (p.st.bleed) f |= PF.BLEED;
    return f;
  }

  snapshotFor(pid, lastUiVer = -1) {
    const me = this.players.get(pid);
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
    const HW = C.AOI_HALF_W;
    const HH = C.AOI_HALF_H;
    const inBox = (x, y, pad) => Math.abs(x - cx) < HW + pad && Math.abs(y - cy) < HH + pad;
    // 시야: 거리 안 + 벽에 가리지 않음
    const VR2 = C.VISION_R * C.VISION_R;
    const walls = this.walls;
    const inView = (x, y, pad) => inBox(x, y, pad) && (x - cx) ** 2 + (y - cy) ** 2 < VR2 && !wallBlocked(cx, cy, x, y, walls, -8);
    const R = Math.round;
    const WI = (t) => WEAPON_IDS.indexOf(t);

    const pl = [];
    for (const p of this.players.values()) {
      if (!p.alive) continue;
      if (p.id !== pid) {
        if (!inView(p.x, p.y, 80)) continue;
        // 은신: 가까이 있을 때만 보임
        if (p.st.invisT > 0 && (!me || !me.alive || dist2(p.x, p.y, me.x, me.y) > 140 * 140)) continue;
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
        ultGrade(p.grade),
        ARMOR_IDS.indexOf(p.gear.armor.type),
        BOOT_IDS.indexOf(p.gear.boots.type),
        p.orbs.length,
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
    const it = [];
    for (const g of this.items) {
      if (!inView(g.x, g.y, 40)) continue;
      it.push([g.id, ...encodeItem(g.item), R(g.x), R(g.y)]);
    }
    const ch = [];
    for (const c of this.chests) {
      if (!inBox(c.x, c.y, 40)) continue;
      ch.push([c.id, c.x, c.y, c.open ? 1 : 0]);
    }
    // 전체 공개 정보: 제단, 떨어진 오브, 오브 보유자
    const al = this.altars.map((a) => {
      const g = a.guardian ? this.byId.get(a.guardian) : null;
      return [a.i, ALTAR_STATE.indexOf(a.state), g && g.alive ? R((g.hp / g.maxHp) * 100) : 0];
    });
    const go = this.groundOrbs.map((o) => [o.i, R(o.x), R(o.y)]);
    const ca = [];
    for (const p of this.players.values()) {
      if (p.alive && p.orbs.length) ca.push([p.id, R(p.x), R(p.y), p.orbs.length, p.ritualT >= 0 ? R(p.ritualT * 10) / 10 : -1]);
    }
    const sc = [...this.players.values()]
      .filter((p) => p.orbScore > 0)
      .sort((a, b) => b.orbScore - a.orbScore)
      .slice(0, 5)
      .map((p) => [p.id, Math.floor(p.orbScore)]);
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
      z: [z.active ? 1 : 0, R(z.x), R(z.y), R(z.r), R(z.tx), R(z.ty), R(z.tr)],
      pl,
      mo,
      pr,
      ar,
      so,
      it,
      ch,
      al,
      go,
      ca,
      sc,
      ev,
    };
    if (me) {
      const m = {
        id: me.id,
        al: me.alive ? 1 : 0,
        x: R(me.x * 100) / 100,
        y: R(me.y * 100) / 100,
        kbx: R(me.kbx * 10) / 10,
        kby: R(me.kby * 10) / 10,
        dt: R(me.dashT * 1000) / 1000,
        ds: R(me.dashSpd),
        ddx: R(me.ddx * 1000) / 1000,
        ddy: R(me.ddy * 1000) / 1000,
        ms: R(me.freeSpeed * 10) / 10,
        hp: Math.ceil(me.hp),
        mhp: me.maxHp,
        lv: me.level,
        xp: Math.floor(me.xp),
        xn: me.xpNext,
        cd: [me.cd.q, me.cd.w, me.cd.e, me.cd.d].map((v) => Math.max(0, R(v * 100) / 100)),
        cdm: [me.cdMax.q, me.cdMax.w, me.cdMax.e, C.ROLL.cd].map((v) => R(v * 100) / 100),
        ult: R(me.ult),
        k: me.kills,
        d: me.deaths,
        rs: me.alive ? 0 : Math.max(0, R(me.respawnT * 10) / 10),
        sp: spec ? spec.id : 0,
        ack: me.ack,
        st: me.st.stunT > 0 ? 2 : me.st.rootT > 0 ? 1 : 0,
        chn: me.channel ? R((me.channel.t / C.CHEST_OPEN) * 100) : -1,
        ob: me.orbs.slice(),
        os: Math.floor(me.orbScore),
        rt: me.ritualT >= 0 ? R(me.ritualT * 10) / 10 : -1,
        dmg: R(me.dmgDealt),
      };
      if (me.uiVer !== lastUiVer) {
        m.ui = {
          v: me.uiVer,
          gear: { weapon: me.gear.weapon, armor: me.gear.armor, boots: me.gear.boots },
          grade: { ...me.grade, r: ultGrade(me.grade) },
          speedMult: me.speedMult,
        };
      }
      snap.me = m;
    }
    return snap;
  }
}

Object.assign(Game.prototype, CombatMixin);

export { SLOT_KINDS, ORBS };
