// 봇 AI: 빈자리를 채워 언제 들어와도 16인 판이 되게 함
// 사냥 → 상자/장비 → 오브 쟁탈 → 교전/후퇴
import { dist2 } from './math.js';
import { PRESS } from './constants.js';

export const BOT_NAMES = [
  '그림자여우', 'Noctis', '망자의왕', 'Kairos', '하늘조각', 'Rinne', '불멸의토끼', 'Ashen',
  'StyxRider', '명계여행자', 'Orphe', 'Lunar', '피의서약', 'Echo', '검은나비', 'Vesper',
  'Nyx_kr', '영혼수집가', 'Moira', '저승배달부', 'Ignis', '은빛화살', 'Pyre', '심연', 'Selene',
  '번개도령', 'Erebus', '고양이전사', 'Atlas', '새벽별', 'Kuro', '달빛검객', 'Zephyr', '불꽃망령',
];

// 무기별 교전 거리와 스킬 사용 조건
const AI = {
  greatsword: { pref: 70, reach: 100, s1: { max: 150 }, s2: { min: 110, max: 320, ground: true }, ult: { max: 480, aim: true } },
  daggers: { pref: 55, reach: 80, s1: { min: 90, max: 230, aim: true }, s2: { min: 140, max: 580, aim: true }, ult: { max: 290, exec: true } },
  longbow: { pref: 430, reach: 740, s1: { min: 200, max: 900, aim: true }, s2: { max: 190, aim: true }, ult: { max: 690, ground: true } },
  firestaff: { pref: 380, reach: 630, s1: { max: 640, ground: true }, s2: { max: 270, aim: true }, ult: { max: 690, ground: true } },
  froststaff: { pref: 360, reach: 630, s1: { max: 165 }, s2: { max: 680, aim: true }, ult: { max: 590, ground: true } },
  spear: { pref: 120, reach: 150, s1: { min: 110, max: 290, aim: true }, s2: { max: 150 }, ult: { min: 140, max: 860, aim: true } },
};

const PROJ_SPEED = { longbow: 1150, firestaff: 800, froststaff: 850 };

export function makeBotBrain(rng, skill) {
  return {
    skill,
    aimErr: 0.4 - skill * 0.34,
    aggro: 0.25 + rng() * 0.5 + skill * 0.25,
    thinkT: rng() * 0.3,
    mode: 'wander',
    target: 0,
    goal: null,
    wx: 0,
    wy: 0,
    wanderT: 0,
    strafe: rng() < 0.5 ? 1 : -1,
    strafeT: 1,
    dodgeT: 0,
    tid: 0,
    tvx: 0,
    tvy: 0,
    tlx: 0,
    tly: 0,
    tlt: 0,
    lastX: 0,
    lastY: 0,
    stuckT: 0.5,
    unstickT: 0,
    unstickA: 0,
    actCd: 0,
    avoidId: 0,
    avoidT: 0,
  };
}

function press(p, key) {
  p.input.p[PRESS[key]]++;
}

export function botThink(game, p, dt) {
  const b = p.brain;
  const rng = game.rng;
  if (b.dodgeT > 0) b.dodgeT -= dt;
  if (b.actCd > 0) b.actCd -= dt;
  b.strafeT -= dt;
  if (b.strafeT <= 0) {
    b.strafeT = 0.7 + rng() * 1.3;
    if (rng() < 0.6) b.strafe = -b.strafe;
  }
  b.thinkT -= dt;
  if (b.thinkT <= 0) {
    b.thinkT = 0.12 + (1 - b.skill) * 0.2;
    decide(game, p, b);
  }
  act(game, p, b, dt);
}

// 상대와 나의 전투력 비교 (체력 × 레벨 × 장비)
function power(u) {
  return u.hp * (1 + 0.03 * (u.level - 1)) * (1 + 0.08 * u.gear.weapon.rarity);
}

function better(p, item) {
  const cur = p.gear[item.kind];
  return item.rarity > cur.rarity;
}

