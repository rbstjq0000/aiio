// 게임 시뮬레이션 (서버 권한). 서버와 브라우저 연습 모드가 같은 코드를 실행한다.
// 16인 배틀로얄: 무기 선택 → 착지 → 상자깡(무기)·사냥(강화석)·처치/에픽(증강) → 자기장 5단계 → 최후의 1인
import { TAU, clamp, dist2, lerp, makeRng, shuffle, segPointDist2 } from './math.js';
import * as C from './constants.js';
import { WEAPONS, WEAPON_IDS, RARITIES, STONE_COST, MYTHIC, makeWeapon, weaponId, canTake, rollWeaponRarity } from './items.js';
import { AUG_BY_ID, AUG_SLOTS, augValue, familyCounts, randomAugs, rollAugTier } from './augments.js';
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
export const CHEST_KINDS = ['small', 'big', 'bounty', 'epic', 'titan'];
// 상자 여는 시간 (에픽 보물은 오래 걸리고, 맞으면 끊김)
export const CHEST_TIME = { small: C.CHEST_OPEN, big: C.CHEST_OPEN, bounty: 1.2, epic: 3, titan: 3 };
export const ZONE_STAGE = ['wait', 'warn', 'shrink'];
export const LAIR_STATE = ['sleep', 'alive', 'fight', 'dead', 'gone'];
export const OFFER_KINDS = ['kill', 'epic', 'titan'];

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
    burnSrc: 0,
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
  return { seq: 0, mx: 0, my: 0, aim: 0, atk: false, cx: 0, cy: 0, ti: 0, at: 0, po: 0, pk: 0, pr: 0, wo: 0, wk: 0, p: new Array(C.PRESS_N).fill(0) };
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
  inp.cx = clamp(num(raw.cx, prev.cx), -6000, 6000);
  inp.cy = clamp(num(raw.cy, prev.cy), -6000, 6000);
  const pr = Array.isArray(raw.p) ? raw.p : [];
  for (let i = 0; i < C.PRESS_N; i++) inp.p[i] = Math.max(prev.p[i], int(pr[i], prev.p[i]));
  inp.ti = int(raw.ti, 0);
  inp.at = int(raw.at, 0); // 롤식 기본 공격 대상
  // 증강 선택: 제안(po)의 몇 번째 카드(pk 1~3, 4 = 건너뛰기), 칸이 꽉 찼으면 바꿀 칸(pr 1~3)
  inp.po = int(raw.po, 0);
  inp.pk = int(raw.pk, 0);
  inp.pr = int(raw.pr, 0);
  // 상자 무기: 제안(wo)에 1 = 장착, 2 = 분해
  inp.wo = int(raw.wo, 0);
  inp.wk = int(raw.wk, 0);
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
    this.lairs = [];
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
    this.results = null;
    this.winner = 0;
    this.endReason = '';
  }

  addPlayer({ name = '닌자', isBot = false, weapon = 'dagger', cosmetics = null, skill = 0.5 } = {}) {
    const id = this.nextId++;
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
      gear: { weapon: makeWeapon(weaponId(weapon), 0) },
      stones: 0,
      cd: { q: 0, w: 0, e: 0, d: 0 },
      cdMax: { q: 1, w: 1, e: 1, d: C.ROLL.cd },
      rolls: 1, // 바람 2세트면 구르기 2번
      rollT: 0,
      // 증강: [{ id, tier }] 최대 3칸
      augs: [],
      aug: {},
      fam: {},
      stats: {},
      offers: [],
      wOffer: null,
      hunter: 0,
      basicN: 0,
      secondT: 0,
      meteorT: 6,
      stormT: 3,
      steelT: 10,
      hitters: new Map(), // 최근에 나를 때린 플레이어 → 시각 (어시스트·다수 피격 판정)
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
      assists: 0,
      deaths: 0,
      dmgDealt: 0,
      monsterKills: 0,
      chestsOpened: 0,
      epicKills: 0,
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
    // 고정 시작 지점: 16곳(모두 같은 구성)을 무작위로 한 곳씩 나눠 줌
    const spots = shuffle(this.map.spawns.map((q) => q), this.rng);
    let i = 0;
    for (const p of this.players.values()) p.spawn = spots[i++ % spots.length];
    this.state = 'landing';
    this.landT = C.LANDING_TIME;
  }

  // 착지: 각자 받은 시작 지점에 내려놓음
  land() {
    const placed = [];
    for (const p of shuffle([...this.players.values()], this.rng)) {
      if (p.left) continue;
      const sp = p.spawn || this.map.spawns[Math.floor(this.rng() * this.map.spawns.length)];
      let tx = sp[0];
      let ty = sp[1];
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
    // 엘리트 캠프는 1분 뒤부터
    this.camps = m.camps.map((c, i) => ({ id: this.nextId++, idx: i, x: c.x, y: c.y, type: c.type, mobs: [], respawnT: c.type === 'elite' ? 60 : 0, alive: false }));
    // 캠프 상자는 캠프 몹을 다 잡아야 열림
    this.chests = m.chests.map((c) => ({ id: this.nextId++, x: c.x, y: c.y, kind: c.kind || 'small', open: false, camp: c.camp != null ? this.camps[c.camp].id : 0 }));
    this.lairs = (m.lairs || []).map((l) => ({ id: this.nextId++, x: l.x, y: l.y, kind: l.kind, boss: l.boss, state: 'sleep', t: l.kind === 'titan' ? C.TITAN_WAKE : C.EPIC_WAKE, mob: 0, warned: false, half: false }));
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
      obstacles: this.obstacles.map((o) => (o.t != null ? [o.x, o.y, o.r, o.k, o.t] : [o.x, o.y, o.r, o.k])),
      props: this.map.props || [],
      walls: this.walls,
      bushes: this.bushes.map((b) => [b.x, b.y, b.r]),
      pois: this.map.pois,
      decor: this.map.decor || null,
      camps: this.camps.map((c) => [c.id, c.x, c.y, c.type]),
      lairs: this.lairs.map((l) => [l.id, l.x, l.y, l.kind, l.boss]),
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
    this.updateLairs(dt);
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
    if (this.items.length > 80) this.items.splice(0, this.items.length - 80);
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
    for (const k of ['q', 'w', 'e']) if (p.cd[k] > 0) p.cd[k] -= dt;
    this.updateRoll(p, dt);
    p.ult = Math.min(100, p.ult + C.ULT_PASSIVE * dt);
    if (p.buffer) {
      p.buffer.t -= dt;
      if (p.buffer.t <= 0) p.buffer = null;
    }
    this.updateOffers(p);
    this.updateWeaponOffer(p);
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
      const rate = C.REGEN_BASE + (this.time - p.lastDmgT > C.REGEN_DELAY ? C.REGEN_RATE : 0);
      p.hp = Math.min(p.maxHp, p.hp + p.maxHp * rate * dt);
    }
  }

  // 구르기 충전: 바람 2세트면 2번까지 모아 둠
  updateRoll(p, dt) {
    const max = this.fam(p, 'wind', 2) ? 2 : 1;
    if (p.rolls > max) p.rolls = max;
    if (p.rolls >= max) {
      p.cd.d = 0;
      return;
    }
    p.cd.d -= dt;
    if (p.cd.d <= 0) {
      p.rolls++;
      p.cd.d = p.rolls < max ? p.cdMax.d : 0;
    }
  }

  // 전투에서 벗어나 있는지 (3초 동안 때리지도 맞지도 않음)
  outOfCombat(p) {
    return this.time - p.lastDmgT > C.CALM_TIME && this.time - p.lastAtkT > C.CALM_TIME;
  }

  playerSpeed(p, withAction) {
    if (p.st.stunT > 0 || p.st.rootT > 0) return 0;
    let s = C.BASE_SPEED * p.speedMult * this.slowMult(p);
    if (p.st.invisT > 0) s *= 1.2;
    if (p.st.hasteT > 0) s *= 1 + p.st.haste;
    if (this.outOfCombat(p)) s *= 1 + C.CALM_SPEED;
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

  // ---------------- 능력치: 무기 등급 + 증강 + 세트 ----------------
  fam(p, id, n) {
    return (p.fam[id] || 0) >= n;
  }

  recomputeStats(p) {
    const wd = WEAPONS[p.gear.weapon.type];
    const rar = RARITIES[p.gear.weapon.rarity];
    const s = (p.stats = {});
    const add = (k, v) => (s[k] = (s[k] || 0) + v);
    p.aug = {};
    for (const g of p.augs) p.aug[g.id] = augValue(g.id, g.tier);
    const a = p.aug;
    if (a.tough) add('hp', a.tough);
    if (a.giant) {
      add('hp', a.giant);
      add('speed', -0.05);
      add('size', 0.25);
    }
    if (a.swift) add('speed', a.swift);
    if (a.berserk) {
      add('atkSpeed', a.berserk);
      add('speed', 0.06);
    }
    if (a.hasty) add('atkSpeed', a.hasty);
    if (a.vital) add('crit', a.vital);
    if (a.leech) add('lifesteal', a.leech);
    if (a.vampire) add('lifesteal', a.vampire);
    if (a.roller) add('rollCdr', a.roller);
    if (a.overload) add('cdr', a.overload);
    p.fam = familyCounts(p.augs, wd.family);
    if (this.fam(p, 'storm', 2)) add('cdr', 0.08);
    const ratio = p.maxHp > 0 ? p.hp / p.maxHp : 1;
    p.maxHp = Math.round(C.BASE_HP * (wd.hp || 1) * rar.mult * (1 + (s.hp || 0)));
    p.hp = Math.min(p.maxHp, Math.max(1, ratio * p.maxHp));
    p.speedMult = (wd.speed || 1) * (1 + (s.speed || 0));
    p.cdMult = Math.max(0.5, (1 - (s.cdr || 0)) * rar.cd);
    p.r = C.PLAYER_R * (1 + (s.size || 0));
    p.mass = 1 + (s.size || 0) * 2;
    p.dr = this.fam(p, 'steel', 2) ? 0.1 : 0;
    p.uiVer++;
  }

  // ---------------- 상자·무기 줍기 ----------------
  // 우클릭으로 고른 상자·무기. 멀면 걸어가는 동안 기억해 두었다가 닿으면 실행
  interact(p, targetId) {
    if (!p.alive) return;
    if (targetId) {
      p.wantAct = { id: targetId, t: 5 };
      return;
    }
    // 대상 없이 누르면 가까운 상자만 (무기는 우클릭으로 골라야 바뀜: 실수로 무기가 바뀌지 않게)
    for (const c of this.chests) {
      if (!c.open && !this.chestLocked(c) && dist2(c.x, c.y, p.x, p.y) < C.INTERACT_RANGE ** 2) return this.startChannel(p, c);
    }
  }

  tryWantAct(p, dt) {
    const w = p.wantAct;
    w.t -= dt;
    const it = this.items.find((q) => q.id === w.id);
    const c = it ? null : this.chests.find((q) => q.id === w.id && !q.open);
    const tgt = it || c;
    if (!tgt || w.t <= 0) {
      p.wantAct = null;
      return;
    }
    if (p.st.stunT > 0 || dist2(tgt.x, tgt.y, p.x, p.y) > C.INTERACT_RANGE ** 2) return;
    if (it) {
      p.wantAct = null;
      if (canTake(p.gear.weapon, it)) this.takeItem(p, it);
      else this.emit({ e: 'nottake', to: p.id });
      return;
    }
    if (this.chestLocked(c)) {
      p.wantAct = null;
      this.emit({ e: 'locked', to: p.id, id: c.id });
      return;
    }
    // 걸음을 멈춘 뒤에 열기 시작
    if (Math.abs(p.input.mx) + Math.abs(p.input.my) > 0.2 || p.act) return;
    p.wantAct = null;
    this.startChannel(p, c);
  }

  chestLocked(c) {
    if (!c.camp) return false;
    const camp = this.camps.find((q) => q.id === c.camp);
    return !!(camp && !camp.cleared); // 한 번이라도 다 잡아야 열림
  }

  startChannel(p, c) {
    if (p.act || p.st.stunT > 0) return;
    p.channel = { id: c.id, t: 0, dur: CHEST_TIME[c.kind] || C.CHEST_OPEN };
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
    if (ch.t >= ch.dur) {
      p.channel = null;
      this.openChest(p, c);
    }
  }

  // 상자: 무기가 튀어나옴. 에픽 보물은 증강 + (큰 에픽은) 전설·신화 무기
  openChest(p, c) {
    c.open = true;
    c.goneT = this.time + 4;
    p.chestsOpened++;
    if (c.kind === 'epic' || c.kind === 'titan') {
      const tier = rollAugTier(this.rng, c.kind);
      this.emit({ e: 'chest', id: c.id, x: c.x, y: c.y, r: tier, by: p.id, k: c.kind, aug: 1 });
      this.offerAugment(p, c.kind, randomAugs(this.rng, p.augs.map((g) => g.id)).map((id) => ({ id, tier })));
      if (c.kind === 'titan') {
        const rar = this.rng() < 0.35 ? MYTHIC : MYTHIC - 1;
        this.offerWeapon(p, WEAPON_IDS[Math.floor(this.rng() * WEAPON_IDS.length)], rar);
      }
      return;
    }
    const rar = rollWeaponRarity(this.rng, this.time, c.kind);
    const type = WEAPON_IDS[Math.floor(this.rng() * WEAPON_IDS.length)];
    this.emit({ e: 'chest', id: c.id, x: c.x, y: c.y, r: rar, by: p.id, k: c.kind, w: type });
    // 연 사람만 받음: 바꿔 들지, 강화석으로 분해할지 창에서 고름
    this.offerWeapon(p, type, rar);
  }

  // ---------------- 상자 무기 (본인에게만) ----------------
  offerWeapon(p, type, rarity) {
    // 아직 안 고른 무기가 있으면 그건 분해
    if (p.wOffer) this.dismantle(p, p.wOffer.rarity);
    p.wOffer = { id: this.nextOffer++, type, rarity, botT: 1.6 };
  }

  dismantle(p, rarity) {
    this.gainStones(p, C.DISMANTLE_STONES[rarity] || 0);
  }

  updateWeaponOffer(p) {
    const o = p.wOffer;
    if (!o) return;
    let pick = 0;
    if (p.isBot) {
      o.botT -= C.DT;
      if (o.botT > 0) return;
      // 봇: 더 높은 등급(같으면 무기를 안 바꿈)이면 장착, 아니면 분해
      pick = canTake(p.gear.weapon, o) && o.rarity > p.gear.weapon.rarity ? 1 : 2;
    } else if (p.input.wo === o.id) pick = p.input.wk;
    if (pick !== 1 && pick !== 2) return;
    if (pick === 1 && !canTake(p.gear.weapon, o)) return; // 같은 무기의 낮은 등급은 분해만
    p.wOffer = null;
    if (pick === 2) {
      this.dismantle(p, o.rarity);
      this.emit({ e: 'dismantle', id: p.id, to: p.id, x: Math.round(p.x), y: Math.round(p.y), n: C.DISMANTLE_STONES[o.rarity] });
      return;
    }
    // 들고 있던 무기는 강화석으로
    const old = p.gear.weapon;
    this.equipWeapon(p, o.type, o.rarity);
    if (old.type !== o.type || old.rarity > 0) this.dismantle(p, old.rarity);
  }

  dropItem(type, rarity, x, y) {
    const it = { id: this.nextId++, x: Math.round(x), y: Math.round(y), type, rarity, t: this.time };
    const tmp = { x: it.x, y: it.y, r: 14 };
    resolveStatic(tmp, this.obstacles, this.R);
    it.x = Math.round(tmp.x);
    it.y = Math.round(tmp.y);
    this.items.push(it);
    return it;
  }

  // 무기 줍기: 다른 무기면 바꿔 들고 원래 무기는 바닥에 / 같은 무기면 더 높은 등급만
  takeItem(p, it) {
    if (!canTake(p.gear.weapon, it)) return false;
    this.items = this.items.filter((q) => q !== it);
    const old = p.gear.weapon;
    if (old.type !== it.type || old.rarity > 0) this.dropItem(old.type, old.rarity, p.x + 20, p.y + 16);
    this.equipWeapon(p, it.type, it.rarity);
    return true;
  }

  equipWeapon(p, type, rarity) {
    const old = p.gear.weapon;
    const swap = old.type !== type;
    p.gear.weapon = makeWeapon(type, rarity);
    if (swap) {
      p.act = null;
      p.combo = 0;
      p.st.emp = null;
      p.st.empT = 0;
      for (const a of this.areas) if (a.kind === 'shadow' && a.owner === p.id) a.alive = false;
      for (const k of ['q', 'w', 'e']) p.cd[k] = Math.min(p.cd[k], 2);
    }
    this.recomputeStats(p);
    this.emit({ e: 'equip', id: p.id, x: Math.round(p.x), y: Math.round(p.y), w: type, r: rarity, s: swap ? 1 : 0 });
    if (rarity >= MYTHIC - 1) this.emit({ e: 'legend', global: true, id: p.id, w: type, r: rarity });
  }

  // ---------------- 강화석 (일반 몹) → 무기 등급 ----------------
  gainStones(p, n) {
    if (!p.alive) return;
    p.stones += n;
    let up = false;
    while (p.gear.weapon.rarity < MYTHIC - 1 && p.stones >= STONE_COST[p.gear.weapon.rarity]) {
      p.stones -= STONE_COST[p.gear.weapon.rarity];
      p.gear.weapon = makeWeapon(p.gear.weapon.type, p.gear.weapon.rarity + 1);
      up = true;
    }
    if (up) {
      this.recomputeStats(p);
      this.heal(p, p.maxHp * 0.15);
      this.emit({ e: 'upgrade', id: p.id, x: Math.round(p.x), y: Math.round(p.y), r: p.gear.weapon.rarity });
      if (p.gear.weapon.rarity >= MYTHIC - 1) this.emit({ e: 'legend', global: true, id: p.id, w: p.gear.weapon.type, r: p.gear.weapon.rarity });
    }
    p.uiVer++;
  }

  // ---------------- 증강 (처치·에픽 보물) ----------------
  offerAugment(p, kind, cards) {
    if (!cards.length || p.offers.length >= 3) return;
    const o = { id: this.nextOffer++, kind, cards, botT: 0.8 };
    p.offers.push(o);
    p.uiVer++;
    this.emit({ e: 'offer', to: p.id, o: o.id, k: kind });
    if (cards.some((c) => c.tier === 2)) this.emit({ e: 'prism', global: true, id: p.id });
  }

  // 처치 보상: 상대가 가진 증강 중에서 고름 (모자라면 새 증강으로 채움)
  killOffer(killer, victim) {
    const owned = new Map(killer.augs.map((g) => [g.id, g.tier]));
    const cards = [];
    for (const g of victim.augs) {
      // 이미 가진 증강은 더 높은 등급일 때만 (등급 올리기)
      if (owned.has(g.id) && owned.get(g.id) >= g.tier) continue;
      cards.push({ id: g.id, tier: g.tier, stolen: 1 });
    }
    const used = [...killer.augs.map((g) => g.id), ...cards.map((c) => c.id)];
    for (const id of randomAugs(this.rng, used, 3 - cards.length)) cards.push({ id, tier: rollAugTier(this.rng, 'kill') });
    this.offerAugment(killer, 'kill', cards.slice(0, 3));
  }

  updateOffers(p) {
    if (!p.offers.length) return;
    const o = p.offers[0];
    let pick = 0;
    let rep = 0;
    if (p.isBot) {
      o.botT -= C.DT;
      if (o.botT > 0) return;
      [pick, rep] = this.botPick(p, o);
    } else if (p.input.po === o.id) {
      pick = p.input.pk;
      rep = p.input.pr;
    }
    if (pick < 1 || pick > 4) return;
    if (pick === 4 || pick > o.cards.length) {
      // 건너뛰기: 강화석으로
      p.offers.shift();
      this.gainStones(p, C.SKIP_STONES);
      this.emit({ e: 'augskip', id: p.id, x: Math.round(p.x), y: Math.round(p.y) });
      return;
    }
    const card = o.cards[pick - 1];
    const same = p.augs.findIndex((g) => g.id === card.id);
    if (same < 0 && p.augs.length >= AUG_SLOTS && (rep < 1 || rep > AUG_SLOTS)) return; // 바꿀 칸을 아직 안 고름
    p.offers.shift();
    this.applyAugment(p, card, same >= 0 ? same + 1 : rep);
  }

  // 봇: 이미 모은 계열(무기 공명 포함)과 맞는 카드 → 가장 약한 칸과 교체
  botPick(p, o) {
    const wf = WEAPONS[p.gear.weapon.type].family;
    const score = (c) => {
      const a = AUG_BY_ID[c.id];
      return c.tier * 2 + (p.fam[a.fam] || 0) * 1.5 + (a.fam === wf ? 1 : 0) + this.rng() * 0.8;
    };
    let best = 0;
    for (let i = 1; i < o.cards.length; i++) if (score(o.cards[i]) > score(o.cards[best])) best = i;
    if (p.augs.length < AUG_SLOTS || p.augs.some((g) => g.id === o.cards[best].id)) return [best + 1, 0];
    let worst = 0;
    let ws = Infinity;
    p.augs.forEach((g, i) => {
      const a = AUG_BY_ID[g.id];
      const s = g.tier * 2 + (p.fam[a.fam] || 0) * 1.5;
      if (s < ws) {
        ws = s;
        worst = i;
      }
    });
    if (ws >= score(o.cards[best])) return [4, 0];
    return [best + 1, worst + 1];
  }

  applyAugment(p, card, slot = 0) {
    const a = AUG_BY_ID[card.id];
    if (!a) return;
    const same = p.augs.findIndex((g) => g.id === card.id);
    let lost = null;
    if (same >= 0) p.augs[same] = { id: card.id, tier: Math.max(card.tier, p.augs[same].tier) };
    else if (p.augs.length < AUG_SLOTS) p.augs.push({ id: card.id, tier: card.tier });
    else {
      lost = p.augs[slot - 1];
      p.augs[slot - 1] = { id: card.id, tier: card.tier };
    }
    const before = { ...p.fam };
    this.recomputeStats(p);
    this.emit({ e: 'aug', id: p.id, a: card.id, x: Math.round(p.x), y: Math.round(p.y), r: card.tier, l: lost ? lost.id : '' });
    // 새로 켜진 세트 알림
    for (const f in p.fam) {
      for (const n of [2, 3]) if ((before[f] || 0) < n && p.fam[f] >= n) this.emit({ e: 'setup', id: p.id, to: p.id, f, n });
    }
  }

  // ---------------- 강화석 구슬 (몬스터·탈락자가 떨어뜨림) ----------------
  dropSouls(x, y, total, maxN = 4) {
    if (total <= 0) return;
    const n = Math.max(1, Math.min(maxN, total));
    const base = Math.floor(total / n);
    let left = total - base * n;
    for (let i = 0; i < n; i++) {
      const a = this.rng() * TAU;
      const sp = this.rng.range(90, 260);
      const v = base + (left-- > 0 ? 1 : 0);
      if (v > 0) this.souls.push({ id: this.nextId++, x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, v, t: 0, alive: true });
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
        this.gainStones(best, o.v);
        this.emit({ e: 'soul', to: best.id, a: o.v });
      } else {
        const sp = 380 + (1 - d / C.XP_ORB_MAGNET) * 700;
        o.vx = ((best.x - o.x) / d) * sp;
        o.vy = ((best.y - o.y) / d) * sp;
      }
    }
  }

  // 상자를 바닥에 새로 놓음 (현상금 주머니, 에픽 보물)
  addChest(x, y, kind) {
    const tmp = { x: Math.round(x), y: Math.round(y), r: 20 };
    resolveStatic(tmp, this.obstacles, this.R);
    const c = { id: this.nextId++, x: Math.round(tmp.x), y: Math.round(tmp.y), kind, open: false, camp: 0 };
    this.chests.push(c);
    this.emit({ e: 'chestdrop', id: c.id, x: c.x, y: c.y, k: kind });
    return c;
  }

  // ---------------- 처치 / 탈락 ----------------
  killUnit(u, src, ctx) {
    if (!u.alive) return;
    u.alive = false;
    u.hp = 0;
    this.burnBlast(u);
    if (!u.isPlayer) {
      const killer = src && src.isPlayer ? src : null;
      const def = MONSTERS[u.type];
      this.emit({ e: 'mdeath', id: u.id, x: Math.round(u.x), y: Math.round(u.y), t: def.idx, k: killer ? killer.id : 0 });
      if (u.tele) {
        u.tele.alive = false;
        u.tele = null;
      }
      if (u.lair) this.lairDown(u, killer);
      if (killer) {
        killer.monsterKills++;
        if (def.stones) this.dropSouls(u.x, u.y, def.stones, 3);
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
    u.wOffer = null;
    u.st = makeStatus();
    let killer = src && src.isPlayer && src !== u ? src : null;
    if (!killer && u.lastHitBy && this.time - u.lastHitByT < 8) {
      const k = this.players.get(u.lastHitBy);
      if (k && k !== u && k.alive) killer = k;
    }
    u.killerId = killer ? killer.id : 0;
    u.specId = u.killerId;
    // 무기와 강화석 절반을 떨어뜨림
    this.dropItem(u.gear.weapon.type, u.gear.weapon.rarity, u.x, u.y);
    this.dropSouls(u.x, u.y, Math.floor(u.stones / 2), 4);
    // 현상금 주머니: 연속 처치가 쌓인 사람이 죽으면 좋은 무기 상자가 터져 나옴
    const bounty = u.kills;
    if (bounty >= C.BOUNTY_MIN) {
      this.addChest(u.x + 30, u.y - 20, 'bounty');
      this.emit({ e: 'bountydrop', global: true, id: u.id, k: killer ? killer.id : 0, n: bounty, x: Math.round(u.x), y: Math.round(u.y) });
    }
    let multi = 0;
    if (killer) {
      killer.kills++;
      killer.multi = this.time - killer.lastKillT < 8 ? killer.multi + 1 : 1;
      killer.lastKillT = this.time;
      multi = killer.multi;
      if (killer.alive) {
        this.heal(killer, killer.maxHp * (C.KILL_HEAL + (this.fam(killer, 'blood', 3) ? 0.5 : 0)));
        this.killOffer(killer, u);
        this.onKillAug(killer, u);
      }
      if (killer.kills >= C.BOUNTY_MIN) this.emit({ e: 'bounty', global: true, id: killer.id, n: killer.kills });
      killer.uiVer++;
    }
    // 어시스트: 최근에 같이 때린 사람은 강화석 + 회복
    for (const [hid, t] of u.hitters) {
      if (this.time - t > C.ASSIST_TIME || (killer && hid === killer.id)) continue;
      const h = this.players.get(hid);
      if (!h || !h.alive) continue;
      h.assists++;
      this.gainStones(h, C.ASSIST_STONES);
      this.heal(h, h.maxHp * 0.15);
      this.emit({ e: 'assist', id: h.id, to: h.id, v: u.id, x: Math.round(h.x), y: Math.round(h.y) });
    }
    this.emit({ e: 'death', id: u.id, x: Math.round(u.x), y: Math.round(u.y), k: killer ? killer.id : 0, fx: killer ? killer.cos.killfx : '' });
    this.emit({ e: 'kill', global: true, k: killer ? killer.id : 0, v: u.id, z: ctx && ctx.kind === 'zone' ? 1 : 0, m: multi, left: this.aliveCount() });
    u.uiVer++;
    const alive = [...this.players.values()].filter((p) => p.alive);
    if (alive.length <= 1) this.end(alive[0] || killer || null, 'last');
  }

  // ---------------- 에픽 몬스터 둥지 ----------------
  updateLairs(dt) {
    for (const l of this.lairs) {
      if (l.state === 'gone') continue;
      const z = this.zone;
      // 자기장 밖이 된 둥지는 사라짐
      if (z.dps > 0 && dist2(l.x, l.y, z.x, z.y) > (z.r + 60) ** 2) {
        const m = l.mob ? this.byId.get(l.mob) : null;
        if (m && m.alive) {
          m.alive = false;
          this.rebuildUnits();
        }
        l.state = 'gone';
        this.emit({ e: 'lairgone', global: true, id: l.id });
        continue;
      }
      if (l.state === 'sleep' || l.state === 'dead') {
        l.t -= dt;
        if (l.t <= 0) {
          const m = this.spawnMonster(l.boss, l.x, l.y, { lair: l.id });
          m.leash = MONSTERS[l.boss].leash;
          l.mob = m.id;
          l.state = 'alive';
          l.half = false;
          this.emit({ e: 'lairwake', global: true, id: l.id, b: l.boss, k: l.kind });
        }
        continue;
      }
      const m = this.byId.get(l.mob);
      if (!m || !m.alive) continue;
      l.state = this.time - m.lastDmgT < 3 ? 'fight' : 'alive';
      // 아무도 없으면 천천히 회복 (몰래 조금씩 깎아 두기 방지)
      if (this.time - m.lastDmgT > 6) m.hp = Math.min(m.maxHp, m.hp + m.maxHp * 0.08 * dt);
      if (!l.half && m.hp < m.maxHp * 0.3) {
        l.half = true;
        this.emit({ e: 'lairlow', global: true, id: l.id, b: l.boss, x: Math.round(m.x), y: Math.round(m.y) });
      }
      if (l.half && m.hp > m.maxHp * 0.6) l.half = false;
    }
  }

  lairDown(m, killer) {
    const l = this.lairs.find((q) => q.id === m.lair);
    if (!l) return;
    l.state = l.kind === 'titan' ? 'gone' : 'dead';
    l.t = C.EPIC_RESPAWN;
    l.mob = 0;
    this.addChest(m.x, m.y, l.kind === 'titan' ? 'titan' : 'epic');
    if (killer) {
      killer.epicKills++;
      this.heal(killer, killer.maxHp * 0.2);
      this.gainStones(killer, 5);
    }
    this.emit({ e: 'epicdown', global: true, id: l.id, b: l.boss, k: killer ? killer.id : 0, x: Math.round(m.x), y: Math.round(m.y) });
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
          c.cleared = true;
          c.respawnT = CAMP_TYPES[c.type].respawn * 2;
          this.emit({ e: 'campclear', id: c.id, x: c.x, y: c.y });
          for (const ch of this.chests) if (ch.camp === c.id && !ch.open) this.emit({ e: 'unlock', id: ch.id, x: ch.x, y: ch.y });
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
    const hpMult = def.epic ? 1 : 1 + this.time / 300;
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
      ringT: 2.5,
      leash: extra.camp ? 420 : def.leash || 900,
      camp: extra.camp || 0,
      lair: extra.lair || 0,
      tele: null,
      invulnT: 0,
      lastDmgT: -99,
      ccImmune: !!def.boss,
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
      assists: p.assists,
      deaths: p.deaths,
      score: p.kills,
      monsterKills: p.monsterKills,
      epicKills: p.epicKills,
      chests: p.chestsOpened,
      augs: p.augs.map((g) => g.id),
      augTiers: p.augs.map((g) => g.tier),
      dmg: Math.round(p.dmgDealt),
      weapon: p.gear.weapon.type,
      rarity: p.gear.weapon.rarity,
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

  // 증강 계열을 숫자 하나로 (이름표 위 아이콘용): 칸마다 계열 번호+1, 7진법
  augCode(p) {
    let c = 0;
    for (let i = p.augs.length - 1; i >= 0; i--) {
      const a = AUG_BY_ID[p.augs[i].id];
      c = c * 7 + (a ? ['fire', 'storm', 'shadow', 'steel', 'blood', 'wind'].indexOf(a.fam) + 1 : 0);
    }
    return c;
  }

  // 수풀 안의 적: 가까이 가거나 같은 수풀에 있거나, 방금 공격했으면 보임
  hiddenInBush(p, viewer, cx, cy) {
    if (p.inBush < 0) return false;
    if (this.time - p.lastAtkT < 1 || this.time - p.lastDmgT < 0.5) return false;
    if (viewer && viewer.alive && viewer.inBush === p.inBush) return false;
    return dist2(p.x, p.y, cx, cy) > 170 * 170;
  }

  lairSnap() {
    return this.lairs.map((l) => {
      const m = l.mob ? this.byId.get(l.mob) : null;
      return [l.id, LAIR_STATE.indexOf(l.state), m && m.alive ? Math.round((100 * m.hp) / m.maxHp) : 0, Math.max(0, Math.ceil(l.t))];
    });
  }

  snapshotFor(pid, lastUiVer = -1) {
    const me = this.players.get(pid);
    const R = Math.round;
    if (this.state === 'landing' || this.state === 'waiting') {
      const snap = { t: 'snap', tk: this.tick, tm: 0, st: this.state, lt: R(this.landT * 10) / 10, pl: [], mo: [], pr: [], ar: [], so: [], it: [], ch: [], z: [0, 0, 0, R(this.R + 300), 0, 0, R(this.R + 300), 0, 0, -1], lr: this.lairSnap(), ev: this.events.filter((e) => e.global), ac: this.aliveCount() };
      if (me) snap.me = { id: me.id, al: 1, ld: 0, lx: me.spawn ? me.spawn[0] : null, ly: me.spawn ? me.spawn[1] : null, x: 0, y: 0, ack: me.ack, hp: me.hp, mhp: me.maxHp, cd: [0, 0, 0, 0], cdm: [1, 1, 1, 1], ult: 0, st: 0, chn: -1 };
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
        actT = R((p.channel.t / p.channel.dur) * 100);
      }
      pl.push([
        p.id,
        R(p.x),
        R(p.y),
        R((p.act && p.act.key === 'basic' ? p.act.dir : p.aim) * 100) / 100, // 기본 공격 중엔 대상 쪽을 봄
        Math.ceil(p.hp),
        p.maxHp,
        this.playerFlags(p),
        p.augs.length,
        act,
        actT,
        WI(p.gear.weapon.type),
        p.kills,
        R(p.r),
        this.augCode(p),
        p.gear.weapon.rarity,
        R(p.st.shield),
      ]);
    }
    const mo = [];
    for (const m of this.monsters) {
      if (!m.alive || !inView(m.x, m.y, 80 + m.r)) continue;
      const def = MONSTERS[m.type];
      const wind = m.state === MSTATE.windup ? R((1 - Math.max(0, m.stateT) / def.windup) * 100) : 0;
      mo.push([m.id, def.idx, R(m.x), R(m.y), Math.ceil(m.hp), R(m.maxHp), R(m.aim * 100) / 100, m.state, wind, m.st.stunT > 0 || m.st.rootT > 0 ? 1 : 0, m.st.slows.length ? 1 : 0]);
    }
    const pr = [];
    for (const q of this.projs) {
      if (!q.alive || (q.owner !== pid && !inView(q.x, q.y, 150))) continue;
      pr.push([q.id, PROJ_KINDS.indexOf(q.pkind), R(q.x), R(q.y), R(q.vx), R(q.vy), q.color ? WI(q.color) : -1, q.owner, R(q.r)]);
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
      if (!inBox(g.x, g.y, 40)) continue;
      it.push([g.id, g.x, g.y, WI(g.type), g.rarity]);
    }
    const ch = [];
    for (const c of this.chests) {
      if (!inBox(c.x, c.y, 40)) continue;
      ch.push([c.id, c.x, c.y, c.open ? 1 : 0, CHEST_KINDS.indexOf(c.kind), this.chestLocked(c) ? 1 : 0]);
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
      it,
      ch,
      ev,
      ac: this.aliveCount(),
    };
    // 둥지 상태와 현상금 위치는 1초에 한 번 (지도 표시용)
    if (this.tick % 15 === 0) {
      snap.lr = this.lairSnap();
      snap.bt = [...this.players.values()].filter((p) => p.alive && p.kills >= C.BOUNTY_MIN).map((p) => [p.id, R(p.x), R(p.y), p.kills]);
    }
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
        sn: me.stones,
        cd: [me.cd.q, me.cd.w, me.cd.e, me.cd.d].map((v) => Math.max(0, R(v * 100) / 100)),
        cdm: [me.cdMax.q, me.cdMax.w, me.cdMax.e, me.cdMax.d].map((v) => R(v * 100) / 100),
        rl: me.rolls,
        ult: R(me.ult),
        k: me.kills,
        as: me.assists,
        pl: me.placement,
        sp: spec ? spec.id : 0,
        ack: me.ack,
        st: me.st.stunT > 0 ? 2 : me.st.rootT > 0 ? 1 : 0,
        chn: me.channel ? R((me.channel.t / me.channel.dur) * 100) : -1,
        wo: me.wOffer ? [me.wOffer.id, WEAPON_IDS.indexOf(me.wOffer.type), me.wOffer.rarity] : null,
        of: me.offers.length ? { id: me.offers[0].id, k: me.offers[0].kind, c: me.offers[0].cards, n: me.offers.length } : null,
        dmg: R(me.dmgDealt),
        co: me.chestsOpened,
        mk: me.monsterKills,
        kb: me.killerId,
        calm: this.outOfCombat(me) ? 1 : 0,
      };
      if (me.uiVer !== lastUiVer) {
        m.ui = {
          v: me.uiVer,
          gear: { weapon: me.gear.weapon },
          augs: me.augs.map((g) => ({ ...g })),
          fam: { ...me.fam },
          speedMult: me.speedMult,
        };
      }
      snap.me = m;
    }
    return snap;
  }
}

Object.assign(Game.prototype, CombatMixin);
