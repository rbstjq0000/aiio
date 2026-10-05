// 전투: 스킬 실행, 피해, CC, 투사체, 장판. Game.prototype에 섞어 사용 (this = Game)
// 수치/규칙 근거: docs/COMBAT_DESIGN.md
import { TAU, angleDiff, dist2, segPointDist2 } from './math.js';
import * as C from './constants.js';
import { WEAPONS, ARMORS, BOOTS, SPELLS, RARITIES, GRADE_CD, ultGrade } from './items.js';
import { startDash, resolveStatic, wallBlocked } from './physics.js';

export const KIND_CODE = { basic: 0, skill: 1, ult: 2, dot: 3, monster: 4, slam: 5, zone: 6 };
export const PROJ_KINDS = ['arrow', 'pierce', 'fireball', 'icebolt', 'lance', 'dagger', 'javelin', 'bone', 'orbshot'];
export const AREA_KINDS = ['ground', 'field', 'ring', 'leap', 'line', 'slam', 'burn'];

const PROJ_KIND_FOR = {
  longbow: { basic: 'arrow', q: 'pierce', w: 'arrow', e: 'arrow' },
  firestaff: { basic: 'fireball' },
  froststaff: { basic: 'icebolt', q: 'lance' },
  daggers: { w: 'dagger' },
  spear: { r: 'javelin' },
};

function r2(v) {
  return Math.round(v * 100) / 100;
}