function decide(game, p, b) {
  const hpR = p.hp / p.maxHp;
  const z = game.zone;
  b.goal = null;

  if (z.active && dist2(p.x, p.y, z.x, z.y) > (z.r * 0.85) ** 2) {
    b.mode = 'goto';
    b.goal = [z.x, z.y];
    return;
  }

  // 가까운 적 플레이어
  let enemy = null;
  let ed2 = Infinity;
  for (const q of game.players.values()) {
    if (!q.alive || q === p || q.invulnT > 0) continue;
    if (q.st.invisT > 0 && dist2(p.x, p.y, q.x, q.y) > 140 * 140) continue;
    const d = dist2(p.x, p.y, q.x, q.y);
    if (d < ed2) {
      ed2 = d;
      enemy = q;
    }
  }
  const ed = Math.sqrt(ed2);

  // 내가 오브를 들고 있으면: 적을 피해 다님 (승천 의식 중엔 특히)
  if (p.orbs.length && enemy && ed < 450 && power(p) < power(enemy) * 1.3) {
    b.mode = 'flee';
    b.target = enemy.id;
    return;
  }

  let attacker = game.time - p.lastHitByT < 3 ? game.players.get(p.lastHitBy) : null;
  if (attacker && attacker.isBot && game.time < 60 && !(attacker.brain.mode === 'fight' && attacker.brain.target === p.id)) {
    b.avoidId = attacker.id;
    b.avoidT = 2.5;
    attacker = null;
  }
  if (attacker && attacker.alive && dist2(p.x, p.y, attacker.x, attacker.y) < 600 * 600) enemy = attacker;
  const defending = !!attacker && enemy === attacker;

  // 오브 보유자 추격 (의식 중이면 멀리서도)
  let carrier = null;
  let cd2 = Infinity;
  for (const q of game.players.values()) {
    if (!q.alive || q === p || !q.orbs.length) continue;
    const lim = q.ritualT >= 0 ? 2600 : 1300;
    const d = dist2(p.x, p.y, q.x, q.y);
    if (d < lim * lim && d < cd2) {
      cd2 = d;
      carrier = q;
    }
  }

  const ramp = Math.min(1, Math.max(0, (game.time - 30) / 150));
  const engage = (game.time < 30 ? 0 : 200 + ramp * 360) * (0.7 + b.aggro * 0.6);
  if (enemy && (ed < engage || defending || enemy.orbs.length) && p.invulnT <= 0) {
    const courage = defending ? 0.85 + b.aggro * 0.5 : 0.55 + b.aggro * 0.6;
    const brave = power(p) * courage > power(enemy) || enemy.hp < enemy.maxHp * 0.25 || (enemy.orbs.length && hpR > 0.5);
    if (brave) {
      b.mode = 'fight';
      b.target = enemy.id;
      return;
    }
    if (hpR < 0.55 || defending) {
      b.mode = 'flee';
      b.target = enemy.id;
      return;
    }
  }
  if (carrier && hpR > 0.55 && (carrier.ritualT >= 0 || power(p) > power(carrier) * 0.8)) {
    b.mode = 'fight';
    b.target = carrier.id;
    return;
  }

  // 떨어진 오브 줍기
  let orb = null;
  let od2 = 1800 * 1800;
  for (const o of game.groundOrbs) {
    const d = dist2(p.x, p.y, o.x, o.y);
    if (d < od2) {
      od2 = d;
      orb = o;
    }
  }
  if (orb && hpR > 0.4) {
    b.mode = 'goto';
    b.goal = [orb.x, orb.y];
    return;
  }

  // 좋은 장비 줍기
  let item = null;
  let id2 = 450 * 450;
  for (const g of game.items) {
    if (!better(p, g.item)) continue;
    const d = dist2(p.x, p.y, g.x, g.y);
    if (d < id2) {
      id2 = d;
      item = g;
    }
  }
  if (item) {
    b.mode = 'item';
    b.goal = [item.x, item.y];
    return;
  }

  // 오브 수호자 / 곧 열릴 제단 (레벨이 되면)
  const ready = p.level >= 4 && hpR > 0.6;
  if (ready) {
    for (const al of game.altars) {
      if (al.state === 'guarded') {
        const g = game.byId.get(al.guardian);
        if (g && g.alive && dist2(p.x, p.y, g.x, g.y) < 1800 * 1800) {
          b.mode = 'farm';
          b.target = g.id;
          return;
        }
      } else if (al.state === 'warn' && dist2(p.x, p.y, al.x, al.y) < 1600 * 1600) {
        b.mode = 'goto';
        b.goal = [al.x + Math.cos(p.id) * 180, al.y + Math.sin(p.id) * 180];
        return;
      }
    }
  }

  // 상자 (근처에 적이 없을 때)
  if (!enemy || ed > 450) {
    let chest = null;
    let c2 = 600 * 600;
    for (const c of game.chests) {
      if (c.open) continue;
      const d = dist2(p.x, p.y, c.x, c.y);
      if (d < c2) {
        c2 = d;
        chest = c;
      }
    }
    if (chest) {
      b.mode = 'chest';
      b.goal = [chest.x, chest.y];
      return;
    }
  }

  // 사냥 (다른 플레이어가 잡고 있는 몬스터는 초반에 피함)
  let mon = null;
  let md = 900 * 900;
  for (const m of game.monsters) {
    if (!m.alive || m.type === 'guardian') continue;
    if (m.type === 'elite' && (p.level < 3 || hpR < 0.6)) continue;
    let d = dist2(p.x, p.y, m.x, m.y);
    if (m.type === 'elite') d *= 0.7;
    if (d >= md) continue;
    if (game.time < 90) {
      let crowded = false;
      for (const q of game.players.values()) {
        if (q !== p && q.alive && dist2(q.x, q.y, m.x, m.y) < 230 * 230) {
          crowded = true;
          break;
        }
      }
      if (crowded) continue;
    }
    md = d;
    mon = m;
  }
  if (mon) {
    b.mode = 'farm';
    b.target = mon.id;
    return;
  }
  b.mode = 'wander';
}

