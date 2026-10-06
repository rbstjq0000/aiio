// 전투: 스킬 실행, 피해, CC, 투사체, 장판. Game.prototype에 섞어 사용 (this = Game)
// 수치/규칙 근거: docs/COMBAT_DESIGN.md
import { TAU, angleDiff, dist2, segPointDist2 } from './math.js';
import * as C from './constants.js';
import { WEAPONS, ARMORS, BOOTS, RARITIES, GRADE_CD, ultGrade, skillAt } from './items.js';
import { startDash, resolveStatic, wallBlocked } from './physics.js';

export const KIND_CODE = { basic: 0, skill: 1, ult: 2, dot: 3, monster: 4, slam: 5, zone: 6 };
export const PROJ_KINDS = ['arrow', 'pierce', 'fireball', 'icebolt', 'lance', 'dagger', 'javelin', 'bone', 'orbshot'];
export const AREA_KINDS = ['ground', 'field', 'ring', 'leap', 'line', 'slam', 'burn', 'flag', 'shadow', 'arena'];

const PROJ_KIND_FOR = {
  longbow: { basic: 'arrow', q: 'pierce', w: 'arrow', e: 'orbshot', r: 'pierce' },
  firestaff: { basic: 'fireball', q: 'fireball' },
  froststaff: { basic: 'icebolt', q: 'lance' },
  daggers: { q: 'dagger', w: 'dagger' },
  spear: { r: 'javelin' },
};
const BURN_KEYS = ['fireball', 'burn'];

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
  // 기본 공격 대상: 클라이언트가 고른 적이 유효하면 그쪽으로 (롤처럼 빗나가지 않음)
  basicTarget(p) {
    const id = p.input.at;
    if (!id) return null;
    const u = this.byId.get(id);
    if (!u || !u.alive || u.team === p.team || u === p) return null;
    if (u.isPlayer && u.st.invisT > 0) return null;
    const reach = this.weapon(p).range + u.r + 120;
    if (dist2(u.x, u.y, p.x, p.y) > reach * reach) return null;
    return u;
  },

  tryBasic(p) {
    if (!this.canAct(p)) return false;
    const w = this.weapon(p);
    const sk = w.basic;
    const tgt = this.basicTarget(p);
    if (tgt) p.aimBasic = Math.atan2(tgt.y - p.y, tgt.x - p.x);
    const dir = tgt ? p.aimBasic : p.aim;
    this.breakStealth(p);
    if (sk.type === 'melee') {
      const step = p.comboT > 0 ? p.combo % sk.combo.length : 0;
      const c = sk.combo[step];
      p.combo = step + 1;
      p.comboT = 0;
      p.act = { key: 'basic', sk, c, step, t: 0, hitAt: c.windup, dur: c.dur, done: false, dir, moveMult: sk.moveMult, tgt: tgt ? tgt.id : 0 };
      // 붙어 있는 대상에게는 앞으로 내딛지 않음 (몸이 겹쳐 뒤엉켜 보이지 않게)
      const close = tgt && dist2(tgt.x, tgt.y, p.x, p.y) < (c.range * 0.75 + tgt.r) ** 2;
      if (c.lunge && !close) this.lunge(p, dir, c.lunge);
      this.emit({ e: 'swing', id: p.id, s: step, a: r2(dir), x: Math.round(p.x), y: Math.round(p.y) });
    } else {
      p.act = { key: 'basic', sk, t: 0, hitAt: sk.windup, dur: sk.dur, done: false, dir, moveMult: sk.moveMult, tgt: tgt ? tgt.id : 0 };
    }
    return true;
  },

  trySkill(p, key) {
    if (!this.canAct(p)) return false;
    const w = this.weapon(p);
    const sk = skillAt(w, key, this.gradeOf(p, key));
    // 제드 W·R 다시 누르기: 그림자와 자리 바꾸기 (쿨타임과 별개)
    if ((sk.type === 'shadow' || sk.type === 'mark') && p.st.rootT <= 0) {
      const sh = this.ownShadows(p).find((a) => a.slot === key && !a.swapped);
      if (sh) return this.swapShadow(p, sh);
    }
    if (key === 'r') {
      if (p.ult < 100) return false;
    } else if (p.cd[key] > 0) return false;
    const ok = this.startSkill(p, key, sk);
    if (!ok) return false;
    this.breakStealth(p);
    if (key === 'r') {
      p.ult = p.ultBack || 0;
      p.ultBack = 0;
    }
    else {
      p.cd[key] = sk.cd * p.cdMult * GRADE_CD[this.gradeOf(p, key)];
      p.cdMax[key] = p.cd[key];
      if (p.cdRefund) p.cd[key] *= 1 - p.cdRefund;
    }
    p.cdRefund = 0;
    this.emit({ e: 'skill', id: p.id, k: key, w: p.gear.weapon.type, x: Math.round(p.x), y: Math.round(p.y), a: r2(p.aim) });
    return true;
  },

  ownShadows(p) {
    return this.areas.filter((a) => a.alive && a.kind === 'shadow' && a.owner === p.id);
  },

  swapShadow(p, sh) {
    const fx = p.x;
    const fy = p.y;
    p.x = sh.x;
    p.y = sh.y;
    sh.x = fx;
    sh.y = fy;
    sh.swapped = true;
    p.kbx = 0;
    p.kby = 0;
    p.dashT = 0;
    p.act = null;
    resolveStatic(p, this.obstacles, this.R);
    this.emit({ e: 'blink', id: p.id, x: Math.round(fx), y: Math.round(fy), x2: Math.round(p.x), y2: Math.round(p.y) });
    return true;
  },

  // 다리우스 패시브 출혈
  addBleed(u, src) {
    if (!u.alive) return;
    const bd = WEAPONS.greatsword.passive.bleed;
    const b = u.st.bleed;
    if (b && b.src === src.id) {
      b.n = Math.min(bd.max, b.n + 1);
      b.t = bd.t;
    } else u.st.bleed = { n: 1, t: bd.t, tick: 0.5, src: src.id, per: bd.per * this.powerMult(src, 'skill', 'q') };
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
        if (sk.flagDash && p.st.rootT <= 0) {
          const fl = this.ownFlag(p);
          if (fl) {
            const fd = Math.sqrt(dist2(fl.x, fl.y, p.x, p.y));
            const fa = Math.atan2(fl.y - p.y, fl.x - p.x);
            // 찌르는 방향 ±0.45 라디안 안, 사거리+250 안에 내 깃발이 있으면 깃발까지 돌진
            if (fd > 40 && fd < sk.len + 250 && Math.abs(angleDiff(p.aim, fa)) < 0.45) {
              const time = Math.min(0.32, 0.1 + fd / 2200);
              startDash(p, Math.cos(fa), Math.sin(fa), time, Math.max(0, fd - p.r));
              p.act = { ...base, dir: fa, hitAt: 99, dur: time + 0.08, moveMult: 0, hitSet: new Set(), dashHit: { width: 70, dmg: sk.dmg * this.powerMult(p, kind, key), slow: sk.slow } };
              this.addArea({ kind: 'leap', x: fl.x, y: fl.y, r: 140, delay: time, dur: time + 0.05, owner: p.id, team: p.team, dmg: sk.dmg * 0.4 * this.powerMult(p, kind, key), stun: 0.6, ckind: kind, color: p.gear.weapon.type });
              fl.alive = false;
              this.emit({ e: 'flagdash', id: p.id, x: Math.round(fl.x), y: Math.round(fl.y) });
              return true;
            }
          }
        }
        p.act = { ...base, hitAt: 99, dur: sk.dur, moveMult: sk.moveMult ?? 0 };
        this.addArea({ kind: 'line', x: p.x, y: p.y, ang: p.aim, len: sk.len, width: sk.width, r: sk.len, delay: sk.windup, dur: sk.windup + 0.15, owner: p.id, team: p.team, dmg: sk.dmg * this.powerMult(p, kind, key), stun: sk.stun, slow: sk.slow, ckind: kind, color: p.gear.weapon.type });
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
        if (sk.shieldSelf) this.giveShield(p, sk.shieldSelf * this.powerMult(p, kind, key), 2.5);
        return true;
      case 'empower':
        // 즉시 발동 (행동을 끊지 않음): 이동 속도 + 다음 기본 공격 강화
        p.st.hasteT = sk.hasteT;
        p.st.haste = sk.haste;
        p.st.empT = sk.window;
        p.st.emp = { bonus: sk.bonus * this.powerMult(p, kind, key), slow: sk.slow || null, stun: sk.stun || 0, resetOnKill: !!sk.resetOnKill, key };
        p.comboT = 0;
        this.emit({ e: 'empower', id: p.id, x: Math.round(p.x), y: Math.round(p.y) });
        return true;
      case 'pull':
        p.act = { ...base, hitAt: sk.windup, dur: sk.dur, moveMult: sk.moveMult ?? 0.3 };
        this.emit({ e: 'tele', id: p.id, k: 'cone', x: Math.round(p.x), y: Math.round(p.y), a: r2(p.aim), r: sk.range, arc: sk.arc, t: sk.windup });
        return true;
      case 'flag': {
        const [tx, ty] = this.aimPoint(p, sk.range);
        // 깃발은 한 개만: 예전 깃발은 사라짐
        for (const a of this.areas) if (a.kind === 'flag' && a.owner === p.id) a.alive = false;
        p.act = { ...base, hitAt: 99, dur: 0.2, moveMult: 0.6 };
        this.addArea({ kind: 'flag', x: tx, y: ty, r: sk.r, delay: 0.18, ticks: 1, dur: 0.18 + sk.t, owner: p.id, team: p.team, dmg: sk.dmg * this.powerMult(p, kind, key), slow: sk.slow, ckind: kind, color: p.gear.weapon.type });
        return true;
      }
      case 'blinkskill': {
        if (p.st.rootT > 0) return false;
        const [tx, ty] = this.aimPoint(p, sk.range);
        const fx = p.x;
        const fy = p.y;
        p.x = tx;
        p.y = ty;
        p.kbx = 0;
        p.kby = 0;
        p.dashT = 0;
        resolveStatic(p, this.obstacles, this.R);
        p.act = { ...base, hitAt: 99, dur: 0.15, moveMult: 0.5 };
        this.emit({ e: 'blink', id: p.id, x: Math.round(fx), y: Math.round(fy), x2: Math.round(p.x), y2: Math.round(p.y) });
        const pm = this.powerMult(p, kind, key);
        if (sk.burn) {
          const b = sk.burn;
          this.addArea({ kind: 'burn', x: fx, y: fy, r: b.r, delay: 0, ticks: Infinity, every: b.every, dur: b.t, owner: p.id, team: p.team, dmg: b.dmg * pm, ckind: kind, color: p.gear.weapon.type });
        }
        if (sk.land) {
          const hits = this.novaHit(p, sk.land.r, sk.land.dmg * pm, 0, kind, p.gear.weapon.type, sk.land.slow || null);
          if (hits > 0 && sk.refundHit) p.cdRefund = sk.refundHit;
        }
        if (sk.bolt) {
          const tgt = this.nearestEnemy(p, sk.bolt.range);
          if (tgt) {
            const ang = Math.atan2(tgt.y - p.y, tgt.x - p.x);
            this.spawnProj(p, { angle: ang, speed: 1300, range: sk.bolt.range * 1.4, dmg: sk.bolt.dmg * pm, r: 10, pkind: 'orbshot', ckind: kind, homing: tgt.id });
          }
        }
        return true;
      }
      case 'shadow': {
        let [tx, ty] = this.aimPoint(p, sk.range);
        // 벽 너머로는 못 보냄: 벽에 막히면 벽 앞까지
        const steps = 12;
        for (let i = 1; i <= steps; i++) {
          const x = p.x + ((tx - p.x) * i) / steps;
          const y = p.y + ((ty - p.y) * i) / steps;
          if (wallBlocked(p.x, p.y, x, y, this.walls, 10)) {
            tx = p.x + ((tx - p.x) * (i - 1)) / steps;
            ty = p.y + ((ty - p.y) * (i - 1)) / steps;
            break;
          }
        }
        for (const a of this.ownShadows(p)) if (a.slot === 'w') a.alive = false;
        p.act = { ...base, hitAt: 99, dur: 0.15, moveMult: 1 };
        this.addArea({ kind: 'shadow', x: tx, y: ty, r: 18, delay: 0, ticks: 0, dur: sk.t, owner: p.id, team: p.team, slot: 'w', color: p.gear.weapon.type });
        this.emit({ e: 'shadow', id: p.id, x: Math.round(p.x), y: Math.round(p.y), x2: Math.round(tx), y2: Math.round(ty) });
        return true;
      }
      case 'mark': {
        if (p.st.rootT > 0) return false;
        const tgt = this.executeTarget(p, sk.range);
        if (!tgt) return false;
        for (const a of this.ownShadows(p)) if (a.slot === 'r') a.alive = false;
        this.addArea({ kind: 'shadow', x: p.x, y: p.y, r: 18, delay: 0, ticks: 0, dur: sk.t, owner: p.id, team: p.team, slot: 'r', color: p.gear.weapon.type });
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
        p.st.iframeT = Math.max(p.st.iframeT, 0.6);
        p.act = { ...base, hitAt: 99, dur: 0.3, moveMult: 0.5 };
        this.emit({ e: 'blink', id: p.id, x: Math.round(fromX), y: Math.round(fromY), x2: Math.round(p.x), y2: Math.round(p.y) });
        tgt.st.mark = { src: p.id, t: sk.markT, acc: 0, pct: sk.markPct };
        this.emit({ e: 'mark', id: tgt.id, x: Math.round(tgt.x), y: Math.round(tgt.y) });
        this.dealDamage(p, tgt, sk.dmg * this.powerMult(p, kind, key), { kind, pre: true, big: true });
        return true;
      }
      case 'conflag': {
        const tgt = this.executeTarget(p, sk.range);
        if (!tgt) return false;
        p.act = { ...base, hitAt: 99, dur: 0.25, moveMult: 0.6 };
        p.aim = Math.atan2(tgt.y - p.y, tgt.x - p.x);
        const pm = this.powerMult(p, kind, key);
        const burning = this.burning(tgt);
        const hit = (u) => {
          const dealt = this.dealDamage(p, u, sk.dmg * pm, { kind, pre: true });
          if (dealt >= 0 && sk.dot) this.addDot(u, sk.dot.dmg * pm, sk.dot.t, p, 'burn');
        };
        this.emit({ e: 'conflag', id: p.id, x: Math.round(p.x), y: Math.round(p.y), x2: Math.round(tgt.x), y2: Math.round(tgt.y), r: burning ? sk.spread : 0 });
        hit(tgt);
        if (burning) {
          for (const u of this.units) {
            if (u === tgt || !u.alive || u.team === p.team) continue;
            if (dist2(u.x, u.y, tgt.x, tgt.y) <= (sk.spread + u.r) ** 2) hit(u);
          }
        }
        return true;
      }
      case 'bounce': {
        const tgt = this.executeTarget(p, sk.range);
        if (!tgt) return false;
        p.act = { ...base, hitAt: 99, dur: 0.3, moveMult: 0.5 };
        const ang = Math.atan2(tgt.y - p.y, tgt.x - p.x);
        p.aim = ang;
        const pm = this.powerMult(p, kind, key);
        this.spawnProj(p, { angle: ang, speed: 900, range: sk.range * 1.6, dmg: sk.dmg * pm, r: 16, pkind: 'fireball', ckind: kind, homing: tgt.id, homeTurn: 30, dot: sk.dot ? { dmg: sk.dot.dmg * pm, t: sk.dot.t } : null, bounce: { left: sk.bounces - 1, r: sk.bounceR } });
        return true;
      }
      case 'aegis': {
        let n = 0;
        for (const u of this.units) {
          if (!u.alive || u.team === p.team) continue;
          if (dist2(u.x, u.y, p.x, p.y) > (sk.r + u.r) ** 2) continue;
          if (u.isPlayer) n++;
          this.addSlow(u, sk.slow.amt, sk.slow.t, `aegis${p.id}`);
        }
        this.giveShield(p, (sk.shield + sk.perEnemy * n) * this.powerMult(p, kind, key), 3);
        this.emit({ e: 'nova', id: p.id, x: Math.round(p.x), y: Math.round(p.y), r: sk.r, w: p.gear.weapon.type });
        return true;
      }
      case 'arena': {
        if (p.st.rootT > 0) return false;
        const [tx, ty, d] = this.aimPoint(p, sk.range);
        const ang = Math.atan2(ty - p.y, tx - p.x);
        startDash(p, Math.cos(ang), Math.sin(ang), sk.air, Math.max(40, d));
        p.act = { ...base, hitAt: 99, dur: sk.air + 0.12, moveMult: 0, dir: ang };
        this.addArea({ kind: 'leap', x: tx, y: ty, r: sk.r, delay: sk.air, dur: sk.air + 0.05, owner: p.id, team: p.team, dmg: sk.dmg * this.powerMult(p, kind, key), ckind: kind, color: p.gear.weapon.type, follow: true });
        this.addArea({ kind: 'arena', x: tx, y: ty, r: sk.arenaR, delay: sk.air, ticks: 0, dur: sk.air + sk.t, owner: p.id, team: p.team, color: p.gear.weapon.type, follow: true });
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
        const stacks = tgt.st.bleed && tgt.st.bleed.src === p.id ? tgt.st.bleed.n : 0;
        const dmg = (sk.dmg + (sk.missing || 0) * (tgt.maxHp - tgt.hp)) * (1 + (sk.bleedBonus || 0) * stacks) * this.powerMult(p, kind, key);
        if (sk.bleedBonus) this.emit({ e: 'dunk', id: tgt.id, x: Math.round(tgt.x), y: Math.round(tgt.y), n: stacks });
        this.dealDamage(p, tgt, dmg, { kind, pre: true, big: true, true: !!sk.trueDmg });
        // 처형선 아래로 떨어지면 즉사
        if (tgt.alive && sk.threshold && tgt.hp <= tgt.maxHp * sk.threshold) {
          this.emit({ e: 'execute', id: tgt.id, x: Math.round(tgt.x), y: Math.round(tgt.y) });
          this.dealDamage(p, tgt, tgt.hp + tgt.st.shield + 1, { kind, pre: true, big: true, true: true });
        }
        if (!tgt.alive && sk.ultRefund && tgt.isPlayer) p.ultBack = sk.ultRefund;
        if (!tgt.alive && sk.ultRefund >= 100 && tgt.isPlayer) this.emit({ e: 'reset', id: p.id, x: Math.round(p.x), y: Math.round(p.y) });
        return true;
      }
      default:
        return false;
    }
  },

  giveShield(p, amt, t) {
    p.st.shield = Math.max(p.st.shield, amt);
    p.st.shieldT = Math.max(p.st.shieldT, t);
  },

  ownFlag(p) {
    for (const a of this.areas) if (a.alive && a.kind === 'flag' && a.owner === p.id && a.fired) return a;
    return null;
  },

  burning(u) {
    return u.st.burnT > 0;
  },

  // 사거리 안 가장 가까운 적 (플레이어 우선)
  nearestEnemy(p, range) {
    let best = null;
    let bestD = Infinity;
    for (const u of this.units) {
      if (!u.alive || u.team === p.team || u.invulnT > 0) continue;
      if (u.isPlayer && u.st.invisT > 0) continue;
      const d = dist2(u.x, u.y, p.x, p.y) * (u.isPlayer ? 0.4 : 1);
      if (d > range * range) continue;
      if (wallBlocked(p.x, p.y, u.x, u.y, this.walls, 4)) continue;
      if (d < bestD) {
        bestD = d;
        best = u;
      }
    }
    return best;
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
    } else if (((sk.type === 'dashstrike' && sk.dmg > 0) || a.dashHit) && p.dashT > 0) {
      const width = a.dashHit ? a.dashHit.width : sk.width;
      const dmg = a.dashHit ? a.dashHit.dmg : a.dmg;
      for (const u of this.units) {
        if (!u.alive || u.team === p.team || a.hitSet.has(u.id)) continue;
        if (dist2(u.x, u.y, p.x, p.y) > (width + u.r) ** 2) continue;
        a.hitSet.add(u.id);
        const dealt = this.dealDamage(p, u, dmg, { kind: a.kind, pre: true });
        if (dealt >= 0 && sk.knock && !a.dashHit) this.knock(u, p.x - p.ddx * 30, p.y - p.ddy * 30, sk.knock, p);
        if (dealt >= 0 && a.dashHit && a.dashHit.slow) this.addSlow(u, a.dashHit.slow.amt, a.dashHit.slow.t, `dash${p.id}`);
      }
    }
    if (!a.done && a.t >= a.hitAt) {
      a.done = true;
      // 대상 지정 공격: 준비 동작 동안 움직인 대상 쪽으로 다시 조준
      if (a.tgt) {
        const u = this.byId.get(a.tgt);
        if (u && u.alive) a.dir = Math.atan2(u.y - p.y, u.x - p.x);
        else a.tgt = 0;
      }
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
        this.meleeHit(p, a.dir, a.c, kind, a.tgt);
        break;
      case 'proj': {
        const pk = (PROJ_KIND_FOR[wtype] && PROJ_KIND_FOR[wtype][a.key]) || 'arrow';
        const n = sk.fan || 1;
        const group = n > 1 ? new Set() : null;
        for (let i = 0; i < n; i++) this.spawnProj(p, {
          group,
          angle: n > 1 ? p.aim + (i / (n - 1) - 0.5) * sk.spread : a.key === 'basic' ? a.dir : p.aim,
          homing: a.key === 'basic' ? a.tgt : 0,
          homeTurn: 25,
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
          refund: sk.refund || null,
          refundAll: sk.refundAll || 0,
          stunByDist: !!sk.stunByDist,
          burnStun: sk.burnStun || 0,
          splash: sk.splash || 0,
          rootAll: !!sk.rootAll,
          big: kind === 'ult',
        });
        // 제드 Q: 그림자들도 커서 쪽으로 같이 던짐
        if (sk.fromShadows) {
          const cx = Number.isFinite(p.input.cx) ? p.input.cx : p.x + Math.cos(p.aim) * 300;
          const cy = Number.isFinite(p.input.cy) ? p.input.cy : p.y + Math.sin(p.aim) * 300;
          for (const sh of this.ownShadows(p)) {
            this.spawnProj(p, { x: sh.x, y: sh.y, angle: Math.atan2(cy - sh.y, cx - sh.x), speed: sk.speed, range: sk.range, dmg: sk.dmg * this.powerMult(p, kind, key), r: sk.r, pierce: sk.pierce || 0, pkind: pk, ckind: kind });
          }
        }
        break;
      }
      case 'fan': {
        const group = new Set();
        for (let i = 0; i < sk.count; i++) {
          const ang = p.aim + (i / (sk.count - 1) - 0.5) * sk.spread;
          this.spawnProj(p, { angle: ang, speed: sk.speed, range: sk.range, dmg: sk.dmg * this.powerMult(p, kind, key), r: sk.r, knock: sk.knock || 0, slow: sk.slow || null, pkind: 'arrow', ckind: kind, group });
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
      case 'nova': {
        let hits = this.novaHit(p, sk.r, sk.dmg * this.powerMult(p, kind, key), sk.knock, kind, wtype, sk.slow);
        if (sk.shieldSelf) this.giveShield(p, sk.shieldSelf * this.powerMult(p, kind, key), 2.5);
        // 제드 E: 그림자 주변도 벰 (한 대상은 한 번만 맞음, 그림자에 맞으면 둔화)
        if (sk.fromShadows) {
          const done = new Set();
          for (const u of this.units) if (u.alive && u !== p && dist2(u.x, u.y, p.x, p.y) <= (sk.r + u.r) ** 2) done.add(u.id);
          for (const sh of this.ownShadows(p)) {
            this.emit({ e: 'nova', id: p.id, x: Math.round(sh.x), y: Math.round(sh.y), r: sk.r, w: wtype });
            for (const u of this.units) {
              if (!u.alive || u.team === p.team || done.has(u.id)) continue;
              if (dist2(u.x, u.y, sh.x, sh.y) > (sk.r + u.r) ** 2) continue;
              done.add(u.id);
              const dealt = this.dealDamage(p, u, sk.dmg * this.powerMult(p, kind, key), { kind, pre: true });
              if (dealt >= 0) {
                hits++;
                if (sk.shadowSlow) this.addSlow(u, sk.shadowSlow.amt, sk.shadowSlow.t, `shadow${p.id}`);
              }
            }
          }
        }
        if (hits > 0 && sk.hitRefund) for (const k in sk.hitRefund) p.cd[k] = Math.max(0, p.cd[k] - sk.hitRefund[k]);
        break;
      }
      case 'pull': {
        const dmg = sk.dmg * this.powerMult(p, kind, key);
        this.emit({ e: 'cone', id: p.id, x: Math.round(p.x), y: Math.round(p.y), a: r2(a.dir), r: sk.range, arc: sk.arc, w: wtype, k: 1 });
        for (const u of this.units) {
          if (!u.alive || u.team === p.team) continue;
          const dx = u.x - p.x;
          const dy = u.y - p.y;
          const d2 = dx * dx + dy * dy;
          if (d2 > (sk.range + u.r) ** 2) continue;
          const d = Math.sqrt(d2) || 1;
          const tol = d > u.r ? Math.asin(u.r / d) : Math.PI;
          if (Math.abs(angleDiff(a.dir, Math.atan2(dy, dx))) > sk.arc / 2 + tol) continue;
          if (wallBlocked(p.x, p.y, u.x, u.y, this.walls, 2)) continue;
          const dealt = this.dealDamage(p, u, dmg, { kind, pre: true });
          if (dealt < 0) continue;
          if (sk.slow) this.addSlow(u, sk.slow.amt, sk.slow.t, `pull${p.id}`);
          if (wtype === 'greatsword') this.addBleed(u, p);
          // 끌어당김: 보스·CC 면역은 끌려오지 않음
          if (u.ccImmune || u.st.ccImmT > 0 || u.st.bulwarkT > 0) continue;
          const pullDist = d - (p.r + u.r + 24);
          if (pullDist > 20) {
            startDash(u, -dx / d, -dy / d, 0.2, pullDist);
            u.act = null;
            if (u.channel) u.channel = null;
          }
          if (sk.stun) this.stun(u, sk.stun);
        }
        break;
      }
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
          dot: sk.dot ? { dmg: sk.dot.dmg * this.powerMult(p, kind, key), t: sk.dot.t } : null,
          burnBonus: sk.burnBonus || 0,
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
      {
        const pm = this.powerMult(p, kind, key);
        const ring = { kind: 'ring', x: p.x, y: p.y, r: sk.r, delay: sk.delay, ticks: 1, dur: sk.delay + 0.2, owner: p.id, team: p.team, dmg: sk.dmg * pm, root: sk.root, ckind: kind, color: wtype, follow: true, outer: sk.outer || null, heal: (sk.heal || 0) * pm, dot: sk.dot ? { dmg: sk.dot.dmg * pm, t: sk.dot.t } : null };
        this.addArea(ring);
        if (sk.twice) this.addArea({ ...ring, dmg: ring.dmg * 0.6, delay: sk.delay + 0.45, dur: sk.delay + 0.65 });
        break;
      }
      default:
        break;
    }
  },

  lunge(p, dir, dist) {
    p.kbx += Math.cos(dir) * dist * C.KB_DAMP;
    p.kby += Math.sin(dir) * dist * C.KB_DAMP;
  },

  meleeHit(p, dir, c, kind, tgtId = 0) {
    const dmg = c.dmg * this.powerMult(p, kind, 'basic');
    const emp = kind === 'basic' && p.st.empT > 0 ? p.st.emp : null;
    let hitAny = false;
    for (const u of this.units) {
      if (!u.alive || u === p || u.team === p.team) continue;
      const dx = u.x - p.x;
      const dy = u.y - p.y;
      // 지정한 대상은 살짝 멀어져도 맞음 (준비 동작 중 한 걸음 물러난 정도)
      const reach = c.range + u.r + (u.id === tgtId ? 30 : 0);
      const d2 = dx * dx + dy * dy;
      if (d2 > reach * reach) continue;
      const d = Math.sqrt(d2);
      const tol = d > u.r ? Math.asin(u.r / d) : Math.PI;
      if (Math.abs(angleDiff(dir, Math.atan2(dy, dx))) > c.arc / 2 + tol) continue;
      const dealt = this.dealDamage(p, u, dmg + (emp ? emp.bonus : 0), { kind, pre: true, big: !!emp });
      if (dealt >= 0 && c.knock) this.knock(u, p.x, p.y, c.knock, p);
      if (dealt >= 0 && kind === 'basic') this.basicPassive(p, u);
      if (dealt >= 0 && emp) {
        hitAny = true;
        if (emp.slow) this.addSlow(u, emp.slow.amt, emp.slow.t, `emp${p.id}`);
        if (emp.stun) this.stun(u, emp.stun);
        if (!u.alive && u.isPlayer && emp.resetOnKill) p.cd[emp.key] = 0;
      }
    }
    if (hitAny) {
      p.st.empT = 0;
      p.st.emp = null;
      this.emit({ e: 'empowerhit', id: p.id, x: Math.round(p.x), y: Math.round(p.y), a: r2(dir) });
    }
  },

  // 직업 패시브 (기본 공격 적중 시): 대검 출혈, 쌍단검 약자 멸시
  basicPassive(p, u) {
    const wt = p.gear.weapon.type;
    if (wt === 'greatsword') this.addBleed(u, p);
    else if (wt === 'daggers' && u.alive) {
      const pv = WEAPONS.daggers.passive;
      if (u.hp < u.maxHp * pv.lowHp && (u.zedT || 0) <= this.time) {
        u.zedT = this.time + pv.cd;
        this.emit({ e: 'passive', id: u.id, x: Math.round(u.x), y: Math.round(u.y) });
        this.dealDamage(p, u, u.maxHp * pv.pct, { kind: 'skill', pre: true, big: true });
      }
    }
  },

  novaHit(p, r, dmg, knock, kind, wtype, slow = null) {
    if (wtype) this.emit({ e: 'nova', id: p.id, x: Math.round(p.x), y: Math.round(p.y), r, w: wtype });
    let n = 0;
    for (const u of this.units) {
      if (!u.alive || u === p || u.team === p.team) continue;
      if (dist2(u.x, u.y, p.x, p.y) > (r + u.r) ** 2) continue;
      const dealt = this.dealDamage(p, u, dmg, { kind, pre: true });
      if (dealt >= 0 && knock) this.knock(u, p.x, p.y, knock, p);
      if (dealt >= 0 && slow) this.addSlow(u, slow.amt, slow.t, `nova${p.id}`);
      if (dealt >= 0) n++;
    }
    return n;
  },

  // ---------------- D 구르기 ----------------
  // 커서 방향으로 짧게 구르며 잠깐 무적. 하던 공격·채널을 끊고 즉시 사용
  tryRoll(p) {
    if (!p.alive || p.cd.d > 0 || p.st.stunT > 0 || p.st.rootT > 0) return false;
    let dx = (Number.isFinite(p.input.cx) ? p.input.cx : p.x + Math.cos(p.aim)) - p.x;
    let dy = (Number.isFinite(p.input.cy) ? p.input.cy : p.y + Math.sin(p.aim)) - p.y;
    const len = Math.sqrt(dx * dx + dy * dy) || 1;
    dx /= len;
    dy /= len;
    p.act = null;
    p.channel = null;
    p.kbx = 0;
    p.kby = 0;
    startDash(p, dx, dy, C.ROLL.time, C.ROLL.dist);
    p.st.iframeT = Math.max(p.st.iframeT, C.ROLL.iframe);
    p.cd.d = C.ROLL.cd;
    this.emit({ e: 'dash', id: p.id, x: Math.round(p.x), y: Math.round(p.y), dx: r2(dx), dy: r2(dy) });
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
    if (tgt.isPlayer && !ctx.true) {
      if (tgt.st.bulwarkT > 0 && kind !== 'zone') dmg *= 0.5;
      if (tgt.orbs.includes(1)) dmg *= 0.75;
      if (tgt.dr) dmg *= 1 - tgt.dr;
    }
    if (tgt.st.shield > 0 && kind !== 'zone' && !ctx.true) {
      const absorbed = Math.min(tgt.st.shield, dmg);
      tgt.st.shield -= absorbed;
      dmg -= absorbed;
      if (absorbed > 0) this.emit({ e: 'shieldhit', id: tgt.id, x: Math.round(tgt.x), y: Math.round(tgt.y), a: Math.round(absorbed) });
    }
    if (dmg <= 0) return 0;
    tgt.hp -= dmg;
    tgt.lastDmgT = this.time;
    if (tgt.st.mark && src && tgt.st.mark.src === src.id) tgt.st.mark.acc += dmg;
    if (src && src.isPlayer && src !== tgt) {
      src.dmgDealt += tgt.isPlayer ? dmg : 0;
      src.ult = Math.min(100, src.ult + dmg * C.ULT_PER_DMG * (tgt.isPlayer ? 1 : 0.3) * (src.orbs.includes(2) ? 2 : 1));
      if (!tgt.isPlayer && !tgt.resetting) this.aggroMonster(tgt, src);
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

  // 정글 몬스터를 때리면 그 캠프 전체가 때린 사람을 노림
  aggroMonster(m, src) {
    if (m.target === src.id) return;
    m.target = src.id;
    if (!m.camp) return;
    for (const o of this.monsters) if (o.alive && o.camp === m.camp && !o.target && !o.resetting) o.target = src.id;
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
    if (BURN_KEYS.includes(key)) u.st.burnT = Math.max(u.st.burnT, t);
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
      if (st.hasteT > 0) st.hasteT -= dt;
      if (st.burnT > 0) st.burnT -= dt;
      if (st.empT > 0) {
        st.empT -= dt;
        if (st.empT <= 0) st.emp = null;
      }
      if (st.shieldT > 0) {
        st.shieldT -= dt;
        if (st.shieldT <= 0) st.shield = 0;
      }
      if (st.slows.length) {
        for (const q of st.slows) q.t -= dt;
        st.slows = st.slows.filter((q) => q.t > 0);
      }
      if (st.bleed) {
        const b = st.bleed;
        b.t -= dt;
        b.tick -= dt;
        if (b.tick <= 0) {
          b.tick += 0.5;
          this.dealDamage(this.byId.get(b.src) || null, u, b.per * b.n * 0.5, { kind: 'dot', pre: true });
        }
        if (b.t <= 0 || !u.alive) st.bleed = null;
      }
      if (st.mark) {
        const m = st.mark;
        m.t -= dt;
        if (m.t <= 0) {
          st.mark = null;
          const src = this.byId.get(m.src) || null;
          this.emit({ e: 'markpop', id: u.id, x: Math.round(u.x), y: Math.round(u.y) });
          if (m.acc > 0) this.dealDamage(src, u, m.acc * m.pct, { kind: 'ult', pre: true, big: true });
        }
      }
      if (!u.alive) continue;
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
      refund: o.refund || null,
      refundAll: o.refundAll || 0,
      stunByDist: !!o.stunByDist,
      burnStun: o.burnStun || 0,
      splash: o.splash || 0,
      rootAll: !!o.rootAll,
      homing: o.homing || 0,
      homeTurn: o.homeTurn || 6,
      group: o.group || null,
      bounce: o.bounce || null,
      ignoreId: o.ignoreId || 0, // 튕겨 나온 직후엔 방금 맞힌 대상을 무시
      big: !!o.big,
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
      if (pr.homing) {
        const t = this.byId.get(pr.homing);
        if (t && t.alive) {
          const want = Math.atan2(t.y - pr.y, t.x - pr.x);
          const cur = Math.atan2(pr.vy, pr.vx);
          const turn = Math.max(-pr.homeTurn * dt, Math.min(pr.homeTurn * dt, angleDiff(cur, want)));
          pr.vx = Math.cos(cur + turn) * pr.speed;
          pr.vy = Math.sin(cur + turn) * pr.speed;
        }
      }
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
        if (pr.ignoreId === u.id && pr.dist < 140) continue;
        // 다발 사격은 한 대상에 한 발만
        if (pr.group && pr.group.has(u.id)) continue;
        const rr = u.r + pr.r;
        if (segPointDist2(ox, oy, pr.x, pr.y, u.x, u.y) > rr * rr) continue;
        const kind = owner && owner.isPlayer ? pr.ckind : 'monster';
        if (pr.group) pr.group.add(u.id);
        const wasBurning = this.burning(u);
        const dealt = this.dealDamage(owner, u, pr.dmg, { kind, pre: true, big: pr.big });
        if (dealt >= 0 && owner && owner.isPlayer) this.projOnHit(owner, pr, u, wasBurning);
        if (dealt >= 0) {
          if (pr.knock) this.knock(u, u.x - pr.vx * 0.01, u.y - pr.vy * 0.01, pr.knock, owner);
          if (pr.dot) this.addDot(u, pr.dot.dmg, pr.dot.t, owner, pr.pkind);
          if (pr.slow) this.addSlow(u, pr.slow.amt, pr.slow.t, pr.pkind);
          if (pr.chill) this.addChill(u, pr.chill);
          if (pr.root) {
            this.root(u, pr.root);
            if (!pr.rootAll) pr.root = 0;
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

  // 스킬 투사체 적중 효과: 쿨 감소, 거리 비례 기절, 불타는 적 기절, 폭발
  projOnHit(owner, pr, u, wasBurning) {
    // 브랜드 R: 주변 적에게 튕김 (없으면 같은 적에게 다시)
    if (pr.bounce && pr.bounce.left > 0) {
      let next = null;
      let bd = Infinity;
      for (const o of this.units) {
        if (!o.alive || o.team === pr.team || o === u) continue;
        const d = dist2(o.x, o.y, u.x, u.y) * (o.isPlayer ? 0.6 : 1);
        if (d < pr.bounce.r * pr.bounce.r && d < bd) {
          bd = d;
          next = o;
        }
      }
      if (!next && u.alive) next = u;
      if (next) {
        const off = next === u ? 60 : 0;
        const a0 = this.rng() * TAU;
        const sx = u.x + Math.cos(a0) * off;
        const sy = u.y + Math.sin(a0) * off;
        this.spawnProj(owner, { x: sx, y: sy, angle: Math.atan2(next.y - sy, next.x - sx) + (off ? 0.8 : 0), speed: 900, range: 1600, dmg: pr.dmg, r: pr.r, pkind: pr.pkind, ckind: pr.ckind, homing: next.id, homeTurn: 30, dot: pr.dot, bounce: { left: pr.bounce.left - 1, r: pr.bounce.r }, big: true, ignoreId: u.id });
      }
    }
    if (pr.refund) {
      for (const k in pr.refund) owner.cd[k] = Math.max(0, owner.cd[k] - pr.refund[k]);
      pr.refund = null;
    }
    if (pr.refundAll && u.isPlayer) {
      for (const k of ['q', 'w', 'e']) owner.cd[k] = Math.max(0, owner.cd[k] - pr.refundAll);
    }
    if (pr.stunByDist) this.stun(u, Math.min(1, 0.3 + pr.dist / 1500));
    if (pr.burnStun && wasBurning) this.stun(u, pr.burnStun);
    if (pr.splash) {
      this.emit({ e: 'areafx', k: 'ground', x: Math.round(u.x), y: Math.round(u.y), r: pr.splash, w: pr.color });
      for (const o of this.units) {
        if (o === u || !o.alive || o.team === pr.team) continue;
        if (dist2(o.x, o.y, u.x, u.y) > (pr.splash + o.r) ** 2) continue;
        this.dealDamage(owner, o, pr.dmg * 0.6, { kind: pr.ckind, pre: true });
      }
    }
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
      outer: o.outer || null,
      slot: o.slot || '',
      swapped: false,
      heal: o.heal || 0,
      dot: o.dot || null,
      burnBonus: o.burnBonus || 0,
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
      if (a.kind === 'arena' && a.t >= a.delay) this.arenaWalls(a);
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
            a.dot = null;
            a.burnBonus = 0;
          }
        }
      }
      if (a.t >= a.dur) a.alive = false;
    }
    if (this.areas.some((a) => !a.alive)) this.areas = this.areas.filter((a) => a.alive);
  },

  // 자르반 R 격투장: 안에 있는 적은 못 나가고 밖에 있는 적은 못 들어옴
  arenaWalls(a) {
    // 벽이 세워지는 순간 안에 있던 적을 기억
    if (!a.inside) {
      a.inside = new Set();
      for (const u of this.units) if (u.alive && u.team !== a.team && dist2(u.x, u.y, a.x, a.y) < a.r * a.r) a.inside.add(u.id);
      this.emit({ e: 'areafx', k: 'arena', x: Math.round(a.x), y: Math.round(a.y), r: a.r, w: a.color });
    }
    for (const u of this.units) {
      if (!u.alive || u.team === a.team || u.ccImmune) continue;
      const dx = u.x - a.x;
      const dy = u.y - a.y;
      const d = Math.sqrt(dx * dx + dy * dy) || 1;
      if (a.inside.has(u.id)) {
        if (d > a.r - u.r) {
          u.x = a.x + (dx / d) * (a.r - u.r);
          u.y = a.y + (dy / d) * (a.r - u.r);
          u.kbx = u.kby = 0;
          u.dashT = 0;
        }
      } else if (d < a.r + u.r && d > a.r - 40) {
        u.x = a.x + (dx / d) * (a.r + u.r);
        u.y = a.y + (dy / d) * (a.r + u.r);
      }
    }
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
    if (a.kind === 'flag') {
      // 깃발: 꽂힐 때 한 번 피해, 이후 tickN이 다 차서 그냥 서 있음
      this.emit({ e: 'areafx', k: 'flag', x: Math.round(a.x), y: Math.round(a.y), r: a.r, w: a.color });
    } else if (a.tickN === 1 || a.kind === 'line' || a.kind === 'leap' || a.kind === 'ring') {
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
      let dmg = a.dmg;
      if (a.outer && dist2(u.x, u.y, a.x, a.y) >= a.outer.r0 * a.outer.r0) dmg *= a.outer.mult;
      if (a.burnBonus && this.burning(u)) dmg *= 1 + a.burnBonus;
      const dealt = this.dealDamage(owner, u, dmg, { kind: a.kind === 'burn' ? 'dot' : a.ckind, pre: true, big: a.kind === 'line' || (a.outer && dmg > a.dmg) });
      if (dealt < 0) continue;
      if (a.kind === 'burn') u.st.burnT = Math.max(u.st.burnT, 0.7);
      if (a.dot) this.addDot(u, a.dot.dmg, a.dot.t, owner, a.color === 'firestaff' ? 'burn' : 'bleed');
      if (a.heal && owner && owner.alive) this.heal(owner, a.heal * (u.isPlayer ? 1 : 0.35));
      if (a.kind === 'ring' && a.color === 'greatsword' && owner && owner.isPlayer) this.addBleed(u, owner);
      if (a.stun) this.stun(u, a.stun);
      if (a.root) this.root(u, a.root);
      if (a.slow) this.addSlow(u, a.slow.amt, a.slow.t, `area${a.id}`);
    }
  },
};