export const CombatMixin = {
  emit(ev) {
    this.events.push(ev);
  },

  // 스킬 등급·레벨·오브·갑옷에 따른 피해 배율
  gradeOf(p, key) {
    if (key === 'r') return ultGrade(p.grade);
    return p.grade[key] || 0;
  },

  powerMult(p, kind, key = 'basic') {
    let m = C.levelMult(p.level) * RARITIES[this.gradeOf(p, key)].mult;
    if (p.orbs.includes(0)) m *= 1.25;
    if ((kind === 'skill' || kind === 'ult') && p.gear.armor) m *= 1 + ARMORS[p.gear.armor.type].skillDmg;
    return m;
  },

  weapon(p) {
    return WEAPONS[p.gear.weapon.type];
  },

  // ---------------- 행동 가능 여부 ----------------
  canAct(p) {
    return p.alive && p.st.stunT <= 0 && !p.act && p.dashT <= 0 && !p.channel;
  },

  breakStealth(p) {
    if (p.st.invisT > 0) {
      p.st.invisT = 0;
      this.emit({ e: 'reveal', id: p.id, x: Math.round(p.x), y: Math.round(p.y) });
    }
  },

  // ---------------- 무기 스킬 ----------------
  tryBasic(p) {
    if (!this.canAct(p)) return false;
    const w = this.weapon(p);
    const sk = w.basic;
    this.breakStealth(p);
    if (sk.type === 'melee') {
      const step = p.comboT > 0 ? p.combo % sk.combo.length : 0;
      const c = sk.combo[step];
      p.combo = step + 1;
      p.comboT = 0;
      p.act = { key: 'basic', sk, c, step, t: 0, hitAt: c.windup, dur: c.dur, done: false, dir: p.aim, moveMult: sk.moveMult };
      if (c.lunge) this.lunge(p, p.aim, c.lunge);
      this.emit({ e: 'swing', id: p.id, s: step, a: r2(p.aim), x: Math.round(p.x), y: Math.round(p.y) });
    } else {
      p.act = { key: 'basic', sk, t: 0, hitAt: sk.windup, dur: sk.dur, done: false, dir: p.aim, moveMult: sk.moveMult };
    }
    return true;
  },

  trySkill(p, key) {
    if (!this.canAct(p)) return false;
    const w = this.weapon(p);
    const sk = w[key];
    if (key === 'r') {
      if (p.ult < 100) return false;
    } else if (p.cd[key] > 0) return false;
    const ok = this.startSkill(p, key, sk);
    if (!ok) return false;
    this.breakStealth(p);
    if (key === 'r') p.ult = 0;
    else {
      p.cd[key] = sk.cd * p.cdMult * GRADE_CD[this.gradeOf(p, key)];
      p.cdMax[key] = p.cd[key];
    }
    this.emit({ e: 'skill', id: p.id, k: key, w: p.gear.weapon.type, x: Math.round(p.x), y: Math.round(p.y), a: r2(p.aim) });
    return true;
  },

  // 마우스 위치를 사거리 안으로 제한
  aimPoint(p, range) {
    let tx = p.input.cx;
    let ty = p.input.cy;
    if (!Number.isFinite(tx) || !Number.isFinite(ty)) {
      tx = p.x + Math.cos(p.aim) * range * 0.6;
      ty = p.y + Math.sin(p.aim) * range * 0.6;
    }
    const dx = tx - p.x;
    const dy = ty - p.y;
    const d = Math.sqrt(dx * dx + dy * dy);
    if (d > range) {
      tx = p.x + (dx / d) * range;
      ty = p.y + (dy / d) * range;
    }
    return [tx, ty, Math.min(d, range)];
  },

  startSkill(p, key, sk) {
    const kind = key === 'r' ? 'ult' : 'skill';
    const base = { key, sk, t: 0, done: false, dir: p.aim, kind };
    switch (sk.type) {
      case 'proj':
      case 'fan':
      case 'cone':
      case 'nova':
        p.act = { ...base, hitAt: sk.windup || 0, dur: sk.dur || 0.3, moveMult: sk.moveMult ?? 0.6 };
        return true;
      case 'spin':
        p.act = { ...base, hitAt: 0, dur: sk.dur, moveMult: sk.moveMult, hits: 0 };
        return true;
      case 'leap': {
        if (p.st.rootT > 0) return false;
        const [tx, ty, d] = this.aimPoint(p, sk.range);
        const dist = Math.max(40, d);
        const ang = Math.atan2(ty - p.y, tx - p.x);
        startDash(p, Math.cos(ang), Math.sin(ang), sk.air, dist);
        p.act = { ...base, hitAt: 99, dur: sk.air + 0.12, moveMult: 0, dir: ang };
        this.addArea({ kind: 'leap', x: tx, y: ty, r: sk.r, delay: sk.air, dur: sk.air + 0.05, owner: p.id, team: p.team, dmg: sk.dmg * this.powerMult(p, kind, key), stun: sk.stun, ckind: kind, color: p.gear.weapon.type, follow: true });
        return true;
      }
      case 'line': {
        p.act = { ...base, hitAt: 99, dur: sk.dur, moveMult: 0 };
        this.addArea({ kind: 'line', x: p.x, y: p.y, ang: p.aim, len: sk.len, width: sk.width, r: sk.len, delay: sk.windup, dur: sk.windup + 0.15, owner: p.id, team: p.team, dmg: sk.dmg * this.powerMult(p, kind, key), stun: sk.stun, ckind: kind, color: p.gear.weapon.type });
        return true;
      }
      case 'dashstrike': {
        if (p.st.rootT > 0) return false;
        startDash(p, Math.cos(p.aim), Math.sin(p.aim), sk.time, sk.dist);
        if (sk.shield) {
          p.st.shield = Math.max(p.st.shield, sk.shield * this.powerMult(p, kind, key));
          p.st.shieldT = 2.5;
        }
        p.act = { ...base, hitAt: 99, dur: sk.time + 0.06, moveMult: 0, hitSet: new Set(), dmg: sk.dmg * this.powerMult(p, kind, key) };
        return true;
      }
      case 'backflip': {
        if (p.st.rootT > 0) return false;
        startDash(p, -Math.cos(p.aim), -Math.sin(p.aim), sk.time, sk.dist);
        p.act = { ...base, hitAt: 99, dur: sk.time + 0.05, moveMult: 0 };
        const pr = sk.proj;
        this.spawnProj(p, { angle: p.aim, speed: pr.speed, range: pr.range, dmg: pr.dmg * this.powerMult(p, kind, key), r: pr.r, slow: pr.slow, pkind: 'arrow', ckind: kind });
        return true;
      }
      case 'ground':
      case 'field': {
        const [tx, ty] = this.aimPoint(p, sk.range);
        p.act = { ...base, hitAt: 0.05, dur: sk.dur || 0.3, moveMult: 0.5, tx, ty };
        return true;
      }
      case 'ring':
        p.act = { ...base, hitAt: 0.01, dur: sk.dur, moveMult: sk.moveMult };
        return true;
      case 'blinkskill': {
        if (p.st.rootT > 0) return false;
        const [tx, ty] = this.aimPoint(p, sk.range);
        const fx = p.x;
        const fy = p.y;
        p.x = tx;
        p.y = ty;
        p.kbx = 0;
        p.kby = 0;
        resolveStatic(p, this.obstacles, this.R);
        p.act = { ...base, hitAt: 99, dur: 0.15, moveMult: 0.5 };
        this.emit({ e: 'blink', id: p.id, x: Math.round(fx), y: Math.round(fy), x2: Math.round(p.x), y2: Math.round(p.y) });
        const b = sk.burn;
        this.addArea({ kind: 'burn', x: fx, y: fy, r: b.r, delay: 0, ticks: Infinity, every: b.every, dur: b.t, owner: p.id, team: p.team, dmg: b.dmg * this.powerMult(p, kind, key), ckind: kind, color: p.gear.weapon.type });
        return true;
      }
      case 'execute': {
        if (p.st.rootT > 0) return false;
        const tgt = this.executeTarget(p, sk.range);
        if (!tgt) return false;
        const fromX = p.x;
        const fromY = p.y;
        const dx = tgt.x - p.x;
        const dy = tgt.y - p.y;
        const d = Math.sqrt(dx * dx + dy * dy) || 1;
        p.x = tgt.x + (dx / d) * (tgt.r + p.r + 8);
        p.y = tgt.y + (dy / d) * (tgt.r + p.r + 8);
        p.kbx = 0;
        p.kby = 0;
        resolveStatic(p, this.obstacles, this.R);
        p.aim = Math.atan2(tgt.y - p.y, tgt.x - p.x);
        p.act = { ...base, hitAt: 99, dur: 0.3, moveMult: 0.3 };
        this.emit({ e: 'blink', id: p.id, x: Math.round(fromX), y: Math.round(fromY), x2: Math.round(p.x), y2: Math.round(p.y) });
        const dmg = (sk.dmg + sk.missing * (tgt.maxHp - tgt.hp)) * this.powerMult(p, kind, key);
        this.dealDamage(p, tgt, dmg, { kind, pre: true, big: true });
        return true;
      }
      default:
        return false;
    }
  },

  executeTarget(p, range) {
    const cx = Number.isFinite(p.input.cx) ? p.input.cx : p.x;
    const cy = Number.isFinite(p.input.cy) ? p.input.cy : p.y;
    let best = null;
    let bestScore = Infinity;
    for (const u of this.units) {
      if (!u.alive || u.team === p.team || u.invulnT > 0) continue;
      if (u.isPlayer && u.st.invisT > 0 && dist2(u.x, u.y, p.x, p.y) > 140 * 140) continue;
      const d = dist2(u.x, u.y, p.x, p.y);
      if (d > (range + u.r) ** 2) continue;
      const score = dist2(u.x, u.y, cx, cy) * (u.isPlayer ? 0.5 : 1);
      if (score < bestScore) {
        bestScore = score;
        best = u;
      }
    }
    return best;
  },

  updateAction(p, dt) {
    const a = p.act;
    a.t += dt;
    const sk = a.sk;
    if (sk.type === 'spin') {
      const need = Math.min(sk.hits, Math.floor((a.t / sk.dur) * sk.hits + 0.5));
      while (a.hits < need) {
        a.hits++;
        this.novaHit(p, sk.r, sk.dmg * this.powerMult(p, a.kind, a.key), sk.knock, a.kind, null);
      }
    } else if (sk.type === 'dashstrike' && sk.dmg > 0 && p.dashT > 0) {
      for (const u of this.units) {
        if (!u.alive || u.team === p.team || a.hitSet.has(u.id)) continue;
        if (dist2(u.x, u.y, p.x, p.y) > (sk.width + u.r) ** 2) continue;
        a.hitSet.add(u.id);
        const dealt = this.dealDamage(p, u, a.dmg, { kind: a.kind, pre: true });
        if (dealt >= 0 && sk.knock) this.knock(u, p.x - p.ddx * 30, p.y - p.ddy * 30, sk.knock, p);
      }
    }
    if (!a.done && a.t >= a.hitAt) {
      a.done = true;
      this.performAction(p, a);
    }
    if (p.act === a && a.t >= a.dur) {
      p.act = null;
      if (a.key === 'basic' && sk.type === 'melee') p.comboT = sk.comboWindow;
    }
  },

  performAction(p, a) {
    const sk = a.sk;
    const key = a.key;
    const kind = a.key === 'basic' ? 'basic' : a.kind;
    const wtype = p.gear.weapon.type;
    switch (sk.type) {
      case 'melee':
        this.meleeHit(p, a.dir, a.c, kind);
        break;
      case 'proj': {
        const pk = (PROJ_KIND_FOR[wtype] && PROJ_KIND_FOR[wtype][a.key]) || 'arrow';
        this.spawnProj(p, {
          angle: p.aim,
          speed: sk.speed,
          range: sk.range,
          dmg: sk.dmg * this.powerMult(p, kind, key),
          r: sk.r,
          pierce: sk.pierce || 0,
          dot: sk.dot ? { dmg: sk.dot.dmg * this.powerMult(p, kind, key), t: sk.dot.t } : null,
          slow: sk.slow || null,
          chill: sk.chill || 0,
          root: sk.root || 0,
          knock: sk.knock || 0,
          pkind: pk,
          ckind: kind,
        });
        break;
      }
      case 'fan': {
        for (let i = 0; i < sk.count; i++) {
          const ang = p.aim + (i / (sk.count - 1) - 0.5) * sk.spread;
          this.spawnProj(p, { angle: ang, speed: sk.speed, range: sk.range, dmg: sk.dmg * this.powerMult(p, kind, key), r: sk.r, knock: sk.knock || 0, pkind: 'arrow', ckind: kind });
        }
        break;
      }
      case 'cone': {
        const dmg = sk.dmg * this.powerMult(p, kind, key);
        this.emit({ e: 'cone', id: p.id, x: Math.round(p.x), y: Math.round(p.y), a: r2(p.aim), r: sk.range, arc: sk.arc, w: wtype });
        for (const u of this.units) {
          if (!u.alive || u.team === p.team) continue;
          const dx = u.x - p.x;
          const dy = u.y - p.y;
          const d2 = dx * dx + dy * dy;
          if (d2 > (sk.range + u.r) ** 2) continue;
          const d = Math.sqrt(d2);
          const tol = d > u.r ? Math.asin(u.r / d) : Math.PI;
          if (Math.abs(angleDiff(p.aim, Math.atan2(dy, dx))) > sk.arc / 2 + tol) continue;
          const dealt = this.dealDamage(p, u, dmg, { kind, pre: true });
          if (dealt >= 0 && sk.dot) this.addDot(u, sk.dot.dmg * this.powerMult(p, kind, key), sk.dot.t, p, 'burn');
        }
        break;
      }
      case 'nova':
        this.novaHit(p, sk.r, sk.dmg * this.powerMult(p, kind, key), sk.knock, kind, wtype, sk.slow);
        break;
      case 'ground':
        this.addArea({
          kind: 'ground',
          x: a.tx,
          y: a.ty,
          r: sk.r,
          delay: sk.delay,
          ticks: sk.ticks,
          every: sk.every || 0,
          dur: sk.delay + (sk.ticks - 1) * (sk.every || 0) + 0.2,
          owner: p.id,
          team: p.team,
          dmg: sk.dmg * this.powerMult(p, kind, key),
          stun: sk.stun || 0,
          slow: sk.slow || null,
          after: sk.after ? { t: sk.after.t, every: sk.after.every, dmg: sk.after.dmg * this.powerMult(p, kind, key) } : null,
          ckind: kind,
          color: wtype,
        });
        break;
      case 'field':
        this.addArea({
          kind: 'field',
          x: a.tx,
          y: a.ty,
          r: sk.r,
          delay: 0.25,
          ticks: Infinity,
          every: sk.every,
          dur: 0.25 + sk.t,
          owner: p.id,
          team: p.team,
          dmg: sk.dmg * this.powerMult(p, kind, key),
          slow: sk.slow,
          freezeAfter: sk.freezeAfter,
          freeze: sk.freeze,
          stay: new Map(),
          frozen: new Set(),
          ckind: kind,
          color: wtype,
        });
        break;
      case 'ring':
        this.addArea({ kind: 'ring', x: p.x, y: p.y, r: sk.r, delay: sk.delay, ticks: 1, dur: sk.delay + 0.2, owner: p.id, team: p.team, dmg: sk.dmg * this.powerMult(p, kind, key), root: sk.root, ckind: kind, color: wtype, follow: true });
        break;
      default:
        break;
    }
  },

  lunge(p, dir, dist) {
    p.kbx += Math.cos(dir) * dist * C.KB_DAMP;
    p.kby += Math.sin(dir) * dist * C.KB_DAMP;
  },

  meleeHit(p, dir, c, kind) {
    const dmg = c.dmg * this.powerMult(p, kind, 'basic');
    for (const u of this.units) {
      if (!u.alive || u === p || u.team === p.team) continue;
      const dx = u.x - p.x;
      const dy = u.y - p.y;
      const reach = c.range + u.r;
      const d2 = dx * dx + dy * dy;
      if (d2 > reach * reach) continue;
      const d = Math.sqrt(d2);
      const tol = d > u.r ? Math.asin(u.r / d) : Math.PI;
      if (Math.abs(angleDiff(dir, Math.atan2(dy, dx))) > c.arc / 2 + tol) continue;
      const dealt = this.dealDamage(p, u, dmg, { kind, pre: true });
      if (dealt >= 0 && c.knock) this.knock(u, p.x, p.y, c.knock, p);
    }
  },

  novaHit(p, r, dmg, knock, kind, wtype, slow = null) {
    if (wtype) this.emit({ e: 'nova', id: p.id, x: Math.round(p.x), y: Math.round(p.y), r, w: wtype });
    for (const u of this.units) {
      if (!u.alive || u === p || u.team === p.team) continue;
      if (dist2(u.x, u.y, p.x, p.y) > (r + u.r) ** 2) continue;
      const dealt = this.dealDamage(p, u, dmg, { kind, pre: true });
      if (dealt >= 0 && knock) this.knock(u, p.x, p.y, knock, p);
      if (dealt >= 0 && slow) this.addSlow(u, slow.amt, slow.t, `nova${p.id}`);
    }
  },

  // ---------------- 보조 주문 (D·F) ----------------
  trySpell(p, slot) {
    const id = p.spells[slot === 'd' ? 0 : 1];
    const sp = SPELLS[id];
    if (!p.alive || !sp || p.cd[slot] > 0) return false;
    if (sp.type !== 'purify' && p.st.stunT > 0) return false;
    if (sp.type === 'blink' && p.st.rootT > 0) return false;
    if (sp.type === 'blink') {
      let dx = (Number.isFinite(p.input.cx) ? p.input.cx : p.x + Math.cos(p.aim)) - p.x;
      let dy = (Number.isFinite(p.input.cy) ? p.input.cy : p.y + Math.sin(p.aim)) - p.y;
      const len = Math.sqrt(dx * dx + dy * dy) || 1;
      const dist = Math.min(sp.dist, len);
      dx /= len;
      dy /= len;
      p.act = null;
      p.channel = null;
      const fx = p.x;
      const fy = p.y;
      p.x += dx * dist;
      p.y += dy * dist;
      p.kbx = 0;
      p.kby = 0;
      p.dashT = 0;
      resolveStatic(p, this.obstacles, this.R);
      this.emit({ e: 'blink', id: p.id, x: Math.round(fx), y: Math.round(fy), x2: Math.round(p.x), y2: Math.round(p.y) });
    } else if (sp.type === 'sprint') {
      p.st.sprintT = sp.t;
      p.st.slows.length = 0;
      this.emit({ e: 'sprint', id: p.id, x: Math.round(p.x), y: Math.round(p.y) });
    } else if (sp.type === 'purify') {
      p.st.stunT = 0;
      p.st.rootT = 0;
      p.st.slows.length = 0;
      p.st.ccImmT = Math.max(p.st.ccImmT, sp.immune);
      p.st.shield = Math.max(p.st.shield, sp.shield);
      p.st.shieldT = 3;
    } else if (sp.type === 'bulwark') {
      p.st.bulwarkT = sp.t;
    } else if (sp.type === 'shadow') {
      p.st.invisT = sp.t;
      p.act = null;
    }
    p.cd[slot] = sp.cd;
    p.cdMax[slot] = sp.cd;
    this.emit({ e: 'spell', id: p.id, k: sp.type, x: Math.round(p.x), y: Math.round(p.y) });
    return true;
  },

  // ---------------- 피해 ----------------
  // 실제 들어간 피해, 막혔으면 -1
  dealDamage(src, tgt, amount, ctx = {}) {
    if (!tgt.alive || !(amount > 0)) return -1;
    const kind = ctx.kind || 'basic';
    if (kind !== 'zone') {
      if (tgt.invulnT > 0) return -1;
      if (tgt.st.iframeT > 0 && kind !== 'dot') {
        this.emit({ e: 'iframe', id: tgt.id, x: Math.round(tgt.x), y: Math.round(tgt.y) });
        return -1;
      }
    }
    let dmg = amount;
    if (src && src.isPlayer && !ctx.pre) dmg *= this.powerMult(src, kind);
    if (tgt.isPlayer) {
      if (tgt.st.bulwarkT > 0 && kind !== 'zone') dmg *= 0.5;
      if (tgt.orbs.includes(1)) dmg *= 0.75;
      if (tgt.dr) dmg *= 1 - tgt.dr;
    }
    if (tgt.st.shield > 0 && kind !== 'zone') {
      const absorbed = Math.min(tgt.st.shield, dmg);
      tgt.st.shield -= absorbed;
      dmg -= absorbed;
      if (absorbed > 0) this.emit({ e: 'shieldhit', id: tgt.id, x: Math.round(tgt.x), y: Math.round(tgt.y), a: Math.round(absorbed) });
    }
    if (dmg <= 0) return 0;
    tgt.hp -= dmg;
    tgt.lastDmgT = this.time;
    if (tgt.channel) {
      tgt.channel = null;
      this.emit({ e: 'interrupt', id: tgt.id, x: Math.round(tgt.x), y: Math.round(tgt.y) });
    }
    if (src && src.isPlayer && src !== tgt) {
      src.dmgDealt += tgt.isPlayer ? dmg : 0;
      src.ult = Math.min(100, src.ult + dmg * C.ULT_PER_DMG * (tgt.isPlayer ? 1 : 0.3) * (src.orbs.includes(2) ? 2 : 1));
      if (tgt.isPlayer) {
        tgt.lastHitBy = src.id;
        tgt.lastHitByT = this.time;
      }
    }
    this.emit({
      e: 'hit',
      id: tgt.id,
      x: Math.round(tgt.x),
      y: Math.round(tgt.y),
      a: Math.round(dmg),
      k: KIND_CODE[kind] ?? 0,
      s: src ? src.id : 0,
      b: ctx.big || kind === 'ult' ? 1 : 0,
    });
    if (tgt.hp <= 0) this.killUnit(tgt, src, ctx);
    return dmg;
  },

  heal(u, amt) {
    if (!u.alive || amt <= 0) return;
    const before = u.hp;
    u.hp = Math.min(u.maxHp, u.hp + amt);
    const got = u.hp - before;
    if (got >= 1) this.emit({ e: 'heal', id: u.id, x: Math.round(u.x), y: Math.round(u.y), a: Math.round(got) });
  },

  // ---------------- CC ----------------
  ccBlocked(u) {
    if (!u.alive) return true;
    if (u.ccImmune) return true; // 보스
    if (u.st.ccImmT > 0) {
      this.emit({ e: 'immune', id: u.id, x: Math.round(u.x), y: Math.round(u.y) });
      return true;
    }
    return false;
  },

  stun(u, t, freeze = false) {
    if (t <= 0 || this.ccBlocked(u)) return false;
    t = Math.min(t, C.CC_MAX);
    u.st.stunT = Math.max(u.st.stunT, t);
    u.st.ccImmT = t + C.CC_IMMUNE;
    if (u.act) u.act = null;
    if (u.channel) u.channel = null;
    this.emit({ e: freeze ? 'freeze' : 'stun', id: u.id, x: Math.round(u.x), y: Math.round(u.y), t: r2(t) });
    return true;
  },

  root(u, t) {
    if (t <= 0 || this.ccBlocked(u)) return false;
    t = Math.min(t, C.CC_MAX);
    u.st.rootT = Math.max(u.st.rootT, t);
    u.st.ccImmT = t + C.CC_IMMUNE;
    this.emit({ e: 'root', id: u.id, x: Math.round(u.x), y: Math.round(u.y), t: r2(t) });
    return true;
  },

  addSlow(u, amt, t, key) {
    if (!u.alive) return;
    const s = u.st.slows;
    const i = s.findIndex((q) => q.key === key);
    if (i >= 0) {
      s[i].amt = Math.max(s[i].amt, amt);
      s[i].t = Math.max(s[i].t, t);
    } else s.push({ amt, t, key });
  },

  addChill(u, amt) {
    const s = u.st.slows;
    const c = s.find((q) => q.key === 'chill');
    if (c) {
      c.amt = Math.min(0.3, c.amt + amt);
      c.t = 1.5;
    } else s.push({ amt, t: 1.5, key: 'chill' });
  },

  addDot(u, total, t, src, key) {
    if (!u.alive) return;
    const ticks = Math.max(1, Math.round(t / 0.5));
    const d = u.st.dots;
    const k = `${key}:${src ? src.id : 0}`;
    const i = d.findIndex((q) => q.key === k);
    const dot = { key: k, per: total / ticks, left: ticks, tick: 0.5, src: src ? src.id : 0 };
    if (i >= 0) d[i] = dot;
    else d.push(dot);
  },

  slowMult(u) {
    let s = 0;
    for (const q of u.st.slows) s += q.amt;
    return 1 - Math.min(C.SLOW_CAP, s);
  },

  knock(u, fx, fy, force, src) {
    if (!u.alive || force <= 0) return;
    if (u.st.bulwarkT > 0) return;
    const res = u.kbRes ?? 1;
    let dx = u.x - fx;
    let dy = u.y - fy;
    let d = Math.sqrt(dx * dx + dy * dy);
    if (d < 0.01) {
      const a = this.rng() * TAU;
      dx = Math.cos(a);
      dy = Math.sin(a);
      d = 1;
    }
    u.kbx += (dx / d) * force * res;
    u.kby += (dy / d) * force * res;
    const sp = Math.sqrt(u.kbx * u.kbx + u.kby * u.kby);
    if (sp > C.KB_MAX) {
      u.kbx *= C.KB_MAX / sp;
      u.kby *= C.KB_MAX / sp;
    }
    if (force * res >= 300) {
      u.st.slamT = 0.4;
      u.st.slamSrc = src ? src.id : 0;
    }
  },

  wallSlam(u) {
    const st = u.st;
    if (st.slamT <= 0) return;
    const kb = Math.sqrt(u.kbx * u.kbx + u.kby * u.kby);
    if (kb < 240) return;
    st.slamT = 0;
    u.kbx = 0;
    u.kby = 0;
    const src = this.byId.get(st.slamSrc) || null;
    this.emit({ e: 'slam', id: u.id, x: Math.round(u.x), y: Math.round(u.y) });
    this.dealDamage(src, u, C.WALL_SLAM_DMG, { kind: 'slam', pre: true });
    if (u.alive) this.stun(u, C.WALL_SLAM_STUN);
  },

  // ---------------- 상태 갱신 ----------------
  updateStatuses(dt) {
    for (const u of this.units) {
      if (!u.alive) continue;
      const st = u.st;
      if (st.stunT > 0) st.stunT -= dt;
      if (st.rootT > 0) st.rootT -= dt;
      if (st.ccImmT > 0) st.ccImmT -= dt;
      if (st.slamT > 0) st.slamT -= dt;
      if (st.iframeT > 0) st.iframeT -= dt;
      if (st.invisT > 0) st.invisT -= dt;
      if (st.bulwarkT > 0) st.bulwarkT -= dt;
      if (st.sprintT > 0) st.sprintT -= dt;
      if (st.shieldT > 0) {
        st.shieldT -= dt;
        if (st.shieldT <= 0) st.shield = 0;
      }
      if (st.slows.length) {
        for (const q of st.slows) q.t -= dt;
        st.slows = st.slows.filter((q) => q.t > 0);
      }
      if (st.dots.length) {
        for (const d of st.dots) {
          d.tick -= dt;
          if (d.tick <= 0 && d.left > 0 && u.alive) {
            d.tick += 0.5;
            d.left--;
            const src = this.byId.get(d.src) || null;
            this.dealDamage(src, u, d.per, { kind: 'dot', pre: true });
          }
        }
        st.dots = st.dots.filter((d) => d.left > 0);
      }
    }
  },

  // ---------------- 투사체 ----------------
  spawnProj(owner, o) {
    const x = o.x ?? owner.x + Math.cos(o.angle) * (owner.r + 4);
    const y = o.y ?? owner.y + Math.sin(o.angle) * (owner.r + 4);
    const pr = {
      id: this.nextId++,
      owner: owner.id,
      team: owner.team,
      x,
      y,
      vx: Math.cos(o.angle) * o.speed,
      vy: Math.sin(o.angle) * o.speed,
      speed: o.speed,
      range: o.range,
      dist: 0,
      dmg: o.dmg,
      r: o.r,
      pierce: o.pierce || 0,
      hit: null,
      pkind: o.pkind || 'arrow',
      ckind: o.ckind || 'basic',
      dot: o.dot || null,
      slow: o.slow || null,
      chill: o.chill || 0,
      root: o.root || 0,
      knock: o.knock || 0,
      color: owner.isPlayer ? owner.gear.weapon.type : '',
      alive: true,
    };
    this.projs.push(pr);
    return pr;
  },

  updateProjectiles(dt) {
    const obstacles = this.obstacles;
    for (const pr of this.projs) {
      if (!pr.alive) continue;
      const ox = pr.x;
      const oy = pr.y;
      pr.x += pr.vx * dt;
      pr.y += pr.vy * dt;
      pr.dist += pr.speed * dt;
      let dead = false;
      for (const o of obstacles) {
        const rr = o.r + pr.r * 0.5;
        if (segPointDist2(ox, oy, pr.x, pr.y, o.x, o.y) < rr * rr) {
          dead = true;
          break;
        }
      }
      if (!dead && wallBlocked(ox, oy, pr.x, pr.y, this.walls, pr.r * 0.5)) dead = true;
      if (dead) {
        this.emit({ e: 'phit', x: Math.round(pr.x), y: Math.round(pr.y), k: pr.pkind });
        pr.alive = false;
        continue;
      }
      const owner = this.byId.get(pr.owner) || null;
      for (const u of this.units) {
        if (!u.alive || u.team === pr.team) continue;
        if (pr.hit && pr.hit.has(u.id)) continue;
        const rr = u.r + pr.r;
        if (segPointDist2(ox, oy, pr.x, pr.y, u.x, u.y) > rr * rr) continue;
        const kind = owner && owner.isPlayer ? pr.ckind : 'monster';
        const dealt = this.dealDamage(owner, u, pr.dmg, { kind, pre: true });
        if (dealt >= 0) {
          if (pr.knock) this.knock(u, u.x - pr.vx * 0.01, u.y - pr.vy * 0.01, pr.knock, owner);
          if (pr.dot) this.addDot(u, pr.dot.dmg, pr.dot.t, owner, pr.pkind);
          if (pr.slow) this.addSlow(u, pr.slow.amt, pr.slow.t, pr.pkind);
          if (pr.chill) this.addChill(u, pr.chill);
          if (pr.root) {
            this.root(u, pr.root);
            pr.root = 0;
          }
        }
        if (pr.pierce > 0) {
          pr.pierce--;
          if (!pr.hit) pr.hit = new Set();
          pr.hit.add(u.id);
        } else {
          pr.alive = false;
          break;
        }
      }
      if (pr.alive && (pr.dist >= pr.range || pr.x * pr.x + pr.y * pr.y > this.R * this.R)) pr.alive = false;
    }
    if (this.projs.some((p) => !p.alive)) this.projs = this.projs.filter((p) => p.alive);
  },

  // ---------------- 장판 ----------------
  addArea(o) {
    const a = {
      id: this.nextId++,
      kind: o.kind,
      x: o.x,
      y: o.y,
      r: o.r,
      ang: o.ang || 0,
      len: o.len || 0,
      width: o.width || 0,
      t: 0,
      delay: o.delay || 0,
      dur: o.dur ?? o.delay ?? 0,
      ticks: o.ticks ?? 1,
      every: o.every || 0,
      tickN: 0,
      tickT: 0,
      owner: o.owner,
      team: o.team,
      dmg: o.dmg || 0,
      stun: o.stun || 0,
      root: o.root || 0,
      slow: o.slow || null,
      knock: o.knock || 0,
      after: o.after || null,
      freezeAfter: o.freezeAfter || 0,
      freeze: o.freeze || 0,
      stay: o.stay || null,
      frozen: o.frozen || null,
      ckind: o.ckind || 'skill',
      color: o.color || '',
      follow: !!o.follow,
      fired: false,
      alive: true,
    };
    this.areas.push(a);
    return a;
  },

  removeArea(a) {
    a.alive = false;
  },

  inArea(a, u) {
    if (a.kind === 'line') {
      const ex = a.x + Math.cos(a.ang) * a.len;
      const ey = a.y + Math.sin(a.ang) * a.len;
      return segPointDist2(a.x, a.y, ex, ey, u.x, u.y) <= (a.width / 2 + u.r) ** 2;
    }
    return dist2(u.x, u.y, a.x, a.y) <= (a.r + u.r) ** 2;
  },

  updateAreas(dt) {
    for (const a of this.areas) {
      if (!a.alive) continue;
      a.t += dt;
      if (a.follow && !a.fired) {
        const o = this.byId.get(a.owner);
        if (o && o.alive && a.kind === 'ring') {
          a.x = o.x;
          a.y = o.y;
        }
      }
      if (a.t >= a.delay && a.tickN < a.ticks) {
        if (!a.fired) {
          a.fired = true;
          a.tickT = 0;
        }
        a.tickT -= dt;
        if (a.tickT <= 0) {
          a.tickT += a.every || 999;
          a.tickN++;
          this.areaTick(a);
          if (a.tickN >= a.ticks && a.after) {
            const af = a.after;
            a.after = null;
            a.kind = 'burn';
            a.t = 0;
            a.delay = 0;
            a.dur = af.t;
            a.ticks = Infinity;
            a.tickN = 0;
            a.every = af.every;
            a.tickT = af.every;
            a.dmg = af.dmg;
            a.stun = 0;
            a.slow = null;
          }
        }
      }
      if (a.t >= a.dur) a.alive = false;
    }
    if (this.areas.some((a) => !a.alive)) this.areas = this.areas.filter((a) => a.alive);
  },

  areaTick(a) {
    const owner = this.byId.get(a.owner) || null;
    if (a.kind === 'leap' && owner && owner.alive) {
      a.x = owner.x;
      a.y = owner.y;
    }
    if (a.kind === 'slam') {
      for (const p of this.players.values()) {
        if (!p.alive || !this.inArea(a, p)) continue;
        const dealt = this.dealDamage(owner, p, a.dmg, { kind: 'monster' });
        if (dealt >= 0 && a.knock) this.knock(p, a.x, a.y, a.knock, null);
      }
      this.emit({ e: 'areafx', k: 'slam', x: Math.round(a.x), y: Math.round(a.y), r: a.r });
      return;
    }
    if (a.tickN === 1 || a.kind === 'line' || a.kind === 'leap' || a.kind === 'ring') {
      this.emit({ e: 'areafx', k: a.kind, x: Math.round(a.x), y: Math.round(a.y), r: a.r, w: a.color, a: r2(a.ang), l: a.len });
    }
    for (const u of this.units) {
      if (!u.alive || u.team === a.team || !this.inArea(a, u)) continue;
      if (a.kind === 'field') {
        const s = (a.stay.get(u.id) || 0) + a.every;
        a.stay.set(u.id, s);
        if (s >= a.freezeAfter && !a.frozen.has(u.id)) {
          a.frozen.add(u.id);
          this.stun(u, a.freeze, true);
        }
      }
      const dealt = this.dealDamage(owner, u, a.dmg, { kind: a.kind === 'burn' ? 'dot' : a.ckind, pre: true, big: a.kind === 'line' });
      if (dealt < 0) continue;
      if (a.stun) this.stun(u, a.stun);
      if (a.root) this.root(u, a.root);
      if (a.slow) this.addSlow(u, a.slow.amt, a.slow.t, `area${a.id}`);
    }
  },
};