function act(game, p, b, dt) {
  const inp = p.input;
  const rng = game.rng;
  const out = { mx: 0, my: 0, aim: null, atk: false, dash: false, dashX: 0, dashY: 0 };
  const hpR = p.hp / p.maxHp;

  if (b.mode === 'fight' || b.mode === 'farm') {
    const t = game.byId.get(b.target);
    if (t && t.alive) combat(game, p, b, t, out, dt);
    else b.mode = 'wander';
  } else if (b.mode === 'flee') {
    const t = game.byId.get(b.target);
    if (t && t.alive) {
      const dx = p.x - t.x;
      const dy = p.y - t.y;
      const d = Math.sqrt(dx * dx + dy * dy) || 1;
      out.mx = dx / d - (p.x / game.R) * 0.5;
      out.my = dy / d - (p.y / game.R) * 0.5;
      out.aim = Math.atan2(-dy, -dx);
      if (d < 200 && p.cd.space <= 0 && rng() < 0.1 + b.skill * 0.15) {
        out.dash = true;
        out.dashX = dx / d;
        out.dashY = dy / d;
      }
      if (d < 250 && p.cd.e <= 0 && hpR < 0.5) press(p, 'e');
      const ai = AI[p.gear.weapon.type];
      if (ai.reach > 300 && d < ai.reach) out.atk = true;
    } else b.mode = 'wander';
  } else if (b.mode === 'goto' || b.mode === 'item' || b.mode === 'chest') {
    if (b.goal) {
      const dx = b.goal[0] - p.x;
      const dy = b.goal[1] - p.y;
      const d = Math.sqrt(dx * dx + dy * dy);
      if (b.mode === 'chest' && d < 52) {
        out.mx = 0;
        out.my = 0;
        if (!p.channel) press(p, 'f');
      } else if (b.mode === 'item' && d < 50) {
        press(p, 'f');
        b.mode = 'wander';
      } else {
        out.mx = dx;
        out.my = dy;
      }
    }
  }
  if (b.mode === 'wander') {
    b.wanderT -= dt;
    if (b.wanderT <= 0 || dist2(p.x, p.y, b.wx, b.wy) < 60 * 60) {
      b.wanderT = 3 + rng() * 3;
      const a = rng() * Math.PI * 2;
      const r = Math.sqrt(rng()) * game.R * 0.7;
      b.wx = Math.cos(a) * r;
      b.wy = Math.sin(a) * r;
    }
    out.mx = b.wx - p.x;
    out.my = b.wy - p.y;
  }

  // 기절·속박 → 정화 (천 갑옷)
  if (p.st.stunT > 0 || p.st.rootT > 0) {
    if (p.gear.armor.type === 'cloth' && p.cd.e <= 0 && rng() < 0.15 * b.skill + 0.05) press(p, 'e');
  }
  // 교전 중 방벽
  if (b.mode === 'fight' && p.gear.armor.type === 'plate' && p.cd.e <= 0 && game.time - p.lastDmgT < 0.3 && hpR < 0.75) press(p, 'e');

  if (b.avoidT > 0) {
    b.avoidT -= dt;
    const a = game.players.get(b.avoidId);
    if (a && a.alive) {
      const dx = p.x - a.x;
      const dy = p.y - a.y;
      const d = Math.sqrt(dx * dx + dy * dy) || 1;
      if (d < 260) {
        out.mx += (dx / d) * 1.5;
        out.my += (dy / d) * 1.5;
        if (b.mode === 'farm') out.atk = false;
      }
    }
  }

  dodge(game, p, b, out);

  let mx = out.mx;
  let my = out.my;
  const ml = Math.sqrt(mx * mx + my * my);
  if (ml > 0.001) {
    mx /= ml;
    my /= ml;
    const av = avoidObstacles(game, p, mx, my);
    mx = av[0];
    my = av[1];
  }
  b.stuckT -= dt;
  if (b.stuckT <= 0) {
    b.stuckT = 0.5;
    const moved = Math.sqrt(dist2(p.x, p.y, b.lastX, b.lastY));
    if (ml > 0.1 && moved < 22 && !p.act && !p.channel) {
      b.unstickT = 0.45;
      b.unstickA = Math.atan2(my, mx) + (rng() < 0.5 ? 1 : -1) * (Math.PI / 2);
    }
    b.lastX = p.x;
    b.lastY = p.y;
  }
  if (b.unstickT > 0) {
    b.unstickT -= dt;
    mx = Math.cos(b.unstickA);
    my = Math.sin(b.unstickA);
  }

  inp.mx = mx;
  inp.my = my;
  if (out.aim != null) inp.aim = out.aim;
  else if (ml > 0.001) inp.aim = Math.atan2(my, mx);
  inp.atk = out.atk;
  if (out.dash && p.cd.space <= 0) {
    inp.mx = out.dashX;
    inp.my = out.dashY;
    press(p, 'space');
  }
}

function combat(game, p, b, t, out, dt) {
  const rng = game.rng;
  const dx = t.x - p.x;
  const dy = t.y - p.y;
  const d = Math.sqrt(dx * dx + dy * dy) || 1;
  const nx = dx / d;
  const ny = dy / d;
  if (b.tid !== t.id) {
    b.tid = t.id;
    b.tvx = 0;
    b.tvy = 0;
    b.tlx = t.x;
    b.tly = t.y;
    b.tlt = game.time;
  } else {
    const dtt = game.time - b.tlt;
    if (dtt >= 0.1) {
      b.tvx = b.tvx * 0.5 + ((t.x - b.tlx) / dtt) * 0.5;
      b.tvy = b.tvy * 0.5 + ((t.y - b.tly) / dtt) * 0.5;
      b.tlx = t.x;
      b.tly = t.y;
      b.tlt = game.time;
    }
  }
  const w = p.gear.weapon.type;
  const ai = AI[w];
  const reach = ai.reach + t.r;
  let mx = 0;
  let my = 0;
  if (d > ai.pref + 25) {
    mx = nx;
    my = ny;
  } else if (d < ai.pref - 40 && ai.pref > 200) {
    mx = -nx;
    my = -ny;
  }
  if (t.isPlayer && d < reach + 100) {
    mx += -ny * b.strafe * 0.75;
    my += nx * b.strafe * 0.75;
  }
  if (!t.isPlayer && ai.pref > 200 && d < 170) {
    mx = -nx;
    my = -ny;
  }
  const ps = PROJ_SPEED[w];
  const lead = ps ? (d / ps) * b.skill : 0;
  const ax = t.x + b.tvx * lead;
  const ay = t.y + b.tvy * lead;
  out.aim = Math.atan2(ay - p.y, ax - p.x) + (rng() - 0.5) * b.aimErr;
  out.mx = mx;
  out.my = my;
  if (d < reach) out.atk = true;

  if (b.actCd > 0 || p.act || p.dashT > 0) return;
  const k = 0.6 * b.skill;
  const px = t.x + b.tvx * k + (rng() - 0.5) * 70 * (1 - b.skill);
  const py = t.y + b.tvy * k + (rng() - 0.5) * 70 * (1 - b.skill);
  const tryUse = (key) => {
    const c = ai[key];
    if (!c) return false;
    if (key === 'ult' ? p.ult < 100 : p.cd[key] > 0) return false;
    if (c.min && d < c.min) return false;
    if (c.max && d > c.max + t.r) return false;
    if (c.ground || c.exec) {
      p.input.cx = px;
      p.input.cy = py;
    }
    if (key === 'ult' && !t.isPlayer && t.type !== 'guardian' && t.type !== 'elite') return false;
    press(p, key);
    b.actCd = 0.25;
    return true;
  };
  if (rng() < 0.25 + b.skill * 0.35) {
    if (tryUse('ult') || tryUse('s2') || tryUse('s1')) return;
  }
  // 근접 무기: 대시로 거리 좁히기
  if (t.isPlayer && ai.pref < 200 && d > 160 && d < 320 && p.cd.space <= 0 && p.hp > p.maxHp * 0.45 && rng() < (0.03 + 0.05 * b.skill) * (dt * 30)) {
    out.dash = true;
    out.dashX = nx;
    out.dashY = ny;
  }
}

function dodge(game, p, b, out) {
  for (const a of game.areas) {
    if (a.fired || a.team === p.team) continue;
    if (!game.inArea(a, { x: p.x, y: p.y, r: p.r + 12 })) continue;
    const left = a.delay - a.t;
    if (left > 0.7 || left < 0) continue;
    let ex;
    let ey;
    if (a.kind === 'line') {
      ex = -Math.sin(a.ang);
      ey = Math.cos(a.ang);
      const side = (p.x - a.x) * ex + (p.y - a.y) * ey;
      if (side < 0) {
        ex = -ex;
        ey = -ey;
      }
    } else {
      const d = Math.sqrt(dist2(p.x, p.y, a.x, a.y)) || 1;
      ex = (p.x - a.x) / d;
      ey = (p.y - a.y) / d;
    }
    out.mx = ex;
    out.my = ey;
    if (left < 0.35 && p.cd.space <= 0 && b.dodgeT <= 0 && game.rng() < b.skill * 0.6 + 0.1) {
      out.dash = true;
      out.dashX = ex;
      out.dashY = ey;
      b.dodgeT = 0.6;
    }
    return;
  }
  if (b.dodgeT > 0 || p.cd.space > 0) return;
  for (const q of game.projs) {
    if (!q.alive || q.team === p.team) continue;
    const rx = p.x - q.x;
    const ry = p.y - q.y;
    if (rx * rx + ry * ry > 320 * 320) continue;
    const vv = q.vx * q.vx + q.vy * q.vy;
    if (vv < 1) continue;
    const tc = (rx * q.vx + ry * q.vy) / vv;
    if (tc < 0 || tc > 0.28) continue;
    const cx = q.x + q.vx * tc - p.x;
    const cy = q.y + q.vy * tc - p.y;
    if (cx * cx + cy * cy > (p.r + q.r + 10) ** 2) continue;
    b.dodgeT = 0.5;
    if (q.dmg > 100 || game.rng() < b.skill * 0.5) {
      const sp = Math.sqrt(vv);
      let px = -q.vy / sp;
      let py = q.vx / sp;
      if (px * cx + py * cy > 0) {
        px = -px;
        py = -py;
      }
      if (game.rng() < b.skill) {
        out.dash = true;
        out.dashX = px;
        out.dashY = py;
      }
      out.mx = px;
      out.my = py;
    }
    return;
  }
}

function avoidObstacles(game, p, mx, my) {
  let ax = mx;
  let ay = my;
  for (const o of game.obstacles) {
    const ox = o.x - p.x;
    const oy = o.y - p.y;
    const range = o.r + p.r + 70;
    if (ox * ox + oy * oy > range * range) continue;
    const ahead = ox * mx + oy * my;
    if (ahead <= 0) continue;
    const perp = ox * -my + oy * mx;
    if (Math.abs(perp) > o.r + p.r + 6) continue;
    const side = perp > 0 ? -1 : 1;
    ax += -my * side * 1.2;
    ay += mx * side * 1.2;
  }
  const l = Math.sqrt(ax * ax + ay * ay) || 1;
  return [ax / l, ay / l];
}
